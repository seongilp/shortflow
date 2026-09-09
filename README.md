# ShortFlow

브라우저에서 완결되는 유튜브 쇼츠(9:16, 최대 60초) 편집기.
영상이 서버로 올라가지 않는다. 인코딩은 ffmpeg.wasm이 클라이언트에서 수행한다.

## 기능

- 파일 드롭 또는 유튜브 URL로 영상 가져오기
- 트림 (타임라인 핸들 드래그)
- 9:16 리프레임 (확대 / 좌우 / 상하)
- 자막 편집: 큐 추가·삭제, 텍스트 인라인 수정, 시작·종료 시각 조절,
  타임라인 드래그 이동, 화면에서 위치 드래그, 크기·색상·외곽선·배경·정렬
- 원본 음량 조절, 배경음악 트랙
- MP4 1080×1920 H.264/AAC 내보내기

단축키: `Space` 재생/정지 · `←` `→` 0.1초 이동 · `T` 재생 위치에 자막 추가

## 실행

```bash
pnpm install     # postinstall이 ffmpeg 코어를 public/ffmpeg 로 복사한다
pnpm dev
```

`http://localhost:3000`

### 유튜브 가져오기 (선택)

```bash
brew install yt-dlp
```

로컬 개발 환경에서만 동작한다. 배포본에서는 라우트가 비활성화된다 —
데이터센터 IP는 유튜브가 봇으로 차단해서 실패만 하는 기능이 되기 때문이다.

## 명령

```bash
pnpm dev            # 개발 서버
pnpm build          # 프로덕션 빌드
pnpm test           # 유닛 테스트
pnpm sync:ffmpeg    # ffmpeg 코어를 public/ 으로 다시 복사
```

## 구조

```
src/lib/model/     불변 Project/Clip/Caption 모델. DOM 무관, 전부 테스트됨
src/lib/render/    Canvas 자막 렌더러 — 프리뷰와 익스포트가 공유한다
src/lib/preview/   재생 루프와 캔버스 합성
src/lib/export/    ffmpeg argv 생성(순수 함수) + 실행 오케스트레이션
src/lib/import/    소스 영상 메타데이터 조회
src/store/         zustand 에디터 상태
src/components/    UI
```

### 핵심 설계

**프리뷰와 익스포트를 분리한다.** ffmpeg.wasm은 실시간 프리뷰에 못 쓴다.
프리뷰는 `<video>` + Canvas 합성으로 즉각 반응하고, ffmpeg는 내보내기에만 쓴다.

**자막은 `drawtext`가 아니라 PNG 오버레이다.** 프리뷰와 같은 Canvas 렌더러로
자막을 구워 `overlay` 필터에 얹는다. 한글 폰트 주입 문제가 사라지고
화면에서 본 그대로가 결과물에 남는다.

**`buildExportCommand`는 순수 함수다.** 프로젝트 상태 → ffmpeg argv 변환에
부수효과가 없어 wasm 없이 전부 테스트한다. 결함이 가장 몰리는 지점이다.

## 제약

- SharedArrayBuffer가 필요하다. `next.config.ts`가 COOP/COEP 헤더를 내리고
  ffmpeg 코어를 자체 호스팅한다 (COEP 때문에 외부 CDN에서 못 받는다)
- 인코딩 속도는 대략 실시간의 0.5~1배. 60초 영상은 1~2분 걸린다
- 소스 영상은 브라우저가 디코딩할 수 있는 형식이어야 한다

설계 문서: [docs/superpowers/specs/2026-09-09-shortflow-design.md](docs/superpowers/specs/2026-09-09-shortflow-design.md)
