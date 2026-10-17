import type { IncomingMessage, ServerResponse } from 'node:http'

export interface ProjectFile {
  name: string
  size: number
  modified: number
}

export function projectsRoot(): string
export function slug(title: string): string
export function projectFile(project: string, name: string): string | null
export function allowed(root: string, path: string): Promise<boolean>
export function openProject(
  root: string,
  job: { name?: string; path?: string; notes?: string },
): Promise<{ path: string; name: string }>
export function writeFiles(
  project: string,
  files: { name: string; content: string; append?: boolean; encoding?: 'base64' }[],
): Promise<string[]>
export function listFiles(project: string): Promise<ProjectFile[]>
export function readText(project: string, name: string): Promise<string>
export function editText(
  project: string,
  name: string,
  old: string,
  next: string,
  all?: boolean,
): Promise<{ replaced: number; size: number }>
export function copyProject(from: string, to: string): Promise<string[]>
export function encodePath(path: string): string
export function projectsHandler(root?: string): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
