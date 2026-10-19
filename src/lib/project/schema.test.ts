import { describe, expect, it } from 'vitest';
import { ProjectDocument, ProjectEnvelope, SCHEMA_VERSION } from './schema';
import { createDefaultProject } from './defaults';
import { makeProject } from '../../test/fixtures';

describe('project schema', () => {
  it('accepts a default project', () => {
    const project = makeProject();
    expect(ProjectDocument.parse(project).schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.print.panelSelectionMode).toBe('all');
    expect(project.vehicle.panels.length).toBeGreaterThan(0);
  });

  it('rejects invalid paint colours', () => {
    const project = makeProject();
    project.vehicle.paintColor = 'red';
    expect(() => ProjectDocument.parse(project)).toThrow();
  });

  it('rejects a project with an invalid placement range', () => {
    const project = makeProject();
    project.placements = [
      {
        id: 'p1',
        name: 'bad',
        artworkId: 'a1',
        panelId: 'hood',
        mapping: 'uv',
        u: 2,
        v: 0.5,
        widthFraction: 0.5,
        rotationDeg: 0,
        opacity: 1,
        visible: true,
        locked: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(() => ProjectDocument.parse(project)).toThrow();
  });

  it('validates an envelope', () => {
    const project = makeProject();
    const envelope = {
      format: 'wrapforge-project',
      formatVersion: 1,
      appVersion: '0.0.0',
      savedAt: new Date().toISOString(),
      project,
    };
    expect(ProjectEnvelope.parse(envelope).project.name).toBe(project.name);
  });

  it('creates project ids and timestamps', () => {
    const project = createDefaultProject({
      assetId: 'a',
      displayName: 'A',
      dimensionsMm: { length: 1, width: 1, height: 1 },
      license: { id: 'CC0-1.0' },
      panels: [],
    });
    expect(project.id).toMatch(/^proj_/);
    expect(project.createdAt).toMatch(/T/);
  });
});
