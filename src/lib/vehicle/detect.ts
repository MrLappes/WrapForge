import * as THREE from 'three';
import { NO_PANEL, type PanelCategory, type PanelDefinition, type PanelMap, type PanelSide } from '../project/schema';
import { normalizeVehicle } from './normalize';
import { surfaceBox, type Surface, type VehicleTransform } from './surfaces';

const PANEL_SPECS: Record<
  string,
  { name: string; category: PanelCategory; side: PanelSide }
> = {
  hood: { name: 'Hood', category: 'hood', side: 'center' },
  roof: { name: 'Roof', category: 'roof', side: 'center' },
  trunk: { name: 'Trunk / hatch', category: 'trunk', side: 'center' },
  'door-front-L': { name: 'Left front door', category: 'door', side: 'left' },
  'door-rear-L': { name: 'Left rear door', category: 'door', side: 'left' },
  'door-front-R': { name: 'Right front door', category: 'door', side: 'right' },
  'door-rear-R': { name: 'Right rear door', category: 'door', side: 'right' },
  'fender-L': { name: 'Left front fender', category: 'fender', side: 'left' },
  'fender-R': { name: 'Right front fender', category: 'fender', side: 'right' },
  'quarter-L': { name: 'Left rear quarter', category: 'quarter', side: 'left' },
  'quarter-R': { name: 'Right rear quarter', category: 'quarter', side: 'right' },
  'bumper-front': { name: 'Front bumper', category: 'bumper', side: 'center' },
  'bumper-rear': { name: 'Rear bumper', category: 'bumper', side: 'center' },
  body: { name: 'Body (uncategorised)', category: 'other', side: 'center' },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Rule-based panel guess for a single triangle. The car is normalised to
 * forward=+X, up=+Y, left=+Z, so position and orientation are directly
 * comparable across models.
 */
export function classifyTriangle(
  centroid: THREE.Vector3,
  normal: THREE.Vector3,
  box: THREE.Box3,
): { key: string; score: number } {
  const spanX = Math.max(1e-6, box.max.x - box.min.x);
  const spanY = Math.max(1e-6, box.max.y - box.min.y);
  const t = (centroid.x - box.min.x) / spanX;
  const h = (centroid.y - box.min.y) / spanY;
  const up = Math.abs(normal.y);
  const lateral = Math.abs(normal.z);
  const forward = Math.abs(normal.x);
  const side = centroid.z >= 0 ? 'L' : 'R';

  if (up > 0.6) {
    const score = clamp01((up - 0.55) / 0.4);
    // Position wins over height, but a steeply raked windscreen is also
    // "up facing", so bonnets and boots have to stay below the beltline.
    if (t > 0.7 && h > 0.28 && h < 0.7) return { key: 'hood', score };
    if (t < 0.3 && h > 0.22 && h < 0.75) return { key: 'trunk', score };
    if (h > 0.55) return { key: 'roof', score };
    return { key: 'body', score: 0.2 };
  }
  if (lateral > 0.55) {
    if (h < 0.16 || h > 0.58) return { key: 'body', score: 0.2 };
    const score = clamp01((lateral - 0.5) / 0.45);
    if (t > 0.74) return { key: `fender-${side}`, score };
    if (t > 0.52) return { key: `door-front-${side}`, score };
    if (t > 0.3) return { key: `door-rear-${side}`, score };
    return { key: `quarter-${side}`, score };
  }
  if (forward > 0.5) {
    const score = clamp01((forward - 0.45) / 0.45);
    if (t > 0.86 && h < 0.62) return { key: 'bumper-front', score };
    if (t < 0.14 && h < 0.62) return { key: 'bumper-rear', score };
    return { key: 'body', score: 0.2 };
  }
  return { key: 'body', score: 0.1 };
}

export function encodePanelBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function decodePanelBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Triangle indexes that belong to `panelId`, from a compact panel map. */
export function panelTriangles(map: PanelMap, panelId: string): number[] {
  const slot = map.order.indexOf(panelId);
  if (slot < 0) return [];
  const triangles: number[] = [];
  for (const mesh of map.meshes) {
    const bytes = decodePanelBytes(mesh.triangles);
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] === slot) triangles.push(index);
    }
  }
  return triangles;
}

