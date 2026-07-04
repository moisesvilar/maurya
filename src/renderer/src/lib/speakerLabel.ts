import type { TranscriptLine } from '@/types/audio'

/**
 * Etiqueta de hablante de una línea de transcripción (SPEC-017): el canal mic
 * es siempre el usuario ("Tú"); el canal system son los interlocutores,
 * numerados 1-based con el índice de diarización (null → "Interlocutor 1",
 * degradación del Riesgo #9).
 *
 * Duplicado deliberadamente en main (noteService.speakerLabel) para no
 * importar código runtime del renderer desde main: si cambias esto, cambia
 * también `src/main/noteService.ts`.
 */
export function speakerLabel(line: Pick<TranscriptLine, 'channel' | 'speaker'>): string {
  if (line.channel === 'mic') {
    return 'Tú'
  }
  return `Interlocutor ${(line.speaker ?? 0) + 1}`
}
