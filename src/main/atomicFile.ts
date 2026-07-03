import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'fs'

/**
 * Escritura atómica: tmp + fsync + rename (APFS) para no dejar nunca un
 * archivo a medias. Extraído de db/store.ts (SPEC-007) para reutilizarlo en la
 * persistencia de secretos cifrados sin acoplarla al almacén de dominio.
 */
export function writeFileAtomicSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`
  const fd = openSync(tmpPath, 'w')
  try {
    writeSync(fd, content)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmpPath, filePath)
}
