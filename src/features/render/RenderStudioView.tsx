import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  Camera,
  CircleAlert,
  Clock,
  Cpu,
  FolderOpen,
  ImageDown,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import { VehicleViewport, type ViewportHandle } from '../studio/VehicleViewport';
import { useArtworkImages } from '../studio/useArtworkImages';
import { useBaseTexture, useVehicleModelUrl } from '../studio/useVehicleAssets';
import { useLiveryTexture } from '../studio/useLiveryTexture';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { platform } from '../../lib/platform';
import { registerViewportCapture } from '../../lib/autosave';
import { useExportStore } from '../../lib/store/exportStore';
import {
  canvasToBase64,
  renderPanelTexture,
} from '../../lib/graphics/panelTexture';
import { RENDER_PRESETS, appliedRenderPreset } from '../../lib/project/defaults';
import type { RenderCamera, RenderPreset } from '../../lib/project/schema';
import type { LiveryScene, StrokeStyle } from '../../lib/livery/render';
import type {
  BlenderInfo,
  RenderProgress,
  RenderResult,
} from '../../lib/platform/types';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  NumberInput,
  Panel,
  PanelBody,
  PanelHeader,
  Progress,
  Select,
  Spinner,
  Toggle,
} from '../../components/ui';

const CAMERAS: Array<{ id: RenderCamera; label: string }> = [
  { id: 'three-quarter-front', label: 'Three-quarter front' },
  { id: 'three-quarter-rear', label: 'Three-quarter rear' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
];

const NO_PAINT: StrokeStyle = {
  color: '#ffffff',
  size: 0.02,
  opacity: 1,
  hardness: 1,
  erase: false,
};

export function RenderStudioView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const actions = useProjectActions();
  const ui = useUiStore();
  const { images } = useArtworkImages(project?.artwork ?? [], root);
  const viewportRef = useRef<ViewportHandle | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [blender, setBlender] = useState<BlenderInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { url: resolvedModelUrl } = useVehicleModelUrl(
    project?.vehicle.modelPath ?? null,
    root,
  );
  const [scene, setScene] = useState<LiveryScene | null>(null);
  const baseImage = useBaseTexture(project?.vehicle.livery.baseTexturePath ?? null, root);
  const liveryTexture = useLiveryTexture({
    livery: project?.vehicle.livery ?? null,
    baseImage,
    images,
    scene,
    panels: project?.vehicle.panels,
    panelMap: project?.vehicle.panelMap ?? null,
  });

  useEffect(() => {
    setModelUrl(resolvedModelUrl);
  }, [resolvedModelUrl]);

  useEffect(() => {
    registerViewportCapture(() => viewportRef.current?.capture() ?? null);
    return () => registerViewportCapture(null);
  }, []);

  const detect = () => {
    setChecking(true);
    platform
      .discoverBlender(ui.blenderPath)
      .then((info) => setBlender(info))
      .catch(() =>
        setBlender({
          found: false,
          executable: null,
          displayName: null,
          via: 'none',
          version: null,
          compatibility: 'unknown',
          message: 'Blender detection failed.',
          checkedAt: new Date().toISOString(),
        }),
      )
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    detect();
    // Detection only depends on the configured executable path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.blenderPath]);

  const previewTextures = useMemo(() => {
    const textures = new Map<string, string>();
    if (!project) return textures;
    try {
      for (const panel of project.vehicle.panels) {
        const placements = project.placements.filter(
          (placement) => placement.panelId === panel.id && placement.visible,
        );
        if (placements.length === 0) continue;
        const ready = placements.every((placement) => {
          const artwork = project.artwork.find((item) => item.id === placement.artworkId);
          return !artwork || artwork.kind === 'text' || images.has(artwork.id);
        });
        if (!ready) continue;
        const rendered = renderPanelTexture({
          panel,
          placements,
          artworks: project.artwork,
          images,
          paintColor: project.vehicle.paintColor,
          maxDimension: 1024,
        });
        textures.set(panel.id, rendered.canvas.toDataURL('image/png'));
      }
    } catch {
      return textures;
    }
    return textures;
  }, [project, images]);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<Aperture size={26} />} title="No project open">
          Open a project to render a preview.
        </EmptyState>
      </div>
    );
  }

  const updateRender = (patch: Partial<typeof project.render>, label: string) => {
    actions.updateProject((draft) => {
      Object.assign(draft.render, patch);
    }, label);
  };

  const applyPreset = (preset: RenderPreset) => {
    actions.updateProject((draft) => {
      draft.render.preset = preset;
      const applied = appliedRenderPreset({ ...draft, render: { ...draft.render, preset } });
      draft.render.width = applied.width;
      draft.render.height = applied.height;
      draft.render.samples = applied.samples;
      draft.render.engine = applied.engine;
    }, 'Change render preset');
  };

  const startRender = async () => {
    if (platform.kind !== 'desktop') {
      ui.notify(
        'info',
        'Blender rendering requires the desktop build',
        'Use "Capture viewport" for an in-browser preview image.',
      );
      return;
    }
    if (!blender?.found) {
      ui.notify('warning', 'Blender not available', 'Configure Blender in Diagnostics or Preferences.');
      return;
    }
    if (!root) {
      const saved = await actions.saveProject();
      if (!saved) return;
    }
    const store = useProjectStore.getState();
    if (!store.root || !store.project) {
      ui.notify('warning', 'Save the project first', 'Blender renders are written inside the project folder.');
      return;
    }
    setError(null);
    setRendering(true);
    setProgress({ jobId: '', stage: 'Preparing', percent: 1, message: 'Preparing render…' });
    setLogs([]);
    setResult(null);
    setResultImage(null);
    ui.setStatus('Preparing Blender render…');
    try {
      const textures: Array<{ panelId: string; objectName: string; base64: string }> = [];
      for (const panel of store.project.vehicle.panels) {
        const placements = store.project.placements.filter(
          (placement) => placement.panelId === panel.id && placement.visible,
        );
        if (placements.length === 0) continue;
        const ready = placements.every((placement) => {
          const artwork = store.project?.artwork.find((item) => item.id === placement.artworkId);
          return !artwork || artwork.kind === 'text' || images.has(artwork.id);
        });
        if (!ready) continue;
        const rendered = renderPanelTexture({
          panel,
          placements,
          artworks: store.project.artwork,
          images,
          paintColor: store.project.vehicle.paintColor,
          maxDimension: 2048,
        });
        textures.push({
          panelId: panel.id,
          objectName: panel.objectName,
          base64: canvasToBase64(rendered.canvas),
        });
      }

      const renderResult = await platform.startRender(
        {
          root: store.root,
          projectId: store.project.id,
          modelPath: store.project.vehicle.modelPath,
          outputName: `render-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
          engine: store.project.render.engine,
          width: store.project.render.width,
          height: store.project.render.height,
          samples: store.project.render.samples,
          camera: store.project.render.camera,
          transparentBackground: store.project.render.transparentBackground,
          includeFloor: store.project.render.includeFloor,
          paintColor: store.project.vehicle.paintColor,
          panelTextures: textures,
          bodyTexture:
            store.project.vehicle.livery.enabled && liveryTexture.canvas
              ? { base64: canvasToBase64(liveryTexture.canvas) }
              : null,
          blenderPath: ui.blenderPath,
        },
        (update) => {
          setProgress(update);
          setLogs((current) =>
            [...current, `[${update.stage}] ${update.message}`].slice(-200),
          );
          ui.setStatus(`Blender: ${update.stage} (${Math.round(update.percent)}%)`);
        },
        (jobId) => {
          jobIdRef.current = jobId;
        },
      );
      setResult(renderResult);
      setProgress({ jobId: '', stage: 'Done', percent: 100, message: 'Render complete' });
      try {
        const dataUrl = await platform.readImageDataUrl(renderResult.outputPath);
        setResultImage(dataUrl);
      } catch {
        setResultImage(null);
      }
      useExportStore.getState().add({
        kind: 'render',
        label: `${renderResult.engine} render`,
        path: renderResult.outputPath,
        files: 1,
      });
      ui.notify(
        'success',
        'Render complete',
        `${renderResult.resolution.width} × ${renderResult.resolution.height} · ${(renderResult.durationMs / 1000).toFixed(1)} s`,
      );
      ui.setStatus('Render complete');
    } catch (renderError) {
      const message =
        renderError instanceof Error ? renderError.message : String(renderError);
      setError(message);
      setLogs((current) => [...current, `[error] ${message}`].slice(-200));
      ui.notify('error', 'Render failed', message);
      ui.setStatus('Render failed');
    } finally {
      setRendering(false);
      jobIdRef.current = null;
    }
  };

  const cancel = async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      await platform.cancelRender(jobId);
      ui.setStatus('Cancelling render…');
    } catch (cancelError) {
      ui.notify(
        'error',
        'Could not cancel the render',
        cancelError instanceof Error ? cancelError.message : String(cancelError),
      );
    }
  };

  const capture = async () => {
    const dataUrl = viewportRef.current?.capture();
    if (!dataUrl) {
      ui.notify('warning', 'Nothing to capture');
      return;
    }
    const path = await platform.saveExport(`wrapforge-preview-${Date.now()}.png`, {
      base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    });
    if (path) ui.notify('success', 'Preview captured', path);
  };

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1>{t('render.title')}</h1>
          <p>{t('render.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => void capture()}>
            <Camera size={14} />
            {t('render.capture')}
          </Button>
          <Button variant="primary" onClick={() => void startRender()} disabled={rendering || checking}>
            {rendering ? <Spinner /> : <Play size={14} />}
            {t('render.start')}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 0.8fr)', gap: 18 }}>
        <div className="stack">
          <Panel flush>
            <PanelHeader
              title="Interactive preview"
              subtitle={`${project.render.width} × ${project.render.height} · ${project.render.engine}`}
              icon={<Aperture size={15} />}
              actions={<Badge variant="accent">{project.render.preset}</Badge>}
            />
            <div style={{ height: 420, position: 'relative' }}>
              <VehicleViewport
                ref={viewportRef}
                modelUrl={modelUrl}
                paintColor={project.vehicle.paintColor}
                panelTextures={previewTextures}
                panels={project.vehicle.panels}
                panelMap={project.vehicle.panelMap ?? null}
                bodyTexture={{ canvas: liveryTexture.canvas, version: liveryTexture.version }}
                paintMode={false}
                paintStyle={NO_PAINT}
                selectedPanelId={null}
                isolatedPanelId={null}
                showGrid={false}
                showPanelEdges={false}
                cameraPreset={project.render.camera}
                onSelectPanel={() => undefined}
                onPaintPoint={() => undefined}
                onSceneReady={setScene}
                onStatus={(status) => ui.setStatus(status)}
              />
            </div>
          </Panel>

          {rendering || progress ? (
            <Panel>
              <PanelHeader
                title={t('render.progress')}
                icon={<Clock size={15} />}
                actions={
                  rendering ? (
                    <Button size="sm" variant="danger" onClick={() => void cancel()}>
                      <Square size={11} />
                      {t('render.cancel')}
                    </Button>
                  ) : null
                }
              />
              <PanelBody>
                <Progress value={progress?.percent ?? 0} />
                <div className="render-progress" style={{ marginTop: 10 }}>
                  <div className="render-stage">
                    <span>{progress?.stage ?? 'Idle'}</span>
                    <span className="mono">{Math.round(progress?.percent ?? 0)}%</span>
                  </div>
                  <div className="tiny muted">{progress?.message}</div>
                </div>
                {logs.length > 0 ? (
                  <div className="render-log" style={{ marginTop: 10 }}>
                    {logs.join('\n')}
                  </div>
                ) : null}
              </PanelBody>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader
              title={t('render.lastResult')}
              actions={
                result ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        resultImage
                          ? void platform.saveExport(`wrapforge-render-${Date.now()}.png`, {
                              base64: resultImage.slice(resultImage.indexOf(',') + 1),
                            })
                          : undefined
                      }
                      disabled={!resultImage}
                    >
                      <ImageDown size={12} />
                      Save copy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void platform.openPath(result.outputPath)}>
                      <FolderOpen size={12} />
                      Open file
                    </Button>
                  </>
                ) : null
              }
            />
            <PanelBody>
              {error ? (
                <div className="issue error">
                  <CircleAlert size={15} className="issue-icon" />
                  <div>
                    <strong>Render failed</strong>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
                  </div>
                </div>
              ) : null}
              {resultImage ? (
                <div className="preview-frame">
                  <img src={resultImage} alt="Blender render result" />
                  <span className="preview-note">Blender render · {result?.engine}</span>
                </div>
              ) : !error ? (
                <EmptyState icon={<Aperture size={22} />} title="No render yet">
                  Start a Blender render to produce an offline preview. Output is written inside the
                  project folder.
                </EmptyState>
              ) : null}
              {result ? (
                <div className="stat-grid" style={{ marginTop: 12 }}>
                  <div className="stat">
                    <div className="stat-label">Engine</div>
                    <div className="stat-value" style={{ fontSize: 13 }}>
                      {result.engine}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Resolution</div>
                    <div className="stat-value" style={{ fontSize: 13 }}>
                      {result.resolution.width} × {result.resolution.height}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Duration</div>
                    <div className="stat-value" style={{ fontSize: 13 }}>
                      {(result.durationMs / 1000).toFixed(1)} s
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Device</div>
                    <div className="stat-value" style={{ fontSize: 13 }}>
                      {result.device ?? 'Not reported'}
                    </div>
                  </div>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('render.settings')}
              icon={<Cpu size={15} />}
              actions={<Badge>{RENDER_PRESETS[project.render.preset].label}</Badge>}
            />
            <PanelBody>
              <Field label={t('render.preset')} htmlFor="render-preset">
                <Select
                  id="render-preset"
                  value={project.render.preset}
                  onChange={(event) => applyPreset(event.currentTarget.value as RenderPreset)}
                >
                  {Object.entries(RENDER_PRESETS).map(([id, preset]) => (
                    <option key={id} value={id}>
                      {preset.label} · {preset.width}×{preset.height} · {preset.samples} spp
                    </option>
                  ))}
                </Select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label={t('render.engine')} htmlFor="render-engine">
                  <Select
                    id="render-engine"
                    value={project.render.engine}
                    onChange={(event) =>
                      updateRender(
                        {
                          engine: event.currentTarget.value as 'BLENDER_EEVEE' | 'CYCLES',
                        },
                        'Change render engine',
                      )
                    }
                  >
                    <option value="BLENDER_EEVEE">Eevee</option>
                    <option value="CYCLES">Cycles</option>
                  </Select>
                </Field>
                <Field label={t('render.samples')} htmlFor="render-samples">
                  <NumberInput
                    id="render-samples"
                    value={project.render.samples}
                    min={1}
                    max={4096}
                    step={1}
                    onValueChange={(value) =>
                      updateRender(
                        { samples: Math.round(Math.max(1, Math.min(4096, value))) },
                        'Change render samples',
                      )
                    }
                  />
                </Field>
                <Field label="Width" htmlFor="render-width">
                  <NumberInput
                    id="render-width"
                    value={project.render.width}
                    min={64}
                    max={8192}
                    step={1}
                    onValueChange={(value) =>
                      updateRender(
                        { width: Math.round(Math.max(64, Math.min(8192, value))) },
                        'Change render width',
                      )
                    }
                  />
                </Field>
                <Field label="Height" htmlFor="render-height">
                  <NumberInput
                    id="render-height"
                    value={project.render.height}
                    min={64}
                    max={8192}
                    step={1}
                    onValueChange={(value) =>
                      updateRender(
                        { height: Math.round(Math.max(64, Math.min(8192, value))) },
                        'Change render height',
                      )
                    }
                  />
                </Field>
              </div>
              <Field label={t('render.camera')} htmlFor="render-camera">
                <Select
                  id="render-camera"
                  value={project.render.camera}
                  onChange={(event) =>
                    updateRender(
                      { camera: event.currentTarget.value as RenderCamera },
                      'Change render camera',
                    )
                  }
                >
                  {CAMERAS.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Toggle
                label={t('render.transparent')}
                checked={project.render.transparentBackground}
                onChange={(checked) =>
                  updateRender({ transparentBackground: checked }, 'Toggle transparent background')
                }
              />
              <Toggle
                label={t('render.floor')}
                checked={project.render.includeFloor}
                onChange={(checked) => updateRender({ includeFloor: checked }, 'Toggle studio floor')}
              />
              <p className="tiny dim" style={{ marginTop: 8 }}>
                GPU rendering is optional. WrapForge does not claim a GPU is used unless Blender
                reports it.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={t('diagnostics.blender')}
              icon={<Cpu size={15} />}
              actions={
                <Button size="sm" variant="ghost" onClick={detect} disabled={checking}>
                  <RefreshCw size={12} />
                  Re-check
                </Button>
              }
            />
            <PanelBody>
              {checking ? (
                <Spinner label="Detecting Blender…" />
              ) : blender?.found ? (
                <>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <Badge variant="green">{blender.version}</Badge>
                    <Badge variant={blender.compatibility === 'tested' ? 'green' : 'amber'}>
                      {blender.compatibility}
                    </Badge>
                    <Badge>{blender.via}</Badge>
                  </div>
                  <div className="small mono" style={{ wordBreak: 'break-all' }}>
                    {blender.displayName}
                  </div>
                  <p className="tiny dim" style={{ marginTop: 8 }}>
                    {blender.message}
                  </p>
                </>
              ) : (
                <>
                  <div className="issue warning">
                    <CircleAlert size={15} className="issue-icon" />
                    <div>
                      <strong>{t('render.notAvailable')}</strong>
                      <p>{blender?.message ?? 'Blender was not found.'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <Button size="sm" onClick={() => ui.setView('diagnostics')}>
                      Open diagnostics
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ui.setView('preferences')}>
                      Preferences
                    </Button>
                  </div>
                </>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Render queue" subtitle="Single-job rendering in this alpha" />
            <PanelBody>
              <p className="small muted" style={{ margin: 0 }}>
                One render runs at a time. Jobs execute in Blender headless mode, report progress,
                and can be cancelled. A persistent queue and batch camera renders are planned.
              </p>
              {result ? (
                <p className="tiny mono dim" style={{ marginTop: 10, wordBreak: 'break-all' }}>
                  {result.outputPath}
                </p>
              ) : null}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
