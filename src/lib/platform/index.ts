import { createBrowserPlatform } from './browser';
import { createDesktopPlatform } from './desktop';
import { joinPath, type Platform } from './types';

export function detectDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const platform: Platform = detectDesktop()
  ? createDesktopPlatform()
  : createBrowserPlatform();

export function slugifyProjectName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'untitled-wrap';
}

export function projectRootFor(parent: string, name: string): string {
  return joinPath(parent, `${slugifyProjectName(name)}.wrapforge`);
}

export { joinPath };
export type { Platform } from './types';
