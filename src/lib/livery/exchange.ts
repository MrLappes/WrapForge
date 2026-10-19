import { readPsd, writePsdUint8Array } from 'ag-psd';
import type { Livery, LiveryBlend, LiveryLayer, LiveryMapping } from '../project/schema';
import { drawLayer, type LiveryImageSource } from './render';

/** Photoshop blend mode names for the modes WrapForge exposes. */
const BLEND_TO_PSD: Record<LiveryBlend, string> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  lighten: 'lighten',
  darken: 'darken',
  'soft-light': 'soft light',
};

const PSD_TO_BLEND: Record<string, LiveryBlend> = Object.fromEntries(
  Object.entries(BLEND_TO_PSD).map(([ours, theirs]) => [theirs, ours as LiveryBlend]),
) as Record<string, LiveryBlend>;

const MARKER = ' [wf:';

export interface ExportedLayer {
  id: string;
  name: string;
  mapping: LiveryMapping;
  blend: LiveryBlend;
  opacity: number;
  visible: boolean;
  /** PNG data URL of the layer in its own space (atlas or projection). */
  dataUrl: string;
  fileName: string;
}

export interface ImportedLayer {
  id: string | null;
  name: string;
  mapping: LiveryMapping;
  blend: LiveryBlend;
  opacity: number;
  visible: boolean;
  dataUrl: string;
}

