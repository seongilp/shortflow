'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { exportProject, ExportError, type ExportProgress } from '@/lib/export/exportProject';
import { isSharedArrayBufferAvailable } from '@/lib/export/ffmpegClient';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress; log: string }
  | { kind: 'done'; url: string; sizeBytes: number }
  | { kind: 'error'; message: string; logs: readonly string[] };

const PHASE_LABEL: Record<ExportProgress['phase'], string> = {
  loading: 'ffmpeg 코어 불러오는 중',
  preparing: '자막과 소스 준비 중',
  encoding: '인코딩 중',
  finishing: '파일 마무리 중',
};

export function ExportDialog() {
  const project = useEditorStore((state) => state.project);
  const files = useEditorStore((state) => state.files);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (!project || !files) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'running', progress: { phase: 'loading', ratio: 0 }, log: '' });

    try {
      const blob = await exportProject(project, {
        sourceFile: files.video,
        musicFile: files.music,
        signal: controller.signal,
        onProgress: (progress) =>
          setState((prev) => ({
            kind: 'running',
            progress,
            log: prev.kind === 'running' ? prev.log : '',
          })),
        // ffmpeg는 filter_complex 사용 시 진행률을 보고하지 않는 경우가 많다.
        // 마지막 로그 한 줄을 함께 보여줘야 멈춘 것인지 진행 중인지 구분된다.
        onLog: (line) =>
          setState((prev) =>
            prev.kind === 'running' ? { ...prev, log: line } : prev,
          ),
      });
      setState({ kind: 'done', url: URL.createObjectURL(blob), sizeBytes: blob.size });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState({ kind: 'idle' });
        return;
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : '익스포트에 실패했습니다.',
        logs: error instanceof ExportError ? error.logs.slice(-20) : [],
      });
    } finally {
      abortRef.current = null;
    }
  }, [project, files]);

  if (!project) return null;

  const isolated = isSharedArrayBufferAvailable();

  return (
    <section className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
      <h2 className="text-sm font-semibold text-neutral-200">내보내기</h2>

      {!isolated && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-300">
          이 페이지가 cross-origin isolated 상태가 아니어서 ffmpeg를 실행할 수 없습니다.
          개발 서버를 재시작한 뒤 새로고침해 주세요.
        </p>
      )}

      {state.kind === 'idle' && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={!isolated}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          MP4로 내보내기 (1080×1920)
        </button>
      )}

      {state.kind === 'running' && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>{PHASE_LABEL[state.progress.phase]}</span>
            <span className="font-mono">{Math.round(state.progress.ratio * 100)}%</span>
          </div>
          {state.log && (
            <p className="truncate font-mono text-[10px] text-neutral-600" title={state.log}>
              {state.log}
            </p>
          )}
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width]"
              style={{ width: `${state.progress.ratio * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="self-start text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            취소
          </button>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="flex flex-col gap-2">
          <a
            href={state.url}
            download={`${project.name}-shorts.mp4`}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            다운로드 ({(state.sizeBytes / 1024 / 1024).toFixed(1)} MB)
          </a>
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="self-start text-xs text-neutral-500 underline hover:text-neutral-300"
          >
            다시 내보내기
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-900 bg-red-950/30 p-3">
          <p className="text-xs text-red-300">{state.message}</p>
          {state.logs.length > 0 && (
            <details className="text-[11px] text-red-400/70">
              <summary className="cursor-pointer">ffmpeg 로그</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono">
                {state.logs.join('\n')}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="self-start text-xs text-neutral-400 underline hover:text-neutral-200"
          >
            닫기
          </button>
        </div>
      )}
    </section>
  );
}
