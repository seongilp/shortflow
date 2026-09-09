import { nanoid } from 'nanoid';
import type { Caption, CaptionStyle } from './types';
import { CANVAS_HEIGHT } from './types';
import { clamp } from './time';

/** 자막 큐의 최소 길이. 이보다 짧으면 화면에서 읽을 수 없다. */
export const MIN_CAPTION_MS = 200;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 72,
  fontWeight: 700,
  color: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 8,
  backgroundColor: null,
  backgroundPadding: 24,
  align: 'center',
};

interface CreateCaptionInput {
  readonly text?: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly style?: Partial<CaptionStyle>;
}

export function createCaption(input: CreateCaptionInput): Caption {
  return {
    id: nanoid(),
    text: input.text ?? '자막을 입력하세요',
    startMs: Math.max(0, Math.round(input.startMs)),
    endMs: Math.max(Math.round(input.startMs) + MIN_CAPTION_MS, Math.round(input.endMs)),
    // 세로 영상에서 하단 안전 영역. 유튜브 UI에 가리지 않는 높이.
    position: { xRatio: 0.5, yRatio: 0.78 },
    style: { ...DEFAULT_CAPTION_STYLE, ...input.style },
  };
}

/** 시작 시각 기준 오름차순. 동률이면 종료 시각 순. */
export function sortCaptions(captions: readonly Caption[]): readonly Caption[] {
  return [...captions].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function addCaption(
  captions: readonly Caption[],
  caption: Caption,
): readonly Caption[] {
  return sortCaptions([...captions, caption]);
}

export function removeCaption(
  captions: readonly Caption[],
  id: string,
): readonly Caption[] {
  return captions.filter((caption) => caption.id !== id);
}

/** 지정한 큐만 교체한 새 배열을 낸다. 없는 id는 무시한다. */
export function updateCaption(
  captions: readonly Caption[],
  id: string,
  patch: Partial<Omit<Caption, 'id' | 'style'>> & { style?: Partial<CaptionStyle> },
): readonly Caption[] {
  return sortCaptions(
    captions.map((caption) =>
      caption.id === id
        ? {
            ...caption,
            ...patch,
            style: patch.style ? { ...caption.style, ...patch.style } : caption.style,
          }
        : caption,
    ),
  );
}

/**
 * 큐의 시간 구간을 옮기되 [0, durationMs] 안에 머물게 한다.
 * 최소 길이를 보장하므로 시작이 종료를 넘어서지 않는다.
 */
export function retimeCaption(
  captions: readonly Caption[],
  id: string,
  startMs: number,
  endMs: number,
  durationMs: number,
): readonly Caption[] {
  const nextStart = clamp(Math.round(startMs), 0, Math.max(0, durationMs - MIN_CAPTION_MS));
  const nextEnd = clamp(Math.round(endMs), nextStart + MIN_CAPTION_MS, durationMs);
  return updateCaption(captions, id, { startMs: nextStart, endMs: nextEnd });
}

/** 큐 길이를 유지한 채 통째로 이동한다. 타임라인 드래그용. */
export function shiftCaption(
  captions: readonly Caption[],
  id: string,
  startMs: number,
  durationMs: number,
): readonly Caption[] {
  const caption = captions.find((item) => item.id === id);
  if (!caption) return captions;
  const length = caption.endMs - caption.startMs;
  const nextStart = clamp(Math.round(startMs), 0, Math.max(0, durationMs - length));
  return updateCaption(captions, id, { startMs: nextStart, endMs: nextStart + length });
}

/** 재생 헤드 시각에 보여야 할 큐들. 경계는 시작 포함, 종료 제외. */
export function captionsAt(
  captions: readonly Caption[],
  timeMs: number,
): readonly Caption[] {
  return captions.filter(
    (caption) => timeMs >= caption.startMs && timeMs < caption.endMs,
  );
}

/** 큐 중심의 픽셀 좌표. 렌더러와 드래그 히트 판정이 공유한다. */
export function captionCenterPx(
  caption: Caption,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: caption.position.xRatio * canvasWidth,
    y: caption.position.yRatio * canvasHeight,
  };
}

/** 새 큐를 놓을 기본 구간. 재생 헤드에서 2초, 남은 길이에 맞춰 줄인다. */
export function defaultCaptionRange(
  playheadMs: number,
  durationMs: number,
): { startMs: number; endMs: number } {
  const preferred = 2000;
  const startMs = clamp(playheadMs, 0, Math.max(0, durationMs - MIN_CAPTION_MS));
  const endMs = Math.min(startMs + preferred, durationMs);
  return {
    startMs,
    endMs: Math.max(endMs, startMs + MIN_CAPTION_MS),
  };
}

/** 세로 캔버스 하단 안전 영역 기준 y 비율. */
export const SAFE_BOTTOM_Y_RATIO = 1 - 420 / CANVAS_HEIGHT;
