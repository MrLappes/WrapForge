import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PanelDefinition, PanelMap, RenderCamera } from '../../lib/project/schema';
import type { LiveryScene, StrokeStyle } from '../../lib/livery/render';
import { normalizeVehicle } from '../../lib/vehicle/normalize';
import { collectSurfaces, surfaceBox } from '../../lib/vehicle/surfaces';
import { trianglePanelIndex } from '../../lib/vehicle/detect';
import {
  ACCENT_CSS,
  applyBodyTexture,
  applyHover,
  applyIsolation,
  applyPaint,
  applySelection,
  applyTextures,
  cameraDirection,
  disposeGroup,
  easeInOut,
  fitRadius,
  panelCenter,
  panelOverlayGeometry,
  setPaintActive,
  type SceneState,
  type WrapMesh,
} from './vehicleScene';

export interface ViewportHandle {
  capture(): string | null;
  resetView(): void;
  fitPanel(panelId: string | null): void;
}

export type PaintPhase = 'start' | 'move' | 'end';

export interface BodyTexture {
  canvas: HTMLCanvasElement | null;
  version: number;
}

export interface VehicleViewportProps {
  modelUrl: string | null;
  paintColor: string;
  panelTextures: ReadonlyMap<string, string>;
  panels: PanelDefinition[];
  panelMap: PanelMap | null;
  bodyTexture: BodyTexture;
  paintMode: boolean;
  paintStyle: StrokeStyle;
  selectedPanelId: string | null;
  isolatedPanelId: string | null;
  showGrid: boolean;
  showPanelEdges: boolean;
  cameraPreset: RenderCamera;
  onSelectPanel: (panelId: string | null) => void;
  onPaintPoint: (u: number, v: number, phase: PaintPhase) => void;
  onSceneReady: (scene: LiveryScene | null) => void;
  onStatus?: (status: string) => void;
}

