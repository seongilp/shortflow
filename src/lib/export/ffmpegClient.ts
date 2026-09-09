import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/** 자체 호스팅 경로. COEP 때문에 외부 CDN에서는 코어를 받을 수 없다. */
const CORE_BASE = '/ffmpeg';

export class FFmpegLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FFmpegLoadError';
  }
}

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/** 브라우저가 멀티스레드 코어를 돌릴 수 있는지. 헤더 설정이 빠지면 false가 된다. */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
}

/**
 * ffmpeg.wasm 싱글턴. 코어 로딩은 수십 MB라 한 번만 수행하고 재사용한다.
 * 동시에 여러 번 호출돼도 같은 Promise를 공유한다.
 */
export function getFFmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    if (!isSharedArrayBufferAvailable()) {
      throw new FFmpegLoadError(
        '브라우저가 SharedArrayBuffer를 쓸 수 없습니다. ' +
          'COOP/COEP 헤더가 적용된 상태로 페이지를 새로 여세요.',
      );
    }

    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
    } catch (error) {
      loading = null;
      throw new FFmpegLoadError(
        'ffmpeg 코어를 불러오지 못했습니다. public/ffmpeg 아래 코어 파일이 있는지 확인하세요.',
        error,
      );
    }

    instance = ffmpeg;
    return ffmpeg;
  })();

  return loading;
}

/** 테스트와 오류 복구용. 다음 호출에서 코어를 다시 로드한다. */
export function resetFFmpeg(): void {
  instance = null;
  loading = null;
}
