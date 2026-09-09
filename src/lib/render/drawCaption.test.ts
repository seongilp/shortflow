import { describe, expect, it } from 'vitest';
import { hitTestCaption, measureCaption, wrapCaptionLines } from './drawCaption';
import { createCaption } from '../model/caption';
import type { Caption } from '../model/types';

/** 글자 하나를 10px로 세는 가짜 컨텍스트. 줄바꿈 로직만 검증한다. */
function fakeCtx(charWidth = 10): CanvasRenderingContext2D {
  return {
    font: '',
    measureText: (text: string) => ({ width: text.length * charWidth }),
  } as unknown as CanvasRenderingContext2D;
}

const cue = (text: string, over: Partial<Caption> = {}): Caption => ({
  ...createCaption({ startMs: 0, endMs: 1000, text }),
  ...over,
});

describe('wrapCaptionLines', () => {
  it('폭 안에 들어가면 한 줄로 둔다', () => {
    expect(wrapCaptionLines(fakeCtx(), cue('짧은 자막'), 1000)).toEqual(['짧은 자막']);
  });

  it('사용자가 넣은 줄바꿈을 지킨다', () => {
    expect(wrapCaptionLines(fakeCtx(), cue('첫줄\n둘째줄'), 1000)).toEqual(['첫줄', '둘째줄']);
  });

  it('폭을 넘으면 단어 경계에서 나눈다', () => {
    // 글자당 10px, 폭 100px -> 한 줄에 10글자
    const lines = wrapCaptionLines(fakeCtx(), cue('aaaa bbbb cccc'), 100);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(10));
  });

  it('공백 없는 긴 문자열은 글자 단위로 끊는다', () => {
    const lines = wrapCaptionLines(fakeCtx(), cue('가나다라마바사아자차카타파하'), 50);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(5));
    expect(lines.join('')).toBe('가나다라마바사아자차카타파하');
  });

  it('빈 줄을 보존한다', () => {
    expect(wrapCaptionLines(fakeCtx(), cue('위\n\n아래'), 1000)).toEqual(['위', '', '아래']);
  });
});

describe('measureCaption', () => {
  it('박스를 position 비율 좌표의 중심에 놓는다', () => {
    const caption = cue('테스트');
    const box = measureCaption(fakeCtx(), caption, 1080, 1920);
    expect(box.x + box.width / 2).toBeCloseTo(caption.position.xRatio * 1080, 5);
    expect(box.y + box.height / 2).toBeCloseTo(caption.position.yRatio * 1920, 5);
  });

  it('배경이 없으면 패딩을 더하지 않는다', () => {
    const plain = measureCaption(fakeCtx(), cue('abc'), 1080, 1920);
    expect(plain.width).toBe(30);
  });

  it('배경이 있으면 좌우 패딩만큼 넓어진다', () => {
    const caption = cue('abc');
    const boxed = measureCaption(
      fakeCtx(),
      { ...caption, style: { ...caption.style, backgroundColor: '#000', backgroundPadding: 20 } },
      1080,
      1920,
    );
    expect(boxed.width).toBe(30 + 40);
  });

  it('줄 수만큼 높이가 늘어난다', () => {
    const one = measureCaption(fakeCtx(), cue('a'), 1080, 1920);
    const two = measureCaption(fakeCtx(), cue('a\nb'), 1080, 1920);
    expect(two.height).toBeCloseTo(one.height * 2, 5);
  });
});

describe('hitTestCaption', () => {
  const box = { x: 100, y: 200, width: 300, height: 80, lines: [], lineHeight: 0 };

  it('박스 안의 점을 잡는다', () => {
    expect(hitTestCaption(box, 250, 240)).toBe(true);
  });

  it('박스 밖의 점을 거른다', () => {
    expect(hitTestCaption(box, 50, 240)).toBe(false);
    expect(hitTestCaption(box, 250, 500)).toBe(false);
  });
});
