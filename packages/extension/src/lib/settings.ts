import type { Settings } from '../types.js';

const DEFAULT_SETTINGS: Settings = {
  showRating: true,
  showDelta: true,
  debugForceDomPredict: false,
};

const STORAGE_KEY = 'crp_settings';

function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

export async function getSettings(): Promise<Settings> {
  if (!isChromeStorageAvailable()) {
    return { ...DEFAULT_SETTINGS };
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY] as Partial<Settings> | undefined;
      resolve({
        showRating: stored?.showRating ?? DEFAULT_SETTINGS.showRating,
        showDelta: stored?.showDelta ?? DEFAULT_SETTINGS.showDelta,
        debugForceDomPredict:
          stored?.debugForceDomPredict ?? DEFAULT_SETTINGS.debugForceDomPredict,
      });
    });
  });
}

export async function setSettings(settings: Partial<Settings>): Promise<void> {
  if (!isChromeStorageAvailable()) {
    return;
  }
  const current = await getSettings();
  const updated: Settings = { ...current, ...settings };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: updated }, resolve);
  });
}
