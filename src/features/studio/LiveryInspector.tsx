import { useState } from 'react';
import {
  ChevronDown,
  Download,
  Eraser,
  FileImage,
  Upload,
  Image as ImageIcon,
  Layers,
  Paintbrush,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Badge, Button, IconButton, Slider, Toggle } from '../../components/ui';
import type {
  Livery,
  LiveryLayer,
  LiveryLayerKind,
  LiveryMapping,
} from '../../lib/project/schema';
import { LIVERY_PRESETS } from '../../lib/livery/presets';

export interface LiveryInspectorProps {
  livery: Livery;
  selectedLayerId: string | null;
  paintMode: boolean;
  brush: {
    color: string;
    size: number;
    opacity: number;
    hardness: number;
    erase: boolean;
  };
  onSelectLayer: (id: string | null) => void;
  onTogglePaintMode: () => void;
  onBrushChange: (patch: Partial<LiveryInspectorProps['brush']>) => void;
  onUpdate: (mutator: (livery: Livery) => void, label: string) => void;
  onAddLayer: (kind: LiveryLayerKind, mapping: LiveryMapping) => LiveryLayer;
  onUpdateLayer: (id: string, patch: Partial<LiveryLayer>, label?: string) => void;
  onDeleteLayer: (id: string) => void;
  onClearPainting: () => void;
  onApplyPreset: (presetId: string) => void;
  onExportTexture: () => void;
  onExportPsd: () => void;
  onImportPsd: () => void;
  onExportLayers: () => void;
  onSyncLayers: () => void;
  exchanging: boolean;
  strokeCount: number;
}

