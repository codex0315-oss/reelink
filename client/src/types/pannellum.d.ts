/**
 * Pannellum ships as a plain browser script that assigns window.pannellum — there is
 * no bundled type definition, so this declares the slice of its API we actually use.
 * Full option reference: https://pannellum.org/documentation/reference/
 */
declare module 'pannellum/build/pannellum.js'
declare module 'pannellum/build/pannellum.css'

export type PannellumViewer = {
  destroy(): void
  startAutoRotate(speed?: number): void
  stopAutoRotate(): void
  getYaw(): number
  setYaw(yaw: number): void
}

export type PannellumConfig = {
  type: 'equirectangular'
  panorama: string
  autoLoad?: boolean
  /** Degrees per second; negative turns the other way. */
  autoRotate?: number
  /** ms of no input before rotation picks up again after a drag. */
  autoRotateInactivityDelay?: number
  /** Horizontal / vertical angle the image actually covers, for partial panoramas. */
  haov?: number
  vaov?: number
  vOffset?: number
  hfov?: number
  minHfov?: number
  maxHfov?: number
  showZoomCtrl?: boolean
  showFullscreenCtrl?: boolean
  compass?: boolean
  keyboardZoom?: boolean
  friction?: number
  crossOrigin?: string
}

declare global {
  interface Window {
    pannellum: {
      viewer(container: HTMLElement, config: PannellumConfig): PannellumViewer
    }
  }
}
