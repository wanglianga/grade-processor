const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (filters) => ipcRenderer.invoke('open-file', filters),
  readExcel: (filePath) => ipcRenderer.invoke('read-excel', filePath),
  saveExcel: (filePath, sheets) => ipcRenderer.invoke('save-excel', { filePath, sheets }),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  processGrades: (data) => ipcRenderer.invoke('process-grades', data)
})
