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
      'Deep indigo paint, a red rising sun on both flanks, gold shoulder pinstripe and a centre racing stripe. The classic kaido-racer silhouette without any badges.',
    finish: { mode: 'tint', color: '#0a1020', strength: 0.96 },
    swatches: ['#0a1020', '#d21f2b', '#e9b64a', '#f4f1e8'],
  },
  {
    id: 'touge-blossom',
    name: 'Touge Blossom',
    description:
      'Plum-black base with magenta petals, teal chevrons along the rocker and a white speed line. Built for tight mountain passes.',
    finish: { mode: 'tint', color: '#140f1a', strength: 0.94 },
    swatches: ['#140f1a', '#c33a86', '#35c3b4', '#ffffff'],
  },
  {
    id: 'midnight-chrome',
    name: 'Midnight Chrome',
    description:
      'Gunmetal finish with cold silver streaks, a red highlight and mirrored door text. Subtle enough for a daily, loud enough for a meet.',
    finish: { mode: 'tint', color: '#1b2028', strength: 0.9 },
    swatches: ['#1b2028', '#c8ced8', '#b3122a', '#ffffff'],
  },
];

export function presetLayers(presetId: string): { finish: Livery['finish']; layers: LiveryLayer[] } | null {
  switch (presetId) {
    case 'kaido-rising':
      return {
        finish: { mode: 'tint', color: '#0a1020', strength: 0.96 },
        layers: [
          ...mirrored('ellipse', {
            name: 'Rising sun',
            color: '#d21f2b',
            u: 0.46,
            v: 0.52,
            w: 0.5,
            h: 0.66,
            opacity: 0.96,
            rotationDeg: 0,
          }),
          ...mirrored('chevron', {
            name: 'Rocker chevrons',
            color: '#f4f1e8',
            u: 0.5,
            v: 0.84,
            w: 0.92,
            h: 0.1,
            opacity: 0.9,
          }),
          ...mirrored('stripe', {
            name: 'Gold shoulder line',
            color: '#e9b64a',
            secondaryColor: '#f6dfa0',
            u: 0.5,
            v: 0.31,
            w: 1.08,
            h: 0.026,
            rotationDeg: -5,
            opacity: 0.95,
          }),
          ...mirrored('text', {
            name: 'Kaido wordmark',
            color: '#f4f1e8',
            u: 0.74,
            v: 0.7,
            w: 0.44,
            h: 0.2,
            opacity: 1,
            text: {
              content: 'KAIDO',
              fontFamily: 'Inter Variable',
              fontWeight: 900,
              sizePx: 210,
              letterSpacingPx: 18,
            },
          }),
          layer('stripe', {
            name: 'Bonnet stripe',
            mapping: 'top',
            color: '#f4f1e8',
            secondaryColor: '#f4f1e8',
            u: 0.5,
            v: 0.5,
            w: 0.98,
            h: 0.1,
            opacity: 0.92,
          }),
          layer('stripe', {
            name: 'Roof accent',
            mapping: 'top',
            color: '#d21f2b',
            secondaryColor: '#d21f2b',
            u: 0.5,
            v: 0.5,
            w: 0.98,
            h: 0.028,
            opacity: 0.9,
          }),
        ],
      };
    case 'touge-blossom':
      return {
        finish: { mode: 'tint', color: '#140f1a', strength: 0.94 },
        layers: [
          ...mirrored('triangle', {
            name: 'Petal',
            color: '#c33a86',
            u: 0.36,
            v: 0.52,
            w: 0.44,
            h: 0.5,
            rotationDeg: 12,
            opacity: 0.92,
          }),
          ...mirrored('ellipse', {
            name: 'Petal core',
            color: '#f7c8e0',
            u: 0.36,
            v: 0.48,
            w: 0.18,
            h: 0.2,
            opacity: 0.85,
          }),
          ...mirrored('chevron', {
            name: 'Teal rocker',
            color: '#35c3b4',
            u: 0.5,
            v: 0.86,
            w: 0.95,
            h: 0.08,
            opacity: 0.95,
          }),
          ...mirrored('stripe', {
            name: 'Speed line',
            color: '#ffffff',
            secondaryColor: '#9fe8df',
            u: 0.42,
            v: 0.36,
            w: 0.9,
            h: 0.018,
            rotationDeg: 8,
            opacity: 0.9,
          }),
          ...mirrored('text', {
            name: 'Touge wordmark',
            color: '#ffffff',
            u: 0.76,
            v: 0.72,
            w: 0.4,
            h: 0.18,
            opacity: 1,
            text: {
              content: 'TOUGE',
              fontFamily: 'Inter Variable',
              fontWeight: 800,
              sizePx: 190,
              letterSpacingPx: 14,
            },
          }),
          layer('chevron', {
            name: 'Bonnet chevrons',
            mapping: 'top',
            color: '#35c3b4',
            u: 0.5,
            v: 0.5,
            w: 0.9,
            h: 0.34,
            opacity: 0.55,
          }),
        ],
      };
    case 'midnight-chrome':
      return {
        finish: { mode: 'tint', color: '#1b2028', strength: 0.9 },
        layers: [
          ...mirrored('stripe', {
            name: 'Silver streak',
            color: '#c8ced8',
            secondaryColor: '#5d6773',
            u: 0.5,
            v: 0.42,
            w: 1.05,
            h: 0.05,
            rotationDeg: -3,
            opacity: 0.95,
          }),
          ...mirrored('stripe', {
            name: 'Red highlight',
            color: '#b3122a',
            secondaryColor: '#7a0c1c',
            u: 0.5,
            v: 0.47,
            w: 1.05,
            h: 0.012,
            rotationDeg: -3,
            opacity: 1,
          }),
          ...mirrored('text', {
            name: 'Door mark',
            color: '#ffffff',
            u: 0.56,
            v: 0.66,
            w: 0.28,
            h: 0.12,
            opacity: 0.9,
            text: {
              content: 'WF-01',
              fontFamily: 'Inter Variable',
              fontWeight: 700,
              sizePx: 150,
              letterSpacingPx: 6,
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
            h: 0.03,
            opacity: 0.9,
          }),
        ],
      };
    default:
      return null;
  }
}
