import * as THREE from 'three';
import {
  collectSurfaces,
  inferUnitScale,
  TARGET_LENGTH_METRES,
  surfaceBox,
  type Surface,
  type VehicleTransform,
} from './surfaces';

interface AxisFrame {
  forward: THREE.Vector3;
  up: THREE.Vector3;
  left: THREE.Vector3;
}

/**
 * Rotation whose rows are the model-space basis vectors, so that the result
 * reads as forward=+X, up=+Y, left=+Z (the convention the camera presets use).
 */
function rotationFor(frame: AxisFrame): THREE.Quaternion {
  const basis = new THREE.Matrix4().makeBasis(frame.forward, frame.up, frame.left);
  return new THREE.Quaternion().setFromRotationMatrix(basis.transpose());
}

function guessAxes(size: THREE.Vector3): AxisFrame {
  const entries = [
    { axis: new THREE.Vector3(1, 0, 0), value: size.x },
    { axis: new THREE.Vector3(0, 1, 0), value: size.y },
    { axis: new THREE.Vector3(0, 0, 1), value: size.z },
  ].sort((left, right) => left.value - right.value);
  const up = entries[0].axis.clone();
  const forward = entries[2].axis.clone();
  const left = forward.clone().cross(up).normalize();
  return { forward, up, left };
}

function applyTransform(root: THREE.Object3D, matrix: THREE.Matrix4): void {
  root.matrix.copy(matrix);
  root.matrixAutoUpdate = false;
  root.updateMatrixWorld(true);
}

function groundMatrix(root: THREE.Object3D): THREE.Matrix4 {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  return new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
}

/**
 * Guesses which end of the car is the front by measuring how far the low deck
 * surfaces run from each end towards the middle. Bonnets are longer than boots
 * on most cars, which is right often enough to be useful.
 */
function guessForward(surfaces: Surface[], box: THREE.Box3): { forwardIsPlusX: boolean; confidence: number } {
  const buckets = new Array<number>(48).fill(0);
  const spanX = Math.max(1e-6, box.max.x - box.min.x);
  const height = Math.max(1e-6, box.max.y - box.min.y);
  for (const surface of surfaces) {
    if (!surface.isBody) continue;
    for (let i = 0; i < surface.positions.length; i += 3) {
      const x = surface.positions[i];
      const y = surface.positions[i + 1];
      const heightFraction = (y - box.min.y) / height;
      if (heightFraction > 0.92) continue;
      const along = (x - box.min.x) / spanX;
      const bucket = Math.min(47, Math.max(0, Math.round(along * 47)));
      if (heightFraction > buckets[bucket]) buckets[bucket] = heightFraction;
    }
  }
  const low = 0.72;
  let fromRear = 0;
  while (fromRear < 48 && buckets[fromRear] < low) fromRear += 1;
  let fromFront = 0;
  while (fromFront < 48 && buckets[47 - fromFront] < low) fromFront += 1;
  const confidence = Math.min(0.9, 0.4 + Math.abs(fromRear - fromFront) / 24);
  return { forwardIsPlusX: fromFront > fromRear, confidence };
}

export interface NormalizedVehicle {
  transform: VehicleTransform;
  surfaces: Surface[];
  warnings: string[];
}

/**
 * Rotates, scales (to metres) and grounds an arbitrary vehicle model, then
 * returns the world-space triangle soup. Mutates `root`'s matrix.
 */
export function normalizeVehicle(root: THREE.Object3D): NormalizedVehicle {
  const warnings: string[] = [];
  root.updateWorldMatrix(true, true);
  const rawBox = new THREE.Box3().setFromObject(root);
  if (rawBox.isEmpty()) {
    throw new Error('The model contains no visible geometry.');
  }
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const frame = guessAxes(rawSize);
  const rotation = rotationFor(frame);

  const rawCenter = rawBox.getCenter(new THREE.Vector3());
  const initial = new THREE.Matrix4()
    .makeTranslation(-rawCenter.x, -rawBox.min.y, -rawCenter.z)
    .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  applyTransform(root, initial);
  applyTransform(root, groundMatrix(root).multiply(root.matrix));

  const lengthUnits = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).x;
  const units = inferUnitScale(lengthUnits);
  if (units.rescaled) {
    warnings.push(
      `The model is ${lengthUnits.toFixed(2)} ${units.label} long, which is not car-sized, so it was scaled to ${TARGET_LENGTH_METRES} m. Import it again after scaling it in your 3D tool if that is wrong.`,
    );
  } else if (!units.confident) {
    warnings.push(
      `The model measures ${lengthUnits.toFixed(2)} ${units.label}, so WrapForge assumed ${units.metres.toFixed(2)} m long. Re-import it after scaling it in your 3D tool if that is wrong.`,
    );
  }
  applyTransform(
    root,
    new THREE.Matrix4().makeScale(units.scale, units.scale, units.scale).multiply(root.matrix),
  );

  let surfaces = collectSurfaces(root);
  let box = surfaceBox(surfaces);
  const guess = guessForward(surfaces, box);
  if (!guess.forwardIsPlusX) {
    applyTransform(root, new THREE.Matrix4().makeRotationY(Math.PI).multiply(root.matrix));
    surfaces = collectSurfaces(root);
    box = surfaceBox(surfaces);
  }

  const size = box.getSize(new THREE.Vector3());
  return {
    transform: {
      rotation,
      scale: units.scale,
      size: { length: size.x, width: size.z, height: size.y },
      units: units.label,
      confidence: guess.confidence,
    },
    surfaces,
    warnings,
  };
}