const AXES: Array<{ axis: 'x' | 'y' | 'z'; sign: 1 | -1; label: PanelDefinition['outwardAxis'] }> = [
  { axis: 'x', sign: 1, label: '+X' },
  { axis: 'x', sign: -1, label: '-X' },
  { axis: 'y', sign: 1, label: '+Y' },
  { axis: 'y', sign: -1, label: '-Y' },
  { axis: 'z', sign: 1, label: '+Z' },
  { axis: 'z', sign: -1, label: '-Z' },
];

function outwardAxisOf(normal: THREE.Vector3): PanelDefinition['outwardAxis'] {
  let best = AXES[0];
  let bestValue = -Infinity;
  for (const entry of AXES) {
    const value = normal[entry.axis] * entry.sign;
    if (value > bestValue) {
      bestValue = value;
      best = entry;
    }
  }
  return best.label;
}

interface Accumulator {
  key: string;
  slot: number;
  scoreSum: number;
  area: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
  normalSum: THREE.Vector3;
}

function panelOrder(category: PanelCategory): number {
  return ['hood', 'roof', 'trunk', 'bumper', 'fender', 'door', 'quarter', 'other'].indexOf(category);
}

export interface PanelDetection {
  panels: PanelDefinition[];
  panelMap: PanelMap | null;
  coverage: number;
  warnings: string[];
}

/**
 * Segments body triangles into named panels. The classifier looks at surface
 * orientation and position along the car; it works on most car models but
 * cannot guarantee panel-perfect accuracy, so the UI asks the user to confirm.
 */
