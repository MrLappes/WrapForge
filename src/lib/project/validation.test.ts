import { describe, expect, it } from 'vitest';
import { projectStats, validateProjectIntegrity } from './validation';
import { makeArtwork, makePanel, makePlacement, makeProject } from '../../test/fixtures';

describe('project integrity', () => {
  it('accepts a minimal valid project', () => {
    const result = validateProjectIntegrity(makeProject());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects duplicate artwork ids', () => {
    const project = makeProject({
      artwork: [makeArtwork(), makeArtwork()],
    });
    const result = validateProjectIntegrity(project);
    expect(result.errors.some((issue) => issue.id.startsWith('duplicate-artwork'))).toBe(true);
  });

  it('detects placements referencing missing artwork and panels', () => {
    const project = makeProject({
      artwork: [],
      placements: [
        makePlacement({ artworkId: 'missing-art', panelId: 'missing-panel' }),
      ],
    });
    const result = validateProjectIntegrity(project);
    const ids = result.errors.map((issue) => issue.id);
    expect(ids.some((id) => id.startsWith('placement-missing-artwork'))).toBe(true);
    expect(ids.some((id) => id.startsWith('placement-missing-panel'))).toBe(true);
  });

  it('warns when artwork is placed on a non-wrap panel', () => {
    const project = makeProject({
      vehicle: {
        ...makeProject().vehicle,
        panels: [makePanel({ wrapable: false })],
      },
      artwork: [makeArtwork()],
      placements: [makePlacement()],
    });
    const result = validateProjectIntegrity(project);
    expect(result.warnings.some((issue) => issue.id.startsWith('placement-nonwrap'))).toBe(true);
  });

  it('reports a missing print panel selection', () => {
    const project = makeProject({
      print: {
        ...makeProject().print,
        panelSelectionMode: 'custom',
        panelIds: ['missing'],
      },
    });
    const result = validateProjectIntegrity(project);
    expect(result.errors.some((issue) => issue.id.startsWith('print-panel-missing'))).toBe(true);
  });

  it('computes project statistics', () => {
    const stats = projectStats(makeProject());
    expect(stats.panelCount).toBe(1);
    expect(stats.wrapablePanelCount).toBe(1);
    expect(stats.artworkCount).toBe(0);
  });
});
