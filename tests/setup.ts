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
