# ShortFlow — YouTube Shorts 편집기 설계

날짜: 2026-09-09
상태: 승인됨

## 목적

브라우저에서 완결되는 유튜브 쇼츠(9:16, 최대 60초) 편집기. 서버 업로드 없이
로컬 영상을 불러와 트림·리프레임·자막 작업을 하고 MP4로 내보낸다.
인코딩은 ffmpeg.wasm으로 클라이언트에서 수행한다.

## 핵심 설계 결정

### 1. 프리뷰와 익스포트의 렌더러 분리

ffmpeg.wasm은 실시간 프리뷰에 부적합하다(인코딩 속도 0.3~1x 실시간).
따라서 두 개의 독립된 렌더러가 동일한 `Project` 상태를 각자 해석한다.

- **프리뷰 렌더러**: `<video>` 엘리먼트 + Canvas 2D 합성 + `requestAnimationFrame` 루프.
  즉각 반응하며 편집 중 유일하게 동작하는 경로.
- **익스포트 렌더러**: ffmpeg.wasm Worker에서 1회 실행. 진행률을 UI에 보고.

두 렌더러는 `lib/render/`의 동일한 오버레이 드로잉 함수를 공유하므로
프리뷰 화면과 결과물이 일치한다.

### 2. 자막은 drawtext가 아닌 PNG 오버레이

ffmpeg `drawtext` 필터는 한글 폰트 파일을 WASM 파일시스템에 주입해야 하고,
자간·외곽선·배경 박스 스타일이 Canvas 프리뷰와 미세하게 어긋난다.

대신 프리뷰와 **동일한 Canvas 렌더러**로 각 자막 큐를 투명 PNG로 굽고,
ffmpeg에 추가 입력으로 넣어 `overlay` 필터 + `enable='between(t,start,end)'`로
합성한다. WYSIWYG가 구조적으로 보장되고 폰트 로딩 문제가 사라진다.

### 3. 익스포트 커맨드 빌더는 순수 함수

`buildExportCommand(project, assets) → string[]`

부수효과 없이 프로젝트 상태를 ffmpeg 인자 배열로 변환한다.
WASM 없이 전부 유닛 테스트가 가능하며, 이 앱에서 결함 밀도가 가장 높은
지점이므로 TDD로 작성한다.

## 데이터 모델

모든 조작 함수는 불변이다. 입력을 변형하지 않고 새 객체를 반환한다.

```
Project {
  id, name
  canvas: { width: 1080, height: 1920 }
  source: MediaAsset        // 원본 영상
  clip: Clip                // v1은 단일 클립
  captions: Caption[]
  music: MusicTrack | null
  sourceVolume: number      // 0..1
}

MediaAsset { id, fileName, url, durationMs, width, height }

Clip {
  inMs, outMs               // 원본 기준 트림 구간
  transform: { scale, offsetX, offsetY }   // 9:16 리프레임
}

Caption {
  id, text
  startMs, endMs            // 타임라인(트림 후) 기준
  position: { xRatio, yRatio }
  style: CaptionStyle
}

CaptionStyle {
  fontSize, fontWeight, color,
  strokeColor, strokeWidth,
  backgroundColor, backgroundPadding,
  align
}

MusicTrack { assetId, url, volume, startMs }
```

## 모듈 구조

```
src/lib/model/        타입 정의 + 불변 조작 함수 (DOM 무관)
  project.ts          프로젝트 생성/갱신
  clip.ts             트림, 리프레임 변환
  caption.ts          자막 큐 추가/수정/삭제/정렬/충돌 검사
  time.ts             시간 변환 유틸 (ms ↔ 타임코드)

src/lib/render/       Canvas 드로잉 — 프리뷰와 익스포트가 공유
  drawCaption.ts      단일 자막을 CanvasRenderingContext2D에 그림
  captionToPng.ts     자막 큐를 투명 PNG Blob으로 굽기
  layout.ts           소스 영상 → 9:16 캔버스 배치 계산

src/lib/export/
  buildCommand.ts     순수 함수: Project → ffmpeg argv
  ffmpegClient.ts     ffmpeg.wasm 로드/실행/진행률 (싱글턴)
  exportProject.ts    PNG 굽기 → FS 주입 → 실행 → Blob 반환 오케스트레이션

src/lib/preview/
  usePlayback.ts      rAF 재생 루프, 현재 시각 상태
  compositor.ts       video 프레임 + 오버레이를 캔버스에 합성

src/store/            zustand 스토어 (모델 함수를 호출만 함)

src/components/
  Player/             9:16 프리뷰 캔버스 + 재생 컨트롤
  Timeline/           트림 핸들, 재생 헤드, 자막 큐 트랙
  CaptionEditor/      자막 큐 목록, 인라인 텍스트 편집, 시간 조절, 스타일 패널
  Inspector/          리프레임·볼륨·BGM 설정
  ExportDialog/       익스포트 진행률 및 다운로드
```

## 기능 범위

