export interface MotionSettings {
  duration: number
  width: number
  height: number
  fps: number
}

export const MOTION_DEFAULTS: MotionSettings
export function motionSettings(code: string): MotionSettings
export function motionHead(
  code: string,
  base: string,
  extra?: { duration?: number; data?: Record<string, unknown>; captions?: { cues: unknown[]; style?: Record<string, unknown> } | null },
): string
export function insertHead(html: string, head: string): string
