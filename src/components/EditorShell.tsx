'use client';

import { useEditorStore } from '@/store/editorStore';
import { CaptionEditor } from './CaptionEditor';
import { ExportDialog } from './ExportDialog';
import { ImportPanel } from './ImportPanel';
import { Inspector } from './Inspector';
import { PlaybackControls } from './PlaybackControls';
import { PlayerCanvas } from './PlayerCanvas';
import { Timeline } from './Timeline';

export function EditorShell() {
  const project = useEditorStore((state) => state.project);
  const closeProject = useEditorStore((state) => state.closeProject);

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950">
        <ImportPanel />
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-bold">ShortFlow</span>
          <span className="truncate text-xs text-neutral-500">{project.source.fileName}</span>
        </div>
        <button
          type="button"
          onClick={closeProject}
          className="rounded-md px-3 py-1 text-xs text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
        >
          다른 영상 열기
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-4">
            <PlayerCanvas />
          </div>
          <PlaybackControls />
          <Timeline />
        </div>

        <aside className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-neutral-800 p-4">
          <CaptionEditor />
          <hr className="border-neutral-800" />
          <Inspector />
          <ExportDialog />
        </aside>
      </div>
    </main>
  );
}
