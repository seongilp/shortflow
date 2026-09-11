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

/**
 * 클립을 갈아끼운다.
 *
 * 자막 시각은 클립 시작(0) 기준이므로, 시작점이 움직이면 타임라인 원점도 함께 움직인다.
 * 그만큼 자막을 밀어주지 않으면 앞을 잘라낼 때마다 자막이 내용에서 어긋난다.
 */
export function withClip(project: Project, clip: Clip): Project {
  const shiftMs = clip.inMs - project.clip.inMs;
  const shifted = shiftMs === 0 ? project.captions : shiftCaptions(project.captions, -shiftMs);
  return { ...project, clip, captions: clampCaptions(shifted, clipDurationMs(clip)) };
}

/** 모든 큐를 같은 양만큼 민다. 0보다 앞으로 나간 큐는 clampCaptions가 정리한다. */
function shiftCaptions(captions: readonly Caption[], deltaMs: number): readonly Caption[] {
  return captions.map((caption) => ({
    ...caption,
    startMs: caption.startMs + deltaMs,
    endMs: caption.endMs + deltaMs,
  }));
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
 * 트림으로 타임라인이 좁아지면 바깥으로 밀려난 자막이 생긴다.
 * 걸쳐 있는 큐는 경계까지 잘라내고, 완전히 벗어난 큐는 버린다.
 */
export function clampCaptions(
  captions: readonly Caption[],
  durationMs: number,
): readonly Caption[] {
  return captions
    .filter((caption) => caption.startMs < durationMs && caption.endMs > 0)
    .map((caption) => {
      const startMs = Math.max(0, caption.startMs);
      const endMs = Math.min(durationMs, caption.endMs);
      return startMs === caption.startMs && endMs === caption.endMs
        ? caption
        : { ...caption, startMs, endMs };
    });
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
