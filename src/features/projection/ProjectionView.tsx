import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Grid3x3, ImagePlus, MousePointer2, Move, Scan } from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { useArtworkImages } from '../studio/useArtworkImages';
import { renderPanelTexture } from '../../lib/graphics/panelTexture';
import { placementBounds } from '../../lib/print/validation';
import type { ArtworkAsset, PanelDefinition, Placement } from '../../lib/project/schema';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Select,
  Slider,
  Toggle,
} from '../../components/ui';

interface DragPreview {
  id: string;
  u: number;
  v: number;
}

export function ProjectionView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const selectedPanelId = useUiStore((state) => state.selectedPanelId);
  const selectedPlacementId = useUiStore((state) => state.selectedPlacementId);
  const selectPanel = useUiStore((state) => state.selectPanel);
  const selectPlacement = useUiStore((state) => state.selectPlacement);
  const setView = useUiStore((state) => state.setView);
  const actions = useProjectActions();
  const { images } = useArtworkImages(project?.artwork ?? [], root);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    id: string;
    startU: number;
    startV: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const wrapable = useMemo(
    () => project?.vehicle.panels.filter((panel) => panel.wrapable) ?? [],
    [project],
  );
  const panel =
    wrapable.find((item) => item.id === selectedPanelId) ?? wrapable[0] ?? null;
  const placements = useMemo(
    () => (project && panel ? project.placements.filter((item) => item.panelId === panel.id) : []),
    [project, panel],
  );
  const selectedPlacement =
    project?.placements.find((placement) => placement.id === selectedPlacementId) ?? null;

  useEffect(() => {
    if (!project || !panel || !canvasRef.current) return;
    const result = renderPanelTexture({
      panel,
      placements,
      artworks: project.artwork,
      images,
      paintColor: project.vehicle.paintColor,
      maxDimension: 1400,
    });
    const canvas = canvasRef.current;
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(result.canvas, 0, 0);
    drawOverlay(ctx, {
      panel,
      placements,
      artworks: project.artwork,
      selectedPlacementId,
      dragPreview,
      safeMarginMm: project.print.safeMarginMm,
    });
  }, [project, panel, placements, images, selectedPlacementId, dragPreview]);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<Grid3x3 size={26} />} title="No project open">
          Open a project to inspect UV placement.
        </EmptyState>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="content">
        <EmptyState icon={<Grid3x3 size={26} />} title="No wrap-able panels">
          This vehicle asset has no wrap-able panel metadata.
        </EmptyState>
      </div>
    );
  }

  const pointerToUv = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = 1 - (event.clientY - rect.top) / rect.height;
    return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
  };

  const hitTest = (u: number, v: number): Placement | null => {
    for (let index = placements.length - 1; index >= 0; index -= 1) {
      const placement = placements[index];
      const artwork = project.artwork.find((item) => item.id === placement.artworkId);
      const bounds = placementBounds(placement, panel, artwork);
      if (u >= bounds.left && u <= bounds.right && v >= bounds.bottom && v <= bounds.top) {
        return placement;
      }
    }
    return null;
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('projection.title')}</h1>
          <p>{t('projection.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => void actions.importArtwork()}>
            <ImagePlus size={14} />
            {t('action.importArtwork')}
          </Button>
          <Button variant="primary" onClick={() => setView('studio')}>
            Open studio
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader
              title={panel.name}
              subtitle={`${panel.dimensionsMm.width} × ${panel.dimensionsMm.height} mm · ${panel.uv.layout ?? 'UV layout'}`}
              icon={<Grid3x3 size={15} />}
              actions={
                <Select
                  value={panel.id}
                  onChange={(event) => selectPanel(event.currentTarget.value)}
                  style={{ width: 190 }}
                  aria-label="Select panel"
                >
                  {wrapable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              }
            />
            <PanelBody>
              <div className="panel-preview-wrap" style={{ aspectRatio: `${panel.dimensionsMm.width} / ${panel.dimensionsMm.height}` }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }}
                  onPointerDown={(event) => {
                    const uv = pointerToUv(event);
                    if (!uv) return;
                    const hit = hitTest(uv.u, uv.v);
                    if (!hit) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    selectPlacement(hit.id);
                    dragRef.current = {
                      id: hit.id,
                      startU: hit.u,
                      startV: hit.v,
                      startX: uv.u,
                      startY: uv.v,
                      moved: false,
                    };
                  }}
                  onPointerMove={(event) => {
                    const drag = dragRef.current;
                    if (!drag) return;
                    const uv = pointerToUv(event);
                    if (!uv) return;
                    const u = clamp(drag.startU + (uv.u - drag.startX), 0, 1);
                    const v = clamp(drag.startV + (uv.v - drag.startY), 0, 1);
                    drag.moved = true;
                    setDragPreview({ id: drag.id, u, v });
                  }}
                  onPointerUp={(event) => {
                    const drag = dragRef.current;
                    dragRef.current = null;
                    if (!drag) return;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    const uv = pointerToUv(event);
                    if (drag.moved && uv) {
                      actions.updatePlacement(
                        drag.id,
                        {
                          u: clamp(drag.startU + (uv.u - drag.startX), 0, 1),
                          v: clamp(drag.startV + (uv.v - drag.startY), 0, 1),
                        },
                        'Move artwork in UV space',
                      );
                    }
                    setDragPreview(null);
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                    setDragPreview(null);
                  }}
                  aria-label={`Panel UV layout for ${panel.name}`}
                />
                <div className="panel-preview-label">
                  Drag artwork to move · dashed line = trim · blue = safe margin
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge variant="accent">UV mapping</Badge>
                <Badge variant={panel.uv.hasUv ? 'green' : 'amber'}>
                  {panel.uv.hasUv ? 'UV available' : 'No UV'}
                </Badge>
                <Badge>{panel.uv.outerFaceCount ?? 0} outer faces</Badge>
                <Badge variant={panel.uv.overlapDetected ? 'red' : 'green'}>
                  {panel.uv.overlapDetected ? 'Overlap detected' : 'No overlap detected'}
                </Badge>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Placement list" subtitle={`${placements.length} on ${panel.name}`} icon={<Move size={15} />} />
            <PanelBody tight>
              {placements.length === 0 ? (
                <div style={{ padding: 14 }}>
                  <p className="small muted" style={{ margin: 0 }}>
                    No artwork on this panel. Import artwork, select a panel in the studio, and use
                    Place.
                  </p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Placement</th>
                      <th>Artwork</th>
                      <th className="num">U / V</th>
                      <th className="num">Width</th>
                      <th className="num">Rotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {placements.map((placement) => (
                      <tr
                        key={placement.id}
                        onClick={() => selectPlacement(placement.id)}
                        style={{
                          cursor: 'pointer',
                          background:
                            placement.id === selectedPlacementId
                              ? 'var(--accent-soft)'
                              : undefined,
                        }}
                      >
                        <td>{placement.name}</td>
                        <td className="muted">
                          {project.artwork.find((item) => item.id === placement.artworkId)?.name ??
                            'Missing'}
                        </td>
                        <td className="num">
                          {placement.u.toFixed(3)} / {placement.v.toFixed(3)}
                        </td>
                        <td className="num">{Math.round(placement.widthFraction * 100)}%</td>
                        <td className="num">{placement.rotationDeg.toFixed(1)}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          {selectedPlacement ? (
            <Panel>
              <PanelHeader
                title={t('projection.placement')}
                subtitle={selectedPlacement.name}
                icon={<MousePointer2 size={15} />}
              />
              <PanelBody>
                <Slider
                  label={t('projection.horizontal')}
                  value={selectedPlacement.u}
                  min={0}
                  max={1}
                  step={0.001}
                  onChange={(value) =>
                    actions.updatePlacement(selectedPlacement.id, { u: value }, 'Move artwork in UV space')
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
                    actions.updatePlacement(selectedPlacement.id, { v: value }, 'Move artwork in UV space')
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
                    actions.updatePlacement(selectedPlacement.id, { widthFraction: value }, 'Resize artwork')
                  }
                  format={(value) => `${Math.round(value * 100)}%`}
                />
                <Slider
                  label={t('projection.rotation')}
                  value={selectedPlacement.rotationDeg}
                  min={-180}
                  max={180}
                  step={0.5}
                  onChange={(value) =>
                    actions.updatePlacement(selectedPlacement.id, { rotationDeg: value }, 'Rotate artwork')
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
                    actions.updatePlacement(selectedPlacement.id, { opacity: value }, 'Change artwork opacity')
                  }
                  format={(value) => `${Math.round(value * 100)}%`}
                />
                <Toggle
                  label={t('projection.visible')}
                  checked={selectedPlacement.visible}
                  onChange={(checked) =>
                    actions.updatePlacement(selectedPlacement.id, { visible: checked }, 'Toggle visibility')
                  }
                />
                <Toggle
                  label={t('projection.locked')}
                  checked={selectedPlacement.locked}
                  onChange={(checked) =>
                    actions.updatePlacement(selectedPlacement.id, { locked: checked }, 'Lock placement')
                  }
                />
              </PanelBody>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader title="Select a placement" icon={<MousePointer2 size={15} />} />
              <PanelBody>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Click artwork in the panel preview or choose a row from the placement list to
                  edit its position, scale, rotation, and opacity.
                </p>
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="UV diagnostics" icon={<Scan size={15} />} />
            <PanelBody>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td className="muted">Layout</td>
                    <td className="num">{panel.uv.layout ?? 'Unknown'}</td>
                  </tr>
                  <tr>
                    <td className="muted">UV island size</td>
                    <td className="num">
                      {panel.dimensionsMm.width} × {panel.dimensionsMm.height} mm
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">Outer faces</td>
                    <td className="num">{panel.uv.outerFaceCount ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="muted">Overlap</td>
                    <td className="num">{panel.uv.overlapDetected ? 'Detected' : 'Not detected'}</td>
                  </tr>
                  <tr>
                    <td className="muted">Mapping</td>
                    <td className="num">UV space (alpha)</td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny dim" style={{ marginTop: 8 }}>
                {panel.uv.note ?? 'No additional UV notes were supplied by the asset.'} Distortion
                heatmaps and seam-aware projection are not implemented yet.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Projection methods" subtitle="Status in this alpha" />
            <PanelBody>
              <div className="issue pass">
                <span className="issue-icon mono">✓</span>
                <div>
                  <strong>UV-based placement</strong>
                  <p>Implemented: artwork is positioned in panel UV space and saved with the project.</p>
                </div>
              </div>
              <div className="issue" style={{ marginTop: 6 }}>
                <span className="issue-icon mono">◇</span>
                <div>
                  <strong>Planar and camera projection</strong>
                  <p>Roadmap: needs ray casting, projection bounds, and depth bias.</p>
                </div>
              </div>
              <div className="issue" style={{ marginTop: 6 }}>
                <span className="issue-icon mono">◇</span>
                <div>
                  <strong>Surface-conformed artwork</strong>
                  <p>Roadmap: needs mesh-conforming decals and distortion diagnostics.</p>
                </div>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  options: {
    panel: PanelDefinition;
    placements: Placement[];
    artworks: ArtworkAsset[];
    selectedPlacementId: string | null;
    dragPreview: DragPreview | null;
    safeMarginMm: number;
  },
): void {
  const { panel, placements, artworks, selectedPlacementId, dragPreview, safeMarginMm } = options;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const line = Math.max(1, width / 900);
  const safeX = (safeMarginMm / panel.dimensionsMm.width) * width;
  const safeY = (safeMarginMm / panel.dimensionsMm.height) * height;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = line;
  ctx.setLineDash([line * 6, line * 4]);
  ctx.strokeRect(safeX, safeY, width - safeX * 2, height - safeY * 2);

  ctx.strokeStyle = 'rgba(255, 122, 69, 0.45)';
  ctx.setLineDash([line * 3, line * 5]);
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const placement of placements) {
    const artwork = artworks.find((item) => item.id === placement.artworkId);
    const preview =
      dragPreview && dragPreview.id === placement.id
        ? { ...placement, u: dragPreview.u, v: dragPreview.v }
        : placement;
    const bounds = placementBounds(preview, panel, artwork);
    const x = bounds.left * width;
    const y = (1 - bounds.top) * height;
    const w = (bounds.right - bounds.left) * width;
    const h = (bounds.top - bounds.bottom) * height;
    const selected = placement.id === selectedPlacementId;
    ctx.strokeStyle = selected ? '#ff7a45' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = selected ? line * 2.2 : line;
    ctx.strokeRect(x, y, w, h);
    if (selected) {
      ctx.fillStyle = 'rgba(255, 122, 69, 0.12)';
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
