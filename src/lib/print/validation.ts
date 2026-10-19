import type {
  ArtworkAsset,
  PanelDefinition,
  Placement,
  PrintConfiguration,
  ProjectDocument,
} from '../project/schema';
import { megabytesForPixels, pixelsForPhysicalSize } from './units';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface PrintIssue {
  id: string;
  severity: IssueSeverity;
  panelId?: string;
  title: string;
  detail: string;
  /** Warnings can be acknowledged for a draft export; errors cannot. */
  blocksExport: boolean;
}

export interface PanelPrintPlan {
  panelId: string;
  panelName: string;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  outputWidthMm: number;
  outputHeightMm: number;
  pixelWidth: number;
  pixelHeight: number;
  estimatedMemoryMb: number;
  issues: PrintIssue[];
}

export interface PrintValidationResult {
  issues: PrintIssue[];
  panels: PanelPrintPlan[];
  allPlans: PanelPrintPlan[];
  selectedPanels: PanelDefinition[];
  errors: PrintIssue[];
  warnings: PrintIssue[];
  productionReady: boolean;
  requiresAcknowledgment: boolean;
  totalPixels: number;
}

export interface ArtworkSize {
  widthPx: number;
  heightPx: number;
  aspect: number;
}

export function artworkAspect(artwork: ArtworkAsset | undefined): number {
  if (!artwork) return 1;
  if (artwork.kind === 'text' && artwork.text) {
    const lines = artwork.text.content.split('\n');
    const longest = Math.max(1, ...lines.map((line) => line.length));
    const widthPx = Math.max(1, longest * artwork.text.fontSizePx * 0.58);
    const heightPx = Math.max(1, lines.length * artwork.text.fontSizePx * 1.24);
    return widthPx / heightPx;
  }
  if (artwork.pixelWidth && artwork.pixelHeight) {
    return artwork.pixelWidth / artwork.pixelHeight;
  }
  return 1;
}

export function artworkSize(artwork: ArtworkAsset | undefined): ArtworkSize {
  const aspect = artworkAspect(artwork);
  const widthPx = artwork?.pixelWidth ?? 1000;
  const heightPx = artwork?.pixelHeight ?? Math.max(1, widthPx / aspect);
  return { widthPx, heightPx, aspect };
}

export interface PlacementBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerU: number;
  centerV: number;
  widthUv: number;
  heightUv: number;
}

/**
 * Converts a placement to an axis-aligned bounding box in panel UV space.
 * Panel UV space is treated as 0..1 in both axes; the panel's physical aspect
 * ratio is used so a square artwork stays square on the panel.
 */
