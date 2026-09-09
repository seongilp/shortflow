'use client';

import { useCallback, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/lib/model/project';
import { clamp, formatTimecode } from '@/lib/model/time';

type DragKind = { type: 'playhead' } | { type: 'trim-in' } | { type: 'trim-out' } | { type: 'caption'; id: string };

export function Timeline() {
  const project = useEditorStore((state) => state.project);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const selectedCaptionId = useEditorStore((state) => state.selectedCaptionId);
  const seek = useEditorStore((state) => state.seek);
  const trim = useEditorStore((state) => state.trim);
  const shift = useEditorStore((state) => state.shift);
  const selectCaption = useEditorStore((state) => state.selectCaption);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);

  const sourceDurationMs = project?.source.durationMs ?? 0;

  /** 트랙은 원본 전체 길이를 나타낸다. 트림 구간은 그 위에 창처럼 얹힌다. */
  const posToSourceMs = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || sourceDurationMs === 0) return 0;
      const rect = track.getBoundingClientRect();
      return clamp(((clientX - rect.left) / rect.width) * sourceDurationMs, 0, sourceDurationMs);
    },
    [sourceDurationMs],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !project) return;
      const sourceMs = posToSourceMs(event.clientX);

      if (drag.type === 'playhead') {
        seek(sourceMs - project.clip.inMs);
      } else if (drag.type === 'trim-in') {
        trim(sourceMs, project.clip.outMs);
      } else if (drag.type === 'trim-out') {
        trim(project.clip.inMs, sourceMs);
      } else {
        shift(drag.id, sourceMs - project.clip.inMs);
      }
    },
    [project, posToSourceMs, seek, trim, shift],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (!dragRef.current) return;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }, []);

  const beginDrag = useCallback((kind: DragKind, event: React.PointerEvent) => {
    event.stopPropagation();
    dragRef.current = kind;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  if (!project) return null;

  const pct = (ms: number) => `${(ms / sourceDurationMs) * 100}%`;
  const timelineDuration = projectDurationMs(project);
  const playheadSourceMs = project.clip.inMs + playheadMs;

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          트림 {formatTimecode(project.clip.inMs)} – {formatTimecode(project.clip.outMs)}
        </span>
        <span className="font-mono text-neutral-300">
          {formatTimecode(playheadMs)} / {formatTimecode(timelineDuration)}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={(event) => {
          dragRef.current = { type: 'playhead' };
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          handleMove(event);
        }}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-16 w-full touch-none select-none rounded-lg bg-neutral-900"
      >
        {/* 트림 바깥은 어둡게 눌러 편집 대상이 아님을 보인다. */}
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/60" style={{ width: pct(project.clip.inMs) }} />
        <div
          className="absolute inset-y-0 right-0 rounded-r-lg bg-black/60"
          style={{ width: pct(sourceDurationMs - project.clip.outMs) }}
        />

        <div
          className="absolute inset-y-0 border-x-2 border-sky-500 bg-sky-500/10"
          style={{ left: pct(project.clip.inMs), width: pct(project.clip.outMs - project.clip.inMs) }}
        />

        <TrimHandle
          position={pct(project.clip.inMs)}
          onPointerDown={(event) => beginDrag({ type: 'trim-in' }, event)}
        />
        <TrimHandle
          position={pct(project.clip.outMs)}
          onPointerDown={(event) => beginDrag({ type: 'trim-out' }, event)}
        />

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500"
          style={{ left: pct(playheadSourceMs) }}
        />
      </div>

      <div className="relative h-9 w-full rounded-lg bg-neutral-900/60">
        {project.captions.map((caption) => {
          const startSourceMs = project.clip.inMs + caption.startMs;
          const isSelected = caption.id === selectedCaptionId;
          return (
            <button
              key={caption.id}
              type="button"
              onPointerDown={(event) => {
                selectCaption(caption.id);
                beginDrag({ type: 'caption', id: caption.id }, event);
              }}
              onPointerMove={handleMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title={caption.text}
              className={`absolute inset-y-1 touch-none overflow-hidden rounded px-2 text-left text-[11px] leading-7 transition ${
                isSelected
                  ? 'bg-sky-500 text-white ring-2 ring-sky-300'
                  : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
              }`}
              style={{
                left: pct(startSourceMs),
                width: `max(${pct(caption.endMs - caption.startMs)}, 24px)`,
              }}
            >
              {caption.text.split('\n')[0] || '빈 자막'}
            </button>
          );
        })}
        {project.captions.length === 0 && (
          <p className="flex h-full items-center justify-center text-[11px] text-neutral-600">
            자막 트랙 — 자막을 추가하면 여기 표시됩니다
          </p>
        )}
      </div>
    </div>
  );
}

function TrimHandle({
  position,
  onPointerDown,
}: {
  position: string;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute inset-y-0 -ml-2 w-4 cursor-ew-resize touch-none"
      style={{ left: position }}
    >
      <div className="mx-auto h-full w-1 rounded bg-sky-400" />
    </div>
  );
}
