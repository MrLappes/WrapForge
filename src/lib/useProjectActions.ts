import { useCallback } from 'react';
import { platform, projectRootFor } from './platform';
import { confirmAction } from './platform/dialogs';
import { useProjectStore } from './store/projectStore';
import { useUiStore, type NavView } from './store/uiStore';
import {
  createSampleProject,
  createTextArtwork,
  importArtworkAsset,
  openProject,
  writeProject,
} from './project/service';
import { createLiveryLayer, createPlacement } from './project/defaults';
import type {
  ArtworkAsset,
  Livery,
  LiveryLayer,
  LiveryLayerKind,
  LiveryMapping,
  LiveryStroke,
  Placement,
  ProjectDocument,
} from './project/schema';
import { invalidateArtworkCache } from './graphics/artwork';
import { importVehicleFromFile } from './vehicle/importVehicle';
import { artworkFromDataUrl } from './project/service';
import {
  exportLayerFolder,
  exportLiveryPsd,
  importLiveryPsd,
  parseLayerFileName,
  type ImportedLayer,
} from './livery/exchange';
import type { ImportedFile } from './platform/types';
import { deletePanel, mergePanels, renamePanel } from './vehicle/panelEdit';
import { presetLayers } from './livery/presets';
import { bytesToBase64, clearPendingAssets } from './vehicle/pending';

function notify(
  kind: 'info' | 'success' | 'warning' | 'error',
  title: string,
  detail?: string,
): void {
  useUiStore.getState().notify(kind, title, detail);
}

export interface SaveOptions {
  saveAs?: boolean;
  thumbnailDataUrl?: string;
  silent?: boolean;
}

