'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfg', {
  get: () => ipcRenderer.invoke('cfg:get'),
  set: (key, value, id) => ipcRenderer.invoke('cfg:set', key, value, id),
  action: (name, arg) => ipcRenderer.invoke('cfg:action', name, arg),
  onChanged: (cb) => ipcRenderer.on('cfg:changed', () => cb()),
});
