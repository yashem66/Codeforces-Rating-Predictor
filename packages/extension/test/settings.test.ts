import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSettings, setSettings } from '../src/lib/settings.js';

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSettings (no chrome)', () => {
  it('returns defaults when chrome is not available', async () => {
    const settings = await getSettings();
    expect(settings).toEqual({ showRating: true, showDelta: true, debugForceDomPredict: false });
  });
});

describe('setSettings (no chrome)', () => {
  it('does not throw when chrome is not available', async () => {
    await expect(setSettings({ showRating: false })).resolves.toBeUndefined();
  });
});

describe('getSettings (with chrome stub)', () => {
  it('returns stored settings from chrome.storage', async () => {
    const stored = { showRating: false, showDelta: true, debugForceDomPredict: true };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_key: string, cb: (result: Record<string, unknown>) => void) => {
            cb({ crp_settings: stored });
          }),
          set: vi.fn((_data: unknown, cb: () => void) => cb()),
        },
      },
    });
    const settings = await getSettings();
    expect(settings.showRating).toBe(false);
    expect(settings.showDelta).toBe(true);
    expect(settings.debugForceDomPredict).toBe(true);
  });

  it('merges partial stored settings with defaults', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_key: string, cb: (result: Record<string, unknown>) => void) => {
            cb({ crp_settings: { showRating: false } }); // showDelta missing
          }),
          set: vi.fn((_data: unknown, cb: () => void) => cb()),
        },
      },
    });
    const settings = await getSettings();
    expect(settings.showRating).toBe(false);
    expect(settings.showDelta).toBe(true); // default
    expect(settings.debugForceDomPredict).toBe(false); // default
  });

  it('returns defaults when nothing is stored', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_key: string, cb: (result: Record<string, unknown>) => void) => {
            cb({}); // nothing stored
          }),
          set: vi.fn((_data: unknown, cb: () => void) => cb()),
        },
      },
    });
    const settings = await getSettings();
    expect(settings).toEqual({ showRating: true, showDelta: true, debugForceDomPredict: false });
  });
});

describe('setSettings (with chrome stub)', () => {
  it('saves settings to chrome.storage', async () => {
    const setFn = vi.fn((_data: unknown, cb: () => void) => cb());
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_key: string, cb: (result: Record<string, unknown>) => void) => {
            cb({});
          }),
          set: setFn,
        },
      },
    });
    await setSettings({ showRating: false, showDelta: true });
    expect(setFn).toHaveBeenCalledOnce();
    const callArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect((callArg.crp_settings as { showRating: boolean }).showRating).toBe(false);
  });
});
