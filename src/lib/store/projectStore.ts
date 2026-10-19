import { create } from 'zustand';
import type { ProjectDocument } from '../project/schema';
import { nowIso } from '../ids';

const HISTORY_LIMIT = 80;

export interface HistoryEntry {
  label: string;
  project: ProjectDocument;
}

export interface ProjectState {
  project: ProjectDocument | null;
  root: string | null;
  dirty: boolean;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastAction: string | null;
  load(project: ProjectDocument, root: string | null): void;
  update(mutator: (draft: ProjectDocument) => void, label: string): void;
  replace(project: ProjectDocument, label: string): void;
  markSaved(project: ProjectDocument, root: string): void;
  markSavedIfUnchanged(snapshotJson: string, project: ProjectDocument, root: string): boolean;
  setRoot(root: string): void;
  undo(): void;
  redo(): void;
  close(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  root: null,
  dirty: false,
  undoStack: [],
  redoStack: [],
  lastAction: null,

  load(project, root) {
    set({
      project,
      root,
      dirty: false,
      undoStack: [],
      redoStack: [],
      lastAction: null,
    });
  },

  update(mutator, label) {
    const { project, undoStack } = get();
    if (!project) return;
    const previous = clone(project);
    const draft = clone(project);
    mutator(draft);
    draft.updatedAt = nowIso();
    const nextUndo = [...undoStack, { label, project: previous }].slice(-HISTORY_LIMIT);
    set({
      project: draft,
      dirty: true,
      undoStack: nextUndo,
      redoStack: [],
      lastAction: label,
    });
  },

  replace(project, label) {
    const { project: current, undoStack } = get();
    if (!current) {
      set({ project, dirty: true });
      return;
    }
    const nextUndo = [...undoStack, { label, project: clone(current) }].slice(-HISTORY_LIMIT);
    set({ project, dirty: true, undoStack: nextUndo, redoStack: [], lastAction: label });
  },

  markSaved(project, root) {
    set({ project, root, dirty: false, lastAction: null });
  },

  markSavedIfUnchanged(snapshotJson, project, root) {
    const current = get().project;
    if (!current || JSON.stringify(current) !== snapshotJson) {
      set({ root });
      return false;
    }
    set({ project, root, dirty: false, lastAction: null });
    return true;
  },

  setRoot(root) {
    set({ root });
  },

  undo() {
    const { project, undoStack, redoStack } = get();
    if (!project || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    set({
      project: previous.project,
      undoStack: undoStack.slice(0, -1),
      redoStack: [{ label: previous.label, project: clone(project) }, ...redoStack].slice(
        0,
        HISTORY_LIMIT,
      ),
      dirty: true,
      lastAction: `Undo: ${previous.label}`,
    });
  },

  redo() {
    const { project, undoStack, redoStack } = get();
    if (!project || redoStack.length === 0) return;
    const next = redoStack[0];
    set({
      project: next.project,
      redoStack: redoStack.slice(1),
      undoStack: [...undoStack, { label: next.label, project: clone(project) }].slice(-HISTORY_LIMIT),
      dirty: true,
      lastAction: `Redo: ${next.label}`,
    });
  },

  close() {
    set({
      project: null,
      root: null,
      dirty: false,
      undoStack: [],
      redoStack: [],
      lastAction: null,
    });
  },

  canUndo() {
    return get().undoStack.length > 0;
  },

  canRedo() {
    return get().redoStack.length > 0;
  },
}));
