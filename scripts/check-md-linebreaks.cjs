#!/usr/bin/env node
/**
 * check-md-linebreaks.cjs
 *
 * Detecta "saltos de línea espurios" en Markdown: párrafos e ítems de lista
 * partidos en varias líneas (hard-wrapping a ~80 columnas). La convención del
 * proyecto es **una línea por párrafo / por ítem de lista** — el ancho lo
 * gestiona el editor con soft-wrap, nunca saltos de línea manuales dentro de un
 * mismo bloque de prosa. Ver CLAUDE.md → "Markdown: sin saltos de línea espurios".
 *
 * Uso:
 *   node scripts/check-md-linebreaks.cjs [archivo.md ...]
 *
 * - Con rutas: revisa esos archivos.
 * - Sin rutas: revisa los archivos .md NUEVOS (sin trackear o añadidos) según
 *   git. Así el foco es "cuando se generan nuevos archivos markdown", sin tocar
 *   los .md heredados que ya venían con hard-wrapping.
 *
 * Sale con código 1 si encuentra saltos espurios (apto para CI / pre-commit).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Clasifica una línea en su tipo de bloque Markdown. */
function classify(line) {
  const t = line.trim();
  if (t === '') return 'blank';
  if (/^(```|~~~)/.test(t)) return 'fence';
  if (/^#{1,6}\s/.test(t)) return 'heading';
  if (/^(=+|-+|\*+|_+)$/.test(t)) return 'rule'; // hr o subrayado setext
  if (/^([-*+]|\d+[.)])\s+/.test(t)) return 'listitem';
  if (/^>/.test(t)) return 'blockquote';
  if (/^\|/.test(t)) return 'table';
  if (/^\[[^\]]+\]:\s/.test(t)) return 'linkdef'; // [id]: url (referencia)
  if (/^</.test(t)) return 'html';
  return 'prose';
}

/**
 * Devuelve los números de línea (1-indexed) que son continuaciones de un bloque
 * anterior sin línea en blanco intermedia: eso es un salto de línea espurio.
 */
function findSpuriousBreaks(content) {
  const lines = content.split('\n');
  const problems = [];
  let inFence = false;
  let fenceMarker = '';
  /** @type {{type: string, index: number} | null} */
  let prev = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    if (!inFence && /^(```|~~~)/.test(t)) {
      inFence = true;
      fenceMarker = t.slice(0, 3);
      prev = { type: 'fence', index: i };
      continue;
    }
    if (inFence) {
      if (t.startsWith(fenceMarker)) inFence = false;
      prev = { type: 'fence', index: i };
      continue;
    }

    const type = classify(raw);
    if (type === 'blank') {
      prev = null; // la línea en blanco cierra el bloque
      continue;
    }

    // Una línea de prosa pegada (sin blanco) a prosa / ítem / otra continuación
    // es una continuación soft-wrapped => salto espurio.
    if (
      type === 'prose' &&
      prev &&
      prev.index === i - 1 &&
      (prev.type === 'prose' || prev.type === 'listitem' || prev.type === 'continuation')
    ) {
      problems.push({ line: i + 1, text: raw });
      prev = { type: 'continuation', index: i };
      continue;
    }

    prev = { type, index: i };
  }

  return problems;
}

/** Lista de .md nuevos (untracked o añadidos) según git. */
function gitNewMarkdownFiles() {
  let out = '';
  try {
    out = execSync('git status --porcelain --untracked-files=all', {
      encoding: 'utf8',
    });
  } catch {
    return [];
  }
  const files = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const xy = line.slice(0, 2);
    let p = line.slice(3).trim();
    // Renombrados: "old -> new"
    if (p.includes(' -> ')) p = p.split(' -> ')[1];
    // Quita comillas que git añade a rutas con caracteres especiales.
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    if (!p.toLowerCase().endsWith('.md')) continue;
    const isNew = xy.includes('?') || xy.includes('A');
    if (isNew) files.push(p);
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : gitNewMarkdownFiles();

  if (files.length === 0) {
    console.log('check-md-linebreaks: no hay archivos .md nuevos que revisar.');
    return 0;
  }

  let total = 0;
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`check-md-linebreaks: no se pudo leer ${file}: ${err.message}`);
      total += 1;
      continue;
    }
    const problems = findSpuriousBreaks(content);
    if (problems.length === 0) continue;
    total += problems.length;
    const rel = path.relative(process.cwd(), path.resolve(file)) || file;
    for (const p of problems) {
      console.error(`${rel}:${p.line}: salto de línea espurio (párrafo/ítem partido)`);
      console.error(`    ${p.text.trim()}`);
    }
  }

  if (total > 0) {
    console.error(
      `\ncheck-md-linebreaks: ${total} salto(s) de línea espurio(s). ` +
        'Une cada párrafo e ítem de lista en una sola línea (una línea por bloque).'
    );
    return 1;
  }
  console.log('check-md-linebreaks: sin saltos de línea espurios.');
  return 0;
}

process.exit(main());
