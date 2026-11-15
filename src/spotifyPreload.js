'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sp', {
  status: () => ipcRenderer.invoke('sp:status'),
  setClientId: (id) => ipcRenderer.invoke('sp:setClientId', id),
  login: () => ipcRenderer.invoke('sp:login'),
  logout: () => ipcRenderer.invoke('sp:logout'),
  reset: () => ipcRenderer.invoke('sp:reset'),
  api: (method, path, opts) => ipcRenderer.invoke('sp:api', method, path, opts || {}),
  token: () => ipcRenderer.invoke('sp:token'),
  open: (what) => ipcRenderer.invoke('sp:open', what),
  onChanged: (cb) => ipcRenderer.on('sp:changed', (_e, st) => cb(st)),
});
