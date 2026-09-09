'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/model/types';
import { composite } from '@/lib/preview/compositor';
import { usePlayback } from '@/lib/preview/usePlayback';
import { hitTestCaption, type CaptionBox } from '@/lib/render/drawCaption';
import { useEditorStore } from '@/store/editorStore';

/** 캔버스 좌표계로 환산된 포인터 위치. */
function toCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

export function PlayerCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxesRef = useRef<ReadonlyMap<string, CaptionBox>>(new Map());
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const project = useEditorStore((state) => state.project);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const selectedCaptionId = useEditorStore((state) => state.selectedCaptionId);
  const selectCaption = useEditorStore((state) => state.selectCaption);
  const moveCaptionPosition = useEditorStore((state) => state.moveCaptionPosition);

  usePlayback(videoEl);

  // 재생 중에는 매 프레임, 정지 중에는 상태가 바뀔 때만 다시 그린다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !project) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const result = composite(ctx, video, project, playheadMs, selectedCaptionId);
      boxesRef.current = result.boxes;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [project, playheadMs, selectedCaptionId]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = toCanvasPoint(canvas, event.clientX, event.clientY);

      for (const [id, box] of boxesRef.current) {
        if (hitTestCaption(box, point.x, point.y)) {
          selectCaption(id);
          dragRef.current = {
            id,
            dx: point.x - (box.x + box.width / 2),
            dy: point.y - (box.y + box.height / 2),
          };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
      }
      selectCaption(null);
    },
    [selectCaption],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const point = toCanvasPoint(canvas, event.clientX, event.clientY);
      moveCaptionPosition(
        drag.id,
        (point.x - drag.dx) / CANVAS_WIDTH,
        (point.y - drag.dy) / CANVAS_HEIGHT,
      );
    },
    [moveCaptionPosition],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      canvasRef.current?.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  }, []);

  if (!project) return null;

  return (
    <div className="flex h-full items-center justify-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="h-full max-h-[70vh] w-auto touch-none rounded-xl bg-black shadow-2xl"
      />
      {/* 디코딩 소스. 화면에는 캔버스만 보여주고 이 엘리먼트는 숨긴다. */}
      <video
        ref={(node) => {
          videoRef.current = node;
          setVideoEl(node);
        }}
        src={project.source.url}
        playsInline
        preload="auto"
        className="hidden"
      />
    </div>
  );
}
