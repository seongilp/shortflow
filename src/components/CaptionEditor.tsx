'use client';

import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/lib/model/project';
import { formatTimecode, parseTimecode } from '@/lib/model/time';
import type { Caption } from '@/lib/model/types';

export function CaptionEditor() {
  const project = useEditorStore((state) => state.project);
  const selectedCaptionId = useEditorStore((state) => state.selectedCaptionId);
  const addCaptionAtPlayhead = useEditorStore((state) => state.addCaptionAtPlayhead);
  const selectCaption = useEditorStore((state) => state.selectCaption);
  const seek = useEditorStore((state) => state.seek);

  if (!project) return null;

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">자막</h2>
        <button
          type="button"
          onClick={addCaptionAtPlayhead}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500"
        >
          + 재생 위치에 추가
        </button>
      </div>

      {project.captions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
          아직 자막이 없습니다.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {project.captions.map((caption) => (
            <CaptionRow
              key={caption.id}
              caption={caption}
              durationMs={projectDurationMs(project)}
              isSelected={caption.id === selectedCaptionId}
              onSelect={() => {
                selectCaption(caption.id);
                seek(caption.startMs);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CaptionRow({
  caption,
  durationMs,
  isSelected,
  onSelect,
}: {
  caption: Caption;
  durationMs: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const editCaptionText = useEditorStore((state) => state.editCaptionText);
  const editCaptionStyle = useEditorStore((state) => state.editCaptionStyle);
  const retime = useEditorStore((state) => state.retime);
  const deleteCaption = useEditorStore((state) => state.deleteCaption);

  return (
    <li
      onClick={onSelect}
      className={`rounded-lg border p-3 transition ${
        isSelected ? 'border-sky-500 bg-sky-950/30' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700'
      }`}
    >
      <textarea
        value={caption.text}
        onChange={(event) => editCaptionText(caption.id, event.target.value)}
        onFocus={onSelect}
        rows={2}
        placeholder="자막 내용"
        className="w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-sky-600"
      />

      <div className="mt-2 flex items-center gap-1.5">
        <TimecodeField
          valueMs={caption.startMs}
          onCommit={(ms) => retime(caption.id, ms, caption.endMs)}
        />
        <span className="text-neutral-700">–</span>
        <TimecodeField
          valueMs={caption.endMs}
          onCommit={(ms) => retime(caption.id, caption.startMs, ms)}
        />
        <span className="ml-auto whitespace-nowrap text-[11px] text-neutral-600">
          {((caption.endMs - caption.startMs) / 1000).toFixed(1)}초
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteCaption(caption.id);
          }}
          aria-label="자막 삭제"
          title="자막 삭제"
          className="shrink-0 rounded px-1.5 py-1 text-xs text-neutral-600 transition hover:bg-red-950 hover:text-red-400"
        >
          ✕
        </button>
      </div>

      {isSelected && (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-800 pt-3">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="w-14 shrink-0">크기</span>
            <input
              type="range"
              min={24}
              max={160}
              step={2}
              value={caption.style.fontSize}
              onChange={(event) =>
                editCaptionStyle(caption.id, { fontSize: Number(event.target.value) })
              }
              className="flex-1 accent-sky-500"
            />
            <span className="w-9 text-right font-mono">{caption.style.fontSize}</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="w-14 shrink-0">외곽선</span>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={caption.style.strokeWidth}
              onChange={(event) =>
                editCaptionStyle(caption.id, { strokeWidth: Number(event.target.value) })
              }
              className="flex-1 accent-sky-500"
            />
            <span className="w-9 text-right font-mono">{caption.style.strokeWidth}</span>
          </label>

          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <ColorSwatch
              label="글자"
              value={caption.style.color}
              onChange={(color) => editCaptionStyle(caption.id, { color })}
            />
            <ColorSwatch
              label="테두리"
              value={caption.style.strokeColor}
              onChange={(strokeColor) => editCaptionStyle(caption.id, { strokeColor })}
            />
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={caption.style.backgroundColor !== null}
                onChange={(event) =>
                  editCaptionStyle(caption.id, {
                    backgroundColor: event.target.checked ? '#000000cc' : null,
                  })
                }
                className="accent-sky-500"
              />
              배경
            </label>
          </div>

          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => editCaptionStyle(caption.id, { align })}
                className={`flex-1 rounded px-2 py-1 text-xs transition ${
                  caption.style.align === align
                    ? 'bg-sky-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                {align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-600">
            화면에서 자막을 끌어 위치를 옮길 수 있습니다. (0–{formatTimecode(durationMs)})
          </p>
        </div>
      )}
    </li>
  );
}

/** 타임코드 입력. 형식이 어긋나면 확정하지 않고 원래 값으로 되돌린다. */
function TimecodeField({
  valueMs,
  onCommit,
}: {
  valueMs: number;
  onCommit: (ms: number) => void;
}) {
  return (
    <label className="flex items-center text-[11px] text-neutral-500">
      <input
        key={valueMs}
        defaultValue={formatTimecode(valueMs)}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          const parsed = parseTimecode(event.target.value);
          if (parsed === null) {
            event.target.value = formatTimecode(valueMs);
            return;
          }
          onCommit(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="w-[72px] rounded border border-neutral-800 bg-neutral-950 px-1 py-1 text-center font-mono text-neutral-200 outline-none focus:border-sky-600"
      />
    </label>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      {label}
      <input
        type="color"
        value={value.slice(0, 7)}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
      />
    </label>
  );
}
