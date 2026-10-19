import { useEffect, useState } from 'react';
import {
  ArrowRight,
  FolderOpen,
  Layers3,
  Palette,
  Plus,
  Ruler,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { platform } from '../../lib/platform';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import type { RecentProject } from '../../lib/project/schema';
import { Badge, Button, EmptyState, Field, Panel, PanelBody, PanelHeader, Spinner, TextInput } from '../../components/ui';

const SAMPLE_HERO = `${import.meta.env.BASE_URL}sample-vehicle/previews/hero.png`;
const SAMPLE_THUMB = `${import.meta.env.BASE_URL}sample-vehicle/previews/thumbnail.png`;

export function HomeView() {
  const { t } = useTranslation();
  const actions = useProjectActions();
  const project = useProjectStore((state) => state.project);
  const recentVersion = useUiStore((state) => state.recentVersion);
  const setView = useUiStore((state) => state.setView);
  const setModal = useUiStore((state) => state.setModal);
  const busy = useUiStore((state) => state.busy);
  const [name, setName] = useState('Untitled wrap');
  const [recent, setRecent] = useState<RecentProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    platform
      .listRecentProjects()
      .then((entries) => {
        if (!cancelled) setRecent(entries);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [recentVersion]);

  const create = async () => {
    const ok = await actions.newProject(name);
    if (ok) setName('Untitled wrap');
  };

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-kicker">
          <Sparkles size={12} />
          Open-source wrap studio · alpha
        </div>
        <h1 className="home-title">
          Design the wrap.
          <br />
          <em>Not the workaround.</em>
        </h1>
        <p className="home-lead">
          A local-first studio for vehicle graphics: panel-aware 3D placement, source-preserving
          SVG artwork, and production checks that tell you when an export is still a draft.
        </p>

        <div className="hero-card">
          <img src={SAMPLE_HERO} alt="Original WrapForge sample hatchback in the studio" />
          <div className="hero-overlay">
            <div>
              <h2>WrapForge Sample Hatch</h2>
              <p>Original CC0 geometry · 13 wrap panels · 4.30 m × 1.82 m × 1.48 m</p>
            </div>
            <div className="hero-actions">
              <Button variant="primary" onClick={() => setModal('new')}>
                <Plus size={14} />
                {t('home.create')}
              </Button>
            </div>
          </div>
        </div>

        <div className="home-features">
          <div className="feature-tile">
            <Layers3 size={17} />
            <h3>Panel-aware placement</h3>
            <p>Artwork lives in panel UV space, so it survives save, reload, and rendering.</p>
          </div>
          <div className="feature-tile">
            <Palette size={17} />
            <h3>Editable source artwork</h3>
            <p>SVGs stay vector sources. Live text is preserved and flagged before production.</p>
          </div>
          <div className="feature-tile">
            <Ruler size={17} />
            <h3>Honest print math</h3>
            <p>Physical sizes, bleed, DPI, and safe margins are computed and validated.</p>
          </div>
        </div>
      </div>

      <div className="home-side">
        {project ? (
          <Panel>
            <PanelHeader
              title="Current project"
              subtitle={project.vehicle.displayName}
              actions={<Badge variant="accent">Open</Badge>}
            />
            <PanelBody>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 7,
                    background: project.vehicle.paintColor,
                    border: '1px solid var(--border-strong)',
                    flex: '0 0 auto',
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{project.name}</strong>
                  <div className="tiny dim">
                    {project.vehicle.panels.length} panels · {project.artwork.length} artwork ·{' '}
                    {project.placements.length} placements
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => setView('studio')}>
                  Continue in studio
                  <ArrowRight size={13} />
                </Button>
                <Button onClick={() => setView('vehicle')}>Vehicle setup</Button>
                <Button
                  variant="ghost"
                  onClick={() => void actions.closeProject()}
                >
                  {t('action.closeProject')}
                </Button>
              </div>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel className="new-project-form">
          <PanelHeader title={t('action.newProject')} subtitle={t('home.createHint')} />
          <PanelBody>
            <Field label={t('home.projectName')} htmlFor="home-project-name">
              <div className="input-row">
                <TextInput
                  id="home-project-name"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  maxLength={120}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && name.trim() && !busy) void create();
                  }}
                />
                <Button
                  variant="primary"
                  onClick={() => void create()}
                  disabled={busy || name.trim().length === 0}
                >
                  {busy ? <Spinner /> : <Plus size={14} />}
                  {t('home.create')}
                </Button>
              </div>
            </Field>
            <div className="small muted" style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <ShieldCheck size={14} style={{ marginTop: 2, flex: '0 0 auto', color: 'var(--green)' }} />
              <span>
                Starts with the original CC0 sample hatchback. No account, no network call, no
                telemetry.
              </span>
            </div>
            {platform.kind === 'browser' ? (
              <p className="tiny dim" style={{ marginTop: 8 }}>
                Browser preview: projects are stored in local browser storage. The desktop build
                writes real .wrapforge folders.
              </p>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={t('home.recent')}
            actions={
              platform.kind === 'desktop' ? (
                <Button size="sm" variant="ghost" onClick={() => setModal('open')}>
                  <FolderOpen size={13} />
                  {t('home.open')}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setModal('open')}>
                  {t('home.open')}
                </Button>
              )
            }
          />
          <PanelBody tight>
            {recent === null ? (
              <div style={{ padding: 12 }}>
                <Spinner label="Loading…" />
              </div>
            ) : recent.length === 0 ? (
              <EmptyState icon={<FolderOpen size={20} />} title={t('home.noRecent')}>
                Projects appear here after their first save.
              </EmptyState>
            ) : (
              <div className="recent-list">
                {recent.slice(0, 8).map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    className="recent-item"
                    onClick={() => void actions.open(entry.path)}
                    title={entry.path}
                  >
                    <span className="recent-thumb">
                      {entry.thumbnailDataUrl ? (
                        <img src={entry.thumbnailDataUrl} alt="" />
                      ) : (
                        <img src={SAMPLE_THUMB} alt="" />
                      )}
                    </span>
                    <span className="recent-meta">
                      <strong>{entry.name}</strong>
                      <span>{new Date(entry.updatedAt).toLocaleString()}</span>
                    </span>
                    <ArrowRight size={13} className="dim" />
                  </button>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>

        <div className="issue info" style={{ margin: 0 }}>
          <ShieldCheck size={15} className="issue-icon" />
          <div>
            <strong>Licensed sample data</strong>
            <p>
              The sample vehicle and artwork are original CC0 assets. No manufacturer CAD,
              configurator data, trademarks, or third-party logos are bundled.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
