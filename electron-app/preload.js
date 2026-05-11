const { ipcRenderer } = require('electron');
window.electronAPI = {
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
};
