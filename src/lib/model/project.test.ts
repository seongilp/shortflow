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
  it('트림으로 짧아지면 자막도 함께 정리한다', () => {
    const base = createProject(asset());
    const project = { ...base, captions: [createCaption({ startMs: 20_000, endMs: 22_000 })] };
    const next = withClip(project, setTrim(project.clip, 0, 10_000, 30_000));
    expect(next.captions).toHaveLength(0);
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
