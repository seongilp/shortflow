'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/lib/model/project';

const STEP_MS = 100;

export function PlaybackControls() {
  const project = useEditorStore((state) => state.project);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const seek = useEditorStore((state) => state.seek);
  const addCaptionAtPlayhead = useEditorStore((state) => state.addCaptionAtPlayhead);

  // 편집 중 텍스트 입력에는 단축키가 걸리지 않아야 한다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(!useEditorStore.getState().isPlaying);
      } else if (event.code === 'ArrowLeft') {
        seek(useEditorStore.getState().playheadMs - STEP_MS);
      } else if (event.code === 'ArrowRight') {
        seek(useEditorStore.getState().playheadMs + STEP_MS);
      } else if (event.key.toLowerCase() === 't') {
        addCaptionAtPlayhead();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPlaying, seek, addCaptionAtPlayhead]);

  if (!project) return null;
  const durationMs = projectDurationMs(project);

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <ControlButton label="⏮" onClick={() => seek(0)} title="처음으로" />
      <ControlButton label="◀" onClick={() => seek(playheadMs - STEP_MS)} title="0.1초 뒤로" />
      <button
        type="button"
        onClick={() => setPlaying(!isPlaying)}
        className="rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
      >
        {isPlaying ? '일시정지' : '재생'}
      </button>
      <ControlButton label="▶" onClick={() => seek(playheadMs + STEP_MS)} title="0.1초 앞으로" />
      <ControlButton label="⏭" onClick={() => seek(durationMs)} title="끝으로" />
      <span className="ml-3 text-[11px] text-neutral-600">스페이스 재생 · T 자막 추가</span>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition hover:bg-neutral-700"
    >
      {label}
    </button>
  );
}
