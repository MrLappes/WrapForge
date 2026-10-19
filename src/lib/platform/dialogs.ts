import { detectDesktop } from './index';

export async function confirmAction(
  title: string,
  description: string,
  confirmLabel = 'Confirm',
): Promise<boolean> {
  if (detectDesktop()) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(description, { title, kind: 'warning', okLabel: confirmLabel, cancelLabel: 'Cancel' });
  }
  return window.confirm(`${title}\n\n${description}`);
}

export async function showMessage(title: string, description: string): Promise<void> {
  if (detectDesktop()) {
    const { message } = await import('@tauri-apps/plugin-dialog');
    await message(description, { title, kind: 'info' });
    return;
  }
  window.alert(`${title}\n\n${description}`);
}
