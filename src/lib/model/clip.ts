import type { Clip, MediaAsset, Transform } from './types';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_DURATION_MS } from './types';
import { clamp } from './time';

export const IDENTITY_TRANSFORM: Transform = { scale: 1, offsetX: 0, offsetY: 0 };

/** 확대 상한. 이보다 키우면 1080p 소스에서 화질이 무너진다. */
export const MAX_SCALE = 4;

export function createClip(asset: MediaAsset): Clip {
  return {
    inMs: 0,
    outMs: Math.min(asset.durationMs, MAX_DURATION_MS),
    transform: IDENTITY_TRANSFORM,
  };
}

export function clipDurationMs(clip: Clip): number {
  return clip.outMs - clip.inMs;
}

/** 타임라인 시각(0 기준)을 원본 영상의 시각으로 옮긴다. */
export function timelineToSourceMs(clip: Clip, timelineMs: number): number {
  return clip.inMs + clamp(timelineMs, 0, clipDurationMs(clip));
}

/** 최소 길이. 이보다 짧은 클립은 인코딩해도 의미가 없다. */
export const MIN_CLIP_MS = 500;

export function setTrim(
  clip: Clip,
  inMs: number,
  outMs: number,
  assetDurationMs: number,
): Clip {
  const maxOut = Math.min(assetDurationMs, MAX_DURATION_MS + Math.round(inMs));
  const nextIn = clamp(Math.round(inMs), 0, Math.max(0, assetDurationMs - MIN_CLIP_MS));
  const nextOut = clamp(
    Math.round(outMs),
    nextIn + MIN_CLIP_MS,
    Math.min(assetDurationMs, maxOut),
  );
  return { ...clip, inMs: nextIn, outMs: Math.min(nextOut, nextIn + MAX_DURATION_MS) };
}

export function setTransform(clip: Clip, patch: Partial<Transform>): Clip {
  const scale = clamp(patch.scale ?? clip.transform.scale, 1, MAX_SCALE);
  return {
    ...clip,
    transform: {
      scale,
      offsetX: patch.offsetX ?? clip.transform.offsetX,
      offsetY: patch.offsetY ?? clip.transform.offsetY,
    },
  };
}

export interface SourceLayout {
  /** 캔버스에 그려질 소스의 크기와 좌상단 위치. */
  readonly drawWidth: number;
  readonly drawHeight: number;
  readonly drawX: number;
  readonly drawY: number;
}

/**
 * 소스를 9:16 캔버스에 cover 방식으로 배치한다.
 * scale=1이 캔버스를 빈틈없이 덮는 최소 배율이므로 항상 여백이 생기지 않는다.
 * offset은 넘치는 영역 안에서만 움직이도록 제한한다.
 */
export function computeSourceLayout(
  asset: Pick<MediaAsset, 'width' | 'height'>,
  transform: Transform,
  canvasWidth = CANVAS_WIDTH,
  canvasHeight = CANVAS_HEIGHT,
): SourceLayout {
  const coverScale = Math.max(canvasWidth / asset.width, canvasHeight / asset.height);
  const effective = coverScale * clamp(transform.scale, 1, MAX_SCALE);
  const drawWidth = asset.width * effective;
  const drawHeight = asset.height * effective;

  const slackX = Math.max(0, (drawWidth - canvasWidth) / 2);
  const slackY = Math.max(0, (drawHeight - canvasHeight) / 2);
  const offsetX = clamp(transform.offsetX, -slackX, slackX);
  const offsetY = clamp(transform.offsetY, -slackY, slackY);

  return {
    drawWidth,
    drawHeight,
    drawX: (canvasWidth - drawWidth) / 2 + offsetX,
    drawY: (canvasHeight - drawHeight) / 2 + offsetY,
  };
}

/**
 * 위 배치를 ffmpeg scale+crop 인자로 옮긴다.
 * 캔버스 좌표계의 drawX/drawY가 음수이므로 crop 시작점은 그 부호를 뒤집은 값이다.
 */
export interface ScaleCropParams {
  readonly scaledWidth: number;
  readonly scaledHeight: number;
  readonly cropX: number;
  readonly cropY: number;
}

export function computeScaleCrop(
  asset: Pick<MediaAsset, 'width' | 'height'>,
  transform: Transform,
  canvasWidth = CANVAS_WIDTH,
  canvasHeight = CANVAS_HEIGHT,
): ScaleCropParams {
  const layout = computeSourceLayout(asset, transform, canvasWidth, canvasHeight);
  // ffmpeg는 홀수 크기를 다루지 못하는 인코더가 있어 짝수로 맞춘다.
  const scaledWidth = Math.max(canvasWidth, 2 * Math.round(layout.drawWidth / 2));
  const scaledHeight = Math.max(canvasHeight, 2 * Math.round(layout.drawHeight / 2));
  return {
    scaledWidth,
    scaledHeight,
    cropX: clamp(Math.round(-layout.drawX), 0, scaledWidth - canvasWidth),
    cropY: clamp(Math.round(-layout.drawY), 0, scaledHeight - canvasHeight),
  };
}
