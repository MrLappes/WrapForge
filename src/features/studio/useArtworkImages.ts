import { useEffect, useState } from 'react';
import type { ArtworkAsset } from '../../lib/project/schema';
import { loadArtworkImages } from '../../lib/graphics/artwork';

export function useArtworkImages(
  artworks: ArtworkAsset[],
  root: string | null,
): { images: Map<string, HTMLImageElement>; loading: boolean } {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [loading, setLoading] = useState(false);
  const key = artworks
    .map((artwork) => `${artwork.id}:${artwork.embeddedSource?.length ?? 0}:${artwork.sourcePath ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    if (artworks.length === 0) {
      setImages(new Map());
      return;
    }
    setLoading(true);
    loadArtworkImages(artworks, root)
      .then((loaded) => {
        if (!cancelled) {
          setImages(loaded);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImages(new Map());
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // The key captures the fields that affect loading without re-running on
    // every unrelated project update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, root]);

  return { images, loading };
}
