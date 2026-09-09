import type { Caption, Project } from '../model/types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../model/types';
import { clipDurationMs, computeScaleCrop } from '../model/clip';
import { msToSeconds } from '../model/time';

/** 익스포트 화질 프리셋. crf가 낮을수록 고화질·큰 용량. */
export interface EncodeSettings {
  readonly crf: number;
  readonly preset: string;
  readonly audioBitrate: string;
  readonly fps: number;
}

export const DEFAULT_ENCODE: EncodeSettings = {
  crf: 23,
  preset: 'veryfast',
  audioBitrate: '128k',
  fps: 30,
};

/** ffmpeg 가상 파일시스템에 올라간 파일들. */
export interface ExportInputs {
  readonly sourceName: string;
  /** 소스에 오디오 스트림이 없으면 [0:a] 참조가 실패하므로 미리 알아야 한다. */
  readonly sourceHasAudio: boolean;
  readonly musicName: string | null;
  /** 자막 큐 id → PNG 파일명. 빈 텍스트 등으로 굽지 않은 큐는 빠진다. */
  readonly captionPngNames: ReadonlyMap<string, string>;
  readonly outputName: string;
}

/** ffmpeg 필터 인자에서 구분자로 해석되는 문자를 막는다. */
function escapeFilterValue(value: string): string {
  return value.replace(/[\\':]/g, (char) => `\\${char}`);
}

/** 실제로 입력에 추가될 자막만, 입력 순서대로 골라낸다. */
function renderableCaptions(
  captions: readonly Caption[],
  captionPngNames: ReadonlyMap<string, string>,
): readonly { caption: Caption; pngName: string }[] {
  return captions.flatMap((caption) => {
    const pngName = captionPngNames.get(caption.id);
    return pngName ? [{ caption, pngName }] : [];
  });
}

function captionOverlayChain(
  entries: readonly { caption: Caption; pngName: string }[],
  firstCaptionInputIndex: number,
  videoLabel: string,
): { filters: string[]; outLabel: string } {
  const filters: string[] = [];
  let current = videoLabel;

  entries.forEach(({ caption }, order) => {
    // PNG는 캔버스 전체 크기로 구워지므로 위치는 0:0 고정이다.
    const next = `[v${order + 1}]`;
    const enable = escapeFilterValue(
      `between(t,${msToSeconds(caption.startMs)},${msToSeconds(caption.endMs)})`,
    );
    const inputIndex = firstCaptionInputIndex + order;
    filters.push(`${current}[${inputIndex}:v]overlay=0:0:enable='${enable}'${next}`);
    current = next;
  });

  return { filters, outLabel: current };
}

function audioFilters(
  project: Project,
  inputs: ExportInputs,
): { filters: string[]; outLabel: string | null } {
  const durationSec = msToSeconds(clipDurationMs(project.clip));
  const hasMusic = Boolean(project.music && inputs.musicName);

  // 소스도 BGM도 없으면 무음 영상으로 내보낸다.
  if (!inputs.sourceHasAudio && !hasMusic) {
    return { filters: [], outLabel: null };
  }

  const musicChain = (label: string) => {
    const music = project.music!;
    const delayMs = Math.max(0, Math.round(music.startMs));
    return (
      `[1:a]adelay=${delayMs}|${delayMs},atrim=end=${durationSec},asetpts=PTS-STARTPTS,` +
      `volume=${music.volume.toFixed(3)}${label}`
    );
  };

  // 소스가 무음이면 BGM만 그대로 오디오 트랙으로 쓴다.
  if (!inputs.sourceHasAudio) {
    return { filters: [musicChain('[aout]')], outLabel: '[aout]' };
  }

  const sourceChain =
    `[0:a]atrim=start=${msToSeconds(project.clip.inMs)}:end=${msToSeconds(project.clip.outMs)},` +
    `asetpts=PTS-STARTPTS,volume=${project.sourceVolume.toFixed(3)}[a0]`;

  if (!hasMusic) {
    return { filters: [sourceChain], outLabel: '[a0]' };
  }

  // 두 트랙을 섞으면 피크가 튈 수 있어 리미터로 클리핑을 막는다.
  const mix =
    `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]`;
  return { filters: [sourceChain, musicChain('[a1]'), mix], outLabel: '[aout]' };
}

/**
 * 프로젝트 상태를 ffmpeg 인자 배열로 옮긴다. 순수 함수이므로 WASM 없이 검증할 수 있다.
 * 이 앱에서 결함이 가장 몰리는 지점이라 테스트로 고정한다.
 */
export function buildExportCommand(
  project: Project,
  inputs: ExportInputs,
  encode: EncodeSettings = DEFAULT_ENCODE,
): string[] {
  const { source, clip, captions } = project;
  const crop = computeScaleCrop(source, clip.transform);
  const entries = renderableCaptions(captions, inputs.captionPngNames);
  const firstCaptionInputIndex = inputs.musicName ? 2 : 1;

  const videoTrim =
    `[0:v]trim=start=${msToSeconds(clip.inMs)}:end=${msToSeconds(clip.outMs)},` +
    `setpts=PTS-STARTPTS,fps=${encode.fps},` +
    `scale=${crop.scaledWidth}:${crop.scaledHeight},` +
    `crop=${CANVAS_WIDTH}:${CANVAS_HEIGHT}:${crop.cropX}:${crop.cropY}[v0]`;

  const overlay = captionOverlayChain(entries, firstCaptionInputIndex, '[v0]');
  const audio = audioFilters(project, inputs);
  const filterComplex = [videoTrim, ...overlay.filters, ...audio.filters].join(';');

  return [
    '-i', inputs.sourceName,
    ...(inputs.musicName ? ['-i', inputs.musicName] : []),
    ...entries.flatMap(({ pngName }) => ['-i', pngName]),
    '-filter_complex', filterComplex,
    '-map', overlay.outLabel,
    ...(audio.outLabel ? ['-map', audio.outLabel] : ['-an']),
    '-c:v', 'libx264',
    '-preset', encode.preset,
    '-crf', String(encode.crf),
    '-pix_fmt', 'yuv420p',
    ...(audio.outLabel ? ['-c:a', 'aac', '-b:a', encode.audioBitrate] : []),
    '-movflags', '+faststart',
    '-y', inputs.outputName,
  ];
}