const MAPPINGS: Array<{ id: LiveryMapping; label: string }> = [
  { id: 'atlas', label: 'Texture (free)' },
  { id: 'side-left', label: 'Left side' },
  { id: 'side-right', label: 'Right side' },
  { id: 'top', label: 'Top / bonnet' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
];

const KINDS: Array<{ id: LiveryLayerKind; label: string }> = [
  { id: 'stripe', label: 'Stripe' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'text', label: 'Text' },
];

export function LiveryInspector(props: LiveryInspectorProps) {
  const { livery, brush, selectedLayerId } = props;
  const [addOpen, setAddOpen] = useState(false);
  const [newMapping, setNewMapping] = useState<LiveryMapping>('side-left');
  const selected = livery.layers.find((layer) => layer.id === selectedLayerId) ?? null;

  return (
    <>
      <div className="inspector-section">
        <h3>Brush</h3>
        <div className="row">
          <Button
            size="sm"
            variant={props.paintMode ? 'primary' : 'default'}
            onClick={props.onTogglePaintMode}
          >
            <Paintbrush size={13} />
            {props.paintMode ? 'Painting on car' : 'Paint on car'}
          </Button>
          <IconButton
            label="Eraser"
            active={brush.erase}
            onClick={() => props.onBrushChange({ erase: !brush.erase })}
          >
            <Eraser size={14} />
          </IconButton>
          <span className="spacer" />
          <Badge>{props.strokeCount} strokes</Badge>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          Drag directly on the body. Strokes are stored as vector points, so they survive resolution
          changes and can be undone.
        </p>
        <div className="color-input" style={{ marginTop: 8 }}>
          <input
            type="color"
            value={brush.color}
            onChange={(event) => props.onBrushChange({ color: event.currentTarget.value })}
            aria-label="Brush colour"
          />
          <input
            className="input mono"
            value={brush.color.toUpperCase()}
            onChange={(event) => props.onBrushChange({ color: event.currentTarget.value })}
            maxLength={7}
            aria-label="Brush hex value"
          />
        </div>
        <Slider
          label="Size"
          value={brush.size}
          min={0.004}
          max={0.16}
          step={0.002}
          onChange={(value) => props.onBrushChange({ size: value })}
          format={(value) => `${(value * 100).toFixed(1)}% of texture`}
        />
        <Slider
          label="Opacity"
          value={brush.opacity}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(value) => props.onBrushChange({ opacity: value })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <Slider
          label="Hardness"
          value={brush.hardness}
          min={0}
          max={1}
          step={0.02}
          onChange={(value) => props.onBrushChange({ hardness: value })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        {props.strokeCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={props.onClearPainting} style={{ marginTop: 6 }}>
            <Trash2 size={12} />
            Clear brushwork
          </Button>
        ) : null}
      </div>

      <div className="inspector-section">
        <h3>Body finish</h3>
        <div className="segmented">
          {(['original', 'tint', 'solid'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={livery.finish.mode === mode ? 'active' : ''}
              onClick={() =>
                props.onUpdate((draft) => {
                  draft.finish.mode = mode;
                }, 'Change finish mode')
              }
            >
              {mode === 'original' ? 'Original' : mode === 'tint' ? 'Tint' : 'Solid'}
            </button>
          ))}
        </div>
        <div className="color-input" style={{ marginTop: 8 }}>
          <input
            type="color"
            value={livery.finish.color}
            onChange={(event) =>
              props.onUpdate((draft) => {
                draft.finish.color = event.currentTarget.value;
                if (draft.finish.mode === 'original') draft.finish.mode = 'tint';
              }, 'Change body colour')
            }
            aria-label="Body colour"
          />
          <input
            className="input mono"
            value={livery.finish.color.toUpperCase()}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                props.onUpdate((draft) => {
                  draft.finish.color = value;
                  if (draft.finish.mode === 'original') draft.finish.mode = 'tint';
                }, 'Change body colour');
              }
            }}
            maxLength={7}
            aria-label="Body hex value"
          />
        </div>
        <Slider
          label="Strength"
          value={livery.finish.strength}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) =>
            props.onUpdate((draft) => {
              draft.finish.strength = value;
            }, 'Change finish strength')
          }
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <p className="small muted">
          Tint keeps the model&apos;s baked shading and recolours it, which looks like real paint on
          scanned models.
        </p>
        <Toggle
          label="Wrap over glass"
          hint="Off keeps the model's windows clear; on lets the foil cover them."
          checked={livery.wrapGlass}
          onChange={(checked) =>
            props.onUpdate((draft) => {
              draft.wrapGlass = checked;
            }, 'Toggle wrapping over glass')
          }
        />
      </div>

      <div className="inspector-section">
        <h3>
          <FileImage size={13} className="dim" /> Layer exchange
        </h3>
        <div className="row wrap">
          <Button size="sm" onClick={props.onExportPsd} disabled={props.exchanging}>
            <Download size={12} />
            Export PSD
          </Button>
          <Button size="sm" onClick={props.onImportPsd} disabled={props.exchanging}>
            <Upload size={12} />
            Import PSD
          </Button>
        </div>
        <div className="row wrap" style={{ marginTop: 6 }}>
          <Button size="sm" variant="ghost" onClick={props.onExportLayers} disabled={props.exchanging}>
            Export layer PNGs
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onSyncLayers} disabled={props.exchanging}>
            Sync layer PNGs
          </Button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          The PSD keeps one layer per foil layer with blend mode, opacity and visibility. Edit it in
          Photoshop, save, then import it back and the car updates. Layer PNGs are the fallback for
          other editors.
        </p>
      </div>

      <div className="inspector-section">
        <h3>
          <Sparkles size={13} className="dim" /> Presets
        </h3>
        <div className="preset-list">
          {LIVERY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset-card"
              onClick={() => props.onApplyPreset(preset.id)}
              title={preset.description}
            >
              <span className="preset-swatches">
                {preset.swatches.map((swatch) => (
                  <span key={swatch} style={{ background: swatch }} />
                ))}
              </span>
              <span className="preset-name">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <h3>
          <Layers size={13} className="dim" /> Layers
        </h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <Button size="sm" variant="primary" onClick={() => setAddOpen((value) => !value)}>
            <Plus size={12} />
            Add layer
            <ChevronDown size={12} />
          </Button>
          <select
            className="select"
            value={newMapping}
            onChange={(event) => setNewMapping(event.currentTarget.value as LiveryMapping)}
            aria-label="Projection for new layer"
            style={{ maxWidth: 130 }}
          >
            {MAPPINGS.map((mapping) => (
              <option key={mapping.id} value={mapping.id}>
                {mapping.label}
              </option>
            ))}
          </select>
        </div>
        {addOpen ? (
          <div className="layer-add-grid">
            {KINDS.map((kind) => (
              <Button
                key={kind.id}
                size="sm"
                variant="ghost"
                onClick={() => {
                  const layer = props.onAddLayer(kind.id, newMapping);
                  props.onSelectLayer(layer.id);
                  setAddOpen(false);
                }}
              >
                {kind.id === 'text' ? <Type size={12} /> : <ImageIcon size={12} />}
                {kind.label}
              </Button>
            ))}
          </div>
        ) : null}

        {livery.layers.length === 0 ? (
          <p className="small muted">No shape layers yet. Add one, or paint directly on the car.</p>
        ) : (
          <div className="layer-list">
            {[...livery.layers].reverse().map((layer) => (
              <div
                key={layer.id}
                className={`layer-row ${layer.id === selectedLayerId ? 'selected' : ''}`}
                onClick={() => props.onSelectLayer(layer.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') props.onSelectLayer(layer.id);
                }}
              >
                <span className="layer-swatch" style={{ background: layer.color }}>
                  {layer.kind === 'text' ? 'T' : ''}
                </span>
                <span className="layer-name">{layer.name}</span>
                <span className="layer-mapping">{layer.mapping.replace('side-', '')}</span>
                <IconButton
                  label={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onUpdateLayer(layer.id, { visible: !layer.visible }, 'Toggle layer');
                  }}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </IconButton>
                <IconButton
                  label="Delete layer"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onDeleteLayer(layer.id);
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {selected ? (
          <div className="layer-editor">
            <div className="row">
              <input
                className="input"
                value={selected.name}
                onChange={(event) =>
                  props.onUpdateLayer(selected.id, { name: event.currentTarget.value }, 'Rename layer')
                }
                aria-label="Layer name"
              />
              <select
                className="select"
                value={selected.mapping}
                onChange={(event) =>
                  props.onUpdateLayer(
                    selected.id,
                    { mapping: event.currentTarget.value as LiveryMapping },
                    'Change layer projection',
                  )
                }
                aria-label="Layer projection"
              >
                {MAPPINGS.map((mapping) => (
                  <option key={mapping.id} value={mapping.id}>
                    {mapping.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="color-input" style={{ marginTop: 8 }}>
              <input
                type="color"
                value={selected.color}
                onChange={(event) =>
                  props.onUpdateLayer(selected.id, { color: event.currentTarget.value }, 'Change layer colour')
                }
                aria-label="Layer colour"
              />
              <input
                type="color"
                value={selected.secondaryColor ?? selected.color}
                onChange={(event) =>
                  props.onUpdateLayer(
                    selected.id,
                    { secondaryColor: event.currentTarget.value },
                    'Change layer gradient',
                  )
                }
                aria-label="Layer secondary colour"
              />
              <select
                className="select"
                value={selected.blend}
                onChange={(event) =>
                  props.onUpdateLayer(
                    selected.id,
                    { blend: event.currentTarget.value as LiveryLayer['blend'] },
                    'Change blend mode',
                  )
                }
                aria-label="Layer blend mode"
              >
                {['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'soft-light'].map(
                  (mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ),
                )}
              </select>
            </div>
            {selected.kind === 'text' && selected.text ? (
              <>
                <input
                  className="input"
                  value={selected.text.content}
                  onChange={(event) =>
                    props.onUpdateLayer(
                      selected.id,
                      { text: { ...selected.text!, content: event.currentTarget.value } },
                      'Edit layer text',
                    )
                  }
                  aria-label="Layer text"
                  style={{ marginTop: 8 }}
                />
                <Slider
                  label="Text size"
                  value={selected.text.sizePx}
                  min={40}
                  max={520}
                  step={2}
                  onChange={(value) =>
                    props.onUpdateLayer(
                      selected.id,
                      { text: { ...selected.text!, sizePx: value } },
                      'Resize layer text',
                    )
                  }
                  format={(value) => `${Math.round(value)} px`}
                />
                <Slider
                  label="Tracking"
                  value={selected.text.letterSpacingPx}
                  min={-20}
                  max={60}
                  step={1}
                  onChange={(value) =>
                    props.onUpdateLayer(
                      selected.id,
                      { text: { ...selected.text!, letterSpacingPx: value } },
                      'Change tracking',
                    )
                  }
                  format={(value) => `${Math.round(value)} px`}
                />
              </>
            ) : null}
            <Slider
              label="Horizontal"
              value={selected.u}
              min={-0.2}
              max={1.2}
              step={0.002}
              onChange={(value) => props.onUpdateLayer(selected.id, { u: value }, 'Move layer')}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Vertical"
              value={selected.v}
              min={-0.2}
              max={1.2}
              step={0.002}
              onChange={(value) => props.onUpdateLayer(selected.id, { v: value }, 'Move layer')}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Width"
              value={selected.w}
              min={0.01}
              max={1.6}
              step={0.002}
              onChange={(value) => props.onUpdateLayer(selected.id, { w: value }, 'Resize layer')}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Height"
              value={selected.h}
              min={0.004}
              max={1.6}
              step={0.002}
              onChange={(value) => props.onUpdateLayer(selected.id, { h: value }, 'Resize layer')}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Slider
              label="Rotation"
              value={selected.rotationDeg}
              min={-180}
              max={180}
              step={0.5}
              onChange={(value) =>
                props.onUpdateLayer(selected.id, { rotationDeg: value }, 'Rotate layer')
              }
              format={(value) => `${value.toFixed(1)}°`}
            />
            <Slider
              label="Opacity"
              value={selected.opacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                props.onUpdateLayer(selected.id, { opacity: value }, 'Change layer opacity')
              }
              format={(value) => `${Math.round(value * 100)}%`}
            />
            <Toggle
              label="Visible"
              checked={selected.visible}
              onChange={(checked) =>
                props.onUpdateLayer(selected.id, { visible: checked }, 'Toggle layer')
              }
            />
          </div>
        ) : null}
      </div>

      <div className="inspector-section">
        <h3>Texture export</h3>
        <div className="row">
          <select
            className="select"
            value={livery.resolution}
            onChange={(event) =>
              props.onUpdate((draft) => {
                draft.resolution = Number(event.currentTarget.value);
              }, 'Change texture resolution')
            }
            aria-label="Texture resolution"
          >
            {[1024, 1536, 2048, 3072, 4096].map((size) => (
              <option key={size} value={size}>
                {size} × {size}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={props.onExportTexture}>
            Export PNG
          </Button>
        </div>
        <p className="small muted">
          The exported PNG is the exact texture that the Blender render and the 3D view use, so a
          printer or a game engine can consume it directly.
        </p>
      </div>
    </>
  );
}
