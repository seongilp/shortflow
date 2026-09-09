import { nanoid } from 'nanoid';
import type { MediaAsset } from '@/lib/model/types';

export interface ProbeResult {
  readonly asset: MediaAsset;
}

const METADATA_TIMEOUT_MS = 20_000;
const DURATION_TIMEOUT_MS = 10_000;

/** 끝으로 강제 이동시킬 때 쓰는 값. 실제 길이보다 크기만 하면 된다. */
const SEEK_TO_END = 1e101;

/**
 * <video> 메타데이터로 소스를 훑는다. ffmpeg를 띄우지 않고 해상도·길이를 얻기 위함이다.
 * 브라우저가 디코딩하지 못하는 형식은 여기서 실패하므로 임포트 검증 지점이기도 하다.
 */
export function probeVideo(url: string, fileName: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('영상 정보를 읽는 데 너무 오래 걸립니다. 다른 파일을 시도해 주세요.'));
    }, METADATA_TIMEOUT_MS);

    video.onloadedmetadata = async () => {
      window.clearTimeout(timeout);
      try {
        const durationMs = Math.round((await resolveDurationSeconds(video)) * 1000);
        resolve({
          asset: {
            id: nanoid(),
            fileName,
            url,
            durationMs,
            width: video.videoWidth,
            height: video.videoHeight,
          },
        });
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    };

    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('영상을 열지 못했습니다. 브라우저가 지원하지 않는 코덱일 수 있습니다.'));
    };

    video.src = url;
  });
}

/**
 * 영상 길이를 초 단위로 얻는다.
 *
 * 스트리밍용으로 만들어진 파일은 컨테이너 헤더에 길이가 없다.
 * 화면 녹화(MediaRecorder), 라이브 모드로 먹싱된 WebM, 조각화된 MP4가 그렇고,
 * 이 경우 loadedmetadata 시점의 duration은 Infinity다.
 * 끝으로 강제 탐색하면 브라우저가 실제 길이를 확정해 durationchange를 쏜다.
 */
function resolveDurationSeconds(video: HTMLVideoElement): Promise<number> {
  if (isUsableDuration(video.duration)) {
    return Promise.resolve(video.duration);
  }

  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      window.clearTimeout(timer);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('seeked', onDurationChange);
      fn();
    };

    const onDurationChange = () => {
      if (!isUsableDuration(video.duration)) return;
      const seconds = video.duration;
      finish(() => {
        // 탐색해둔 재생 위치를 되돌려야 이후 프리뷰가 첫 프레임부터 시작한다.
        video.currentTime = 0;
        resolve(seconds);
      });
    };

    const timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            '영상 길이를 읽지 못했습니다. 다른 형식으로 변환한 뒤 다시 시도해 주세요.',
          ),
        ),
      );
    }, DURATION_TIMEOUT_MS);

    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('seeked', onDurationChange);
    video.currentTime = SEEK_TO_END;
  });
}

function isUsableDuration(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0;
}
