import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from './projectStore';
import { makeProject } from '../../test/fixtures';

beforeEach(() => {
  useProjectStore.getState().close();
});

describe('project store history', () => {
  it('tracks dirty state and supports undo/redo', () => {
    const project = makeProject();
    const store = useProjectStore.getState();
    store.load(project, '/tmp/project');
    expect(useProjectStore.getState().dirty).toBe(false);

    useProjectStore.getState().update((draft) => {
      draft.vehicle.paintColor = '#112233';
    }, 'Change paint');
    expect(useProjectStore.getState().project?.vehicle.paintColor).toBe('#112233');
    expect(useProjectStore.getState().dirty).toBe(true);
    expect(useProjectStore.getState().undoStack).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project?.vehicle.paintColor).toBe(project.vehicle.paintColor);
    expect(useProjectStore.getState().redoStack).toHaveLength(1);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project?.vehicle.paintColor).toBe('#112233');
  });

  it('clears redo after a new edit', () => {
    useProjectStore.getState().load(makeProject(), null);
    useProjectStore.getState().update((draft) => {
      draft.name = 'A';
    }, 'Rename');
    useProjectStore.getState().update((draft) => {
      draft.name = 'B';
    }, 'Rename');
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().canRedo()).toBe(true);
    useProjectStore.getState().update((draft) => {
      draft.name = 'C';
    }, 'Rename');
    expect(useProjectStore.getState().canRedo()).toBe(false);
  });

  it('marks saved only when the snapshot is unchanged', () => {
    const project = makeProject();
    useProjectStore.getState().load(project, '/tmp/project');
    const snapshot = JSON.stringify(useProjectStore.getState().project);
    const saved = { ...project, name: 'Saved copy' };
    expect(useProjectStore.getState().markSavedIfUnchanged(snapshot, saved, '/tmp/project')).toBe(
      true,
    );
    expect(useProjectStore.getState().dirty).toBe(false);
    expect(useProjectStore.getState().project?.name).toBe('Saved copy');

    useProjectStore.getState().update((draft) => {
      draft.name = 'Edited';
    }, 'Rename');
    const staleSnapshot = JSON.stringify(useProjectStore.getState().project);
    useProjectStore.getState().update((draft) => {
      draft.name = 'Edited again';
    }, 'Rename');
    expect(
      useProjectStore.getState().markSavedIfUnchanged(staleSnapshot, saved, '/tmp/project'),
    ).toBe(false);
    expect(useProjectStore.getState().dirty).toBe(true);
    expect(useProjectStore.getState().project?.name).toBe('Edited again');
    expect(useProjectStore.getState().root).toBe('/tmp/project');
  });

  it('closes the project and clears history', () => {
    useProjectStore.getState().load(makeProject(), null);
    useProjectStore.getState().update((draft) => {
      draft.name = 'x';
    }, 'Rename');
    useProjectStore.getState().close();
    expect(useProjectStore.getState().project).toBeNull();
    expect(useProjectStore.getState().undoStack).toHaveLength(0);
  });
});
