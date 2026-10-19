import { Car, Box, ShieldCheck, Ruler, Palette, Layers, ArrowRight, Wand2 } from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useTranslation } from '../../lib/i18n';
import { useProjectActions } from '../../lib/useProjectActions';
import {
  Badge,
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  SectionTitle,
  Stat,
} from '../../components/ui';

const SWATCHES = [
  '#d9552f',
  '#f2f0ea',
  '#151a20',
  '#e8b53d',
  '#1f6f4a',
  '#245ec7',
  '#b13a7c',
  '#6a7381',
  '#8ecae6',
  '#e9c46a',
];

export function VehicleSetupView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const actions = useProjectActions();
  const setView = useUiStore((state) => state.setView);
  if (!project) {
    return (
      <div className="content">
        <div className="empty-state">
          <Car size={28} />
          <strong>No project open</strong>
          <p>Create or open a project to configure a vehicle.</p>
        </div>
      </div>
    );
  }

  const vehicle = project.vehicle;
  const validation = vehicle.validation;
  const wrapable = vehicle.panels.filter((panel) => panel.wrapable);

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('vehicle.title')}</h1>
          <p>
            The vehicle asset defines scale, panel boundaries, UV metadata, and licensing. Paint
            changes are non-destructive and saved with the project.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => void actions.importVehicleModel()}>
            <Wand2 size={14} />
            Import 3D model
          </Button>
          <Button onClick={() => setView('panels')}>
            <Layers size={14} />
            {t('nav.panels')}
          </Button>
          <Button variant="primary" onClick={() => setView('studio')}>
            Open 3D studio
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader
              title={vehicle.displayName}
              subtitle={vehicle.bodyStyle ?? 'Vehicle asset'}
              icon={<Car size={16} />}
              actions={
                <>
                  <Badge variant={vehicle.license.id.startsWith('CC0') ? 'green' : 'amber'}>
                    {vehicle.license.id.startsWith('CC0')
                      ? 'CC0 sample'
                      : vehicle.license.id === 'user-supplied'
                        ? 'User-supplied'
                        : vehicle.license.id}
                  </Badge>
                  <Badge variant="accent">{vehicle.panels.length} panels</Badge>
                </>
              }
            />
            <PanelBody>
              <div className="stat-grid" style={{ marginBottom: 14 }}>
                <Stat label="Length" value={vehicle.dimensionsMm.length} unit="mm" />
                <Stat label="Width" value={vehicle.dimensionsMm.width} unit="mm" />
                <Stat label="Height" value={vehicle.dimensionsMm.height} unit="mm" />
                <Stat label="Wrap panels" value={wrapable.length} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <SectionTitle>
                    <Ruler size={12} />
                    Dimensions
                  </SectionTitle>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td className="muted">Length</td>
                        <td className="num">{vehicle.dimensionsMm.length} mm</td>
                      </tr>
                      <tr>
                        <td className="muted">Width</td>
                        <td className="num">{vehicle.dimensionsMm.width} mm</td>
                      </tr>
                      <tr>
                        <td className="muted">Height</td>
                        <td className="num">{vehicle.dimensionsMm.height} mm</td>
                      </tr>
                      <tr>
                        <td className="muted">Source</td>
                        <td className="num">Generated geometry</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="tiny dim" style={{ marginTop: 8 }}>
                    Sample dimensions are measured from generated plate geometry. They are not
                    verified against a real vehicle. Scale calibration from a known manufacturer
                    dimension is on the roadmap.
                  </p>
                </div>
                <div>
                  <SectionTitle>
                    <ShieldCheck size={12} />
                    License & provenance
                  </SectionTitle>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td className="muted">License</td>
                        <td>{vehicle.license.id}</td>
                      </tr>
                      <tr>
                        <td className="muted">Attribution</td>
                        <td>{vehicle.license.attribution ?? '—'}</td>
                      </tr>
                      <tr>
                        <td className="muted">Redistribution</td>
                        <td>{vehicle.license.redistributionPermitted ? 'Permitted' : 'Check source'}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="tiny dim" style={{ marginTop: 8 }}>
                    {vehicle.license.source}
                  </p>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={t('vehicle.paint')}
              subtitle="Applied to every wrap panel; artwork textures are composed on top."
              icon={<Palette size={16} />}
            />
            <PanelBody>
              <div className="color-input" style={{ marginBottom: 12 }}>
                <input
                  type="color"
                  value={vehicle.paintColor}
                  onChange={(event) => actions.setPaintColor(event.currentTarget.value)}
                  aria-label="Base paint colour"
                />
                <input
                  className="input mono"
                  value={vehicle.paintColor.toUpperCase()}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(value)) actions.setPaintColor(value);
                  }}
                  maxLength={7}
                  aria-label="Base paint hex value"
                />
                <span
                  style={{
                    width: 74,
                    height: 30,
                    borderRadius: 5,
                    background: vehicle.paintColor,
                    border: '1px solid var(--border-strong)',
                  }}
                />
              </div>
              <div className="swatch-row">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`swatch ${vehicle.paintColor.toLowerCase() === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => actions.setPaintColor(color)}
                    aria-label={`Set paint colour ${color}`}
                    title={color}
                  />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('vehicle.validation')}
              actions={
                validation ? (
                  <Badge variant={validation.score >= 80 ? 'green' : 'amber'}>
                    {validation.score} / {validation.maxScore}
                  </Badge>
                ) : (
                  <Badge>Not recorded</Badge>
                )
              }
            />
            <PanelBody>
              {validation ? (
                <>
                  <div className="issue-list">
                    {validation.checks.map((check) => (
                      <div
                        className={`issue ${check.status === 'pass' ? 'pass' : check.status === 'warning' ? 'warning' : 'error'}`}
                        key={check.id}
                      >
                        <span className="issue-icon mono">
                          {check.status === 'pass' ? '✓' : check.status === 'warning' ? '!' : '×'}
                        </span>
                        <div>
                          <strong>{check.label}</strong>
                          <p>{check.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    {validation.method}
                  </p>
                </>
              ) : (
                <p className="small muted">This asset did not include a validation report.</p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={t('vehicle.panels')}
              subtitle={`${wrapable.length} wrap-able, ${vehicle.panels.length - wrapable.length} excluded`}
              icon={<Box size={16} />}
            />
            <PanelBody tight>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Panel</th>
                    <th>Category</th>
                    <th className="num">Size</th>
                    <th>UV</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicle.panels.map((panel) => (
                    <tr key={panel.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{panel.name}</span>
                          {!panel.wrapable ? <Badge>No wrap</Badge> : null}
                        </div>
                      </td>
                      <td className="muted">{panel.category}</td>
                      <td className="num">
                        {panel.dimensionsMm.width} × {panel.dimensionsMm.height}
                      </td>
                      <td>
                        <Badge variant={panel.uv.hasUv ? 'green' : 'amber'}>
                          {panel.uv.hasUv ? 'Planar' : 'Missing'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
