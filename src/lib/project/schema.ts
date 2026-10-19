import { z } from 'zod';

export const APP_VERSION = '0.1.0-alpha.0';
export const SCHEMA_VERSION = 2;
export const PROJECT_FORMAT = 'wrapforge-project';
export const PROJECT_FILE_NAME = 'project.json';

export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');

export const IsoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO timestamp');

export const PanelCategory = z.enum([
  'hood',
  'roof',
  'door',
  'fender',
  'quarter',
  'bumper',
  'trunk',
  'window',
  'other',
]);

/**
 * Glass is excluded from wrapping by default: a foil belongs on paintwork, and
 * the texture of a single-material model still holds the windows.
 */
export function isGlassCategory(category: string): boolean {
  return category === 'window';
}

export const PanelSide = z.enum(['left', 'right', 'center']);

export const OutwardAxis = z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']);

export const UvMetadata = z.object({
  hasUv: z.boolean(),
  layout: z.string().optional(),
  outerFaceCount: z.number().int().nonnegative().optional(),
  overlapDetected: z.boolean().optional(),
  note: z.string().optional(),
});

export const PanelDimensions = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

/**
 * Imported models are often one mesh, so a panel owns a set of triangles
 * instead of an object. The map is stored as one byte per triangle (base64) of
 * panel index into `order`, with 254 meaning "no wrap panel". That keeps a
 * 50k-triangle car inside a few tens of kilobytes instead of megabytes.
 */
export const PanelMapMesh = z.object({
  objectName: z.string().min(1),
  triangles: z.string().min(1),
});

export const PanelMap = z.object({
  order: z.array(z.string().min(1)).min(1),
  meshes: z.array(PanelMapMesh).min(1),
});

export const NO_PANEL = 254;

export const PanelDefinition = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: PanelCategory,
  side: PanelSide,
  wrapable: z.boolean(),
  outwardAxis: OutwardAxis,
  objectName: z.string().min(1),
  dimensionsMm: PanelDimensions,
  areaM2: z.number().nonnegative().optional(),
  uv: UvMetadata,
  /** Heuristic auto-detection confidence (0 = guess, 1 = certain). */
  confidence: z.number().min(0).max(1).optional(),
  detection: z.enum(['manual', 'name', 'geometry', 'bundled']).optional(),
});

export const LicenseInfo = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  attribution: z.string().optional(),
  source: z.string().optional(),
  redistributionPermitted: z.boolean().optional(),
});

export const ValidationCheck = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['pass', 'warning', 'fail']),
  detail: z.string(),
});

export const AssetValidation = z.object({
  score: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100).default(100),
  method: z.string(),
  checks: z.array(ValidationCheck),
  notes: z.array(z.string()).default([]),
});

export const VehicleManifest = z.object({
  schemaVersion: z.number().int().positive(),
  assetId: z.string().min(1),
  displayName: z.string().min(1),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelYear: z.number().int().nullable().optional(),
  bodyStyle: z.string().optional(),
  units: z.literal('mm'),
  dimensionsMm: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  license: LicenseInfo,
  files: z.object({
    model: z.string().min(1),
    blend: z.string().optional(),
    thumbnail: z.string().optional(),
    hero: z.string().optional(),
  }),
  panels: z.array(PanelDefinition),
  validation: AssetValidation,
  generatedAt: z.string().optional(),
  generator: z.string().optional(),
});

export const LiveryBlend = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'lighten',
  'darken',
  'soft-light',
]);

/**
 * `atlas` layers live in texture space, which means they can smear across UV
 * seams. Projected layers are rasterised through the model's UVs instead, so a
 * stripe stays a stripe on the body.
 */
export const LiveryMapping = z.enum([
  'atlas',
  'side-left',
  'side-right',
  'top',
  'front',
  'rear',
]);

export const LiveryLayerKind = z.enum([
  'stripe',
  'rect',
  'ellipse',
  'triangle',
  'chevron',
  'text',
  'image',
  'paint',
]);