### v1 포함
- 파일 드롭으로 영상 임포트
- 트림 (시작/종료 지점)
- 9:16 리프레임 (팬 / 줌)
- 자막 편집: 큐 추가·삭제, 텍스트 인라인 수정, 시작/종료 시각 조절,
  타임라인 트랙에서 드래그 이동, 스타일(폰트 크기·색상·외곽선·배경) 편집,
  화면상 위치 드래그
- 원본 오디오 볼륨 조절, BGM 트랙 1개
- MP4 1080×1920 H.264/AAC 익스포트

### v1 제외 (YAGNI)
다중 소스 영상 합치기, 트랜지션, 필터/LUT, 자동 자막(STT),
키프레임 애니메이션, 클라우드 저장, 프로젝트 영속화

## 익스포트 파이프라인

1. 각 자막 큐를 `captionToPng`로 투명 PNG 생성 (캔버스 전체 크기)
2. ffmpeg 가상 FS에 원본 영상, BGM, 자막 PNG들을 write
3. 소스의 오디오 스트림 유무를 ffmpeg로 실측
4. `buildExportCommand`로 argv 생성
   - `trim`/`setpts`로 클립 구간 추출
   - `crop` 후 `scale`로 9:16 리프레임 적용
   - 자막 PNG마다 `overlay=enable='between(t,s,e)'` 체인
   - 오디오는 `volume` + `amix`(BGM 있을 때)
   - `libx264 -preset veryfast -crf 23`, `aac 128k`, `+faststart`
5. 실행하며 진행률과 마지막 로그 한 줄을 UI에 반영
6. 결과 파일을 Blob으로 읽어 다운로드 링크 생성. 가상 FS의 임시 파일은 반드시 정리

### 브라우저 실측으로 확인한 제약

세 가지는 문서로 유추할 수 없고 실제로 돌려봐야 드러났다. 되돌리면 다시 깨진다.

**크롭을 스케일보다 먼저 한다.** 반대 순서는 결과가 같지만, 1920×1080 소스를
9:16에 맞출 때 프레임을 3413×1920까지 키운 뒤 대부분을 버린다. 프레임당 6.5MP를
처리하게 되어 wasm에서 인코딩이 끝나지 않는 수준으로 느려졌다.

**스레드를 전역·필터·인코더 세 군데 모두 1로 묶는다.** ffmpeg.wasm 멀티스레드
코어의 pthread 풀은 크기가 고정이다. libx264가 스레드를 여러 개 요구하면 풀이
말라 `exec`가 오류도 로그도 없이 교착된다. 어느 한 곳이라도 빠지면 재발한다.

**오디오 스트림 유무는 ffmpeg에 묻는다.** 브라우저에는 신뢰할 만한 판별 수단이
없다. Chromium의 `webkitAudioDecodedByteCount`는 재생 전까지 0이라 소리 있는
영상을 무음으로 오판하고, `audioTracks`는 기본 비활성이다. 잘못 판단하면 소리가
조용히 사라진다.

## 유튜브 URL 가져오기

yt-dlp는 네이티브 바이너리라 브라우저에서 돌지 않아 서버 경유가 필요하다.
`POST /api/import/youtube`가 `child_process`로 yt-dlp를 실행하고 MP4를 스트리밍한다.

배포 환경에서는 비활성화한다. 데이터센터 IP는 유튜브가 봇으로 차단하므로
production에서 열어두면 실패만 하는 기능이 된다. URL은 Zod로 검증해 유튜브
호스트만 통과시키고, 인자 배열로 넘겨 셸 해석을 거치지 않는다.

## 오류 처리

- **임포트**: 코덱/컨테이너 미지원, 60초 초과, 파일 크기 상한 초과를 임포트 시점에 검증하고
  사용자 문구로 안내한다. `<video>` 메타데이터 로드 실패도 여기서 잡는다.
- **ffmpeg 로드 실패**: SharedArrayBuffer 미지원(헤더 누락/브라우저 제약) 시 원인을 명시.
- **익스포트 실패**: ffmpeg stderr 로그를 수집해 개발자용 상세 로그와 사용자용 요약을 분리.
- **메모리**: 60초/1080p 상한을 강제해 WASM 힙 초과를 예방한다.
- 어떤 경로에서도 오류를 조용히 삼키지 않는다.

## 테스트 전략

- **유닛 (Vitest)**: `lib/model/*` 전체, `lib/export/buildCommand.ts`,
  `lib/render/layout.ts`. DOM·WASM 의존이 없어 빠르게 돌아간다. TDD로 작성.
- **통합**: 짧은 샘플 영상으로 `exportProject`를 실행해 유효한 MP4가 나오는지 확인.
- **E2E**: 임포트 → 트림 → 자막 추가 → 익스포트 다운로드까지의 핵심 흐름.

## 인프라 제약

ffmpeg.wasm 멀티스레드 코어는 `SharedArrayBuffer`를 요구하므로
`next.config.ts`에서 모든 경로에 COOP/COEP 헤더를 설정한다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

ffmpeg 코어 파일은 `public/ffmpeg/`에 자체 호스팅한다.
CDN 사용 시 COEP 때문에 차단되기 때문이다.

## 스택

Next.js App Router (전 컴포넌트 클라이언트, 서버 기능 미사용),
TypeScript, Tailwind CSS v4, zustand, Vitest.
