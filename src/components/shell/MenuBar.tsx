import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Moon, Redo2, Save, Search, Sun, Undo2 } from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { captureActiveViewport } from '../../lib/autosave';
import { IconButton } from '../ui';

interface MenuEntry {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

function Menu({
  label,
  entries,
  open,
  onToggle,
  onClose,
}: {
  label: string;
  entries: MenuEntry[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div className="menu-popover" role="menu">
          {entries.map((entry, index) =>
            entry.separator ? (
              <div className="menu-separator" key={`sep-${index}`} />
            ) : (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  onClose();
                  entry.onSelect?.();
                }}
                disabled={entry.disabled}
              >
                {entry.label}
                {entry.shortcut ? <span className="shortcut">{entry.shortcut}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MenuBar({ logo }: { logo: ReactNode }) {
  const { t } = useTranslation();
  const actions = useProjectActions();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const project = useProjectStore((state) => state.project);
  const dirty = useProjectStore((state) => state.dirty);
  const canUndo = useProjectStore((state) => state.undoStack.length > 0);
  const canRedo = useProjectStore((state) => state.redoStack.length > 0);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const setModal = useUiStore((state) => state.setModal);
  const setView = useUiStore((state) => state.setView);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const save = () => {
    void actions.saveProject({ thumbnailDataUrl: captureActiveViewport() ?? undefined });
  };

  const fileEntries: MenuEntry[] = [
    {
      label: t('action.newProject'),
      shortcut: 'Ctrl+N',
      onSelect: () => setModal('new'),
    },
    {
      label: t('action.openProject'),
      shortcut: 'Ctrl+O',
      onSelect: () => setModal('open'),
    },
    { separator: true, label: 'sep' },
    {
      label: t('action.save'),
      shortcut: 'Ctrl+S',
      onSelect: save,
      disabled: !project,
    },
    {
      label: t('action.saveAs'),
      shortcut: 'Ctrl+Shift+S',
      onSelect: () =>
        void actions.saveProjectAs(captureActiveViewport() ?? undefined),
      disabled: !project,
    },
    { separator: true, label: 'sep' },
    {
      label: t('action.closeProject'),
      onSelect: () => void actions.closeProject(),
      disabled: !project,
    },
    {
      label: t('nav.preferences'),
      onSelect: () => setView('preferences'),
    },
  ];

  const editEntries: MenuEntry[] = [
    { label: t('action.undo'), shortcut: 'Ctrl+Z', onSelect: undo, disabled: !canUndo },
    {
      label: t('action.redo'),
      shortcut: 'Ctrl+Shift+Z',
      onSelect: redo,
      disabled: !canRedo,
    },
    { separator: true, label: 'sep' },
    {
      label: t('action.importArtwork'),
      shortcut: 'Ctrl+I',
      onSelect: () => void actions.importArtwork(),
      disabled: !project,
    },
  ];

  const viewEntries: MenuEntry[] = [
    { label: t('nav.home'), onSelect: () => setView('home') },
    { label: t('nav.vehicle'), onSelect: () => setView('vehicle'), disabled: !project },
    { label: t('nav.studio'), onSelect: () => setView('studio'), disabled: !project },
    { label: t('nav.artwork'), onSelect: () => setView('artwork'), disabled: !project },
    { label: t('nav.panels'), onSelect: () => setView('panels'), disabled: !project },
    { label: t('nav.projection'), onSelect: () => setView('projection'), disabled: !project },
    { label: t('nav.print'), onSelect: () => setView('print'), disabled: !project },
    { label: t('nav.render'), onSelect: () => setView('render'), disabled: !project },
    { label: t('nav.export'), onSelect: () => setView('export'), disabled: !project },
    { separator: true, label: 'sep' },
    { label: t('nav.diagnostics'), onSelect: () => setView('diagnostics') },
    {
      label: theme === 'dark' ? t('theme.light') : t('theme.dark'),
      onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
  ];

  const helpEntries: MenuEntry[] = [
    {
      label: t('menu.shortcut'),
      shortcut: '?',
      onSelect: () => setModal('shortcuts'),
    },
    {
      label: 'About WrapForge',
      onSelect: () => setModal('about'),
    },
  ];

  return (
    <header className="menubar" ref={containerRef}>
      <div className="brand">
        {logo}
        <span className="brand-name">
          Wrap<span>Forge</span>
        </span>
      </div>
      <div className="menubar-menus">
        <Menu
          label={t('menu.file')}
          entries={fileEntries}
          open={openMenu === 'file'}
          onToggle={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
          onClose={() => setOpenMenu(null)}
        />
        <Menu
          label={t('menu.edit')}
          entries={editEntries}
          open={openMenu === 'edit'}
          onToggle={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}
          onClose={() => setOpenMenu(null)}
        />
        <Menu
          label={t('menu.view')}
          entries={viewEntries}
          open={openMenu === 'view'}
          onToggle={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
          onClose={() => setOpenMenu(null)}
        />
        <Menu
          label={t('menu.help')}
          entries={helpEntries}
          open={openMenu === 'help'}
          onToggle={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
          onClose={() => setOpenMenu(null)}
        />
      </div>

      <div className="menubar-project">
        {project ? (
          <>
            <span className={`dirty-dot ${dirty ? '' : 'clean'}`} title={dirty ? t('status.unsaved') : t('status.savedAt', { time: 'just now' })} />
            <strong title={project.name}>{project.name}</strong>
            {dirty ? <span className="tiny dim">{t('status.unsaved')}</span> : null}
          </>
        ) : (
          <span className="dim">{t('status.noProject')}</span>
        )}
      </div>

      <div className="menubar-spacer" />

      <div className="menubar-actions">
        <IconButton label={t('action.undo')} onClick={undo} disabled={!canUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label={t('action.redo')} onClick={redo} disabled={!canRedo}>
          <Redo2 size={15} />
        </IconButton>
        <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <IconButton label={t('action.save')} onClick={save} disabled={!project}>
          <Save size={15} />
        </IconButton>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setCommandPaletteOpen(true)}
          style={{ gap: 6 }}
          title="Command palette"
        >
          <Search size={13} />
          <span className="kbd">Ctrl K</span>
        </button>
        <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <IconButton
          label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
      </div>
    </header>
  );
}
