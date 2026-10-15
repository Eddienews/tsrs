export interface MotionSettings {
  duration: number
  width: number
  height: number
  fps: number
}

export const MOTION_DEFAULTS: MotionSettings
export function motionSettings(code: string): MotionSettings
export function motionHead(code: string, base: string): string
export function insertHead(html: string, head: string): string
