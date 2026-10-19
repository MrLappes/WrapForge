import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  APP_VERSION,
  isGlassCategory,
  PROJECT_FORMAT,
  ProjectEnvelope,
  type LiveryLayer,
  type ProjectDocument,
} from '../src/lib/project/schema';
import { createDefaultProject, createLiveryLayer } from '../src/lib/project/defaults';
import { deletePanel, mergePanels, renamePanel } from '../src/lib/vehicle/panelEdit';
import { LIVERY_PRESETS, presetLayers } from '../src/lib/livery/presets';

/**
 * WrapForge MCP server.
 *
 * Works directly on `.wrapforge` project folders on disk, so an AI client can
 * read and change a wrap without the GUI running. Everything is file-based and
 * deterministic: no screen scraping, no browser.
 */

const PROJECT_FILE = 'project.json';
// Resolved from this file, not the working directory the client launched us in.
const SAMPLE_MANIFEST = fileURLToPath(
  new URL('../assets/sample-vehicle/manifest.json', import.meta.url),
);

function projectPath(root: string): string {
  return join(resolve(root), PROJECT_FILE);
}

function readProject(root: string): ProjectDocument {
  const path = projectPath(root);
  if (!existsSync(path)) {
    throw new Error(`No project.json in ${resolve(root)}. Create a project first.`);
  }
  const envelope = ProjectEnvelope.parse(JSON.parse(readFileSync(path, 'utf8')));
  return envelope.project;
}

function writeProject(root: string, project: ProjectDocument): void {
  mkdirSync(resolve(root), { recursive: true });
  project.updatedAt = new Date().toISOString();
  const payload = {
    format: PROJECT_FORMAT,
    formatVersion: 1,
    appVersion: APP_VERSION,
    savedAt: project.updatedAt,
    project,
  };
  writeFileSync(projectPath(root), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function summary(project: ProjectDocument) {
  const livery = project.vehicle.livery;
  return {
    id: project.id,
    name: project.name,
    vehicle: {
      displayName: project.vehicle.displayName,
      assetId: project.vehicle.assetId,
      dimensionsMm: project.vehicle.dimensionsMm,
      panels: project.vehicle.panels.map((panel) => ({
        id: panel.id,
        name: panel.name,
        category: panel.category,
        side: panel.side,
        areaM2: panel.areaM2 ?? null,
        glass: isGlassCategory(panel.category),
      })),
    },
    livery: {
      enabled: livery.enabled,
      resolution: livery.resolution,
      wrapGlass: livery.wrapGlass,
      finish: livery.finish,
      layers: livery.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        mapping: layer.mapping,
        blend: layer.blend,
        opacity: layer.opacity,
        visible: layer.visible,
      })),
      strokes: livery.strokes.length,
    },
    artwork: project.artwork.map((item) => ({ id: item.id, name: item.name, kind: item.kind })),
  };
}

