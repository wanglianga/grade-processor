const state = {
  gradeFiles: [],
  gradeData: [],
  studentFile: null,
  studentData: [],
  creditFile: null,
  creditData: [],
  mergedData: [],
  anomalies: [],
  makeupList: [],
  deferredList: [],
  classSummary: [],
  gradeSheetMap: {},
  studentSheetMap: {},
  creditSheetMap: {}
}

function showToast(msg, type) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = 'toast ' + (type || 'info')
  t.style.display = 'block'
  setTimeout(() => { t.style.display = 'none' }, 3000)
}

function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex'
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none'
}

function updateProcessButton() {
  const btn = document.getElementById('processBtn')
  const hasGrades = state.gradeData.length > 0
  const hasStudents = state.studentData.length > 0
  const hasCredits = state.creditData.length > 0
  btn.disabled = !(hasGrades && (hasStudents || hasCredits))
}

function renderFileList(containerId, files, onRemove) {
  const container = document.getElementById(containerId)
  container.innerHTML = ''
  files.forEach((file, idx) => {
    const div = document.createElement('div')
    div.className = 'file-item'
    div.innerHTML = `
      <span class="file-item-name" title="${file.path}">${file.name}</span>
      <button class="file-item-remove" data-idx="${idx}">&times;</button>
    `
    div.querySelector('.file-item-remove').addEventListener('click', () => onRemove(idx))
    container.appendChild(div)
  })
}

function formatBool(val) {
  return val
    ? '<span class="boolean-yes">是</span>'
    : '<span class="boolean-no">否</span>'
}

function formatScore(val, threshold) {
  if (val === null || val === undefined) return '-'
  if (threshold !== undefined && val < threshold) return `<span class="score-fail">${val}</span>`
  return val
}

async function openAndReadFile(type) {
  const paths = await window.electronAPI.openFile()
  if (!paths) return

  for (const fp of paths) {
    const result = await window.electronAPI.readExcel(fp)
    if (!result.success) {
      showToast('读取文件失败: ' + result.error, 'error')
      continue
    }

    const fileName = fp.split(/[\\/]/).pop()

    if (type === 'grade') {
      if (state.gradeFiles.find(f => f.path === fp)) continue
      state.gradeFiles.push({ path: fp, name: fileName })
      state.gradeSheetMap[fp] = { sheets: result.data, sheetNames: result.sheetNames }

      if (result.sheetNames.length === 1) {
        state.gradeData.push(...result.data[result.sheetNames[0]])
      } else {
        showSheetSelector('grade', fp, result.sheetNames)
      }
      renderFileList('gradeFileList', state.gradeFiles, (idx) => {
        const removed = state.gradeFiles[idx]
        delete state.gradeSheetMap[removed.path]
        state.gradeFiles.splice(idx, 1)
        rebuildGradeData()
        renderFileList('gradeFileList', state.gradeFiles, arguments.callee)
        updateProcessButton()
      })
    } else if (type === 'student') {
      state.studentFile = { path: fp, name: fileName }
      state.studentSheetMap = { sheets: result.data, sheetNames: result.sheetNames }

      if (result.sheetNames.length === 1) {
        state.studentData = result.data[result.sheetNames[0]]
      } else {
        showSheetSelector('student', fp, result.sheetNames)
      }
      renderFileList('studentFileList', [state.studentFile], (idx) => {
        state.studentFile = null
        state.studentData = []
        state.studentSheetMap = {}
        renderFileList('studentFileList', [], () => {})
        updateProcessButton()
      })
    } else if (type === 'credit') {
      state.creditFile = { path: fp, name: fileName }
      state.creditSheetMap = { sheets: result.data, sheetNames: result.sheetNames }

      if (result.sheetNames.length === 1) {
        state.creditData = result.data[result.sheetNames[0]]
      } else {
        showSheetSelector('credit', fp, result.sheetNames)
      }
      renderFileList('creditFileList', [state.creditFile], (idx) => {
        state.creditFile = null
        state.creditData = []
        state.creditSheetMap = {}
        renderFileList('creditFileList', [], () => {})
        updateProcessButton()
      })
    }
  }
  updateProcessButton()
  showToast('文件导入成功', 'success')
}

