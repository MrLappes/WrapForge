import type { ArtworkAsset, PanelDefinition, Placement, PrintConfiguration } from '../project/schema';
import type { PanelPrintPlan } from '../print/validation';
import { drawArtworkOnCanvas } from './artwork';
import { artworkAspect } from '../print/validation';
import { escapeXml } from './svg';

export interface PanelTextureInput {
  panel: PanelDefinition;
  placements: Placement[];
  artworks: ArtworkAsset[];
  images: Map<string, HTMLImageElement>;
  paintColor: string;
  maxDimension?: number;
}

export interface PanelCanvasResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export function previewTextureDimensions(
  panel: PanelDefinition,
  maxDimension = 1024,
): { width: number; height: number } {
  const aspect = panel.dimensionsMm.width / panel.dimensionsMm.height;
  if (aspect >= 1) {
    return { width: maxDimension, height: Math.max(32, Math.round(maxDimension / aspect)) };
  }
  return { width: Math.max(32, Math.round(maxDimension * aspect)), height: maxDimension };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function renderPanelTexture(input: PanelTextureInput): PanelCanvasResult {
  const dimensions = previewTextureDimensions(input.panel, input.maxDimension ?? 1024);
  const canvas = createCanvas(dimensions.width, dimensions.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this environment.');
  ctx.fillStyle = input.paintColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const placement of input.placements) {
    if (!placement.visible || placement.panelId !== input.panel.id) continue;
    const artwork = input.artworks.find((item) => item.id === placement.artworkId);
    if (!artwork) continue;
    if (artwork.kind !== 'text' && !input.images.has(artwork.id)) continue;
    const width = placement.widthFraction * canvas.width;
    drawArtworkOnCanvas(ctx, artwork, input.images.get(artwork.id) ?? null, {
      centerX: placement.u * canvas.width,
      centerY: (1 - placement.v) * canvas.height,
      width,
      opacity: placement.opacity,
      rotationDeg: placement.rotationDeg,
    });
  }

  return { canvas, width: canvas.width, height: canvas.height };
}

export function canvasToBase64(canvas: HTMLCanvasElement, mimeType = 'image/png'): string {
  const dataUrl = canvas.toDataURL(mimeType);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType = 'image/png'): string {
  return canvas.toDataURL(mimeType);
}

export interface PrintPanelInput {
  panel: PanelDefinition;
  plan: PanelPrintPlan;
  config: PrintConfiguration;
  placements: Placement[];
  artworks: ArtworkAsset[];
  images: Map<string, HTMLImageElement>;
  paintColor: string;
  includeGuides: boolean;
  /** Render a scaled on-screen preview instead of the full print raster. */
  previewWidthPx?: number;
}

export function renderPrintPanel(input: PrintPanelInput): PanelCanvasResult {
  const { plan, config, panel } = input;
  if (!input.previewWidthPx && plan.pixelWidth * plan.pixelHeight > 250_000_000) {
    throw new Error('This output exceeds the 250 megapixel limit. Reduce DPI or split the panel.');
  }
  const pxPerMm = input.previewWidthPx
    ? input.previewWidthPx / plan.outputWidthMm
    : config.dpi / 25.4;
  const canvasWidth = input.previewWidthPx
    ? Math.max(1, Math.round(input.previewWidthPx))
    : plan.pixelWidth;
  const canvasHeight = input.previewWidthPx
    ? Math.max(1, Math.round(plan.outputHeightMm * pxPerMm))
    : plan.pixelHeight;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this environment.');
  const bleedPx = plan.bleedMm * pxPerMm;
  const trimWidthPx = plan.trimWidthMm * pxPerMm;
  const trimHeightPx = plan.trimHeightMm * pxPerMm;

  ctx.fillStyle = input.paintColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(bleedPx, bleedPx, trimWidthPx, trimHeightPx);
  ctx.clip();

  for (const placement of input.placements) {
    if (!placement.visible || placement.panelId !== panel.id) continue;
    const artwork = input.artworks.find((item) => item.id === placement.artworkId);
    if (!artwork) continue;
    if (artwork.kind !== 'text' && !input.images.has(artwork.id)) continue;
    const width = placement.widthFraction * trimWidthPx;
    drawArtworkOnCanvas(ctx, artwork, input.images.get(artwork.id) ?? null, {
      centerX: bleedPx + placement.u * trimWidthPx,
      centerY: bleedPx + (1 - placement.v) * trimHeightPx,
      width,
      opacity: placement.opacity,
      rotationDeg: placement.rotationDeg,
    });
  }
  ctx.restore();

  if (input.includeGuides) {
    drawProductionGuides(ctx, {
      widthPx: canvas.width,
      heightPx: canvas.height,
      bleedPx,
      trimWidthPx,
      trimHeightPx,
      safePx: config.safeMarginMm * pxPerMm,
      includeRegistrationMarks: config.includeRegistrationMarks,
      includePanelLabels: config.includePanelLabels,
      panelName: panel.name,
      scale: config.scale,
    });
  }

  return { canvas, width: canvas.width, height: canvas.height };
}

function drawProductionGuides(
  ctx: CanvasRenderingContext2D,
  options: {
    widthPx: number;
    heightPx: number;
    bleedPx: number;
    trimWidthPx: number;
    trimHeightPx: number;
    safePx: number;
    includeRegistrationMarks: boolean;
    includePanelLabels: boolean;
    panelName: string;
    scale: number;
  },
): void {
  const {
    widthPx,
    heightPx,
    bleedPx,
    trimWidthPx,
    trimHeightPx,
    safePx,
    includeRegistrationMarks,
    includePanelLabels,
    panelName,
    scale,
  } = options;

  ctx.save();
  ctx.lineWidth = Math.max(1, widthPx / 4000);
  ctx.setLineDash([Math.max(4, widthPx / 200), Math.max(3, widthPx / 300)]);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.strokeRect(bleedPx, bleedPx, trimWidthPx, trimHeightPx);

  if (safePx > 0) {
    ctx.strokeStyle = 'rgba(0, 120, 200, 0.55)';
    ctx.strokeRect(bleedPx + safePx, bleedPx + safePx, trimWidthPx - safePx * 2, trimHeightPx - safePx * 2);
  }
  ctx.setLineDash([]);

  // Crop marks extend into the bleed area at the trim corners.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  const mark = Math.min(bleedPx * 0.8, Math.max(8, widthPx / 300));
  const corners = [
    [bleedPx, bleedPx, -1, -1],
    [bleedPx + trimWidthPx, bleedPx, 1, -1],
    [bleedPx, bleedPx + trimHeightPx, -1, 1],
    [bleedPx + trimWidthPx, bleedPx + trimHeightPx, 1, 1],
  ] as const;
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + mark * dx, y);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + mark * dy);
    ctx.stroke();
  }

  if (includeRegistrationMarks && bleedPx > 6) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    const radius = Math.max(3, Math.min(bleedPx * 0.45, widthPx / 500));
    for (const [x, y] of [
      [bleedPx / 2, bleedPx / 2],
      [widthPx - bleedPx / 2, bleedPx / 2],
      [bleedPx / 2, heightPx - bleedPx / 2],
      [widthPx - bleedPx / 2, heightPx - bleedPx / 2],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.moveTo(x - radius * 1.6, y);
      ctx.lineTo(x + radius * 1.6, y);
      ctx.moveTo(x, y - radius * 1.6);
      ctx.lineTo(x, y + radius * 1.6);
      ctx.stroke();
    }
  }

  if (includePanelLabels && bleedPx > 10) {
    const fontSize = Math.max(10, Math.min(bleedPx * 0.5, widthPx / 90));
    ctx.font = `500 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
    const label = `${panelName}  •  ${Math.round(scale * 100)}%  •  ${widthPx} × ${heightPx} px`;
    const textWidth = ctx.measureText(label).width;
    const pad = fontSize * 0.35;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.fillRect(bleedPx, heightPx - bleedPx + pad, textWidth + pad * 2, fontSize + pad * 2);
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.textBaseline = 'top';
    ctx.fillText(label, bleedPx + pad, heightPx - bleedPx + pad * 2);
  }
  ctx.restore();
}

export interface PanelSvgOptions {
  panel: PanelDefinition;
  plan: PanelPrintPlan;
  config: PrintConfiguration;
  placements: Placement[];
  artworks: ArtworkAsset[];
  sources: Map<string, string>;
  paintColor: string;
  includeGuides: boolean;
}

/**
 * Vector panel export. Artwork stays embedded as image data (SVG artwork
 * remains vector in SVG-capable consumers). Live text stays live text, which
 * is why the print validator warns about un-outlined text.
 */
export function renderPanelSvg(options: PanelSvgOptions): string {
  const { panel, plan, config, placements, artworks, sources, paintColor } = options;
  const pxPerMm = config.dpi / 25.4;
  const bleedPx = plan.bleedMm * pxPerMm;
  const trimWidthPx = plan.trimWidthMm * pxPerMm;
  const trimHeightPx = plan.trimHeightMm * pxPerMm;
  const width = plan.pixelWidth;
  const height = plan.pixelHeight;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.outputWidthMm.toFixed(3)}mm" height="${plan.outputHeightMm.toFixed(3)}mm" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<title>${escapeXml(panel.name)} — WrapForge draft panel</title>`);
  parts.push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(paintColor)}"/>`,
  );
  parts.push(
    `<clipPath id="trim"><rect x="${bleedPx}" y="${bleedPx}" width="${trimWidthPx}" height="${trimHeightPx}"/></clipPath>`,
  );
  parts.push('<g clip-path="url(#trim)">');

  for (const placement of placements) {
    if (!placement.visible || placement.panelId !== panel.id) continue;
    const artwork = artworks.find((item) => item.id === placement.artworkId);
    if (!artwork) continue;
    const targetWidth = placement.widthFraction * trimWidthPx;
    const cx = bleedPx + placement.u * trimWidthPx;
    const cy = bleedPx + (1 - placement.v) * trimHeightPx;
    const rotation = placement.rotationDeg;
    const transform = `rotate(${rotation.toFixed(3)} ${cx.toFixed(3)} ${cy.toFixed(3)})`;
    const opacity = placement.opacity.toFixed(3);

    if (artwork.kind === 'text' && artwork.text) {
      const scale = targetWidth / Math.max(1, artwork.text.fontSizePx);
      const fontSize = artwork.text.fontSizePx;
      const lineHeight = fontSize * 1.24;
      const lines = artwork.text.content.split('\n');
      const totalHeight = lineHeight * lines.length;
      const anchor = artwork.text.align === 'left' ? 'start' : artwork.text.align === 'right' ? 'end' : 'middle';
      const x = artwork.text.align === 'left' ? cx - targetWidth / 2 : artwork.text.align === 'right' ? cx + targetWidth / 2 : cx;
      parts.push(
        `<g transform="${transform}" opacity="${opacity}" font-family="${escapeXml(artwork.text.fontFamily)}" font-weight="${artwork.text.fontWeight}" fill="${escapeXml(artwork.text.fill)}" font-size="${fontSize}" text-anchor="${anchor}">`,
      );
      lines.forEach((line, index) => {
        const y = cy - totalHeight / 2 + lineHeight * (index + 0.5) + fontSize * 0.35;
        parts.push(`<text x="${x.toFixed(3)}" y="${y.toFixed(3)}">${escapeXml(line)}</text>`);
      });
      void scale;
      parts.push('</g>');
      continue;
    }

    const source = sources.get(artwork.id);
    if (!source) continue;
    const aspect = artworkAspect(artwork);
    const targetHeight = targetWidth / Math.max(aspect, 0.001);
    parts.push(
      `<image href="${escapeXml(source)}" x="${(cx - targetWidth / 2).toFixed(3)}" y="${(cy - targetHeight / 2).toFixed(3)}" width="${targetWidth.toFixed(3)}" height="${targetHeight.toFixed(3)}" opacity="${opacity}" transform="${transform}" preserveAspectRatio="none"/>`,
    );
  }
  parts.push('</g>');

  if (options.includeGuides) {
    parts.push(
      `<rect x="${bleedPx}" y="${bleedPx}" width="${trimWidthPx}" height="${trimHeightPx}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="8 6"/>`,
    );
    if (config.safeMarginMm > 0) {
      const safe = config.safeMarginMm * pxPerMm;
      parts.push(
        `<rect x="${bleedPx + safe}" y="${bleedPx + safe}" width="${Math.max(0, trimWidthPx - safe * 2)}" height="${Math.max(0, trimHeightPx - safe * 2)}" fill="none" stroke="#0078c8" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="6 5"/>`,
      );
    }
    parts.push(
      `<text x="${bleedPx}" y="${height - bleedPx / 2}" font-family="sans-serif" font-size="${Math.max(10, bleedPx * 0.35)}" fill="#111">${escapeXml(panel.name)} — DRAFT — ${Math.round(config.scale * 100)}%</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('\n');
}
