import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ImportedFile } from '../platform/types';
import type { AssetValidation, VehicleInstance } from '../project/schema';
import { createDefaultLivery } from '../project/defaults';
import { analyzeVehicle, type VehicleAnalysis } from './detect';
import { registerPendingAssetBase64, registerPendingDataUrl } from './pending';

export const VEHICLE_MODEL_PATH = 'assets/vehicle/model.glb';
export const BASE_TEXTURE_PATH = 'assets/vehicle/base-texture.png';

export interface VehicleImportResult {
  vehicle: VehicleInstance;
  analysis: VehicleAnalysis;
  warnings: string[];
  coverage: number;
  triangleCount: number;
  baseTextureSize: number | null;
  baseTextureUrl: string | null;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'imported-vehicle'
  );
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('The selected file could not be read.');
  return response.arrayBuffer();
}

export async function loadGltf(dataUrl: string, name: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith('.gltf')) {
      const response = await fetch(dataUrl);
      const text = await response.text();
      const gltf = await loader.parseAsync(text, '');
      return gltf.scene;
    }
    const buffer = await dataUrlToArrayBuffer(dataUrl);
    const gltf = await loader.parseAsync(buffer, '');
    if (!gltf.scene) throw new Error('The file does not contain a glTF scene.');
    return gltf.scene;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/draco|ktx2|meshopt/i.test(message)) {
      throw new Error(
        `This model uses compressed geometry or textures that the built-in loader cannot decode (${message}). Export it again without Draco/KTX2 compression.`,
        { cause: error },
      );
    }
    throw new Error(
      `The model could not be parsed: ${message}. WrapForge reads self-contained .glb files best; .gltf files with external .bin or texture files cannot be resolved from a single-file import.`,
      { cause: error },
    );
  }
}

interface TextureExtraction {
  dataUrl: string;
  width: number;
  height: number;
}

function imageToDataUrl(image: unknown): TextureExtraction | null {
  const source = image as { width?: number; height?: number } | null;
  if (!source || typeof source !== 'object') return null;
  const width = Math.min(4096, Math.max(1, Number(source.width) || 0));
  const height = Math.min(4096, Math.max(1, Number(source.height) || 0));
  if (!width || !height) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } catch {
    return null;
  }
}

/** Finds the model's first base-colour texture so the livery can tint it. */
export function extractBaseTexture(root: THREE.Object3D): TextureExtraction | null {
  let found: TextureExtraction | null = null;
  root.traverse((object) => {
    if (found || !(object instanceof THREE.Mesh)) return;
    const materials = (
      Array.isArray(object.material) ? object.material : [object.material]
    ).filter(Boolean) as THREE.MeshStandardMaterial[];
    for (const material of materials) {
      const extracted = imageToDataUrl(material.map?.image);
      if (extracted) {
        found = extracted;
        return;
      }
    }
  });
  return found;
}

function panelValidation(analysis: VehicleAnalysis): AssetValidation {
  const named = analysis.panels.filter((panel) => panel.category !== 'other');
  const averageConfidence =
    analysis.panels.length === 0
      ? 0
      : analysis.panels.reduce((sum, panel) => sum + (panel.confidence ?? 0), 0) /
        analysis.panels.length;
  const checks: AssetValidation['checks'] = [
    {
      id: 'geometry',
      label: 'Model geometry',
      status: 'pass',
      detail: `${analysis.surfaces.length} mesh(es); ${Math.round(
        analysis.coverage * 100,
      )}% of body triangles matched a panel rule.`,
    },
    {
      id: 'uv',
      label: 'UV coordinates',
      status: analysis.panels.some((panel) => panel.uv.hasUv) ? 'pass' : 'fail',
      detail: analysis.panels.some((panel) => panel.uv.hasUv)
        ? 'At least one UV set is present, so the livery can be baked into the texture.'
        : 'No UVs were found. Livery painting needs a UV-mapped model.',
    },
    {
      id: 'panels',
      label: 'Panel detection',
      status: named.length >= 6 ? 'pass' : named.length >= 3 ? 'warning' : 'fail',
      detail: `${named.length} named panels detected (average confidence ${(
        averageConfidence * 100
      ).toFixed(0)}%).`,
    },
    {
      id: 'scale',
      label: 'Scale',
      status: 'warning',
      detail: `Model units were read as ${analysis.transform.units}; verify the real length.`,
    },
  ];
  return {
    score: Math.round(35 + analysis.coverage * 35 + averageConfidence * 20),
    maxScore: 100,
    method: 'heuristic-panel-detection',
    checks,
    notes: analysis.warnings,
  };
}

/**
 * Parses a user-supplied glTF, normalises it to metres, detects panels, and
 * captures the base-colour texture so the livery can be painted over it.
 */
export async function importVehicleFromFile(file: ImportedFile): Promise<VehicleImportResult> {
  const root = await loadGltf(file.dataUrl, file.name);
  const analysis = analyzeVehicle(root);
  const texture = extractBaseTexture(root);

  registerPendingAssetBase64(
    VEHICLE_MODEL_PATH,
    file.dataUrl,
    file.mimeType || 'model/gltf-binary',
  );
  if (texture) {
    registerPendingDataUrl(BASE_TEXTURE_PATH, texture.dataUrl, 'image/png');
  }

  const { size } = analysis.transform;
  const triangleCount = analysis.surfaces.reduce(
    (sum, surface) => sum + surface.triangleCount,
    0,
  );

  const livery = createDefaultLivery();
  livery.enabled = true;
  livery.baseTexturePath = texture ? BASE_TEXTURE_PATH : null;
  livery.baseTextureSize = texture ? Math.max(texture.width, texture.height) : 1024;
  livery.finish = { mode: 'tint', color: '#101726', strength: 0.92 };

  const vehicle: VehicleInstance = {
    assetId: slug(file.name),
    displayName: file.name.replace(/\.(glb|gltf)$/i, ''),
    modelPath: VEHICLE_MODEL_PATH,
    paintColor: livery.finish.color,
    livery,
    dimensionsMm: {
      length: Math.round(size.length * 1000),
      width: Math.round(size.width * 1000),
      height: Math.round(size.height * 1000),
    },
    bodyStyle: 'Imported model',
    license: {
      id: 'user-supplied',
      name: 'User-supplied model',
      attribution: 'Imported by the user; not redistributed with WrapForge.',
      redistributionPermitted: false,
    },
    panels: analysis.panels,
    panelMap: analysis.panelMap ?? undefined,
    validation: panelValidation(analysis),
  };

  const warnings = [...analysis.warnings];
  if (!texture) {
    warnings.push(
      'The model has no base-colour texture, so the livery canvas starts from a flat surface.',
    );
  }
  if (!analysis.panels.some((panel) => panel.uv.hasUv)) {
    warnings.push('No UV coordinates were found; texture painting will not show on the model.');
  }

  return {
    vehicle,
    analysis,
    warnings,
    coverage: analysis.coverage,
    triangleCount,
    baseTextureSize: texture ? Math.max(texture.width, texture.height) : null,
    baseTextureUrl: texture?.dataUrl ?? null,
  };
}
