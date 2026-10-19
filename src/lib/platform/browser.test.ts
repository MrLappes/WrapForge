import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserPlatform } from './browser';
import { createEnvelope } from '../project/defaults';
import { makeProject } from '../../test/fixtures';

beforeEach(() => {
  localStorage.clear();
});

describe('browser platform persistence', () => {
  it('saves, lists, and reloads a project', async () => {
    const platform = createBrowserPlatform();
    const project = makeProject();
    const json = JSON.stringify(createEnvelope(project));
    const saved = await platform.saveProject({
      root: null,
      projectJson: json,
      files: [],
      thumbnailDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(saved.root).toMatch(/^browser:/);

    const recent = await platform.listRecentProjects();
    expect(recent).toHaveLength(1);
    expect(recent[0].name).toBe(project.name);
    expect(recent[0].thumbnailDataUrl).toBe('data:image/png;base64,AAAA');

    const loaded = await platform.loadProject(saved.root);
    expect(JSON.parse(loaded.projectJson).project.name).toBe(project.name);

    const existing = await platform.checkExistingProject(saved.root);
    expect(existing.exists).toBe(true);
    expect(existing.id).toBe(project.id);
  });

  it('returns an empty recent list initially', async () => {
    const platform = createBrowserPlatform();
    expect(await platform.listRecentProjects()).toEqual([]);
  });

  it('reports a helpful error for a missing project', async () => {
    const platform = createBrowserPlatform();
    await expect(platform.loadProject('browser:missing')).rejects.toThrow(/no longer available/i);
  });

  it('downloads exports through an anchor element', async () => {
    const platform = createBrowserPlatform();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const directory = await platform.chooseExportDirectory();
    expect(directory).toBe('browser:downloads');
    const path = await platform.writeExportFile(directory!, 'test.txt', { text: 'hello' });
    expect(path).toBe('test.txt');
    expect(click).toHaveBeenCalled();
  });

  it('reports Blender as unavailable in the browser', async () => {
    const platform = createBrowserPlatform();
    const info = await platform.discoverBlender('');
    expect(info.found).toBe(false);
    await expect(platform.startRender({} as never, () => undefined)).rejects.toThrow(/desktop build/i);
  });
});
