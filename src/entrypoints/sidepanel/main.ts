import './fonts.css';
import {
  chromeMajorVersion,
  fileExtensionFor,
  formatBytes,
  formatElapsed,
  formatLabelFor,
  NATIVE_RECORDING_MIN_CHROME,
  recordingFileName,
  RESOLUTIONS,
  type CaptureMode,
  type ResolutionName,
} from '@/shared/format';

import { ScreenRecorder } from './screen-recorder';
import { TabRecorder } from './tab-recorder';

type PanelState = 'idle' | 'busy' | 'recording' | 'error';

interface Settings {
  mode: CaptureMode;
  frameRate: number;
  resolution: ResolutionName;
  audio: boolean;
}

interface Recording {
  mode: CaptureMode;
  blob: Blob;
  url: string;
  fileName: string;
  durationMs: number;
  downloadId: number | undefined;
}

const SETTINGS_KEY = 'chrome-recorder:settings';

const HINTS: Record<CaptureMode, string> = {
  tab:
    'Records the active tab, frame by frame from Chrome’s compositor. Chrome shows a ' +
    '“started debugging this browser” bar while it records; dismissing that bar cancels the recording.',
  screen:
    'Chrome asks what to share: a whole screen, a window or a tab. Turn on system or tab audio in that ' +
    'dialog to record sound. Keep this panel open while recording.',
};

const statusBar = element('status');
const statusText = element('status-text');
const elapsed = element('elapsed');
const modes = element<HTMLFieldSetElement>('modes');
const frameRateSelect = element<HTMLSelectElement>('frame-rate');
const resolutionSelect = element<HTMLSelectElement>('resolution');
const audioCheckbox = element<HTMLInputElement>('audio');
const hint = element('hint');
const toggle = element<HTMLButtonElement>('toggle');
const toggleLabel = element('toggle-label');
const errorBox = element('error');
const list = element<HTMLUListElement>('recordings');

const tabRecorder = new TabRecorder();
const screenRecorder = new ScreenRecorder();
const nativeSupported = chromeMajorVersion(navigator.userAgent) >= NATIVE_RECORDING_MIN_CHROME;

let activeMode: CaptureMode | undefined;
let startedAt = 0;
let timer: number | undefined;

restoreSettings();

updateHint();

modes.addEventListener('change', () => {
  updateHint();
  saveSettings();
});

frameRateSelect.addEventListener('change', saveSettings);

resolutionSelect.addEventListener('change', saveSettings);

audioCheckbox.addEventListener('change', saveSettings);

toggle.addEventListener('click', () => {
  if (activeMode) void stopRecording();
  else void startRecording();
});

async function startRecording(): Promise<void> {
  const settings = readSettings();
  const resolution = RESOLUTIONS[settings.resolution];

  showError('');
  setState('busy', settings.mode === 'tab' ? 'Starting…' : 'Pick what to share…');

  try {
    if (settings.mode === 'tab') {
      const tabId = await activeTabId();

      await tabRecorder.start(
        tabId,
        {
          frameRate: settings.frameRate,
          maxWidth: resolution.width,
          maxHeight: resolution.height,
          audio: settings.audio,
        },
        handleTabLost,
      );
    } else {
      await screenRecorder.start(
        { frameRate: settings.frameRate, resolution, audio: settings.audio },
        () => void stopRecording(),
      );
    }
  } catch (error) {
    setState('idle', 'Ready to record');
    showError(describeError(error));

    return;
  }

  activeMode = settings.mode;
  startedAt = performance.now();
  timer = window.setInterval(renderElapsed, 250);
  renderElapsed();
  setState('recording', settings.mode === 'tab' ? 'Recording this tab' : 'Recording screen');
  void setBadge(true);
}

async function stopRecording(): Promise<void> {
  const mode = activeMode;

  if (!mode) return;

  const durationMs = performance.now() - startedAt;

  activeMode = undefined;
  window.clearInterval(timer);
  setState('busy', 'Saving…');
  void setBadge(false);

  try {
    const blob = mode === 'tab' ? await tabRecorder.stop() : await screenRecorder.stop();

    if (blob.size === 0) throw new Error('The recording came back empty.');

    const recording = await save(mode, blob, durationMs);

    renderRecording(recording);
    setState('idle', `Saved ${recording.fileName.split('/').pop() ?? ''}`);
  } catch (error) {
    setState('error', 'Recording failed');
    showError(describeError(error));
  }
}

function handleTabLost(reason: string): void {
  activeMode = undefined;
  window.clearInterval(timer);
  void setBadge(false);
  setState('error', 'Recording stopped');
  showError(reason);
}

async function save(mode: CaptureMode, blob: Blob, durationMs: number): Promise<Recording> {
  const url = URL.createObjectURL(blob);
  const fileName = recordingFileName(mode, new Date(), fileExtensionFor(blob.type));
  const downloadId = await download(url, fileName);

  return { mode, blob, url, fileName, durationMs, downloadId };
}

async function download(url: string, fileName: string): Promise<number | undefined> {
  try {
    return await browser.downloads.download({ url, filename: fileName, saveAs: false });
  } catch (error) {
    showError(`Recorded, but saving failed: ${describeError(error)} Use “Save again”.`);

    return undefined;
  }
}

