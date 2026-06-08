const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const os = require('os')

let mainWindow

const TEMPLATE_DIR = path.join(os.homedir(), '.grade-processor')
const TEMPLATE_FILE = path.join(TEMPLATE_DIR, 'course_templates.json')

function ensureTemplateDir() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true })
  }
}

function loadTemplates() {
  ensureTemplateDir()
  try {
    if (fs.existsSync(TEMPLATE_FILE)) {
      const data = fs.readFileSync(TEMPLATE_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('Failed to load templates:', err.message)
  }
  return {}
}

function saveTemplates(templates) {
  ensureTemplateDir()
  try {
    fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(templates, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to save templates:', err.message)
    return false
  }
}

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

ipcMain.handle('process-grades', async (event, { gradeData, studentRoster, courseCredits, overallFormula, courseTemplates }) => {
  try {
    const merged = processor.mergeGrades(gradeData, studentRoster || [], courseCredits || [], overallFormula, courseTemplates || {})
    const anomalies = anomalyDetector.detect(merged, studentRoster || [], courseCredits || [], overallFormula, courseTemplates || {})
    const makeupList = anomalyDetector.getMakeupList(merged)
    const deferredList = anomalyDetector.getDeferredList(merged)
    const classSummary = anomalyDetector.getClassSummary(merged)
    const classTeacherView = anomalyDetector.getClassTeacherView(merged)
    return { success: true, merged, anomalies, makeupList, deferredList, classSummary, classTeacherView }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('load-templates', async () => {
  try {
    const templates = loadTemplates()
    return { success: true, templates }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('save-templates', async (event, templates) => {
  try {
    const result = saveTemplates(templates)
    return { success: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
