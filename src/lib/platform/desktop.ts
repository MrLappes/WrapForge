import type {
  BlenderInfo,
  ImportedFile,
  LoadedProject,
  Platform,
  RenderProgress,
  RenderRequest,
  RenderResult,
  SaveProjectInput,
  SaveProjectResult,
} from './types';
import { VehicleManifest, type RecentProject } from '../project/schema';

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export function createDesktopPlatform(): Platform {
  return {
    kind: 'desktop',

    async loadSampleManifest() {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-vehicle/manifest.json`);
      if (!response.ok) {
        throw new Error(`Sample vehicle manifest could not be loaded (HTTP ${response.status}).`);
      }
      const json: unknown = await response.json();
      return VehicleManifest.parse(json);
    },

    getSampleModelUrl() {
      return `${import.meta.env.BASE_URL}sample-vehicle/model/vehicle.glb`;
    },

    async resolveModelUrl(root, modelPath) {
      if (modelPath.startsWith('bundled:') || !root) {
        return `${import.meta.env.BASE_URL}sample-vehicle/model/vehicle.glb`;
      }
      const base64 = await invokeCommand<string>('read_project_binary_base64', {
        root,
        relativePath: modelPath,
      });
      const blob = base64ToBlob(base64, 'model/gltf-binary');
      return URL.createObjectURL(blob);
    },

    async importArtwork(): Promise<ImportedFile | null> {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Import artwork',
        filters: [
          { name: 'Artwork', extensions: ['svg', 'png', 'jpg', 'jpeg', 'webp'] },
          { name: 'Vector', extensions: ['svg'] },
          { name: 'Raster', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        ],
      });
      if (typeof selected !== 'string') return null;
      const payload = await invokeCommand<{
        name: string;
        mimeType: string;
        base64: string;
        text: string | null;
        byteLength: number;
      }>('import_file', { path: selected });
      if (payload.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(
          `This file is ${(payload.byteLength / 1024 / 1024).toFixed(1)} MB; imports are limited to 50 MB.`,
        );
      }
      return {
        name: payload.name,
        mimeType: payload.mimeType,
        dataUrl: `data:${payload.mimeType};base64,${payload.base64}`,
        text: payload.text ?? undefined,
        byteLength: payload.byteLength,
      };
    },

    async importFile(title: string, extensions: string[]): Promise<ImportedFile | null> {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: false,
        title,
        filters: [{ name: title, extensions }],
      });
      if (typeof selected !== 'string') return null;
      const payload = await invokeCommand<{
        name: string;
        mimeType: string;
        base64: string;
        text: string | null;
        byteLength: number;
      }>('import_file', { path: selected });
      if (payload.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(
          `This file is ${(payload.byteLength / 1024 / 1024).toFixed(1)} MB; imports are limited to 50 MB.`,
        );
      }
      return {
        name: payload.name,
        mimeType: payload.mimeType,
        dataUrl: `data:${payload.mimeType};base64,${payload.base64}`,
        text: payload.text ?? undefined,
        byteLength: payload.byteLength,
      };
    },

    async importFiles(title: string, extensions: string[]): Promise<ImportedFile[]> {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        directory: false,
        title,
        filters: [{ name: title, extensions }],
      });
      if (!selected) return [];
      const paths = Array.isArray(selected) ? selected : [selected];
      const results: ImportedFile[] = [];
      for (const path of paths) {
        const payload = await invokeCommand<{
          name: string;
          mimeType: string;
          base64: string;
          text: string | null;
          byteLength: number;
        }>('import_file', { path });
        if (payload.byteLength > MAX_IMPORT_BYTES) continue;
        results.push({
          name: payload.name,
          mimeType: payload.mimeType,
          dataUrl: `data:${payload.mimeType};base64,${payload.base64}`,
          text: payload.text ?? undefined,
          byteLength: payload.byteLength,
        });
      }
      return results;
    },

    async importVehicleModel(): Promise<ImportedFile | null> {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Import a 3D vehicle model',
        filters: [
          { name: 'glTF binary', extensions: ['glb'] },
          { name: 'glTF', extensions: ['gltf'] },
        ],
      });
      if (typeof selected !== 'string') return null;
      const payload = await invokeCommand<{
        name: string;
        mimeType: string;
        base64: string;
        byteLength: number;
      }>('import_file', { path: selected });
      return {
        name: payload.name,
        mimeType: payload.mimeType,
        dataUrl: `data:${payload.mimeType};base64,${payload.base64}`,
        byteLength: payload.byteLength,
      };
    },

    async chooseProjectParent(defaultName) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: `Choose where to create "${defaultName}"`,
      });
      return typeof selected === 'string' ? selected : null;
    },

    async chooseProjectFolder() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Open a WrapForge project folder',
      });
      return typeof selected === 'string' ? selected : null;
    },

    async saveProject(input: SaveProjectInput): Promise<SaveProjectResult> {
      if (!input.root) {
        throw new Error('A project folder is required before saving.');
      }
      return invokeCommand<SaveProjectResult>('save_project', { request: input });
    },

    async loadProject(root: string): Promise<LoadedProject> {
      return invokeCommand<LoadedProject>('load_project', { root });
    },

    async checkExistingProject(root: string) {
      return invokeCommand<{ exists: boolean; id?: string; name?: string }>(
        'inspect_project_root',
        { root },
      );
    },

    async listRecentProjects(): Promise<RecentProject[]> {
      return invokeCommand<RecentProject[]>('list_recent_projects');
    },

    async saveExport(defaultName, data) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const extension = defaultName.includes('.') ? defaultName.split('.').pop() : undefined;
      const target = await save({
        defaultPath: defaultName,
        title: 'Export',
        filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : undefined,
      });
      if (typeof target !== 'string') return null;
      await invokeCommand('write_absolute_file', { path: target, data });
      return target;
    },

    async chooseExportDirectory() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose an export folder',
      });
      return typeof selected === 'string' ? selected : null;
    },

    async writeExportFile(directory, fileName, data) {
      return invokeCommand<string>('write_export_file', { directory, fileName, data });
    },

    async discoverBlender(configuredPath: string): Promise<BlenderInfo> {
      return invokeCommand<BlenderInfo>('discover_blender', { configuredPath });
    },

    async probeBlender(configuredPath: string) {
      return invokeCommand<Record<string, unknown>>('probe_blender', { configuredPath });
    },

    async startRender(
      input: RenderRequest,
      onProgress: (progress: RenderProgress) => void,
      onJobStarted?: (jobId: string) => void,
    ) {
      const { listen } = await import('@tauri-apps/api/event');
      const jobId = crypto.randomUUID();
      onJobStarted?.(jobId);
      let cleanup = () => {};
      const result = new Promise<RenderResult>((resolve, reject) => {
        const unlisteners: Array<() => void> = [];
        const stop = () => {
          for (const unlisten of unlisteners) unlisten();
          unlisteners.length = 0;
        };
        cleanup = stop;
        const timeout = window.setTimeout(() => {
          stop();
          void invokeCommand('cancel_render', { jobId }).catch(() => undefined);
          reject(new Error('The render did not finish within 30 minutes and was cancelled.'));
        }, 30 * 60 * 1000);

        void listen<RenderProgress & { jobId: string }>('render://progress', (event) => {
          if (event.payload.jobId !== jobId) return;
          onProgress(event.payload);
        }).then((unlisten) => unlisteners.push(unlisten));

        void listen<RenderResult>('render://done', (event) => {
          if (event.payload.jobId !== jobId) return;
          window.clearTimeout(timeout);
          stop();
          resolve(event.payload);
        }).then((unlisten) => unlisteners.push(unlisten));

        void listen<{ jobId: string; message: string; logPath?: string }>('render://failed', (event) => {
          if (event.payload.jobId !== jobId) return;
          window.clearTimeout(timeout);
          stop();
          reject(
            new Error(
              `${event.payload.message}${event.payload.logPath ? `\nLog: ${event.payload.logPath}` : ''}`,
            ),
          );
        }).then((unlisten) => unlisteners.push(unlisten));

        void invokeCommand('start_render', { jobId, request: input }).catch((error: unknown) => {
          window.clearTimeout(timeout);
          stop();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
      try {
        return await result;
      } finally {
        cleanup();
      }
    },

    async cancelRender(jobId: string) {
      await invokeCommand('cancel_render', { jobId });
    },

    async readImageDataUrl(path: string) {
      const base64 = await invokeCommand<string>('read_image_base64', { path });
      return `data:image/png;base64,${base64}`;
    },

    async openPath(path: string) {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(path);
    },

    async readTextAsset(root: string, relativePath: string) {
      return invokeCommand<string>('read_project_text', { root, relativePath });
    },

    async readBinaryAsset(root: string, relativePath: string) {
      return invokeCommand<string>('read_project_binary_base64', { root, relativePath });
    },
  };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
