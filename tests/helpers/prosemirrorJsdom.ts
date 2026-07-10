/**
 * Polyfills mínimos para montar TipTap/ProseMirror bajo jsdom (SPEC-025).
 * jsdom no implementa la geometría de Range (`getClientRects` /
 * `getBoundingClientRect`) ni `document.elementFromPoint`, que EditorView usa
 * al posicionar el cursor. Sin ellos, el editor lanza al montar. Idempotente:
 * llamar antes de renderizar cualquier componente que use `useEditor`.
 */

function zeroRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    toJSON: () => ({})
  } as DOMRect
}

function emptyRectList(): DOMRectList {
  const list = {
    length: 0,
    item: (): DOMRect | null => null,
    [Symbol.iterator]: [][Symbol.iterator]
  }
  return list as unknown as DOMRectList
}

export function installProseMirrorJsdomPolyfills(): void {
  if (typeof window === 'undefined') {
    return
  }
  Range.prototype.getBoundingClientRect = zeroRect
  Range.prototype.getClientRects = emptyRectList
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = (): Element | null => null
  }
}
