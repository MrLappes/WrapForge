import type { ProjectDocument } from './schema';
import { validatePrintProject } from '../print/validation';

export type ProjectIssueSeverity = 'error' | 'warning' | 'info';

export interface ProjectIssue {
  id: string;
  severity: ProjectIssueSeverity;
  title: string;
  detail: string;
  entityId?: string;
}

export interface ProjectIntegrityResult {
  issues: ProjectIssue[];
  errors: ProjectIssue[];
  warnings: ProjectIssue[];
  ok: boolean;
}

export function validateProjectIntegrity(project: ProjectDocument): ProjectIntegrityResult {
  const issues: ProjectIssue[] = [];
  const artworkIds = new Set<string>();
  const placementIds = new Set<string>();
  const panelIds = new Set(project.vehicle.panels.map((panel) => panel.id));

  for (const artwork of project.artwork) {
    if (artworkIds.has(artwork.id)) {
      issues.push({
        id: `duplicate-artwork-${artwork.id}`,
        severity: 'error',
        title: 'Duplicate artwork id',
        detail: `Artwork id "${artwork.id}" appears more than once.`,
        entityId: artwork.id,
      });
    }
    artworkIds.add(artwork.id);
    if (!artwork.sourcePath && !artwork.embeddedSource && artwork.kind !== 'text') {
      issues.push({
        id: `artwork-no-source-${artwork.id}`,
        severity: 'error',
        title: 'Artwork source is missing',
        detail: `"${artwork.name}" has neither a project file nor embedded data.`,
        entityId: artwork.id,
      });
    }
    if (artwork.kind === 'text' && !artwork.text) {
      issues.push({
        id: `artwork-text-config-${artwork.id}`,
        severity: 'error',
        title: 'Text artwork has no text configuration',
        detail: `"${artwork.name}" is marked as text but has no content settings.`,
        entityId: artwork.id,
      });
    }
    if (artwork.kind === 'raster' && (!artwork.pixelWidth || !artwork.pixelHeight)) {
      issues.push({
        id: `artwork-raster-dims-${artwork.id}`,
        severity: 'warning',
        title: 'Raster dimensions are unknown',
        detail: `"${artwork.name}" has no pixel dimensions. Resolution checks will be limited.`,
        entityId: artwork.id,
      });
    }
  }

  for (const placement of project.placements) {
    if (placementIds.has(placement.id)) {
      issues.push({
        id: `duplicate-placement-${placement.id}`,
        severity: 'error',
        title: 'Duplicate placement id',
        detail: `Placement id "${placement.id}" appears more than once.`,
        entityId: placement.id,
      });
    }
    placementIds.add(placement.id);
    if (!artworkIds.has(placement.artworkId)) {
      issues.push({
        id: `placement-missing-artwork-${placement.id}`,
        severity: 'error',
        title: 'Placement references missing artwork',
        detail: `"${placement.name}" points to artwork "${placement.artworkId}", which is not in the project.`,
        entityId: placement.id,
      });
    }
    if (!panelIds.has(placement.panelId)) {
      issues.push({
        id: `placement-missing-panel-${placement.id}`,
        severity: 'error',
        title: 'Placement references missing panel',
        detail: `"${placement.name}" points to panel "${placement.panelId}", which is not in the vehicle asset.`,
        entityId: placement.id,
      });
    } else {
      const panel = project.vehicle.panels.find((item) => item.id === placement.panelId);
      if (panel && !panel.wrapable) {
        issues.push({
          id: `placement-nonwrap-panel-${placement.id}`,
          severity: 'warning',
          title: 'Artwork is on a non-wrap panel',
          detail: `"${placement.name}" is placed on ${panel.name}, which is marked as a non-wrap surface.`,
          entityId: placement.id,
        });
      }
    }
    if (placement.u < 0 || placement.u > 1 || placement.v < 0 || placement.v > 1) {
      issues.push({
        id: `placement-out-of-bounds-${placement.id}`,
        severity: 'warning',
        title: 'Placement centre is outside the panel',
        detail: `"${placement.name}" has a centre outside the 0..1 UV range.`,
        entityId: placement.id,
      });
    }
  }

  if (project.vehicle.panels.length === 0) {
    issues.push({
      id: 'no-panels-loaded',
      severity: 'error',
      title: 'Vehicle has no panels',
      detail: 'The vehicle asset has no panel metadata. Import or repair the asset before designing.',
    });
  }
  if (!project.vehicle.license.id) {
    issues.push({
      id: 'missing-license',
      severity: 'warning',
      title: 'Vehicle license metadata is missing',
      detail: 'Record source and redistribution permissions before sharing this project.',
    });
  }
  if (project.name.trim().length === 0) {
    issues.push({
      id: 'empty-name',
      severity: 'warning',
      title: 'Project has no name',
      detail: 'Give the project a name so it can be identified in recent projects.',
    });
  }
  if (Date.parse(project.updatedAt) < Date.parse(project.createdAt)) {
    issues.push({
      id: 'timestamp-order',
      severity: 'info',
      title: 'Project timestamps are unusual',
      detail: 'The updated timestamp is older than the created timestamp.',
    });
  }
  for (const panelId of project.print.panelIds) {
    if (!panelIds.has(panelId)) {
      issues.push({
        id: `print-panel-missing-${panelId}`,
        severity: 'error',
        title: 'Print selection references a missing panel',
        detail: `Panel "${panelId}" is selected for print but is not part of the vehicle asset.`,
        entityId: panelId,
      });
    }
  }

  const printResult = validatePrintProject(project);
  for (const issue of printResult.errors) {
    issues.push({
      id: `print-${issue.id}`,
      severity: 'error',
      title: issue.title,
      detail: issue.detail,
      entityId: issue.panelId,
    });
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { issues, errors, warnings, ok: errors.length === 0 };
}

export function projectStats(project: ProjectDocument) {
  const wrapablePanels = project.vehicle.panels.filter((panel) => panel.wrapable);
  const coverageAreaM2 = wrapablePanels.reduce((sum, panel) => sum + (panel.areaM2 ?? 0), 0);
  return {
    artworkCount: project.artwork.length,
    placementCount: project.placements.length,
    panelCount: project.vehicle.panels.length,
    wrapablePanelCount: wrapablePanels.length,
    coverageAreaM2,
  };
}