function canvasOf(size: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

/**
 * Rasterises one livery layer in its own space with a transparent background,
 * which is what Photoshop should see: projected layers keep their projection,
 * atlas layers stay in texture space.
 */
export function renderLayerCanvas(
  layer: LiveryLayer,
  images: Map<string, HTMLImageElement>,
  size: number,
): HTMLCanvasElement {
  const element = canvasOf(size);
  const ctx = element.getContext('2d');
  if (!ctx) return element;
  drawLayer(ctx, { ...layer, visible: true, opacity: 1, blend: 'normal' }, size, images as Map<string, LiveryImageSource>);
  return element;
}

function layerMarker(layer: LiveryLayer): string {
  const meta = [
    layer.id,
    layer.kind,
    layer.mapping,
    layer.blend,
    layer.opacity.toFixed(3),
    layer.visible ? '1' : '0',
  ].join('|');
  return `${MARKER}${meta}]`;
}

export function psdLayerName(layer: LiveryLayer): string {
  return `${layer.name}${layerMarker(layer)}`;
}

export interface ParsedMarker {
  id: string;
  kind: string;
  mapping: LiveryMapping;
  blend: LiveryBlend;
  opacity: number;
  visible: boolean;
}

export function parseLayerMarker(name: string): { label: string; meta: ParsedMarker } | null {
  const start = name.lastIndexOf(MARKER);
  if (start < 0 || !name.endsWith(']')) return null;
  const body = name.slice(start + MARKER.length, -1);
  const parts = body.split('|');
  if (parts.length < 6) return null;
  const [id, kind, mapping, blend, opacity, visible] = parts;
  return {
    label: name.slice(0, start) || id,
    meta: {
      id,
      kind,
      mapping: mapping as LiveryMapping,
      blend: PSD_TO_BLEND[blend] ?? 'normal',
      opacity: Number(opacity) || 1,
      visible: visible === '1',
    },
  };
}

/** Builds a layered PSD: one layer per livery layer, in stack order. */
export function exportLiveryPsd(
  livery: Livery,
  images: Map<string, HTMLImageElement>,
): Uint8Array {
  const size = livery.resolution;
  const children = livery.layers.map((layer) => {
    const canvas = renderLayerCanvas(layer, images, size);
    return {
      name: psdLayerName(layer),
      canvas,
      left: 0,
      top: 0,
      blendMode: BLEND_TO_PSD[layer.blend] as never,
      opacity: layer.opacity,
      hidden: !layer.visible,
    };
  });
  const psd = {
    width: size,
    height: size,
    children,
  };
  return writePsdUint8Array(psd as never);
}

function imageDataToDataUrl(pixels: { width: number; height: number; data: ArrayLike<number> }): string {
  const canvas = canvasOf(pixels.width);
  canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(pixels.width, pixels.height);
    image.data.set(Array.from(pixels.data));
    ctx.putImageData(image, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Reads a PSD back into layer descriptions. Layers that carry a WrapForge
 * marker update their original layer; anything else is imported as a new
 * raster layer in atlas space.
 */
export function importLiveryPsd(buffer: ArrayBuffer): ImportedLayer[] {
  const psd = readPsd(buffer, { useImageData: true, skipThumbnail: true });
  const layers: ImportedLayer[] = [];
  for (const child of psd.children ?? []) {
    if (child.adjustment || child.placedLayer) continue;
    const imageData = child.imageData;
    if (!imageData) continue;
    const dataUrl = imageDataToDataUrl(imageData);
    const parsed = child.name ? parseLayerMarker(child.name) : null;
    if (parsed) {
      layers.push({
        id: parsed.meta.id,
        name: parsed.label,
        mapping: parsed.meta.mapping,
        blend: parsed.meta.blend,
        opacity: child.opacity ?? parsed.meta.opacity,
        visible: !(child.hidden ?? !parsed.meta.visible),
        dataUrl,
      });
    } else {
      layers.push({
        id: null,
        name: child.name || 'Imported layer',
        mapping: 'atlas',
        blend: PSD_TO_BLEND[String(child.blendMode)] ?? 'normal',
        opacity: child.opacity ?? 1,
        visible: !child.hidden,
        dataUrl,
      });
    }
  }
  return layers;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'layer'
  );
}

/**
 * File-safe metadata: `|`, `[` and `]` are legal in a PSD layer name but not
 * in a Windows file name, so folder export uses a separate encoding.
 */
export function layerFileName(layer: LiveryLayer, index: number): string {
  const meta = [
    idPart(layer.id),
    layer.kind,
    layer.mapping,
    layer.blend,
    layer.opacity.toFixed(3),
    layer.visible ? '1' : '0',
  ].join('__');
  return `${String(index + 1).padStart(2, '0')}-${slugify(layer.name)}__wf__${meta}.png`;
}

function idPart(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** The PNG-folder fallback: one file per layer plus a small manifest. */
export function exportLayerFolder(
  livery: Livery,
  images: Map<string, HTMLImageElement>,
): { files: Array<{ name: string; base64: string }>; manifest: string } {
  const size = livery.resolution;
  const files = livery.layers.map((layer, index) => {
    const canvas = renderLayerCanvas(layer, images, size);
    const dataUrl = canvas.toDataURL('image/png');
    return {
      name: layerFileName(layer, index),
      base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    };
  });
  const manifest = JSON.stringify(
    {
      version: 1,
      resolution: size,
      layers: livery.layers.map((layer, index) => ({
        file: layerFileName(layer, index),
        name: layer.name,
        kind: layer.kind,
        mapping: layer.mapping,
        blend: layer.blend,
        opacity: layer.opacity,
        visible: layer.visible,
      })),
    },
    null,
    2,
  );
  return { files, manifest };
}

export function parseLayerFileName(name: string): ImportedLayer | null {
  const base = name.replace(/\.png$/i, '');
  const marker = base.lastIndexOf('__wf__');
  if (marker < 0) return null;
  const meta = base.slice(marker + '__wf__'.length).split('__');
  if (meta.length < 6) return null;
  const [id, kind, mapping, blend, opacity, visible] = meta;
  void kind;
  const head = base.slice(0, marker);
  const label = head.replace(/^\d+-/, '') || id;
  return {
    id,
    name: label,
    mapping: mapping as LiveryMapping,
    blend: PSD_TO_BLEND[blend] ?? 'normal',
    opacity: Number(opacity) || 1,
    visible: visible === '1',
    dataUrl: '',
  };
}
