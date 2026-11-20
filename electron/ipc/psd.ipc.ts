import { createPsdService } from '../services/psd.service';

type Deps = {
  ipcMain: Electron.IpcMain;
  dialog: Electron.Dialog;
  fs: typeof import('node:fs/promises');
};

export function registerPsdIpc({ ipcMain, dialog, fs }: Deps) {
  const service = createPsdService({ fs });

  ipcMain.handle('psd:open-templates', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PSD', extensions: ['psd'] }]
    });
    if (result.canceled || !result.filePaths.length) return [];
    return service.openTemplates(result.filePaths);
  });

  ipcMain.handle('psd:set-product-slot', async (event, payload: { templateId: string; layerId: string }) => {
    const { templateId, layerId } = payload;
    return service.setProductSlot(templateId, layerId);
  });

  ipcMain.handle('psd:get-layer-mask', async (event, payload: { templateId: string; layerId: string }) => {
    const { templateId, layerId } = payload;
    return service.getLayerMask(templateId, layerId);
  });

  ipcMain.handle('psd:render-clean-background', async (event, payload: { templateId: string; excludeLayerIds: string[] }) => {
    return service.renderCleanBackground(payload.templateId, payload.excludeLayerIds);
  });

  ipcMain.handle('psd:clear-cache', async (event, payload: { templateId?: string }) => {
    service.clearCache(payload.templateId);
    return true;
  });

}
