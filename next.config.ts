import type { NextConfig } from 'next';

/**
 * ffmpeg.wasm 멀티스레드 코어는 SharedArrayBuffer를 요구하고,
 * 그 전제 조건이 cross-origin isolation이다. 두 헤더가 모두 있어야 켜진다.
 */
const crossOriginIsolationHeaders = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: crossOriginIsolationHeaders },
      {
        // 코어 파일은 격리된 문서에서 받아야 하므로 자원 정책을 함께 내린다.
        source: '/ffmpeg/:path*',
        headers: [
          ...crossOriginIsolationHeaders,
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
