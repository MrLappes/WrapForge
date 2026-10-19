import { describe, expect, it } from 'vitest';
import { migrateProject } from './migrations';
import { makeProject } from '../../test/fixtures';

function envelope(project: unknown) {
  return {
    format: 'wrapforge-project',
    formatVersion: 1,
    appVersion: '0.1.0',
    savedAt: new Date().toISOString(),
    project,
  };
}

describe('project migrations', () => {
  it('migrates a pre-versioned project to the current schema', () => {
    const project = makeProject();
    const raw = { ...project } as Record<string, unknown>;
    delete raw.schemaVersion;
    delete raw.print;
    delete raw.render;
    delete raw.settings;
    delete raw.description;
    const result = migrateProject(raw);
    expect(result.fromVersion).toBe(0);
    expect(result.project.schemaVersion).toBe(2);
    expect(result.project.print.dpi).toBe(150);
    expect(result.project.render.engine).toBe('BLENDER_EEVEE');
    expect(result.project.settings.showGrid).toBe(true);
    expect(result.project.vehicle.livery.enabled).toBe(false);
    expect(result.applied).toHaveLength(2);
  });

  it('adds the texture livery model when migrating schema 1 projects', () => {
    const project = makeProject() as unknown as Record<string, unknown>;
    const vehicle = { ...(project.vehicle as Record<string, unknown>) };
    delete vehicle.livery;
    const raw = { ...project, schemaVersion: 1, vehicle };
    const result = migrateProject(raw);
    expect(result.fromVersion).toBe(1);
    expect(result.project.schemaVersion).toBe(2);
    expect(result.project.vehicle.livery.layers).toEqual([]);
    expect(result.project.vehicle.livery.finish.mode).toBe('tint');
    expect(result.applied).toHaveLength(1);
  });

  it('accepts the current envelope without migrating', () => {
    const project = makeProject();
    const result = migrateProject(envelope(project));
    expect(result.fromVersion).toBe(2);
    expect(result.project.name).toBe(project.name);
    expect(result.applied).toHaveLength(0);
  });

  it('rejects a project from a newer schema', () => {
    const project = { ...makeProject(), schemaVersion: 99 };
    expect(() => migrateProject(envelope(project))).toThrow(/newer version/i);
  });

  it('rejects an unsupported project format', () => {
    expect(() => migrateProject({ format: 'other-app', project: makeProject() })).toThrow(
      /Unsupported project format/i,
    );
  });

  it('reports invalid data with a field path', () => {
    const project = makeProject();
    project.vehicle.paintColor = 'not-a-color';
    expect(() => migrateProject(envelope(project))).toThrow(/vehicle.paintColor/);
  });
});
