import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Livery, LiveryStroke, PanelDefinition, PanelMap } from '../../lib/project/schema';
import {
  composeLivery,
  paintDab,
  renderStrokes,
  strokeSpacing,
  type LiveryImageSource,
  type LiveryScene,
  type StrokeStyle,
} from '../../lib/livery/render';
import { buildGlassOverlay, buildWrapMask } from '../../lib/livery/wrapMask';
import { nowIso } from '../../lib/ids';

export type PaintPhase = 'start' | 'move' | 'end';

export interface LiveryTextureApi {
  canvas: HTMLCanvasElement | null;
  version: number;
  busy: boolean;
  error: string | null;
  paint(u: number, v: number, phase: PaintPhase, style: StrokeStyle): LiveryStroke | null;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

/**
 * Keeps the composed livery atlas in sync with the project. Compositions are
 * debounced because projected layers are rasterised through the model UVs,
 * while brush dabs are painted straight into the stroke layer for instant
 * feedback.
 */
export function useLiveryTexture(params: {
  livery: Livery | null;
  baseImage: HTMLImageElement | null;
  images: Map<string, HTMLImageElement>;
  scene: LiveryScene | null;
  panels?: PanelDefinition[];
  panelMap?: PanelMap | null;
}): LiveryTextureApi {
  const { livery, baseImage, images, scene, panels, panelMap } = params;
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resultRef = useRef<HTMLCanvasElement | null>(null);
  const glassRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<LiveryStroke | null>(null);
  const lastPointRef = useRef<{ u: number; v: number } | null>(null);

  const merge = useCallback(() => {
    const result = resultRef.current;
    const staticLayer = staticRef.current;
    const paintLayer = paintRef.current;
    if (!result || !staticLayer || !paintLayer) return;
    const ctx = result.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, result.width, result.height);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.drawImage(paintLayer, 0, 0);
    // Glass keeps the model's original texture: drawn last, so neither layers
    // nor brushwork can bleed onto the windows.
    const glass = glassRef.current;
    if (glass) ctx.drawImage(glass, 0, 0);
  }, []);

  /*
   * The mask only makes sense when there is an original texture to preserve:
   * glass that lives in the same single material as the paint.
   */
  const glassOverlay = useMemo(() => {
    if (!livery || livery.wrapGlass || !baseImage || !scene || !panelMap) return null;
    const mask = buildWrapMask({
      scene,
      panelMap,
      panels: panels ?? [],
      size: livery.resolution,
    });
    if (!mask) return null;
    return buildGlassOverlay(mask, baseImage, livery.resolution);
  }, [livery, baseImage, scene, panelMap, panels]);

  const rebuild = useCallback((current: Livery | null, base: HTMLImageElement | null, artwork: Map<string, HTMLImageElement>, liveryScene: LiveryScene | null, glass: HTMLCanvasElement | null) => {
    if (!current || !current.enabled) {
      staticRef.current = null;
      paintRef.current = null;
      glassRef.current = null;
      strokeRef.current = null;
      setCanvas(null);
      return;
    }
    const size = current.resolution;
    try {
      const staticLayer = composeLivery({
        livery: current,
        base,
        images: artwork as Map<string, LiveryImageSource>,
        scene: liveryScene,
        size,
      });
      const paintLayer = renderStrokes(current.strokes, size);
      if (!resultRef.current || resultRef.current.width !== size) {
        resultRef.current = makeCanvas(size);
      }
      staticRef.current = staticLayer;
      paintRef.current = paintLayer;
      glassRef.current = glass;
      merge();
      setCanvas(resultRef.current);
      setVersion((value) => value + 1);
      setError(null);
    } catch (composeError) {
      setError(
        composeError instanceof Error
          ? composeError.message
          : 'The livery texture could not be composed.',
      );
    }
  }, [merge]);

  useEffect(() => {
    setBusy(true);
    const handle = window.setTimeout(() => {
      rebuild(livery, baseImage, images, scene, glassOverlay);
      setBusy(false);
    }, 40);
    return () => window.clearTimeout(handle);
    // `glassOverlay` feeds `glassRef` inside rebuild, so a new overlay must
    // trigger a recomposition.
  }, [livery, baseImage, images, scene, glassOverlay, rebuild]);

  const paint = useCallback(
    (u: number, v: number, phase: PaintPhase, style: StrokeStyle): LiveryStroke | null => {
      const paintLayer = paintRef.current;
      if (!paintLayer) return null;
      const ctx = paintLayer.getContext('2d');
      if (!ctx) return null;
      const size = paintLayer.width;

      if (phase === 'start' || !strokeRef.current) {
        strokeRef.current = {
          id: `stroke-${Date.now()}-${Math.round(Math.random() * 9999)}`,
          name: style.erase ? 'Eraser stroke' : 'Brush stroke',
          visible: true,
          erase: style.erase,
          color: style.color,
          opacity: style.opacity,
          size: style.size,
          hardness: style.hardness,
          points: [{ u, v }],
          createdAt: nowIso(),
        };
        paintDab(ctx, u, v, style, size);
        lastPointRef.current = { u, v };
        merge();
        return null;
      }

      const stroke = strokeRef.current;
      const previous = lastPointRef.current ?? { u, v };
      const spacing = strokeSpacing(style, size) / size;
      const distance = Math.hypot(u - previous.u, v - previous.v);
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        paintDab(
          ctx,
          previous.u + (u - previous.u) * t,
          previous.v + (v - previous.v) * t,
          style,
          size,
        );
      }
      stroke.points.push({ u, v });
      lastPointRef.current = { u, v };
      merge();

      if (phase === 'end') {
        strokeRef.current = null;
        lastPointRef.current = null;
        return stroke;
      }
      return null;
    },
    [merge],
  );

  return { canvas, version, busy, error, paint };
}
