/**
 * Pure helpers shared by the recorders and the side panel UI. Nothing here
 * touches browser APIs, so all of it is unit tested.
 */

export type CaptureMode = 'tab' | 'screen';

export type ResolutionName = '720p' | '1080p' | '1440p' | '2160p';

export interface Resolution {
  width: number;
  height: number;
}

export const RESOLUTIONS: Record<ResolutionName, Resolution> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
};

/** `Page.startScreenRecording` shipped in Chrome 153. */
export const NATIVE_RECORDING_MIN_CHROME = 153;

/**
 * Container and codec candidates for `MediaRecorder`, best first. Chrome
 * records MP4 since 126; WebM is the fallback everywhere else.
 */
export const MEDIA_RECORDER_TYPES = [
  'video/mp4;codecs=avc1.640033,opus',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=av01,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return MEDIA_RECORDER_TYPES.find((type) => isSupported(type));
}

export function fileExtensionFor(mimeType: string): 'mp4' | 'webm' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** A short codec label for the recordings list, such as "AV1 MP4". */
export function formatLabelFor(mimeType: string): string {
  const container = fileExtensionFor(mimeType).toUpperCase();
  const codec = /codecs=([^,;]+)/.exec(mimeType)?.[1] ?? '';

  if (codec.startsWith('av01') || codec === 'av1') return `AV1 ${container}`;

  if (codec.startsWith('avc1')) return `H.264 ${container}`;

  if (codec.startsWith('vp9')) return `VP9 ${container}`;

  if (codec.startsWith('vp8')) return `VP8 ${container}`;

  return container;
}

/**
 * Target bitrate for `MediaRecorder`, about 0.1 bit per pixel per frame,
 * kept between 2 and 40 Mbps. Native tab recordings pick their own bitrate.
 */
export function videoBitrate(resolution: Resolution, frameRate: number): number {
  const bitsPerSecond = resolution.width * resolution.height * frameRate * 0.1;

  return Math.round(Math.min(40_000_000, Math.max(2_000_000, bitsPerSecond)));
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;

  return `${minutes}:${seconds}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Download path, relative to the user's download folder, for example
 * `chrome-recorder/recording-2026-11-19-120311-tab.mp4`.
 */
export function recordingFileName(mode: CaptureMode, date: Date, extension: string): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

  return `chrome-recorder/recording-${day}-${time}-${mode}.${extension}`;
}

/** Major Chrome version from a user agent string, or 0 if there is none. */
export function chromeMajorVersion(userAgent: string): number {
  const match = /Chrom(?:e|ium)\/(\d+)/.exec(userAgent);

  return match ? Number(match[1]) : 0;
}

/** Decodes a base64 string, as returned by CDP `IO.read`, into bytes. */
export function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);

  return bytes;
}
