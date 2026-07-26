#!/usr/bin/env bash
#
# Crea (una sola vez) el certificado self-signed de firma de código "Maurya Dev"
# en el Keychain de login y lo marca como confiable para firmar código.
#
# Por qué: con firma ad-hoc, el designated requirement del bundle es el cdhash
# del binario exacto, así que cada `npm run build:mac` invalida los permisos TCC
# ya concedidos (micrófono/pantalla): Ajustes muestra el toggle activado pero
# macOS deniega. Con una identidad estable, el requirement se ancla a
# identifier + certificado y los permisos sobreviven a los rebuilds.
# build/afterPack.js usa esta identidad automáticamente si existe.
#
# Uso:   ./scripts/setup-signing.sh [nombre-identidad]   (default: "Maurya Dev")
# Notas: pide la contraseña de administrador (sudo, para marcar el certificado
#        como confiable) y puede pedir la contraseña del Keychain de login.
#        Idempotente: si la identidad ya existe, no hace nada.

set -euo pipefail

IDENTITY="${1:-${MAURYA_SIGN_IDENTITY:-Maurya Dev}}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning "$KEYCHAIN" | grep -q "\"$IDENTITY\""; then
  echo "✓ La identidad \"$IDENTITY\" ya existe y es válida para firmar código. Nada que hacer."
  exit 0
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "→ Generando certificado self-signed \"$IDENTITY\" (RSA 2048, 10 años)…"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TMP_DIR/key.pem" -out "$TMP_DIR/cert.pem" \
  -days 3650 -subj "/CN=$IDENTITY" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning"

echo "→ Importando clave y certificado en el Keychain de login…"
security import "$TMP_DIR/key.pem" -k "$KEYCHAIN" -T /usr/bin/codesign
security import "$TMP_DIR/cert.pem" -k "$KEYCHAIN" -T /usr/bin/codesign

echo "→ Marcando el certificado como confiable para firma de código (pide sudo)…"
sudo security add-trusted-cert -d -r trustRoot -p codeSign "$TMP_DIR/cert.pem"

# Evita el diálogo de acceso a la clave cuando codesign la use desde el build.
# Puede pedir la contraseña del Keychain de login; si falla no es fatal (el
# primer codesign mostrará un diálogo donde elegir "Permitir siempre").
echo "→ Autorizando a las herramientas de Apple a usar la clave (contraseña del Keychain)…"
security set-key-partition-list -S 'apple-tool:,apple:' -s -l "$IDENTITY" "$KEYCHAIN" ||
  echo "  (aviso: no se pudo fijar la partition list; el primer codesign pedirá permiso una vez)"

echo
if security find-identity -v -p codesigning "$KEYCHAIN" | grep -q "\"$IDENTITY\""; then
  echo "✓ Identidad \"$IDENTITY\" lista. Los próximos 'npm run build:mac' firmarán con ella."
  echo "  Tras instalar el PRIMER build firmado así, concede los permisos una última vez"
  echo "  (si Ajustes muestra una entrada vieja de Maurya, usa antes el botón"
  echo "  «Workaround permisos micrófono» de la app o: tccutil reset Microphone com.maurya.app)."
else
  echo "✗ La identidad no aparece como válida tras el setup. Revisa los pasos anteriores." >&2
  exit 1
fi
