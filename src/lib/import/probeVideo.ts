import { nanoid } from 'nanoid';
import type { MediaAsset } from '@/lib/model/types';

export interface ProbeResult {
  readonly asset: MediaAsset;
}

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
    }, 20_000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const asset: MediaAsset = {
        id: nanoid(),
        fileName,
        url,
        durationMs: Math.round(video.duration * 1000),
        width: video.videoWidth,
        height: video.videoHeight,
      };
      resolve({ asset });
      cleanup();
    };

    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('영상을 열지 못했습니다. 브라우저가 지원하지 않는 코덱일 수 있습니다.'));
    };

    video.src = url;
  });
}