function findLayer(project: ProjectDocument, id: string): LiveryLayer {
  const layer = project.vehicle.livery.layers.find((item) => item.id === id);
  if (!layer) throw new Error(`No livery layer with id ${id}.`);
  return layer;
}

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const BLEND = z.enum(['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'soft-light']);
const MAPPING = z.enum(['atlas', 'side-left', 'side-right', 'top', 'front', 'rear']);

const server = new McpServer({ name: 'wrapforge', version: '0.1.0' });

server.registerTool(
  'project_create',
  {
    title: 'Create a WrapForge project',
    description:
      'Creates a project folder with the bundled CC0 sample vehicle. Fails if project.json already exists.',
    inputSchema: { root: z.string().describe('Absolute path of the project folder'), name: z.string() },
  },
  async ({ root, name }) => {
    if (existsSync(projectPath(root))) {
      throw new Error('That folder already contains a project.json.');
    }
    const manifest = JSON.parse(readFileSync(SAMPLE_MANIFEST, 'utf8'));
    const project = createDefaultProject(manifest, name);
    writeProject(root, project);
    return json({ created: resolve(root), project: summary(project) });
  },
);

server.registerTool(
  'project_open',
  {
    title: 'Open a WrapForge project',
    description: 'Reads a project folder and returns the vehicle, panels, livery layers and artwork.',
    inputSchema: { root: z.string() },
  },
  async ({ root }) => json(summary(readProject(root))),
);

server.registerTool(
  'project_validate',
  {
    title: 'Validate a project',
    description: 'Parses project.json against the WrapForge schema and reports problems.',
    inputSchema: { root: z.string() },
  },
  async ({ root }) => {
    try {
      return json({ valid: true, project: summary(readProject(root)) });
    } catch (error) {
      return json({ valid: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.registerTool(
  'panels_list',
  {
    title: 'List panels',
    description: 'Lists panels with category, side, area and whether the panel is glass.',
    inputSchema: { root: z.string() },
  },
  async ({ root }) => json(summary(readProject(root)).vehicle.panels),
);

server.registerTool(
  'panel_rename',
  {
    title: 'Rename a panel',
    description: 'Renames a panel. The name is used in chips, print plans and exports.',
    inputSchema: { root: z.string(), panelId: z.string(), name: z.string() },
  },
  async ({ root, panelId, name }) => {
    const project = readProject(root);
    project.vehicle.panels = renamePanel(project.vehicle.panels, panelId, name);
    writeProject(root, project);
    return json({ renamed: panelId, name });
  },
);

server.registerTool(
  'panel_merge',
  {
    title: 'Merge panels',
    description:
      'Moves every triangle of one panel onto another and drops the source. Fixes a bumper split in two or a boot read as hatch.',
    inputSchema: { root: z.string(), sourceId: z.string(), targetId: z.string() },
  },
  async ({ root, sourceId, targetId }) => {
    const project = readProject(root);
    const result = mergePanels(
      project.vehicle.panels,
      project.vehicle.panelMap ?? null,
      sourceId,
      targetId,
    );
    if (!result.changed) {
      throw new Error(
        project.vehicle.panelMap
          ? 'Those panels could not be merged; check both ids exist.'
          : 'This project has no panel map (bundled asset). Merging needs a model imported through the studio.',
      );
    }
    project.vehicle.panels = result.panels;
    if (result.panelMap) project.vehicle.panelMap = result.panelMap;
    writeProject(root, project);
    return json({ merged: sourceId, into: targetId, panels: result.panels.length });
  },
);

server.registerTool(
  'panel_remove',
  {
    title: 'Remove a panel',
    description: 'Drops a panel and returns its triangles to the unpainted body.',
    inputSchema: { root: z.string(), panelId: z.string() },
  },
  async ({ root, panelId }) => {
    const project = readProject(root);
    const result = deletePanel(project.vehicle.panels, project.vehicle.panelMap ?? null, panelId);
    if (!result.changed) throw new Error('That panel could not be removed.');
    project.vehicle.panels = result.panels;
    if (result.panelMap) project.vehicle.panelMap = result.panelMap;
    writeProject(root, project);
    return json({ removed: panelId, panels: result.panels.length });
  },
);

server.registerTool(
  'livery_presets',
  {
    title: 'List livery presets',
    description: 'Lists the built-in Japanese-tuning-inspired presets with their layer counts.',
    inputSchema: {},
  },
  async () =>
    json(
      LIVERY_PRESETS.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        swatches: preset.swatches,
        layers: presetLayers(preset.id)?.layers.length ?? 0,
      })),
    ),
);

server.registerTool(
  'livery_apply_preset',
  {
    title: 'Apply a livery preset',
    description: 'Replaces the livery shape layers with a preset and enables the livery.',
    inputSchema: { root: z.string(), presetId: z.string() },
  },
  async ({ root, presetId }) => {
    const preset = presetLayers(presetId);
    if (!preset) throw new Error(`Unknown preset ${presetId}.`);
    const project = readProject(root);
    project.vehicle.livery.enabled = true;
    project.vehicle.livery.finish = preset.finish;
    project.vehicle.livery.layers = preset.layers;
    writeProject(root, project);
    return json({ applied: presetId, layers: preset.layers.length });
  },
);

server.registerTool(
  'livery_add_layer',
  {
    title: 'Add a livery layer',
    description:
      'Adds a shape layer. mapping: atlas (free texture space) or side-left, side-right, top, front, rear (projected through the model UVs).',
    inputSchema: {
      root: z.string(),
      kind: z.enum(['stripe', 'rect', 'ellipse', 'triangle', 'chevron', 'text', 'image']),
      mapping: MAPPING.default('atlas'),
      name: z.string().optional(),
      color: z.string().optional(),
      u: z.number().min(0).max(1).optional(),
      v: z.number().min(0).max(1).optional(),
      w: z.number().positive().max(4).optional(),
      h: z.number().positive().max(4).optional(),
      rotationDeg: z.number().optional(),
      opacity: z.number().min(0).max(1).optional(),
      blend: BLEND.optional(),
      text: z.string().optional(),
    },
  },
  async ({ root, kind, mapping, name, color, u, v, w, h, rotationDeg, opacity, blend, text }) => {
    const project = readProject(root);
    const layer = createLiveryLayer(kind, {
      ...(mapping ? { mapping } : {}),
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      ...(u !== undefined ? { u } : {}),
      ...(v !== undefined ? { v } : {}),
      ...(w !== undefined ? { w } : {}),
      ...(h !== undefined ? { h } : {}),
      ...(rotationDeg !== undefined ? { rotationDeg } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(blend ? { blend } : {}),
      ...(text ? { text } : {}),
    });
    project.vehicle.livery.enabled = true;
    project.vehicle.livery.layers.push(layer);
    writeProject(root, project);
    return json({ added: layer.id, layer });
  },
);

server.registerTool(
  'livery_update_layer',
  {
    title: 'Update a livery layer',
    description: 'Changes colour, transform, opacity, blend mode, visibility, mapping or text.',
    inputSchema: {
      root: z.string(),
      layerId: z.string(),
      patch: z
        .object({
          name: z.string().optional(),
          color: z.string().optional(),
          mapping: MAPPING.optional(),
          u: z.number().min(0).max(1).optional(),
          v: z.number().min(0).max(1).optional(),
          w: z.number().positive().max(4).optional(),
          h: z.number().positive().max(4).optional(),
          rotationDeg: z.number().optional(),
          opacity: z.number().min(0).max(1).optional(),
          visible: z.boolean().optional(),
          blend: BLEND.optional(),
          text: z.string().optional(),
        })
        .strict(),
    },
  },
  async ({ root, layerId, patch }) => {
    const project = readProject(root);
    Object.assign(findLayer(project, layerId), patch);
    writeProject(root, project);
    return json({ updated: layerId, layer: findLayer(project, layerId) });
  },
);

server.registerTool(
  'livery_delete_layer',
  {
    title: 'Delete a livery layer',
    description: 'Removes one layer from the stack.',
    inputSchema: { root: z.string(), layerId: z.string() },
  },
  async ({ root, layerId }) => {
    const project = readProject(root);
    project.vehicle.livery.layers = project.vehicle.livery.layers.filter(
      (layer) => layer.id !== layerId,
    );
    writeProject(root, project);
    return json({ deleted: layerId, layers: project.vehicle.livery.layers.length });
  },
);

server.registerTool(
  'livery_set_options',
  {
    title: 'Set livery options',
    description:
      'Sets the body finish (original, tint, solid), colour and strength, texture resolution, and whether the foil may cover glass.',
    inputSchema: {
      root: z.string(),
      finishMode: z.enum(['original', 'tint', 'solid']).optional(),
      color: z.string().optional(),
      strength: z.number().min(0).max(1).optional(),
      resolution: z.number().int().min(512).max(4096).optional(),
      wrapGlass: z.boolean().optional(),
      enabled: z.boolean().optional(),
    },
  },
  async ({ root, finishMode, color, strength, resolution, wrapGlass, enabled }) => {
    const project = readProject(root);
    const livery = project.vehicle.livery;
    if (finishMode) livery.finish.mode = finishMode;
    if (color) livery.finish.color = color;
    if (strength !== undefined) livery.finish.strength = strength;
    if (resolution !== undefined) livery.resolution = resolution;
    if (wrapGlass !== undefined) livery.wrapGlass = wrapGlass;
    if (enabled !== undefined) livery.enabled = enabled;
    writeProject(root, project);
    return json({
      finish: livery.finish,
      resolution: livery.resolution,
      wrapGlass: livery.wrapGlass,
      enabled: livery.enabled,
    });
  },
);

server.registerTool(
  'layers_export_manifest',
  {
    title: 'Write a layer exchange manifest',
    description:
      'Writes livery-layers/layers.json describing every layer with its id, mapping, blend and matching PNG file name, so an external editor can round-trip the stack.',
    inputSchema: { root: z.string() },
  },
  async ({ root }) => {
    const project = readProject(root);
    const dir = join(resolve(root), 'livery-layers');
    mkdirSync(dir, { recursive: true });
    const manifest = {
      version: 1,
      resolution: project.vehicle.livery.resolution,
      layers: project.vehicle.livery.layers.map((layer, index) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        mapping: layer.mapping,
        blend: layer.blend,
        opacity: layer.opacity,
        visible: layer.visible,
        file: `${String(index + 1).padStart(2, '0')}-${layer.kind}.png`,
      })),
    };
    writeFileSync(join(dir, 'layers.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return json({ written: join(dir, 'layers.json'), layers: manifest.layers.length });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
