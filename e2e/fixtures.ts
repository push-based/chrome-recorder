import { existsSync } from 'node:fs';
import path from 'node:path';

import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

import { PAGE, SITE } from './test-page';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  /** Opens the side panel UI as a tab, then makes `site` the active tab. */
  openPanel: (site: Page) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  // Extensions need a persistent context and full Chromium (not the headless
  // shell), which still runs headless with `channel: 'chromium'`.
  // Playwright reads fixture dependencies from this pattern, so it must exist.
  // oxlint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
      throw new Error(`No extension build in ${EXTENSION_PATH}. Run \`pnpm build\` first.`);
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Optional override for a preinstalled Chromium that Playwright didn't download.
      executablePath: process.env.CHROMIUM_PATH,
      acceptDownloads: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Answers the getDisplayMedia picker with the test page's tab.
        '--auto-select-tab-capture-source-by-title=Recorder test page',
      ],
    });

    await context.route(`${SITE}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: PAGE }),
    );

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

    await use(new URL(worker.url()).host);
  },

  // The real side panel can't be opened from a test (it needs a toolbar
  // click), so this loads the same page in a tab. The panel records the
  // active tab of its window, so activating `site` afterwards makes that the
  // tab it records, just like switching tabs with the panel open.
  openPanel: async ({ context, extensionId }, use) => {
    await use(async (site) => {
      const panel = await context.newPage();

      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await site.bringToFront();

      return panel;
    });
  },
});

export { expect } from '@playwright/test';
