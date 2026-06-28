import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Codeforces Rating Predictor',
  version: '0.0.0',
  description: 'Injects rating and predicted delta columns into CF standings pages',
  content_scripts: [
    {
      matches: [
        '*://codeforces.com/contest/*/standings*',
        '*://m1.codeforces.com/contest/*/standings*',
        '*://m2.codeforces.com/contest/*/standings*',
        '*://mirror.codeforces.com/contest/*/standings*',
      ],
      js: ['src/content/main.ts'],
      run_at: 'document_idle',
    },
  ],
  host_permissions: [
    '*://codeforces.com/*',
    '*://m1.codeforces.com/*',
    '*://m2.codeforces.com/*',
    '*://mirror.codeforces.com/*',
  ],
  permissions: ['storage'],
  action: {
    default_popup: 'src/popup/popup.html',
  },
});
