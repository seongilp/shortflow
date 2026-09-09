'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { validateAsset } from '@/lib/model/project';
import { probeVideo } from '@/lib/import/probeVideo';

type Status = { kind: 'idle' } | { kind: 'busy'; message: string } | { kind: 'error'; message: string; hint?: string };

export function ImportPanel() {
  const loadProject = useEditorStore((state) => state.loadProject);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      try {
        const { asset } = await probeVideo(url, fileName);
        const invalid = validateAsset(asset);
        if (invalid) {
          URL.revokeObjectURL(url);
          setStatus({ kind: 'error', message: invalid.message });
          return;
        }
        loadProject(asset, { video: blob, music: null });
        setStatus({ kind: 'idle' });
      } catch (error) {
        URL.revokeObjectURL(url);
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : '영상을 불러오지 못했습니다.',
        });
      }
    },
    [loadProject],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setStatus({ kind: 'busy', message: '영상 정보를 읽는 중…' });
      await ingest(file, file.name);
    },
    [ingest],
  );

  const handleYoutube = useCallback(async () => {
    const url = youtubeUrl.trim();
    if (!url) return;

    setStatus({ kind: 'busy', message: 'yt-dlp로 영상을 받는 중… 길이에 따라 몇 분 걸립니다.' });
    try {
      const response = await fetch('/api/import/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
        setStatus({
          kind: 'error',
          message: body.error ?? '영상을 받지 못했습니다.',
          hint: body.hint,
        });
        return;
      }

      const blob = await response.blob();
      setStatus({ kind: 'busy', message: '영상 정보를 읽는 중…' });
      await ingest(blob, 'youtube.mp4');
    } catch {
      setStatus({ kind: 'error', message: '서버에 연결하지 못했습니다.' });
    }
  }, [youtubeUrl, ingest]);

  const busy = status.kind === 'busy';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-100">ShortFlow</h1>
        <p className="mt-2 text-sm text-neutral-400">
          브라우저에서 완결되는 유튜브 쇼츠 편집기. 영상이 서버로 올라가지 않습니다.
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-12 transition ${
          dragging
            ? 'border-sky-400 bg-sky-950/40'
            : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500'
        }`}
      >
        <span className="text-4xl">🎬</span>
        <p className="font-medium text-neutral-200">영상 파일을 끌어다 놓으세요</p>
        <p className="text-xs text-neutral-500">MP4, MOV, WebM · 최대 10분</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-neutral-600">
        <div className="h-px flex-1 bg-neutral-800" />
        또는
        <div className="h-px flex-1 bg-neutral-800" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleYoutube();
            }}
            placeholder="https://youtube.com/watch?v=..."
            disabled={busy}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-sky-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleYoutube()}
            disabled={busy || youtubeUrl.trim() === ''}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-40"
          >
            가져오기
          </button>
        </div>
        <p className="text-xs text-neutral-600">
          로컬 개발 환경에서 yt-dlp가 설치되어 있을 때만 동작합니다.
        </p>
      </div>

      {status.kind === 'busy' && (
        <p className="text-center text-sm text-sky-400">{status.message}</p>
      )}
      {status.kind === 'error' && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <p>{status.message}</p>
          {status.hint && <p className="mt-1 font-mono text-xs text-red-400/80">{status.hint}</p>}
        </div>
      )}
    </div>
  );
}