function renderRecording(recording: Recording): void {
  const item = document.createElement('li');
  const video = document.createElement('video');
  const name = document.createElement('div');
  const meta = document.createElement('div');
  const actions = document.createElement('div');
  const saveAgain = button('Save again');
  const show = button('Show in folder');

  item.className = 'recording';
  video.src = recording.url;
  video.controls = true;
  video.muted = true;
  video.preload = 'metadata';
  name.className = 'recording-name';
  name.textContent = recording.fileName.split('/').pop() ?? recording.fileName;
  meta.className = 'recording-meta';
  meta.textContent = [
    recording.mode === 'tab' ? 'Tab' : 'Screen',
    formatElapsed(recording.durationMs),
    formatBytes(recording.blob.size),
    formatLabelFor(recording.mode === 'tab' ? 'video/mp4;codecs=av01' : recording.blob.type),
  ].join(' · ');
  actions.className = 'recording-actions';

  saveAgain.addEventListener('click', async () => {
    recording.downloadId = await download(recording.url, recording.fileName);
    show.disabled = recording.downloadId === undefined;
  });
  show.disabled = recording.downloadId === undefined;
  show.addEventListener('click', () => {
    if (recording.downloadId !== undefined) browser.downloads.show(recording.downloadId);
  });

  actions.append(saveAgain, show);
  item.append(video, name, meta, actions);
  list.prepend(item);
}

async function activeTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (tab?.id === undefined) throw new Error('There is no active tab to record.');

  return tab.id;
}

function setState(state: PanelState, text: string): void {
  const recording = state === 'recording';

  statusBar.dataset.state = state;
  statusText.textContent = text;
  elapsed.hidden = !recording;
  toggle.dataset.state = recording ? 'recording' : 'idle';
  toggle.disabled = state === 'busy';
  toggleLabel.textContent = recording ? 'Stop recording' : 'Start recording';
  modes.disabled = state === 'busy' || recording;
  frameRateSelect.disabled = modes.disabled;
  resolutionSelect.disabled = modes.disabled;
  audioCheckbox.disabled = modes.disabled;

  if (!modes.disabled) applyNativeSupport();
}

function renderElapsed(): void {
  elapsed.textContent = formatElapsed(performance.now() - startedAt);
}

async function setBadge(recording: boolean): Promise<void> {
  await browser.action.setBadgeBackgroundColor({ color: '#FF003C' });
  await browser.action.setBadgeText({ text: recording ? 'REC' : '' });
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = message === '';
}

function updateHint(): void {
  hint.textContent = HINTS[readSettings().mode];
}

/** Without Chrome 153 there is no native recorder, so only screen mode is offered. */
function applyNativeSupport(): void {
  const tabOption = modes.querySelector<HTMLInputElement>('input[value="tab"]');

  if (nativeSupported || !tabOption) return;

  tabOption.disabled = true;
  tabOption.closest('.mode')?.setAttribute('title', 'Needs Chrome 153 or later');

  if (tabOption.checked) {
    setMode('screen');
    updateHint();
  }
}

function readSettings(): Settings {
  const mode = modes.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value;

  return {
    mode: mode === 'screen' ? 'screen' : 'tab',
    frameRate: Number(frameRateSelect.value),
    resolution: toResolutionName(resolutionSelect.value),
    audio: audioCheckbox.checked,
  };
}

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(readSettings()));
  } catch {
    // Settings are a convenience; recording works without them.
  }
}

function restoreSettings(): void {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);

    if (saved) {
      // SAFETY: written by saveSettings above; each field is re-validated below.
      const settings = JSON.parse(saved) as Partial<Settings>;

      if (settings.mode) setMode(settings.mode === 'screen' ? 'screen' : 'tab');

      if (settings.frameRate) frameRateSelect.value = String(settings.frameRate);

      if (settings.resolution) resolutionSelect.value = toResolutionName(settings.resolution);

      if (settings.audio !== undefined) audioCheckbox.checked = settings.audio === true;
    }
  } catch {
    // Ignore unreadable settings and keep the defaults.
  }

  applyNativeSupport();
}

function setMode(mode: CaptureMode): void {
  const input = modes.querySelector<HTMLInputElement>(`input[value="${mode}"]`);

  if (input) input.checked = true;
}

function toResolutionName(value: string): ResolutionName {
  return value === '720p' || value === '1440p' || value === '2160p' ? value : '1080p';
}

// Catch boundary: whatever was thrown is turned into a message here.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Sharing was cancelled or blocked.';
  }

  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');

  if (/Cannot access a chrome|chrome:\/\/|chrome-extension:\/\//i.test(message)) {
    return 'Chrome doesn’t allow recording its own pages. Switch to a website tab, or use Screen or window.';
  }

  return message;
}

function button(label: string): HTMLButtonElement {
  const result = document.createElement('button');

  result.type = 'button';
  result.textContent = label;

  return result;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);

  if (!result) throw new Error(`Missing #${id} in sidepanel.html`);

  // SAFETY: callers name the element type that sidepanel.html uses for this id.
  return result as T;
}
