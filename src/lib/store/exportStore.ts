import { create } from 'zustand';
import { createId, nowIso } from '../ids';

export type ExportKind =
  | 'print'
  | 'render'
  | 'preview'
  | 'manifest'
  | 'diagnostic'
  | 'project'
  | 'texture';

export interface ExportRecord {
  id: string;
  kind: ExportKind;
  label: string;
  path: string;
  files: number;
  createdAt: string;
}

interface ExportState {
  entries: ExportRecord[];
  add(entry: Omit<ExportRecord, 'id' | 'createdAt'>): void;
  clear(): void;
}

export const useExportStore = create<ExportState>((set) => ({
  entries: [],
  add(entry) {
    set((state) => ({
      entries: [
        { ...entry, id: createId('export'), createdAt: nowIso() },
        ...state.entries,
      ].slice(0, 50),
    }));
  },
  clear() {
    set({ entries: [] });
  },
}));
