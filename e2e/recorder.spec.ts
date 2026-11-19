import { expect, test } from './fixtures';
import { SITE } from './test-page';

test('records the active tab with the native recorder', async ({ context, openPanel }) => {
  const site = await context.newPage();

  await site.goto(`${SITE}/`);

  const panel = await openPanel(site);

  await panel.getByLabel('This tab').check();
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await expect(panel.locator('#status')).toHaveAttribute('data-state', 'recording');
  await site.waitForTimeout(1500);
  await panel.getByRole('button', { name: 'Stop recording' }).click();

  const recording = panel.locator('.recording').first();

  await expect(recording).toBeVisible({ timeout: 15_000 });
  await expect(recording.locator('.recording-meta')).toContainText('AV1 MP4');
  await expect(panel.locator('#error')).toBeHidden();

  const duration = await recording.locator('video').evaluate(
    (video: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (video.readyState >= 1) resolve(video.duration);
        else video.addEventListener('loadedmetadata', () => resolve(video.duration));
      }),
  );

  expect(duration).toBeGreaterThan(0.5);
});

test('records a shared screen surface with MediaRecorder', async ({ context, openPanel }) => {
  const site = await context.newPage();

  await site.goto(`${SITE}/`);

  const panel = await openPanel(site);

  await panel.getByLabel('Screen or window').check();
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await expect(panel.locator('#status')).toHaveAttribute('data-state', 'recording');
  await site.waitForTimeout(1500);
  await panel.getByRole('button', { name: 'Stop recording' }).click();

  const recording = panel.locator('.recording').first();

  await expect(recording).toBeVisible({ timeout: 15_000 });
  await expect(recording.locator('.recording-meta')).toContainText('Screen');
  await expect(panel.locator('#error')).toBeHidden();
});

test('remembers the chosen settings', async ({ context, openPanel }) => {
  const site = await context.newPage();

  await site.goto(`${SITE}/`);

  const panel = await openPanel(site);

  await panel.getByLabel('Screen or window').check();
  await panel.getByLabel('Frame rate').selectOption('30');
  await panel.reload();

  await expect(panel.getByLabel('Screen or window')).toBeChecked();
  await expect(panel.getByLabel('Frame rate')).toHaveValue('30');
});
