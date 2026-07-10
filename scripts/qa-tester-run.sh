#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# qa-tester-run.sh (fable)
#
# Ejecuta los tests unitarios (Vitest) y end-to-end (Playwright)
# generados por somo-qa-dev-fable. Los e2e corren contra el dev server
# local: Playwright lo levanta via su bloque webServer (npm run dev),
# con el proyecto Supabase de DEV como backend (.env.local).
#
# Cambios vs. la version Lovable (auditoria 2026-07-07, ADR-001):
#   - Sin LOVABLE_PUBLIC_URL ni health check remoto (A18).
#   - Report: <SPEC_ID>-run-<YYYYMMDDTHHMMSSZ>.md — "run" en vez de
#     "iter" (A15) y "SUITE" en vez de "all" como default (A25).
#   - Sync check git: informativo en el report, nunca interactivo.
#
# Uso:
#   ./qa-tester-run.sh                       # suite completa, etiqueta SUITE
#   ./qa-tester-run.sh SPEC-001              # report etiquetado por spec
#   ./qa-tester-run.sh SPEC-001-iter-2       # iteraciones tambien validas
#   ./qa-tester-run.sh SPEC-001 --unit-only  # solo Vitest
#   ./qa-tester-run.sh SPEC-001 --e2e-only   # solo Playwright
#
# Variables de entorno opcionales:
#   QA_TESTER_TIMEOUT     Timeout por test Playwright en ms (default 30000)
#   QA_TESTER_RETRIES     Retries de Playwright (default 2)
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Parse args ────────────────────────────────────────────────────

SPEC_ID=""
RUN_UNIT=true
RUN_E2E=true

for arg in "$@"; do
  case "$arg" in
    --unit-only) RUN_E2E=false ;;
    --e2e-only)  RUN_UNIT=false ;;
    --help|-h)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) SPEC_ID="$arg" ;;
  esac
done

SPEC_ID="${SPEC_ID:-SUITE}"

# ── Load .env files if present ────────────────────────────────────

if [ -f .env ]; then set -a; source .env; set +a; fi
if [ -f .env.local ]; then set -a; source .env.local; set +a; fi

# ── Configuration ─────────────────────────────────────────────────

TIMEOUT="${QA_TESTER_TIMEOUT:-30000}"
RETRIES="${QA_TESTER_RETRIES:-2}"

REPORT_DIR="tests/reports"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_FILE="${REPORT_DIR}/${SPEC_ID}-run-${TS}.md"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

mkdir -p "${REPORT_DIR}"

echo -e "${CYAN}=== QA Tester — ${SPEC_ID} ===${NC}"
echo ""

# ── Step 1: Estado del repo (informativo, nunca interactivo) ──────

GIT_BRANCH="n/a"; GIT_COMMIT="n/a"; GIT_DIRTY="n/a"
if [ -d .git ] || git rev-parse --git-dir >/dev/null 2>&1; then
  echo "1. Estado del repo..."
  GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  if [ -z "$(git status --short 2>/dev/null)" ]; then GIT_DIRTY="clean"; else GIT_DIRTY="DIRTY"; fi
  echo "   Branch: ${GIT_BRANCH} @ ${GIT_COMMIT} (${GIT_DIRTY})"
  if [ "${GIT_DIRTY}" = "DIRTY" ]; then
    echo -e "   ${YELLOW}[WARN]${NC} Working tree con cambios sin commitear: se testea codigo no registrado por el pipeline."
  fi
  echo ""
fi

# ── Step 2: Prerrequisitos de entorno ─────────────────────────────

if [ "$RUN_E2E" = true ]; then
  echo "2. Prerrequisitos e2e..."
  if [ ! -f "playwright.config.ts" ] && [ ! -f "playwright.config.js" ]; then
    echo -e "   ${YELLOW}[SKIP]${NC} Sin configuracion de Playwright; se omiten los e2e."
    RUN_E2E=false
  elif [ ! -f "src/lib/supabase.ts" ]; then
    # Proyecto sin backend (hallazgo E2E 2026-07-07): las credenciales Supabase no aplican.
    echo -e "   ${GREEN}[OK]${NC} Proyecto sin Supabase (no existe src/lib/supabase.ts); e2e sin credenciales."
  elif [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
    echo -e "   ${RED}[FAIL]${NC} Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env.local con el proyecto DEV)."
    cat > "${REPORT_FILE}" << EOF
# QA Tester Report: ${SPEC_ID}

## Resultado: FAIL (Infrastructure)

Faltan las credenciales de Supabase DEV (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) en .env.local.
El dev server no puede hablar con el backend, asi que los e2e no son ejecutables.

### Acciones recomendadas
- Copia .env.example a .env.local y rellena con las credenciales del proyecto Supabase de DEV.
- Si solo necesitas unitarios: reejecutar con --unit-only.
EOF
    echo "   Report: ${REPORT_FILE}"
    exit 1
  else
    echo -e "   ${GREEN}[OK]${NC} Playwright configurado; credenciales DEV presentes. El dev server lo levanta webServer."
  fi
  echo ""
fi

# ── Step 3: Vitest (unit) ─────────────────────────────────────────

VITEST_EXIT=0
VITEST_OUTPUT=""

if [ "$RUN_UNIT" = true ]; then
  echo "3. Vitest (tests unitarios)..."
  if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ] || \
     [ -f "vite.config.ts" ] || [ -f "vite.config.js" ] || \
     grep -q '"vitest"' package.json 2>/dev/null; then
    VITEST_OUTPUT=$(npx vitest run --reporter=verbose 2>&1) || VITEST_EXIT=$?
    if [ ${VITEST_EXIT} -eq 0 ]; then
      echo -e "   ${GREEN}[PASS]${NC} Tests unitarios OK"
    else
      echo -e "   ${RED}[FAIL]${NC} Tests unitarios fallaron (exit ${VITEST_EXIT})"
    fi
  else
    echo -e "   ${YELLOW}[SKIP]${NC} No se detecto configuracion de Vitest"
    VITEST_OUTPUT="No Vitest configuration found in project."
  fi
  echo ""
