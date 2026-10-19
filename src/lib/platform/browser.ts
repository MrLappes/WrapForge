import type {
  ImportedFile,
  Platform,
  RenderRequest,
  SaveProjectInput,
  SaveProjectResult,
} from './types';
import { VehicleManifest } from '../project/schema';
import type { RecentProject } from '../project/schema';

const INDEX_KEY = 'wrapforge.browser.index.v1';
const PROJECT_PREFIX = 'wrapforge.browser.project.';
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function projectKey(root: string): string {
  return `${PROJECT_PREFIX}${root}`;
}

function readIndex(): RecentProject[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentProject =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentProject).path === 'string' &&
        typeof (entry as RecentProject).name === 'string',
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: RecentProject[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries.slice(0, 25)));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export function createBrowserPlatform(): Platform {
  return {
    kind: 'browser',

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

    async resolveModelUrl(_root, modelPath) {
      if (modelPath.startsWith('bundled:')) {
        return `${import.meta.env.BASE_URL}sample-vehicle/model/vehicle.glb`;
      }
      return modelPath;
    },

    async importArtwork() {
      const file = await pickFileInBrowser();
      if (!file) return null;
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(
          `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB; imports are limited to 25 MB in the browser preview.`,
        );
      }
      const dataUrl = await fileToDataUrl(file);
      const result: ImportedFile = {
        name: file.name,
        mimeType: file.type || guessMimeType(file.name),
        dataUrl,
        byteLength: file.size,
      };
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        result.text = await file.text();
        result.mimeType = 'image/svg+xml';
      }
      return result;
    },

    async importFile(title, extensions) {
      void title;
      const accept = extensions.map((extension) => `.${extension}`).join(',');
      const file = await pickFileInBrowser(accept);
      if (!file) return null;
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(
          `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB; imports are limited to 25 MB in the browser preview.`,
        );
      }
      return {
        name: file.name,
        mimeType: file.type || guessMimeType(file.name),
        dataUrl: await fileToDataUrl(file),
        byteLength: file.size,
      };
    },

    async importFiles(title, extensions) {
      void title;
      const accept = extensions.map((extension) => `.${extension}`).join(',');
      const files = await pickFilesInBrowser(accept);
      const results: ImportedFile[] = [];
      for (const file of files) {
        if (file.size > MAX_IMPORT_BYTES) continue;
        results.push({
          name: file.name,
          mimeType: file.type || guessMimeType(file.name),
          dataUrl: await fileToDataUrl(file),
          byteLength: file.size,
        });
      }
      return results;
    },

    async importVehicleModel() {
      const file = await pickFileInBrowser('.glb,.gltf,model/gltf-binary,model/gltf+json');
      if (!file) return null;
      if (file.size > 200 * 1024 * 1024) {
        throw new Error('Vehicle models are limited to 200 MB.');
      }
      const dataUrl = await fileToDataUrl(file);
      return {
        name: file.name,
        mimeType: file.name.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary',
        dataUrl,
        byteLength: file.size,
      };
    },

    async chooseProjectParent() {
      return 'browser:local';
    },

    async chooseProjectFolder() {
      return null;
    },

    async saveProject(input: SaveProjectInput): Promise<SaveProjectResult> {
      const parsed = JSON.parse(input.projectJson) as { project?: { id?: string; name?: string } };
      const project = parsed.project;
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `local-${Date.now()}`;
      const root = input.root && input.root !== 'browser:local'
        ? input.root
        : `browser:${project?.id ?? generated}`;
      try {
        localStorage.setItem(projectKey(root), input.projectJson);
      } catch (error) {
        throw new Error(
          'The browser preview could not save this project. Browser storage is limited; the desktop build writes real project folders.',
          { cause: error },
        );
      }
      const now = new Date().toISOString();
      const entry: RecentProject = {
        path: root,
        name: project?.name ?? 'Untitled wrap',
        updatedAt: now,
        thumbnailDataUrl: input.thumbnailDataUrl,
      };
      writeIndex([entry, ...readIndex().filter((item) => item.path !== root)]);
      return { root, projectJson: input.projectJson };
    },

    async loadProject(root: string) {
      const raw = localStorage.getItem(projectKey(root));
      if (!raw) {
        throw new Error('This browser project is no longer available in local storage.');
      }
      return { root, projectJson: raw };
    },

    async checkExistingProject(root: string) {
      const raw = localStorage.getItem(projectKey(root));
      if (!raw) return { exists: false };
      try {
        const parsed = JSON.parse(raw) as { project?: { id?: string; name?: string } };
        return { exists: true, id: parsed.project?.id, name: parsed.project?.name };
      } catch {
        return { exists: true };
      }
    },

    async listRecentProjects() {
      const entries = readIndex();
      const existing = entries.filter((entry) => localStorage.getItem(projectKey(entry.path)));
      if (existing.length !== entries.length) writeIndex(existing);
      return existing;
    },

    async saveExport(defaultName, data) {
      let blob: Blob;
      if (data.base64) {
        blob = base64ToBlob(data.base64);
      } else if (data.text !== undefined) {
        blob = new Blob([data.text], { type: 'text/plain;charset=utf-8' });
      } else {
        throw new Error('Nothing to export.');
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = defaultName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return defaultName;
    },

    async chooseExportDirectory() {
      return 'browser:downloads';
    },

    async writeExportFile(directory, fileName, data) {
      const path = await this.saveExport(fileName, data);
      void directory;
      return path ?? fileName;
    },

    async discoverBlender() {
      return {
        found: false,
        executable: null,
        displayName: null,
        via: 'none',
        version: null,
        compatibility: 'unknown',
        message:
          'Blender detection requires the desktop build. The browser preview uses the interactive viewport only.',
        checkedAt: new Date().toISOString(),
      };
    },

    async probeBlender() {
      return {
        available: false,
        message: 'Blender probing requires the desktop build.',
      };
    },

    async startRender(_input: RenderRequest) {
      throw new Error(
        'Blender rendering is available in the desktop build only. Use "Capture viewport" for a browser preview.',
      );
    },

    async cancelRender() {
      return undefined;
    },

    async readImageDataUrl() {
      throw new Error('Reading render outputs requires the desktop build.');
    },

    async openPath() {
      return undefined;
    },

    async readTextAsset() {
      throw new Error('Filesystem access requires the desktop build.');
    },

    async readBinaryAsset() {
      throw new Error('Filesystem access requires the desktop build.');
    },
  };
}

function pickFileInBrowser(
  accept = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp',
): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (!settled && input.files?.length) finish(input.files[0]);
    }, 60_000);
  });
}

function pickFilesInBrowser(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (!settled && input.files?.length) finish(Array.from(input.files));
    }, 60_000);
  });
}

function guessMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function base64ToBlob(base64: string): Blob {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes]);
}