export function placementBounds(
  placement: Placement,
  panel: PanelDefinition,
  artwork: ArtworkAsset | undefined,
): PlacementBounds {
  const aspect = Math.max(artworkAspect(artwork), 0.001);
  const widthUv = placement.widthFraction;
  const heightUv = (placement.widthFraction * panel.dimensionsMm.width) / aspect / panel.dimensionsMm.height;
  const rotation = (placement.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const halfWidth = (widthUv * cos + heightUv * sin) / 2;
  const halfHeight = (widthUv * sin + heightUv * cos) / 2;
  return {
    centerU: placement.u,
    centerV: placement.v,
    widthUv,
    heightUv,
    left: placement.u - halfWidth,
    right: placement.u + halfWidth,
    top: placement.v + halfHeight,
    bottom: placement.v - halfHeight,
  };
}

export function effectiveDpi(
  artwork: ArtworkAsset | undefined,
  placement: Placement,
  panel: PanelDefinition,
  config: PrintConfiguration,
): number | undefined {
  if (!artwork || artwork.kind === 'text') return undefined;
  const size = artworkSize(artwork);
  if (!artwork.pixelWidth || !artwork.pixelHeight) return undefined;
  const physicalWidthMm = placement.widthFraction * panel.dimensionsMm.width * config.scale;
  if (physicalWidthMm <= 0) return undefined;
  return size.widthPx / (physicalWidthMm / 25.4);
}

export function computePanelPlan(
  panel: PanelDefinition,
  config: PrintConfiguration,
  placements: Placement[] = [],
  artworks: ArtworkAsset[] = [],
): PanelPrintPlan {
  const trimWidthMm = panel.dimensionsMm.width * config.scale;
  const trimHeightMm = panel.dimensionsMm.height * config.scale;
  const outputWidthMm = trimWidthMm + config.bleedMm * 2;
  const outputHeightMm = trimHeightMm + config.bleedMm * 2;
  const pixelWidth = pixelsForPhysicalSize(outputWidthMm, config.dpi);
  const pixelHeight = pixelsForPhysicalSize(outputHeightMm, config.dpi);
  const estimatedMemoryMb = megabytesForPixels(pixelWidth, pixelHeight);
  const issues: PrintIssue[] = [];

  if (!panel.wrapable) {
    issues.push({
      id: `panel-not-wrapable-${panel.id}`,
      severity: 'error',
      panelId: panel.id,
      title: 'Panel is not wrap-able',
      detail: `${panel.name} is marked as a non-wrap surface and cannot be included in a wrap export.`,
      blocksExport: true,
    });
  }

  const panelPlacements = placements.filter(
    (placement) => placement.panelId === panel.id && placement.visible,
  );
  if (panel.wrapable && panelPlacements.length === 0) {
    issues.push({
      id: `panel-empty-${panel.id}`,
      severity: 'warning',
      panelId: panel.id,
      title: 'Panel has no artwork',
      detail: `${panel.name} will export as a single paint-colour panel.`,
      blocksExport: false,
    });
  }

  const safeFractionX = 1 - config.safeMarginMm / Math.max(trimWidthMm, 0.001);
  const safeFractionY = 1 - config.safeMarginMm / Math.max(trimHeightMm, 0.001);

  for (const placement of panelPlacements) {
    const artwork = artworks.find((item) => item.id === placement.artworkId);
    if (!artwork) {
      issues.push({
        id: `missing-artwork-${placement.id}`,
        severity: 'error',
        panelId: panel.id,
        title: 'Missing artwork',
        detail: `Placement "${placement.name}" references an artwork asset that is not in the project.`,
        blocksExport: true,
      });
      continue;
    }
    const bounds = placementBounds(placement, panel, artwork);
    if (bounds.left < 0 || bounds.right > 1 || bounds.bottom < 0 || bounds.top > 1) {
      issues.push({
        id: `artwork-clipped-${placement.id}`,
        severity: 'warning',
        panelId: panel.id,
        title: 'Artwork crosses the panel edge',
        detail: `"${placement.name}" extends beyond the printable panel area and will be trimmed.`,
        blocksExport: false,
      });
    }
    if (
      config.safeMarginMm > 0 &&
      (bounds.left < 1 - safeFractionX ||
        bounds.right > safeFractionX ||
        bounds.bottom < 1 - safeFractionY ||
        bounds.top > safeFractionY)
    ) {
      issues.push({
        id: `artwork-safe-margin-${placement.id}`,
        severity: 'warning',
        panelId: panel.id,
        title: 'Artwork enters the safe margin',
        detail: `"${placement.name}" is within ${config.safeMarginMm} mm of a trim edge. Critical content may be cut during installation.`,
        blocksExport: false,
      });
    }
    if (artwork.kind === 'text') {
      issues.push({
        id: `text-not-outlined-${placement.id}`,
        severity: 'warning',
        panelId: panel.id,
        title: 'Text is not outlined',
        detail: `"${placement.name}" is live text. Production output should use outlined text or verify the font at the printer.`,
        blocksExport: false,
      });
    }
    const dpi = effectiveDpi(artwork, placement, panel, config);
    if (dpi !== undefined && dpi < config.dpi * 0.75) {
      issues.push({
        id: `low-resolution-${placement.id}`,
        severity: 'warning',
        panelId: panel.id,
        title: 'Low raster resolution',
        detail: `"${placement.name}" resolves to ${Math.round(dpi)} DPI at the configured scale and ${config.dpi} DPI target. Replace the raster or reduce its physical size.`,
        blocksExport: false,
      });
    }
    if (placement.opacity < 1) {
      issues.push({
        id: `transparency-${placement.id}`,
        severity: 'info',
        panelId: panel.id,
        title: 'Transparency in output',
        detail: `"${placement.name}" uses ${Math.round(placement.opacity * 100)}% opacity. Confirm the printer handles transparency as expected.`,
        blocksExport: false,
      });
    }
  }

  if (config.dpi < 72) {
    issues.push({
      id: 'low-dpi',
      severity: 'warning',
      panelId: panel.id,
      title: 'Low target DPI',
      detail: `${config.dpi} DPI is below a typical large-format minimum. Confirm the printer's requirements.`,
      blocksExport: false,
    });
  }
  if (config.bleedMm === 0) {
    issues.push({
      id: 'no-bleed',
      severity: 'warning',
      panelId: panel.id,
      title: 'No bleed',
      detail: 'The export has no bleed. Edge-to-edge graphics may show a white sliver after trimming.',
      blocksExport: false,
    });
  }
  if (estimatedMemoryMb > 512) {
    issues.push({
      id: 'huge-raster',
      severity: 'warning',
      panelId: panel.id,
      title: 'Large raster allocation',
      detail: `The panel output is ${pixelWidth} x ${pixelHeight} px (~${Math.round(estimatedMemoryMb)} MB in memory). Reduce DPI or split the panel.`,
      blocksExport: false,
    });
  }
  if (pixelWidth * pixelHeight > 250_000_000) {
    issues.push({
      id: 'raster-limit',
      severity: 'error',
      panelId: panel.id,
      title: 'Output exceeds the raster limit',
      detail: 'This output exceeds 250 megapixels. Reduce DPI or scale, or split the panel into smaller print documents.',
      blocksExport: true,
    });
  }

  return {
    panelId: panel.id,
    panelName: panel.name,
    trimWidthMm,
    trimHeightMm,
    bleedMm: config.bleedMm,
    outputWidthMm,
    outputHeightMm,
    pixelWidth,
    pixelHeight,
    estimatedMemoryMb,
    issues,
  };
}

export function validatePrintProject(project: ProjectDocument): PrintValidationResult {
  const wrapablePanels = project.vehicle.panels.filter((panel) => panel.wrapable);
  const explicitSelection =
    project.print.panelSelectionMode === 'custom' ? project.print.panelIds : [];
  const selectedPanels =
    project.print.panelSelectionMode === 'custom'
      ? wrapablePanels.filter((panel) => explicitSelection.includes(panel.id))
      : wrapablePanels;

  const issues: PrintIssue[] = [];
  const plansByPanel = new Map(
    wrapablePanels.map((panel) => [
      panel.id,
      computePanelPlan(panel, project.print, project.placements, project.artwork),
    ]),
  );
  const allPlans = [...plansByPanel.values()];
  const panels = selectedPanels
    .map((panel) => plansByPanel.get(panel.id))
    .filter((plan): plan is PanelPrintPlan => Boolean(plan));
  for (const plan of panels) issues.push(...plan.issues);

  if (selectedPanels.length === 0) {
    issues.push({
      id: 'no-panels',
      severity: 'error',
      title: 'No panels selected',
      detail: 'Select at least one wrap-able panel for print output.',
      blocksExport: true,
    });
  }
  if (project.print.colorMode === 'cmyk') {
    issues.push({
      id: 'cmyk-not-supported',
      severity: 'warning',
      title: 'CMYK output is not implemented',
      detail:
        'WrapForge currently exports RGB raster and SVG data. CMYK conversion, ICC profiles, and spot colours require a printer-specific profile. This export is a draft until that pipeline is validated.',
      blocksExport: false,
    });
  }
  if (project.print.scale !== 1) {
    issues.push({
      id: 'scaled-output',
      severity: 'info',
      title: 'Scaled output',
      detail: `Output is scaled to ${Math.round(project.print.scale * 100)}%. Confirm the installer expects this scale.`,
      blocksExport: false,
    });
  }
  const missing = project.placements.filter(
    (placement) => !project.artwork.some((artwork) => artwork.id === placement.artworkId),
  );
  if (missing.length > 0) {
    issues.push({
      id: 'missing-placement-assets',
      severity: 'error',
      title: 'Placements reference missing artwork',
      detail: `${missing.length} placement(s) reference artwork that is not present in the project.`,
      blocksExport: true,
    });
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    issues,
    panels,
    allPlans,
    selectedPanels,
    errors,
    warnings,
    productionReady: errors.length === 0 && warnings.length === 0,
    requiresAcknowledgment: errors.length === 0 && warnings.length > 0,
    totalPixels: panels.reduce((sum, plan) => sum + plan.pixelWidth * plan.pixelHeight, 0),
  };
}

export function exportLabel(result: PrintValidationResult): 'print-ready' | 'draft' {
  return result.productionReady ? 'print-ready' : 'draft';
}
