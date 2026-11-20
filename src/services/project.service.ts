import { editorStore } from '@/app/store/editorStore';
import { createDefaultAppState } from '@/core/constants/defaults';
import type { AppState, RecentProject } from '@/core/models/project';

type ProjectDocument = {
  version: number;
  savedAt: number;
  appState: AppState;
};

type AutosaveResult = {
  filePath: string;
  content: string;
  savedAt: number;
} | null;

let autosaveTimer: number | undefined;
let autosaveInitialized = false;
let autosaveRestoreChecked = false;
let clearAutosaveTimer: number | undefined;

function fileNameFromPath(filePath?: string) {
  if (!filePath) return 'Untitled Project';
  return filePath.split(/[/\\]/).pop() ?? 'Untitled Project';
}

function buildProjectDocument(
  state: AppState,
  options: { forAutosave?: boolean } = {}
): ProjectDocument {
  const forAutosave = options.forAutosave ?? false;

  return {
    version: 1,
    savedAt: Date.now(),
    appState: {
      ...state,
      project: {
        ...state.project,
        currentFilePath: state.project.currentFilePath,
        currentName: state.project.currentName,
        dirty: forAutosave ? true : false,
        recentProjects: [],
        lastSavedAt: Date.now()
      }
    }
  };
}

function normalizeLoadedState(
  value: unknown,
  recentProjects: RecentProject[],
  filePath: string | undefined,
  options: { keepDirty?: boolean } = {}
): AppState {
  const defaults = createDefaultAppState();
  const currentState = editorStore.getState();
  const payload = value as Partial<ProjectDocument & AppState>;
  const loadedState = (payload?.appState ?? payload) as Partial<AppState>;
  const resolvedFilePath = filePath ?? loadedState.project?.currentFilePath;

  return {
    ...defaults,
    ...loadedState,
    sourceAssets: (loadedState.sourceAssets ?? defaults.sourceAssets).map((asset) => ({
      ...asset,
      originalPreviewUrl: asset.originalPreviewUrl ?? asset.previewUrl,
      mattingStatus: asset.mattingStatus ?? (asset.cutoutPath ? 'success' : 'idle')
    })),
    memoryTemplates: loadedState.memoryTemplates ?? currentState.memoryTemplates,
    bgRotationTemplates: loadedState.bgRotationTemplates ?? currentState.bgRotationTemplates,
    psdTemplates: loadedState.psdTemplates ?? currentState.psdTemplates,
    sceneCarouselTemplates: loadedState.sceneCarouselTemplates ?? currentState.sceneCarouselTemplates,
    sceneCarouselDraftEntries: loadedState.sceneCarouselDraftEntries ?? defaults.sceneCarouselDraftEntries,
    selectedPsdTemplateId: loadedState.selectedPsdTemplateId ?? defaults.selectedPsdTemplateId,
    canvas: {
      ...defaults.canvas,
      ...(loadedState.canvas ?? {})
    },
    project: {
      ...defaults.project,
      ...(loadedState.project ?? {}),
      currentFilePath: resolvedFilePath,
      currentName: loadedState.project?.currentName ?? fileNameFromPath(resolvedFilePath),
      dirty: options.keepDirty ?? false,
      recentProjects,
      lastSavedAt: Date.now()
    }
  };
}

async function applyOpenResult(result: { filePath: string; content: string; recentProjects: RecentProject[] } | null) {
  if (!result) return;
  const parsed = JSON.parse(result.content);
  const nextState = normalizeLoadedState(parsed, result.recentProjects ?? [], result.filePath);
  editorStore.loadProject(nextState, {
    currentFilePath: result.filePath,
    currentName: fileNameFromPath(result.filePath),
    recentProjects: result.recentProjects ?? [],
    lastSavedAt: Date.now()
  });
  await window.fanDesktop.project.clearAutosave();
}

function scheduleClearAutosave() {
  if (clearAutosaveTimer) {
    window.clearTimeout(clearAutosaveTimer);
  }
  clearAutosaveTimer = window.setTimeout(() => {
    void window.fanDesktop.project.clearAutosave();
  }, 300);
}

