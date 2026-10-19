import { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ImagePlus,
  PenTool,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useTranslation } from '../../lib/i18n';
import { useArtworkImages } from '../studio/useArtworkImages';
import { createSvgArtworkAsset } from '../../lib/project/service';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  NumberInput,
  Panel,
  PanelBody,
  PanelHeader,
  Select,
  Slider,
  Textarea,
  TextInput,
} from '../../components/ui';
import type { ArtworkAsset } from '../../lib/project/schema';

const FONTS = [
  { value: 'Inter Variable', label: 'Inter' },
  { value: 'Space Grotesk Variable', label: 'Space Grotesk' },
  { value: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'Monospace' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Impact, sans-serif', label: 'Impact (system)' },
];

export function VectorArtworkView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const actions = useProjectActions();
  const ui = useUiStore();
  const { images, loading } = useArtworkImages(project?.artwork ?? [], root);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('Speed is a shape');
  const [textFont, setTextFont] = useState(FONTS[1].value);
  const [textWeight, setTextWeight] = useState(700);
  const [textSize, setTextSize] = useState(180);
  const [textFill, setTextFill] = useState('#ffffff');

  const artworks = useMemo(() => project?.artwork ?? [], [project?.artwork]);
  const selected = useMemo(
    () => artworks.find((artwork) => artwork.id === selectedId) ?? artworks[0] ?? null,
    [artworks, selectedId],
  );

  useEffect(() => {
    if (artworks.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!artworks.some((artwork) => artwork.id === selectedId)) {
      setSelectedId(artworks[0].id);
    }
  }, [artworks, selectedId]);

  if (!project) {
    return (
      <div className="content">
        <EmptyState icon={<PenTool size={26} />} title="No project open">
          Create a project to import and edit artwork.
        </EmptyState>
      </div>
    );
  }

  const updateArtwork = (id: string, mutator: (artwork: ArtworkAsset) => void, label: string) => {
    actions.updateProject((draft) => {
      const artwork = draft.artwork.find((item) => item.id === id);
      if (artwork) mutator(artwork);
    }, label);
  };

  const loadSample = async (file: string, label: string) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-artwork/${file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const artwork = createSvgArtworkAsset(label, text);
      actions.updateProject((draft) => {
        draft.artwork.push(artwork);
      }, 'Add sample artwork');
      setSelectedId(artwork.id);
      ui.notify('success', 'Sample artwork added', label);
    } catch (error) {
      ui.notify(
        'error',
        'Could not load sample artwork',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const createText = () => {
    const artwork = actions.addText(textContent, {
      fontFamily: textFont,
      fontWeight: textWeight,
      fontSizePx: textSize,
      fill: textFill,
      align: 'center',
    });
    if (artwork) setSelectedId(artwork.id);
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('artwork.title')}</h1>
          <p>{t('artwork.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button onClick={createText}>
            <Type size={14} />
            {t('artwork.newText')}
          </Button>
          <Button variant="primary" onClick={() => void actions.importArtwork()}>
            <ImagePlus size={14} />
            {t('action.importArtwork')}
          </Button>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('artwork.assets')}
              subtitle={`${artworks.length} source asset${artworks.length === 1 ? '' : 's'}`}
              actions={loading ? <Badge>Loading previews</Badge> : null}
            />
            <PanelBody>
              {artworks.length === 0 ? (
                <EmptyState
                  icon={<PenTool size={26} />}
                  title={t('artwork.empty')}
                  action={
                    <Button variant="primary" size="sm" onClick={() => void actions.importArtwork()}>
                      <ImagePlus size={13} />
                      {t('action.importArtwork')}
                    </Button>
                  }
                >
                  SVG, PNG, JPEG, and WebP files are supported. SVG sources stay vector.
                </EmptyState>
              ) : (
                <div className="artwork-grid">
                  {artworks.map((artwork) => (
                    <button
                      key={artwork.id}
                      type="button"
                      className={`artwork-card ${selected?.id === artwork.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(artwork.id)}
                    >
                      <div className="artwork-preview">
                        {artwork.kind === 'text' ? (
                          <span
                            className="text-preview"
                            style={{
                              fontFamily: artwork.text?.fontFamily,
                              fontWeight: artwork.text?.fontWeight,
                              color: artwork.text?.fill,
                            }}
                          >
                            {artwork.text?.content.split('\n')[0]}
                          </span>
                        ) : images.get(artwork.id) ? (
                          <img src={images.get(artwork.id)?.src} alt={artwork.name} />
                        ) : (
                          <span className="tiny dim">Preview unavailable</span>
                        )}
                      </div>
                      <div className="artwork-info">
                        <strong>{artwork.name}</strong>
                        <span>
                          {artwork.kind === 'text'
                            ? t('artwork.kind.text')
                            : artwork.kind === 'svg'
                              ? t('artwork.kind.svg')
                              : t('artwork.kind.raster')}
                          {artwork.pixelWidth && artwork.pixelHeight
                            ? ` · ${Math.round(artwork.pixelWidth)} × ${Math.round(artwork.pixelHeight)} px`
                            : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Sample artwork"
              subtitle="Original CC0-1.0 files bundled with WrapForge"
              icon={<ImagePlus size={15} />}
            />
            <PanelBody>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" onClick={() => void loadSample('velocity-stripes.svg', 'Velocity Stripes')}>
                  Velocity stripes
                </Button>
                <Button size="sm" onClick={() => void loadSample('wrapforge-mark.svg', 'WrapForge Mark')}>
                  WrapForge mark
                </Button>
                <Button size="sm" onClick={() => void loadSample('number-07.svg', 'Number 07')}>
                  Number 07
                </Button>
              </div>
              <p className="tiny dim" style={{ marginTop: 8 }}>
                No third-party logos, characters, or licensed fonts are bundled. These files are
                safe to redistribute with the project.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="New text object" subtitle="Live text stays editable until production export." icon={<Type size={15} />} />
            <PanelBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14 }}>
                <div>
                  <Field label="Content" htmlFor="text-content">
                    <Textarea
                      id="text-content"
                      value={textContent}
                      onChange={(event) => setTextContent(event.currentTarget.value)}
                      rows={3}
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Font" htmlFor="text-font">
                      <Select
                        id="text-font"
                        value={textFont}
                        onChange={(event) => setTextFont(event.currentTarget.value)}
                      >
                        {FONTS.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Weight" htmlFor="text-weight">
                      <Select
                        id="text-weight"
                        value={textWeight}
                        onChange={(event) => setTextWeight(Number(event.currentTarget.value))}
                      >
                        {[300, 400, 500, 600, 700, 800].map((weight) => (
                          <option key={weight} value={weight}>
                            {weight}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
                <div>
                  <Field label="Colour" htmlFor="text-fill">
                    <div className="color-input">
                      <input
                        id="text-fill"
                        type="color"
                        value={textFill}
                        onChange={(event) => setTextFill(event.currentTarget.value)}
                      />
                      <TextInput
                        value={textFill.toUpperCase()}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          if (/^#[0-9a-fA-F]{6}$/.test(value)) setTextFill(value);
                        }}
                        className="mono"
                        maxLength={7}
                      />
                    </div>
                  </Field>
                  <Field label="Type size" hint="Natural size before panel placement scaling.">
                    <NumberInput
                      value={textSize}
                      onValueChange={setTextSize}
                      min={12}
                      max={1200}
                      suffix="px"
                    />
                  </Field>
                  <Button variant="primary" onClick={createText} disabled={!textContent.trim()}>
                    <Plus size={14} />
                    Create text object
                  </Button>
                </div>
              </div>
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader
              title={selected ? selected.name : 'No artwork selected'}
              subtitle={selected ? `${selected.kind.toUpperCase()} · ${selected.mimeType}` : undefined}
              actions={
                selected ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      const deleted = await actions.deleteArtwork(selected.id);
                      if (deleted) setSelectedId(null);
                    }}
                  >
                    <Trash2 size={12} />
                    {t('action.delete')}
                  </Button>
                ) : null
              }
            />
            <PanelBody>
              {selected ? (
                <>
                  <Field label={t('common.name')} htmlFor="artwork-name">
                    <TextInput
                      id="artwork-name"
                      value={selected.name}
                      onChange={(event) =>
                        updateArtwork(selected.id, (artwork) => {
                          artwork.name = event.currentTarget.value;
                        }, 'Rename artwork')
                      }
                      maxLength={120}
                    />
                  </Field>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td className="muted">Kind</td>
                        <td>{selected.kind.toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td className="muted">Pixels</td>
                        <td className="num">
                          {selected.pixelWidth ? Math.round(selected.pixelWidth) : '—'} ×{' '}
                          {selected.pixelHeight ? Math.round(selected.pixelHeight) : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">Natural size</td>
                        <td className="num">
                          {selected.physicalWidthMm
                            ? `${selected.physicalWidthMm.toFixed(1)} × ${selected.physicalHeightMm?.toFixed(1)} mm`
                            : 'Derived at placement'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">Source</td>
                        <td className="num" style={{ fontSize: 9.5 }}>
                          {selected.kind === 'text'
                            ? 'Live text object'
                            : selected.sourcePath ?? 'Embedded data'}
                        </td>
                      </tr>
                      <tr>
                        <td className="muted">Attribution</td>
                        <td>{selected.attribution || '—'}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => actions.placeArtwork(selected.id, ui.selectedPanelId)}
                      disabled={!ui.selectedPanelId}
                      title={
                        ui.selectedPanelId
                          ? 'Place on the selected panel'
                          : 'Select a panel in the studio or panel list first'
                      }
                    >
                      Place on selected panel
                    </Button>
                    <Button size="sm" onClick={() => ui.setView('studio')}>
                      Open studio
                    </Button>
                  </div>

                  {selected.kind !== 'text' ? (
                    <p className="tiny dim" style={{ marginTop: 10 }}>
                      The original source stays intact. SVG content is embedded as vector data in
                      SVG panel exports and rasterised only where a raster target requires it.
                    </p>
                  ) : null}

                  {selected.kind === 'text' && selected.text ? (
                    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div className="section-title">
                        <Type size={12} />
                        Text properties
                      </div>
                      <Field label="Content">
                        <Textarea
                          value={selected.text.content}
                          rows={3}
                          onChange={(event) =>
                            updateArtwork(selected.id, (artwork) => {
                              if (!artwork.text) return;
                              artwork.text.content = event.currentTarget.value;
                              const lines = event.currentTarget.value.split('\n');
                              const longest = Math.max(1, ...lines.map((line) => line.length));
                              artwork.pixelWidth = Math.max(
                                64,
                                longest * artwork.text.fontSizePx * 0.58,
                              );
                              artwork.pixelHeight = Math.max(
                                32,
                                lines.length * artwork.text.fontSizePx * 1.24,
                              );
                            }, 'Edit text')
                          }
                        />
                      </Field>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <Field label="Font">
                          <Select
                            value={selected.text.fontFamily}
                            onChange={(event) =>
                              updateArtwork(selected.id, (artwork) => {
                                if (artwork.text) artwork.text.fontFamily = event.currentTarget.value;
                              }, 'Change text font')
                            }
                          >
                            {FONTS.map((font) => (
                              <option key={font.value} value={font.value}>
                                {font.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Weight">
                          <Select
                            value={selected.text.fontWeight}
                            onChange={(event) =>
                              updateArtwork(selected.id, (artwork) => {
                                if (artwork.text) {
                                  artwork.text.fontWeight = Number(event.currentTarget.value);
                                }
                              }, 'Change text weight')
                            }
                          >
                            {[300, 400, 500, 600, 700, 800].map((weight) => (
                              <option key={weight} value={weight}>
                                {weight}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Slider
                        label="Type size"
                        value={selected.text.fontSizePx}
                        min={20}
                        max={600}
                        step={1}
                        onChange={(value) =>
                          updateArtwork(selected.id, (artwork) => {
                            if (!artwork.text) return;
                            artwork.text.fontSizePx = value;
                            const lines = artwork.text.content.split('\n');
                            const longest = Math.max(1, ...lines.map((line) => line.length));
                            artwork.pixelWidth = Math.max(64, longest * value * 0.58);
                            artwork.pixelHeight = Math.max(32, lines.length * value * 1.24);
                          }, 'Resize text')
                        }
                        format={(value) => `${value} px`}
                      />
                      <Field label="Fill">
                        <div className="color-input">
                          <input
                            type="color"
                            value={selected.text.fill}
                            onChange={(event) =>
                              updateArtwork(selected.id, (artwork) => {
                                if (artwork.text) artwork.text.fill = event.currentTarget.value;
                              }, 'Change text colour')
                            }
                          />
                          <TextInput
                            className="mono"
                            value={selected.text.fill.toUpperCase()}
                            maxLength={7}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                                updateArtwork(selected.id, (artwork) => {
                                  if (artwork.text) artwork.text.fill = value;
                                }, 'Change text colour');
                              }
                            }}
                          />
                        </div>
                      </Field>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { value: 'left', icon: AlignLeft },
                          { value: 'center', icon: AlignCenter },
                          { value: 'right', icon: AlignRight },
                        ].map(({ value, icon: Icon }) => (
                          <Button
                            key={value}
                            size="sm"
                            variant={selected.text?.align === value ? 'primary' : 'default'}
                            onClick={() =>
                              updateArtwork(selected.id, (artwork) => {
                                if (artwork.text) {
                                  artwork.text.align = value as 'left' | 'center' | 'right';
                                }
                              }, 'Change text alignment')
                            }
                          >
                            <Icon size={13} />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="small muted">Select an artwork asset to inspect it.</p>
              )}
            </PanelBody>
          </Panel>

          <div className="issue info" style={{ margin: 0 }}>
            <PenTool size={15} className="issue-icon" />
            <div>
              <strong>Source preservation</strong>
              <p>
                Imported SVG files are kept as editable vector sources. WrapForge does not flatten
                them into raster data for placement. Raster source resolution is checked against
                print DPI in the print workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
