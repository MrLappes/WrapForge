import type { RecentProject, VehicleManifest } from '../project/schema';

export interface ImportedFile {
  name: string;
  mimeType: string;
  dataUrl: string;
  text?: string;
  byteLength: number;
}

export interface ArtworkFilePayload {
  relativePath: string;
  base64?: string;
  text?: string;
}

export interface SaveProjectInput {
  root: string | null;
  projectJson: string;
  files: ArtworkFilePayload[];
  thumbnailDataUrl?: string;
}

export interface SaveProjectResult {
  root: string;
  projectJson: string;
}

export interface LoadedProject {
  root: string;
  projectJson: string;
}

export interface ExistingProjectInfo {
  exists: boolean;
  id?: string;
  name?: string;
}

export interface BlenderInfo {
  found: boolean;
  executable: string | null;
  displayName: string | null;
  via: 'configured' | 'environment' | 'path' | 'flatpak' | 'known-path' | 'none';
  version: string | null;
  compatibility: 'tested' | 'untested' | 'unsupported' | 'unknown';
  message: string;
  checkedAt: string;
}

export interface RenderRequest {
  root: string;
  projectId: string;
  modelPath: string;
  outputName: string;
  engine: 'BLENDER_EEVEE' | 'CYCLES';
  width: number;
  height: number;
  samples: number;
  camera: string;
  transparentBackground: boolean;
  includeFloor: boolean;
  paintColor: string;
  panelTextures: Array<{ panelId: string; objectName: string; base64: string }>;
  /** Composed livery atlas for texture-painted (imported) vehicles. */
  bodyTexture?: { base64: string } | null;
  blenderPath: string;
}

export interface RenderProgress {
  jobId: string;
  stage: string;
  percent: number;
  message: string;
}

export interface RenderResult {
  jobId: string;
  outputPath: string;
  metadataPath: string;
  durationMs: number;
  engine: string;
  device: string | null;
  blenderVersion: string | null;
  resolution: { width: number; height: number };
}

export interface RenderFailure {
  jobId: string;
  message: string;
  logPath?: string;
}

export interface Platform {
  kind: 'desktop' | 'browser';
  loadSampleManifest(): Promise<VehicleManifest>;
  getSampleModelUrl(): string;
  resolveModelUrl(root: string | null, modelPath: string): Promise<string>;
  importArtwork(): Promise<ImportedFile | null>;
  importVehicleModel(): Promise<ImportedFile | null>;
  /** Generic single-file picker used by layer exchange (PSD, layer PNGs). */
  importFile(title: string, extensions: string[]): Promise<ImportedFile | null>;
  /** Multi-file picker, used to sync a folder of layer PNGs. */
  importFiles(title: string, extensions: string[]): Promise<ImportedFile[]>;
  chooseProjectParent(defaultName: string): Promise<string | null>;
  chooseProjectFolder(): Promise<string | null>;
  saveProject(input: SaveProjectInput): Promise<SaveProjectResult>;
  loadProject(root: string): Promise<LoadedProject>;
  checkExistingProject(root: string): Promise<ExistingProjectInfo>;
  listRecentProjects(): Promise<RecentProject[]>;
  saveExport(defaultName: string, data: { base64?: string; text?: string }): Promise<string | null>;
  chooseExportDirectory(): Promise<string | null>;
  writeExportFile(
    directory: string,
    fileName: string,
    data: { base64?: string; text?: string },
  ): Promise<string>;
  discoverBlender(configuredPath: string): Promise<BlenderInfo>;
  probeBlender(configuredPath: string): Promise<Record<string, unknown>>;
  startRender(
    input: RenderRequest,
    onProgress: (progress: RenderProgress) => void,
    onJobStarted?: (jobId: string) => void,
  ): Promise<RenderResult>;
  cancelRender(jobId: string): Promise<void>;
  readImageDataUrl(path: string): Promise<string>;
  openPath(path: string): Promise<void>;
  readTextAsset(root: string, relativePath: string): Promise<string>;
  readBinaryAsset(root: string, relativePath: string): Promise<string>;
}

export function joinPath(root: string, relativePath: string): string {
  if (!root) return relativePath;
  const separator = root.includes('\\') ? '\\' : '/';
  const trimmedRoot = root.replace(/[\\/]+$/, '');
  const trimmedRelative = relativePath.replace(/^[\\/]+/, '');
  return `${trimmedRoot}${separator}${trimmedRelative}`;
}
