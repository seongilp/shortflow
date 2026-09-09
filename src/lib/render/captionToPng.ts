import type { Caption } from '../model/types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../model/types';
import { drawCaption } from './drawCaption';

/**
 * 자막 큐를 캔버스 전체 크기의 투명 PNG로 굽는다.
 * ffmpeg overlay가 0:0에 그대로 얹을 수 있어 좌표 변환이 필요 없고,
 * 프리뷰와 동일한 drawCaption을 쓰므로 결과가 어긋나지 않는다.
 */
export async function captionToPng(
  caption: Caption,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('자막을 그릴 캔버스 컨텍스트를 만들지 못했습니다.');
  }

  drawCaption(ctx as unknown as CanvasRenderingContext2D, caption, width, height);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** 굽지 않아도 되는 큐인지. 빈 자막은 입력에서 아예 빼서 인코딩 비용을 아낀다. */
export function isRenderableCaption(caption: Caption): boolean {
  return caption.text.trim().length > 0;
}
