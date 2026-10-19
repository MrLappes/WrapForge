import { describe, expect, it } from 'vitest';
import { translate } from './index';

describe('translations', () => {
  it('translates navigation labels into German', () => {
    expect(translate('en', 'nav.home')).toBe('Home');
    expect(translate('de', 'nav.home')).toBe('Start');
    expect(translate('de', 'nav.studio')).toBe('3D-Designstudio');
  });

  it('interpolates values', () => {
    expect(translate('en', 'status.panelCount', { count: 13 })).toBe('13 panels');
    expect(translate('de', 'status.panelCount', { count: 13 })).toBe('13 Panels');
  });

  it('falls back to the English string for a missing German key', () => {
    const value = translate('de', 'unknown.key' as never);
    expect(typeof value).toBe('string');
  });
});