export function detectPanels(surfaces: Surface[]): PanelDetection {
  const allBody = surfaces.filter((surface) => surface.isBody);
  const anyUv = allBody.some((surface) => surface.uvs !== null);
  const body = anyUv ? allBody.filter((surface) => surface.uvs !== null) : allBody;
  if (body.length === 0) {
    throw new Error(
      'No paintable bodywork was found. The model may only contain glass, wheels, or line geometry.',
    );
  }
  const box = surfaceBox(body);
  const accumulators = new Map<string, Accumulator>();
  const assignment = new Map<string, Uint8Array>();
  for (const surface of body) {
    assignment.set(surface.objectName, new Uint8Array(surface.triangleCount).fill(NO_PANEL));
  }
  let nextSlot = 0;
  const warnings: string[] = [];
  let bodyTriangles = 0;
  let classifiedTriangles = 0;

  for (const surface of body) {
    for (let triangle = 0; triangle < surface.triangleCount; triangle += 1) {
      const offset = triangle * 9;
      const ax = surface.positions[offset];
      const ay = surface.positions[offset + 1];
      const az = surface.positions[offset + 2];
      const bx = surface.positions[offset + 3];
      const by = surface.positions[offset + 4];
      const bz = surface.positions[offset + 5];
      const cx = surface.positions[offset + 6];
      const cy = surface.positions[offset + 7];
      const cz = surface.positions[offset + 8];
      const normal = new THREE.Vector3(bx - ax, by - ay, bz - az).cross(
        new THREE.Vector3(cx - ax, cy - ay, cz - az),
      );
      const doubleArea = normal.length();
      if (doubleArea < 1e-10) continue;
      normal.divideScalar(doubleArea);
      const centroid = new THREE.Vector3((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3);
      bodyTriangles += 1;
      const classified = classifyTriangle(centroid, normal, box);
      if (classified.key !== 'body') classifiedTriangles += 1;
      let accumulator = accumulators.get(classified.key);
      if (!accumulator) {
        accumulator = {
          key: classified.key,
          slot: nextSlot,
          scoreSum: 0,
          area: 0,
          min: new THREE.Vector3(Infinity, Infinity, Infinity),
          max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
          normalSum: new THREE.Vector3(),
        };
        accumulators.set(classified.key, accumulator);
        nextSlot += 1;
      }
      accumulator.scoreSum += classified.score;
      accumulator.area += doubleArea / 2;
      accumulator.min.min(centroid);
      accumulator.max.max(centroid);
      accumulator.normalSum.addScaledVector(normal, doubleArea / 2);
      const bytes = assignment.get(surface.objectName);
      if (bytes) bytes[triangle] = accumulator.slot;
    }
  }

  const entries: Array<{ panel: PanelDefinition; slot: number }> = [];
  const usedIds = new Set<string>();
  for (const accumulator of accumulators.values()) {
    let triangles = 0;
    for (const surface of body) {
      const bytes = assignment.get(surface.objectName);
      if (!bytes) continue;
      for (let index = 0; index < bytes.length; index += 1) {
        if (bytes[index] === accumulator.slot) triangles += 1;
      }
    }
    if (triangles < 3) continue;
    const spec = PANEL_SPECS[accumulator.key] ?? PANEL_SPECS.body;
    let id = `p-${accumulator.key}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `p-${accumulator.key}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const extents = accumulator.max.clone().sub(accumulator.min);
    const sorted = [extents.x, extents.y, extents.z].sort((left, right) => right - left);
    // Surfaces are already normalised to metres by normalizeVehicle().
    const area = accumulator.area;
    const confidence = clamp01(
      (accumulator.scoreSum / triangles) * 0.85 + Math.min(1, triangles / 900) * 0.15,
    );
    entries.push({
      slot: accumulator.slot,
      panel: {
        id,
        name: spec.name,
        category: spec.category,
        side: spec.side,
        wrapable: true,
        outwardAxis: outwardAxisOf(accumulator.normalSum.clone().normalize()),
        objectName: body[0]?.objectName ?? 'mesh',
        dimensionsMm: {
          width: Math.max(1, Math.round(sorted[0] * 1000)),
          height: Math.max(1, Math.round(sorted[1] * 1000)),
        },
        areaM2: Number(area.toFixed(4)),
        uv: {
          hasUv: body.some((surface) => surface.uvs !== null),
          layout: 'model-atlas',
          note: 'UV set comes from the imported model; the livery is composited onto it.',
        },
        confidence: Number(confidence.toFixed(2)),
        detection: 'geometry',
      },
    });
  }

  entries.sort(
    (left, right) => panelOrder(left.panel.category) - panelOrder(right.panel.category),
  );
  const panels = entries.map((entry) => entry.panel);
  const slotToIndex = new Map<number, number>();
  entries.forEach((entry, index) => slotToIndex.set(entry.slot, index));

  const meshes: PanelMap['meshes'] = [];
  for (const surface of body) {
    const bytes = assignment.get(surface.objectName);
    if (!bytes) continue;
    const remapped = new Uint8Array(bytes.length).fill(NO_PANEL);
    for (let index = 0; index < bytes.length; index += 1) {
      const next = slotToIndex.get(bytes[index]);
      if (next !== undefined) remapped[index] = next;
    }
    meshes.push({ objectName: surface.objectName, triangles: encodePanelBytes(remapped) });
  }

  const panelMap: PanelMap | null =
    panels.length > 0 && meshes.length > 0 ? { order: panels.map((panel) => panel.id), meshes } : null;

  if (panels.length < 4) {
    warnings.push(
      'Panel detection found only a few regions. The model may be a single closed shell; texture painting still works, but highlights will be coarse.',
    );
  }
  const coverage = bodyTriangles === 0 ? 0 : classifiedTriangles / bodyTriangles;
  return { panels, panelMap, coverage, warnings };
}

export interface VehicleAnalysis {
  transform: VehicleTransform;
  surfaces: Surface[];
  panels: PanelDefinition[];
  panelMap: PanelMap | null;
  coverage: number;
  warnings: string[];
}

/** Full pipeline: normalise the model, then detect and describe its panels. */
export function analyzeVehicle(root: THREE.Object3D): VehicleAnalysis {
  const { transform, surfaces, warnings } = normalizeVehicle(root);
  const detected = detectPanels(surfaces);
  return {
    transform,
    surfaces,
    panels: detected.panels,
    panelMap: detected.panelMap,
    coverage: detected.coverage,
    warnings: [...warnings, ...detected.warnings],
  };
}

/** Panel index per triangle for one mesh, used for picking and highlighting. */
export function trianglePanelIndex(
  map: PanelMap,
  objectName: string,
  triangleCount: number,
): Int16Array {
  const lookup = new Int16Array(triangleCount).fill(-1);
  const mesh = map.meshes.find((entry) => entry.objectName === objectName);
  if (!mesh) return lookup;
  const bytes = decodePanelBytes(mesh.triangles);
  const limit = Math.min(triangleCount, bytes.length);
  for (let index = 0; index < limit; index += 1) {
    lookup[index] = bytes[index] === NO_PANEL ? -1 : bytes[index];
  }
  return lookup;
}
