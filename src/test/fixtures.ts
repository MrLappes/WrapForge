import type {
  ArtworkAsset,
  PanelDefinition,
  Placement,
  ProjectDocument,
} from '../lib/project/schema';
import { createDefaultProject } from '../lib/project/defaults';

export function makePanel(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return {
    id: 'hood',
    name: 'Hood',
    category: 'hood',
    side: 'center',
    wrapable: true,
    outwardAxis: '+Z',
    objectName: 'WF_hood',
    dimensionsMm: { width: 1000, height: 500 },
    areaM2: 0.5,
    uv: {
      hasUv: true,
      layout: 'planar-outer-face',
      outerFaceCount: 1,
      overlapDetected: false,
      note: 'Test panel',
    },
    ...overrides,
  };
}

export function makeArtwork(overrides: Partial<ArtworkAsset> = {}): ArtworkAsset {
  return {
    id: 'art-1',
    name: 'Test artwork',
    kind: 'raster',
    mimeType: 'image/png',
    embeddedSource: 'data:image/png;base64,AAAA',
    pixelWidth: 4000,
    pixelHeight: 2000,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makePlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'placement-1',
    name: 'Test artwork on Hood',
    artworkId: 'art-1',
    panelId: 'hood',
    mapping: 'uv',
    u: 0.5,
    v: 0.5,
    widthFraction: 0.5,
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeProject(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  const project = createDefaultProject(
    {
      assetId: 'test-asset',
      displayName: 'Test Vehicle',
      dimensionsMm: { length: 4000, width: 1800, height: 1400 },
      bodyStyle: 'Test',
      license: {
        id: 'CC0-1.0',
        name: 'CC0',
        attribution: 'Test',
        redistributionPermitted: true,
      },
      panels: [makePanel()],
      validation: {
        score: 90,
        maxScore: 100,
        method: 'test',
        checks: [],
        notes: [],
      },
    },
    'Test project',
  );
  return {
    ...project,
    artwork: [],
    placements: [],
    print: {
      ...project.print,
      dpi: 100,
      bleedMm: 3,
      safeMarginMm: 5,
      panelSelectionMode: 'all',
      panelIds: [],
    },
    ...overrides,
  };
}
