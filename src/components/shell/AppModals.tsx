import { useEffect, useState } from 'react';
import { FolderOpen, Keyboard, Plus, ShieldCheck } from 'lucide-react';
import { platform } from '../../lib/platform';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import type { RecentProject } from '../../lib/project/schema';
import { Button, Dialog, EmptyState, Field, Spinner, TextInput } from '../ui';
import { APP_VERSION } from '../../lib/project/schema';

const SAMPLE_THUMB = `${import.meta.env.BASE_URL}sample-vehicle/previews/thumbnail.png`;

export function NewProjectDialog() {
  const open = useUiStore((state) => state.modal === 'new');
  const setModal = useUiStore((state) => state.setModal);
  const busy = useUiStore((state) => state.busy);
  const { t } = useTranslation();
  const actions = useProjectActions();
  const [name, setName] = useState('Untitled wrap');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('Untitled wrap');
      setError(null);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      title={t('action.newProject')}
      description={t('home.createHint')}
      onClose={() => setModal(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => setModal(null)}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || name.trim().length === 0}
            onClick={async () => {
              const ok = await actions.newProject(name);
              if (ok) setModal(null);
              else setError('Could not create the project. Check the notification for details.');
            }}
          >
            {busy ? <Spinner /> : <Plus size={14} />}
            {t('home.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'start' }}>
        <div
          style={{
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--panel-alt)',
          }}
        >
          <img src={SAMPLE_THUMB} alt="WrapForge sample hatchback" style={{ width: '100%', display: 'block' }} />
        </div>
        <div>
          <Field label={t('home.projectName')} htmlFor="new-project-name">
            <TextInput
              id="new-project-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={120}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) {
                  void actions.newProject(name).then((ok) => {
                    if (ok) setModal(null);
                  });
                }
              }}
            />
          </Field>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {t('home.createHint')} The asset is an original CC0 model, not manufacturer data.
          </p>
          {error ? (
            <p className="small" style={{ color: 'var(--red)', marginTop: 10 }}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function OpenProjectDialog() {
  const open = useUiStore((state) => state.modal === 'open');
  const setModal = useUiStore((state) => state.setModal);
  const recentVersion = useUiStore((state) => state.recentVersion);
  const { t } = useTranslation();
  const actions = useProjectActions();
  const [recent, setRecent] = useState<RecentProject[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRecent(null);
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
  }, [open, recentVersion]);

  return (
    <Dialog
      open={open}
      title={t('action.openProject')}
      description={
        platform.kind === 'desktop'
          ? 'Choose a .wrapforge project folder, or open one of the recent projects.'
          : 'The browser preview keeps projects in local browser storage.'
      }
      onClose={() => setModal(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => setModal(null)}>
            {t('action.cancel')}
          </Button>
          {platform.kind === 'desktop' ? (
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await actions.openProjectPicker();
                if (ok) setModal(null);
              }}
            >
              <FolderOpen size={14} />
              Choose folder…
            </Button>
          ) : null}
        </>
      }
    >
      <div className="section-title">{t('home.recent')}</div>
      {recent === null ? (
        <Spinner label="Loading recent projects…" />
      ) : recent.length === 0 ? (
        <EmptyState icon={<FolderOpen size={22} />} title={t('home.noRecent')}>
          Create a project first, then save it to see it here.
        </EmptyState>
      ) : (
        <div className="recent-list">
          {recent.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="recent-item"
              onClick={async () => {
                const ok = await actions.open(entry.path);
                if (ok) setModal(null);
              }}
            >
              <span className="recent-thumb">
                {entry.thumbnailDataUrl ? (
                  <img src={entry.thumbnailDataUrl} alt="" />
                ) : (
                  <FolderOpen size={15} />
                )}
              </span>
              <span className="recent-meta">
                <strong>{entry.name}</strong>
                <span>
                  {entry.path} · {new Date(entry.updatedAt).toLocaleString()}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['New project', 'Ctrl N'],
  ['Open project', 'Ctrl O'],
  ['Save', 'Ctrl S'],
  ['Save as', 'Ctrl Shift S'],
  ['Import artwork', 'Ctrl I'],
  ['Undo', 'Ctrl Z'],
  ['Redo', 'Ctrl Shift Z'],
  ['Command palette', 'Ctrl K'],
  ['Close dialog / palette', 'Esc'],
  ['Delete selected placement', 'Delete'],
];

export function ShortcutsDialog() {
  const open = useUiStore((state) => state.modal === 'shortcuts');
  const setModal = useUiStore((state) => state.setModal);
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      title={t('menu.shortcut')}
      onClose={() => setModal(null)}
      footer={
        <Button variant="primary" onClick={() => setModal(null)}>
          {t('common.close')}
        </Button>
      }
    >
      <table className="data-table">
        <tbody>
          {SHORTCUTS.map(([label, shortcut]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">
                <span className="kbd">{shortcut}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny dim" style={{ marginTop: 12 }}>
        Shortcuts are fixed in this alpha; configurable key bindings are tracked on the roadmap.
      </p>
    </Dialog>
  );
}

export function AboutDialog() {
  const open = useUiStore((state) => state.modal === 'about');
  const setModal = useUiStore((state) => state.setModal);
  return (
    <Dialog
      open={open}
      title="About WrapForge"
      onClose={() => setModal(null)}
      footer={
        <Button variant="primary" onClick={() => setModal(null)}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="brand-mark" style={{ width: 38, height: 38, fontSize: 18 }}>
          W
        </div>
        <div>
          <h3 className="mono" style={{ margin: 0, fontSize: 14 }}>
            WrapForge {APP_VERSION}
          </h3>
          <p className="small muted" style={{ margin: '3px 0 0' }}>
            Open-source vehicle wrap design studio. Offline-first, no account required.
          </p>
        </div>
      </div>
      <div className="issue info">
        <ShieldCheck size={15} className="issue-icon" />
        <div>
          <strong>Privacy</strong>
          <p>
            WrapForge does not include telemetry, cloud accounts, or automatic uploads. Projects,
            artwork, and renders stay on this machine. Blender runs locally.
          </p>
        </div>
      </div>
      <div className="issue" style={{ marginTop: 8 }}>
        <Keyboard size={15} className="issue-icon" />
        <div>
          <strong>License</strong>
          <p>
            Application source: Apache-2.0. Sample vehicle and sample artwork: original CC0-1.0
            assets created for this repository. Third-party dependencies keep their own licenses;
            see NOTICE.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
