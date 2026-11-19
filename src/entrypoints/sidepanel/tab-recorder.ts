import { decodeBase64 } from '@/shared/format';

/**
 * Records one tab with Chrome's native `Page.startScreenRecording` (Chrome
 * 153+), driven over `chrome.debugger`. Chrome takes the frames straight from
 * the tab's compositor, encodes AV1 (plus Opus tab audio) out of process and
 * hands back an MP4 through an `IO.StreamHandle` when the recording stops.
 *
 * Same CDP calls as https://github.com/paulirish/chrome-capture.
 */

const PROTOCOL_VERSION = '1.3';

/** Bytes requested per `IO.read` call while draining the MP4. */
const READ_CHUNK_SIZE = 4 * 1024 * 1024;

export interface TabRecordingOptions {
  frameRate: number;
  maxWidth: number;
  maxHeight: number;
  audio: boolean;
}

interface StreamResult {
  stream?: string;
}

interface ReadResult {
  data: string;
  base64Encoded?: boolean;
  eof: boolean;
}

export class TabRecorder {
  #target: Browser.debugger.Debuggee | undefined;
  #onLost: ((reason: string) => void) | undefined;

  readonly #handleDetach = (source: Browser.debugger.Debuggee, reason: string) => {
    if (!this.#target || source.tabId !== this.#target.tabId) return;

    this.#target = undefined;
    this.#onLost?.(
      reason === 'target_closed'
        ? 'The recorded tab was closed, so the recording was lost.'
        : 'Recording was cancelled from the debugging bar, so it was lost.',
    );
  };

  get recording(): boolean {
    return this.#target !== undefined;
  }

  /**
   * Attaches to the tab and starts recording. `onLost` runs if the debugger
   * gets detached before `stop()` (tab closed, or the user dismissed Chrome's
   * "started debugging this browser" bar).
   */
  async start(
    tabId: number,
    options: TabRecordingOptions,
    onLost: (reason: string) => void,
  ): Promise<void> {
    const target: Browser.debugger.Debuggee = { tabId };

    await browser.debugger.attach(target, PROTOCOL_VERSION);

    try {
      await browser.debugger.sendCommand(target, 'Page.startScreenRecording', {
        frameRate: options.frameRate,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        audio: options.audio,
      });
    } catch (error) {
      await browser.debugger.detach(target).catch(() => {});
      throw new Error(describeStartError(error), { cause: error });
    }

    this.#target = target;
    this.#onLost = onLost;
    browser.debugger.onDetach.addListener(this.#handleDetach);
  }

  /** Stops recording and returns the finished MP4. */
  async stop(): Promise<Blob> {
    const target = this.#target;

    if (!target) throw new Error('No tab recording is running.');

    this.#target = undefined;
    browser.debugger.onDetach.removeListener(this.#handleDetach);

    try {
      // SAFETY: Page.stopScreenRecording returns `{ stream?: IO.StreamHandle }`.
      const result = (await browser.debugger.sendCommand(target, 'Page.stopScreenRecording')) as
        | StreamResult
        | undefined;

      const handle = result?.stream;

      if (!handle) throw new Error('Chrome returned no video for this recording.');

      return await readStream(target, handle);
    } finally {
      await browser.debugger.detach(target).catch(() => {});
    }
  }
}

async function readStream(target: Browser.debugger.Debuggee, handle: string): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  try {
    for (;;) {
      // SAFETY: IO.read returns `{ data, base64Encoded?, eof }`.
      const chunk = (await browser.debugger.sendCommand(target, 'IO.read', {
        handle,
        size: READ_CHUNK_SIZE,
      })) as ReadResult;

      if (chunk.data) {
        chunks.push(
          chunk.base64Encoded ? decodeBase64(chunk.data) : new TextEncoder().encode(chunk.data),
        );
      }

      if (chunk.eof) break;
    }
  } finally {
    await browser.debugger.sendCommand(target, 'IO.close', { handle }).catch(() => {});
  }

  return new Blob(chunks, { type: 'video/mp4' });
}

// Catch boundary: whatever CDP threw is turned into a message here.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
function describeStartError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/wasn't found|not found|Unknown method/i.test(message)) {
    return 'This Chrome has no native tab recorder. Update to Chrome 153 or later, or use Screen or window.';
  }

  return message || 'Chrome could not start recording this tab.';
}
