import type { ReactNode } from 'react';
import { MenuBar } from './MenuBar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { CommandPalette } from './CommandPalette';
import {
  AboutDialog,
  NewProjectDialog,
  OpenProjectDialog,
  ShortcutsDialog,
} from './AppModals';

export function Logo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7.2c3.2-2.8 6.4 2.8 9.6 0s6.4-2.8 8.4-1.2v4.6c-3.2 2.8-6.4-2.8-9.6 0s-6.4 2.8-8.4 1.2V7.2Z"
        fill="currentColor"
      />
      <path
        d="M3 13.4c3.2-2.8 6.4 2.8 9.6 0s6.4-2.8 8.4-1.2v4.6c-3.2 2.8-6.4-2.8-9.6 0s-6.4 2.8-8.4 1.2v-4.6Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <MenuBar logo={<Logo />} />
      <div className="workspace">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
      <StatusBar />
      <Toasts />
      <CommandPalette />
      <NewProjectDialog />
      <OpenProjectDialog />
      <ShortcutsDialog />
      <AboutDialog />
    </div>
  );
}
