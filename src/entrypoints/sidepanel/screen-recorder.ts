import { pickMimeType, videoBitrate, type Resolution } from '@/shared/format';

/**
 * Records a screen, window or tab the user picks in Chrome's share dialog,
 * using `getDisplayMedia` and `MediaRecorder`. Works in any Chrome, and for
 * things outside the browser, which the native tab recorder can't reach.
 */

export interface ScreenRecordingOptions {
  frameRate: number;
  resolution: Resolution;
  audio: boolean;
}

/** Chrome's extra `getDisplayMedia` hints, not yet in TypeScript's DOM types. */
interface ChromeDisplayMediaOptions extends DisplayMediaStreamOptions {
  systemAudio?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
}

export class ScreenRecorder {
  #stream: MediaStream | undefined;
  #recorder: MediaRecorder | undefined;
  #chunks: Blob[] = [];

  get recording(): boolean {
    return this.#recorder !== undefined;
  }

  get mimeType(): string {
    return this.#recorder?.mimeType ?? '';
  }

  /**
   * Opens the share dialog and starts recording what the user picks.
   * `onEnded` runs when sharing stops from outside the panel, for example
   * with Chrome's "Stop sharing" button.
   */
  async start(options: ScreenRecordingOptions, onEnded: () => void): Promise<void> {
    const request: ChromeDisplayMediaOptions = {
      video: {
        frameRate: { ideal: options.frameRate, max: options.frameRate },
        width: { max: options.resolution.width },
        height: { max: options.resolution.height },
      },
      audio: options.audio,
      // Chrome-only hints: offer system audio and list every kind of surface.
      systemAudio: options.audio ? 'include' : 'exclude',
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    };

    const stream = await navigator.mediaDevices.getDisplayMedia(request);
    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: videoBitrate(options.resolution, options.frameRate),
      });

      this.#chunks = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) this.#chunks.push(event.data);
      });

      // A timeslice keeps memory flowing into chunks instead of one huge buffer.
      recorder.start(1000);
    } catch (error) {
      // Stop sharing, or Chrome keeps showing the capture as live.
      for (const track of stream.getTracks()) track.stop();

      throw error;
    }

    stream.getVideoTracks()[0]?.addEventListener('ended', onEnded, { once: true });
    this.#stream = stream;
    this.#recorder = recorder;
  }

  /** Stops recording and returns the finished video. */
  async stop(): Promise<Blob> {
    const recorder = this.#recorder;
    const stream = this.#stream;

    if (!recorder || !stream) throw new Error('No screen recording is running.');

    this.#recorder = undefined;
    this.#stream = undefined;

    // MediaRecorder stops by itself once every track has ended, so it may
    // already be inactive (and its last chunk delivered) by now.
    if (recorder.state !== 'inactive') {
      const stopped = new Promise((resolve) =>
        recorder.addEventListener('stop', resolve, { once: true }),
      );

      recorder.stop();
      await stopped;
    }

    for (const track of stream.getTracks()) track.stop();

    const blob = new Blob(this.#chunks, { type: recorder.mimeType });

    this.#chunks = [];

    return blob;
  }
}