export function useProjectActions() {
  const newProject = useCallback(async (name: string): Promise<boolean> => {
    const ui = useUiStore.getState();
    ui.setBusy(true);
    ui.setStatus('Creating project…');
    try {
      const project = await createSampleProject(platform, name.trim() || 'Untitled wrap');
      clearPendingAssets();
      useProjectStore.getState().load(project, null);
      ui.selectPanel(null);
      ui.selectPlacement(null);
      ui.setView('vehicle');
      ui.setAutosave('idle', 'Save the project to enable autosave');
      ui.setStatus('New project ready');
      ui.notify('success', 'Project created', 'Sample vehicle loaded with 13 wrap panels.');
      return true;
    } catch (error) {
      ui.notify('error', 'Could not create the project', errorMessage(error));
      ui.setStatus('Project creation failed');
      return false;
    } finally {
      ui.setBusy(false);
    }
  }, []);

  const saveProject = useCallback(async (options: SaveOptions = {}): Promise<boolean> => {
    const store = useProjectStore.getState();
    const ui = useUiStore.getState();
    const current = store.project;
    if (!current) return false;
    const snapshot = JSON.stringify(current);
    let targetRoot = options.saveAs ? null : store.root;

    if (!targetRoot && platform.kind === 'desktop') {
      const parent = await platform.chooseProjectParent(current.name);
      if (!parent) return false;
      targetRoot = projectRootFor(parent, current.name);
      const existing = await platform.checkExistingProject(targetRoot);
      if (existing.exists && existing.id !== current.id) {
        const confirmed = await confirmAction(
          'Replace existing project?',
          `"${targetRoot}" already contains the project "${existing.name ?? 'Unknown'}". Replace it with "${current.name}"? The previous project.json will be replaced.`,
          'Replace',
        );
        if (!confirmed) return false;
      }
    }

    ui.setBusy(true);
    ui.setStatus('Saving project…');
    ui.setAutosave('saving');
    try {
      const result = await writeProject(platform, current, targetRoot, {
        thumbnailDataUrl: options.thumbnailDataUrl,
      });
      const unchanged = useProjectStore
        .getState()
        .markSavedIfUnchanged(snapshot, result.project, result.root);
      ui.setAutosave('saved');
      ui.bumpRecentVersion();
      if (unchanged) {
        if (!options.silent) {
          ui.notify('success', 'Project saved', result.root);
        }
      } else {
        ui.notify(
          'warning',
          'Saved an earlier revision',
          'You changed the project while it was saving. The newest edits are still unsaved.',
        );
      }
      ui.setStatus(unchanged ? 'Saved' : 'Newer changes are unsaved');
      return true;
    } catch (error) {
      ui.setAutosave('error', errorMessage(error));
      ui.notify('error', 'Save failed', errorMessage(error));
      ui.setStatus('Save failed');
      return false;
    } finally {
      ui.setBusy(false);
    }
  }, []);

  const saveProjectAs = useCallback(
    (thumbnailDataUrl?: string) => saveProject({ saveAs: true, thumbnailDataUrl }),
    [saveProject],
  );

  const open = useCallback(async (root: string): Promise<boolean> => {
    const ui = useUiStore.getState();
    ui.setBusy(true);
    ui.setStatus('Opening project…');
    try {
      const result = await openProject(platform, root);
      clearPendingAssets();
      useProjectStore.getState().load(result.project, result.root);
      invalidateArtworkCache();
      ui.selectPanel(null);
      ui.selectPlacement(null);
      ui.setView(result.project.placements.length > 0 ? 'studio' : 'vehicle');
      ui.setAutosave('idle');
      ui.setStatus('Project opened');
      ui.bumpRecentVersion();
      if (result.warnings.length > 0) {
        ui.notify('warning', 'Project opened with warnings', result.warnings.join('\n'));
      } else if (result.migration.applied.length > 0) {
        ui.notify('info', 'Project migrated', result.migration.applied.join('\n'));
      } else {
        ui.notify('success', 'Project opened', result.project.name);
      }
      return true;
    } catch (error) {
      ui.notify('error', 'Could not open the project', errorMessage(error));
      ui.setStatus('Open failed');
      return false;
    } finally {
      ui.setBusy(false);
    }
  }, []);

  const openProjectPicker = useCallback(async (): Promise<boolean> => {
    if (platform.kind !== 'desktop') {
      notify(
        'info',
        'Choose from recent projects',
        'The browser preview stores projects in local browser storage. Open one from the recent list.',
      );
      return false;
    }
    const folder = await platform.chooseProjectFolder();
    if (!folder) return false;
    return open(folder);
  }, [open]);

  const closeProject = useCallback(async (): Promise<boolean> => {
    const store = useProjectStore.getState();
    const ui = useUiStore.getState();
    if (!store.project) return true;
    if (store.dirty) {
      const confirmed = await confirmAction(
        'Close without saving?',
        `"${store.project.name}" has unsaved changes. Closing now will discard them.`,
        'Discard and close',
      );
      if (!confirmed) return false;
    }
    store.close();
    clearPendingAssets();
    ui.selectPanel(null);
    ui.selectPlacement(null);
    ui.setView('home');
    ui.setStatus('Project closed');
    ui.setAutosave('idle');
    return true;
  }, []);

  const goTo = useCallback((view: NavView) => {
    useUiStore.getState().setView(view);
  }, []);

  const importArtwork = useCallback(async (): Promise<ArtworkAsset | null> => {
    const ui = useUiStore.getState();
    const store = useProjectStore.getState();
    if (!store.project) return null;
    ui.setBusy(true);
    ui.setStatus('Importing artwork…');
    try {
      const artwork = await importArtworkAsset(platform, store.root);
      if (!artwork) {
        ui.setStatus('Import cancelled');
        return null;
      }
      invalidateArtworkCache(artwork.id);
      useProjectStore.getState().update((draft) => {
        draft.artwork.push(artwork);
      }, 'Import artwork');
      ui.notify('success', 'Artwork imported', `${artwork.name} (${artwork.kind.toUpperCase()})`);
      ui.setStatus('Artwork imported');
      return artwork;
    } catch (error) {
      ui.notify('error', 'Artwork import failed', errorMessage(error));
      ui.setStatus('Import failed');
      return null;
    } finally {
      ui.setBusy(false);
    }
  }, []);

  const addText = useCallback(
    (content: string, options?: Parameters<typeof createTextArtwork>[1]): ArtworkAsset | null => {
      const store = useProjectStore.getState();
      if (!store.project) return null;
      if (!content.trim()) {
        notify('warning', 'Text is empty', 'Enter text before creating the object.');
        return null;
      }
      const artwork = createTextArtwork(content, options);
      useProjectStore.getState().update((draft) => {
        draft.artwork.push(artwork);
      }, 'Add text object');
      notify('success', 'Text object created', artwork.name);
      return artwork;
    },
    [],
  );

  const deleteArtwork = useCallback(async (artworkId: string): Promise<boolean> => {
    const store = useProjectStore.getState();
    if (!store.project) return false;
    const artwork = store.project.artwork.find((item) => item.id === artworkId);
    if (!artwork) return false;
    const usage = store.project.placements.filter((item) => item.artworkId === artworkId);
    if (usage.length > 0) {
      const confirmed = await confirmAction(
        'Delete artwork?',
        `"${artwork.name}" is used in ${usage.length} placement(s). Deleting it also removes those placements.`,
        'Delete artwork',
      );
      if (!confirmed) return false;
    }
    useProjectStore.getState().update((draft) => {
      draft.artwork = draft.artwork.filter((item) => item.id !== artworkId);
      draft.placements = draft.placements.filter((item) => item.artworkId !== artworkId);
    }, 'Delete artwork');
    invalidateArtworkCache(artworkId);
    const ui = useUiStore.getState();
    if (ui.selectedPlacementId && usage.some((item) => item.id === ui.selectedPlacementId)) {
      ui.selectPlacement(null);
    }
    return true;
  }, []);

  const placeArtwork = useCallback((artworkId: string, panelId: string | null): Placement | null => {
    const store = useProjectStore.getState();
    const ui = useUiStore.getState();
    if (!store.project) return null;
    const artwork = store.project.artwork.find((item) => item.id === artworkId);
    if (!artwork) return null;
    const targetPanelId =
      panelId ?? ui.selectedPanelId ?? store.project.vehicle.panels.find((panel) => panel.wrapable)?.id;
    const panel = store.project.vehicle.panels.find((item) => item.id === targetPanelId);
    if (!panel) {
      ui.notify('warning', 'Select a panel first', 'Choose a wrap-able panel in the vehicle or panel list.');
      return null;
    }
    if (!panel.wrapable) {
      ui.notify(
        'warning',
        'Panel cannot be wrapped',
        `${panel.name} is marked as a non-wrap surface.`,
      );
      return null;
    }
    const existing = store.project.placements.find(
      (item) => item.artworkId === artworkId && item.panelId === panel.id,
    );
    if (existing) {
      ui.selectPlacement(existing.id);
      ui.selectPanel(panel.id);
      ui.setView('studio');
      return existing;
    }
    const placement = createPlacement(artwork, panel);
    useProjectStore.getState().update((draft) => {
      draft.placements.push(placement);
    }, 'Place artwork');
    ui.selectPlacement(placement.id);
    ui.selectPanel(panel.id);
    ui.setView('studio');
    ui.notify('success', 'Artwork placed', `${artwork.name} → ${panel.name}`);
    return placement;
  }, []);

  const updatePlacement = useCallback(
    (placementId: string, patch: Partial<Placement>, label = 'Adjust artwork') => {
      useProjectStore.getState().update((draft) => {
        const placement = draft.placements.find((item) => item.id === placementId);
        if (placement) Object.assign(placement, patch);
      }, label);
    },
    [],
  );

  const deletePlacement = useCallback((placementId: string) => {
    useProjectStore.getState().update((draft) => {
      draft.placements = draft.placements.filter((item) => item.id !== placementId);
    }, 'Delete placement');
    const ui = useUiStore.getState();
    if (ui.selectedPlacementId === placementId) ui.selectPlacement(null);
  }, []);

  const setPaintColor = useCallback((color: string) => {
    useProjectStore.getState().update((draft) => {
      draft.vehicle.paintColor = color;
    }, 'Change paint colour');
  }, []);

  const updateProject = useCallback(
    (mutator: (draft: ProjectDocument) => void, label: string) => {
      useProjectStore.getState().update(mutator, label);
    },
    [],
  );

  const renameProject = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    useProjectStore.getState().update((draft) => {
      draft.name = trimmed;
    }, 'Rename project');
  }, []);

  const importVehicleModel = useCallback(async (): Promise<boolean> => {
    const ui = useUiStore.getState();
    if (!useProjectStore.getState().project) return false;
    try {
      const file = await platform.importVehicleModel();
      if (!file) return false;
      ui.setBusy(true);
      ui.setStatus('Analysing vehicle geometry…');
      const result = await importVehicleFromFile(file);
      useProjectStore.getState().update((draft) => {
        draft.vehicle = result.vehicle;
        draft.placements = [];
      }, 'Import vehicle model');
      ui.selectPanel(result.vehicle.panels[0]?.id ?? null);
      ui.selectPlacement(null);
      ui.setView('studio');
      ui.setStatus(`Imported ${result.vehicle.displayName}`);
      const summary = `${result.vehicle.panels.length} panels detected on ${result.triangleCount.toLocaleString()} triangles (${Math.round(result.coverage * 100)}% classified).`;
      if (result.warnings.length > 0) {
        ui.notify('warning', 'Model imported with notes', [summary, ...result.warnings].join(' · '));
      } else {
        ui.notify('success', 'Model imported', summary);
      }
      return true;
    } catch (error) {
      ui.notify('error', 'Could not import the model', errorMessage(error));
      ui.setStatus('Model import failed');
      return false;
    } finally {
      ui.setBusy(false);
    }
  }, []);

  const renameVehiclePanel = useCallback(
    (panelId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateProject((draft) => {
        draft.vehicle.panels = renamePanel(draft.vehicle.panels, panelId, trimmed);
      }, 'Rename panel');
    },
    [updateProject],
  );

  const mergeVehiclePanels = useCallback(
    (sourceId: string, targetId: string) => {
      updateProject((draft) => {
        const result = mergePanels(
          draft.vehicle.panels,
          draft.vehicle.panelMap ?? null,
          sourceId,
          targetId,
        );
        if (!result.changed) return;
        draft.vehicle.panels = result.panels;
        if (result.panelMap) draft.vehicle.panelMap = result.panelMap;
        else delete draft.vehicle.panelMap;
      }, 'Merge panels');
    },
    [updateProject],
  );

  const deleteVehiclePanel = useCallback(
    (panelId: string) => {
      updateProject((draft) => {
        const result = deletePanel(
          draft.vehicle.panels,
          draft.vehicle.panelMap ?? null,
          panelId,
        );
        if (!result.changed) return;
        draft.vehicle.panels = result.panels;
        if (result.panelMap) draft.vehicle.panelMap = result.panelMap;
        else delete draft.vehicle.panelMap;
      }, 'Remove panel');
    },
    [updateProject],
  );

  const importLayers = useCallback(async (layers: ImportedLayer[], label: string) => {
    const artworks = [] as ArtworkAsset[];
    for (const layer of layers) {
      artworks.push(await artworkFromDataUrl(layer.name, layer.dataUrl));
    }
    useProjectStore.getState().update((draft) => {
      draft.artwork.push(...artworks);
      draft.vehicle.livery.enabled = true;
      layers.forEach((imported, index) => {
        const artworkId = artworks[index].id;
        const existing = imported.id
          ? draft.vehicle.livery.layers.find((layer) => layer.id === imported.id)
          : undefined;
        /*
         * Imported pixels are already baked in the layer's own space, so the
         * box is the whole canvas centred on it: applying the old transform
         * again would shrink and offset the artwork.
         */
        const box = { u: 0.5, v: 0.5, w: 1, h: 1 };
        if (existing) {
          existing.kind = 'image';
          existing.mapping = imported.mapping;
          existing.blend = imported.blend;
          existing.opacity = imported.opacity;
          existing.visible = imported.visible;
          existing.imageArtworkId = artworkId;
          existing.name = imported.name;
          Object.assign(existing, box);
        } else {
          draft.vehicle.livery.layers.push(
            createLiveryLayer('image', {
              name: imported.name,
              mapping: imported.mapping,
              blend: imported.blend,
              opacity: imported.opacity,
              visible: imported.visible,
              imageArtworkId: artworkId,
              ...box,
            }),
          );
        }
      });
    }, label);
    return true;
  }, []);

  const exportLiveryPsdFile = useCallback(async (images: Map<string, HTMLImageElement>) => {
    const project = useProjectStore.getState().project;
    if (!project) return false;
    const bytes = exportLiveryPsd(project.vehicle.livery, images);
    const base64 = bytesToBase64(bytes);
    const written = await platform.saveExport(
      `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-livery.psd`,
      { base64 },
    );
    if (written) {
      notify('success', 'PSD exported', 'Edit the layers in Photoshop, then import the PSD back.');
    }
    return Boolean(written);
  }, []);

  const importLiveryPsdFile = useCallback(async (file: ImportedFile) => {
    const binary = atob(file.dataUrl.slice(file.dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    let layers: ImportedLayer[];
    try {
      layers = importLiveryPsd(bytes.buffer as ArrayBuffer);
    } catch (error) {
      notify('error', 'Could not read the PSD', errorMessage(error));
      return false;
    }
    if (layers.length === 0) {
      notify('warning', 'No layers found', 'The PSD contained no editable pixel layers.');
      return false;
    }
    await importLayers(layers, 'Import PSD layers');
    notify(
      'success',
      'PSD imported',
      `${layers.length} layer${layers.length === 1 ? '' : 's'} applied to the vehicle.`,
    );
    return true;
  }, [importLayers]);

  const exportLayerFiles = useCallback(
    async (images: Map<string, HTMLImageElement>) => {
      const project = useProjectStore.getState().project;
      if (!project) return false;
      const root = useProjectStore.getState().root;
      const { files, manifest } = exportLayerFolder(project.vehicle.livery, images);
      const directory = root ? `${root}/livery-layers` : 'browser:downloads';
      for (const file of files) {
        await platform.writeExportFile(directory, file.name, { base64: file.base64 });
      }
      await platform.writeExportFile(directory, 'layers.json', { text: manifest });
      notify(
        'success',
        'Layer folder exported',
        root
          ? `Written to ${directory}. Edit the PNGs, then use Sync layers.`
          : 'Downloaded as PNG files with a layers.json manifest.',
      );
      return true;
    },
    [],
  );

  const importLayerFiles = useCallback(async (files: ImportedFile[]) => {
    const root = useProjectStore.getState().root;
    const directory = root ? `${root}/livery-layers` : null;
    const layers: ImportedLayer[] = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.png')) continue;
      const parsed = parseLayerFileName(file.name);
      if (!parsed) continue;
      layers.push({ ...parsed, dataUrl: file.dataUrl });
    }
    if (layers.length === 0) {
      notify('warning', 'Nothing to sync', 'Pick the layer PNGs exported by WrapForge.');
      return false;
    }
    if (directory) {
      try {
        await platform.writeExportFile(directory, 'layers.last-sync.json', {
          text: JSON.stringify({ syncedAt: new Date().toISOString(), layers: layers.length }),
        });
      } catch {
        // Sync still applies even when the marker file cannot be written.
      }
    }
    return importLayers(layers, 'Sync layers from PNGs');
  }, [importLayers]);

  const updateLivery = useCallback((mutator: (livery: Livery) => void, label: string) => {
    useProjectStore.getState().update((draft) => {
      mutator(draft.vehicle.livery);
    }, label);
  }, []);

  const addLiveryLayer = useCallback(
    (kind: LiveryLayerKind, mapping: LiveryMapping = 'side-left'): LiveryLayer => {
      const layer = createLiveryLayer(kind, { mapping });
      updateLivery((livery) => {
        livery.enabled = true;
        livery.layers.push(layer);
      }, `Add ${kind} layer`);
      return layer;
    },
    [updateLivery],
  );

  const updateLiveryLayer = useCallback(
    (layerId: string, patch: Partial<LiveryLayer>, label = 'Adjust livery layer') => {
      updateLivery((livery) => {
        const layer = livery.layers.find((item) => item.id === layerId);
        if (layer) Object.assign(layer, patch);
      }, label);
    },
    [updateLivery],
  );

  const deleteLiveryLayer = useCallback(
    (layerId: string) => {
      updateLivery((livery) => {
        livery.layers = livery.layers.filter((item) => item.id !== layerId);
      }, 'Delete livery layer');
    },
    [updateLivery],
  );

  const commitStroke = useCallback(
    (stroke: LiveryStroke) => {
      updateLivery((livery) => {
        livery.strokes.push(stroke);
      }, 'Paint stroke');
    },
    [updateLivery],
  );

  const clearPainting = useCallback(() => {
    updateLivery((livery) => {
      livery.strokes = [];
    }, 'Clear brushwork');
  }, [updateLivery]);

  const applyLiveryPreset = useCallback(
    (presetId: string) => {
      const preset = presetLayers(presetId);
      if (!preset) return;
      updateLivery((livery) => {
        livery.enabled = true;
        livery.finish = preset.finish;
        livery.layers = preset.layers;
      }, 'Apply livery preset');
      useUiStore.getState().notify('success', 'Livery applied', 'The preset replaced the existing shape layers.');
    },
    [updateLivery],
  );

  return {
    newProject,
    saveProject,
    saveProjectAs,
    open,
    openProjectPicker,
    closeProject,
    goTo,
    importArtwork,
    addText,
    deleteArtwork,
    placeArtwork,
    updatePlacement,
    deletePlacement,
    setPaintColor,
    updateProject,
    importVehicleModel,
    exportLiveryPsdFile,
    importLiveryPsdFile,
    exportLayerFiles,
    importLayerFiles,
    renameVehiclePanel,
    mergeVehiclePanels,
    deleteVehiclePanel,
    updateLivery,
    addLiveryLayer,
    updateLiveryLayer,
    deleteLiveryLayer,
    commitStroke,
    clearPainting,
    applyLiveryPreset,
    renameProject,
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
