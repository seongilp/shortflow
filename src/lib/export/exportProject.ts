import { fetchFile } from '@ffmpeg/util';
import type { Project } from '../model/types';
import { clipDurationMs } from '../model/clip';
import { captionToPng, isRenderableCaption } from '../render/captionToPng';
import { DEFAULT_ENCODE, buildExportCommand, type EncodeSettings, type ExportInputs } from './buildCommand';
import { FFmpegLoadError, getFFmpeg } from './ffmpegClient';

export type ExportPhase = 'loading' | 'preparing' | 'encoding' | 'finishing';

export interface ExportProgress {
  readonly phase: ExportPhase;
  /** 0..1. 인코딩 단계에서만 의미 있는 값이 들어온다. */
  readonly ratio: number;
}

export interface ExportOptions {
  readonly sourceFile: Blob;
  readonly sourceHasAudio: boolean;
  readonly musicFile?: Blob | null;
  readonly encode?: EncodeSettings;
  readonly onProgress?: (progress: ExportProgress) => void;
  readonly onLog?: (line: string) => void;
  readonly signal?: AbortSignal;
}

export class ExportError extends Error {
  constructor(message: string, readonly logs: readonly string[] = []) {
    super(message);
    this.name = 'ExportError';
  }
}

const SOURCE_NAME = 'source.input';
const MUSIC_NAME = 'music.input';
const OUTPUT_NAME = 'shortflow-output.mp4';

/**
 * 자막 PNG 굽기 → 가상 FS 주입 → 인코딩 → 결과 Blob 회수까지의 오케스트레이션.
 * 실행 중 stderr 로그를 모아 실패 시 원인 추적에 쓴다.
 */
export async function exportProject(
  project: Project,
  options: ExportOptions,
): Promise<Blob> {
  const { onProgress, onLog, signal } = options;
  const logs: string[] = [];
  const collectLog = (line: string) => {
    // 로그가 무한정 쌓이지 않도록 최근 분량만 남긴다.
    logs.push(line);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    onLog?.(line);
  };

  onProgress?.({ phase: 'loading', ratio: 0 });
  const ffmpeg = await getFFmpeg(collectLog).catch((error) => {
    if (error instanceof FFmpegLoadError) throw new ExportError(error.message, logs);
    throw error;
  });

  const written: string[] = [];
  const durationSec = clipDurationMs(project.clip) / 1000;

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.({ phase: 'encoding', ratio: Math.min(Math.max(progress, 0), 1) });
  };
  ffmpeg.on('progress', handleProgress);

  try {
    onProgress?.({ phase: 'preparing', ratio: 0 });
    throwIfAborted(signal);

    await ffmpeg.writeFile(SOURCE_NAME, await fetchFile(options.sourceFile));
    written.push(SOURCE_NAME);

    const musicName = options.musicFile ? MUSIC_NAME : null;
    if (options.musicFile) {
      await ffmpeg.writeFile(MUSIC_NAME, await fetchFile(options.musicFile));
      written.push(MUSIC_NAME);
    }

    const captionPngNames = new Map<string, string>();
    const renderable = project.captions.filter(isRenderableCaption);
    for (const [index, caption] of renderable.entries()) {
      throwIfAborted(signal);
      const name = `caption-${index}.png`;
      await ffmpeg.writeFile(name, await captionToPng(caption));
      written.push(name);
      captionPngNames.set(caption.id, name);
    }

    const inputs: ExportInputs = {
      sourceName: SOURCE_NAME,
      sourceHasAudio: options.sourceHasAudio,
      musicName,
      captionPngNames,
      outputName: OUTPUT_NAME,
    };

    onProgress?.({ phase: 'encoding', ratio: 0 });
    throwIfAborted(signal);

    const argv = buildExportCommand(project, inputs, options.encode ?? DEFAULT_ENCODE);
    const code = await ffmpeg.exec(argv);
    if (code !== 0) {
      throw new ExportError(
        `인코딩에 실패했습니다 (종료 코드 ${code}). 자세한 내용은 로그를 확인하세요.`,
        logs,
      );
    }

    onProgress?.({ phase: 'finishing', ratio: 1 });
    const data = await ffmpeg.readFile(OUTPUT_NAME);
    written.push(OUTPUT_NAME);

    if (typeof data === 'string') {
      throw new ExportError('인코딩 결과를 이진 데이터로 읽지 못했습니다.', logs);
    }
    // durationSec은 실패 로그 맥락용으로만 남긴다.
    void durationSec;
    return new Blob([data as BlobPart], { type: 'video/mp4' });
  } catch (error) {
    if (error instanceof ExportError) throw error;
    if (isAbortError(error)) throw error;
    throw new ExportError(
      error instanceof Error ? error.message : '알 수 없는 오류로 익스포트에 실패했습니다.',
      logs,
    );
  } finally {
    ffmpeg.off('progress', handleProgress);
    // 가상 FS에 남은 파일은 다음 익스포트의 메모리를 갉아먹으므로 반드시 지운다.
    await Promise.all(
      written.map((name) => ffmpeg.deleteFile(name).catch(() => undefined)),
    );
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('익스포트가 취소되었습니다.', 'AbortError');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
