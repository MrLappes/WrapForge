import { describe, expect, it } from 'vitest';
import {
  computePanelPlan,
  effectiveDpi,
  exportLabel,
  placementBounds,
  validatePrintProject,
} from './validation';
import { makeArtwork, makePanel, makePlacement, makeProject } from '../../test/fixtures';

describe('panel print plans', () => {
  it('computes trim, bleed, pixels, and memory from physical dimensions', () => {
    const panel = makePanel();
    const project = makeProject();
    const plan = computePanelPlan(panel, project.print);
    expect(plan.trimWidthMm).toBe(1000);
    expect(plan.trimHeightMm).toBe(500);
    expect(plan.outputWidthMm).toBe(1006);
    expect(plan.outputHeightMm).toBe(506);
    expect(plan.pixelWidth).toBe(3961);
    expect(plan.pixelHeight).toBe(1993);
    expect(plan.estimatedMemoryMb).toBeGreaterThan(20);
  });

  it('reports a non-wrap panel as a blocking error', () => {
    const project = makeProject();
    const plan = computePanelPlan(makePanel({ wrapable: false }), project.print);
    expect(plan.issues.some((issue) => issue.id.startsWith('panel-not-wrapable'))).toBe(true);
    expect(plan.issues.find((issue) => issue.blocksExport)).toBeTruthy();
  });

  it('blocks an output above the 250 megapixel limit', () => {
    const project = makeProject({
      print: { ...makeProject().print, dpi: 1200, scale: 10 },
    });
    const plan = computePanelPlan(makePanel(), project.print);
    expect(plan.issues.some((issue) => issue.id === 'raster-limit')).toBe(true);
    expect(plan.issues.find((issue) => issue.id === 'raster-limit')?.blocksExport).toBe(true);
  });

  it('warns about an empty panel', () => {
    const project = makeProject();
    const plan = computePanelPlan(makePanel(), project.print);
    expect(plan.issues.some((issue) => issue.id === 'panel-empty-hood')).toBe(true);
  });
});

describe('placement bounds and DPI', () => {
  it('keeps a square artwork square on a wide panel', () => {
    const panel = makePanel();
    const artwork = makeArtwork({ pixelWidth: 1000, pixelHeight: 1000 });
    const bounds = placementBounds(makePlacement({ widthFraction: 0.4 }), panel, artwork);
    expect(bounds.widthUv).toBeCloseTo(0.4, 6);
    expect(bounds.heightUv).toBeCloseTo(0.8, 6);
  });

  it('computes effective raster DPI', () => {
    const panel = makePanel();
    const artwork = makeArtwork({ pixelWidth: 4000, pixelHeight: 2000 });
    const dpi = effectiveDpi(artwork, makePlacement({ widthFraction: 0.5 }), panel, makeProject().print);
    expect(dpi).toBeCloseTo(203.2, 1);
  });
});

describe('print validation', () => {
  it('marks a clean configured export as print-ready', () => {
    const project = makeProject({
      artwork: [makeArtwork()],
      placements: [makePlacement()],
    });
    const result = validatePrintProject(project);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.productionReady).toBe(true);
    expect(exportLabel(result)).toBe('print-ready');
    expect(result.panels).toHaveLength(1);
    expect(result.allPlans).toHaveLength(1);
  });

  it('blocks a placement that references missing artwork', () => {
    const project = makeProject({
      artwork: [],
      placements: [makePlacement()],
    });
    const result = validatePrintProject(project);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.productionReady).toBe(false);
    expect(exportLabel(result)).toBe('draft');
  });

  it('warns about clipping, safe margins, and low resolution', () => {
    const project = makeProject({
      artwork: [makeArtwork({ pixelWidth: 100, pixelHeight: 50 })],
      placements: [makePlacement({ u: 0.05, widthFraction: 0.6 })],
    });
    const result = validatePrintProject(project);
    expect(result.errors).toHaveLength(0);
    const ids = result.warnings.map((issue) => issue.id);
    expect(ids.some((id) => id.startsWith('artwork-clipped'))).toBe(true);
    expect(ids.some((id) => id.startsWith('artwork-safe-margin'))).toBe(true);
    expect(ids.some((id) => id.startsWith('low-resolution'))).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.requiresAcknowledgment).toBe(true);
  });

  it('warns about live text', () => {
    const project = makeProject({
      artwork: [makeArtwork({ kind: 'text', text: {
        content: 'Hello',
        fontFamily: 'Inter Variable',
        fontWeight: 700,
        fontSizePx: 100,
        fill: '#ffffff',
        align: 'center',
      } })],
      placements: [makePlacement()],
    });
    const result = validatePrintProject(project);
    expect(result.warnings.some((issue) => issue.id.startsWith('text-not-outlined'))).toBe(true);
  });

  it('warns about CMYK and reports no panels when a custom selection is empty', () => {
    const project = makeProject({
      print: { ...makeProject().print, colorMode: 'cmyk', panelSelectionMode: 'custom', panelIds: [] },
    });
    const result = validatePrintProject(project);
    expect(result.errors.some((issue) => issue.id === 'no-panels')).toBe(true);
    expect(result.warnings.some((issue) => issue.id === 'cmyk-not-supported')).toBe(true);
  });

  it('honours a custom panel selection', () => {
    const project = makeProject({
      vehicle: {
        ...makeProject().vehicle,
        panels: [
          makePanel(),
          makePanel({ id: 'roof', name: 'Roof', category: 'roof', objectName: 'WF_roof' }),
        ],
      },
      print: {
        ...makeProject().print,
        panelSelectionMode: 'custom',
        panelIds: ['roof'],
      },
    });
    const result = validatePrintProject(project);
    expect(result.selectedPanels.map((panel) => panel.id)).toEqual(['roof']);
    expect(result.panels).toHaveLength(1);
    expect(result.allPlans).toHaveLength(2);
  });
});
