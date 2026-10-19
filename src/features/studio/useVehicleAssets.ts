import { useEffect, useState } from 'react';
import { platform } from '../../lib/platform';
import { pendingAssetUrl } from '../../lib/vehicle/pending';

/** Resolves a project-relative model path, preferring unsaved in-memory bytes. */
export function useVehicleModelUrl(
  modelPath: string | null,
  root: string | null,
): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modelPath) {
      setUrl(null);
      return;
    }
    const pending = pendingAssetUrl(modelPath);
    if (pending) {
      setUrl(pending);
      setError(null);
      return;
    }
    if (modelPath.startsWith('bundled:')) {
      setUrl(platform.getSampleModelUrl());
      setError(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setError(null);
    platform
      .resolveModelUrl(root, modelPath)
      .then((resolved) => {
        if (cancelled) {
          if (resolved.startsWith('blob:')) URL.revokeObjectURL(resolved);
          return;
        }
        created = resolved;
        setUrl(resolved);
      })
      .catch((resolveError: unknown) => {
        if (cancelled) return;
        setError(
          resolveError instanceof Error
            ? resolveError.message
            : 'The vehicle model could not be loaded from the project folder.',
        );
      });
    return () => {
      cancelled = true;
      if (created?.startsWith('blob:')) URL.revokeObjectURL(created);
    };
  }, [modelPath, root]);

  return { url, error };
}

/** Decodes the model's original base-colour texture for the livery finish. */
export function useBaseTexture(
  path: string | null,
  root: string | null,
): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!path) {
      setImage(null);
      return;
    }
    let cancelled = false;
    /*
     * The URL is not owned here: pending assets are blob URLs kept alive by the
     * pending-asset registry, and saved assets decode to data URLs. Revoking in
     * cleanup used to break the texture as soon as the studio remounted.
     */
    const resolve = async (): Promise<string | null> => {
      const pending = pendingAssetUrl(path);
      if (pending) return pending;
      if (!root) return null;
      const base64 = await platform.readBinaryAsset(root, path);
      return `data:image/png;base64,${base64}`;
    };
    resolve()
      .then((source) => {
        if (cancelled || !source) return;
        const element = new Image();
        element.onload = () => {
          if (!cancelled) setImage(element);
        };
        element.onerror = () => {
          if (!cancelled) setImage(null);
        };
        element.src = source;
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path, root]);

  return image;
}
