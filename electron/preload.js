import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vdrop", {
  getBootstrap: () => ipcRenderer.invoke("vdrop:get-bootstrap"),
  selectOutputDirectory: currentPath => ipcRenderer.invoke("vdrop:select-output-directory", currentPath),
  listFolders: dirPath => ipcRenderer.invoke("vdrop:list-folders", dirPath),
  openExternal: url => ipcRenderer.invoke("vdrop:open-external", url),
  revealItem: itemPath => ipcRenderer.invoke("vdrop:reveal-item", itemPath),
  startDownload: payload => ipcRenderer.invoke("vdrop:start-download", payload),
  cancelDownload: jobId => ipcRenderer.invoke("vdrop:cancel-download", jobId),
  installDependency: target => ipcRenderer.invoke("vdrop:install-dependency", target),
  onDownloadEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("vdrop:download-event", listener);
    return () => ipcRenderer.removeListener("vdrop:download-event", listener);
  },
  onInstallEvent: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("vdrop:install-event", listener);
    return () => ipcRenderer.removeListener("vdrop:install-event", listener);
  },
});
