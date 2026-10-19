import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  Clipboard,
  Cpu,
  Download,
  FileWarning,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { platform } from '../../lib/platform';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useExportStore } from '../../lib/store/exportStore';
import { useTranslation } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/project/schema';
import {
  clearLogs,
  getLogSnapshot,
  subscribeLogs,
  type LogEntry,
} from '../../lib/diagnostics/log';
import type { BlenderInfo } from '../../lib/platform/types';
import {
  Badge,
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  Spinner,
  TextInput,
} from '../../components/ui';

export function DiagnosticsView() {
  const { t } = useTranslation();
  const ui = useUiStore();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const logs = useSyncExternalStore(subscribeLogs, getLogSnapshot, getLogSnapshot);
  const [detected, setDetected] = useState<BlenderInfo | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null);
  const [probing, setProbing] = useState(false);
  const [pathDraft, setPathDraft] = useState(ui.blenderPath);
  const [webgl, setWebgl] = useState<{ vendor: string; renderer: string } | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (gl && 'getExtension' in gl) {
      const context = gl as WebGLRenderingContext;
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      if (extension) {
        setWebgl({
          vendor: String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL)),
          renderer: String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)),
        });
      }
    }
  }, []);

  useEffect(() => {
    setPathDraft(ui.blenderPath);
  }, [ui.blenderPath]);

  const detect = async (path = ui.blenderPath) => {
    setDetecting(true);
    try {
      const info = await platform.discoverBlender(path);
      setDetected(info);
    } catch {
      setDetected({
        found: false,
        executable: null,
        displayName: null,
        via: 'none',
        version: null,
        compatibility: 'unknown',
        message: 'Blender detection failed.',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    void detect();
    // Detection only depends on the configured path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.blenderPath]);

  const runProbe = async () => {
    setProbing(true);
    try {
      const result = await platform.probeBlender(ui.blenderPath);
      setProbe(result);
      ui.notify('info', 'Blender probe complete', 'Capabilities were reported by Blender.');
    } catch (error) {
      ui.notify(
        'error',
        'Blender probe failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setProbing(false);
    }
  };

  const environment = {
    appVersion: APP_VERSION,
    runtime: platform.kind,
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
    },
    webgl,
    reducedMotion: ui.reducedMotion,
  };

  const bundle = {
    format: 'wrapforge-diagnostic-bundle',
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    environment,
    blender: {
      detection: detected,
      probe,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          schemaVersion: project.schemaVersion,
          vehicleAssetId: project.vehicle.assetId,
          panelCount: project.vehicle.panels.length,
          artworkCount: project.artwork.length,
          placementCount: project.placements.length,
          root: root ? redactPath(root) : null,
        }
      : null,
    logs: logs.map((entry) => ({
      ...entry,
      message: redactPath(entry.message),
      detail: entry.detail ? redactPath(entry.detail) : undefined,
    })),
    notes: [
      'No artwork, vehicle models, rendered images, or project files are included.',
      'Paths are redacted for common home-directory layouts before export.',
      'Review this JSON before sharing it with a maintainer.',
    ],
  };

  const exportBundle = async () => {
    try {
      const path = await platform.saveExport(
        `wrapforge-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
        { text: JSON.stringify(bundle, null, 2) },
      );
      if (path) {
        useExportStore.getState().add({
          kind: 'diagnostic',
          label: 'Diagnostic bundle',
          path,
          files: 1,
        });
        ui.notify('success', 'Diagnostic bundle exported', path);
      }
    } catch (error) {
      ui.notify(
        'error',
        'Could not export diagnostics',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
      ui.notify('success', 'Diagnostic summary copied');
    } catch {
      ui.notify('warning', 'Clipboard unavailable', 'Use Export diagnostic bundle instead.');
    }
  };

  const lastError = [...logs].reverse().find((entry) => entry.level === 'error');

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('diagnostics.title')}</h1>
          <p>
            Local diagnostics for Blender, the application runtime, and recent errors. Nothing is
            uploaded automatically.
          </p>
        </div>
        <div className="page-actions">
          <Button onClick={() => void copySummary()}>
            <Clipboard size={14} />
            Copy summary
          </Button>
          <Button variant="primary" onClick={() => void exportBundle()}>
            <Download size={14} />
            {t('diagnostics.bundle')}
          </Button>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('diagnostics.blender')}
              icon={<Cpu size={15} />}
              actions={
                <Button size="sm" variant="ghost" onClick={() => void detect()} disabled={detecting}>
                  <RefreshCw size={12} />
                  {t('diagnostics.detect')}
                </Button>
              }
            />
            <PanelBody>
              <div className="input-row" style={{ marginBottom: 12 }}>
                <TextInput
                  value={pathDraft}
                  onChange={(event) => setPathDraft(event.currentTarget.value)}
                  placeholder="Auto-detect Blender"
                  className="mono"
                  aria-label="Blender executable path"
                />
                <Button
                  onClick={() => {
                    ui.setBlenderPath(pathDraft.trim());
                    void detect(pathDraft.trim());
                  }}
                >
                  Apply
                </Button>
              </div>
              {detecting ? (
                <Spinner label="Detecting Blender…" />
              ) : detected ? (
                <>
                  <div className={`issue ${detected.found ? 'pass' : 'warning'}`}>
                    <Cpu size={15} className="issue-icon" />
                    <div>
                      <strong>
                        {detected.found
                          ? `${detected.displayName ?? 'Blender'} ${detected.version ?? ''}`
                          : t('diagnostics.notFound')}
                      </strong>
                      <p>{detected.message}</p>
                    </div>
                  </div>
                  <table className="data-table" style={{ marginTop: 10 }}>
                    <tbody>
                      <tr>
                        <td className="muted">Executable</td>
                        <td className="mono" style={{ fontSize: 9.5, wordBreak: 'break-all' }}>
                          {detected.executable ?? '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('diagnostics.via')}</td>
                        <td>{detected.via}</td>
                      </tr>
                      <tr>
                        <td className="muted">{t('diagnostics.version')}</td>
                        <td className="mono">{detected.version ?? '—'}</td>
                      </tr>
                      <tr>
                        <td className="muted">{t('diagnostics.compatibility')}</td>
                        <td>
                          <Badge
                            variant={
                              detected.compatibility === 'tested'
                                ? 'green'
                                : detected.compatibility === 'unsupported'
                                  ? 'red'
                                  : 'amber'
                            }
                          >
                            {detected.compatibility}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">{t('diagnostics.checkedAt')}</td>
                        <td className="mono">{new Date(detected.checkedAt).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10 }}>
                    <Button size="sm" onClick={() => void runProbe()} disabled={probing}>
                      {probing ? 'Probing…' : t('diagnostics.probe')}
                    </Button>
                  </div>
                  {probe ? (
                    <pre
                      className="render-log"
                      style={{ marginTop: 10, maxHeight: 260 }}
                    >
                      {JSON.stringify(probe, null, 2)}
                    </pre>
                  ) : null}
                </>
              ) : (
                <p className="small muted">Blender has not been checked yet.</p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t('diagnostics.logs')} icon={<Activity size={15} />} actions={
              <>
                <Button size="sm" variant="ghost" onClick={clearLogs} disabled={logs.length === 0}>
                  <Trash2 size={12} />
                  Clear
                </Button>
                <Badge>{logs.length}</Badge>
              </>
            } />
            <PanelBody tight>
              {logs.length === 0 ? (
                <div style={{ padding: 14 }}>
                  <p className="small muted" style={{ margin: 0 }}>
                    No application log entries yet. Errors, warnings, and completed actions appear
                    here and are capped at 300 entries.
                  </p>
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Level</th>
                        <th>Message</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...logs].reverse().map((entry, index) => (
                        <LogRow entry={entry} key={`${entry.timestamp}-${index}`} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader title={t('diagnostics.environment')} icon={<Monitor size={15} />} />
            <PanelBody>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td className="muted">Application</td>
                    <td className="mono">v{APP_VERSION}</td>
                  </tr>
                  <tr>
                    <td className="muted">Runtime</td>
                    <td>{platform.kind}</td>
                  </tr>
                  <tr>
                    <td className="muted">Language</td>
                    <td>{navigator.language}</td>
                  </tr>
                  <tr>
                    <td className="muted">Timezone</td>
                    <td>{environment.timezone}</td>
                  </tr>
                  <tr>
                    <td className="muted">CPU threads</td>
                    <td className="mono">{navigator.hardwareConcurrency}</td>
                  </tr>
                  <tr>
                    <td className="muted">Screen</td>
                    <td className="mono">
                      {window.screen.width} × {window.screen.height} @ {window.devicePixelRatio}x
                    </td>
                  </tr>
                  <tr>
                    <td className="muted">WebGL</td>
                    <td className="mono" style={{ fontSize: 9.5 }}>
                      {webgl ? `${webgl.vendor} · ${webgl.renderer}` : 'Not reported'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny dim" style={{ marginTop: 8 }}>
                WebGL is used by the interactive viewport. Blender uses its own rendering backend;
                this string does not prove Blender GPU rendering is active.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Last backend error" icon={<FileWarning size={15} />} />
            <PanelBody>
              {lastError ? (
                <div className="issue error">
                  <FileWarning size={15} className="issue-icon" />
                  <div>
                    <strong>{lastError.message}</strong>
                    <p>{lastError.detail ?? lastError.timestamp}</p>
                  </div>
                </div>
              ) : (
                <p className="small muted">No backend error has been recorded in this session.</p>
              )}
              <div className="tiny mono dim" style={{ marginTop: 10, wordBreak: 'break-all' }}>
                {root ? `${root}/renders/logs` : 'Save a project to create per-render logs.'}
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Privacy" icon={<ShieldCheck size={15} />} />
            <PanelBody>
              <div className="issue pass">
                <ShieldCheck size={15} className="issue-icon" />
                <div>
                  <strong>Diagnostic bundle contents</strong>
                  <p>
                    Versions, runtime information, Blender detection, a redacted project summary,
                    and redacted log entries. No artwork, vehicle files, renders, account data, or
                    credentials are included.
                  </p>
                </div>
              </div>
              <p className="tiny dim" style={{ marginTop: 8 }}>
                Review the JSON before sharing it. Exporting does not upload anything.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <tr>
      <td className="mono" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>
        {new Date(entry.timestamp).toLocaleTimeString()}
      </td>
      <td>
        <Badge variant={entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'amber' : 'teal'}>
          {entry.level}
        </Badge>
      </td>
      <td>{entry.message}</td>
      <td className="mono" style={{ fontSize: 9.5, maxWidth: 280 }}>
        <span title={entry.detail}>{entry.detail ? truncate(entry.detail, 120) : '—'}</span>
      </td>
    </tr>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function redactPath(value: string): string {
  return value
    .replace(/\/home\/[^/\s]+/g, '~')
    .replace(/\/Users\/[^/\s]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, '~');
}