export const LiveryLayer = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: LiveryLayerKind,
  mapping: LiveryMapping.default('atlas'),
  visible: z.boolean(),
  locked: z.boolean(),
  blend: LiveryBlend.default('normal'),
  opacity: z.number().min(0).max(1),
  color: HexColor,
  secondaryColor: HexColor.optional(),
  /** Box in the layer's own space: 0..1 atlas UV, or 0..1 projected bounds. */
  u: z.number().min(-1).max(2),
  v: z.number().min(-1).max(2),
  w: z.number().min(0.001).max(3),
  h: z.number().min(0.001).max(3),
  rotationDeg: z.number().min(-360).max(360),
  skew: z.number().min(-2).max(2).default(0),
  text: z
    .object({
      content: z.string(),
      fontFamily: z.string(),
      fontWeight: z.number().int().min(100).max(900),
      sizePx: z.number().positive(),
      letterSpacingPx: z.number().default(0),
    })
    .optional(),
  imageArtworkId: z.string().optional(),
  createdAt: IsoTimestamp,
});

export const LiveryStrokePoint = z.object({
  u: z.number().min(-0.5).max(1.5),
  v: z.number().min(-0.5).max(1.5),
});

export const LiveryStroke = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  visible: z.boolean(),
  erase: z.boolean(),
  color: HexColor,
  opacity: z.number().min(0).max(1),
  /** Brush diameter as a fraction of the texture width. */
  size: z.number().min(0.001).max(0.5),
  hardness: z.number().min(0).max(1),
  points: z.array(LiveryStrokePoint).min(1),
  createdAt: IsoTimestamp,
});

export const LiveryFinish = z.object({
  mode: z.enum(['original', 'tint', 'solid']).default('tint'),
  color: HexColor.default('#121821'),
  strength: z.number().min(0).max(1).default(0.9),
});

export const Livery = z.object({
  enabled: z.boolean().default(false),
  /** Composed texture resolution in pixels (square). */
  resolution: z.number().int().min(512).max(4096).default(2048),
  /** Project-relative path of the model's original base-colour texture. */
  baseTexturePath: z.string().nullable().default(null),
  baseTextureSize: z.number().int().min(64).max(8192).default(1024),
  finish: LiveryFinish,
  /**
   * Imported models often bake their windows into the same texture as the
   * paint. When false (the default) the livery is masked off glass panels, so
   * the original glass shows through.
   */
  wrapGlass: z.boolean().default(false),
  layers: z.array(LiveryLayer).default([]),
  strokes: z.array(LiveryStroke).default([]),
});

export const VehicleInstance = z.object({
  assetId: z.string().min(1),
  displayName: z.string().min(1),
  /** `bundled:` references resolve to an asset shipped with the app. */
  modelPath: z.string().min(1),
  manifestPath: z.string().optional(),
  paintColor: HexColor,
  livery: Livery,
  dimensionsMm: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  bodyStyle: z.string().optional(),
  license: LicenseInfo,
  panels: z.array(PanelDefinition),
  panelMap: PanelMap.optional(),
  validation: AssetValidation.optional(),
});

const TextConfig = z.object({
  content: z.string(),
  fontFamily: z.string(),
  fontWeight: z.number().int().min(100).max(900),
  fontSizePx: z.number().positive(),
  fill: HexColor,
  align: z.enum(['left', 'center', 'right']),
});

export const ArtworkKind = z.enum(['svg', 'raster', 'text']);

export const ArtworkAsset = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ArtworkKind,
  mimeType: z.string().min(1),
  /** Project-relative path once saved by the desktop shell. */
  sourcePath: z.string().optional(),
  /** Browser/preview fallback for unsaved work. */
  embeddedSource: z.string().optional(),
  pixelWidth: z.number().positive().optional(),
  pixelHeight: z.number().positive().optional(),
  physicalWidthMm: z.number().positive().optional(),
  physicalHeightMm: z.number().positive().optional(),
  text: TextConfig.optional(),
  attribution: z.string().optional(),
  createdAt: IsoTimestamp,
});

export const Placement = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artworkId: z.string().min(1),
  panelId: z.string().min(1),
  mapping: z.enum(['uv']).default('uv'),
  /** Artwork centre in panel UV space. */
  u: z.number().min(0).max(1),
  v: z.number().min(0).max(1),
  /** Artwork width as a fraction of the panel's physical width. */
  widthFraction: z.number().positive().max(4),
  rotationDeg: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  createdAt: IsoTimestamp,
});

