/**
 * Setup global de Vitest (SPEC-001).
 * Extiende expect con los matchers de jest-dom y añade los stubs de APIs de
 * navegador que jsdom no implementa y que Radix / el código del spike tocan.
 * Los stubs se guardan tras `typeof window` para que este setup también sea
 * válido en los tests con `@vitest-environment node` (wavFileService).
 */
import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined') {
  // sonner y next-themes consultan matchMedia
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  }

  // Radix (Select/Tooltip posicionados con popper) requiere ResizeObserver
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub implements ResizeObserver {
      observe(): void {
        return undefined
      }
      unobserve(): void {
        return undefined
      }
      disconnect(): void {
        return undefined
      }
    }
    globalThis.ResizeObserver = ResizeObserverStub
  }

  // El worklet del recorder crea una Blob URL; jsdom no implementa createObjectURL
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:vitest-mock'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => undefined
  }

  // jsdom 26 no implementa navigator.mediaDevices y useAudioDevices se suscribe
  // a 'devicechange' directamente sobre navigator (no pasa por captureService).
  // `configurable: true` permite que un test individual lo redefina sin pisarse.
  if (typeof navigator.mediaDevices === 'undefined') {
    type MediaDevicesStub = Pick<
      MediaDevices,
      'addEventListener' | 'removeEventListener' | 'enumerateDevices'
    >
    const mediaDevicesStub: MediaDevicesStub = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      enumerateDevices: () => Promise.resolve([])
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevicesStub
    })
  }

  // ProseMirror (editor WYSIWYG de SPEC-025) mide la selección con las APIs
  // de geometría de Range/Element al reaccionar a selectionchange
  // (coordsAtPos → scrollToSelection). jsdom no implementa getClientRects en
  // Range → "TypeError: target.getClientRects is not a function" como
  // unhandled error (run SPEC-025-20260710T205833Z: 428/428 PASS pero exit 1).
  // Rects a cero bastan: en jsdom no se asierta geometría, solo que PM no
  // lance. Lista vacía en getClientRects → PM cae a getBoundingClientRect.
  const zeroDomRect = (): DOMRect =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({})
    }) as DOMRect
  const emptyDomRectList = (): DOMRectList => {
    const list: DOMRect[] & { item?: (index: number) => DOMRect | null } = []
    list.item = () => null
    return list as unknown as DOMRectList
  }
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = emptyDomRectList
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = zeroDomRect
  }
  if (typeof Element.prototype.getClientRects !== 'function') {
    Element.prototype.getClientRects = emptyDomRectList
  }

  // Radix usa pointer capture y scrollIntoView, ausentes en jsdom
  if (typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = () => false
  }
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = () => undefined
  }
  if (typeof Element.prototype.releasePointerCapture !== 'function') {
    Element.prototype.releasePointerCapture = () => undefined
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => undefined
  }
}