fi

# ── Step 4: Playwright (e2e, dev server via webServer) ───────────

PLAYWRIGHT_EXIT=0
PLAYWRIGHT_OUTPUT=""

if [ "$RUN_E2E" = true ]; then
  echo "4. Playwright (tests e2e contra dev server local)..."
  PLAYWRIGHT_OUTPUT=$(npx playwright test \
    --timeout="${TIMEOUT}" \
    --retries="${RETRIES}" \
    --reporter=list \
    2>&1) || PLAYWRIGHT_EXIT=$?

  if [ ${PLAYWRIGHT_EXIT} -eq 0 ]; then
    echo -e "   ${GREEN}[PASS]${NC} Tests e2e OK"
  else
    echo -e "   ${RED}[FAIL]${NC} Tests e2e fallaron (exit ${PLAYWRIGHT_EXIT})"
    # Distincion basica de fallo de infraestructura: webServer no levanto
    if echo "${PLAYWRIGHT_OUTPUT}" | grep -qi "Timed out waiting.*webServer\|Process from config.webServer"; then
      PLAYWRIGHT_INFRA=1
    fi
  fi
  echo ""
fi

# ── Step 5: Report ────────────────────────────────────────────────

echo "5. Generando report..."

OVERALL="PASS"
if [ "$RUN_UNIT" = true ] && [ ${VITEST_EXIT} -ne 0 ]; then OVERALL="FAIL"; fi
if [ "$RUN_E2E" = true ] && [ ${PLAYWRIGHT_EXIT} -ne 0 ]; then OVERALL="FAIL"; fi
if [ "${PLAYWRIGHT_INFRA:-0}" = "1" ]; then OVERALL="FAIL (Infrastructure)"; fi

cat > "${REPORT_FILE}" << EOF
# QA Tester Report: ${SPEC_ID}

## Resultado: ${OVERALL}

- **Objetivo e2e**: dev server local (webServer) + Supabase DEV
- **Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **Branch**: ${GIT_BRANCH}
- **Commit**: ${GIT_COMMIT}
- **Working tree**: ${GIT_DIRTY}

---

## Tests unitarios (Vitest)

EOF

if [ "$RUN_UNIT" = true ]; then
  cat >> "${REPORT_FILE}" << EOF
**Exit code**: ${VITEST_EXIT}

\`\`\`
${VITEST_OUTPUT}
\`\`\`

EOF
else
  printf '_(omitido con --e2e-only)_\n\n' >> "${REPORT_FILE}"
fi

cat >> "${REPORT_FILE}" << EOF
---

## Tests e2e (Playwright)

EOF

if [ "$RUN_E2E" = true ]; then
  cat >> "${REPORT_FILE}" << EOF
**Exit code**: ${PLAYWRIGHT_EXIT}
**Timeout**: ${TIMEOUT}ms · **Retries**: ${RETRIES}

\`\`\`
${PLAYWRIGHT_OUTPUT}
\`\`\`

EOF
else
  printf '_(omitido con --unit-only o sin configuracion)_\n\n' >> "${REPORT_FILE}"
fi

cat >> "${REPORT_FILE}" << EOF
---

## Entorno

- Node: $(node --version 2>/dev/null || echo "N/A")
- Playwright: $(npx playwright --version 2>/dev/null || echo "N/A")
- Vitest: $(npx vitest --version 2>/dev/null || echo "N/A")
EOF

echo -e "   ${GREEN}[OK]${NC} Report: ${REPORT_FILE}"
echo ""

# ── Resumen final ─────────────────────────────────────────────────

echo "═══════════════════════════════════════"
if [ "${OVERALL}" = "PASS" ]; then
  echo -e "  ${GREEN}RESULTADO: PASS${NC}"
else
  echo -e "  ${RED}RESULTADO: ${OVERALL}${NC}"
  echo "  Revisa el report: ${REPORT_FILE}"
fi
echo "═══════════════════════════════════════"

exit $([ "${OVERALL}" = "PASS" ] && echo 0 || echo 1)