export const PrintConfiguration = z.object({
  unit: z.enum(['mm', 'cm', 'in']).default('mm'),
  scale: z.number().positive().max(10).default(1),
  dpi: z.number().int().min(30).max(1200).default(150),
  bleedMm: z.number().min(0).max(100).default(3),
  safeMarginMm: z.number().min(0).max(100).default(5),
  colorMode: z.enum(['rgb', 'cmyk']).default('rgb'),
  includeRegistrationMarks: z.boolean().default(true),
  includePanelLabels: z.boolean().default(true),
  panelSelectionMode: z.enum(['all', 'custom']).default('all'),
  panelIds: z.array(z.string()).default([]),
});

export const RenderPreset = z.enum(['draft', 'preview', 'high', 'final']);

export const RenderCamera = z.enum([
  'three-quarter-front',
  'three-quarter-rear',
  'front',
  'rear',
  'left',
  'right',
  'top',
]);

export const RenderConfiguration = z.object({
  preset: RenderPreset.default('preview'),
  width: z.number().int().min(64).max(8192).default(1600),
  height: z.number().int().min(64).max(8192).default(1000),
  engine: z.enum(['BLENDER_EEVEE', 'CYCLES']).default('BLENDER_EEVEE'),
  samples: z.number().int().min(1).max(4096).default(32),
  camera: RenderCamera.default('three-quarter-front'),
  transparentBackground: z.boolean().default(false),
  includeFloor: z.boolean().default(true),
});

export const ProjectSettings = z.object({
  showGrid: z.boolean().default(true),
  showPanelEdges: z.boolean().default(true),
  showUvSeams: z.boolean().default(false),
  gridSizeMm: z.number().positive().default(250),
});

export const ProjectDocument = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  vehicle: VehicleInstance,
  artwork: z.array(ArtworkAsset).default([]),
  placements: z.array(Placement).default([]),
  print: PrintConfiguration,
  render: RenderConfiguration,
  settings: ProjectSettings,
});

export const ProjectEnvelope = z.object({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.literal(1),
  appVersion: z.string(),
  savedAt: IsoTimestamp,
  project: ProjectDocument,
});

export const RecentProject = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  updatedAt: IsoTimestamp,
  thumbnailDataUrl: z.string().optional(),
});

export type PanelDefinition = z.infer<typeof PanelDefinition>;
export type PanelCategory = z.infer<typeof PanelCategory>;
export type PanelSide = z.infer<typeof PanelSide>;
export type VehicleManifest = z.infer<typeof VehicleManifest>;
export type VehicleInstance = z.infer<typeof VehicleInstance>;
export type ArtworkAsset = z.infer<typeof ArtworkAsset>;
export type ArtworkKind = z.infer<typeof ArtworkKind>;
export type Placement = z.infer<typeof Placement>;
export type PrintConfiguration = z.infer<typeof PrintConfiguration>;
export type RenderConfiguration = z.infer<typeof RenderConfiguration>;
export type RenderPreset = z.infer<typeof RenderPreset>;
export type RenderCamera = z.infer<typeof RenderCamera>;
export type ProjectSettings = z.infer<typeof ProjectSettings>;
export type ProjectDocument = z.infer<typeof ProjectDocument>;
export type ProjectEnvelope = z.infer<typeof ProjectEnvelope>;
export type RecentProject = z.infer<typeof RecentProject>;
export type AssetValidation = z.infer<typeof AssetValidation>;
export type LicenseInfo = z.infer<typeof LicenseInfo>;
export type Livery = z.infer<typeof Livery>;
export type LiveryLayer = z.infer<typeof LiveryLayer>;
export type LiveryLayerKind = z.infer<typeof LiveryLayerKind>;
export type LiveryMapping = z.infer<typeof LiveryMapping>;
export type LiveryBlend = z.infer<typeof LiveryBlend>;
export type LiveryStroke = z.infer<typeof LiveryStroke>;
export type LiveryFinish = z.infer<typeof LiveryFinish>;
export type PanelMap = z.infer<typeof PanelMap>;
export type PanelMapMesh = z.infer<typeof PanelMapMesh>;
