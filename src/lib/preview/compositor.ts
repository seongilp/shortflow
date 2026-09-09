import type { Project } from '@/lib/model/types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/model/types';
import { computeSourceLayout } from '@/lib/model/clip';
import { captionsAt } from '@/lib/model/caption';
import { drawCaption, type CaptionBox } from '@/lib/render/drawCaption';

export interface CompositeResult {
  /** 이번 프레임에 그려진 자막들의 박스. 클릭/드래그 히트 판정에 쓴다. */
  readonly boxes: ReadonlyMap<string, CaptionBox>;
}

/**
 * 한 프레임을 캔버스에 합성한다. 영상 프레임 위에 자막을 얹는 순서가
 * 익스포트의 overlay 체인과 같아 결과가 일치한다.
 */
export function composite(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  project: Project,
  timelineMs: number,
  selectedCaptionId: string | null,
): CompositeResult {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 메타데이터 로드 전에는 그릴 프레임이 없다.
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const layout = computeSourceLayout(project.source, project.clip.transform);
    ctx.drawImage(video, layout.drawX, layout.drawY, layout.drawWidth, layout.drawHeight);
  }

  const boxes = new Map<string, CaptionBox>();
  for (const caption of captionsAt(project.captions, timelineMs)) {
    boxes.set(caption.id, drawCaption(ctx, caption, CANVAS_WIDTH, CANVAS_HEIGHT));
  }

  const selectedBox = selectedCaptionId ? boxes.get(selectedCaptionId) : undefined;
  if (selectedBox) drawSelectionOutline(ctx, selectedBox);

  return { boxes };
}

/** 선택된 자막의 편집 핸들. 익스포트에는 그리지 않는다. */
function drawSelectionOutline(ctx: CanvasRenderingContext2D, box: CaptionBox): void {
  const margin = 12;
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.strokeRect(
    box.x - margin,
    box.y - margin,
    box.width + margin * 2,
    box.height + margin * 2,
  );
  ctx.restore();
}
