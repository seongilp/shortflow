'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/lib/model/project';
import { clamp, formatTimecode } from '@/lib/model/time';
import type { CaptionEdge } from '@/lib/model/caption';
import type { Caption } from '@/lib/model/types';

type DragKind =
  | { type: 'playhead' }
  | { type: 'trim-in' }
  | { type: 'trim-out' }
  | { type: 'caption'; id: string }
  | { type: 'caption-edge'; id: string; edge: CaptionEdge };

export function Timeline() {
  const project = useEditorStore((state) => state.project);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const selectedCaptionId = useEditorStore((state) => state.selectedCaptionId);
  const seek = useEditorStore((state) => state.seek);
  const trim = useEditorStore((state) => state.trim);
  const shift = useEditorStore((state) => state.shift);
  const resize = useEditorStore((state) => state.resize);
  const selectCaption = useEditorStore((state) => state.selectCaption);
  const setScrub = useEditorStore((state) => state.setScrub);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);
  /** 마우스가 가리키는 원본 시각. 가이드를 그리고 자르기 기준점이 된다. */
  const [hoverSourceMs, setHoverSourceMs] = useState<number | null>(null);

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

      // 자막 시각은 트림 이후 타임라인 기준이라 트림 시작만큼 빼준다.
      const timelineMs = sourceMs - project.clip.inMs;

      if (drag.type === 'playhead') {
        seek(timelineMs);
      } else if (drag.type === 'trim-in') {
        trim(sourceMs, project.clip.outMs);
      } else if (drag.type === 'trim-out') {
        trim(project.clip.inMs, sourceMs);
      } else if (drag.type === 'caption-edge') {
        resize(drag.id, drag.edge, timelineMs);
      } else {
        shift(drag.id, timelineMs);
      }
    },
    [project, posToSourceMs, seek, trim, shift, resize],
  );

  /**
   * 마우스를 따라 가이드를 옮기고 그 지점을 화면에 미리 보여준다.
   * 재생 헤드는 건드리지 않으므로, 훑어보다 마음에 안 들면 그냥 벗어나면 된다.
   */
  const updateHover = useCallback(
    (event: React.PointerEvent) => {
      if (!project) return;
      const sourceMs = posToSourceMs(event.clientX);
      setHoverSourceMs(sourceMs);
      setScrub(sourceMs - project.clip.inMs);
    },
    [project, posToSourceMs, setScrub],
  );

  const clearHover = useCallback(() => {
    setHoverSourceMs(null);
    setScrub(null);
  }, [setScrub]);

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
        onPointerMove={(event) => {
          handleMove(event);
          updateHover(event);
        }}
        onPointerLeave={clearHover}
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

        {hoverSourceMs !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10"
            style={{ left: pct(hoverSourceMs) }}
          >
            <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-amber-400" />

            <div
              className="pointer-events-auto absolute top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap"
              // 버튼 위에서는 가이드를 옮기지 않는다. 옮기면 버튼이 커서에서 달아난다.
              onPointerMove={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <CutButton
                label="◀ 앞 자르기"
                title={`${formatTimecode(hoverSourceMs)} 이전을 잘라냅니다`}
                onClick={() => trim(hoverSourceMs, project.clip.outMs)}
              />
              <CutButton
                label="뒤 자르기 ▶"
                title={`${formatTimecode(hoverSourceMs)} 이후를 잘라냅니다`}
                onClick={() => trim(project.clip.inMs, hoverSourceMs)}
              />
            </div>

            <span className="absolute bottom-1 left-0 -translate-x-1/2 rounded bg-amber-400 px-1 font-mono text-[10px] text-black">
              {formatTimecode(hoverSourceMs)}
            </span>
          </div>
        )}
      </div>

      <div className="relative h-9 w-full rounded-lg bg-neutral-900/60">
        {project.captions.map((caption) => (
          <CaptionChip
            key={caption.id}
            caption={caption}
            left={pct(project.clip.inMs + caption.startMs)}
            width={pct(caption.endMs - caption.startMs)}
            isSelected={caption.id === selectedCaptionId}
            onSelect={() => selectCaption(caption.id)}
            onBeginDrag={beginDrag}
            onMove={handleMove}
            onEndDrag={endDrag}
          />
        ))}
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

interface CaptionChipProps {
  caption: Caption;
  left: string;
  width: string;
  isSelected: boolean;
  onSelect: () => void;
  onBeginDrag: (kind: DragKind, event: React.PointerEvent) => void;
  onMove: (event: React.PointerEvent) => void;
  onEndDrag: (event: React.PointerEvent) => void;
}

/** 양쪽 핸들은 길이를 조절하고, 가운데를 잡으면 길이를 유지한 채 이동한다. */
function CaptionChip({
  caption,
  left,
  width,
  isSelected,
  onSelect,
  onBeginDrag,
  onMove,
  onEndDrag,
}: CaptionChipProps) {
  const dragProps = (kind: DragKind) => ({
    onPointerDown: (event: React.PointerEvent) => {
      onSelect();
      onBeginDrag(kind, event);
    },
    onPointerMove: onMove,
    onPointerUp: onEndDrag,
    onPointerCancel: onEndDrag,
  });

  return (
    <div
      {...dragProps({ type: 'caption', id: caption.id })}
      title={caption.text}
      className={`absolute inset-y-1 flex cursor-grab touch-none items-center rounded transition ${
        isSelected
          ? 'bg-sky-500 text-white ring-2 ring-sky-300'
          : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
      }`}
      // 두 핸들이 겹치지 않을 만큼은 확보한다. 아주 짧은 큐도 잡을 수 있어야 한다.
      style={{ left, width: `max(${width}, 34px)` }}
    >
      <span className="pointer-events-none truncate px-2.5 text-[11px]">
        {caption.text.split('\n')[0] || '빈 자막'}
      </span>

      <ResizeHandle side="left" {...dragProps({ type: 'caption-edge', id: caption.id, edge: 'start' })} />
      <ResizeHandle side="right" {...dragProps({ type: 'caption-edge', id: caption.id, edge: 'end' })} />
    </div>
  );
}

function ResizeHandle({
  side,
  ...handlers
}: {
  side: 'left' | 'right';
} & Pick<
  React.ComponentProps<'div'>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>) {
  return (
    <div
      {...handlers}
      aria-label={side === 'left' ? '자막 시작 조절' : '자막 종료 조절'}
      className={`absolute inset-y-0 flex w-2.5 cursor-ew-resize touch-none items-center justify-center rounded ${
        side === 'left' ? 'left-0' : 'right-0'
      }`}
    >
      <div className="h-3 w-0.5 rounded-full bg-white/70" />
    </div>
  );
}

function CutButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-medium text-black shadow transition hover:bg-amber-300"
    >
      {label}
    </button>
  );
}
