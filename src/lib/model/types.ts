/** 쇼츠 출력 규격. 모든 좌표 계산의 기준 캔버스. */
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

/** 쇼츠 길이 상한. WASM 힙 초과를 예방하는 하드 리밋이기도 하다. */
export const MAX_DURATION_MS = 60_000;

export interface MediaAsset {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
}

/** 소스 영상을 9:16 캔버스에 배치하는 변환. scale 1 = 캔버스를 꽉 채우는 최소 배율. */
export interface Transform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface Clip {
  readonly inMs: number;
  readonly outMs: number;
  readonly transform: Transform;
}

export type CaptionAlign = 'left' | 'center' | 'right';

export interface CaptionStyle {
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly color: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  /** 투명 배경은 null. */
  readonly backgroundColor: string | null;
  readonly backgroundPadding: number;
  readonly align: CaptionAlign;
}

/** 자막 큐 하나. 시각은 트림 이후 타임라인 기준(0 = 클립 시작). */
export interface Caption {
  readonly id: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  /** 캔버스 대비 비율 좌표. 자막 박스의 중심점. */
  readonly position: { readonly xRatio: number; readonly yRatio: number };
  readonly style: CaptionStyle;
}

export interface MusicTrack {
  readonly asset: MediaAsset;
  readonly volume: number;
  /** 타임라인 기준 재생 시작 시각. */
  readonly startMs: number;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly source: MediaAsset;
  readonly clip: Clip;
  readonly captions: readonly Caption[];
  readonly music: MusicTrack | null;
  readonly sourceVolume: number;
}