function showSheetSelector(type, filePath, sheetNames) {
  let selectorId, selectId, confirmId
  if (type === 'grade') {
    selectorId = 'gradeSheetSelector'
    selectId = 'gradeSheetSelect'
    confirmId = 'gradeSheetConfirm'
  } else if (type === 'student') {
    selectorId = 'studentSheetSelector'
    selectId = 'studentSheetSelect'
    confirmId = 'studentSheetConfirm'
  } else {
    selectorId = 'creditSheetSelector'
    selectId = 'creditSheetSelect'
    confirmId = 'creditSheetConfirm'
  }

  const selector = document.getElementById(selectorId)
  const select = document.getElementById(selectId)
  selector.style.display = 'flex'
  select.innerHTML = sheetNames.map(n => `<option value="${n}">${n}</option>`).join('')

  const oldBtn = document.getElementById(confirmId)
  const newBtn = oldBtn.cloneNode(true)
  oldBtn.parentNode.replaceChild(newBtn, oldBtn)

  newBtn.addEventListener('click', () => {
    const chosen = select.value
    const sheetMap = type === 'grade' ? state.gradeSheetMap : type === 'student' ? state.studentSheetMap : state.creditSheetMap
    const data = sheetMap.sheets[chosen]
    if (type === 'grade') {
      state.gradeSheetMap[filePath].selectedSheet = chosen
      rebuildGradeData()
    } else if (type === 'student') {
      state.studentData = data
    } else {
      state.creditData = data
    }
    selector.style.display = 'none'
    updateProcessButton()
    showToast('工作表已选择', 'success')
  })
}

function rebuildGradeData() {
  state.gradeData = []
  for (const f of state.gradeFiles) {
    const map = state.gradeSheetMap[f.path]
    if (map) {
      const sheetName = map.selectedSheet || map.sheetNames[0]
      state.gradeData.push(...(map.sheets[sheetName] || []))
    }
  }
}

async function processGrades() {
  showLoading()
  try {
    const regularWeight = parseFloat(document.getElementById('regularWeight').value) || 0.3
    const finalWeight = parseFloat(document.getElementById('finalWeight').value) || 0.7

    const result = await window.electronAPI.processGrades({
      gradeData: state.gradeData,
      studentRoster: state.studentData,
      courseCredits: state.creditData,
      overallFormula: { regularWeight, finalWeight }
    })

    if (!result.success) {
      showToast('处理失败: ' + result.error, 'error')
      hideLoading()
      return
    }

    state.mergedData = result.merged
    state.anomalies = result.anomalies
    state.makeupList = result.makeupList
    state.deferredList = result.deferredList
    state.classSummary = result.classSummary

    renderMergedTable()
    renderAnomalyTable()
    renderMakeupTable()
    renderDeferredTable()
    renderSummaryTable()

    const badge = document.getElementById('anomalyBadge')
    badge.textContent = state.anomalies.length
    badge.style.display = state.anomalies.length > 0 ? 'inline-flex' : 'none'

    showToast(`处理完成! 发现 ${state.anomalies.length} 条异常`, state.anomalies.length > 0 ? 'info' : 'success')
  } catch (err) {
    showToast('处理出错: ' + err.message, 'error')
  }
  hideLoading()
}