export const VehicleViewport = forwardRef<ViewportHandle, VehicleViewportProps>(
  function VehicleViewport(props, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const stateRef = useRef<SceneState | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const setView = useCallback((preset: RenderCamera, panelId?: string | null) => {
      const state = stateRef.current;
      if (!state) return;
      const radius = fitRadius(state, panelId ?? null);
      const target = panelId ? panelCenter(state, panelId) : state.modelCenter.clone();
      const direction = cameraDirection(preset).normalize();
      const distance = (radius / Math.tan((state.camera.fov * Math.PI) / 360)) * 1.35;
      const to = target.clone().add(direction.multiplyScalar(Math.max(distance, 0.8)));
      if (propsRef.current.cameraPreset === 'top') state.controls.maxPolarAngle = Math.PI;
      state.cameraTween = {
        from: state.camera.position.clone(),
        to,
        targetFrom: state.controls.target.clone(),
        targetTo: target,
        start: performance.now(),
        duration: 520,
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        capture() {
          const state = stateRef.current;
          if (!state) return null;
          state.renderer.render(state.scene, state.camera);
          return state.renderer.domElement.toDataURL('image/png');
        },
        resetView() {
          setView(propsRef.current.cameraPreset);
        },
        fitPanel(panelId: string | null) {
          setView(propsRef.current.cameraPreset, panelId);
        },
      }),
      [setView],
    );

    useEffect(() => {
      const setupScene = (): (() => void) => {
      const container = containerRef.current;
      if (!container) return () => {};

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0c0e11');
      scene.fog = new THREE.Fog('#0c0e11', 18, 42);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;

      const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
      camera.position.set(5.4, 2.8, -6.4);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 1.2;
      controls.maxDistance = 30;
      controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.target.set(0, 0.7, 0);

      const key = new THREE.DirectionalLight('#fff4e6', 3.6);
      key.position.set(5, 8, -4);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 30;
      key.shadow.camera.left = -8;
      key.shadow.camera.right = 8;
      key.shadow.camera.top = 8;
      key.shadow.camera.bottom = -8;
      key.shadow.bias = -0.0005;
      scene.add(key);

      const fill = new THREE.DirectionalLight('#7fb4ff', 1.35);
      fill.position.set(-6, 4, 5);
      scene.add(fill);

      const rim = new THREE.DirectionalLight('#ffd2a8', 2.2);
      rim.position.set(-3, 3, -7);
      scene.add(rim);

      scene.add(new THREE.HemisphereLight('#9db7d5', '#16110d', 1.1));

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(24, 96),
        new THREE.MeshStandardMaterial({ color: '#101318', roughness: 0.42, metalness: 0.05 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);

      const grid = new THREE.GridHelper(24, 48, '#3a4048', '#22262c');
      grid.position.y = 0.002;
      const gridMaterial = grid.material as THREE.LineBasicMaterial;
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.55;
      scene.add(grid);

      const car = new THREE.Group();
      scene.add(car);

      const state: SceneState = {
        renderer,
        scene,
        camera,
        controls,
        car,
        wrapMeshes: [],
        bodyMeshes: [],
        allMeshes: [],
        edges: new Map(),
        overlays: new Map(),
        panelLookup: new Map(),
        surfaces: new Map(),
        panels: [],
        generic: false,
        modelSize: new THREE.Vector3(4.3, 1.5, 1.8),
        modelCenter: new THREE.Vector3(0, 0.75, 0),
        animation: 0,
        selectionOutline: null,
        hoverOverlay: null,
        textureLoader: new THREE.TextureLoader(),
        bodyTexture: null,
        bodyTextureCanvas: null,
        paintActive: false,
        cameraTween: null,
      };
      stateRef.current = state;

      const resize = () => {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerStart: { x: number; y: number; time: number } | null = null;
      let painting = false;

      const pick = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const targets = state.generic ? state.bodyMeshes : state.wrapMeshes;
        return raycaster.intersectObjects(targets, false)[0];
      };

      const panelIdAt = (hit: THREE.Intersection | undefined): string | null => {
        if (!hit) return null;
        if (state.generic) {
          const surface = state.surfaces.get(hit.object.name);
          const lookup = surface ? state.panelLookup.get(surface.objectName) : undefined;
          const face = typeof hit.faceIndex === 'number' ? hit.faceIndex : -1;
          if (lookup && face >= 0) {
            const index = lookup[face];
            if (index >= 0) return state.panels[index]?.id ?? null;
          }
          return null;
        }
        const panelId = hit.object.userData.panelId;
        return typeof panelId === 'string' ? panelId : null;
      };

      const onPointerDown = (event: PointerEvent) => {
        if (state.paintActive && event.button === 0) {
          const hit = pick(event);
          if (hit?.uv) {
            painting = true;
            renderer.domElement.setPointerCapture(event.pointerId);
            propsRef.current.onPaintPoint(hit.uv.x, hit.uv.y, 'start');
          }
          return;
        }
        pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
      };

      const onPointerUp = (event: PointerEvent) => {
        if (painting) {
          painting = false;
          if (renderer.domElement.hasPointerCapture(event.pointerId)) {
            renderer.domElement.releasePointerCapture(event.pointerId);
          }
          propsRef.current.onPaintPoint(0, 0, 'end');
          return;
        }
        if (!pointerStart) return;
        const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4;
        const elapsed = performance.now() - pointerStart.time;
        pointerStart = null;
        if (moved || elapsed > 700) return;
        propsRef.current.onSelectPanel(panelIdAt(pick(event)));
      };

      const onPointerMove = (event: PointerEvent) => {
        if (painting) {
          const hit = pick(event);
          if (hit?.uv) propsRef.current.onPaintPoint(hit.uv.x, hit.uv.y, 'move');
          return;
        }
        if (state.paintActive) return;
        const hit = pick(event);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        applyHover(state, panelIdAt(hit));
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointermove', onPointerMove);

      const animate = () => {
        state.animation = requestAnimationFrame(animate);
        const now = performance.now();
        if (state.cameraTween) {
          const t = Math.min(1, (now - state.cameraTween.start) / state.cameraTween.duration);
          const eased = easeInOut(t);
          camera.position.lerpVectors(state.cameraTween.from, state.cameraTween.to, eased);
          controls.target.lerpVectors(
            state.cameraTween.targetFrom,
            state.cameraTween.targetTo,
            eased,
          );
          if (t >= 1) state.cameraTween = null;
        }
        if (state.paintActive && state.bodyTexture) state.bodyTexture.needsUpdate = true;
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(state.animation);
        observer.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        controls.dispose();
        if (state.selectionOutline) {
          state.selectionOutline.geometry.dispose();
          (state.selectionOutline.material as THREE.Material).dispose();
        }
        state.bodyTexture?.dispose();
        disposeGroup(car);
        ground.geometry.dispose();
        (ground.material as THREE.Material).dispose();
        grid.geometry.dispose();
        (grid.material as THREE.Material).dispose();
        pmrem.dispose();
        envTexture.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
        stateRef.current = null;
      };
      };

      try {
        return setupScene();
      } catch (setupError) {
        setLoading(false);
        setError(
          setupError instanceof Error
            ? `${setupError.message} — this system could not create a WebGL context, so the 3D viewport is unavailable.`
            : 'The 3D viewport could not start on this system.',
        );
        return undefined;
      }
    }, []);

    useEffect(() => {
      const state = stateRef.current;
      if (!state || !props.modelUrl) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);
      props.onSceneReady(null);
      props.onStatus?.('Loading vehicle geometry…');

      const buildGenericScene = (root: THREE.Object3D) => {
        normalizeVehicle(root);
        const surfaces = collectSurfaces(root);
        state.generic = true;
        state.panels = propsRef.current.panels;
        state.surfaces = new Map(surfaces.map((surface) => [surface.objectName, surface]));
        state.bodyMeshes = [];
        const panelMap = propsRef.current.panelMap;
        const anyUv = surfaces.some((surface) => surface.isBody && surface.uvs);
        for (const surface of surfaces) {
          const mesh = surface.object as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (surface.isBody && (!anyUv || surface.uvs)) {
            state.bodyMeshes.push(mesh);
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              material.side = THREE.FrontSide;
              material.needsUpdate = true;
            }
          }
          if (panelMap) {
            state.panelLookup.set(
              surface.objectName,
              trianglePanelIndex(panelMap, surface.objectName, surface.triangleCount),
            );
          }
        }
        state.car.add(root);

        for (const panel of propsRef.current.panels) {
          if (!panelMap) continue;
          const geometry = panelOverlayGeometry(panel.id, panelMap, state.surfaces);
          if (!geometry) continue;
          const overlay = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: '#7fb4ff',
              transparent: true,
              opacity: 0.16,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          overlay.visible = false;
          overlay.renderOrder = 3;
          overlay.userData.panelId = panel.id;
          state.car.add(overlay);
          state.overlays.set(panel.id, overlay);
        }

        const body = surfaces.filter((surface) => surface.isBody && surface.uvs);
        if (body.length > 0) {
          const box = surfaceBox(body);
          propsRef.current.onSceneReady({
            surfaces: body.map((surface) => ({
              positions: surface.positions,
              uvs: surface.uvs as Float32Array,
            })),
            bounds: {
              minX: box.min.x,
              minY: box.min.y,
              minZ: box.min.z,
              maxX: box.max.x,
              maxY: box.max.y,
              maxZ: box.max.z,
            },
          });
        }
      };

      const buildPanelScene = (root: THREE.Object3D) => {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.userData.wrapable !== true) return;
          const panelId =
            typeof object.userData.panelId === 'string'
              ? object.userData.panelId
              : object.name.replace(/^WF_/, '');
          object.userData.panelId = panelId;
          object.material = new THREE.MeshStandardMaterial({
            color: propsRef.current.paintColor,
            roughness: 0.42,
            metalness: 0.08,
            side: THREE.DoubleSide,
          });
          state.wrapMeshes.push(object as WrapMesh);
          const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(object.geometry, 24),
            new THREE.LineBasicMaterial({
              color: '#ff9a70',
              transparent: true,
              opacity: 0.28,
              depthTest: true,
            }),
          );
          edge.renderOrder = 2;
          object.add(edge);
          edge.visible = propsRef.current.showPanelEdges;
          state.edges.set(panelId, edge);
        });
        state.car.add(root);
      };

      const loader = new GLTFLoader();
      loader.load(
        props.modelUrl,
        (gltf) => {
          if (cancelled || !stateRef.current) return;
          disposeGroup(state.car);
          state.car.clear();
          state.wrapMeshes = [];
          state.bodyMeshes = [];
          state.allMeshes = [];
          state.edges.clear();
          state.overlays.clear();
          state.panelLookup.clear();
          state.surfaces.clear();
          state.generic = false;
          state.bodyTexture = null;
          state.bodyTextureCanvas = null;
          state.selectionOutline = null;

          const root = gltf.scene;
          const generic = Boolean(propsRef.current.panelMap);
          if (generic) buildGenericScene(root);
          else buildPanelScene(root);

          root.traverse((object) => {
            if (object instanceof THREE.Mesh) state.allMeshes.push(object);
          });

          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          state.modelSize.copy(size);
          state.modelCenter.copy(center);
          state.camera.near = Math.max(0.02, size.length() / 500);
          state.camera.far = Math.max(100, size.length() * 40);
          state.camera.updateProjectionMatrix();
          state.controls.maxDistance = Math.max(30, size.length() * 6);

          applyPaint(state, propsRef.current.paintColor);
          applyTextures(state, propsRef.current.panelTextures);
          applyBodyTexture(state, propsRef.current.bodyTexture.canvas);
          applySelection(
            state,
            propsRef.current.selectedPanelId,
            propsRef.current.showPanelEdges,
          );
          applyIsolation(state, propsRef.current.isolatedPanelId);
          setPaintActive(state, propsRef.current.paintMode);
          setView(propsRef.current.cameraPreset);
          setLoading(false);
          props.onStatus?.(generic ? 'Vehicle ready (texture livery)' : 'Vehicle ready');
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            props.onStatus?.(`Loading vehicle geometry… ${percent}%`);
          }
        },
        (loadError) => {
          if (cancelled) return;
          setLoading(false);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'The vehicle model could not be loaded.',
          );
          props.onStatus?.('Vehicle failed to load');
        },
      );
      return () => {
        cancelled = true;
      };
      // The viewport intentionally loads once per model URL. Other props are
      // applied through the effects below to avoid rebuilding the scene.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.modelUrl, setView]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      applyPaint(state, props.paintColor);
    }, [props.paintColor]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      applyTextures(state, props.panelTextures);
    }, [props.panelTextures]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      applyBodyTexture(state, props.bodyTexture.canvas);
    }, [props.bodyTexture.canvas, props.bodyTexture.version]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      setPaintActive(state, props.paintMode);
    }, [props.paintMode]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      applySelection(state, props.selectedPanelId, props.showPanelEdges);
    }, [props.selectedPanelId, props.showPanelEdges]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      applyIsolation(state, props.isolatedPanelId);
    }, [props.isolatedPanelId]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      for (const edge of state.edges.values()) edge.visible = props.showPanelEdges;
    }, [props.showPanelEdges]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      const grid = state.scene.children.find(
        (child) => child instanceof THREE.GridHelper,
      ) as THREE.GridHelper | undefined;
      if (grid) grid.visible = props.showGrid;
    }, [props.showGrid]);

    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      setView(props.cameraPreset, props.isolatedPanelId);
    }, [props.cameraPreset, props.isolatedPanelId, setView]);

    return (
      <div className="viewport" ref={containerRef} aria-label="3D vehicle viewport">
        {loading && (
          <div className="viewport-overlay">
            <div className="spinner" />
            <span>Loading vehicle…</span>
          </div>
        )}
        {error && (
          <div className="viewport-overlay viewport-error" role="alert">
            <strong>Could not load the vehicle</strong>
            <span>{error}</span>
          </div>
        )}
        <div className="viewport-hint" aria-hidden="true">
          <span style={{ color: ACCENT_CSS }}>●</span>{' '}
          {props.paintMode
            ? 'Paint mode: drag on the body to paint · P to leave'
            : 'Drag to orbit · Scroll to zoom · Click a wrap panel'}
        </div>
        {props.paintMode ? (
          <div className="paint-badge">
            <span className="paint-dot" style={{ background: props.paintStyle.color }} />
            {props.paintStyle.erase ? 'Erasing' : 'Painting'}
          </div>
        ) : null}
      </div>
    );
  },
);
