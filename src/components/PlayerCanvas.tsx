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
  const scrubMs = useEditorStore((state) => state.scrubMs);
  const selectedCaptionId = useEditorStore((state) => state.selectedCaptionId);
  const selectCaption = useEditorStore((state) => state.selectCaption);
  const moveCaptionPosition = useEditorStore((state) => state.moveCaptionPosition);

  usePlayback(videoEl);

  // 스크럽 중이면 마우스가 가리키는 지점을, 아니면 재생 헤드를 그린다.
  const previewMs = scrubMs ?? playheadMs;

  // 렌더 루프가 읽는 최신 상태. 의존성에 넣으면 매 프레임 루프를 재시작하게 된다.
  const frameRef = useRef({ project, previewMs, selectedCaptionId });
  useEffect(() => {
    frameRef.current = { project, previewMs, selectedCaptionId };
  }, [project, previewMs, selectedCaptionId]);

  // 루프는 마운트 동안 한 번만 돈다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const frame = frameRef.current;
      if (frame.project) {
        const result = composite(
          ctx,
          video,
          frame.project,
          frame.previewMs,
          frame.selectedCaptionId,
        );
        boxesRef.current = result.boxes;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [videoEl]);

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
      {/*
        디코딩 소스. 화면에는 캔버스만 보이지만 display:none으로 숨기면 안 된다.
        Chrome은 렌더링되지 않는 video의 프레임 갱신을 생략해서, 오디오만 흐르고
        drawImage는 멈춘 프레임을 계속 그리게 된다. 화면 밖으로 밀어 두기만 한다.
      */}
      <video
        ref={(node) => {
          videoRef.current = node;
          setVideoEl(node);
        }}
        src={project.source.url}
        playsInline
        preload="auto"
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 -z-10 h-px w-px opacity-0"
      />
    </div>
  );
}
