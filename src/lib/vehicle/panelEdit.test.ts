import { describe, expect, it } from 'vitest';
import { NO_PANEL, type PanelDefinition, type PanelMap } from '../project/schema';
import { decodePanelBytes, encodePanelBytes } from './detect';
import { deletePanel, mergePanels, renamePanel } from './panelEdit';

function panel(id: string, areaM2 = 1): PanelDefinition {
  return {
    id,
    name: id.toUpperCase(),
    category: 'door',
    side: 'left',
    wrapable: true,
    outwardAxis: '+Z',
    objectName: 'Body',
    dimensionsMm: { width: 100, height: 200 },
    areaM2,
    uv: { hasUv: true },
    confidence: 0.5,
    detection: 'geometry',
  };
}

function mapWith(values: number[]): PanelMap {
  return {
    order: ['a', 'b', 'c'],
    meshes: [{ objectName: 'Body', triangles: encodePanelBytes(Uint8Array.from(values)) }],
  };
}

function bytesOf(map: PanelMap | null): number[] {
  const mesh = map?.meshes[0];
  return mesh ? Array.from(decodePanelBytes(mesh.triangles)) : [];
}

describe('panel editing', () => {
  it('renames a panel and marks it as manually edited', () => {
    const next = renamePanel([panel('hood')], 'hood', '  Carbon bonnet ');
    expect(next[0].name).toBe('Carbon bonnet');
    expect(next[0].detection).toBe('manual');
  });

  it('ignores empty renames', () => {
    const panels = [panel('hood')];
    expect(renamePanel(panels, 'hood', '   ')).toBe(panels);
  });

  it('merges the source panel onto the target and closes the gap', () => {
    const panels = [panel('a', 1), panel('b', 2), panel('c', 3)];
    const result = mergePanels(panels, mapWith([0, 1, 2, NO_PANEL]), 'b', 'c');
    expect(result.changed).toBe(true);
    expect(result.panels.map((item) => item.id)).toEqual(['a', 'c']);
    expect(result.panels[1].areaM2).toBe(5);
    expect(result.panelMap?.order).toEqual(['a', 'c']);
    expect(bytesOf(result.panelMap)).toEqual([0, 1, 1, NO_PANEL]);
  });

  it('removes a panel without touching the other assignments', () => {
    const result = deletePanel(
      [panel('a'), panel('b'), panel('c')],
      mapWith([0, 1, 2, NO_PANEL]),
      'a',
    );
    expect(result.changed).toBe(true);
    expect(result.panelMap?.order).toEqual(['b', 'c']);
    expect(bytesOf(result.panelMap)).toEqual([NO_PANEL, 0, 1, NO_PANEL]);
  });

  it('refuses to remove the last surviving panel', () => {
    const panels = [panel('a')];
    const map: PanelMap = { order: ['a'], meshes: mapWith([0]).meshes };
    const result = deletePanel(panels, map, 'a');
    expect(result.changed).toBe(false);
    expect(result.panels).toBe(panels);
  });

  it('leaves projects without a panel map untouched', () => {
    const panels = [panel('a'), panel('b')];
    expect(mergePanels(panels, null, 'a', 'b').changed).toBe(false);
    expect(deletePanel(panels, null, 'a').changed).toBe(false);
  });
});
