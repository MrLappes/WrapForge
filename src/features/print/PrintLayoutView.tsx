import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Info,
  Printer,
  Ruler,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useProjectStore } from '../../lib/store/projectStore';
import { useUiStore } from '../../lib/store/uiStore';
import { useProjectActions } from '../../lib/useProjectActions';
import { useExportStore } from '../../lib/store/exportStore';
import { useTranslation } from '../../lib/i18n';
import { useArtworkImages } from '../studio/useArtworkImages';
import { platform, slugifyProjectName } from '../../lib/platform';
import { APP_VERSION } from '../../lib/project/schema';
import {
  exportLabel,
  validatePrintProject,
  type PanelPrintPlan,
  type PrintIssue,
} from '../../lib/print/validation';
import { formatMm } from '../../lib/print/units';
import {
  canvasToBase64,
  renderPanelSvg,
  renderPrintPanel,
} from '../../lib/graphics/panelTexture';
import { artworkSource } from '../../lib/graphics/artwork';
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
  Stat,
  Toggle,
} from '../../components/ui';

export function PrintLayoutView() {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const root = useProjectStore((state) => state.root);
  const actions = useProjectActions();
  const ui = useUiStore();
  const { images } = useArtworkImages(project?.artwork ?? [], root);
  const [previewPanelId, setPreviewPanelId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [includeSvg, setIncludeSvg] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{
    directory: string;
    label: string;
    files: string[];
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const validation = useMemo(() => (project ? validatePrintProject(project) : null), [project]);

  useEffect(() => {
    setAcknowledged(false);
  }, [validation?.warnings.length]);

  const previewPlan = useMemo(() => {
    if (!validation) return null;
    return (
      validation.allPlans.find((plan) => plan.panelId === previewPanelId) ??
      validation.allPlans[0] ??
      null
    );
  }, [previewPanelId, validation]);

  useEffect(() => {
    if (!project || !previewPlan || !validation || !canvasRef.current) return;
    const panel = project.vehicle.panels.find((item) => item.id === previewPlan.panelId);
    if (!panel) return;
    const placements = project.placements.filter((item) => item.panelId === panel.id);
    try {
      const result = renderPrintPanel({
        panel,
        plan: previewPlan,
        config: project.print,
        placements,
        artworks: project.artwork,
        images,
        paintColor: project.vehicle.paintColor,
        includeGuides: true,
        previewWidthPx: 980,
      });
      const canvas = canvasRef.current;
      canvas.width = result.width;
      canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(result.canvas, 0, 0);
    } catch {
      // Preview failures are surfaced by the validation panel; do not blank the app.
    }
  }, [project, previewPlan, validation, images]);

  if (!project || !validation) {
    return (
      <div className="content">
        <EmptyState icon={<Printer size={26} />} title="No project open">
          Open a project to prepare print output.
        </EmptyState>
      </div>
    );
  }

  const wrapable = project.vehicle.panels.filter((panel) => panel.wrapable);
  const isSelected = (panelId: string) =>
    project.print.panelSelectionMode === 'all' || project.print.panelIds.includes(panelId);
  const selectedPanels = validation.selectedPanels;
  const label = exportLabel(validation);
  const canExport = validation.errors.length === 0 && (validation.warnings.length === 0 || acknowledged);
  const totalMemory = validation.panels.reduce((sum, plan) => sum + plan.estimatedMemoryMb, 0);

  const updatePrint = (patch: Partial<typeof project.print>, message: string) => {
    actions.updateProject((draft) => {
      Object.assign(draft.print, patch);
    }, message);
  };

  const togglePanel = (panelId: string) => {
    const current =
      project.print.panelSelectionMode === 'all'
        ? wrapable.map((panel) => panel.id)
        : project.print.panelIds;
    const next = current.includes(panelId)
      ? current.filter((id) => id !== panelId)
      : [...current, panelId];
    updatePrint(
      { panelSelectionMode: 'custom', panelIds: next },
      'Change print panel selection',
    );
  };

  const exportPanels = async (plans: PanelPrintPlan[]) => {
    if (validation.errors.length > 0) {
      ui.notify('error', 'Export blocked', 'Resolve the blocking validation errors first.');
      return;
    }
    if (validation.warnings.length > 0 && !acknowledged) {
      ui.notify(
        'warning',
        'Warnings need acknowledgment',
        'Review the warnings and confirm the draft export before writing files.',
      );
      return;
    }
    const directory = await platform.chooseExportDirectory();
    if (!directory) return;
    setExporting(true);
    ui.setStatus('Rendering print panels…');
    const files: string[] = [];
    try {
      const manifestPanels: Array<Record<string, unknown>> = [];
      for (let index = 0; index < plans.length; index += 1) {
        const plan = plans[index];
        const panel = project.vehicle.panels.find((item) => item.id === plan.panelId);
        if (!panel) continue;
        ui.setStatus(`Rendering ${panel.name} (${index + 1}/${plans.length})…`);
        const placements = project.placements.filter((item) => item.panelId === panel.id);
        const rendered = renderPrintPanel({
          panel,
          plan,
          config: project.print,
          placements,
          artworks: project.artwork,
          images,
          paintColor: project.vehicle.paintColor,
          includeGuides: true,
        });
        const prefix = label === 'print-ready' ? 'wrapforge' : 'wrapforge-draft';
        const baseName = `${prefix}-${slugifyProjectName(panel.name)}-${plan.pixelWidth}x${plan.pixelHeight}-${project.print.dpi}dpi`;
        const pngName = `${baseName}.png`;
        await platform.writeExportFile(directory, pngName, {
          base64: canvasToBase64(rendered.canvas),
        });
        files.push(pngName);
        let svgName: string | null = null;
        if (includeSvg) {
          const sources = new Map<string, string>();
          for (const placement of placements) {
            const artwork = project.artwork.find((item) => item.id === placement.artworkId);
            if (!artwork || artwork.kind === 'text') continue;
            const source = await artworkSource(artwork, root);
            if (source) sources.set(artwork.id, source);
          }
          const svg = renderPanelSvg({
            panel,
            plan,
            config: project.print,
            placements,
            artworks: project.artwork,
            sources,
            paintColor: project.vehicle.paintColor,
            includeGuides: true,
          });
          svgName = `${baseName}.svg`;
          await platform.writeExportFile(directory, svgName, { text: svg });
          files.push(svgName);
        }
        manifestPanels.push({
          panelId: panel.id,
          panelName: panel.name,
          dimensionsMm: panel.dimensionsMm,
          plan: {
            trimWidthMm: plan.trimWidthMm,
            trimHeightMm: plan.trimHeightMm,
            outputWidthMm: plan.outputWidthMm,
            outputHeightMm: plan.outputHeightMm,
            bleedMm: plan.bleedMm,
            pixelWidth: plan.pixelWidth,
            pixelHeight: plan.pixelHeight,
            dpi: project.print.dpi,
            scale: project.print.scale,
          },
          files: { png: pngName, svg: svgName },
          issues: plan.issues,
          dimensionsVerified: false,
          flatteningMethod: 'planar-uv-outer-face',
          distortionNote:
            'Sample panels are planar plates. No curved-surface parameterisation or flattening was applied.',
        });
      }

      const manifest = {
        format: 'wrapforge-print-manifest',
        formatVersion: 1,
        appVersion: APP_VERSION,
        generatedAt: new Date().toISOString(),
        label,
        productionReady: validation.productionReady,
        acknowledgedWarnings: acknowledged,
        project: { id: project.id, name: project.name },
        vehicle: {
          assetId: project.vehicle.assetId,
          displayName: project.vehicle.displayName,
          dimensionsMm: project.vehicle.dimensionsMm,
          license: project.vehicle.license,
        },
        configuration: project.print,
        validation: {
          errors: validation.errors,
          warnings: validation.warnings,
          info: validation.issues.filter((issue) => issue.severity === 'info'),
        },
        panels: manifestPanels,
        notes: [
          'Physical dimensions are computed from the vehicle asset panel metadata, not measured from a physical vehicle.',
          'The sample asset is stylized geometry. It is not installation-ready.',
          'No CMYK conversion, ICC profile, spot colour, or printer-specific ink limit is applied. Output is RGB.',
          'Planar UV layouts are exported directly. Curved panels are not geometrically unfolded.',
          'Trim and safe margins are generated from project settings. Review them against the installer’s templates.',
          'Live text is not outlined automatically. Confirm fonts or outline text before production.',
        ],
      };
      const manifestName = `${label === 'print-ready' ? 'wrapforge' : 'wrapforge-draft'}-print-manifest.json`;
      await platform.writeExportFile(directory, manifestName, {
        text: JSON.stringify(manifest, null, 2),
      });
      files.push(manifestName);
      setLastExport({ directory, label, files });
      useExportStore.getState().add({
        kind: 'print',
        label: label === 'print-ready' ? 'print-ready' : 'draft',
        path: directory,
        files: files.length,
      });
      ui.notify(
        'success',
        label === 'print-ready' ? 'Print package exported' : 'Draft print package exported',
        `${plans.length} panel(s), ${files.length} file(s) → ${directory}`,
      );
      ui.setStatus('Print export complete');
    } catch (error) {
      ui.notify(
        'error',
        'Print export failed',
        error instanceof Error ? error.message : String(error),
      );
      ui.setStatus('Print export failed');
    } finally {
      setExporting(false);
    }
  };

  const exportManifestOnly = async () => {
    const directory = await platform.chooseExportDirectory();
    if (!directory) return;
    try {
      const payload = {
        format: 'wrapforge-print-manifest',
        formatVersion: 1,
        appVersion: APP_VERSION,
        generatedAt: new Date().toISOString(),
        label,
        productionReady: validation.productionReady,
        project: { id: project.id, name: project.name },
        vehicle: project.vehicle,
        configuration: project.print,
        validation,
      };
      const name = `${label === 'print-ready' ? 'wrapforge' : 'wrapforge-draft'}-print-manifest.json`;
      await platform.writeExportFile(directory, name, {
        text: JSON.stringify(payload, null, 2),
      });
      ui.notify('success', 'Manifest exported', `${name} → ${directory}`);
    } catch (error) {
      ui.notify('error', 'Manifest export failed', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>{t('print.title')}</h1>
          <p>{t('print.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => void exportManifestOnly()}>
            <FileJson size={14} />
            {t('print.exportManifest')}
          </Button>
          <Button
            variant="primary"
            disabled={!canExport || exporting || selectedPanels.length === 0}
            onClick={() => void exportPanels(validation.panels)}
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : `Export ${selectedPanels.length} panel${selectedPanels.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <Stat
          label="Export label"
          value={label === 'print-ready' ? t('common.printReady') : t('common.draft')}
        />
        <Stat label="Selected panels" value={selectedPanels.length} />
        <Stat
          label="Largest output"
          value={
            validation.panels.length > 0
              ? `${Math.max(...validation.panels.map((plan) => plan.pixelWidth))} px`
              : '—'
          }
        />
        <Stat label="Raster memory" value={Math.round(totalMemory)} unit="MB" />
      </div>

      <div className="split">
        <div className="stack">
          <Panel>
            <PanelHeader title={t('print.output')} icon={<Ruler size={15} />} />
            <PanelBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <Field label={t('print.unit')} htmlFor="print-unit">
                  <Select
                    id="print-unit"
                    value={project.print.unit}
                    onChange={(event) =>
                      updatePrint(
                        { unit: event.currentTarget.value as 'mm' | 'cm' | 'in' },
                        'Change print unit',
                      )
                    }
                  >
                    <option value="mm">Millimetres</option>
                    <option value="cm">Centimetres</option>
                    <option value="in">Inches</option>
                  </Select>
                </Field>
                <Field label={t('print.scale')} htmlFor="print-scale" hint="1.00 = 100%">
                  <NumberInput
                    id="print-scale"
                    value={project.print.scale}
                    min={0.05}
                    max={10}
                    step={0.01}
                    onValueChange={(value) =>
                      updatePrint({ scale: clamp(value, 0.05, 10) }, 'Change print scale')
                    }
                  />
                </Field>
                <Field label={t('print.dpi')} htmlFor="print-dpi">
                  <NumberInput
                    id="print-dpi"
                    value={project.print.dpi}
                    min={30}
                    max={1200}
                    step={1}
                    onValueChange={(value) =>
                      updatePrint({ dpi: Math.round(clamp(value, 30, 1200)) }, 'Change print DPI')
                    }
                  />
                </Field>
                <Field label={`${t('print.bleed')} (mm)`} htmlFor="print-bleed">
                  <NumberInput
                    id="print-bleed"
                    value={project.print.bleedMm}
                    min={0}
                    max={100}
                    step={0.5}
                    onValueChange={(value) =>
                      updatePrint({ bleedMm: clamp(value, 0, 100) }, 'Change bleed')
                    }
                  />
                </Field>
                <Field label={`${t('print.safe')} (mm)`} htmlFor="print-safe">
                  <NumberInput
                    id="print-safe"
                    value={project.print.safeMarginMm}
                    min={0}
                    max={100}
                    step={0.5}
                    onValueChange={(value) =>
                      updatePrint({ safeMarginMm: clamp(value, 0, 100) }, 'Change safe margin')
                    }
                  />
                </Field>
                <Field label={t('print.colorMode')} htmlFor="print-color">
                  <Select
                    id="print-color"
                    value={project.print.colorMode}
                    onChange={(event) =>
                      updatePrint(
                        { colorMode: event.currentTarget.value as 'rgb' | 'cmyk' },
                        'Change colour mode',
                      )
                    }
                  >
                    <option value="rgb">RGB (implemented)</option>
                    <option value="cmyk">CMYK (not implemented)</option>
                  </Select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Toggle
                  label={t('print.registration')}
                  checked={project.print.includeRegistrationMarks}
                  onChange={(checked) =>
                    updatePrint({ includeRegistrationMarks: checked }, 'Toggle registration marks')
                  }
                />
                <Toggle
                  label={t('print.labels')}
                  checked={project.print.includePanelLabels}
                  onChange={(checked) =>
                    updatePrint({ includePanelLabels: checked }, 'Toggle panel labels')
                  }
                />
                <Toggle
                  label="Export SVG alongside PNG"
                  checked={includeSvg}
                  onChange={setIncludeSvg}
                />
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title={t('print.panels')}
              subtitle={`${selectedPanels.length} selected · panel checkboxes drive the export`}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updatePrint({ panelSelectionMode: 'all', panelIds: [] }, 'Select all panels')
                    }
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updatePrint(
                        { panelSelectionMode: 'custom', panelIds: [] },
                        'Clear panel selection',
                      )
                    }
                  >
                    None
                  </Button>
                </>
              }
            />
            <PanelBody tight>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }} />
                    <th>Panel</th>
                    <th className="num">Trim</th>
                    <th className="num">Output</th>
                    <th className="num">Pixels</th>
                    <th className="num">Memory</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.allPlans.map((plan) => {
                    const selected = isSelected(plan.panelId);
                    const errors = plan.issues.filter((issue) => issue.severity === 'error').length;
                    const warnings = plan.issues.filter((issue) => issue.severity === 'warning').length;
                    return (
                      <tr
                        key={plan.panelId}
                        onClick={() => setPreviewPanelId(plan.panelId)}
                        style={{
                          cursor: 'pointer',
                          background:
                            previewPlan?.panelId === plan.panelId ? 'var(--accent-soft)' : undefined,
                        }}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePanel(plan.panelId)}
                            aria-label={`Include ${plan.panelName}`}
                          />
                        </td>
                        <td>{plan.panelName}</td>
                        <td className="num">
                          {formatMm(plan.trimWidthMm, project.print.unit, 1)} ×{' '}
                          {formatMm(plan.trimHeightMm, project.print.unit, 1)}
                        </td>
                        <td className="num">
                          {formatMm(plan.outputWidthMm, project.print.unit, 1)} ×{' '}
                          {formatMm(plan.outputHeightMm, project.print.unit, 1)}
                        </td>
                        <td className="num">
                          {plan.pixelWidth} × {plan.pixelHeight}
                        </td>
                        <td className="num">{Math.round(plan.estimatedMemoryMb)} MB</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {errors > 0 ? <Badge variant="red">{errors} error</Badge> : null}
                            {warnings > 0 ? <Badge variant="amber">{warnings} warn</Badge> : null}
                            {errors === 0 && warnings === 0 ? <Badge variant="green">OK</Badge> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Print preview"
              subtitle={previewPlan ? previewPlan.panelName : 'No panel selected'}
              actions={
                previewPlan ? (
                  <Badge variant={previewPlan.issues.some((issue) => issue.severity === 'error') ? 'red' : 'amber'}>
                    {label === 'print-ready' ? t('common.printReady') : t('common.draft')}
                  </Badge>
                ) : null
              }
            />
            <PanelBody>
              {previewPlan ? (
                <>
                  <div className="preview-frame">
                    <canvas
                      ref={canvasRef}
                      style={{ maxWidth: '100%', maxHeight: 520, display: 'block' }}
                      aria-label={`Print preview for ${previewPlan.panelName}`}
                    />
                    <span className="preview-note">
                      Bleed {project.print.bleedMm} mm · safe {project.print.safeMarginMm} mm ·{' '}
                      {project.print.dpi} DPI · {label.toUpperCase()}
                    </span>
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    Trim {formatMm(previewPlan.trimWidthMm, project.print.unit)} ×{' '}
                    {formatMm(previewPlan.trimHeightMm, project.print.unit)} · output{' '}
                    {previewPlan.pixelWidth} × {previewPlan.pixelHeight} px ·{' '}
                    {Math.round(previewPlan.estimatedMemoryMb)} MB raster
                  </div>
                </>
              ) : (
                <p className="small muted">Select a panel row to preview its print output.</p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="stack">
          <Panel>
            <PanelHeader
              title={t('print.validation')}
              icon={validation.productionReady ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
              actions={
                <Badge variant={validation.productionReady ? 'green' : validation.errors.length > 0 ? 'red' : 'amber'}>
                  {validation.productionReady ? t('print.productionReady') : t('print.notReady')}
                </Badge>
              }
            />
            <PanelBody>
              {validation.issues.length === 0 ? (
                <div className="issue pass">
                  <CheckCircle2 size={15} className="issue-icon" />
                  <div>
                    <strong>All production checks passed</strong>
                    <p>No blocking errors or warnings remain for the selected panels.</p>
                  </div>
                </div>
              ) : (
                <div className="issue-list">
                  {validation.issues.map((issue) => (
                    <ValidationRow issue={issue} key={issue.id} />
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && validation.errors.length === 0 ? (
                <label
                  className="small"
                  style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}
                >
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    I acknowledge these warnings. Export files will be labelled{' '}
                    <strong>DRAFT</strong> and are not production-ready.
                  </span>
                </label>
              ) : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Export" icon={<Download size={15} />} />
            <PanelBody>
              <div className="small muted" style={{ marginBottom: 10 }}>
                {selectedPanels.length} panel(s), PNG{includeSvg ? ' + SVG' : ''} and a manifest.
                Files are written to a folder you choose.
              </div>
              <div className="issue warning" style={{ marginBottom: 10 }}>
                <AlertTriangle size={15} className="issue-icon" />
                <div>
                  <strong>Draft, not production-ready</strong>
                  <p>
                    CMYK conversion, ICC profiles, geometric unfolding of curved panels, and
                    installer-specific trim templates are not implemented. Treat every export as a
                    draft until verified against the printer and installer workflow.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                disabled={!canExport || exporting || selectedPanels.length === 0}
                onClick={() => void exportPanels(validation.panels)}
                style={{ width: '100%' }}
              >
                <Download size={14} />
                {exporting ? 'Exporting…' : `Export ${selectedPanels.length} panel(s)`}
              </Button>
              {validation.errors.length > 0 ? (
                <p className="tiny" style={{ color: 'var(--red)', marginTop: 8 }}>
                  Export is blocked until all errors are resolved.
                </p>
              ) : null}
              {lastExport ? (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div className="tiny dim">Last export · {lastExport.label.toUpperCase()}</div>
                  <div className="small mono" style={{ wordBreak: 'break-all' }}>
                    {lastExport.directory}
                  </div>
                  <div className="tiny dim">{lastExport.files.length} files written</div>
                </div>
              ) : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Known print limitations" icon={<Info size={15} />} />
            <PanelBody>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
                <li>RGB raster and SVG output only; no CMYK or ICC pipeline.</li>
                <li>Planar UV panels; no curved-surface unfolding.</li>
                <li>Live text is not auto-outlined.</li>
                <li>Panel dimensions come from the sample asset, not manufacturer data.</li>
                <li>Distortion heatmaps and installation relief planning are not implemented.</li>
              </ul>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ValidationRow({ issue }: { issue: PrintIssue }) {
  const Icon =
    issue.severity === 'error'
      ? ShieldAlert
      : issue.severity === 'warning'
        ? AlertTriangle
        : Info;
  return (
    <div className={`issue ${issue.severity}`}>
      <Icon size={15} className="issue-icon" />
      <div>
        <strong>{issue.title}</strong>
        <p>{issue.detail}</p>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
