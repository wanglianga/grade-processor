const merger = require('./merger')

function detect(merged, studentRoster, courseCredits, overallFormula) {
  const anomalies = []
  const formula = overallFormula || { regularWeight: 0.3, finalWeight: 0.7 }

  const studentMap = new Map()
  for (const row of studentRoster) {
    const norm = merger.normalizeStudentRow(row)
    if (norm.studentId) studentMap.set(norm.studentId, norm)
  }

  for (const record of merged) {
    if (!record.studentExists && record.studentId) {
      anomalies.push({
        type: '学号不存在',
        severity: 'error',
        studentId: record.studentId,
        name: record.name,
        course: record.course,
        message: `学号 ${record.studentId} 不在学生名单中`
      })
    }
  }

  const courseStudentMap = new Map()
  for (const record of merged) {
    const key = `${record.studentId}|||${record.course}`
    if (!courseStudentMap.has(key)) {
      courseStudentMap.set(key, [])
    }
    courseStudentMap.get(key).push(record)
  }

  for (const [key, records] of courseStudentMap) {
    if (records.length > 1) {
      anomalies.push({
        type: '同课重复成绩',
        severity: 'warning',
        studentId: records[0].studentId,
        name: records[0].name,
        course: records[0].course,
        message: `学号 ${records[0].studentId} 课程 ${records[0].course} 存在 ${records.length} 条成绩记录`,
        detail: records.map(r => `平时:${r.regularScore} 期末:${r.finalScore} 总评:${r.overallScore}`).join('; ')
      })
    }
  }

  for (const record of merged) {
    if (record.overallScore !== null && record.calculatedOverall !== null) {
      const diff = Math.abs(record.overallScore - record.calculatedOverall)
      if (diff > 1) {
        anomalies.push({
          type: '总评分计算不一致',
          severity: 'warning',
          studentId: record.studentId,
          name: record.name,
          course: record.course,
          message: `学号 ${record.studentId} 课程 ${record.course} 总评 ${record.overallScore} 与计算值 ${record.calculatedOverall} 不一致(差值${diff})`,
          detail: `平时:${record.regularScore} × ${formula.regularWeight} + 期末:${record.finalScore} × ${formula.finalWeight} = ${record.calculatedOverall}`
        })
      }
    }
  }

  for (const record of merged) {
    if (record.absent) {
      const hasScore = (record.regularScore !== null && record.regularScore > 0) ||
                       (record.finalScore !== null && record.finalScore > 0) ||
                       (record.overallScore !== null && record.overallScore > 0)
      if (hasScore) {
        anomalies.push({
          type: '缺考但有分数',
          severity: 'error',
          studentId: record.studentId,
          name: record.name,
          course: record.course,
          message: `学号 ${record.studentId} 课程 ${record.course} 标记缺考但存在分数`,
          detail: `平时:${record.regularScore} 期末:${record.finalScore} 总评:${record.overallScore}`
        })
      }
    }
  }

  for (const record of merged) {
    if (record.cheating) {
      anomalies.push({
        type: '作弊不得补考',
        severity: 'error',
        studentId: record.studentId,
        name: record.name,
        course: record.course,
        message: `学号 ${record.studentId} 课程 ${record.course} 作弊，不得参加补考`,
        makeupAllowed: false
      })
    }
  }

  return anomalies
}

function getMakeupList(merged) {
  const makeupRecords = []
  for (const record of merged) {
    const needMakeup = (record.overallScore !== null && record.overallScore < 60) ||
                       record.absent === true
    const cheating = record.cheating === true
    const deferred = record.deferred === true

    if (needMakeup && !cheating && !deferred) {
      makeupRecords.push({
        studentId: record.studentId,
        name: record.name,
        className: record.className,
        course: record.course,
        credits: record.credits,
        overallScore: record.overallScore,
        regularScore: record.regularScore,
        finalScore: record.finalScore,
        absent: record.absent,
        teacher: record.teacher,
        makeupAllowed: true
      })
    }
  }
  return makeupRecords
}

function getDeferredList(merged) {
  const deferredRecords = []
  for (const record of merged) {
    if (record.deferred === true) {
      deferredRecords.push({
        studentId: record.studentId,
        name: record.name,
        className: record.className,
        course: record.course,
        credits: record.credits,
        teacher: record.teacher
      })
    }
  }
  return deferredRecords
}

function getClassSummary(merged) {
  const classMap = new Map()
  for (const record of merged) {
    const cls = record.className || '未知班级'
    if (!classMap.has(cls)) {
      classMap.set(cls, {
        className: cls,
        students: new Set(),
        courseStats: new Map()
      })
    }
    const classData = classMap.get(cls)
    classData.students.add(record.studentId)

    const course = record.course || '未知课程'
    if (!classData.courseStats.has(course)) {
      classData.courseStats.set(course, {
        course,
        scores: [],
        failCount: 0,
        totalCount: 0
      })
    }
    const stats = classData.courseStats.get(course)
    stats.totalCount++
    if (record.overallScore !== null && !record.absent && !record.deferred) {
      stats.scores.push(record.overallScore)
      if (record.overallScore < 60) stats.failCount++
    }
  }

  const summary = []
  for (const [cls, data] of classMap) {
    const courseList = []
    for (const [course, stats] of data.courseStats) {
      const avg = stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length * 100) / 100
        : null
      const max = stats.scores.length > 0 ? Math.max(...stats.scores) : null
      const min = stats.scores.length > 0 ? Math.min(...stats.scores) : null
      const passRate = stats.scores.length > 0
        ? Math.round((1 - stats.failCount / stats.scores.length) * 10000) / 100
        : null
      courseList.push({
        course,
        average: avg,
        max,
        min,
        passRate,
        failCount: stats.failCount,
        totalCount: stats.totalCount
      })
    }
    summary.push({
      className: cls,
      studentCount: data.students.size,
      courseStats: courseList
    })
  }
  return summary
}

module.exports = { detect, getMakeupList, getDeferredList, getClassSummary }
