import { describe, expect, it } from 'vitest';
import { clampCaptions, createProject, projectDurationMs, validateAsset, withClip, withSourceVolume } from './project';
import { createCaption } from './caption';
import { setTrim } from './clip';
import type { MediaAsset } from './types';

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'a', fileName: 'my clip.mp4', url: 'blob:v',
  durationMs: 30_000, width: 1920, height: 1080, ...over,
});

describe('createProject', () => {
  it('파일명에서 확장자를 뗀 이름을 쓴다', () => {
    expect(createProject(asset()).name).toBe('my clip');
  });

  it('자막 없이 전체 구간으로 시작한다', () => {
    const project = createProject(asset());
    expect(project.captions).toEqual([]);
    expect(projectDurationMs(project)).toBe(30_000);
  });
});

describe('clampCaptions', () => {
  it('타임라인 밖으로 완전히 벗어난 큐를 버린다', () => {
    const captions = [createCaption({ startMs: 9000, endMs: 10_000 })];
    expect(clampCaptions(captions, 5000)).toHaveLength(0);
  });

  it('걸쳐 있는 큐는 끝을 잘라낸다', () => {
    const captions = [createCaption({ startMs: 4000, endMs: 10_000 })];
    expect(clampCaptions(captions, 5000)[0].endMs).toBe(5000);
  });

  it('범위 안의 큐는 같은 객체를 유지한다', () => {
    const caption = createCaption({ startMs: 0, endMs: 1000 });
    expect(clampCaptions([caption], 5000)[0]).toBe(caption);
  });
});

describe('withClip', () => {
  const withCues = (...cues: { startMs: number; endMs: number }[]) => {
    const base = createProject(asset());
    return { ...base, captions: cues.map((cue) => createCaption(cue)) };
  };

  it('트림으로 짧아지면 자막도 함께 정리한다', () => {
    const project = withCues({ startMs: 20_000, endMs: 22_000 });
    const next = withClip(project, setTrim(project.clip, 0, 10_000, 30_000));
    expect(next.captions).toHaveLength(0);
  });

  it('시작점을 뒤로 옮기면 자막을 그만큼 앞으로 민다', () => {
    // 앞을 2초 자르면, 내용상 5초 지점의 자막은 타임라인 3초가 된다.
    const project = withCues({ startMs: 5000, endMs: 7000 });
    const next = withClip(project, setTrim(project.clip, 2000, 30_000, 30_000));
    expect(next.captions[0].startMs).toBe(3000);
    expect(next.captions[0].endMs).toBe(5000);
  });

  it('시작점을 앞으로 되돌리면 자막도 되돌아온다', () => {
    const project = withCues({ startMs: 5000, endMs: 7000 });
    const trimmed = withClip(project, setTrim(project.clip, 2000, 30_000, 30_000));
    const restored = withClip(trimmed, setTrim(trimmed.clip, 0, 30_000, 30_000));
    expect(restored.captions[0].startMs).toBe(5000);
    expect(restored.captions[0].endMs).toBe(7000);
  });

  it('시작점 이동으로 앞으로 밀려난 자막은 경계에서 잘린다', () => {
    const project = withCues({ startMs: 1000, endMs: 5000 });
    const next = withClip(project, setTrim(project.clip, 3000, 30_000, 30_000));
    expect(next.captions[0].startMs).toBe(0);
    expect(next.captions[0].endMs).toBe(2000);
  });

  it('시작점보다 완전히 앞에 있던 자막은 버린다', () => {
    const project = withCues({ startMs: 1000, endMs: 2000 });
    const next = withClip(project, setTrim(project.clip, 5000, 30_000, 30_000));
    expect(next.captions).toHaveLength(0);
  });

  it('끝점만 바꾸면 자막을 밀지 않는다', () => {
    const project = withCues({ startMs: 1000, endMs: 3000 });
    const next = withClip(project, setTrim(project.clip, 0, 8000, 30_000));
    expect(next.captions[0].startMs).toBe(1000);
  });

  it('원본 프로젝트를 변형하지 않는다', () => {
    const project = withCues({ startMs: 5000, endMs: 7000 });
    withClip(project, setTrim(project.clip, 2000, 30_000, 30_000));
    expect(project.captions[0].startMs).toBe(5000);
  });
});

describe('withSourceVolume', () => {
  it('0과 2 사이로 자른다', () => {
    expect(withSourceVolume(createProject(asset()), -1).sourceVolume).toBe(0);
    expect(withSourceVolume(createProject(asset()), 9).sourceVolume).toBe(2);
  });
});

describe('validateAsset', () => {
  it('정상 소스는 통과한다', () => {
    expect(validateAsset(asset())).toBeNull();
  });

  it('길이를 못 읽으면 오류를 낸다', () => {
    expect(validateAsset(asset({ durationMs: Number.NaN }))?.code).toBe('NO_DURATION');
  });

  it('해상도를 못 읽으면 오류를 낸다', () => {
    expect(validateAsset(asset({ width: 0 }))?.code).toBe('NO_DIMENSIONS');
  });

  it('10분 초과는 거부한다', () => {
    expect(validateAsset(asset({ durationMs: 700_000 }))?.code).toBe('TOO_LONG');
  });
});
