import { create } from 'zustand';
import { logEvent } from '../diagnostics/log';

export type NavView =
  | 'home'
  | 'vehicle'
  | 'studio'
  | 'artwork'
  | 'panels'
  | 'projection'
  | 'print'
  | 'render'
  | 'export'
  | 'library'
  | 'preferences'
  | 'diagnostics';

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'de';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
}

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type AppModal = 'new' | 'open' | 'shortcuts' | 'about' | null;

export interface UiState {
  view: NavView;
  theme: Theme;
  language: Language;
  selectedPanelId: string | null;
  selectedPlacementId: string | null;
  toasts: Toast[];
  status: string;
  busy: boolean;
  commandPaletteOpen: boolean;
  modal: AppModal;
  autosave: { state: AutosaveState; lastSavedAt: string | null; message: string | null };
  blenderPath: string;
  reducedMotion: boolean;
  recentVersion: number;
  setView(view: NavView): void;
  setTheme(theme: Theme): void;
  setLanguage(language: Language): void;
  selectPanel(panelId: string | null): void;
  selectPlacement(placementId: string | null): void;
  notify(kind: ToastKind, title: string, detail?: string): void;
  dismissToast(id: string): void;
  setStatus(status: string): void;
  setBusy(busy: boolean): void;
  setCommandPaletteOpen(open: boolean): void;
  setModal(modal: AppModal): void;
  setAutosave(state: AutosaveState, message?: string | null): void;
  setBlenderPath(path: string): void;
  bumpRecentVersion(): void;
}

const THEME_KEY = 'wrapforge.theme';
const LANGUAGE_KEY = 'wrapforge.language';
const BLENDER_KEY = 'wrapforge.blenderPath';

function readStored<T extends string>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const value = localStorage.getItem(key);
  return (value as T | null) ?? fallback;
}

function initialReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  view: 'home',
  theme: readStored<Theme>(THEME_KEY, 'dark'),
  language: readStored<Language>(LANGUAGE_KEY, 'en'),
  selectedPanelId: null,
  selectedPlacementId: null,
  toasts: [],
  status: 'Ready',
  busy: false,
  commandPaletteOpen: false,
  modal: null,
  autosave: { state: 'idle', lastSavedAt: null, message: null },
  blenderPath: readStored(BLENDER_KEY, ''),
  reducedMotion: initialReducedMotion(),
  recentVersion: 0,

  setView(view) {
    set({ view });
  },
  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  setLanguage(language) {
    localStorage.setItem(LANGUAGE_KEY, language);
    set({ language });
  },
  selectPanel(panelId) {
    set({ selectedPanelId: panelId });
  },
  selectPlacement(placementId) {
    set({ selectedPlacementId: placementId });
  },
  notify(kind, title, detail) {
    if (kind === 'error' || kind === 'warning' || kind === 'success') {
      logEvent(kind === 'error' ? 'error' : kind === 'warning' ? 'warn' : 'info', title, detail);
    }
    toastCounter += 1;
    const toast: Toast = { id: `toast-${toastCounter}`, kind, title, detail };
    set({ toasts: [...get().toasts, toast] });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set({ toasts: get().toasts.filter((item) => item.id !== toast.id) });
      }, kind === 'error' ? 9000 : 4500);
    }
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
  setStatus(status) {
    set({ status });
  },
  setBusy(busy) {
    set({ busy });
  },
  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },
  setModal(modal) {
    set({ modal });
  },
  setAutosave(state, message = null) {
    set({
      autosave: {
        state,
        message,
        lastSavedAt: state === 'saved' ? new Date().toISOString() : get().autosave.lastSavedAt,
      },
    });
  },
  setBlenderPath(path) {
    localStorage.setItem(BLENDER_KEY, path);
    set({ blenderPath: path });
  },
  bumpRecentVersion() {
    set({ recentVersion: get().recentVersion + 1 });
  },
}));
