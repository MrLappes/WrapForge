import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PanelDefinition, PanelMap, RenderCamera } from '../../lib/project/schema';
import type { Surface } from '../../lib/vehicle/surfaces';

export const ACCENT = 0xff7a45;
export const ACCENT_CSS = '#ff7a45';

export type WrapMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

export interface CameraTween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetFrom: THREE.Vector3;
  targetTo: THREE.Vector3;
  start: number;
  duration: number;
}

export interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  car: THREE.Group;
  wrapMeshes: WrapMesh[];
  bodyMeshes: THREE.Mesh[];
  allMeshes: THREE.Object3D[];
  edges: Map<string, THREE.LineSegments>;
  overlays: Map<string, THREE.Mesh>;
  panelLookup: Map<string, Int16Array>;
  surfaces: Map<string, Surface>;
  panels: PanelDefinition[];
  generic: boolean;
  modelSize: THREE.Vector3;
  modelCenter: THREE.Vector3;
  animation: number;
  selectionOutline: THREE.LineSegments | null;
  hoverOverlay: THREE.Mesh | null;
  textureLoader: THREE.TextureLoader;
  bodyTexture: THREE.CanvasTexture | null;
  bodyTextureCanvas: HTMLCanvasElement | null;
  paintActive: boolean;
  cameraTween: CameraTween | null;
}

