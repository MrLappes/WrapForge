import { useEffect, useState } from 'react';
import { Box, CircleDot, HardDrive, Layers, Ruler } from 'lucide-react';
import { platform } from '../../lib/platform';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useTranslation } from '../../lib/i18n';
import { APP_VERSION } from '../../lib/project/schema';
import type { BlenderInfo } from '../../lib/platform/types';

export function StatusBar() {
  const { t } = useTranslation();
  const status = useUiStore((state) => state.status);
  const busy = useUiStore((state) => state.busy);
  const autosave = useUiStore((state) => state.autosave);
  const blenderPath = useUiStore((state) => state.blenderPath);
  const project = useProjectStore((state) => state.project);
  const dirty = useProjectStore((state) => state.dirty);
  const [blender, setBlender] = useState<BlenderInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlender(null);
    platform
      .discoverBlender(blenderPath)
      .then((info) => {
        if (!cancelled) setBlender(info);
      })
      .catch(() => {
        if (!cancelled) {
          setBlender({
            found: false,
            executable: null,
            displayName: null,
            via: 'none',
            version: null,
            compatibility: 'unknown',
            message: 'Blender detection failed.',
            checkedAt: new Date().toISOString(),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blenderPath]);

  const autosaveLabel = (() => {
    switch (autosave.state) {
      case 'saving':
        return 'Saving autosave…';
      case 'saved':
        return autosave.lastSavedAt
          ? t('status.autosaveSaved') +
              ' ' +
              new Date(autosave.lastSavedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
          : t('status.autosaveSaved');
      case 'pending':
        return t('status.autosavePending');
      case 'error':
        return autosave.message ?? t('status.autosaveError');
      case 'idle':
      default:
        return autosave.message ?? t('status.autosaveOff');
    }
  })();

  const blenderLabel = blender === null
    ? 'Checking Blender…'
    : blender.found
      ? `Blender ${blender.version ?? ''}`.trim()
      : 'Blender not found';

  return (
    <footer className="statusbar">
      <span className="status-item" style={{ minWidth: 130 }}>
        {busy ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <CircleDot size={11} />}
        {status}
      </span>
      <span className="status-item">
        <span
          className={`status-dot ${dirty ? 'warn' : autosave.state === 'error' ? 'error' : ''}`}
        />
        {project ? (dirty ? t('status.unsaved') : autosaveLabel) : t('status.noProject')}
      </span>
      {project ? (
        <>
          <span className="status-item status-item-summary">
            <Layers size={11} />
            {project.vehicle.panels.length} panels · {project.artwork.length} artwork ·{' '}
            {project.placements.length} placements
          </span>
          <span className="status-item status-item-summary">
            <Ruler size={11} />
            {project.vehicle.dimensionsMm.length} × {project.vehicle.dimensionsMm.width} ×{' '}
            {project.vehicle.dimensionsMm.height} mm
          </span>
          <span className="status-item status-item-extra">
            <Box size={11} />
            {project.vehicle.displayName}
          </span>
        </>
      ) : null}
      <span className="status-spacer" />
      <span className="status-item" title={blender?.message ?? ''}>
        <span className={`status-dot ${blender?.found ? '' : 'warn'}`} />
        {blenderLabel}
      </span>
      <span className="status-item">
        <HardDrive size={11} />
        {platform.kind === 'desktop' ? 'Desktop' : 'Browser preview'}
      </span>
      <span className="status-item mono">v{APP_VERSION}</span>
    </footer>
  );
}
