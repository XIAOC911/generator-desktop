import { contextBridge, ipcRenderer } from 'electron';

const api = {
  file: {
    openImages: () => ipcRenderer.invoke('file:open-images'),
    openJson: () => ipcRenderer.invoke('file:open-json'),
    pickDirectory: () => ipcRenderer.invoke('file:pick-directory')
  },
  project: {
    saveAs: (payload: unknown) => ipcRenderer.invoke('project:save-as', payload),
    saveToPath: (payload: unknown) => ipcRenderer.invoke('project:save-to-path', payload),
    open: () => ipcRenderer.invoke('project:open'),
    openRecent: (filePath: string) => ipcRenderer.invoke('project:open-recent', filePath),
    listRecent: () => ipcRenderer.invoke('project:list-recent'),
    saveAutosave: (payload: unknown) => ipcRenderer.invoke('project:save-autosave', payload),
    loadAutosave: () => ipcRenderer.invoke('project:load-autosave'),
    clearAutosave: () => ipcRenderer.invoke('project:clear-autosave')
  },
  template: {
    load: () => ipcRenderer.invoke('template:load'),
    save: (payload: unknown) => ipcRenderer.invoke('template:save', payload)
  },
  psd: {
    openTemplates: () => ipcRenderer.invoke('psd:open-templates'),
    setProductSlot: (payload: unknown) => ipcRenderer.invoke('psd:set-product-slot', payload),
    getLayerMask: (payload: unknown) => ipcRenderer.invoke('psd:get-layer-mask', payload),
    renderCleanBackground: (payload: { templateId: string; excludeLayerIds: string[] }) => ipcRenderer.invoke('psd:render-clean-background', payload),
    clearCache: (payload: { templateId?: string }) => ipcRenderer.invoke('psd:clear-cache', payload)
  },
  export: {
    writeJobs: (payload: unknown) => ipcRenderer.invoke('export:write-jobs', payload)
  },
  matting: {
    run: (payload: unknown) => ipcRenderer.invoke('matting:run', payload),
    getProviderStatus: () => ipcRenderer.invoke('matting:get-provider-status'),
    exportCutouts: (payload: unknown) => ipcRenderer.invoke('matting:export-cutouts', payload)
  },
  llm: {
    getSettings: () => ipcRenderer.invoke('llm:get-settings'),
    saveSettings: (payload: unknown) => ipcRenderer.invoke('llm:save-settings', payload),
    clearApiKey: () => ipcRenderer.invoke('llm:clear-api-key'),
    generate: (payload: unknown) => ipcRenderer.invoke('llm:generate', payload),
    generateImage: (payload: unknown) => ipcRenderer.invoke('llm:generate-image', payload),
    request: (payload: unknown) => ipcRenderer.invoke('llm:request', payload)
  }
};

contextBridge.exposeInMainWorld('fanDesktop', api);
