import {
  Aperture,
  Box,
  Car,
  ClipboardCheck,
  Grid3x3,
  House,
  Library,
  PackageOpen,
  PanelsTopLeft,
  PenTool,
  Printer,
  Settings2,
  Stethoscope,
} from 'lucide-react';
import { SCHEMA_VERSION } from '../../lib/project/schema';
import { useTranslation, type TranslationKey } from '../../lib/i18n';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore, type NavView } from '../../lib/store/uiStore';

interface NavEntry {
  id: NavView;
  labelKey: TranslationKey;
  icon: typeof House;
  requiresProject: boolean;
}

const GROUPS: Array<{ labelKey: 'nav.section.design' | 'nav.section.produce' | 'nav.section.system' | null; items: NavEntry[] }> = [
  {
    labelKey: null,
    items: [
      { id: 'home', labelKey: 'nav.home', icon: House, requiresProject: false },
      { id: 'vehicle', labelKey: 'nav.vehicle', icon: Car, requiresProject: true },
    ],
  },
  {
    labelKey: 'nav.section.design',
    items: [
      { id: 'studio', labelKey: 'nav.studio', icon: Box, requiresProject: true },
      { id: 'artwork', labelKey: 'nav.artwork', icon: PenTool, requiresProject: true },
      { id: 'panels', labelKey: 'nav.panels', icon: PanelsTopLeft, requiresProject: true },
      { id: 'projection', labelKey: 'nav.projection', icon: Grid3x3, requiresProject: true },
    ],
  },
  {
    labelKey: 'nav.section.produce',
    items: [
      { id: 'print', labelKey: 'nav.print', icon: Printer, requiresProject: true },
      { id: 'render', labelKey: 'nav.render', icon: Aperture, requiresProject: true },
      { id: 'export', labelKey: 'nav.export', icon: PackageOpen, requiresProject: true },
    ],
  },
  {
    labelKey: 'nav.section.system',
    items: [
      { id: 'library', labelKey: 'nav.library', icon: Library, requiresProject: false },
      { id: 'preferences', labelKey: 'nav.preferences', icon: Settings2, requiresProject: false },
      { id: 'diagnostics', labelKey: 'nav.diagnostics', icon: Stethoscope, requiresProject: false },
    ],
  },
];

export function Sidebar() {
  const { t } = useTranslation();
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const hasProject = useProjectStore((state) => state.project !== null);
  const panelCount = useProjectStore((state) => state.project?.vehicle.panels.length ?? 0);

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      {GROUPS.map((group, index) => (
        <div className="nav-group" key={group.labelKey ?? `group-${index}`}>
          {group.labelKey ? <div className="nav-group-label">{t(group.labelKey)}</div> : null}
          {group.items.map((item) => {
            const Icon = item.icon;
            const disabled = item.requiresProject && !hasProject;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => setView(item.id)}
                disabled={disabled}
                aria-current={view === item.id ? 'page' : undefined}
                title={disabled ? 'Open or create a project first' : t(item.labelKey)}
              >
                <Icon size={15} strokeWidth={1.8} />
                <span>{t(item.labelKey)}</span>
                {item.id === 'panels' && hasProject ? (
                  <span className="nav-badge">{panelCount}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClipboardCheck size={12} />
          <span>Alpha · schema v{SCHEMA_VERSION}</span>
        </div>
      </div>
    </aside>
  );
}
