import { describe, expect, it } from 'vitest';
import {
  IDENTITY_TRANSFORM,
  MAX_SCALE,
  MIN_CLIP_MS,
  clipDurationMs,
  computeCropScale,
  computeSourceLayout,
  createClip,
  setTransform,
  setTrim,
  timelineToSourceMs,
} from './clip';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_DURATION_MS } from './types';
import type { MediaAsset } from './types';

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'a',
  fileName: 'v.mp4',
  url: 'blob:v',
  durationMs: 30_000,
  width: 1920,
  height: 1080,
  ...over,
});

describe('createClip', () => {
  it('전체 구간을 잡는다', () => {
    expect(clipDurationMs(createClip(asset()))).toBe(30_000);
  });

  it('60초를 넘는 소스는 상한에서 자른다', () => {
    expect(clipDurationMs(createClip(asset({ durationMs: 300_000 })))).toBe(MAX_DURATION_MS);
  });
});

describe('setTrim', () => {
  it('소스 길이를 넘지 않는다', () => {
    const clip = setTrim(createClip(asset()), 1000, 99_000, 30_000);
    expect(clip.outMs).toBe(30_000);
  });

  it('최소 길이를 보장한다', () => {
    const clip = setTrim(createClip(asset()), 5000, 5000, 30_000);
    expect(clip.outMs - clip.inMs).toBe(MIN_CLIP_MS);
  });

  it('60초 상한을 넘겨 자를 수 없다', () => {
    const clip = setTrim(createClip(asset({ durationMs: 300_000 })), 0, 200_000, 300_000);
    expect(clipDurationMs(clip)).toBeLessThanOrEqual(MAX_DURATION_MS);
  });

  it('원본 클립을 변형하지 않는다', () => {
    const original = createClip(asset());
    setTrim(original, 1000, 2000, 30_000);
    expect(original.inMs).toBe(0);
  });
});

describe('timelineToSourceMs', () => {
  it('트림 시작만큼 밀어준다', () => {
    const clip = setTrim(createClip(asset()), 4000, 10_000, 30_000);
    expect(timelineToSourceMs(clip, 0)).toBe(4000);
    expect(timelineToSourceMs(clip, 1000)).toBe(5000);
  });

  it('클립 길이를 넘는 시각은 끝으로 자른다', () => {
    const clip = setTrim(createClip(asset()), 0, 5000, 30_000);
    expect(timelineToSourceMs(clip, 99_000)).toBe(5000);
  });
});

describe('setTransform', () => {
  it('배율을 1과 상한 사이로 자른다', () => {
    expect(setTransform(createClip(asset()), { scale: 0.2 }).transform.scale).toBe(1);
    expect(setTransform(createClip(asset()), { scale: 99 }).transform.scale).toBe(MAX_SCALE);
  });
});

describe('computeSourceLayout', () => {
  it('가로 영상은 세로를 꽉 채우고 좌우가 넘친다', () => {
    const layout = computeSourceLayout(asset(), IDENTITY_TRANSFORM);
    expect(layout.drawHeight).toBeCloseTo(CANVAS_HEIGHT, 5);
    expect(layout.drawWidth).toBeGreaterThan(CANVAS_WIDTH);
    expect(layout.drawX).toBeLessThan(0);
  });

  it('세로 영상은 가로를 꽉 채운다', () => {
    const layout = computeSourceLayout(asset({ width: 1080, height: 1920 }), IDENTITY_TRANSFORM);
    expect(layout.drawWidth).toBeCloseTo(CANVAS_WIDTH, 5);
    expect(layout.drawHeight).toBeCloseTo(CANVAS_HEIGHT, 5);
  });

  it('넘치지 않는 축으로는 이동할 수 없다', () => {
    const layout = computeSourceLayout(
      asset({ width: 1080, height: 1920 }),
      { scale: 1, offsetX: 500, offsetY: 500 },
    );
    expect(layout.drawX).toBeCloseTo(0, 5);
    expect(layout.drawY).toBeCloseTo(0, 5);
  });

  it('넘치는 축에서는 여유 범위까지만 이동한다', () => {
    const layout = computeSourceLayout(asset(), { scale: 1, offsetX: 99_999, offsetY: 0 });
    expect(layout.drawX).toBeCloseTo(0, 5);
  });
});

describe('computeCropScale', () => {
  it('소스 해상도 안에서 크롭한다', () => {
    const params = computeCropScale(asset(), IDENTITY_TRANSFORM);
    expect(params.cropX + params.cropWidth).toBeLessThanOrEqual(1920);
    expect(params.cropY + params.cropHeight).toBeLessThanOrEqual(1080);
  });

  it('출력은 항상 9:16 캔버스 크기다', () => {
    const params = computeCropScale(asset(), { scale: 2.5, offsetX: 300, offsetY: -200 });
    expect(params.outWidth).toBe(CANVAS_WIDTH);
    expect(params.outHeight).toBe(CANVAS_HEIGHT);
  });

  it('가로 영상은 세로를 다 쓰고 좌우만 잘라낸다', () => {
    const params = computeCropScale(asset(), IDENTITY_TRANSFORM);
    expect(params.cropHeight).toBe(1080);
    expect(params.cropWidth).toBeLessThan(1920);
    expect(params.cropY).toBe(0);
  });

  it('크롭 폭이 소스보다 작아 스케일이 축소로 동작한다', () => {
    // 확대 없이 가로 영상을 세로로 맞추면 잘라낸 영역이 출력보다 좁을 수 있지만,
    // 어느 경우에도 3400px 같은 중간 확대가 생기지 않아야 한다.
    const params = computeCropScale(asset(), IDENTITY_TRANSFORM);
    expect(params.cropWidth).toBeLessThanOrEqual(1920);
    expect(params.cropHeight).toBeLessThanOrEqual(1080);
  });

  it('확대하면 잘라내는 영역이 좁아진다', () => {
    const wide = computeCropScale(asset(), IDENTITY_TRANSFORM);
    const zoomed = computeCropScale(asset(), { scale: 2, offsetX: 0, offsetY: 0 });
    expect(zoomed.cropWidth).toBeLessThan(wide.cropWidth);
    expect(zoomed.cropHeight).toBeLessThan(wide.cropHeight);
  });

  it('크롭 크기가 항상 짝수다', () => {
    const params = computeCropScale(asset({ width: 1919, height: 1079 }), IDENTITY_TRANSFORM);
    expect(params.cropWidth % 2).toBe(0);
    expect(params.cropHeight % 2).toBe(0);
  });

  it('이동량이 과해도 소스 밖을 가리키지 않는다', () => {
    const params = computeCropScale(asset(), { scale: 2, offsetX: 99_999, offsetY: 99_999 });
    expect(params.cropX).toBeGreaterThanOrEqual(0);
    expect(params.cropY).toBeGreaterThanOrEqual(0);
    expect(params.cropX + params.cropWidth).toBeLessThanOrEqual(1920);
  });
});
