import type { ArtworkAsset, ProjectDocument, VehicleManifest } from './schema';
import { ProjectEnvelope } from './schema';
import { migrateProject, type MigrationResult } from './migrations';
import { createDefaultProject, createEnvelope } from './defaults';
import type { ArtworkFilePayload, Platform, SaveProjectResult } from '../platform/types';
import { createId, nowIso } from '../ids';
import { sanitizeSvg, svgDataUrl, parseSvgDimensions } from '../graphics/svg';
import { imageDimensions } from '../graphics/artwork';
import { markPendingAssetsSaved, pendingAssetFiles } from '../vehicle/pending';

export async function createSampleProject(platform: Platform, name: string): Promise<ProjectDocument> {
  const manifest: VehicleManifest = await platform.loadSampleManifest();
  return createDefaultProject(manifest, name);
}

export function serializeProject(project: ProjectDocument): string {
  return JSON.stringify(createEnvelope(project), null, 2);
}

export interface OpenResult {
  project: ProjectDocument;
  root: string | null;
  warnings: string[];
  migration: MigrationResult;
}

export async function openProject(platform: Platform, root: string): Promise<OpenResult> {
  const loaded = await platform.loadProject(root);
  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.projectJson);
  } catch (error) {
    throw new Error('The project file is not valid JSON and may be corrupted.', { cause: error });
  }
  const migration = migrateProject(parsed);
  return {
    project: migration.project,
    root: loaded.root,
    warnings: migration.warnings,
    migration,
  };
}

export interface WriteResult {
  project: ProjectDocument;
  root: string;
  migration: MigrationResult;
}

export async function writeProject(
  platform: Platform,
  project: ProjectDocument,
  root: string | null,
  options: { thumbnailDataUrl?: string } = {},
): Promise<WriteResult> {
  const files = [...prepareArtworkFiles(project), ...pendingAssetFiles()];
  const diskProject = prepareProjectForDisk(platform, project);
  const projectJson = serializeProject(diskProject);
  const saved: SaveProjectResult = await platform.saveProject({
    root,
    projectJson,
    files,
    thumbnailDataUrl: options.thumbnailDataUrl,
  });
  markPendingAssetsSaved();
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved.projectJson);
  } catch (error) {
    throw new Error('The saved project could not be parsed back from disk.', { cause: error });
  }
  const migration = migrateProject(parsed);
  validateEnvelopeParsed(diskProject);
  return { project: migration.project, root: saved.root, migration };
}

function validateEnvelopeParsed(project: ProjectDocument): void {
  const envelope = createEnvelope(project);
  ProjectEnvelope.parse(envelope);
}

/**
 * The desktop shell stores artwork as real files. Embedded copies are removed
 * from the on-disk JSON to keep projects small; the in-memory project keeps
 * them until the next save so unsaved work can still render.
 */
function prepareProjectForDisk(platform: Platform, project: ProjectDocument): ProjectDocument {
  const clone = structuredClone(project);
  if (platform.kind !== 'desktop') return clone;
  for (const artwork of clone.artwork) {
    if (artwork.sourcePath && artwork.kind !== 'text') {
      delete artwork.embeddedSource;
    }
  }
  return clone;
}

export function prepareArtworkFiles(project: ProjectDocument): ArtworkFilePayload[] {
  const files: ArtworkFilePayload[] = [];
  for (const artwork of project.artwork) {
    if (!artwork.sourcePath || !artwork.embeddedSource || artwork.kind === 'text') continue;
    if (artwork.embeddedSource.startsWith('data:')) {
      const comma = artwork.embeddedSource.indexOf(',');
      if (comma < 0) continue;
      files.push({
        relativePath: artwork.sourcePath,
        base64: artwork.embeddedSource.slice(comma + 1),
      });
    } else {
      files.push({ relativePath: artwork.sourcePath, text: artwork.embeddedSource });
    }
  }
  return files;
}

function extensionForMime(mimeType: string, name: string): string {
  const lower = name.toLowerCase();
  const known = lower.match(/\.(svg|png|jpe?g|webp)$/);
  if (known) return known[0].replace('jpeg', 'jpg');
  if (mimeType === 'image/svg+xml') return '.svg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  return '.bin';
}

