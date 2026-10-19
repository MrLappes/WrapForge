import type { ArtworkAsset } from '../project/schema';
import { platform } from '../platform';
import { sanitizeSvg, svgDataUrl } from './svg';

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const sourceCache = new Map<string, Promise<string | null>>();

export function invalidateArtworkCache(artworkId?: string): void {
  if (!artworkId) {
    imageCache.clear();
    sourceCache.clear();
    return;
  }
  imageCache.delete(artworkId);
  sourceCache.delete(artworkId);
}

async function resolveSource(artwork: ArtworkAsset, root: string | null): Promise<string | null> {
  if (artwork.embeddedSource) {
    if (artwork.kind === 'svg' && !artwork.embeddedSource.startsWith('data:')) {
      return svgDataUrl(sanitizeSvg(artwork.embeddedSource));
    }
    if (artwork.kind === 'svg' && artwork.embeddedSource.startsWith('data:')) {
      const comma = artwork.embeddedSource.indexOf(',');
      if (comma >= 0 && artwork.embeddedSource.slice(0, comma).includes('base64')) {
        return artwork.embeddedSource;
      }
      const decoded = decodeURIComponent(artwork.embeddedSource.slice(comma + 1));
      return svgDataUrl(sanitizeSvg(decoded));
    }
    return artwork.embeddedSource;
  }
  if (!root || !artwork.sourcePath) return null;
  if (artwork.kind === 'svg') {
    const text = await platform.readTextAsset(root, artwork.sourcePath);
    return svgDataUrl(sanitizeSvg(text));
  }
  const base64 = await platform.readBinaryAsset(root, artwork.sourcePath);
  return `data:${artwork.mimeType};base64,${base64}`;
}

export function artworkSource(artwork: ArtworkAsset, root: string | null): Promise<string | null> {
  const cached = sourceCache.get(artwork.id);
  if (cached) return cached;
  const promise = resolveSource(artwork, root).catch(() => null);
  sourceCache.set(artwork.id, promise);
  return promise;
}

export function loadArtworkImage(
  artwork: ArtworkAsset,
  root: string | null,
): Promise<HTMLImageElement | null> {
  if (artwork.kind === 'text') return Promise.resolve(null);
  const cached = imageCache.get(artwork.id);
  if (cached) return cached;
  const promise = (async () => {
    const source = await artworkSource(artwork, root);
    if (!source) return null;
    return new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = source;
    });
  })();
  imageCache.set(artwork.id, promise);
  return promise;
}

export async function loadArtworkImages(
  artworks: ArtworkAsset[],
  root: string | null,
): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all(
    artworks.map(async (artwork) => {
      const image = await loadArtworkImage(artwork, root);
      return image ? ([artwork.id, image] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is readonly [string, HTMLImageElement] => !!entry));
}

export async function imageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = dataUrl;
  });
}

export function drawArtworkOnCanvas(
  ctx: CanvasRenderingContext2D,
  artwork: ArtworkAsset,
  image: HTMLImageElement | null,
  options: {
    centerX: number;
    centerY: number;
    width: number;
    opacity: number;
    rotationDeg: number;
  },
): void {
  const { centerX, centerY, width, opacity, rotationDeg } = options;
  if (width <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.translate(centerX, centerY);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  if (artwork.kind === 'text' && artwork.text) {
    drawText(ctx, artwork, width);
  } else if (image) {
    const aspect =
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1;
    const height = width / aspect;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, artwork: ArtworkAsset, targetWidth: number): void {
  const text = artwork.text;
  if (!text) return;
  const naturalSize = text.fontSizePx;
  ctx.font = `${text.fontWeight} ${naturalSize}px ${text.fontFamily}`;
  const lines = text.content.split('\n');
  const longest = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  const scale = targetWidth / longest;
  const lineHeight = naturalSize * 1.24;
  const totalHeight = lineHeight * lines.length;
  ctx.scale(scale, scale);
  ctx.fillStyle = text.fill;
  ctx.textAlign = text.align;
  ctx.textBaseline = 'middle';
  const anchorX = text.align === 'left' ? -longest / 2 : text.align === 'right' ? longest / 2 : 0;
  const startY = -totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, anchorX, startY + index * lineHeight);
  });
}
