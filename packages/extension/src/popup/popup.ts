import { getSettings, setSettings } from '../lib/settings.js';

async function init(): Promise<void> {
  const settings = await getSettings();

  const showRatingEl = document.getElementById('showRating') as HTMLInputElement;
  const showDeltaEl = document.getElementById('showDelta') as HTMLInputElement;
  const statusEl = document.getElementById('status') as HTMLDivElement;

  showRatingEl.checked = settings.showRating;
  showDeltaEl.checked = settings.showDelta;

  async function save(): Promise<void> {
    await setSettings({
      showRating: showRatingEl.checked,
      showDelta: showDeltaEl.checked,
    });
    statusEl.textContent = 'Saved. Refresh the standings page to apply.';
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2500);
  }

  showRatingEl.addEventListener('change', save);
  showDeltaEl.addEventListener('change', save);
}

init().catch(console.error);
