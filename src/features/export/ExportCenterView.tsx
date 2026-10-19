import type { ReactNode } from 'react';
import {
  Aperture,
  ArrowRight,
  CheckCircle2,
  Download,
  FileJson,
  FolderOpen,
  History,
  PackageOpen,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useExportStore } from '../../lib/store/exportStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { platform } from '../../lib/platform';
import { validatePrintProject } from '../../lib/print/validation';
import { Badge, Button, EmptyState, Panel, PanelBody, PanelHeader, Stat } from '../../components/ui';

export function ExportCenterView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const actions = useProjectActions();
  const entries = useExportStore((state) => state.entries);
  const clear = useExportStore((state) => state.clear);
  const setView = useUiStore((state) => state.setView);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<PackageOpen size={26} />} title="No project open">
          Open a project to prepare exports.
        </EmptyState>
      </div>
    );
  }

  const validation = validatePrintProject(project);
  const ready = validation.productionReady;
  const lastPrint = entries.find((entry) => entry.kind === 'print');
  const lastRender = entries.find((entry) => entry.kind === 'render');

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('export.title')}</h1>
          <p>{t('export.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => setView('print')}>
            <Printer size={14} />
            {t('nav.print')}
          </Button>
          <Button variant="primary" onClick={() => setView('render')}>
            <Aperture size={14} />
            {t('nav.render')}
          </Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <Stat
          label="Production label"
          value={<span style={{ fontSize: 14 }}>{ready ? 'PRINT-READY' : 'DRAFT'}</span>}
        />
        <Stat label="Selected panels" value={validation.selectedPanels.length} />
        <Stat label="Session exports" value={entries.length} />
        <Stat
          label="Project package"
          value={root ? 'Saved' : 'Not saved'}
        />
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader title="Export routes" subtitle="Each route writes real files; nothing is simulated." />
            <PanelBody>
              <div style={{ display: 'grid', gap: 10 }}>
                <ExportRoute
                  icon={<Printer size={17} />}
                  title="Print panels"
                  detail="PNG and SVG panel exports with bleed, safe margins, crop marks, and a validation manifest."
                  badge={ready ? 'print-ready' : 'draft only'}
                  badgeVariant={ready ? 'green' : 'amber'}
                  action={() => setView('print')}
                  actionLabel="Open print layout"
                />
                <ExportRoute
                  icon={<Aperture size={17} />}
                  title="Blender render"
                  detail="Offline render written into the project folder. Requires a detected Blender installation."
                  badge="desktop"
                  badgeVariant="teal"
                  action={() => setView('render')}
                  actionLabel="Open render studio"
                />
                <ExportRoute
                  icon={<FolderOpen size={17} />}
                  title="Project package"
                  detail="Versioned project.json, artwork sources, and a portable folder layout. Save or Save as writes atomically."
                  badge={root ? 'saved' : 'unsaved'}
                  badgeVariant={root ? 'green' : 'amber'}
                  action={() => void actions.saveProject()}
                  actionLabel={t('action.save')}
                />
                <ExportRoute
                  icon={<FileJson size={17} />}
                  title="Diagnostic bundle"
                  detail="Environment, Blender detection, and application logs. No artwork or project content is included by default."
                  badge="local"
                  badgeVariant="teal"
                  action={() => setView('diagnostics')}
                  actionLabel="Open diagnostics"
                />
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Export history"
              subtitle="This session only"
              icon={<History size={15} />}
              actions={
                entries.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={clear}>
                    <Trash2 size={12} />
                    Clear
                  </Button>
                ) : null
              }
            />
            <PanelBody tight>
              {entries.length === 0 ? (
                <div style={{ padding: 14 }}>
                  <EmptyState icon={<Download size={20} />} title="No exports this session">
                    Print packages, renders, and diagnostic bundles appear here after they are
                    written.
                  </EmptyState>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Label</th>
                      <th>Path</th>
                      <th className="num">Files</th>
                      <th className="num">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <Badge>{entry.kind}</Badge>
                        </td>
                        <td>{entry.label}</td>
                        <td className="mono" style={{ fontSize: 9.5, wordBreak: 'break-all' }}>
                          {entry.path}
                        </td>
                        <td className="num">{entry.files}</td>
                        <td className="num">
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader
              title="Readiness"
              icon={ready ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
              actions={<Badge variant={ready ? 'green' : 'amber'}>{ready ? 'ready' : 'draft'}</Badge>}
            />
            <PanelBody>
              <div className={`issue ${ready ? 'pass' : 'warning'}`}>
                {ready ? (
                  <CheckCircle2 size={15} className="issue-icon" />
                ) : (
                  <ShieldAlert size={15} className="issue-icon" />
                )}
                <div>
                  <strong>
                    {ready
                      ? 'All configured checks passed'
                      : `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`}
                  </strong>
                  <p>
                    {ready
                      ? 'Outputs may be labelled print-ready for this configuration. Real installation quality still depends on printer, material, and installer validation.'
                      : 'Outputs are labelled DRAFT. Review the print validation list before sharing production files.'}
                  </p>
                </div>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Selected panels</span>
                  <span className="mono">{validation.selectedPanels.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Target DPI</span>
                  <span className="mono">{project.print.dpi}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Colour mode</span>
                  <span className="mono">{project.print.colorMode.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Last print export</span>
                  <span className="mono">{lastPrint ? lastPrint.label : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Last render</span>
                  <span className="mono">{lastRender ? lastRender.label : '—'}</span>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Project" />
            <PanelBody>
              <div className="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted">Name</span>
                  <strong>{project.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted">Schema</span>
                  <span className="mono">v{project.schemaVersion}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted">Vehicle</span>
                  <span>{project.vehicle.displayName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted">License</span>
                  <span className="mono">{project.vehicle.license.id}</span>
                </div>
              </div>
              <p className="tiny mono dim" style={{ marginTop: 10, wordBreak: 'break-all' }}>
                {root ?? 'Not saved to disk yet'}
              </p>
              {root ? (
                <Button size="sm" onClick={() => void platform.openPath(root)}>
                  <FolderOpen size={12} />
                  Open project folder
                </Button>
              ) : null}
            </PanelBody>
          </Panel>

          <div className="issue info" style={{ margin: 0 }}>
            <PackageOpen size={15} className="issue-icon" />
            <div>
              <strong>No silent production claims</strong>
              <p>
                WrapForge labels outputs DRAFT unless the configured validation checks pass. Passing
                checks are not a guarantee of real-world installation quality.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportRoute({
  icon,
  title,
  detail,
  badge,
  badgeVariant,
  action,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  badge: string;
  badgeVariant: 'green' | 'amber' | 'teal';
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 7,
        background: 'var(--panel-alt)',
      }}
    >
      <span style={{ color: 'var(--accent)', marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12.5 }}>{title}</strong>
          <Badge variant={badgeVariant}>{badge}</Badge>
        </div>
        <p className="small muted" style={{ margin: '3px 0 8px' }}>
          {detail}
        </p>
        <Button size="sm" onClick={action}>
          {actionLabel}
          <ArrowRight size={12} />
        </Button>
      </div>
    </div>
  );
}
