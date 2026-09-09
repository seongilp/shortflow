/**
 * 자막 폰트 패밀리를 한 곳에서 정한다.
 * 프리뷰 캔버스와 익스포트용 PNG가 같은 값을 써야 결과가 어긋나지 않는다.
 */
const FALLBACK = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

let cached: string | null = null;

/** 레이아웃이 심어둔 CSS 변수에서 실제 로드된 폰트 패밀리를 읽는다. */
export function captionFontFamily(): string {
  if (cached) return cached;
  if (typeof document === 'undefined') return FALLBACK;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-caption')
    .trim();

  cached = value ? `${value}, ${FALLBACK}` : FALLBACK;
  return cached;
}

/**
 * 폰트가 로드되기 전에 캔버스에 그리면 대체 폰트로 그려져 익스포트 결과가 달라진다.
 * 익스포트 직전에 반드시 기다린다.
 */
export async function waitForCaptionFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await document.fonts.ready;
}
