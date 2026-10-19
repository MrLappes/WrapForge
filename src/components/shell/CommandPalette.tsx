import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore, type NavView } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { captureActiveViewport } from '../../lib/autosave';
import { useTranslation, translate, type TranslationKey } from '../../lib/i18n';

interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  run: () => void;
  enabled: boolean;
}

export function CommandPalette() {
  const { t, language } = useTranslation();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setView = useUiStore((state) => state.setView);
  const setModal = useUiStore((state) => state.setModal);
  const setTheme = useUiStore((state) => state.setTheme);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const theme = useUiStore((state) => state.theme);
  const hasProject = useProjectStore((state) => state.project !== null);
  const actions = useProjectActions();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo<Command[]>(() => {
    const nav = (view: NavView, labelKey: TranslationKey): Command => ({
      id: `nav-${view}`,
      label: t(labelKey),
      group: 'Navigate',
      run: () => setView(view),
      enabled: view === 'home' || view === 'library' || view === 'preferences' || view === 'diagnostics' || hasProject,
    });
    const projectCommands: Command[] = [
      {
        id: 'new-project',
        label: t('action.newProject'),
        group: 'File',
        shortcut: 'Ctrl N',
        run: () => setModal('new'),
        enabled: true,
      },
      {
        id: 'open-project',
        label: t('action.openProject'),
        group: 'File',
        shortcut: 'Ctrl O',
        run: () => setModal('open'),
        enabled: true,
      },
      {
        id: 'save',
        label: t('action.save'),
        group: 'File',
        shortcut: 'Ctrl S',
        run: () => void actions.saveProject({ thumbnailDataUrl: captureActiveViewport() ?? undefined }),
        enabled: hasProject,
      },
      {
        id: 'save-as',
        label: t('action.saveAs'),
        group: 'File',
        shortcut: 'Ctrl Shift S',
        run: () => void actions.saveProjectAs(captureActiveViewport() ?? undefined),
        enabled: hasProject,
      },
      {
        id: 'import-artwork',
        label: t('action.importArtwork'),
        group: 'Edit',
        shortcut: 'Ctrl I',
        run: () => void actions.importArtwork(),
        enabled: hasProject,
      },
      {
        id: 'close-project',
        label: t('action.closeProject'),
        group: 'File',
        run: () => void actions.closeProject(),
        enabled: hasProject,
      },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? t('theme.light') : t('theme.dark'),
        group: 'View',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        enabled: true,
      },
      {
        id: 'toggle-language',
        label: language === 'en' ? 'Deutsch' : 'English',
        group: 'View',
        run: () => setLanguage(language === 'en' ? 'de' : 'en'),
        enabled: true,
      },
      {
        id: 'shortcuts',
        label: `Keyboard ${t('menu.shortcut')}`,
        group: 'Help',
        run: () => setModal('shortcuts'),
        enabled: true,
      },
    ];
    return [
      ...projectCommands,
      nav('home', 'nav.home'),
      nav('vehicle', 'nav.vehicle'),
      nav('studio', 'nav.studio'),
      nav('artwork', 'nav.artwork'),
      nav('panels', 'nav.panels'),
      nav('projection', 'nav.projection'),
      nav('print', 'nav.print'),
      nav('render', 'nav.render'),
      nav('export', 'nav.export'),
      nav('library', 'nav.library'),
      nav('preferences', 'nav.preferences'),
      nav('diagnostics', 'nav.diagnostics'),
    ];
  }, [actions, hasProject, language, setLanguage, setModal, setTheme, setView, t, theme]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands.filter((command) => command.enabled);
    return commands.filter(
      (command) =>
        command.enabled &&
        (command.label.toLowerCase().includes(needle) ||
          command.group.toLowerCase().includes(needle)),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const execute = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  return createPortal(
    <div
      className="command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="command-panel" role="dialog" aria-modal="true" aria-label={t('action.commands')}>
        <input
          ref={inputRef}
          className="command-input"
          placeholder={t('commands.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              execute(filtered[activeIndex]);
            }
          }}
          aria-label={translate(language, 'commands.placeholder')}
        />
        <div className="command-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ border: 0, minHeight: 120 }}>
              <strong>{t('commands.empty')}</strong>
            </div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`command-item ${index === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => execute(command)}
              >
                <span>{command.label}</span>
                <span className="command-group">{command.group}</span>
                {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
              </button>
            ))
          )}
        </div>
        <div className="command-footer">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
