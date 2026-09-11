import { create } from 'zustand';
import type { Caption, CaptionStyle, MediaAsset, MusicTrack, Project, Transform } from '@/lib/model/types';
import type { CaptionEdge } from '@/lib/model/caption';
import {
  addCaption,
  createCaption,
  defaultCaptionRange,
  removeCaption,
  resizeCaption,
  retimeCaption,
  shiftCaption,
  updateCaption,
} from '@/lib/model/caption';
import { setTransform, setTrim } from '@/lib/model/clip';
import {
  createProject,
  projectDurationMs,
  withCaptions,
  withClip,
  withMusic,
  withSourceVolume,
} from '@/lib/model/project';
import { clamp } from '@/lib/model/time';

export interface SourceFiles {
  readonly video: Blob;
  readonly music: Blob | null;
}

interface EditorState {
  project: Project | null;
  /** 원본 파일은 직렬화 대상이 아니라 프로젝트 모델 밖에 둔다. */
  files: SourceFiles | null;
  playheadMs: number;
  /** 타임라인 위에서 마우스를 따라다니는 미리보기 시각. 재생 헤드는 건드리지 않는다. */
  scrubMs: number | null;
  isPlaying: boolean;
  selectedCaptionId: string | null;
  error: string | null;

  loadProject: (asset: MediaAsset, files: SourceFiles) => void;
  closeProject: () => void;
  setError: (message: string | null) => void;

  seek: (timeMs: number) => void;
  setScrub: (timeMs: number | null) => void;
  setPlaying: (playing: boolean) => void;

  trim: (inMs: number, outMs: number) => void;
  reframe: (patch: Partial<Transform>) => void;
  setSourceVolume: (volume: number) => void;
  setMusic: (music: MusicTrack | null, file: Blob | null) => void;

  addCaptionAtPlayhead: () => void;
  selectCaption: (id: string | null) => void;
  editCaptionText: (id: string, text: string) => void;
  editCaptionStyle: (id: string, style: Partial<CaptionStyle>) => void;
  moveCaptionPosition: (id: string, xRatio: number, yRatio: number) => void;
  retime: (id: string, startMs: number, endMs: number) => void;
  resize: (id: string, edge: CaptionEdge, timeMs: number) => void;
  shift: (id: string, startMs: number) => void;
  deleteCaption: (id: string) => void;
}

/** 프로젝트가 있을 때만 의미 있는 변경을 공통 처리한다. */
function mapProject(
  state: EditorState,
  fn: (project: Project) => Project,
): Partial<EditorState> {
  if (!state.project) return {};
  const project = fn(state.project);
  return {
    project,
    playheadMs: clamp(state.playheadMs, 0, projectDurationMs(project)),
  };
}

function mapCaptions(
  state: EditorState,
  fn: (captions: readonly Caption[], project: Project) => readonly Caption[],
): Partial<EditorState> {
  return mapProject(state, (project) => withCaptions(project, fn(project.captions, project)));
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  files: null,
  playheadMs: 0,
  scrubMs: null,
  isPlaying: false,
  selectedCaptionId: null,
  error: null,

  loadProject: (asset, files) =>
    set({
      project: createProject(asset),
      files,
      playheadMs: 0,
      scrubMs: null,
      isPlaying: false,
      selectedCaptionId: null,
      error: null,
    }),

  closeProject: () =>
    set({
      project: null,
      files: null,
      playheadMs: 0,
      scrubMs: null,
      isPlaying: false,
      selectedCaptionId: null,
    }),

  setError: (message) => set({ error: message }),

  seek: (timeMs) =>
    set((state) => ({
      playheadMs: state.project
        ? clamp(timeMs, 0, projectDurationMs(state.project))
        : 0,
    })),

  setScrub: (timeMs) =>
    set((state) => {
      if (timeMs === null) return { scrubMs: null };
      // 재생 중에는 화면이 재생을 따라야 한다. 스크럽이 끼어들면 프레임이 튄다.
      if (!state.project || state.isPlaying) return {};
      return { scrubMs: clamp(timeMs, 0, projectDurationMs(state.project)) };
    }),

  setPlaying: (playing) => set({ isPlaying: playing, scrubMs: null }),

  trim: (inMs, outMs) =>
    set((state) => {
      if (!state.project) return {};
      const previousInMs = state.project.clip.inMs;
      const project = withClip(
        state.project,
        setTrim(state.project.clip, inMs, outMs, state.project.source.durationMs),
      );
      // 시작점이 움직이면 타임라인 원점도 움직인다.
      // 재생 헤드를 그만큼 밀어야 같은 장면을 계속 가리킨다. 자막도 같은 이유로 밀린다.
      const shiftedPlayhead = state.playheadMs - (project.clip.inMs - previousInMs);
      return {
        project,
        playheadMs: clamp(shiftedPlayhead, 0, projectDurationMs(project)),
        scrubMs: null,
      };
    }),

  reframe: (patch) =>
    set((state) =>
      mapProject(state, (project) => withClip(project, setTransform(project.clip, patch))),
    ),

  setSourceVolume: (volume) =>
    set((state) => mapProject(state, (project) => withSourceVolume(project, volume))),

  setMusic: (music, file) =>
    set((state) => ({
      ...mapProject(state, (project) => withMusic(project, music)),
      files: state.files ? { ...state.files, music: file } : state.files,
    })),

  addCaptionAtPlayhead: () => {
    const { project, playheadMs } = get();
    if (!project) return;
    const range = defaultCaptionRange(playheadMs, projectDurationMs(project));
    const caption = createCaption(range);
    set((state) => ({
      ...mapCaptions(state, (captions) => addCaption(captions, caption)),
      selectedCaptionId: caption.id,
    }));
  },

  selectCaption: (id) => set({ selectedCaptionId: id }),

  editCaptionText: (id, text) =>
    set((state) => mapCaptions(state, (captions) => updateCaption(captions, id, { text }))),

  editCaptionStyle: (id, style) =>
    set((state) => mapCaptions(state, (captions) => updateCaption(captions, id, { style }))),

  moveCaptionPosition: (id, xRatio, yRatio) =>
    set((state) =>
      mapCaptions(state, (captions) =>
        updateCaption(captions, id, {
          position: { xRatio: clamp(xRatio, 0, 1), yRatio: clamp(yRatio, 0, 1) },
        }),
      ),
    ),

  retime: (id, startMs, endMs) =>
    set((state) =>
      mapCaptions(state, (captions, project) =>
        retimeCaption(captions, id, startMs, endMs, projectDurationMs(project)),
      ),
    ),

  resize: (id, edge, timeMs) =>
    set((state) =>
      mapCaptions(state, (captions, project) =>
        resizeCaption(captions, id, edge, timeMs, projectDurationMs(project)),
      ),
    ),

  shift: (id, startMs) =>
    set((state) =>
      mapCaptions(state, (captions, project) =>
        shiftCaption(captions, id, startMs, projectDurationMs(project)),
      ),
    ),

  deleteCaption: (id) =>
    set((state) => ({
      ...mapCaptions(state, (captions) => removeCaption(captions, id)),
      selectedCaptionId: state.selectedCaptionId === id ? null : state.selectedCaptionId,
    })),
}));
