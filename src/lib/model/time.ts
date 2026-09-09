/** 값을 [min, max] 범위로 자른다. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** ffmpeg 인자용 초 단위 문자열. 밀리초 3자리까지 유지한다. */
export function msToSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** UI 표시용 타임코드. 예: 1분 2.34초 -> "01:02.34" */
export function formatTimecode(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/** "01:02.34" 형식을 밀리초로. 형식이 어긋나면 null. */
export function parseTimecode(input: string): number | null {
  const match = /^(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  const [, mm, ss, frac = '0'] = match;
  const seconds = Number(ss);
  if (seconds > 59) return null;
  const fracMs = Number(frac.padEnd(3, '0'));
  return Number(mm) * 60_000 + seconds * 1000 + fracMs;
}
