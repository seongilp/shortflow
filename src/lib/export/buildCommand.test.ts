import { describe, expect, it } from 'vitest';
import { buildExportCommand, type ExportInputs } from './buildCommand';
import { createProject } from '../model/project';
import { createCaption } from '../model/caption';
import { setTrim } from '../model/clip';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../model/types';
import type { MediaAsset, Project } from '../model/types';

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'a', fileName: 'v.mp4', url: 'blob:v',
  durationMs: 30_000, width: 1920, height: 1080, ...over,
});

const inputs = (over: Partial<ExportInputs> = {}): ExportInputs => ({
  sourceName: 'in.mp4',
  sourceHasAudio: true,
  musicName: null,
  captionPngNames: new Map(),
  outputName: 'out.mp4',
  ...over,
});

/** -filter_complex 뒤의 값을 꺼낸다. */
const filterOf = (argv: string[]) => argv[argv.indexOf('-filter_complex') + 1];

const baseProject = () => createProject(asset());

describe('buildExportCommand — 영상', () => {
  it('트림 구간을 초 단위로 적용한다', () => {
    const project: Project = { ...baseProject(), clip: setTrim(baseProject().clip, 2000, 7500, 30_000) };
    expect(filterOf(buildExportCommand(project, inputs())))
      .toContain('trim=start=2.000:end=7.500');
  });

  it('9:16 캔버스 크기로 크롭한다', () => {
    expect(filterOf(buildExportCommand(baseProject(), inputs())))
      .toContain(`crop=${CANVAS_WIDTH}:${CANVAS_HEIGHT}:`);
  });

  it('출력 파일명과 덮어쓰기 플래그를 마지막에 둔다', () => {
    const argv = buildExportCommand(baseProject(), inputs({ outputName: 'shorts.mp4' }));
    expect(argv.slice(-2)).toEqual(['-y', 'shorts.mp4']);
  });

  it('yuv420p로 고정해 재생 호환성을 지킨다', () => {
    expect(buildExportCommand(baseProject(), inputs())).toContain('yuv420p');
  });
});

describe('buildExportCommand — 자막', () => {
  const withCaptions = () => {
    const a = createCaption({ startMs: 0, endMs: 1500, text: 'a' });
    const b = createCaption({ startMs: 2000, endMs: 4000, text: 'b' });
    return { project: { ...baseProject(), captions: [a, b] }, a, b };
  };

  it('큐마다 overlay를 체인으로 잇는다', () => {
    const { project, a, b } = withCaptions();
    const names = new Map([[a.id, 'c0.png'], [b.id, 'c1.png']]);
    const filter = filterOf(buildExportCommand(project, inputs({ captionPngNames: names })));
    expect(filter).toContain('[v0][1:v]overlay=0:0');
    expect(filter).toContain('[v1][2:v]overlay=0:0');
  });

  it('표시 구간을 enable 식으로 넣는다', () => {
    const { project, a, b } = withCaptions();
    const names = new Map([[a.id, 'c0.png'], [b.id, 'c1.png']]);
    const filter = filterOf(buildExportCommand(project, inputs({ captionPngNames: names })));
    expect(filter).toContain("between(t,2.000,4.000)");
  });

  it('PNG가 없는 큐를 건너뛰어도 입력 인덱스가 어긋나지 않는다', () => {
    const { project, b } = withCaptions();
    const names = new Map([[b.id, 'only.png']]);
    const argv = buildExportCommand(project, inputs({ captionPngNames: names }));
    expect(argv.filter((arg) => arg === '-i')).toHaveLength(2);
    expect(filterOf(argv)).toContain('[v0][1:v]overlay=0:0');
    expect(filterOf(argv)).not.toContain('[2:v]');
  });

  it('BGM이 있으면 자막 입력이 인덱스 2부터 시작한다', () => {
    const { project, a } = withCaptions();
    const music = { asset: asset({ id: 'm' }), volume: 0.5, startMs: 0 };
    const argv = buildExportCommand(
      { ...project, music },
      inputs({ musicName: 'bgm.mp3', captionPngNames: new Map([[a.id, 'c0.png']]) }),
    );
    expect(filterOf(argv)).toContain('[v0][2:v]overlay=0:0');
  });

  it('자막이 없으면 원본 영상 라벨을 그대로 매핑한다', () => {
    const argv = buildExportCommand(baseProject(), inputs());
    expect(argv[argv.indexOf('-map') + 1]).toBe('[v0]');
  });
});

describe('buildExportCommand — 오디오', () => {
  it('소스 볼륨을 적용한다', () => {
    const project = { ...baseProject(), sourceVolume: 0.4 };
    expect(filterOf(buildExportCommand(project, inputs()))).toContain('volume=0.400');
  });

  it('BGM이 있으면 amix로 섞는다', () => {
    const music = { asset: asset({ id: 'm' }), volume: 0.3, startMs: 500 };
    const filter = filterOf(
      buildExportCommand({ ...baseProject(), music }, inputs({ musicName: 'bgm.mp3' })),
    );
    expect(filter).toContain('amix=inputs=2');
    expect(filter).toContain('adelay=500|500');
  });

  it('무음 소스에 BGM만 있으면 BGM을 오디오 트랙으로 쓴다', () => {
    const music = { asset: asset({ id: 'm' }), volume: 1, startMs: 0 };
    const argv = buildExportCommand(
      { ...baseProject(), music },
      inputs({ sourceHasAudio: false, musicName: 'bgm.mp3' }),
    );
    expect(filterOf(argv)).not.toContain('[0:a]');
    expect(argv).toContain('aac');
  });

  it('오디오가 전혀 없으면 -an으로 무음 출력한다', () => {
    const argv = buildExportCommand(baseProject(), inputs({ sourceHasAudio: false }));
    expect(argv).toContain('-an');
    expect(argv).not.toContain('aac');
    expect(filterOf(argv)).not.toContain('[0:a]');
  });
});