export function cameraDirection(preset: RenderCamera): THREE.Vector3 {
  switch (preset) {
    case 'front':
      return new THREE.Vector3(1, 0.25, 0);
    case 'rear':
      return new THREE.Vector3(-1, 0.25, 0);
    case 'left':
      return new THREE.Vector3(0, 0.22, 1);
    case 'right':
      return new THREE.Vector3(0, 0.22, -1);
    case 'top':
      return new THREE.Vector3(0.001, 1, 0.001);
    case 'three-quarter-rear':
      return new THREE.Vector3(-1.05, 0.48, -1);
    case 'three-quarter-front':
    default:
      return new THREE.Vector3(1.05, 0.48, -1);
  }
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Builds a highlight mesh from a panel's triangle runs. Imported models are
 * usually a single mesh, so panels cannot be separate objects.
 */
export function panelOverlayGeometry(
  panelId: string,
  map: PanelMap,
  surfaces: Map<string, Surface>,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const slot = map.order.indexOf(panelId);
  if (slot < 0) return null;
  for (const mesh of map.meshes) {
    const surface = surfaces.get(mesh.objectName);
    if (!surface) continue;
    const binary = atob(mesh.triangles);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const limit = Math.min(surface.triangleCount, bytes.length);
    for (let triangle = 0; triangle < limit; triangle += 1) {
      if (bytes[triangle] !== slot) continue;
        const offset = triangle * 9;
        const a: Point3 = {
          x: surface.positions[offset],
          y: surface.positions[offset + 1],
          z: surface.positions[offset + 2],
        };
        const b: Point3 = {
          x: surface.positions[offset + 3],
          y: surface.positions[offset + 4],
          z: surface.positions[offset + 5],
        };
        const c: Point3 = {
          x: surface.positions[offset + 6],
          y: surface.positions[offset + 7],
          z: surface.positions[offset + 8],
        };
        const normal = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).cross(
          new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z),
        );
        if (normal.lengthSq() > 1e-12) normal.normalize().multiplyScalar(0.004);
        positions.push(
          a.x + normal.x,
          a.y + normal.y,
          a.z + normal.z,
          b.x + normal.x,
          b.y + normal.y,
          b.z + normal.z,
          c.x + normal.x,
          c.y + normal.y,
          c.z + normal.z,
        );
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function applyPaint(state: SceneState, paintColor: string): void {
  for (const mesh of state.wrapMeshes) {
    if (mesh.userData.hasTexture) continue;
    mesh.material.color.set(paintColor);
  }
}

export function applyTextures(state: SceneState, textures: ReadonlyMap<string, string>): void {
  for (const mesh of state.wrapMeshes) {
    const source = textures.get(mesh.userData.panelId as string);
    const existing = mesh.material.map;
    if (!source) {
      if (existing) {
        existing.dispose();
        mesh.material.map = null;
        mesh.material.needsUpdate = true;
      }
      mesh.userData.hasTexture = false;
      continue;
    }
    if (mesh.userData.textureSource === source) continue;
    const texture = state.textureLoader.load(source);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    if (existing) existing.dispose();
    mesh.material.map = texture;
    mesh.material.color.set('#ffffff');
    mesh.material.needsUpdate = true;
    mesh.userData.hasTexture = true;
    mesh.userData.textureSource = source;
  }
}

/** Applies the composed livery atlas to every body mesh of an imported model. */
export function applyBodyTexture(state: SceneState, canvas: HTMLCanvasElement | null): void {
  if (state.bodyTextureCanvas === canvas && state.bodyTexture) {
    state.bodyTexture.needsUpdate = true;
    return;
  }
  state.bodyTexture?.dispose();
  state.bodyTextureCanvas = canvas;
  state.bodyTexture = null;
  if (!canvas) return;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  state.bodyTexture = texture;
  for (const mesh of state.bodyMeshes) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.color.set('#ffffff');
    material.needsUpdate = true;
  }
}

export function setPaintActive(state: SceneState, active: boolean): void {
  state.paintActive = active;
  state.controls.enabled = !active;
  state.renderer.domElement.style.cursor = active ? 'crosshair' : 'grab';
  if (!active) {
    if (state.hoverOverlay) state.hoverOverlay.visible = false;
    for (const overlay of state.overlays.values()) overlay.visible = false;
  }
}

export function applyHover(state: SceneState, panelId: string | null): void {
  if (state.paintActive) return;
  for (const [id, overlay] of state.overlays) {
    overlay.visible = id === panelId;
  }
}

export function applySelection(
  state: SceneState,
  panelId: string | null,
  showAllOverlays = false,
): void {
  if (state.selectionOutline) {
    state.selectionOutline.removeFromParent();
    state.selectionOutline.geometry.dispose();
    (state.selectionOutline.material as THREE.Material).dispose();
    state.selectionOutline = null;
  }
  for (const mesh of state.wrapMeshes) {
    const selected = mesh.userData.panelId === panelId;
    mesh.material.emissive.set(selected ? ACCENT : '#000000');
    mesh.material.emissiveIntensity = selected ? 0.16 : 0;
  }
  if (state.generic) {
    for (const [id, overlay] of state.overlays) {
      const selected = id === panelId;
      overlay.visible = selected || showAllOverlays;
      const material = overlay.material as THREE.MeshBasicMaterial;
      material.color.set(selected ? ACCENT : '#7fb4ff');
      material.opacity = selected ? 0.34 : 0.14;
    }
    return;
  }
  if (!panelId) return;
  const mesh = state.wrapMeshes.find((item) => item.userData.panelId === panelId);
  if (!mesh) return;
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 18),
    new THREE.LineBasicMaterial({
      color: ACCENT,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  outline.renderOrder = 5;
  mesh.add(outline);
  state.selectionOutline = outline;
}

export function applyIsolation(state: SceneState, panelId: string | null): void {
  if (!panelId) {
    for (const object of state.allMeshes) object.visible = true;
    return;
  }
  if (state.generic) {
    for (const object of state.allMeshes) object.visible = true;
    return;
  }
  for (const object of state.allMeshes) {
    if (!(object instanceof THREE.Mesh)) continue;
    object.visible = object.userData.panelId === panelId;
  }
  for (const edge of state.edges.values()) {
    edge.visible = edge.parent?.visible === true;
  }
}

export function fitRadius(state: SceneState, panelId: string | null): number {
  if (!panelId) return state.modelSize.length() * 0.52;
  const overlay = state.overlays.get(panelId);
  if (overlay) {
    const box = new THREE.Box3().setFromObject(overlay);
    return Math.max(box.getSize(new THREE.Vector3()).length() * 0.62, 0.35);
  }
  const mesh = state.wrapMeshes.find((item) => item.userData.panelId === panelId);
  if (!mesh) return state.modelSize.length() * 0.52;
  const box = new THREE.Box3().setFromObject(mesh);
  return Math.max(box.getSize(new THREE.Vector3()).length() * 0.62, 0.35);
}

export function panelCenter(state: SceneState, panelId: string): THREE.Vector3 {
  const overlay = state.overlays.get(panelId);
  if (overlay) {
    const box = new THREE.Box3().setFromObject(overlay);
    if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
  }
  const mesh = state.wrapMeshes.find((item) => item.userData.panelId === panelId);
  if (!mesh) return state.modelCenter.clone();
  return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
}

export function disposeGroup(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        standard.map?.dispose();
        material.dispose();
      }
    } else if (object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}
