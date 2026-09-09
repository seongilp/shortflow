import { describe, expect, it } from 'vitest';
import {
  MIN_CAPTION_MS,
  addCaption,
  captionsAt,
  createCaption,
  defaultCaptionRange,
  removeCaption,
  retimeCaption,
  shiftCaption,
  sortCaptions,
  updateCaption,
} from './caption';

const cue = (startMs: number, endMs: number, text = 'hi') =>
  createCaption({ startMs, endMs, text });

describe('createCaption', () => {
  it('최소 길이를 밑도는 구간을 늘려준다', () => {
    const caption = createCaption({ startMs: 1000, endMs: 1050 });
    expect(caption.endMs - caption.startMs).toBe(MIN_CAPTION_MS);
  });

  it('음수 시작을 0으로 자른다', () => {
    expect(createCaption({ startMs: -500, endMs: 1000 }).startMs).toBe(0);
  });

  it('스타일 일부만 덮어쓸 수 있다', () => {
    const caption = createCaption({ startMs: 0, endMs: 1000, style: { fontSize: 40 } });
    expect(caption.style.fontSize).toBe(40);
    expect(caption.style.color).toBe('#ffffff');
  });
});

describe('addCaption / removeCaption', () => {
  it('입력 배열을 변형하지 않는다', () => {
    const original = [cue(0, 1000)];
    const next = addCaption(original, cue(2000, 3000));
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });

  it('추가 후에도 시작 시각 순으로 정렬된다', () => {
    const next = addCaption([cue(2000, 3000)], cue(500, 1000));
    expect(next.map((c) => c.startMs)).toEqual([500, 2000]);
  });

  it('없는 id를 지우면 그대로 둔다', () => {
    const captions = [cue(0, 1000)];
    expect(removeCaption(captions, 'nope')).toHaveLength(1);
  });
});

describe('sortCaptions', () => {
  it('시작이 같으면 종료 시각으로 가른다', () => {
    const sorted = sortCaptions([cue(0, 3000), cue(0, 1000)]);
    expect(sorted.map((c) => c.endMs)).toEqual([1000, 3000]);
  });
});

describe('updateCaption', () => {
  it('텍스트만 바꾸고 나머지는 보존한다', () => {
    const caption = cue(0, 1000);
    const [next] = updateCaption([caption], caption.id, { text: '안녕' });
    expect(next.text).toBe('안녕');
    expect(next.startMs).toBe(0);
    expect(next.style).toBe(caption.style);
  });

  it('스타일은 병합한다', () => {
    const caption = cue(0, 1000);
    const [next] = updateCaption([caption], caption.id, { style: { color: '#ff0000' } });
    expect(next.style.color).toBe('#ff0000');
    expect(next.style.fontSize).toBe(caption.style.fontSize);
  });

  it('원본 객체를 변형하지 않는다', () => {
    const caption = cue(0, 1000);
    updateCaption([caption], caption.id, { text: '변경' });
    expect(caption.text).toBe('hi');
  });
});

describe('retimeCaption', () => {
  it('클립 길이를 넘지 않게 자른다', () => {
    const caption = cue(0, 1000);
    const [next] = retimeCaption([caption], caption.id, 4000, 9000, 5000);
    expect(next.endMs).toBe(5000);
    expect(next.startMs).toBeLessThan(next.endMs);
  });

  it('종료가 시작보다 앞서면 최소 길이를 확보한다', () => {
    const caption = cue(0, 1000);
    const [next] = retimeCaption([caption], caption.id, 2000, 500, 10_000);
    expect(next.endMs).toBe(2000 + MIN_CAPTION_MS);
  });
});

describe('shiftCaption', () => {
  it('길이를 유지한 채 이동한다', () => {
    const caption = cue(1000, 3000);
    const [next] = shiftCaption([caption], caption.id, 5000, 20_000);
    expect(next.startMs).toBe(5000);
    expect(next.endMs).toBe(7000);
  });

  it('끝을 넘어가면 길이를 지키며 되민다', () => {
    const caption = cue(1000, 3000);
    const [next] = shiftCaption([caption], caption.id, 9500, 10_000);
    expect(next.startMs).toBe(8000);
    expect(next.endMs).toBe(10_000);
  });
});

describe('captionsAt', () => {
  it('시작은 포함하고 종료는 제외한다', () => {
    const caption = cue(1000, 2000);
    expect(captionsAt([caption], 1000)).toHaveLength(1);
    expect(captionsAt([caption], 1999)).toHaveLength(1);
    expect(captionsAt([caption], 2000)).toHaveLength(0);
  });

  it('겹치는 큐를 모두 낸다', () => {
    expect(captionsAt([cue(0, 3000), cue(1000, 2000)], 1500)).toHaveLength(2);
  });
});

describe('defaultCaptionRange', () => {
  it('재생 헤드에서 2초를 기본으로 잡는다', () => {
    expect(defaultCaptionRange(1000, 30_000)).toEqual({ startMs: 1000, endMs: 3000 });
  });

  it('클립 끝에서도 최소 길이를 확보한다', () => {
    const range = defaultCaptionRange(9990, 10_000);
    expect(range.endMs - range.startMs).toBeGreaterThanOrEqual(MIN_CAPTION_MS);
    expect(range.startMs).toBeLessThanOrEqual(10_000 - MIN_CAPTION_MS);
  });
});
