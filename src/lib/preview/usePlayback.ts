'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/lib/model/project';
import { timelineToSourceMs } from '@/lib/model/clip';

/**
 * video 엘리먼트를 타임라인 상태에 묶는다.
 * 재생 중에는 video.currentTime을 진실로 삼아 재생 헤드를 따라가고,
 * 정지 중에는 재생 헤드를 진실로 삼아 video를 seek 한다.
 */
export function usePlayback(video: HTMLVideoElement | null): void {
  const project = useEditorStore((state) => state.project);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const seek = useEditorStore((state) => state.seek);
  const setPlaying = useEditorStore((state) => state.setPlaying);

  const rafRef = useRef<number | null>(null);
  // 재생 루프가 쓰는 최신 값. 의존성 배열 때문에 루프를 재시작하지 않도록 ref로 둔다.
  const stateRef = useRef({ project, seek, setPlaying });

  useEffect(() => {
    stateRef.current = { project, seek, setPlaying };
  }, [project, seek, setPlaying]);

  // 정지 상태에서의 seek 반영. 재생 중에는 루프가 주도하므로 건드리지 않는다.
  useEffect(() => {
    if (!video || !project || isPlaying) return;
    seekVideo(video, timelineToSourceMs(project.clip, playheadMs) / 1000, 0.05);
  }, [video, project, playheadMs, isPlaying]);

  useEffect(() => {
    if (!video || !project) return;

    if (!isPlaying) {
      video.pause();
      return;
    }

    seekVideo(video, timelineToSourceMs(project.clip, playheadMs) / 1000, 0.1);

    void video.play().catch(() => {
      // 자동 재생 정책 등으로 실패하면 정지 상태로 되돌린다.
      stateRef.current.setPlaying(false);
    });

    const tick = () => {
      const current = stateRef.current.project;
      if (!current) return;

      const timelineMs = video.currentTime * 1000 - current.clip.inMs;
      const duration = projectDurationMs(current);

      if (timelineMs >= duration) {
        video.pause();
        stateRef.current.seek(duration);
        stateRef.current.setPlaying(false);
        return;
      }

      stateRef.current.seek(timelineMs);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      video.pause();
    };
    // playheadMs는 재생 시작 시점의 값만 필요해 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, project?.clip.inMs, project?.clip.outMs, isPlaying]);
}

/** 오차가 허용치를 넘을 때만 seek 한다. 매 프레임 대입하면 재생이 끊긴다. */
function seekVideo(element: HTMLVideoElement, targetSec: number, toleranceSec: number): void {
  if (Math.abs(element.currentTime - targetSec) > toleranceSec) {
    element.currentTime = targetSec;
  }
}
