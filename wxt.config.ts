import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // Builds land in dist/<browser>-mv<version>, e.g. dist/chrome-mv3.
  outDir: 'dist',
  manifest: {
    name: 'Chrome Recorder',
    description:
      'Record the current tab with Chrome’s native AV1 recorder, or any screen or window, from a side panel.',
    homepage_url: 'https://github.com/push-based/chrome-recorder',
    // chrome.sidePanel shipped in Chrome 114. The native tab recorder needs
    // Chrome 153; the panel offers only screen recording before that.
    minimum_chrome_version: '114',
    permissions: ['sidePanel', 'debugger', 'downloads'],
    action: {
      default_title: 'Open Chrome Recorder',
    },
  },
});
