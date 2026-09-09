import type { Caption } from '../model/types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../model/types';

/**
 * 자막 한 줄이 캔버스 폭에서 차지할 수 있는 최대 비율.
 * 세로 영상에서 좌우 여백을 남겨 가독성을 지킨다.
 */
const MAX_WIDTH_RATIO = 0.86;
const LINE_HEIGHT_RATIO = 1.28;

export function captionFont(caption: Caption): string {
  const { fontSize, fontWeight } = caption.style;
  return `${fontWeight} ${fontSize}px "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
}

/** 폭을 넘는 줄을 글자 단위로 끊어 담는다. 한 글자도 못 넣는 경우 무한 루프를 막는다. */
function pushWrapped(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  text: string,
  maxWidth: number,
): void {
  let rest = text;
  while (rest.length > 1 && ctx.measureText(rest).width > maxWidth) {
    let cut = rest.length - 1;
    while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  lines.push(rest);
}

/**
 * 캔버스 폭에 맞춰 줄을 나눈다. 사용자가 넣은 줄바꿈은 그대로 지킨다.
 * 한글은 공백 없이 이어지는 경우가 많아, 단어 하나가 폭을 넘으면 글자 단위로 쪼갠다.
 */
export function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  caption: Caption,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of caption.text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line !== '' && ctx.measureText(candidate).width > maxWidth) {
        pushWrapped(ctx, lines, line.trimEnd(), maxWidth);
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    pushWrapped(ctx, lines, line.trimEnd(), maxWidth);
  }

  return lines;
}

export interface CaptionBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly lines: string[];
  readonly lineHeight: number;
}

/** 자막이 차지할 사각형. 렌더링과 드래그 히트 판정이 함께 쓴다. */
export function measureCaption(
  ctx: CanvasRenderingContext2D,
  caption: Caption,
  canvasWidth = CANVAS_WIDTH,
  canvasHeight = CANVAS_HEIGHT,
): CaptionBox {
  ctx.font = captionFont(caption);
  const maxWidth = canvasWidth * MAX_WIDTH_RATIO;
  const lines = wrapCaptionLines(ctx, caption, maxWidth);
  const lineHeight = caption.style.fontSize * LINE_HEIGHT_RATIO;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);

  const pad = caption.style.backgroundColor ? caption.style.backgroundPadding : 0;
  const width = textWidth + pad * 2;
  const height = lines.length * lineHeight + pad * 2;

  return {
    x: caption.position.xRatio * canvasWidth - width / 2,
    y: caption.position.yRatio * canvasHeight - height / 2,
    width,
    height,
    lines,
    lineHeight,
  };
}

/**
 * 자막을 캔버스에 그린다. 프리뷰 컴포지터와 익스포트용 PNG 굽기가 같은 함수를 쓰므로
 * 화면에서 본 그대로가 결과물에 남는다.
 */
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  caption: Caption,
  canvasWidth = CANVAS_WIDTH,
  canvasHeight = CANVAS_HEIGHT,
): CaptionBox {
  const box = measureCaption(ctx, caption, canvasWidth, canvasHeight);
  const { style } = caption;
  const pad = style.backgroundColor ? style.backgroundPadding : 0;

  ctx.save();
  ctx.font = captionFont(caption);
  ctx.textBaseline = 'top';
  ctx.textAlign = style.align;

  if (style.backgroundColor) {
    ctx.fillStyle = style.backgroundColor;
    roundRect(ctx, box.x, box.y, box.width, box.height, style.fontSize * 0.18);
    ctx.fill();
  }

  const textX =
    style.align === 'left'
      ? box.x + pad
      : style.align === 'right'
        ? box.x + box.width - pad
        : box.x + box.width / 2;

  box.lines.forEach((line, index) => {
    const y = box.y + pad + index * box.lineHeight;
    if (style.strokeWidth > 0) {
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, textX, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, textX, y);
  });

  ctx.restore();
  return box;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** 캔버스 좌표가 자막 박스 안에 있는지. 드래그 선택에 쓴다. */
export function hitTestCaption(box: CaptionBox, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}
