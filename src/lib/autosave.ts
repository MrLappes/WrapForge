import { useEffect, useRef } from 'react';
import { platform } from './platform';
import { writeProject } from './project/service';
import { useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';
import { errorMessage } from './useProjectActions';

export function useAutosave(): void {
  const project = useProjectStore((state) => state.project);
  const dirty = useProjectStore((state) => state.dirty);
  const root = useProjectStore((state) => state.root);
  const saving = useRef(false);

  useEffect(() => {
    if (!project || !dirty) return;
    const ui = useUiStore.getState();
    if (platform.kind === 'desktop' && !root) {
      ui.setAutosave('idle', 'Save once to enable autosave');
      return;
    }
    ui.setAutosave('pending');
    const timer = window.setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      const snapshot = JSON.stringify(project);
      const currentUi = useUiStore.getState();
      currentUi.setAutosave('saving');
      try {
        const result = await writeProject(platform, project, root, {});
        const unchanged = useProjectStore
          .getState()
          .markSavedIfUnchanged(snapshot, result.project, result.root);
        const after = useUiStore.getState();
        after.setAutosave(unchanged ? 'saved' : 'pending');
        after.bumpRecentVersion();
      } catch (error) {
        useUiStore.getState().setAutosave('error', errorMessage(error));
      } finally {
        saving.current = false;
      }
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [project, dirty, root]);
}

type CaptureFn = () => string | null;
let activeCapture: CaptureFn | null = null;

export function registerViewportCapture(fn: CaptureFn | null): void {
  activeCapture = fn;
}

export function captureActiveViewport(): string | null {
  try {
    return activeCapture?.() ?? null;
  } catch {
    return null;
  }
}