export function artworkStoragePath(id: string, mimeType: string, name: string): string {
  return `assets/artwork/${id}${extensionForMime(mimeType, name)}`;
}

export function createSvgArtworkAsset(name: string, source: string): ArtworkAsset {
  const id = createId('art');
  const sanitized = sanitizeSvg(source);
  const dimensions = parseSvgDimensions(sanitized);
  return {
    id,
    name: name.replace(/\.svg$/i, ''),
    kind: 'svg',
    mimeType: 'image/svg+xml',
    sourcePath: artworkStoragePath(id, 'image/svg+xml', `${name}.svg`),
    embeddedSource: sanitized,
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
    physicalWidthMm: (dimensions.width / 96) * 25.4,
    physicalHeightMm: (dimensions.height / 96) * 25.4,
    attribution: '',
    createdAt: nowIso(),
  };
}

export async function importArtworkAsset(
  platform: Platform,
  _root: string | null,
): Promise<ArtworkAsset | null> {
  const imported = await platform.importArtwork();
  if (!imported) return null;
  const id = createId('art');
  const isSvg =
    imported.mimeType === 'image/svg+xml' ||
    imported.name.toLowerCase().endsWith('.svg') ||
    (imported.text?.trimStart().startsWith('<svg') ?? false);
  const now = nowIso();

  if (isSvg) {
    if (!imported.text) {
      throw new Error('The SVG file could not be read as text.');
    }
    return createSvgArtworkAsset(imported.name, imported.text);
  }

  const dimensions = await imageDimensions(imported.dataUrl);
  return {
    id,
    name: imported.name.replace(/\.(png|jpe?g|webp)$/i, ''),
    kind: 'raster',
    mimeType: imported.mimeType,
    sourcePath: artworkStoragePath(id, imported.mimeType, imported.name),
    embeddedSource: imported.dataUrl,
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
    physicalWidthMm: (dimensions.width / 96) * 25.4,
    physicalHeightMm: (dimensions.height / 96) * 25.4,
    attribution: '',
    createdAt: now,
  };
}

/** Builds a raster artwork asset from in-memory pixels (PSD/layer imports). */
export async function artworkFromDataUrl(name: string, dataUrl: string): Promise<ArtworkAsset> {
  const id = createId('art');
  const dimensions = await imageDimensions(dataUrl);
  return {
    id,
    name: name.replace(/\.png$/i, ''),
    kind: 'raster',
    mimeType: 'image/png',
    sourcePath: artworkStoragePath(id, 'image/png', 'layer.png'),
    embeddedSource: dataUrl,
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
    physicalWidthMm: (dimensions.width / 96) * 25.4,
    physicalHeightMm: (dimensions.height / 96) * 25.4,
    attribution: '',
    createdAt: nowIso(),
  };
}

export function createTextArtwork(
  content: string,
  options: Partial<{
    fontFamily: string;
    fontWeight: number;
    fontSizePx: number;
    fill: string;
    align: 'left' | 'center' | 'right';
  }> = {},
): ArtworkAsset {
  const fontFamily = options.fontFamily ?? 'Inter Variable';
  const fontWeight = options.fontWeight ?? 700;
  const fontSizePx = options.fontSizePx ?? 160;
  const fill = options.fill ?? '#ffffff';
  const align = options.align ?? 'center';
  const id = createId('art');
  const lines = content.split('\n');
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const pixelWidth = Math.max(64, longest * fontSizePx * 0.58);
  const pixelHeight = Math.max(32, lines.length * fontSizePx * 1.24);
  const firstLine = lines[0]?.trim() || 'Text';
  return {
    id,
    name: firstLine.length > 36 ? `${firstLine.slice(0, 33)}…` : firstLine,
    kind: 'text',
    mimeType: 'text/plain',
    pixelWidth,
    pixelHeight,
    embeddedSource: undefined,
    text: { content, fontFamily, fontWeight, fontSizePx, fill, align },
    createdAt: nowIso(),
  };
}

export function artworkSourceDataUrl(artwork: ArtworkAsset): string | null {
  if (!artwork.embeddedSource) return null;
  if (artwork.embeddedSource.startsWith('data:')) return artwork.embeddedSource;
  return svgDataUrl(sanitizeSvg(artwork.embeddedSource));
}
