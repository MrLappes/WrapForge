import type {
  ArtworkAsset,
  Livery,
  LiveryLayer,
  LiveryLayerKind,
  PanelDefinition,
  Placement,
  ProjectDocument,
  RenderPreset,
} from './schema';
import { APP_VERSION, PROJECT_FORMAT, SCHEMA_VERSION } from './schema';
import { createId, nowIso } from '../ids';

export const DEFAULT_PAINT_COLOR = '#d9552f';

export function createDefaultLivery(): Livery {
  return {
    enabled: false,
    resolution: 2048,
    baseTexturePath: null,
    baseTextureSize: 1024,
    finish: { mode: 'tint', color: '#121821', strength: 0.9 },
    wrapGlass: false,
    layers: [],
    strokes: [],
  };
}

export function createLiveryLayer(
  kind: LiveryLayerKind,
  overrides: Partial<LiveryLayer> = {},
): LiveryLayer {
  const base: LiveryLayer = {
    id: createId('layer'),
    name: layerKindLabel(kind),
    kind,
    mapping: 'atlas',
    visible: true,
    locked: false,
    blend: 'normal',
    opacity: 1,
    color: '#ff3d2e',
    u: 0.3,
    v: 0.3,
    w: 0.4,
    h: 0.12,
    rotationDeg: 0,
    skew: 0,
    createdAt: nowIso(),
  };
  if (kind === 'text') {
    base.text = {
      content: 'WRAPFORGE',
      fontFamily: 'Inter Variable',
      fontWeight: 800,
      sizePx: 220,
      letterSpacingPx: 8,
    };
    base.color = '#ffffff';
  }
  return { ...base, ...overrides };
}

export function layerKindLabel(kind: LiveryLayerKind): string {
  switch (kind) {
    case 'stripe':
      return 'Stripe';
    case 'rect':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'triangle':
      return 'Triangle';
    case 'chevron':
      return 'Chevron';
    case 'text':
      return 'Text';
    case 'image':
      return 'Image';
    default:
      return 'Shape';
  }
}

export const RENDER_PRESETS: Record<
  RenderPreset,
  { label: string; width: number; height: number; samples: number; engine: 'BLENDER_EEVEE' | 'CYCLES' }
> = {
  draft: { label: 'Draft', width: 960, height: 600, samples: 8, engine: 'BLENDER_EEVEE' },
  preview: { label: 'Preview', width: 1600, height: 1000, samples: 32, engine: 'BLENDER_EEVEE' },
  high: { label: 'High quality', width: 2560, height: 1600, samples: 128, engine: 'CYCLES' },
  final: { label: 'Final', width: 3840, height: 2400, samples: 512, engine: 'CYCLES' },
};

export function createDefaultProject(
  manifest: {
    assetId: string;
    displayName: string;
    dimensionsMm: { length: number; width: number; height: number };
    bodyStyle?: string;
    license: ProjectDocument['vehicle']['license'];
    panels: PanelDefinition[];
    validation?: ProjectDocument['vehicle']['validation'];
  },
  name = 'Untitled wrap',
): ProjectDocument {
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId('proj'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    vehicle: {
      assetId: manifest.assetId,
      displayName: manifest.displayName,
      modelPath: `bundled:${manifest.assetId}`,
      manifestPath: `bundled:${manifest.assetId}/manifest.json`,
      paintColor: DEFAULT_PAINT_COLOR,
      livery: createDefaultLivery(),
      dimensionsMm: manifest.dimensionsMm,
      bodyStyle: manifest.bodyStyle,
      license: manifest.license,
      panels: manifest.panels,
      validation: manifest.validation,
    },
    artwork: [],
    placements: [],
    print: {
      unit: 'mm',
      scale: 1,
      dpi: 150,
      bleedMm: 3,
      safeMarginMm: 5,
      colorMode: 'rgb',
      includeRegistrationMarks: true,
      includePanelLabels: true,
      panelSelectionMode: 'all',
      panelIds: [],
    },
    render: {
      preset: 'preview',
      width: 1600,
      height: 1000,
      engine: 'BLENDER_EEVEE',
      samples: 32,
      camera: 'three-quarter-front',
      transparentBackground: false,
      includeFloor: true,
    },
    settings: {
      showGrid: true,
      showPanelEdges: true,
      showUvSeams: false,
      gridSizeMm: 250,
    },
  };
}

export function createEnvelope(project: ProjectDocument): ProjectEnvelopeLike {
  return {
    format: PROJECT_FORMAT,
    formatVersion: 1,
    appVersion: APP_VERSION,
    savedAt: nowIso(),
    project: { ...project, updatedAt: nowIso() },
  };
}

interface ProjectEnvelopeLike {
  format: typeof PROJECT_FORMAT;
  formatVersion: 1;
  appVersion: string;
  savedAt: string;
  project: ProjectDocument;
}

export function createPlacement(
  artwork: ArtworkAsset,
  panel: PanelDefinition,
  overrides: Partial<Placement> = {},
): Placement {
  return {
    id: createId('placement'),
    name: `${artwork.name} on ${panel.name}`,
    artworkId: artwork.id,
    panelId: panel.id,
    mapping: 'uv',
    u: 0.5,
    v: 0.5,
    widthFraction: 0.55,
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    createdAt: nowIso(),
    ...overrides,
  };
}

export function appliedRenderPreset(project: ProjectDocument): ProjectDocument['render'] {
  const preset = RENDER_PRESETS[project.render.preset];
  return {
    ...project.render,
    width: preset.width,
    height: preset.height,
    samples: preset.samples,
    engine: preset.engine,
  };
}
