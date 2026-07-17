/**
 * Stub de 'electron' para el bundle del CLI (alias de esbuild): el CLI corre en
 * Node puro y SIEMPRE inyecta baseDir en initStore, así que app.getPath no debe
 * ejecutarse nunca. Si algún camino lo usara, este guard lo delata en runtime.
 */
export const app = {
  getPath: (): string => {
    throw new Error('maurya-cli corre sin Electron: initStore debe recibir baseDir inyectado')
  }
}

export const ipcMain = {
  handle: (): void => {
    throw new Error('maurya-cli corre sin Electron: ipcMain no está disponible')
  }
}
