const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '学校成绩单离线处理器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('open-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: filters || [
      { name: 'Excel文件', extensions: ['xlsx', 'xls'] },
      { name: 'CSV文件', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled) return null
  return result.filePaths
})

ipcMain.handle('read-excel', async (event, filePath) => {
  try {
    const workbook = XLSX.readFile(filePath)
    const sheets = {}
    for (const name of workbook.SheetNames) {
      sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
    }
    return { success: true, data: sheets, sheetNames: workbook.SheetNames }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-excel', async (event, { filePath, sheets }) => {
  try {
    const workbook = XLSX.utils.book_new()
    for (const [name, data] of Object.entries(sheets)) {
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(workbook, ws, name)
    }
    XLSX.writeFile(workbook, filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-file-dialog', async (event, { defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'output.xlsx',
    filters: filters || [
      { name: 'Excel文件', extensions: ['xlsx'] },
      { name: 'CSV文件', extensions: ['csv'] }
    ]
  })
  if (result.canceled) return null
  return result.filePath
})

const processor = require('./src/processor/merger')
const anomalyDetector = require('./src/processor/anomaly')

ipcMain.handle('process-grades', async (event, { gradeData, studentRoster, courseCredits, overallFormula }) => {
  try {
    const merged = processor.mergeGrades(gradeData, studentRoster || [], courseCredits || [], overallFormula)
    const anomalies = anomalyDetector.detect(merged, studentRoster || [], courseCredits || [], overallFormula)
    const makeupList = anomalyDetector.getMakeupList(merged)
    const deferredList = anomalyDetector.getDeferredList(merged)
    const classSummary = anomalyDetector.getClassSummary(merged)
    return { success: true, merged, anomalies, makeupList, deferredList, classSummary }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
