import { useEffect, useState } from 'react';
import {
  Accessibility,
  Cpu,
  Database,
  Globe2,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { platform } from '../../lib/platform';
import { confirmAction } from '../../lib/platform/dialogs';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useTranslation } from '../../lib/i18n';
import { useProjectActions } from '../../lib/useProjectActions';
import type { BlenderInfo } from '../../lib/platform/types';
import {
  Badge,
  Button,
  Field,
  Panel,
  PanelBody,
  PanelHeader,
  Select,
  TextInput,
  Toggle,
} from '../../components/ui';

export function PreferencesView() {
  const { t } = useTranslation();
  const ui = useUiStore();
  const project = useProjectStore((state) => state.project);
  const actions = useProjectActions();
  const [blenderPath, setBlenderPath] = useState(ui.blenderPath);
  const [detected, setDetected] = useState<BlenderInfo | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    setBlenderPath(ui.blenderPath);
  }, [ui.blenderPath]);

  const detect = async (path: string) => {
    setDetecting(true);
    try {
      const info = await platform.discoverBlender(path);
      setDetected(info);
    } finally {
      setDetecting(false);
    }
  };

  const resetPreferences = async () => {
    const confirmed = await confirmAction(
      'Reset preferences?',
      'Theme, language, and the Blender path will return to defaults. Projects are not affected.',
      'Reset',
    );
    if (!confirmed) return;
    ui.setTheme('dark');
    ui.setLanguage('en');
    ui.setBlenderPath('');
    setBlenderPath('');
    setDetected(null);
    ui.notify('success', 'Preferences reset');
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('preferences.title')}</h1>
          <p>
            Local application settings. WrapForge requires no account and sends no telemetry. Every
            setting is stored on this machine.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => void resetPreferences()}>
            <RotateCcw size={14} />
            Reset preferences
          </Button>
        </div>
      </div>

      <div className="split-even">
        <div className="stack">
          <Panel>
            <PanelHeader title={t('preferences.appearance')} icon={<Palette size={15} />} />
            <PanelBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { id: 'dark' as const, label: t('theme.dark'), icon: Moon },
                  { id: 'light' as const, label: t('theme.light'), icon: Sun },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`artwork-card ${ui.theme === id ? 'active' : ''}`}
                    onClick={() => ui.setTheme(id)}
                    style={{ padding: 0 }}
                  >
                    <div
                      style={{
                        height: 76,
                        display: 'grid',
                        placeItems: 'center',
                        background:
                          id === 'dark'
                            ? 'linear-gradient(135deg, #11151a, #0a0c0f)'
                            : 'linear-gradient(135deg, #fbfaf7, #e7e1d7)',
                        color: id === 'dark' ? '#eef1f5' : '#1b1d21',
                      }}
                    >
                      <Icon size={22} />
                    </div>
                    <div className="artwork-info">
                      <strong>{label}</strong>
                      <span>{id === 'dark' ? 'Studio default' : 'Daylight workspace'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t('preferences.language')} icon={<Globe2 size={15} />} />
            <PanelBody>
              <Field label="Interface language" htmlFor="language">
                <Select
                  id="language"
                  value={ui.language}
                  onChange={(event) =>
                    ui.setLanguage(event.currentTarget.value as 'en' | 'de')
                  }
                >
                  <option value="en">{t('language.english')}</option>
                  <option value="de">{t('language.german')}</option>
                </Select>
              </Field>
              <p className="tiny dim">
                Shell, navigation, and common actions are translated. Feature-level copy is still
                English in this alpha; external translation files are in src/lib/i18n.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t('preferences.units')} />
            <PanelBody>
              <Field label="Print display unit" htmlFor="pref-unit" hint="Stored per project.">
                <Select
                  id="pref-unit"
                  value={project?.print.unit ?? 'mm'}
                  disabled={!project}
                  onChange={(event) =>
                    actions.updateProject((draft) => {
                      draft.print.unit = event.currentTarget.value as 'mm' | 'cm' | 'in';
                    }, 'Change display unit')
                  }
                >
                  <option value="mm">Millimetres</option>
                  <option value="cm">Centimetres</option>
                  <option value="in">Inches</option>
                </Select>
              </Field>
              <p className="tiny dim">
                Project geometry and validation always use millimetres internally. Unit selection
                only affects display and manifests.
              </p>
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader title={t('preferences.blender')} icon={<Cpu size={15} />} />
            <PanelBody>
              <Field
                label={t('preferences.blenderPath')}
                htmlFor="blender-path"
                hint={t('preferences.blenderHint')}
              >
                <div className="input-row">
                  <TextInput
                    id="blender-path"
                    value={blenderPath}
                    onChange={(event) => setBlenderPath(event.currentTarget.value)}
                    placeholder="Auto-detect"
                    className="mono"
                  />
                  <Button
                    onClick={() => {
                      ui.setBlenderPath(blenderPath.trim());
                      void detect(blenderPath.trim());
                    }}
                    disabled={detecting}
                  >
                    {detecting ? 'Checking…' : 'Detect'}
                  </Button>
                </div>
              </Field>
              {detected ? (
                <div className={`issue ${detected.found ? 'pass' : 'warning'}`}>
                  <Cpu size={15} className="issue-icon" />
                  <div>
                    <strong>
                      {detected.found ? `Blender ${detected.version}` : 'Blender not found'}
                    </strong>
                    <p>{detected.message}</p>
                    {detected.executable ? (
                      <p className="mono" style={{ wordBreak: 'break-all' }}>
                        {detected.executable}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void detect(blenderPath)} disabled={detecting}>
                  Test current configuration
                </Button>
              )}
              <p className="tiny dim" style={{ marginTop: 10 }}>
                Tested with Blender 5.2 LTS on Linux (Flatpak). Other versions are reported as
                untested until their APIs are verified.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={t('preferences.telemetry')} icon={<ShieldCheck size={15} />} />
            <PanelBody>
              <div className="issue pass">
                <ShieldCheck size={15} className="issue-icon" />
                <div>
                  <strong>{t('preferences.telemetryValue')}</strong>
                  <p>
                    No analytics, crash upload, account, or cloud service is present. Network access
                    is not required after installation.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Toggle
                  label="Allow network access"
                  checked={false}
                  onChange={() =>
                    ui.notify(
                      'info',
                      'Network access is not used',
                      'WrapForge does not include any online feature in this alpha.',
                    )
                  }
                  hint="Informational only; there is no online feature to disable."
                />
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Accessibility" icon={<Accessibility size={15} />} />
            <PanelBody>
              <div className="small muted">
                <p style={{ marginTop: 0 }}>
                  Reduced motion is {ui.reducedMotion ? 'enabled' : 'not requested'} by the operating
                  system. Focus outlines are always visible on interactive controls.
                </p>
                <p>
                  Keyboard navigation uses standard controls. Open the shortcut reference for the
                  current bindings.
                </p>
              </div>
              <Button size="sm" onClick={() => ui.setModal('shortcuts')}>
                Keyboard shortcuts
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Storage" icon={<Database size={15} />} />
            <PanelBody>
              <div className="small muted">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Runtime</span>
                  <Badge>{platform.kind === 'desktop' ? 'Desktop' : 'Browser preview'}</Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                  <span>Preferences</span>
                  <span className="mono">local storage</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                  <span>Projects</span>
                  <span className="mono">
                    {platform.kind === 'desktop' ? 'project folders' : 'browser storage'}
                  </span>
                </div>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
