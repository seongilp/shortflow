import { describe, expect, it } from 'vitest';
import { clamp, formatTimecode, msToSeconds, parseTimecode } from './time';

describe('clamp', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('범위를 벗어나면 경계로 자른다', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('NaN은 최솟값으로 대체한다', () => {
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });
});

describe('msToSeconds', () => {
  it('밀리초 3자리까지 유지한다', () => {
    expect(msToSeconds(1234)).toBe('1.234');
    expect(msToSeconds(0)).toBe('0.000');
  });
});

describe('formatTimecode', () => {
  it('분:초.센티초로 변환한다', () => {
    expect(formatTimecode(62_340)).toBe('01:02.34');
    expect(formatTimecode(0)).toBe('00:00.00');
  });

  it('음수는 0으로 다룬다', () => {
    expect(formatTimecode(-100)).toBe('00:00.00');
  });
});

describe('parseTimecode', () => {
  it('formatTimecode의 역변환이다', () => {
    expect(parseTimecode('01:02.34')).toBe(62_340);
    expect(parseTimecode('00:00.00')).toBe(0);
  });

  it('센티초를 생략해도 받는다', () => {
    expect(parseTimecode('1:05')).toBe(65_000);
  });

  it('형식이 어긋나면 null을 낸다', () => {
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:75')).toBeNull();
    expect(parseTimecode('')).toBeNull();
  });
});
