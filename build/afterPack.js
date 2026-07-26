/**
 * Hook afterPack de electron-builder (SPEC-024-iter-1, CommonJS: electron-builder
 * lo carga con require). Con `identity: null` electron-builder OMITE el paso de
 * firma por completo y el .app queda solo con la firma de linker del binario de
 * Electron (sin recursos sellados, sin Info.plist vinculado, sin entitlements):
 * `codesign --verify` falla y los entitlements de SPEC-024 no se embeben.
 *
 * Este hook sella el bundle con firma ad-hoc real (`--sign -`) aplicando
 * build/entitlements.mac.plist ANTES de que se generen los artefactos DMG/ZIP,
 * y verifica el sello ahí mismo: si cualquiera de los dos pasos falla, LANZA y
 * el build queda en rojo — nunca se empaqueta un bundle sin sellar.
 *
 * `--deep` aplica los mismos entitlements a los helpers anidados: compromiso
 * estándar de la firma ad-hoc local (la firma helper a helper, de dentro hacia
 * fuera, queda para el camino Developer ID documentado en electron-builder.yml).
 * Gatekeeper sigue tratando la app como no notarizada (README intacto).
 * `codesign` viene con macOS: sin dependencias nuevas ni Xcode completo.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- hook CommonJS: electron-builder lo carga con require() fuera del bundle de la app */
const { execFileSync } = require('child_process')
const path = require('path')

/**
 * Identidad de firma estable (fix permisos TCC): con firma ad-hoc (`-`) el
 * designated requirement es el cdhash del binario exacto, así que CADA rebuild
 * invalida los permisos TCC ya concedidos (Ajustes muestra el toggle activado
 * pero macOS deniega el micrófono). Un certificado self-signed local con
 * nombre estable ancla el requirement a identifier+certificado y los permisos
 * sobreviven a los rebuilds. Se crea una vez con `scripts/setup-signing.sh`.
 * Sin el certificado en el Keychain se cae al ad-hoc anterior, con aviso.
 */
const STABLE_IDENTITY = process.env.MAURYA_SIGN_IDENTITY || 'Maurya Dev'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- archivo JS de build, fuera del bundle tipado
function resolveSigningIdentity() {
  try {
    const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    if (identities.includes(`"${STABLE_IDENTITY}"`)) {
      return STABLE_IDENTITY
    }
  } catch {
    // security no disponible o sin identidades: fallback ad-hoc
  }
  console.warn(
    `[afterPack] AVISO: identidad "${STABLE_IDENTITY}" no encontrada en el Keychain; ` +
      'firma ad-hoc (los permisos TCC se invalidarán en cada rebuild). ' +
      'Créala una vez con: ./scripts/setup-signing.sh'
  )
  return '-'
}

module.exports = function afterPack(context) {
  // Solo macOS: el hook es un no-op en cualquier otra plataforma
  if (context.electronPlatformName !== 'darwin') {
    return
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const entitlementsPath = path.join(__dirname, 'entitlements.mac.plist')
  const identity = resolveSigningIdentity()
  // execFileSync lanza si codesign devuelve distinto de 0 → build en rojo
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', identity, '--entitlements', entitlementsPath, appPath],
    { stdio: 'inherit' }
  )
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  const kind = identity === '-' ? 'ad-hoc' : `estable ("${identity}")`
  console.log(`[afterPack] Firma ${kind} aplicada con entitlements y verificada: ${appPath}`)
}
