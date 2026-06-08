function normalizeFieldNames(row) {
  const mapping = {
    '学号': 'studentId',
    '姓名': 'name',
    '班级': 'className',
    '课程': 'course',
    '课程名称': 'course',
    '课程名': 'course',
    '平时分': 'regularScore',
    '平时成绩': 'regularScore',
    '期末分': 'finalScore',
    '期末成绩': 'finalScore',
    '总评': 'overallScore',
    '总评成绩': 'overallScore',
    '学分': 'credits',
    '缺考': 'absent',
    '作弊': 'cheating',
    '缓考': 'deferred',
    '任课教师': 'teacher',
    '教师': 'teacher',
    '任课老师': 'teacher'
  }
  const result = {}
  for (const [key, value] of Object.entries(row)) {
    const trimmed = key.trim()
    const normKey = mapping[trimmed] || trimmed
    result[normKey] = value
  }
  return result
}

function parseBooleanField(value) {
  if (value === true || value === '是' || value === '√' || value === '1' || value === 1 || value === 'Y' || value === 'y') return true
  return false
}

function parseNumberField(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return isNaN(num) ? null : num
}

function normalizeGradeRow(row) {
  const norm = normalizeFieldNames(row)
  return {
    studentId: String(norm.studentId || '').trim(),
    name: String(norm.name || '').trim(),
    className: String(norm.className || '').trim(),
    course: String(norm.course || '').trim(),
    regularScore: parseNumberField(norm.regularScore),
    finalScore: parseNumberField(norm.finalScore),
    overallScore: parseNumberField(norm.overallScore),
    credits: parseNumberField(norm.credits),
    absent: parseBooleanField(norm.absent),
    cheating: parseBooleanField(norm.cheating),
    deferred: parseBooleanField(norm.deferred),
    teacher: String(norm.teacher || '').trim()
  }
}

function normalizeStudentRow(row) {
  const norm = normalizeFieldNames(row)
  return {
    studentId: String(norm.studentId || '').trim(),
    name: String(norm.name || '').trim(),
    className: String(norm.className || '').trim()
  }
}

function normalizeCreditRow(row) {
  const norm = normalizeFieldNames(row)
  return {
    course: String(norm.course || '').trim(),
    courseName: String(norm.courseName || norm.course || '').trim(),
    credits: parseNumberField(norm.credits),
    teacher: String(norm.teacher || '').trim()
  }
}

function calculateOverall(regularScore, finalScore, formula) {
  if (regularScore === null || finalScore === null) return null
  const r = formula.regularWeight || 0.3
  const f = formula.finalWeight || 0.7
  return Math.round((regularScore * r + finalScore * f) * 100) / 100
}

function normalizeGradeRows(gradeData) {
  const normalizedGrades = []
  for (const item of gradeData) {
    if (Array.isArray(item)) {
      for (const row of item) {
        normalizedGrades.push(normalizeGradeRow(row))
      }
    } else if (item && typeof item === 'object') {
      normalizedGrades.push(normalizeGradeRow(item))
    }
  }
  return normalizedGrades
}

function mergeGrades(gradeData, studentRoster, courseCredits, overallFormula) {
  const formula = overallFormula || { regularWeight: 0.3, finalWeight: 0.7 }

  const normalizedGrades = normalizeGradeRows(gradeData)

  const studentMap = new Map()
  for (const row of studentRoster) {
    const s = normalizeStudentRow(row)
    if (s.studentId) {
      studentMap.set(s.studentId, s)
    }
  }

  const creditMap = new Map()
  for (const row of courseCredits) {
    const c = normalizeCreditRow(row)
    if (c.course) {
      creditMap.set(c.course, c)
    }
  }

  const merged = []
  for (const g of normalizedGrades) {
    const student = studentMap.get(g.studentId)
    const credit = creditMap.get(g.course)

    const enriched = {
      ...g,
      name: g.name || (student ? student.name : ''),
      className: g.className || (student ? student.className : ''),
      credits: g.credits !== null ? g.credits : (credit ? credit.credits : null),
      teacher: g.teacher || (credit ? credit.teacher : ''),
      studentExists: !!student,
      calculatedOverall: calculateOverall(g.regularScore, g.finalScore, formula)
    }

    merged.push(enriched)
  }

  return merged
}

module.exports = { mergeGrades, normalizeGradeRow, normalizeStudentRow, normalizeCreditRow, calculateOverall }
