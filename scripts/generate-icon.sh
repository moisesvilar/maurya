#!/bin/bash
# Genera build/icon.icns: icono placeholder "M" para Maurya (SPEC-005).
# Sin dependencias externas: JXA (osascript + Cocoa) para el PNG base 1024,
# sips para los tamaños del iconset e iconutil para compilar el .icns.
# El branding real llegará con el design system del producto (H1/H7).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ICNS="$REPO_ROOT/build/icon.icns"
WORK_DIR="$(mktemp -d -t maurya-icon)"
trap 'rm -rf "$WORK_DIR"' EXIT

BASE_PNG="$WORK_DIR/icon-1024.png"
ICONSET_DIR="$WORK_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# 1) PNG base 1024x1024 vía JXA: fondo redondeado oscuro + "M" blanca.
#    NSBitmapImageRep con dimensiones en píxeles explícitas para evitar
#    escalado Retina (lockFocus sobre NSImage duplicaría los píxeles).
osascript -l JavaScript - "$BASE_PNG" <<'JXA'
ObjC.import('Cocoa')

function run(argv) {
  const outPath = argv[0]
  const size = 1024

  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, size, size, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0
  )

  $.NSGraphicsContext.saveGraphicsState
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep)
  $.NSGraphicsContext.setCurrentContext(ctx)

  // Fondo transparente + rounded rect oscuro con el margen de la retícula macOS
  const inset = 100
  const rect = $.NSMakeRect(inset, inset, size - 2 * inset, size - 2 * inset)
  const bg = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect, 185, 185)
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.13, 0.15, 0.22, 1.0).setFill
  bg.fill

  // "M" blanca centrada
  const attrs = $.NSMutableDictionary.alloc.init
  attrs.setObjectForKey($.NSFont.boldSystemFontOfSize(540), $.NSFontAttributeName)
  attrs.setObjectForKey($.NSColor.whiteColor, $.NSForegroundColorAttributeName)
  const letter = $('M')
  const textSize = letter.sizeWithAttributes(attrs)
  letter.drawAtPointWithAttributes(
    $.NSMakePoint((size - textSize.width) / 2, (size - textSize.height) / 2),
    attrs
  )

  ctx.flushGraphics
  $.NSGraphicsContext.restoreGraphicsState

  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $())
  if (!png.writeToFileAtomically($(outPath), true)) {
    throw new Error('No se pudo escribir el PNG base: ' + outPath)
  }
}
JXA

# Fallback/normalización de DPI: iconutil exige 72 dpi exactos en cada png.
/usr/bin/sips -s dpiWidth 72 -s dpiHeight 72 "$BASE_PNG" --out "$BASE_PNG" > /dev/null

# 2) Iconset con todos los tamaños requeridos (base + @2x).
declare -a ENTRIES=(
  "icon_16x16.png 16"
  "icon_16x16@2x.png 32"
  "icon_32x32.png 32"
  "icon_32x32@2x.png 64"
  "icon_128x128.png 128"
  "icon_128x128@2x.png 256"
  "icon_256x256.png 256"
  "icon_256x256@2x.png 512"
  "icon_512x512.png 512"
)
for entry in "${ENTRIES[@]}"; do
  name="${entry% *}"
  px="${entry#* }"
  /usr/bin/sips -z "$px" "$px" "$BASE_PNG" --out "$ICONSET_DIR/$name" > /dev/null
done
cp "$BASE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"

# 3) Compilar el .icns y sobrescribir el placeholder de scaffold.
/usr/bin/iconutil -c icns "$ICONSET_DIR" -o "$OUT_ICNS"

echo "OK: $OUT_ICNS generado"
