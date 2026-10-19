import * as THREE from 'three';

/**
 * World-space, de-indexed triangle soup for one mesh. Panels are expressed as
 * triangle runs into this data, which keeps highlighting and UV rasterising
 * independent of the renderer.
 */
export interface Surface {
  objectName: string;
  object: THREE.Object3D;
  /** 9 floats per triangle (a, b, c), world space. */
  positions: Float32Array;
  /** 6 floats per triangle (a, b, c), or null when the mesh has no UVs. */
  uvs: Float32Array | null;
  triangleCount: number;
  isBody: boolean;
  materialNames: string[];
}

export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
}

export interface VehicleTransform {
  rotation: THREE.Quaternion;
  scale: number;
  size: VehicleDimensions;
  units: string;
  confidence: number;
}

const NON_BODY_PATTERNS = [
  /glass/i,
  /window/i,
  /windshield/i,
  /windscreen/i,
  /light/i,
  /lamp/i,
  /led/i,
  /tyre/i,
  /tire/i,
  /wheel/i,
  /rim/i,
  /brake/i,
  /caliper/i,
  /mirror/i,
  /chrome/i,
  /emblem/i,
  /badge/i,
  /logo/i,
  /plate/i,
  /interior/i,
  /seat/i,
  /steer/i,
  /dashboard/i,
  /shadow/i,
  /ground/i,
];

function isBodyMaterial(material: THREE.Material | undefined): boolean {
  if (!material) return true;
  if (material.transparent && material.opacity < 0.85) return false;
  const transmission = (material as THREE.MeshPhysicalMaterial).transmission;
  if (typeof transmission === 'number' && transmission > 0.4) return false;
  return true;
}

function meshName(mesh: THREE.Mesh, taken: Set<string>): string {
  const base = (mesh.name || 'mesh').replace(/\s+/g, '_').slice(0, 90) || 'mesh';
  let name = base;
  let index = 2;
  while (taken.has(name)) {
    name = `${base}_${index}`;
    index += 1;
  }
  taken.add(name);
  return name;
}

/**
 * Flattens every mesh under `root` into world-space triangles. Meshes that are
 * obviously not bodywork (glass, wheels, lights) are flagged, not dropped, so
 * callers can still reason about them.
 */
export function collectSurfaces(root: THREE.Object3D): Surface[] {
  const surfaces: Surface[] = [];
  const taken = new Set<string>();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.getIndex();
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    if (triangleCount === 0) return;

    const uvAttribute = geometry.getAttribute('uv');
    const positions = new Float32Array(triangleCount * 9);
    const uvs = uvAttribute ? new Float32Array(triangleCount * 6) : null;
    const name = meshName(object, taken);
    const point = new THREE.Vector3();

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
        const target = triangle * 9 + corner * 3;
        point
          .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
          .applyMatrix4(object.matrixWorld);
        positions[target] = point.x;
        positions[target + 1] = point.y;
        positions[target + 2] = point.z;
        if (uvs && uvAttribute) {
          uvs[triangle * 6 + corner * 2] = uvAttribute.getX(vertex);
          uvs[triangle * 6 + corner * 2 + 1] = uvAttribute.getY(vertex);
        }
      }
    }

    const materials = (
      Array.isArray(object.material) ? object.material : [object.material]
    ).filter(Boolean) as THREE.Material[];
    const materialNames = materials.map((material) => material.name || '').filter(Boolean);
    const bodyByName = !NON_BODY_PATTERNS.some(
      (pattern) => pattern.test(name) || materialNames.some((item) => pattern.test(item)),
    );
    const bodyByMaterial =
      materials.length === 0 || materials.some((material) => isBodyMaterial(material));

    surfaces.push({
      objectName: name,
      object,
      positions,
      uvs,
      triangleCount,
      isBody: bodyByName && bodyByMaterial,
      materialNames,
    });
  });
  return surfaces;
}

export function surfaceBox(surfaces: Surface[]): THREE.Box3 {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const surface of surfaces) {
    for (let i = 0; i < surface.positions.length; i += 3) {
      point.set(surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]);
      box.expandByPoint(point);
    }
  }
  return box;
}

const UNIT_GUESSES: Array<{ factor: number; label: string }> = [
  { factor: 1, label: 'metres' },
  { factor: 0.01, label: 'centimetres' },
  { factor: 0.001, label: 'millimetres' },
  { factor: 0.0254, label: 'inches' },
  { factor: 0.3048, label: 'feet' },
  { factor: 0.1, label: 'decimetres' },
];

export const TARGET_LENGTH_METRES = 4.35;

/** Anything outside this band is not a road car, so it gets rescaled. */
const PLAUSIBLE_LENGTH = { min: 1, max: 15 };

/** Picks the unit scale that puts the vehicle nearest a compact car length. */
export function inferUnitScale(lengthUnits: number): {
  scale: number;
  label: string;
  metres: number;
  confident: boolean;
  /** True when the asset was too small or too large to be a car and was resized. */
  rescaled: boolean;
} {
  if (!Number.isFinite(lengthUnits) || lengthUnits <= 0) {
    return { scale: 1, label: 'unknown units', metres: 0, confident: false, rescaled: false };
  }
  let best = UNIT_GUESSES[0];
  let bestMetres = lengthUnits;
  let bestError = Math.abs(lengthUnits - TARGET_LENGTH_METRES);
  for (const guess of UNIT_GUESSES) {
    const metres = lengthUnits * guess.factor;
    const error = Math.abs(metres - TARGET_LENGTH_METRES);
    if (error < bestError) {
      best = guess;
      bestMetres = metres;
      bestError = error;
    }
  }
  const confident = bestMetres > 2.6 && bestMetres < 7.5;
  /*
   * Toy scales and unit-less exports land outside anything car-sized. Scaling
   * them to a compact car keeps print math, panel areas, and the Blender stage
   * meaningful; the import note says so and the model can be re-imported.
   */
  const rescaled =
    !confident && (bestMetres < PLAUSIBLE_LENGTH.min || bestMetres > PLAUSIBLE_LENGTH.max);
  const scale = rescaled ? best.factor * (TARGET_LENGTH_METRES / bestMetres) : best.factor;
  return {
    scale,
    label: best.label,
    metres: rescaled ? TARGET_LENGTH_METRES : bestMetres,
    confident,
    rescaled,
  };
}
