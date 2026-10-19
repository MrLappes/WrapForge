import type { ArtworkFilePayload } from '../platform/types';

export interface PendingAsset {
  relativePath: string;
  base64: string;
  mimeType: string;
  url: string;
  byteLength: number;
  /** False once the bytes are on disk; the blob URL stays valid for the view. */
  unsaved: boolean;
}

/**
 * Assets that only exist in memory because the project has not been saved yet
 * (an imported vehicle model and its base texture). They are written to the
 * project folder by the next save and are intentionally kept out of the
 * project document so undo history stays small.
 */
const registry = new Map<string, PendingAsset>();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function registerPendingAsset(
  relativePath: string,
  bytes: Uint8Array,
  mimeType: string,
): PendingAsset {
  const previous = registry.get(relativePath);
  if (previous) URL.revokeObjectURL(previous.url);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType });
  const asset: PendingAsset = {
    relativePath,
    base64: bytesToBase64(bytes),
    mimeType,
    url: URL.createObjectURL(blob),
    byteLength: bytes.length,
    unsaved: true,
  };
  registry.set(relativePath, asset);
  return asset;
}

export function pendingAssetUrl(relativePath: string): string | null {
  return registry.get(relativePath)?.url ?? null;
}

export function pendingAssetFiles(): ArtworkFilePayload[] {
  return [...registry.values()]
    .filter((asset) => asset.unsaved)
    .map((asset) => ({ relativePath: asset.relativePath, base64: asset.base64 }));
}

/** The assets were written by a save; keep the URLs but stop re-uploading. */
export function markPendingAssetsSaved(): void {
  for (const asset of registry.values()) asset.unsaved = false;
}

export function hasPendingAsset(relativePath: string): boolean {
  return registry.has(relativePath);
}

/** Registers bytes that are already base64 (imported files arrive that way). */
export function registerPendingAssetBase64(
  relativePath: string,
  base64: string,
  mimeType: string,
): PendingAsset {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  return registerPendingAsset(relativePath, base64ToBytes(clean), mimeType);
}

/** Registers a data URL asset, e.g. a texture rendered from the model. */
export function registerPendingDataUrl(
  relativePath: string,
  dataUrl: string,
  mimeType: string,
): PendingAsset {
  return registerPendingAssetBase64(relativePath, dataUrl, mimeType);
}

export function clearPendingAssets(): void {
  for (const asset of registry.values()) URL.revokeObjectURL(asset.url);
  registry.clear();
}
