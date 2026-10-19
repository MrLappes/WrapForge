import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Camera,
  Download,
  Eye,
  EyeOff,
  Frame,
  Grid3x3,
  ImagePlus,
  Layers,
  Maximize2,
  Merge,
  MousePointer2,
  Move,
  PaintBucket,
  Paintbrush,
  RotateCw,
  Scan,
  Trash2,
  Wand2,
} from 'lucide-react';
import { VehicleViewport, type PaintPhase, type ViewportHandle } from './VehicleViewport';
import { LiveryInspector } from './LiveryInspector';
import { useLiveryTexture } from './useLiveryTexture';
import { useArtworkImages } from './useArtworkImages';
import { useBaseTexture, useVehicleModelUrl } from './useVehicleAssets';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { platform } from '../../lib/platform';
import { registerViewportCapture } from '../../lib/autosave';
import { useExportStore } from '../../lib/store/exportStore';
import { renderPanelTexture, canvasToDataUrl } from '../../lib/graphics/panelTexture';
import type { RenderCamera } from '../../lib/project/schema';
import type { LiveryScene, StrokeStyle } from '../../lib/livery/render';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '../../components/ui';

const CAMERAS: Array<{ id: RenderCamera; label: string }> = [
  { id: 'three-quarter-front', label: '3/4 front' },
  { id: 'three-quarter-rear', label: '3/4 rear' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
];

type InspectorTab = 'livery' | 'panels' | 'artwork' | 'view';

const DEFAULT_BRUSH: StrokeStyle = {
  color: '#ff2d55',
  size: 0.03,
  opacity: 0.9,
  hardness: 0.75,
  erase: false,
};

export function DesignStudioView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const actions = useProjectActions();
  const ui = useUiStore();
  const viewportRef = useRef<ViewportHandle | null>(null);
  const [cameraPreset, setCameraPreset] = useState<RenderCamera>('three-quarter-front');
  const [isolate, setIsolate] = useState(false);
  const [tab, setTab] = useState<InspectorTab>('livery');
  const [paintMode, setPaintMode] = useState(false);
  const [brush, setBrush] = useState<StrokeStyle>(DEFAULT_BRUSH);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [scene, setScene] = useState<LiveryScene | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [panelNameDraft, setPanelNameDraft] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');

  const { images } = useArtworkImages(project?.artwork ?? [], root);
  const livery = project?.vehicle.livery ?? null;
  const { url: modelUrl, error: modelError } = useVehicleModelUrl(
    project?.vehicle.modelPath ?? null,
    root,
  );
  const baseImage = useBaseTexture(livery?.baseTexturePath ?? null, root);
  const texture = useLiveryTexture({
    livery,
    baseImage,
    images,
    scene,
    panels: project?.vehicle.panels,
    panelMap: project?.vehicle.panelMap ?? null,
  });

  const selectedPanel =
    project?.vehicle.panels.find((panel) => panel.id === ui.selectedPanelId) ?? null;
  const selectedPlacement =
    project?.placements.find((placement) => placement.id === ui.selectedPlacementId) ?? null;

  useEffect(() => {
    registerViewportCapture(() => viewportRef.current?.capture() ?? null);
    return () => registerViewportCapture(null);
  }, []);

  const runExchange = useCallback(async (task: () => Promise<boolean>) => {
    setExchanging(true);
    try {
      await task();
    } catch (error) {
      ui.notify(
        'error',
        'Layer exchange failed',
        error instanceof Error ? error.message : 'The file could not be processed.',
      );
    } finally {
      setExchanging(false);
    }
  }, [ui]);

  useEffect(() => {
    setPanelNameDraft(selectedPanel?.name ?? '');
    setMergeTargetId('');
  }, [selectedPanel?.id, selectedPanel?.name]);

  const panelTextures = useMemo(() => {
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
        const result = renderPanelTexture({
          panel,
          placements,
          artworks: project.artwork,
          images,
          paintColor: project.vehicle.paintColor,
          maxDimension: 1024,
        });
        textures.set(panel.id, canvasToDataUrl(result.canvas));
      }
    } catch {
      return textures;
    }
    return textures;
  }, [project, images]);

  const handlePaintPoint = useCallback(
    (u: number, v: number, phase: PaintPhase) => {
      const stroke = texture.paint(u, v, phase, brush);
      if (stroke) actions.commitStroke(stroke);
    },
    [actions, brush, texture],
  );

  const togglePaintMode = useCallback(() => {
    setPaintMode((value) => {
      const next = !value;
      ui.setStatus(next ? 'Paint mode: drag on the body' : 'Orbit mode');
      return next;
    });
  }, [ui]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        togglePaintMode();
        return;
      }
      if (event.key === '[') {
        setBrush((value) => ({ ...value, size: Math.max(0.004, value.size - 0.006) }));
        return;
      }
      if (event.key === ']') {
        setBrush((value) => ({ ...value, size: Math.min(0.16, value.size + 0.006) }));
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPlacement) {
        event.preventDefault();
        actions.deletePlacement(selectedPlacement.id);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions, selectedPlacement, togglePaintMode]);

  const hasImportedModel = Boolean(project?.vehicle.panelMap);
  useEffect(() => {
    if (hasImportedModel || project?.vehicle.livery.enabled) setTab('livery');
  }, [hasImportedModel, project?.vehicle.livery.enabled]);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<Frame size={26} />} title="No project open">
          Create a project to enter the 3D studio.
        </EmptyState>
      </div>
    );
  }

  const wrapable = project.vehicle.panels.filter((panel) => panel.wrapable);
  const liveryEnabled = project.vehicle.livery.enabled;
  const placementsForPanel = ui.selectedPanelId
    ? project.placements.filter((placement) => placement.panelId === ui.selectedPanelId)
    : project.placements;

  const capture = async () => {
    const dataUrl = viewportRef.current?.capture();
    if (!dataUrl) {
      ui.notify('warning', 'Nothing to capture', 'The viewport is not ready yet.');
      return;
    }
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    try {
      const path = await platform.saveExport(`wrapforge-viewport-${Date.now()}.png`, { base64 });
      if (path) {
        useExportStore.getState().add({
          kind: 'preview',
          label: 'Viewport capture',
          path,
          files: 1,
        });
        ui.notify('success', 'Viewport captured', path);
      }
    } catch (error) {
      ui.notify('error', 'Capture failed', error instanceof Error ? error.message : String(error));
    }
  };

  const exportTexture = async () => {
    if (!texture.canvas) {
      ui.notify('warning', 'No livery texture yet', 'Add a layer or paint on the car first.');
      return;
    }
    const dataUrl = texture.canvas.toDataURL('image/png');
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    try {
      const path = await platform.saveExport(`wrapforge-livery-${project.vehicle.assetId}.png`, {
        base64,
      });
      if (path) {
        useExportStore.getState().add({
          kind: 'texture',
          label: 'Livery texture',
          path,
          files: 1,
        });
        ui.notify('success', 'Livery texture exported', path);
      }
    } catch (error) {
      ui.notify('error', 'Export failed', error instanceof Error ? error.message : String(error));
    }
  };

  const tabs: Array<{ id: InspectorTab; label: string; icon: ReactNode }> = [
    { id: 'livery', label: 'Livery', icon: <Paintbrush size={13} /> },
    { id: 'panels', label: 'Panels', icon: <Layers size={13} /> },
    { id: 'artwork', label: 'Artwork', icon: <ImagePlus size={13} /> },
    { id: 'view', label: 'View', icon: <Eye size={13} /> },
  ];

  return (
    <div className="studio-layout">
      <div className="studio-canvas">
        <VehicleViewport
          ref={viewportRef}
          modelUrl={modelUrl}
          paintColor={project.vehicle.paintColor}
          panelTextures={panelTextures}
          panels={project.vehicle.panels}
          panelMap={project.vehicle.panelMap ?? null}
          bodyTexture={{ canvas: texture.canvas, version: texture.version }}
          paintMode={paintMode && liveryEnabled}
          paintStyle={brush}
          selectedPanelId={ui.selectedPanelId}
          isolatedPanelId={isolate ? ui.selectedPanelId : null}
          showGrid={project.settings.showGrid}
          showPanelEdges={project.settings.showPanelEdges}
          cameraPreset={cameraPreset}
          onSelectPanel={(panelId) => {
            ui.selectPanel(panelId);
            if (panelId) {
              const placement = project.placements.find((item) => item.panelId === panelId);
              if (placement && !ui.selectedPlacementId) ui.selectPlacement(placement.id);
            } else {
              ui.selectPlacement(null);
            }
          }}
          onPaintPoint={handlePaintPoint}
          onSceneReady={setScene}
          onStatus={(status) => ui.setStatus(status)}
        />
        {modelError ? (
          <div className="viewport-overlay viewport-error" role="alert">
            <strong>Could not resolve the vehicle model</strong>
            <span>{modelError}</span>
          </div>
        ) : null}
        <div className="viewport-toolbar">
          <div className="toolbar-group">
            {CAMERAS.map((camera) => (
              <button
                key={camera.id}
                type="button"
                className={`icon-btn ${cameraPreset === camera.id ? 'active' : ''}`}
                onClick={() => setCameraPreset(camera.id)}
                title={`${camera.label} view`}
                aria-label={`${camera.label} view`}
                style={{ width: 'auto', padding: '0 9px', fontSize: 10 }}
              >
                {camera.label}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            {liveryEnabled ? (
              <IconButton
                label={paintMode ? 'Leave paint mode' : 'Paint on the car'}
                active={paintMode}
                onClick={togglePaintMode}
              >
                <Paintbrush size={14} />
              </IconButton>
            ) : null}
            <IconButton
              label="Toggle grid"
              active={project.settings.showGrid}
              onClick={() =>
                actions.updateProject((draft) => {
                  draft.settings.showGrid = !draft.settings.showGrid;
                }, 'Toggle grid')
              }
            >
              <Grid3x3 size={14} />
            </IconButton>
            <IconButton
              label="Show panel boundaries"
              active={project.settings.showPanelEdges}
              onClick={() =>
                actions.updateProject((draft) => {
                  draft.settings.showPanelEdges = !draft.settings.showPanelEdges;
                }, 'Toggle panel edges')
              }
            >
              <Scan size={14} />
            </IconButton>
            <IconButton
              label={isolate ? 'Show whole vehicle' : 'Isolate selected panel'}
              active={isolate}
              disabled={!ui.selectedPanelId}
              onClick={() => setIsolate((value) => !value)}
            >
              <Maximize2 size={14} />
            </IconButton>
            <IconButton label="Capture viewport PNG" onClick={() => void capture()}>
              <Camera size={14} />
            </IconButton>
            {liveryEnabled ? (
              <IconButton label="Export livery texture PNG" onClick={() => void exportTexture()}>
                <Download size={14} />
              </IconButton>
            ) : null}
          </div>
          <div className="viewport-badge">
            {selectedPanel
              ? selectedPanel.name
              : liveryEnabled
                ? `${project.vehicle.livery.layers.length} layers · ${project.vehicle.panels.length} panels`
                : `${wrapable.length} wrap panels`}
          </div>
        </div>
        {texture.error ? (
          <div className="viewport-toast error">{texture.error}</div>
        ) : texture.busy ? (
          <div className="viewport-toast">Composing livery texture…</div>
        ) : null}
      </div>

      <aside className="inspector" aria-label="Design inspector">
        <div className="inspector-header">
          <MousePointer2 size={14} style={{ color: 'var(--accent)' }} />
          <h2>Studio</h2>
          {selectedPanel ? (
            <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>
              {selectedPanel.name}
            </span>
          ) : null}
        </div>
        <div className="inspector-tabs" role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? 'active' : ''}
              onClick={() => setTab(entry.id)}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>
        <div className="inspector-body">
          {tab === 'livery' ? (
            liveryEnabled ? (
              <LiveryInspector
                livery={project.vehicle.livery}
                strokeCount={project.vehicle.livery.strokes.length}
                selectedLayerId={selectedLayerId}
                paintMode={paintMode}
                brush={brush}
                onSelectLayer={setSelectedLayerId}
                onTogglePaintMode={togglePaintMode}
                onBrushChange={(patch) => setBrush((value) => ({ ...value, ...patch }))}
                onUpdate={actions.updateLivery}
                onAddLayer={actions.addLiveryLayer}
                onUpdateLayer={actions.updateLiveryLayer}
                onDeleteLayer={(id) => {
                  actions.deleteLiveryLayer(id);
                  if (selectedLayerId === id) setSelectedLayerId(null);
                }}
                onClearPainting={actions.clearPainting}
                onApplyPreset={actions.applyLiveryPreset}
                onExportTexture={() => void exportTexture()}
                onExportPsd={() => void runExchange(() => actions.exportLiveryPsdFile(images))}
                onImportPsd={() => void runExchange(async () => {
                  const file = await platform.importFile('Import livery PSD', ['psd']);
                  if (!file) return false;
                  return actions.importLiveryPsdFile(file);
                })}
                onExportLayers={() => void runExchange(() => actions.exportLayerFiles(images))}
                onSyncLayers={() => void runExchange(async () => {
                  const files = await platform.importFiles('Sync layer PNGs', ['png']);
                  if (files.length === 0) return false;
                  return actions.importLayerFiles(files);
                })}
                exchanging={exchanging}
              />
            ) : (
              <div className="inspector-section">
                <h3>Texture livery</h3>
                <p className="small muted">
                  This vehicle uses the bundled panel-based asset. Import any glTF car model to edit
                  the paint and livery directly on its texture, Forza-style.
                </p>
                <Button
                  variant="primary"
                  onClick={() => void actions.importVehicleModel()}
                  style={{ marginTop: 10 }}
                >
                  <Wand2 size={13} />
                  Import 3D car model
                </Button>
              </div>
            )
          ) : null}

          {tab === 'panels' ? (
            <>
              <div className="inspector-section">
                <h3>Panel</h3>
                {selectedPanel ? (
                  <>
                    <div className="row wrap" style={{ marginBottom: 8 }}>
                      <Badge variant="accent">{selectedPanel.category}</Badge>
                      <Badge>{selectedPanel.side}</Badge>
                      <Badge variant={selectedPanel.uv.hasUv ? 'teal' : 'amber'}>
                        {selectedPanel.uv.hasUv ? 'UV ready' : 'No UV'}
                      </Badge>
                      {selectedPanel.confidence !== undefined ? (
                        <Badge variant={selectedPanel.confidence > 0.6 ? 'green' : 'amber'}>
                          {Math.round(selectedPanel.confidence * 100)}% confident
                        </Badge>
                      ) : null}
                    </div>
                    <table className="data-table">
                      <tbody>
                        <tr>
                          <td className="muted">Size</td>
                          <td className="num">
                            {selectedPanel.dimensionsMm.width} × {selectedPanel.dimensionsMm.height}{' '}
                            mm
                          </td>
                        </tr>
                        <tr>
                          <td className="muted">Area</td>
                          <td className="num">{(selectedPanel.areaM2 ?? 0).toFixed(3)} m²</td>
                        </tr>
                        <tr>
                          <td className="muted">Outward axis</td>
                          <td className="num">{selectedPanel.outwardAxis}</td>
                        </tr>
                        <tr>
                          <td className="muted">Mesh</td>
                          <td className="num">{selectedPanel.objectName}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="row" style={{ marginTop: 9 }}>
                      <Button
                        size="sm"
                        variant={isolate ? 'primary' : 'default'}
                        onClick={() => setIsolate((value) => !value)}
                      >
                        <Maximize2 size={12} />
                        {isolate ? 'Show all' : 'Isolate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          ui.selectPanel(null);
                          ui.selectPlacement(null);
                          setIsolate(false);
                        }}
                      >
                        Deselect
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="small muted">
                    Click a panel in the viewport, or pick one below. Imported models are segmented
                    automatically; the numbers are heuristics, not measurements.
                  </p>
                )}
              </div>
              <div className="inspector-section">
                <h3>Correct this panel</h3>
                {selectedPanel ? (
                  <>
                    <Field label="Name" htmlFor="panel-name">
                      <TextInput
                        id="panel-name"
                        value={panelNameDraft}
                        onChange={(event) => setPanelNameDraft(event.target.value)}
                        onBlur={() => actions.renameVehiclePanel(selectedPanel.id, panelNameDraft)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            actions.renameVehiclePanel(selectedPanel.id, panelNameDraft);
                            event.currentTarget.blur();
                          }
                          if (event.key === 'Escape') setPanelNameDraft(selectedPanel.name);
                        }}
                      />
                    </Field>
                    {project.vehicle.panelMap ? (
                      <>
                        <Field
                          label="Merge into"
                          htmlFor="panel-merge"
                          hint="The selected region joins the target panel, which keeps its name."
                        >
                          <Select
                            id="panel-merge"
                            value={mergeTargetId}
                            onChange={(event) => setMergeTargetId(event.target.value)}
                          >
                            <option value="">Choose a panel…</option>
                            {project.vehicle.panels
                              .filter((panel) => panel.id !== selectedPanel.id)
                              .map((panel) => (
                                <option key={panel.id} value={panel.id}>
                                  {panel.name}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <div className="row wrap" style={{ marginTop: 9 }}>
                          <Button
                            size="sm"
                            disabled={!mergeTargetId}
                            onClick={() => {
                              if (!mergeTargetId) return;
                              actions.mergeVehiclePanels(selectedPanel.id, mergeTargetId);
                              ui.selectPanel(mergeTargetId);
                              setMergeTargetId('');
                            }}
                          >
                            <Merge size={12} />
                            Merge
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={project.vehicle.panels.length <= 1}
                            onClick={() => {
                              const next = project.vehicle.panels.find(
                                (panel) => panel.id !== selectedPanel.id,
                              );
                              actions.deleteVehiclePanel(selectedPanel.id);
                              ui.selectPanel(next?.id ?? null);
                              setIsolate(false);
                            }}
                          >
                            <Trash2 size={12} />
                            Remove
                          </Button>
                        </div>
                        <p className="small muted" style={{ marginTop: 8 }}>
                          Auto-detection is geometric, so a raked tailgate or a split bumper can end
                          up in the wrong bucket. Rename, merge, or remove it — undo restores the
                          original detection.
                        </p>
                      </>
                    ) : (
                      <p className="small muted">
                        Renaming works on any vehicle. Merging and removal need an imported model
                        with a panel map.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="small muted">Select a panel to rename, merge, or remove it.</p>
                )}
              </div>
              <div className="inspector-section">
                <h3>Detected panels ({project.vehicle.panels.length})</h3>
                <div className="panel-list">
                  {project.vehicle.panels.map((panel) => (
                    <button
                      key={panel.id}
                      type="button"
                      className={`panel-chip ${panel.id === ui.selectedPanelId ? 'active' : ''}`}
                      onClick={() => {
                        ui.selectPanel(panel.id);
                        setTab('panels');
                      }}
                    >
                      <span>{panel.name}</span>
                      <span className="muted">{panel.areaM2?.toFixed(2)} m²</span>
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  style={{ marginTop: 10 }}
                  onClick={() => void actions.importVehicleModel()}
                >
                  <Wand2 size={12} />
                  Import another model
                </Button>
              </div>
            </>
          ) : null}

          {tab === 'artwork' ? (
            <>
              <div className="inspector-section">
                <h3>Artwork</h3>
                <div className="row" style={{ marginBottom: 9 }}>
                  <Button size="sm" variant="primary" onClick={() => void actions.importArtwork()}>
                    <ImagePlus size={12} />
                    Import
                  </Button>
                  <Button size="sm" onClick={() => ui.setView('artwork')}>
                    Manage
                  </Button>
                </div>
                {project.artwork.length === 0 ? (
                  <p className="small muted">
                    {t('studio.noArtwork')} Artwork can also be used as a livery image layer.
                  </p>
                ) : (
                  project.artwork.map((artwork) => (
                    <div key={artwork.id} className="mini-row">
                      <span className="mini-thumb">
                        {images.has(artwork.id) ? (
                          <img src={images.get(artwork.id)!.src} alt="" />
                        ) : null}
                      </span>
                      <span className="grow">{artwork.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const layer = actions.addLiveryLayer('image', 'side-left');
                          actions.updateLiveryLayer(
                            layer.id,
                            { imageArtworkId: artwork.id, name: artwork.name },
                            'Attach artwork to layer',
                          );
                          setSelectedLayerId(layer.id);
                          setTab('livery');
                        }}
                      >
                        Layer
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <div className="inspector-section">
                <h3>Placements ({placementsForPanel.length})</h3>
                {placementsForPanel.length === 0 ? (
                  <p className="small muted">
                    Panel placements are the classic workflow for the bundled asset. Texture livery
                    replaces them for imported models.
                  </p>
                ) : (
                  placementsForPanel.map((placement) => (
                    <div
                      key={placement.id}
                      className={`mini-row ${placement.id === ui.selectedPlacementId ? 'active' : ''}`}
                      onClick={() => ui.selectPlacement(placement.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') ui.selectPlacement(placement.id);
                      }}
                    >
                      <span className="grow">{placement.name}</span>
                      <IconButton
                        label="Toggle placement"
                        onClick={(event) => {
                          event.stopPropagation();
                          actions.updatePlacement(
                            placement.id,
                            { visible: !placement.visible },
                            'Toggle placement visibility',
                          );
                        }}
                      >
                        {placement.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </IconButton>
                      <IconButton
                        label="Delete placement"
                        onClick={(event) => {
                          event.stopPropagation();
                          actions.deletePlacement(placement.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  ))
                )}
              </div>
              {selectedPlacement ? (
                <div className="inspector-section">
                  <h3>{t('projection.placement')}</h3>
                  <Slider
                    label={t('projection.horizontal')}
                    value={selectedPlacement.u}
                    min={0}
                    max={1}
                    step={0.001}
                    onChange={(value) =>
                      actions.updatePlacement(selectedPlacement.id, { u: value }, 'Move artwork')
                    }
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                  <Slider
                    label={t('projection.vertical')}
                    value={selectedPlacement.v}
                    min={0}
                    max={1}
                    step={0.001}
                    onChange={(value) =>
                      actions.updatePlacement(selectedPlacement.id, { v: value }, 'Move artwork')
                    }
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                  <Slider
                    label={t('projection.width')}
                    value={selectedPlacement.widthFraction}
                    min={0.02}
                    max={2}
                    step={0.005}
                    onChange={(value) =>
                      actions.updatePlacement(
                        selectedPlacement.id,
                        { widthFraction: value },
                        'Resize artwork',
                      )
                    }
                    format={(value) => `${Math.round(value * 100)}% of panel`}
                  />
                  <Slider
                    label={t('projection.rotation')}
                    value={selectedPlacement.rotationDeg}
                    min={-180}
                    max={180}
                    step={0.5}
                    onChange={(value) =>
                      actions.updatePlacement(
                        selectedPlacement.id,
                        { rotationDeg: value },
                        'Rotate artwork',
                      )
                    }
                    format={(value) => `${value.toFixed(1)}°`}
                  />
                  <Slider
                    label={t('projection.opacity')}
                    value={selectedPlacement.opacity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) =>
                      actions.updatePlacement(
                        selectedPlacement.id,
                        { opacity: value },
                        'Change artwork opacity',
                      )
                    }
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <Button
                      size="sm"
                      onClick={() =>
                        actions.updatePlacement(
                          selectedPlacement.id,
                          { u: 0.5, v: 0.5, rotationDeg: 0 },
                          'Centre artwork',
                        )
                      }
                    >
                      <Move size={12} />
                      Centre
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        actions.updatePlacement(
                          selectedPlacement.id,
                          { rotationDeg: 0, widthFraction: 0.55 },
                          'Reset transform',
                        )
                      }
                    >
                      <RotateCw size={12} />
                      Reset
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === 'view' ? (
            <>
              <div className="inspector-section">
                <h3>{t('studio.paint')}</h3>
                <div className="color-input">
                  <input
                    type="color"
                    value={project.vehicle.paintColor}
                    onChange={(event) => actions.setPaintColor(event.currentTarget.value)}
                    aria-label="Paint colour"
                  />
                  <input
                    className="input mono"
                    value={project.vehicle.paintColor.toUpperCase()}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(value)) actions.setPaintColor(value);
                    }}
                    maxLength={7}
                    aria-label="Paint hex value"
                  />
                  <PaintBucket size={14} className="dim" />
                </div>
                <p className="small muted">
                  Applies to panel-based vehicles. Imported models use the livery finish colour.
                </p>
              </div>
              <div className="inspector-section">
                <h3>{t('studio.view')}</h3>
                <Toggle
                  label="Grid"
                  checked={project.settings.showGrid}
                  onChange={(checked) =>
                    actions.updateProject((draft) => {
                      draft.settings.showGrid = checked;
                    }, 'Toggle grid')
                  }
                />
                <Toggle
                  label="Panel boundaries"
                  checked={project.settings.showPanelEdges}
                  onChange={(checked) =>
                    actions.updateProject((draft) => {
                      draft.settings.showPanelEdges = checked;
                    }, 'Toggle panel edges')
                  }
                />
              </div>
              <div className="inspector-section">
                <h3>Model</h3>
                <div className="small muted">
                  {project.vehicle.displayName}
                  <br />
                  {project.vehicle.dimensionsMm.length} × {project.vehicle.dimensionsMm.width} ×{' '}
                  {project.vehicle.dimensionsMm.height} mm
                  <br />
                  {project.vehicle.license.id}
                  <br />
                  {project.vehicle.panelMap
                    ? 'Imported glTF with texture livery'
                    : 'Bundled panel asset'}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
