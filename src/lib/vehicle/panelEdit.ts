import { NO_PANEL, type PanelDefinition, type PanelMap } from '../project/schema';
import { decodePanelBytes, encodePanelBytes } from './detect';

export interface PanelEditResult {
  panels: PanelDefinition[];
  panelMap: PanelMap | null;
  changed: boolean;
}

function unchanged(panels: PanelDefinition[], panelMap: PanelMap | null): PanelEditResult {
  return { panels, panelMap, changed: false };
}

/**
 * Drops `slot` from the map: its triangles are reassigned to `replacement`
 * (a panel slot, or `NO_PANEL`) and every higher slot shifts down by one.
 */
function reindex(panelMap: PanelMap, slot: number, replacement: number): PanelMap {
  const meshes = panelMap.meshes.map((mesh) => {
    const bytes = decodePanelBytes(mesh.triangles);
    const next = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      const value = bytes[index];
      if (value === slot) next[index] = replacement;
      else if (value !== NO_PANEL && value > slot) next[index] = value - 1;
      else next[index] = value;
    }
    return { objectName: mesh.objectName, triangles: encodePanelBytes(next) };
  });
  return { order: panelMap.order.filter((_, index) => index !== slot), meshes };
}

export function renamePanel(
  panels: PanelDefinition[],
  panelId: string,
  name: string,
): PanelDefinition[] {
  const trimmed = name.trim();
  if (!trimmed) return panels;
  let changed = false;
  const next = panels.map((panel) => {
    if (panel.id !== panelId || panel.name === trimmed) return panel;
    changed = true;
    return { ...panel, name: trimmed, detection: 'manual' as const };
  });
  return changed ? next : panels;
}

/** Moves every triangle of `sourceId` onto `targetId` and drops the source panel. */
export function mergePanels(
  panels: PanelDefinition[],
  panelMap: PanelMap | null,
  sourceId: string,
  targetId: string,
): PanelEditResult {
  if (!panelMap || sourceId === targetId) return unchanged(panels, panelMap);
  const slot = panelMap.order.indexOf(sourceId);
  const targetSlot = panelMap.order.indexOf(targetId);
  if (slot < 0 || targetSlot < 0) return unchanged(panels, panelMap);
  const source = panels.find((panel) => panel.id === sourceId);
  const target = panels.find((panel) => panel.id === targetId);
  if (!source || !target) return unchanged(panels, panelMap);

  const nextPanels = panels
    .filter((panel) => panel.id !== sourceId)
    .map((panel) => {
      if (panel.id !== targetId) return panel;
      const area =
        panel.areaM2 !== undefined && source.areaM2 !== undefined
          ? panel.areaM2 + source.areaM2
          : panel.areaM2;
      return {
        ...panel,
        areaM2: area,
        confidence: undefined,
        detection: 'manual' as const,
      };
    });

  return {
    panels: nextPanels,
    panelMap: reindex(panelMap, slot, targetSlot > slot ? targetSlot - 1 : targetSlot),
    changed: true,
  };
}

/** Removes a panel; its triangles fall back to the unpainted body. */
export function deletePanel(
  panels: PanelDefinition[],
  panelMap: PanelMap | null,
  panelId: string,
): PanelEditResult {
  if (!panelMap || panelMap.order.length <= 1) return unchanged(panels, panelMap);
  const slot = panelMap.order.indexOf(panelId);
  if (slot < 0) return unchanged(panels, panelMap);
  const nextPanels = panels.filter((panel) => panel.id !== panelId);
  if (nextPanels.length === 0) return unchanged(panels, panelMap);
  return { panels: nextPanels, panelMap: reindex(panelMap, slot, NO_PANEL), changed: true };
}
