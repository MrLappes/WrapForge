import type { Livery, LiveryLayer, LiveryMapping, LiveryStroke } from '../project/schema';

export interface BakeSurface {
  /** Matches `PanelMapMesh.objectName`, so panel classification can be applied. */
  objectName?: string;
  /** 9 floats per triangle (a, b, c), world space, metres. */
  positions: Float32Array;
  /** 6 floats per triangle (u, v), 1:1 with positions. */
  uvs: Float32Array;
}

export interface LiveryScene {
  surfaces: BakeSurface[];
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

export type LiveryImageSource = CanvasImageSource;

/** Projected designs are rasterised at this size, independent of the atlas. */
export const DESIGN_SIZE = 1024;

function canvas(size: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

function context(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('This system cannot create 2D canvases.');
  return ctx;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Draws one layer into a canvas whose coordinates span the layer's space. */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: LiveryLayer,
  size: number,
  images: Map<string, LiveryImageSource>,
): void {
  if (!layer.visible || layer.opacity <= 0) return;
  const width = layer.w * size;
  const height = layer.h * size;
  if (width < 0.5 || height < 0.5) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blend === 'normal' ? 'source-over' : layer.blend;
  ctx.translate(layer.u * size, layer.v * size);
  ctx.rotate((layer.rotationDeg * Math.PI) / 180);
  if (layer.skew !== 0) ctx.transform(1, 0, layer.skew, 1, 0, 0);
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = layer.color;
  ctx.strokeStyle = layer.color;

  switch (layer.kind) {
    case 'rect':
    case 'paint':
      ctx.fillRect(0, 0, width, height);
      break;
    case 'stripe': {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, layer.color);
      gradient.addColorStop(1, layer.secondaryColor ?? layer.color);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      break;
    case 'chevron': {
      const teeth = Math.max(1, Math.round(width / Math.max(8, height)));
      const step = width / teeth;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let index = 0; index < teeth; index += 1) {
        const left = index * step;
        ctx.lineTo(left + step / 2, 0);
        ctx.lineTo(left + step, height);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'text': {
      const text = layer.text;
      if (!text) break;
      const scale = size / DESIGN_SIZE;
      ctx.font = `${text.fontWeight} ${Math.max(4, text.sizePx * scale)}px "${
        text.fontFamily
      }", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.letterSpacing = `${text.letterSpacingPx * scale}px`;
      const lines = (text.content || ' ').split('\n');
      const lineHeight = text.sizePx * scale * 1.15;
      const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, width / 2, startY + index * lineHeight);
      });
      ctx.letterSpacing = '0px';
      break;
    }
    case 'image': {
      const source = layer.imageArtworkId ? images.get(layer.imageArtworkId) : undefined;
      if (!source) {
        ctx.globalAlpha = layer.opacity * 0.6;
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
        break;
      }
      const sourceWidth =
        (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width || 1;
      const sourceHeight =
        (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height || 1;
      const scale = Math.min(width / sourceWidth, height / sourceHeight);
      ctx.drawImage(
        source,
        (width - sourceWidth * scale) / 2,
        (height - sourceHeight * scale) / 2,
        sourceWidth * scale,
        sourceHeight * scale,
      );
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Turns the base texture into the painted body colour while keeping shading. */
export function drawFinish(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: CanvasImageSource | null,
  finish: Livery['finish'],
): void {
  if (base) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(base, 0, 0, size, size);
  }
  if (finish.mode === 'original') return;
  if (finish.mode === 'solid') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp01(finish.strength);
    ctx.fillStyle = finish.color;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    return;
  }
  // tint: recolour the baked texture and keep its luminance as shading.
  const shade = canvas(size);
  const shadeCtx = context(shade);
  if (base) {
    shadeCtx.drawImage(base, 0, 0, size, size);
    shadeCtx.globalCompositeOperation = 'saturation';
    shadeCtx.fillStyle = '#808080';
    shadeCtx.fillRect(0, 0, size, size);
    shadeCtx.globalCompositeOperation = 'luminosity';
    shadeCtx.fillStyle = '#ffffff';
    shadeCtx.fillRect(0, 0, size, size);
  } else {
    shadeCtx.fillStyle = '#d8d8d8';
    shadeCtx.fillRect(0, 0, size, size);
  }
  const paint = canvas(size);
  const paintCtx = context(paint);
  paintCtx.fillStyle = finish.color;
  paintCtx.fillRect(0, 0, size, size);
  paintCtx.globalCompositeOperation = 'multiply';
  paintCtx.drawImage(shade, 0, 0);

  ctx.globalAlpha = clamp01(finish.strength);
  ctx.drawImage(paint, 0, 0);
  ctx.globalAlpha = 1;
}

interface ProjectionAxes {
  u: (x: number, y: number, z: number) => number;
  v: (x: number, y: number, z: number) => number;
  keep: (nx: number, ny: number, nz: number) => boolean;
}

export function projectionAxes(mapping: LiveryMapping, scene: LiveryScene): ProjectionAxes {
  const { bounds } = scene;
  const length = Math.max(1e-6, bounds.maxX - bounds.minX);
  const height = Math.max(1e-6, bounds.maxY - bounds.minY);
  const width = Math.max(1e-6, bounds.maxZ - bounds.minZ);
  switch (mapping) {
    case 'side-left':
      return {
        u: (x) => (x - bounds.minX) / length,
        v: (_x, y) => 1 - (y - bounds.minY) / height,
        keep: (_nx, _ny, nz) => nz > 0.02,
      };
    case 'side-right':
      return {
        u: (x) => 1 - (x - bounds.minX) / length,
        v: (_x, y) => 1 - (y - bounds.minY) / height,
        keep: (_nx, _ny, nz) => nz < -0.02,
      };
    case 'top':
      return {
        u: (x) => (x - bounds.minX) / length,
        v: (_x, _y, z) => (z - bounds.minZ) / width,
        keep: (_nx, ny) => ny > 0.02,
      };
    case 'front':
      return {
        u: (_x, _y, z) => 1 - (z - bounds.minZ) / width,
        v: (_x, y) => 1 - (y - bounds.minY) / height,
        keep: (nx) => nx > 0.02,
      };
    case 'rear':
      return {
        u: (_x, _y, z) => (z - bounds.minZ) / width,
        v: (_x, y) => 1 - (y - bounds.minY) / height,
        keep: (nx) => nx < -0.02,
      };
    default:
      return {
        u: (x) => (x - bounds.minX) / length,
        v: (_x, y) => 1 - (y - bounds.minY) / height,
        keep: () => true,
      };
  }
}

/**
 * Rasterises a design plane through the model's UVs. Each atlas pixel is
 * mapped back to a 3D point, projected into the design and sampled, which is
 * why projected stripes follow body panels instead of smearing across seams.
 */
export function bakeProjection(
  design: HTMLCanvasElement,
  scene: LiveryScene,
  mapping: LiveryMapping,
  target: CanvasRenderingContext2D,
  size: number,
): void {
  const axes = projectionAxes(mapping, scene);
  const designSize = design.width;
  const source = context(design).getImageData(0, 0, designSize, designSize).data;
  const image = target.createImageData(size, size);
  const out = image.data;

  for (const surface of scene.surfaces) {
    const { positions, uvs } = surface;
    const triangles = positions.length / 9;
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const p = triangle * 9;
      const uv = triangle * 6;
      const ax = positions[p];
      const ay = positions[p + 1];
      const az = positions[p + 2];
      const bx = positions[p + 3];
      const by = positions[p + 4];
      const bz = positions[p + 5];
      const cx = positions[p + 6];
      const cy = positions[p + 7];
      const cz = positions[p + 8];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const magnitude = Math.hypot(nx, ny, nz);
      if (magnitude < 1e-12) continue;
      if (!axes.keep(nx / magnitude, ny / magnitude, nz / magnitude)) continue;

      const au = uvs[uv];
      const av = uvs[uv + 1];
      const bu = uvs[uv + 2];
      const bv = uvs[uv + 3];
      const cu = uvs[uv + 4];
      const cv = uvs[uv + 5];
      const minU = Math.min(au, bu, cu);
      const maxU = Math.max(au, bu, cu);
      const minV = Math.min(av, bv, cv);
      const maxV = Math.max(av, bv, cv);
      const x0 = Math.max(0, Math.floor(minU * size));
      const x1 = Math.min(size - 1, Math.ceil(maxU * size));
      const y0 = Math.max(0, Math.floor((1 - maxV) * size));
      const y1 = Math.min(size - 1, Math.ceil((1 - minV) * size));
      if (x1 < x0 || y1 < y0) continue;

      const denominator = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
      if (Math.abs(denominator) < 1e-12) continue;

      for (let py = y0; py <= y1; py += 1) {
        const v = 1 - (py + 0.5) / size;
        for (let px = x0; px <= x1; px += 1) {
          const u = (px + 0.5) / size;
          const w0 = ((bv - cv) * (u - cu) + (cu - bu) * (v - cv)) / denominator;
          const w1 = ((cv - av) * (u - cu) + (au - cu) * (v - cv)) / denominator;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
          const wx = w0 * ax + w1 * bx + w2 * cx;
          const wy = w0 * ay + w1 * by + w2 * cy;
          const wz = w0 * az + w1 * bz + w2 * cz;
          const du = Math.min(
            designSize - 1,
            Math.max(0, Math.floor(axes.u(wx, wy, wz) * designSize)),
          );
          const dv = Math.min(
            designSize - 1,
            Math.max(0, Math.floor(axes.v(wx, wy, wz) * designSize)),
          );
          const sample = (dv * designSize + du) * 4;
          const alpha = source[sample + 3];
          if (alpha === 0) continue;
          const offset = (py * size + px) * 4;
          if (alpha > out[offset + 3]) {
            out[offset] = source[sample];
            out[offset + 1] = source[sample + 1];
            out[offset + 2] = source[sample + 2];
            out[offset + 3] = alpha;
          }
        }
      }
    }
  }
  target.putImageData(image, 0, 0);
}

function brushSprite(color: string, hardness: number): HTMLCanvasElement {
  const size = 128;
  const element = canvas(size);
  const ctx = context(element);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  const softness = Math.max(0.02, 1 - hardness);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1 - softness, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return element;
}

export interface StrokeStyle {
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  erase: boolean;
}

/** Paints a single dab. Points are normalised atlas coordinates. */
export function paintDab(
  ctx: CanvasRenderingContext2D,
  u: number,
  v: number,
  style: StrokeStyle,
  size: number,
  sprite?: HTMLCanvasElement,
): void {
  const radius = Math.max(0.5, (style.size * size) / 2);
  ctx.save();
  ctx.globalAlpha = clamp01(style.opacity);
  if (style.erase) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(u * size, (1 - v) * size, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = 'source-over';
    const image = sprite ?? brushSprite(style.color, style.hardness);
    ctx.drawImage(image, u * size - radius, (1 - v) * size - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

export function strokeSpacing(style: StrokeStyle, size: number): number {
  return Math.max(0.5, style.size * size * 0.18);
}

/**
 * Rasterises a stored stroke. Strokes keep their sample points, so a project
 * reopens with identical brushwork at any texture resolution.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: LiveryStroke,
  size: number,
  sprite?: HTMLCanvasElement,
): void {
  const style: StrokeStyle = {
    color: stroke.color,
    size: stroke.size,
    opacity: stroke.opacity,
    hardness: stroke.hardness,
    erase: stroke.erase,
  };
  const spacing = strokeSpacing(style, size);
  let previous: { x: number; y: number } | null = null;
  for (const point of stroke.points) {
    const x = point.u * size;
    const y = (1 - point.v) * size;
    if (!previous) {
      paintDab(ctx, point.u, point.v, style, size, sprite);
      previous = { x, y };
      continue;
    }
    const distance = Math.hypot(x - previous.x, y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      paintDab(
        ctx,
        (previous.x + (x - previous.x) * t) / size,
        1 - (previous.y + (y - previous.y) * t) / size,
        style,
        size,
        sprite,
      );
    }
    previous = { x, y };
  }
}

export interface ComposeOptions {
  livery: Livery;
  base: CanvasImageSource | null;
  images: Map<string, LiveryImageSource>;
  scene: LiveryScene | null;
  size: number;
}

const PROJECTED: LiveryMapping[] = ['side-left', 'side-right', 'top', 'front', 'rear'];

/**
 * Composes the full livery atlas: base finish, projected decal planes, atlas
 * layers and brushwork. Expensive, so callers should debounce it.
 */
export function composeLivery(options: ComposeOptions): HTMLCanvasElement {
  const { livery, base, images, scene, size } = options;
  const result = canvas(size);
  const ctx = context(result);
  drawFinish(ctx, size, base, livery.finish);

  if (scene) {
    for (const mapping of PROJECTED) {
      const layers = livery.layers.filter((layer) => layer.mapping === mapping && layer.visible);
      if (layers.length === 0) continue;
      const design = canvas(DESIGN_SIZE);
      const designCtx = context(design);
      for (const layer of layers) drawLayer(designCtx, layer, DESIGN_SIZE, images);
      const baked = canvas(size);
      bakeProjection(design, scene, mapping, context(baked), size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(baked, 0, 0);
    }
  }

  for (const layer of livery.layers) {
    if (layer.mapping !== 'atlas') continue;
    drawLayer(ctx, layer, size, images);
  }
  ctx.globalCompositeOperation = 'source-over';
  return result;
}

/** Renders only brushwork, so strokes can be composited live while painting. */
export function renderStrokes(strokes: LiveryStroke[], size: number): HTMLCanvasElement {
  const result = canvas(size);
  const ctx = context(result);
  const sprites = new Map<string, HTMLCanvasElement>();
  for (const stroke of strokes) {
    if (!stroke.visible) continue;
    const key = `${stroke.color}|${stroke.hardness}`;
    let sprite = sprites.get(key);
    if (!sprite) {
      sprite = brushSprite(stroke.color, stroke.hardness);
      sprites.set(key, sprite);
    }
    drawStroke(ctx, stroke, size, sprite);
  }
  return result;
}