export const projectService = {
  async loadRecentProjects() {
    const recentProjects = await window.fanDesktop.project.listRecent();
    editorStore.setRecentProjects(recentProjects ?? []);
  },

  async initializePersistence() {
    if (!autosaveRestoreChecked) {
      autosaveRestoreChecked = true;
      try {
        const payload: AutosaveResult = await window.fanDesktop.project.loadAutosave();
        if (payload?.content) {
          const recentProjects = await window.fanDesktop.project.listRecent();
          const restore = window.confirm('检测到上次未正常关闭时的自动保存内容，是否恢复？');
          if (restore) {
            const parsed = JSON.parse(payload.content);
            const nextState = normalizeLoadedState(parsed, recentProjects ?? [], undefined, { keepDirty: true });
            editorStore.loadProject(nextState, {
              currentFilePath: nextState.project.currentFilePath,
              currentName: nextState.project.currentName,
              recentProjects: recentProjects ?? [],
              lastSavedAt: payload.savedAt
            });
          } else {
            await window.fanDesktop.project.clearAutosave();
          }
        }
      } catch {
        // ignore autosave restore errors
      }
    }

    if (autosaveInitialized) return;
    autosaveInitialized = true;

    editorStore.subscribe(() => {
      const state = editorStore.getState();
      if (autosaveTimer) {
        window.clearTimeout(autosaveTimer);
      }

      if (!state.project.dirty) {
        scheduleClearAutosave();
        return;
      }

      autosaveTimer = window.setTimeout(() => {
        const snapshot = buildProjectDocument(editorStore.getState(), { forAutosave: true });
        void window.fanDesktop.project.saveAutosave(snapshot);
      }, 1200);
    });
  },

  async newProject() {
    const currentState = editorStore.getState();
    if (currentState.project.dirty) {
      const confirmed = window.confirm('当前项目有未保存修改，确定新建项目吗？');
      if (!confirmed) return;
    }
    editorStore.reset();
    await window.fanDesktop.project.clearAutosave();
  },

  async saveProject() {
    const state = editorStore.getState();
    const content = buildProjectDocument(state);

    if (state.project.currentFilePath) {
      const result = await window.fanDesktop.project.saveToPath({
        filePath: state.project.currentFilePath,
        content
      });
      if (result) {
        editorStore.markProjectSaved(result.filePath, result.recentProjects);
        await window.fanDesktop.project.clearAutosave();
      }
      return result;
    }

    const result = await window.fanDesktop.project.saveAs(content);
    if (result) {
      editorStore.markProjectSaved(result.filePath, result.recentProjects);
      await window.fanDesktop.project.clearAutosave();
    }
    return result;
  },

  async saveProjectAs() {
    const state = editorStore.getState();
    const result = await window.fanDesktop.project.saveAs(buildProjectDocument(state));
    if (result) {
      editorStore.markProjectSaved(result.filePath, result.recentProjects);
      await window.fanDesktop.project.clearAutosave();
    }
    return result;
  },

  async openProject() {
    const currentState = editorStore.getState();
    if (currentState.project.dirty) {
      const confirmed = window.confirm('当前项目有未保存修改，确定打开其他项目吗？');
      if (!confirmed) return;
    }
    const payload = await window.fanDesktop.project.open();
    await applyOpenResult(payload);
  },

  async openRecentProject(filePath: string) {
    if (!filePath) return;
    const currentState = editorStore.getState();
    if (currentState.project.dirty && currentState.project.currentFilePath !== filePath) {
      const confirmed = window.confirm('当前项目有未保存修改，确定打开最近项目吗？');
      if (!confirmed) return;
    }
    try {
      const payload = await window.fanDesktop.project.openRecent(filePath);
      await applyOpenResult(payload);
    } catch {
      window.alert('最近项目无法打开，文件可能已被移动或删除。');
      await this.loadRecentProjects();
    }
  }
};
