import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  classifyTriangle,
  decodePanelBytes,
  detectPanels,
  panelTriangles,
  trianglePanelIndex,
} from './detect';
import { inferUnitScale, type Surface } from './surfaces';

const BOX = new THREE.Box3(new THREE.Vector3(-2.2, 0, -0.9), new THREE.Vector3(2.2, 1.5, 0.9));

describe('vehicle analysis', () => {
  it('classifies roof, bonnet and boot surfaces by height and position', () => {
    const up = new THREE.Vector3(0, 1, 0);
    expect(classifyTriangle(new THREE.Vector3(0, 1.45, 0), up, BOX).key).toBe('roof');
    expect(classifyTriangle(new THREE.Vector3(1.6, 0.95, 0), up, BOX).key).toBe('hood');
    expect(classifyTriangle(new THREE.Vector3(-1.9, 0.9, 0), up, BOX).key).toBe('trunk');
  });

  it('classifies side surfaces into doors, fenders and quarters per side', () => {
    const left = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(0, 0, -1);
    expect(classifyTriangle(new THREE.Vector3(0.9, 0.7, 0.9), left, BOX).key).toBe(
      'door-front-L',
    );
    expect(classifyTriangle(new THREE.Vector3(-0.4, 0.7, 0.9), left, BOX).key).toBe('door-rear-L');
    expect(classifyTriangle(new THREE.Vector3(-1.6, 0.7, -0.9), right, BOX).key).toBe(
      'quarter-R',
    );
    expect(classifyTriangle(new THREE.Vector3(1.9, 0.6, -0.9), right, BOX).key).toBe('fender-R');
  });

  it('classifies end caps as bumpers', () => {
    expect(classifyTriangle(new THREE.Vector3(2.15, 0.4, 0), new THREE.Vector3(1, 0, 0), BOX).key).toBe(
      'bumper-front',
    );
    expect(classifyTriangle(new THREE.Vector3(-2.15, 0.4, 0), new THREE.Vector3(-1, 0, 0), BOX).key).toBe(
      'bumper-rear',
    );
  });

  it('leaves glazing and sills uncategorised', () => {
    expect(classifyTriangle(new THREE.Vector3(0, 1.3, 0.9), new THREE.Vector3(0, 0, 1), BOX).key).toBe(
      'body',
    );
    expect(classifyTriangle(new THREE.Vector3(0, 0.1, 0.9), new THREE.Vector3(0, 0, 1), BOX).key).toBe(
      'body',
    );
  });

  it('keeps the panel map compact and reversible', () => {
    const surface = boxSurface();
    const result = detectPanels([surface]);
    expect(result.panelMap).not.toBeNull();
    const map = result.panelMap!;
    const mesh = map.meshes[0];
    expect(decodePanelBytes(mesh.triangles)).toHaveLength(surface.triangleCount);
    const ids = new Set(panelTriangles(map, map.order[0]));
    expect(ids.size).toBeGreaterThan(0);
    const lookup = trianglePanelIndex(map, mesh.objectName, surface.triangleCount);
    const panelId = map.order[0];
    const slot = map.order.indexOf(panelId);
    const covered = [...lookup].filter((value) => value === slot).length;
    expect(covered).toBe(ids.size);
  });

  it('derives triangle lookups from the panel map', () => {
    const map = {
      order: ['p-door', 'p-hood'],
      meshes: [
        {
          objectName: 'body',
          // 0,0,none,1,none
          triangles: btoa(String.fromCharCode(0, 0, 254, 1, 254)),
        },
      ],
    };
    const lookup = trianglePanelIndex(map, 'body', 5);
    expect([...lookup]).toEqual([0, 0, -1, 1, -1]);
    expect(panelTriangles(map, 'p-hood')).toEqual([3]);
    expect(panelTriangles(map, 'p-door')).toEqual([0, 1]);
    expect(panelTriangles(map, 'missing')).toEqual([]);
  });

  it('infers model units from a plausible car length', () => {
    expect(inferUnitScale(4.35).label).toBe('metres');
    expect(inferUnitScale(435).label).toBe('centimetres');
    expect(inferUnitScale(4350).label).toBe('millimetres');
    expect(inferUnitScale(171).label).toBe('inches');
    expect(inferUnitScale(4350).metres).toBeCloseTo(4.35, 2);
    expect(inferUnitScale(0.2).confident).toBe(false);
  });

  it('rescales assets that are far too small or too large to be a car', () => {
    const toy = inferUnitScale(0.07);
    expect(toy.rescaled).toBe(true);
    expect(0.07 * toy.scale).toBeCloseTo(4.35, 3);

    const oversized = inferUnitScale(20000);
    expect(oversized.rescaled).toBe(true);
    expect(20000 * oversized.scale).toBeCloseTo(4.35, 3);

    expect(inferUnitScale(171).rescaled).toBe(false);
    expect(inferUnitScale(12).rescaled).toBe(false);
  });
});

function boxSurface(): Surface {
  const geometry = new THREE.BoxGeometry(4, 1.4, 1.8, 10, 3, 3);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  const positions = new Float32Array(triangleCount * 9);
  const uvs = new Float32Array(triangleCount * 6);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
      positions[triangle * 9 + corner * 3] = position.getX(vertex);
      positions[triangle * 9 + corner * 3 + 1] = position.getY(vertex) + 0.7;
      positions[triangle * 9 + corner * 3 + 2] = position.getZ(vertex);
      uvs[triangle * 6 + corner * 2] = uv.getX(vertex);
      uvs[triangle * 6 + corner * 2 + 1] = uv.getY(vertex);
    }
  }
  return {
    objectName: 'body',
    object: new THREE.Mesh(geometry),
    positions,
    uvs,
    triangleCount,
    isBody: true,
    materialNames: [],
  };
}


describe('panel detection', () => {
  it('segments a closed shell into several named panels', () => {
    const result = detectPanels([boxSurface()]);
    expect(result.panels.length).toBeGreaterThanOrEqual(3);
    expect(result.panelMap).not.toBeNull();
    expect(result.panelMap?.order).toHaveLength(result.panels.length);
    expect(result.panels.every((panel) => (panel.confidence ?? 0) > 0)).toBe(true);
    expect(result.coverage).toBeGreaterThan(0);
  });

  it('refuses models without paintable bodywork', () => {
    const surface = boxSurface();
    surface.isBody = false;
    expect(() => detectPanels([surface])).toThrow(/paintable bodywork/i);
  });
});
