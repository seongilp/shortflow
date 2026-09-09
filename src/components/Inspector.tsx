'use client';

import { useRef } from 'react';
import { nanoid } from 'nanoid';
import { useEditorStore } from '@/store/editorStore';
import { MAX_SCALE } from '@/lib/model/clip';

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const reframe = useEditorStore((state) => state.reframe);
  const setSourceVolume = useEditorStore((state) => state.setSourceVolume);
  const setMusic = useEditorStore((state) => state.setMusic);
  const musicInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;
  const { transform } = project.clip;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-200">화면 · 소리</h2>

      <Slider
        label="확대"
        value={transform.scale}
        min={1}
        max={MAX_SCALE}
        step={0.05}
        format={(value) => `${value.toFixed(2)}x`}
        onChange={(scale) => reframe({ scale })}
      />
      <Slider
        label="좌우"
        value={transform.offsetX}
        min={-800}
        max={800}
        step={4}
        format={(value) => String(Math.round(value))}
        onChange={(offsetX) => reframe({ offsetX })}
      />
      <Slider
        label="상하"
        value={transform.offsetY}
        min={-800}
        max={800}
        step={4}
        format={(value) => String(Math.round(value))}
        onChange={(offsetY) => reframe({ offsetY })}
      />
      <button
        type="button"
        onClick={() => reframe({ scale: 1, offsetX: 0, offsetY: 0 })}
        className="self-start rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
      >
        화면 배치 초기화
      </button>

      <hr className="border-neutral-800" />

      <Slider
        label="원본 음량"
        value={project.sourceVolume}
        min={0}
        max={2}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={setSourceVolume}
      />

      {project.music ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-neutral-300">{project.music.asset.fileName}</span>
            <button
              type="button"
              onClick={() => setMusic(null, null)}
              className="shrink-0 rounded px-2 py-0.5 text-xs text-neutral-500 transition hover:bg-red-950 hover:text-red-400"
            >
              제거
            </button>
          </div>
          <Slider
            label="BGM 음량"
            value={project.music.volume}
            min={0}
            max={1.5}
            step={0.05}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(volume) => {
              const files = useEditorStore.getState().files;
              setMusic({ ...project.music!, volume }, files?.music ?? null);
            }}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => musicInputRef.current?.click()}
            className="self-start rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-700"
          >
            + 배경음악 추가
          </button>
          <input
            ref={musicInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setMusic(
                {
                  asset: {
                    id: nanoid(),
                    fileName: file.name,
                    url: URL.createObjectURL(file),
                    // 오디오 길이는 클립 길이에 맞춰 잘리므로 별도로 재지 않는다.
                    durationMs: 0,
                    width: 0,
                    height: 0,
                  },
                  volume: 0.4,
                  startMs: 0,
                },
                file,
              );
            }}
          />
        </>
      )}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 accent-sky-500"
      />
      <span className="w-12 text-right font-mono text-neutral-300">{format(value)}</span>
    </label>
  );
}
