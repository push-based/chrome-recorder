import { describe, expect, it } from 'vitest';

import {
  chromeMajorVersion,
  decodeBase64,
  fileExtensionFor,
  formatBytes,
  formatElapsed,
  formatLabelFor,
  pickMimeType,
  recordingFileName,
  RESOLUTIONS,
  videoBitrate,
} from './format';

describe('pickMimeType', () => {
  it('prefers MP4 when the browser can record it', () => {
    expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1.640033,opus');
  });

  it('falls back to WebM', () => {
    expect(pickMimeType((type) => type.startsWith('video/webm;codecs=vp9'))).toBe(
      'video/webm;codecs=vp9,opus',
    );
  });

  it('returns undefined when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});

describe('fileExtensionFor and formatLabelFor', () => {
  it('maps containers and codecs', () => {
    expect(fileExtensionFor('video/mp4')).toBe('mp4');
    expect(fileExtensionFor('video/webm;codecs=vp9')).toBe('webm');
    expect(formatLabelFor('video/mp4;codecs=av01')).toBe('AV1 MP4');
    expect(formatLabelFor('video/mp4;codecs=avc1.640033,opus')).toBe('H.264 MP4');
    expect(formatLabelFor('video/webm;codecs=vp9,opus')).toBe('VP9 WEBM');
    expect(formatLabelFor('video/webm')).toBe('WEBM');
  });
});

describe('videoBitrate', () => {
  it('scales with pixels and frame rate within bounds', () => {
    expect(videoBitrate(RESOLUTIONS['1080p'], 60)).toBe(12_441_600);
    expect(videoBitrate({ width: 320, height: 240 }, 15)).toBe(2_000_000);
    expect(videoBitrate(RESOLUTIONS['2160p'], 120)).toBe(40_000_000);
  });
});

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });
});

describe('recordingFileName', () => {
  it('builds a sortable path in the chrome-recorder folder', () => {
    const date = new Date(2026, 10, 19, 9, 3, 7);

    expect(recordingFileName('tab', date, 'mp4')).toBe(
      'chrome-recorder/recording-2026-11-19-090307-tab.mp4',
    );
  });
});

describe('chromeMajorVersion', () => {
  it('reads Chrome and Chromium user agents', () => {
    expect(chromeMajorVersion('Mozilla/5.0 Chrome/153.0.7000.1 Safari/537.36')).toBe(153);
    expect(chromeMajorVersion('Mozilla/5.0 HeadlessChrome Chromium/157.0.1')).toBe(157);
    expect(chromeMajorVersion('Mozilla/5.0 Firefox/140.0')).toBe(0);
  });
});

describe('decodeBase64', () => {
  it('returns the raw bytes', () => {
    expect([...decodeBase64('AAEC/w==')]).toEqual([0, 1, 2, 255]);
  });
});
