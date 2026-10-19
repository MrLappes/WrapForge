import type { Livery, LiveryLayer, LiveryLayerKind, LiveryMapping } from '../project/schema';
import { createLiveryLayer } from '../project/defaults';

export interface LiveryPreset {
  id: string;
  name: string;
  description: string;
  finish: Livery['finish'];
  /** Miniature swatches for the picker. */
  swatches: string[];
}

type PartialLayer = Partial<LiveryLayer> & { mapping: LiveryMapping };

function layer(kind: LiveryLayerKind, overrides: PartialLayer): LiveryLayer {
  return createLiveryLayer(kind, overrides);
}

function mirrored(
  kind: LiveryLayerKind,
  overrides: Omit<PartialLayer, 'mapping'>,
): LiveryLayer[] {
  return [
    layer(kind, { ...overrides, mapping: 'side-left' }),
    layer(kind, { ...overrides, mapping: 'side-right' }),
  ];
}

/**
 * Original designs inspired by Japanese street and circuit tuning culture.
 * They contain no brand marks or manufacturer logos, so a project using them
 * can be shared freely.
 */
export const LIVERY_PRESETS: LiveryPreset[] = [
  {
    id: 'kaido-rising',
    name: 'Kaido Rising',
    description:
      'Indigo paint with a red rising sun over the rear quarter, one gold shoulder pinstripe, a dark rocker skirt and a centre stripe over the roof. Quiet panel breaks, no badges.',
    finish: { mode: 'tint', color: '#141d33', strength: 0.92 },
    swatches: ['#141d33', '#d21f2b', '#e9b64a', '#f4f1e8'],
  },
  {
    id: 'touge-blossom',
    name: 'Touge Blossom',
    description:
      'Plum-black base with two drifting petals on each flank, a teal rocker, a white speed line and twin bonnet lines. Built for tight mountain passes.',
    finish: { mode: 'tint', color: '#1d1526', strength: 0.9 },
    swatches: ['#1d1526', '#c33a86', '#35c3b4', '#ffffff'],
  },
  {
    id: 'midnight-chrome',
    name: 'Midnight Chrome',
    description:
      'Gunmetal finish with a single silver blade, a red hairline under it and a small door mark. Subtle enough for a daily, loud enough for a meet.',
    finish: { mode: 'tint', color: '#242a33', strength: 0.86 },
    swatches: ['#242a33', '#c8ced8', '#b3122a', '#ffffff'],
  },
];

export function presetLayers(presetId: string): { finish: Livery['finish']; layers: LiveryLayer[] } | null {
  switch (presetId) {
    case 'kaido-rising':
      return {
        finish: { mode: 'tint', color: '#141d33', strength: 0.92 },
        layers: [
          ...mirrored('ellipse', {
            name: 'Rising sun',
            color: '#d21f2b',
            u: 0.3,
            v: 0.55,
            w: 0.22,
            h: 0.3,
            opacity: 0.96,
          }),
          ...mirrored('stripe', {
            name: 'Gold shoulder line',
            color: '#e9b64a',
            secondaryColor: '#f6dfa0',
            u: 0.5,
            v: 0.33,
            w: 1.02,
            h: 0.014,
            rotationDeg: -4,
            opacity: 0.95,
          }),
          ...mirrored('rect', {
            name: 'Rocker skirt',
            color: '#05070d',
            u: 0.5,
            v: 0.88,
            w: 0.94,
            h: 0.06,
            opacity: 0.9,
          }),
          ...mirrored('text', {
            name: 'Kaido wordmark',
            color: '#f4f1e8',
            u: 0.7,
            v: 0.63,
            w: 0.16,
            h: 0.07,
            opacity: 0.95,
            text: {
              content: 'KAIDO',
              fontFamily: 'Inter Variable',
              fontWeight: 800,
              sizePx: 150,
              letterSpacingPx: 10,
            },
          }),
          layer('stripe', {
            name: 'Centre stripe',
            mapping: 'top',
            color: '#f4f1e8',
            secondaryColor: '#f4f1e8',
            u: 0.5,
            v: 0.5,
            w: 0.965,
            h: 0.045,
            opacity: 0.9,
          }),
        ],
      };
    case 'touge-blossom':
      return {
        finish: { mode: 'tint', color: '#1d1526', strength: 0.9 },
        layers: [
          ...mirrored('triangle', {
            name: 'Petal',
            color: '#c33a86',
            u: 0.62,
            v: 0.42,
            w: 0.2,
            h: 0.24,
            rotationDeg: 18,
            opacity: 0.9,
          }),
          ...mirrored('triangle', {
            name: 'Petal drift',
            color: '#8f2760',
            u: 0.48,
            v: 0.54,
            w: 0.16,
            h: 0.2,
            rotationDeg: -12,
            opacity: 0.8,
          }),
          ...mirrored('ellipse', {
            name: 'Petal core',
            color: '#f7c8e0',
            u: 0.62,
            v: 0.42,
            w: 0.07,
            h: 0.08,
            opacity: 0.85,
          }),
          ...mirrored('rect', {
            name: 'Teal rocker',
            color: '#35c3b4',
            u: 0.5,
            v: 0.9,
            w: 0.9,
            h: 0.045,
            opacity: 0.95,
          }),
          ...mirrored('stripe', {
            name: 'Speed line',
            color: '#ffffff',
            secondaryColor: '#9fe8df',
            u: 0.42,
            v: 0.3,
            w: 0.95,
            h: 0.012,
            rotationDeg: 6,
            opacity: 0.9,
          }),
          layer('stripe', {
            name: 'Bonnet line left',
            mapping: 'top',
            color: '#35c3b4',
            secondaryColor: '#35c3b4',
            u: 0.5,
            v: 0.42,
            w: 0.8,
            h: 0.05,
            opacity: 0.75,
          }),
          layer('stripe', {
            name: 'Bonnet line right',
            mapping: 'top',
            color: '#35c3b4',
            secondaryColor: '#35c3b4',
            u: 0.5,
            v: 0.58,
            w: 0.8,
            h: 0.05,
            opacity: 0.75,
          }),
        ],
      };
    case 'midnight-chrome':
      return {
        finish: { mode: 'tint', color: '#242a33', strength: 0.86 },
        layers: [
          ...mirrored('stripe', {
            name: 'Silver blade',
            color: '#c8ced8',
            secondaryColor: '#5d6773',
            u: 0.46,
            v: 0.4,
            w: 1,
            h: 0.035,
            rotationDeg: -5,
            opacity: 0.95,
          }),
          ...mirrored('stripe', {
            name: 'Red hairline',
            color: '#b3122a',
            secondaryColor: '#7a0c1c',
            u: 0.46,
            v: 0.45,
            w: 1,
            h: 0.008,
            rotationDeg: -5,
            opacity: 1,
          }),
          ...mirrored('text', {
            name: 'Door mark',
            color: '#ffffff',
            u: 0.58,
            v: 0.66,
            w: 0.12,
            h: 0.05,
            opacity: 0.85,
            text: {
              content: 'WF-01',
              fontFamily: 'Inter Variable',
              fontWeight: 700,
              sizePx: 120,
              letterSpacingPx: 4,
            },
          }),
          layer('stripe', {
            name: 'Roof line',
            mapping: 'top',
            color: '#c8ced8',
            secondaryColor: '#c8ced8',
            u: 0.5,
            v: 0.5,
            w: 0.96,
            h: 0.02,
            opacity: 0.9,
          }),
        ],
      };
    default:
      return null;
  }
}
