import { useMemo, useState } from 'react';
import { Box, Layers, Ruler, Scan, ArrowRight } from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useTranslation } from '../../lib/i18n';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Select,
  Stat,
  TextInput,
} from '../../components/ui';

export function PanelsView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const selectedPanelId = useUiStore((state) => state.selectedPanelId);
  const selectPanel = useUiStore((state) => state.selectPanel);
  const setView = useUiStore((state) => state.setView);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [side, setSide] = useState('all');

  const filtered = useMemo(() => {
    if (!project) return [];
    const needle = query.trim().toLowerCase();
    return project.vehicle.panels.filter((panel) => {
      if (category !== 'all' && panel.category !== category) return false;
      if (side !== 'all' && panel.side !== side) return false;
      if (needle && !panel.name.toLowerCase().includes(needle) && !panel.id.includes(needle)) {
        return false;
      }
      return true;
    });
  }, [project, query, category, side]);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<Box size={26} />} title="No project open">
          Open a project to inspect panel metadata.
        </EmptyState>
      </div>
    );
  }

  const selected = project.vehicle.panels.find((panel) => panel.id === selectedPanelId) ?? null;
  const wrapable = project.vehicle.panels.filter((panel) => panel.wrapable);
  const totalArea = wrapable.reduce((sum, panel) => sum + (panel.areaM2 ?? 0), 0);
  const uvReady = wrapable.filter((panel) => panel.uv.hasUv).length;
  const categories = [...new Set(project.vehicle.panels.map((panel) => panel.category))].sort();
  const sides = [...new Set(project.vehicle.panels.map((panel) => panel.side))].sort();
  const placementsForSelected = selected
    ? project.placements.filter((placement) => placement.panelId === selected.id)
    : [];

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('panels.title')}</h1>
          <p>{t('panels.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => setView('studio')}>
            Open 3D studio
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <Stat label="Wrap-able panels" value={wrapable.length} />
        <Stat label="Total panel area" value={totalArea.toFixed(2)} unit="m²" />
        <Stat label="UV-ready panels" value={`${uvReady}/${wrapable.length}`} />
        <Stat label="Placements" value={project.placements.length} />
      </div>

      <div className="split">
        <Panel>
          <PanelHeader
            title="Panel inventory"
            subtitle={`${filtered.length} of ${project.vehicle.panels.length} panels`}
            icon={<Layers size={15} />}
            actions={
              <Badge variant="accent">{project.vehicle.displayName}</Badge>
            }
          />
          <PanelBody>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Filter panels…"
                style={{ flex: '1 1 180px' }}
                aria-label="Filter panels"
              />
              <Select
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
                style={{ width: 130 }}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              <Select
                value={side}
                onChange={(event) => setSide(event.currentTarget.value)}
                style={{ width: 110 }}
                aria-label="Filter by side"
              >
                <option value="all">All sides</option>
                {sides.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Panel</th>
                  <th>Category</th>
                  <th>Side</th>
                  <th className="num">Size (mm)</th>
                  <th className="num">Area (m²)</th>
                  <th>UV</th>
                  <th className="num">Art</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((panel) => {
                  const count = project.placements.filter(
                    (placement) => placement.panelId === panel.id,
                  ).length;
                  return (
                    <tr
                      key={panel.id}
                      onClick={() => selectPanel(panel.id)}
                      style={{
                        cursor: 'pointer',
                        background:
                          panel.id === selectedPanelId ? 'var(--accent-soft)' : undefined,
                      }}
                    >
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span>{panel.name}</span>
                          {!panel.wrapable ? <Badge>No wrap</Badge> : null}
                        </div>
                      </td>
                      <td className="muted">{panel.category}</td>
                      <td className="muted">{panel.side}</td>
                      <td className="num">
                        {panel.dimensionsMm.width} × {panel.dimensionsMm.height}
                      </td>
                      <td className="num">{(panel.areaM2 ?? 0).toFixed(3)}</td>
                      <td>
                        <Badge variant={panel.uv.hasUv ? 'green' : 'amber'}>
                          {panel.uv.hasUv ? 'Planar' : 'Missing'}
                        </Badge>
                      </td>
                      <td className="num">{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PanelBody>
        </Panel>

        <div className="stack">
          <Panel>
            <PanelHeader
              title={selected ? selected.name : 'Select a panel'}
              subtitle={selected ? selected.id : 'Panel metadata from the vehicle asset'}
              icon={<Scan size={15} />}
              actions={
                selected ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setView('studio');
                    }}
                  >
                    Studio
                  </Button>
                ) : null
              }
            />
            <PanelBody>
              {selected ? (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Badge variant="accent">{selected.category}</Badge>
                    <Badge>{selected.side}</Badge>
                    <Badge variant={selected.wrapable ? 'green' : 'amber'}>
                      {selected.wrapable ? t('panels.wrapable') : t('panels.nonWrap')}
                    </Badge>
                  </div>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td className="muted">{t('panels.dimensions')}</td>
                        <td className="num">
                          {selected.dimensionsMm.width} × {selected.dimensionsMm.height} mm
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('panels.area')}</td>
                        <td className="num">{(selected.areaM2 ?? 0).toFixed(4)} m²</td>
                      </tr>
                      <tr>
                        <td className="muted">Outward axis</td>
                        <td className="num">{selected.outwardAxis}</td>
                      </tr>
                      <tr>
                        <td className="muted">Mesh object</td>
                        <td className="num">{selected.objectName}</td>
                      </tr>
                      <tr>
                        <td className="muted">{t('panels.uv')}</td>
                        <td className="num">
                          {selected.uv.layout ?? 'Unknown'}
                          {selected.uv.outerFaceCount
                            ? ` · ${selected.uv.outerFaceCount} outer face`
                            : ''}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">UV overlap</td>
                        <td>
                          <Badge variant={selected.uv.overlapDetected ? 'red' : 'green'}>
                            {selected.uv.overlapDetected ? 'Detected' : 'Not detected'}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {selected.uv.note ? (
                    <p className="tiny dim" style={{ marginTop: 8 }}>
                      {selected.uv.note}
                    </p>
                  ) : null}
                  <div className="section-title" style={{ marginTop: 14 }}>
                    <Ruler size={12} />
                    Artwork on this panel
                  </div>
                  {placementsForSelected.length === 0 ? (
                    <p className="small muted">No artwork placed on this panel.</p>
                  ) : (
                    <ul className="small" style={{ margin: 0, paddingLeft: 16 }}>
                      {placementsForSelected.map((placement) => (
                        <li key={placement.id}>
                          {placement.name} · {Math.round(placement.widthFraction * 100)}% width
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="small muted">
                  Select a row to inspect dimensions, UV metadata, and artwork coverage.
                </p>
              )}
            </PanelBody>
          </Panel>

          <div className="issue info" style={{ margin: 0 }}>
            <Scan size={15} className="issue-icon" />
            <div>
              <strong>About these panels</strong>
              <p>
                The sample asset has one planar outer-face UV island per panel. Bevel and edge faces
                collapse to a corner, so artwork is not stretched onto edge geometry. Real vehicle
                assets may need seam review and manual UV correction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