function renderMergedTable(filter) {
  const container = document.getElementById('mergedTable')
  let data = state.mergedData

  if (filter) {
    const kw = filter.toLowerCase()
    data = data.filter(r =>
      (r.studentId || '').toLowerCase().includes(kw) ||
      (r.name || '').toLowerCase().includes(kw) ||
      (r.course || '').toLowerCase().includes(kw) ||
      (r.className || '').toLowerCase().includes(kw)
    )
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">暂无数据，请先导入并处理</div></div>'
    return
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>学号</th><th>姓名</th><th>班级</th><th>课程</th>
          <th>平时分</th><th>期末分</th><th>总评</th><th>计算总评</th>
          <th>学分</th><th>缺考</th><th>作弊</th><th>缓考</th><th>任课教师</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(r => `<tr>
          <td>${r.studentId}</td>
          <td>${r.name}</td>
          <td>${r.className}</td>
          <td>${r.course}</td>
          <td>${formatScore(r.regularScore)}</td>
          <td>${formatScore(r.finalScore)}</td>
          <td>${formatScore(r.overallScore, 60)}</td>
          <td>${formatScore(r.calculatedOverall, 60)}</td>
          <td>${r.credits !== null ? r.credits : '-'}</td>
          <td>${formatBool(r.absent)}</td>
          <td>${formatBool(r.cheating)}</td>
          <td>${formatBool(r.deferred)}</td>
          <td>${r.teacher}</td>
          <td>${!r.studentExists ? '<span class="status-tag error">学号不在名单</span>' : r.cheating ? '<span class="status-tag error">作弊</span>' : r.absent ? '<span class="status-tag warning">缺考</span>' : r.deferred ? '<span class="status-tag info">缓考</span>' : r.overallScore !== null && r.overallScore < 60 ? '<span class="status-tag warning">不及格</span>' : '<span class="status-tag success">正常</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `
}

function renderAnomalyTable(filter) {
  const container = document.getElementById('anomalyTable')
  let data = state.anomalies

  if (filter && filter !== 'all') {
    data = data.filter(r => r.type === filter)
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">未发现异常</div></div>'
    return
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>异常类型</th><th>严重级别</th><th>学号</th><th>姓名</th><th>课程</th><th>详细信息</th></tr>
      </thead>
      <tbody>
        ${data.map(r => `<tr>
          <td><span class="status-tag ${r.severity === 'error' ? 'error' : 'warning'}">${r.type}</span></td>
          <td class="anomaly-severity-${r.severity}">${r.severity === 'error' ? '错误' : '警告'}</td>
          <td>${r.studentId || ''}</td>
          <td>${r.name || ''}</td>
          <td>${r.course || ''}</td>
          <td title="${r.detail || ''}">${r.message}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `
}

function renderMakeupTable() {
  const container = document.getElementById('makeupTable')
  const data = state.makeupList

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-text">无需补考</div></div>'
    return
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>学号</th><th>姓名</th><th>班级</th><th>课程</th><th>学分</th><th>总评成绩</th><th>缺考</th><th>任课教师</th></tr>
      </thead>
      <tbody>
        ${data.map(r => `<tr>
          <td>${r.studentId}</td>
          <td>${r.name}</td>
          <td>${r.className}</td>
          <td>${r.course}</td>
          <td>${r.credits !== null ? r.credits : '-'}</td>
          <td>${formatScore(r.overallScore, 60)}</td>
          <td>${formatBool(r.absent)}</td>
          <td>${r.teacher}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `
}

function renderDeferredTable() {
  const container = document.getElementById('deferredTable')
  const data = state.deferredList

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">无缓考记录</div></div>'
    return
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr><th>学号</th><th>姓名</th><th>班级</th><th>课程</th><th>学分</th><th>任课教师</th></tr>
      </thead>
      <tbody>
        ${data.map(r => `<tr>
          <td>${r.studentId}</td>
          <td>${r.name}</td>
          <td>${r.className}</td>
          <td>${r.course}</td>
          <td>${r.credits !== null ? r.credits : '-'}</td>
          <td>${r.teacher}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `
}

function renderSummaryTable() {
  const container = document.getElementById('summaryTable')
  const data = state.classSummary

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无汇总数据</div></div>'
    return
  }

  let html = ''
  for (const cls of data) {
    html += `<div class="summary-card">
      <h3>${cls.className} (共 ${cls.studentCount} 人)</h3>
      <table>
        <thead>
          <tr><th>课程</th><th>人数</th><th>平均分</th><th>最高分</th><th>最低分</th><th>不及格人数</th><th>及格率</th></tr>
        </thead>
        <tbody>
          ${cls.courseStats.map(c => `<tr>
            <td>${c.course}</td>
            <td>${c.totalCount}</td>
            <td>${c.average !== null ? c.average : '-'}</td>
            <td>${c.max !== null ? c.max : '-'}</td>
            <td>${c.min !== null ? c.min : '-'}</td>
            <td>${c.failCount}</td>
            <td>${c.passRate !== null ? c.passRate + '%' : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`
  }
  container.innerHTML = html
}

async function exportData(type) {
  const filePath = await window.electronAPI.saveFileDialog({
    defaultName: `${type}_${new Date().toISOString().slice(0, 10)}.xlsx`
  })
  if (!filePath) return

  let sheets = {}

  if (type === '合并成绩') {
    sheets['合并成绩'] = state.mergedData.map(r => ({
      '学号': r.studentId, '姓名': r.name, '班级': r.className, '课程': r.course,
      '平时分': r.regularScore, '期末分': r.finalScore, '总评': r.overallScore,
      '计算总评': r.calculatedOverall, '学分': r.credits,
      '缺考': r.absent ? '是' : '否', '作弊': r.cheating ? '是' : '否',
      '缓考': r.deferred ? '是' : '否', '任课教师': r.teacher,
      '学号是否在名单': r.studentExists ? '是' : '否'
    }))
  } else if (type === '异常清单') {
    sheets['异常清单'] = state.anomalies.map(r => ({
      '异常类型': r.type, '严重级别': r.severity === 'error' ? '错误' : '警告',
      '学号': r.studentId, '姓名': r.name, '课程': r.course,
      '详细信息': r.message, '补充说明': r.detail || ''
    }))
  } else if (type === '补考名单') {
    sheets['补考名单'] = state.makeupList.map(r => ({
      '学号': r.studentId, '姓名': r.name, '班级': r.className, '课程': r.course,
      '学分': r.credits, '总评成绩': r.overallScore, '缺考': r.absent ? '是' : '否',
      '任课教师': r.teacher
    }))
  } else if (type === '缓考名单') {
    sheets['缓考名单'] = state.deferredList.map(r => ({
      '学号': r.studentId, '姓名': r.name, '班级': r.className, '课程': r.course,
      '学分': r.credits, '任课教师': r.teacher
    }))
  } else if (type === '班级汇总') {
    for (const cls of state.classSummary) {
      sheets[cls.className] = cls.courseStats.map(c => ({
        '课程': c.course, '人数': c.totalCount, '平均分': c.average,
        '最高分': c.max, '最低分': c.min, '不及格人数': c.failCount, '及格率': c.passRate !== null ? c.passRate + '%' : ''
      }))
    }
  }

  const result = await window.electronAPI.saveExcel(filePath, sheets)
  if (result.success) {
    showToast('导出成功!', 'success')
  } else {
    showToast('导出失败: ' + result.error, 'error')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.file-drop-zone').forEach(zone => {
    const type = zone.dataset.type

    zone.addEventListener('click', () => openAndReadFile(type))

    zone.addEventListener('dragover', (e) => {
      e.preventDefault()
      zone.classList.add('active')
    })

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('active')
    })

    zone.addEventListener('drop', async (e) => {
      e.preventDefault()
      zone.classList.remove('active')
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
      )
      for (const file of files) {
        const result = await window.electronAPI.readExcel(file.path)
        if (!result.success) {
          showToast('读取文件失败: ' + result.error, 'error')
          continue
        }

        if (type === 'grade') {
          if (state.gradeFiles.find(f => f.path === file.path)) continue
          state.gradeFiles.push({ path: file.path, name: file.name })
          state.gradeSheetMap[file.path] = { sheets: result.data, sheetNames: result.sheetNames }
          if (result.sheetNames.length === 1) {
            state.gradeData.push(...result.data[result.sheetNames[0]])
          } else {
            showSheetSelector('grade', file.path, result.sheetNames)
          }
        } else if (type === 'student') {
          state.studentFile = { path: file.path, name: file.name }
          state.studentSheetMap = { sheets: result.data, sheetNames: result.sheetNames }
          if (result.sheetNames.length === 1) {
            state.studentData = result.data[result.sheetNames[0]]
          } else {
            showSheetSelector('student', file.path, result.sheetNames)
          }
        } else if (type === 'credit') {
          state.creditFile = { path: file.path, name: file.name }
          state.creditSheetMap = { sheets: result.data, sheetNames: result.sheetNames }
          if (result.sheetNames.length === 1) {
            state.creditData = result.data[result.sheetNames[0]]
          } else {
            showSheetSelector('credit', file.path, result.sheetNames)
          }
        }
      }
      updateProcessButton()
      showToast('文件导入成功', 'success')
    })
  })

  document.getElementById('processBtn').addEventListener('click', processGrades)

  const rw = document.getElementById('regularWeight')
  const fw = document.getElementById('finalWeight')
  const hint = document.getElementById('weightHint')

  function updateWeightHint() {
    const total = (parseFloat(rw.value) || 0) + (parseFloat(fw.value) || 0)
    hint.textContent = '权重合计：' + total.toFixed(1)
    hint.classList.toggle('error', Math.abs(total - 1) > 0.01)
  }

  rw.addEventListener('input', updateWeightHint)
  fw.addEventListener('input', updateWeightHint)

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active')
    })
  })

  document.getElementById('mergedSearch').addEventListener('input', (e) => {
    renderMergedTable(e.target.value)
  })

  document.getElementById('anomalyFilter').addEventListener('change', (e) => {
    renderAnomalyTable(e.target.value)
  })

  document.getElementById('exportMerged').addEventListener('click', () => exportData('合并成绩'))
  document.getElementById('exportAnomalies').addEventListener('click', () => exportData('异常清单'))
  document.getElementById('exportMakeup').addEventListener('click', () => exportData('补考名单'))
  document.getElementById('exportDeferred').addEventListener('click', () => exportData('缓考名单'))
  document.getElementById('exportSummary').addEventListener('click', () => exportData('班级汇总'))
})
