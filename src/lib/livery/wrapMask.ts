import { isGlassCategory, NO_PANEL, type PanelDefinition, type PanelMap } from '../project/schema';
import { decodePanelBytes } from '../vehicle/detect';
import type { LiveryScene } from './render';

export interface WrapMaskInput {
  scene: LiveryScene;
  panelMap: PanelMap | null;
  panels: PanelDefinition[];
  size: number;
}

/**
 * White where the livery may be applied, black on glass. Built from the panel
 * map so it follows the UV layout of whatever model is loaded: on a
 * single-material car the windows live in the same texture, and painting them
 * by accident is exactly what this prevents.
 */
export function buildWrapMask(input: WrapMaskInput): HTMLCanvasElement | null {
  const { scene, panelMap, panels, size } = input;
  if (!panelMap) return null;

  const glassSlots = new Set<number>();
  panelMap.order.forEach((panelId, slot) => {
    const panel = panels.find((item) => item.id === panelId);
    if (panel && isGlassCategory(panel.category)) glassSlots.add(slot);
  });
  if (glassSlots.size === 0) return null;

  const bytesByMesh = new Map<string, Uint8Array>();
  for (const mesh of panelMap.meshes) bytesByMesh.set(mesh.objectName, decodePanelBytes(mesh.triangles));

  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  let painted = false;

  for (const surface of scene.surfaces) {
    const bytes = surface.objectName ? bytesByMesh.get(surface.objectName) : undefined;
    if (!bytes) continue;
    const triangles = Math.min(surface.positions.length / 9, bytes.length);
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const slot = bytes[triangle];
      if (slot === NO_PANEL || !glassSlots.has(slot)) {
        const uv = triangle * 6;
        const au = surface.uvs[uv];
        const av = surface.uvs[uv + 1];
        const bu = surface.uvs[uv + 2];
        const bv = surface.uvs[uv + 3];
        const cu = surface.uvs[uv + 4];
        const cv = surface.uvs[uv + 5];
        ctx.moveTo(au * size, av * size);
        ctx.lineTo(bu * size, bv * size);
        ctx.lineTo(cu * size, cv * size);
        ctx.closePath();
        painted = true;
      }
    }
  }

  if (!painted) return null;
  ctx.fill();
  return element;
}

/**
 * The part of the original texture that must survive the livery: everything
 * outside the wrap mask, i.e. the glass. Drawn on top of the composed atlas, it
 * costs one blit per brush dab instead of re-masking the whole texture.
 */
export function buildGlassOverlay(
  mask: HTMLCanvasElement,
  base: CanvasImageSource,
  size: number,
): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  if (!ctx) return element;
  ctx.drawImage(base, 0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  const inverse = document.createElement('canvas');
  inverse.width = size;
  inverse.height = size;
  const inverseCtx = inverse.getContext('2d');
  if (inverseCtx) {
    inverseCtx.fillStyle = '#fff';
    inverseCtx.fillRect(0, 0, size, size);
    inverseCtx.globalCompositeOperation = 'destination-out';
    inverseCtx.drawImage(mask, 0, 0, size, size);
    ctx.drawImage(inverse, 0, 0);
  }
  return element;
}
