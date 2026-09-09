import { nanoid } from 'nanoid';
import type { Caption, Clip, MediaAsset, MusicTrack, Project } from './types';
import { MAX_DURATION_MS } from './types';
import { clipDurationMs, createClip } from './clip';
import { clamp } from './time';

export function createProject(source: MediaAsset, name?: string): Project {
  return {
    id: nanoid(),
    name: name ?? source.fileName.replace(/\.[^.]+$/, ''),
    source,
    clip: createClip(source),
    captions: [],
    music: null,
    sourceVolume: 1,
  };
}

/** 편집 타임라인의 길이. 자막 시각의 상한이기도 하다. */
export function projectDurationMs(project: Project): number {
  return clipDurationMs(project.clip);
}

export function withClip(project: Project, clip: Clip): Project {
  return { ...project, clip, captions: clampCaptions(project.captions, clipDurationMs(clip)) };
}

export function withCaptions(project: Project, captions: readonly Caption[]): Project {
  return { ...project, captions };
}

export function withMusic(project: Project, music: MusicTrack | null): Project {
  return { ...project, music };
}

export function withSourceVolume(project: Project, volume: number): Project {
  return { ...project, sourceVolume: clamp(volume, 0, 2) };
}

/**
 * 트림으로 타임라인이 짧아지면 바깥으로 밀려난 자막이 생긴다.
 * 범위를 벗어난 큐는 잘라내고, 완전히 벗어난 큐는 버린다.
 */
export function clampCaptions(
  captions: readonly Caption[],
  durationMs: number,
): readonly Caption[] {
  return captions
    .filter((caption) => caption.startMs < durationMs)
    .map((caption) =>
      caption.endMs <= durationMs ? caption : { ...caption, endMs: durationMs },
    );
}

export interface ImportValidationError {
  readonly code: 'TOO_LONG' | 'NO_DIMENSIONS' | 'NO_DURATION';
  readonly message: string;
}

/** 임포트 시점의 소스 검증. 통과하지 못한 파일은 프로젝트로 만들지 않는다. */
export function validateAsset(asset: MediaAsset): ImportValidationError | null {
  if (!Number.isFinite(asset.durationMs) || asset.durationMs <= 0) {
    return { code: 'NO_DURATION', message: '영상 길이를 읽지 못했습니다. 지원하지 않는 형식일 수 있습니다.' };
  }
  if (!asset.width || !asset.height) {
    return { code: 'NO_DIMENSIONS', message: '영상 해상도를 읽지 못했습니다. 지원하지 않는 형식일 수 있습니다.' };
  }
  if (asset.durationMs > MAX_DURATION_MS * 10) {
    return {
      code: 'TOO_LONG',
      message: '10분을 넘는 영상은 브라우저에서 처리할 수 없습니다. 미리 잘라서 올려주세요.',
    };
  }
  return null;
}
