import { useEffect, useState } from 'react';
import { Car, FileJson, Library, Plus, ShieldCheck } from 'lucide-react';
import { platform } from '../../lib/platform';
import { confirmAction } from '../../lib/platform/dialogs';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import type { VehicleManifest } from '../../lib/project/schema';
import {
  Badge,
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Stat,
} from '../../components/ui';

const HERO = `${import.meta.env.BASE_URL}sample-vehicle/previews/hero.png`;

export function AssetLibraryView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const dirty = useProjectStore((state) => state.dirty);
  const actions = useProjectActions();
  const ui = useUiStore();
  const [manifest, setManifest] = useState<VehicleManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    platform
      .loadSampleManifest()
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createProject = async () => {
    if (project && dirty) {
      const confirmed = await confirmAction(
        'Replace the current project?',
        `"${project.name}" has unsaved changes. Creating the sample project will discard them.`,
        'Create sample project',
      );
      if (!confirmed) return;
    }
    await actions.newProject('Sample hatch wrap');
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('library.title')}</h1>
          <p>{t('library.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => void createProject()}>
            <Plus size={14} />
            New project from sample
          </Button>
        </div>
      </div>

      {error ? (
        <div className="issue error" style={{ marginBottom: 18 }}>
          <FileJson size={15} className="issue-icon" />
          <div>
            <strong>Could not load the sample manifest</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('library.bundled')}
              subtitle="One original sample asset ships with the alpha"
              icon={<Library size={15} />}
              actions={<Badge variant="green">CC0-1.0</Badge>}
            />
            <PanelBody>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'var(--panel-alt)',
                  }}
                >
                  <img src={HERO} alt="WrapForge Sample Hatch" style={{ width: '100%', display: 'block' }} />
                </div>
                <div>
                  <h2
                    style={{
                      margin: '0 0 3px',
                      fontFamily: 'var(--font-display)',
                      fontSize: 17,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {manifest?.displayName ?? 'WrapForge Sample Hatch'}
                  </h2>
                  <div className="small muted">
                    {manifest?.bodyStyle ?? 'Stylized 5-door hatchback'}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '10px 0' }}>
                    <Badge variant="accent">13 wrap panels</Badge>
                    <Badge>Procedural</Badge>
                    <Badge variant="teal">glTF 2.0</Badge>
                    <Badge variant="green">Redistributable</Badge>
                  </div>
                  <div className="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="muted">Length</span>
                      <span className="mono">{manifest?.dimensionsMm.length ?? 4300} mm</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="muted">Width</span>
                      <span className="mono">{manifest?.dimensionsMm.width ?? 1820} mm</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="muted">Height</span>
                      <span className="mono">{manifest?.dimensionsMm.height ?? 1480} mm</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="muted">Validation score</span>
                      <span className="mono">
                        {manifest?.validation.score ?? 86} / {manifest?.validation.maxScore ?? 100}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <Button variant="primary" size="sm" onClick={() => void createProject()}>
                      <Plus size={12} />
                      Use asset
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        ui.notify('info', 'Asset paths', 'model/vehicle.glb · manifest.json · previews/hero.png')
                      }
                    >
                      Show files
                    </Button>
                  </div>
                </div>
              </div>
              {manifest ? (
                <div className="stat-grid" style={{ marginTop: 16 }}>
                  <Stat label="Panels" value={manifest.panels.length} />
                  <Stat
                    label="UV-ready"
                    value={manifest.panels.filter((panel) => panel.uv.hasUv).length}
                  />
                  <Stat
                    label="Panel area"
                    value={manifest.panels
                      .reduce((sum, panel) => sum + (panel.areaM2 ?? 0), 0)
                      .toFixed(2)}
                    unit="m²"
                  />
                  <Stat label="License" value={manifest.license.id} />
                </div>
              ) : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Asset validation" icon={<ShieldCheck size={15} />} />
            <PanelBody>
              {manifest ? (
                <div className="issue-list">
                  {manifest.validation.checks.map((check) => (
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
              ) : (
                <p className="small muted">Loading validation report…</p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader title="License & provenance" icon={<ShieldCheck size={15} />} />
            <PanelBody>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td className="muted">License</td>
                    <td>{manifest?.license.name ?? 'Creative Commons Zero 1.0 Universal'}</td>
                  </tr>
                  <tr>
                    <td className="muted">SPDX</td>
                    <td className="mono">{manifest?.license.id ?? 'CC0-1.0'}</td>
                  </tr>
                  <tr>
                    <td className="muted">Attribution</td>
                    <td>{manifest?.license.attribution ?? 'WrapForge contributors'}</td>
                  </tr>
                  <tr>
                    <td className="muted">Source</td>
                    <td>{manifest?.license.source ?? 'Procedurally generated'}</td>
                  </tr>
                  <tr>
                    <td className="muted">Redistribution</td>
                    <td>
                      <Badge variant="green">
                        {manifest?.license.redistributionPermitted ? 'Permitted' : 'Check source'}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny dim" style={{ marginTop: 10 }}>
                The sample vehicle is not derived from manufacturer CAD, scans, or configurator data.
                No third-party logos or trademarks are bundled.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Asset pack format"
              subtitle="Documented and versioned"
              icon={<FileJson size={15} />}
            />
            <PanelBody>
              <div className="render-log" style={{ maxHeight: 210 }}>
{`vehicle/
  manifest.json      # required
  model/
    vehicle.glb      # glTF 2.0
    vehicle.blend    # optional source
  previews/
    hero.png
    thumbnail.png
  materials/         # optional
  panels/            # optional metadata
  uv/                # optional metadata`}
              </div>
              <p className="tiny dim" style={{ marginTop: 8 }}>
                The alpha validates the manifest with Zod at load time. Community asset installation,
                duplicate detection, and version tracking are planned; no installer is exposed yet.
              </p>
            </PanelBody>
          </Panel>

          <div className="issue info" style={{ margin: 0 }}>
            <Car size={15} className="issue-icon" />
            <div>
              <strong>Offline by design</strong>
              <p>
                WrapForge does not download vehicle models from manufacturers or online
                configurators. Assets must be installed locally with compatible licenses.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
