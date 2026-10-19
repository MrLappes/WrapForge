import { useEffect } from 'react';
import { AppShell } from './components/shell/AppShell';
import { HomeView } from './features/home/HomeView';
import { VehicleSetupView } from './features/vehicle/VehicleSetupView';
import { DesignStudioView } from './features/studio/DesignStudioView';
import { VectorArtworkView } from './features/artwork/VectorArtworkView';
import { PanelsView } from './features/panels/PanelsView';
import { ProjectionView } from './features/projection/ProjectionView';
import { PrintLayoutView } from './features/print/PrintLayoutView';
import { RenderStudioView } from './features/render/RenderStudioView';
import { ExportCenterView } from './features/export/ExportCenterView';
import { AssetLibraryView } from './features/library/AssetLibraryView';
import { PreferencesView } from './features/preferences/PreferencesView';
import { DiagnosticsView } from './features/diagnostics/DiagnosticsView';
import { useUiStore } from './lib/store/uiStore';
import { useProjectStore } from './lib/store/projectStore';
import { useProjectActions } from './lib/useProjectActions';
import { useAutosave, captureActiveViewport } from './lib/autosave';
import { installGlobalErrorLogging } from './lib/diagnostics/log';
import { Button, EmptyState } from './components/ui';
import { Car, FolderOpen, Plus } from 'lucide-react';

export function App() {
  const view = useUiStore((state) => state.view);
  const theme = useUiStore((state) => state.theme);
  const modal = useUiStore((state) => state.modal);
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const project = useProjectStore((state) => state.project);
  const actions = useProjectActions();

  useAutosave();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => installGlobalErrorLogging(), []);

  useEffect(() => {
    document.title = project ? `${project.name} — WrapForge` : 'WrapForge';
  }, [project]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      const ui = useUiStore.getState();

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
        return;
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        ui.setModal('new');
        return;
      }
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        ui.setModal('open');
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const thumbnail = captureActiveViewport() ?? undefined;
        if (event.shiftKey) void actions.saveProjectAs(thumbnail);
        else void actions.saveProject({ thumbnailDataUrl: thumbnail });
        return;
      }
      if (mod && event.key.toLowerCase() === 'i' && useProjectStore.getState().project) {
        event.preventDefault();
        void actions.importArtwork();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        if (editing) return;
        event.preventDefault();
        if (event.shiftKey) useProjectStore.getState().redo();
        else useProjectStore.getState().undo();
        return;
      }
      if (!mod && !editing && event.key === '?') {
        event.preventDefault();
        ui.setModal('shortcuts');
      }
      if (event.key === 'Escape') {
        if (ui.commandPaletteOpen) ui.setCommandPaletteOpen(false);
        else if (ui.modal) ui.setModal(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  const requiresProject = view !== 'home' && view !== 'library' && view !== 'preferences' && view !== 'diagnostics' && view !== 'vehicle';
  void modal;
  void commandPaletteOpen;

  return (
    <AppShell>
      {requiresProject && !project ? (
        <ProjectGate />
      ) : (
        <ViewRouter view={view} />
      )}
    </AppShell>
  );
}

function ViewRouter({ view }: { view: ReturnType<typeof useUiStore.getState>['view'] }) {
  switch (view) {
    case 'home':
      return <HomeView />;
    case 'vehicle':
      return <VehicleSetupView />;
    case 'studio':
      return <DesignStudioView />;
    case 'artwork':
      return <VectorArtworkView />;
    case 'panels':
      return <PanelsView />;
    case 'projection':
      return <ProjectionView />;
    case 'print':
      return <PrintLayoutView />;
    case 'render':
      return <RenderStudioView />;
    case 'export':
      return <ExportCenterView />;
    case 'library':
      return <AssetLibraryView />;
    case 'preferences':
      return <PreferencesView />;
    case 'diagnostics':
      return <DiagnosticsView />;
    default:
      return <HomeView />;
  }
}

function ProjectGate() {
  const setModal = useUiStore((state) => state.setModal);
  const setView = useUiStore((state) => state.setView);
  return (
    <div className="content">
      <EmptyState
        icon={<Car size={30} />}
        title="No project open"
        action={
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="primary" onClick={() => setModal('new')}>
              <Plus size={14} />
              New project
            </Button>
            <Button onClick={() => setModal('open')}>
              <FolderOpen size={14} />
              Open project
            </Button>
            <Button variant="ghost" onClick={() => setView('home')}>
              Back to home
            </Button>
          </div>
        }
      >
        Create a project from the original sample vehicle, or open an existing .wrapforge folder.
      </EmptyState>
    </div>
  );
}
