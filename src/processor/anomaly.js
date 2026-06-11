const merger = require('./merger')

function detect(merged, studentRoster, courseCredits, overallFormula, courseTemplates) {
  const anomalies = []
  const defaultFormula = overallFormula || { regularWeight: 0.3, finalWeight: 0.7 }

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
        const formula = record.formulaUsed || merger.getFormulaForCourse(record.course, courseTemplates, defaultFormula)
        const e = formula.experimentWeight || 0
        let formulaDesc
        if (e > 0) {
          formulaDesc = `平时:${record.regularScore} × ${formula.regularWeight} + 实验:${record.experimentScore} × ${e} + 期末:${record.finalScore} × ${formula.finalWeight} = ${record.calculatedOverall}`
        } else {
          formulaDesc = `平时:${record.regularScore} × ${formula.regularWeight} + 期末:${record.finalScore} × ${formula.finalWeight} = ${record.calculatedOverall}`
        }
        anomalies.push({
          type: '总评分计算不一致',
          severity: 'warning',
          studentId: record.studentId,
          name: record.name,
          course: record.course,
          message: `学号 ${record.studentId} 课程 ${record.course} 总评 ${record.overallScore} 与计算值 ${record.calculatedOverall} 不一致(差值${diff})`,
          detail: formulaDesc
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
        regularScore: record.regularScore,
        experimentScore: record.experimentScore,
        finalScore: record.finalScore,
        overallScore: record.overallScore,
        teacher: record.teacher,
        absent: record.absent,
        cheating: record.cheating
      })
    }
  }
  return deferredRecords
}

function getDeferredSchedule(merged) {
  const courseMap = new Map()
  for (const record of merged) {
    if (record.deferred === true) {
      const course = record.course || '未知课程'
      if (!courseMap.has(course)) {
        courseMap.set(course, {
          course: course,
          teacher: record.teacher || '',
          credits: record.credits || null,
          students: []
        })
      }
      const courseData = courseMap.get(course)
      if (!courseData.teacher && record.teacher) {
        courseData.teacher = record.teacher
      }
      if (courseData.credits === null && record.credits !== null) {
        courseData.credits = record.credits
      }
      courseData.students.push({
        studentId: record.studentId,
        name: record.name,
        className: record.className,
        regularScore: record.regularScore,
        experimentScore: record.experimentScore,
        finalScore: record.finalScore,
        overallScore: record.overallScore
      })
    }
  }
  return Array.from(courseMap.values())
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

function scoreToGradePoint(score) {
  if (score === null || score === undefined) return 0
  if (score >= 90) return 4.0
  if (score >= 85) return 3.7
  if (score >= 82) return 3.3
  if (score >= 78) return 3.0
  if (score >= 75) return 2.7
  if (score >= 72) return 2.3
  if (score >= 68) return 2.0
  if (score >= 64) return 1.5
  if (score >= 60) return 1.0
  return 0
}

function calculateGPA(merged) {
  const studentMap = new Map()

  for (const record of merged) {
    if (!record.studentId) continue
    if (!studentMap.has(record.studentId)) {
      studentMap.set(record.studentId, {
        studentId: record.studentId,
        name: record.name,
        className: record.className,
        totalWeightedGP: 0,
        totalCredits: 0,
        courses: []
      })
    }
    const s = studentMap.get(record.studentId)
    s.name = s.name || record.name
    s.className = s.className || record.className

    const credits = record.credits || 0
    const score = record.overallScore

    if (score !== null && !record.absent && !record.cheating && !record.deferred && credits > 0) {
      const gp = scoreToGradePoint(score)
      s.totalWeightedGP += gp * credits
      s.totalCredits += credits
      s.courses.push({
        course: record.course,
        score: score,
        credits: credits,
        gradePoint: gp,
        failed: score < 60,
        absent: record.absent,
        cheating: record.cheating,
        deferred: record.deferred
      })
    } else {
      s.courses.push({
        course: record.course,
        score: score,
        credits: credits,
        gradePoint: 0,
        failed: score !== null && score < 60,
        absent: record.absent,
        cheating: record.cheating,
        deferred: record.deferred
      })
    }
  }

  const result = []
  for (const [_, s] of studentMap) {
    s.gpa = s.totalCredits > 0 ? Math.round(s.totalWeightedGP / s.totalCredits * 100) / 100 : 0
    result.push(s)
  }
  return result
}

function getGPAAnomalies(gpaData, threshold) {
  const anomalies = []
  const limit = threshold || 2.0
  for (const s of gpaData) {
    if (s.totalCredits > 0 && s.gpa < limit) {
      anomalies.push({
        studentId: s.studentId,
        name: s.name,
        className: s.className,
        gpa: s.gpa,
        totalCredits: s.totalCredits,
        type: '绩点异常',
        message: `学号 ${s.studentId} ${s.name} 绩点 ${s.gpa} 低于阈值 ${limit}`
      })
    }
  }
  return anomalies
}

function getClassTeacherView(merged) {
  const gpaData = calculateGPA(merged)
  const gpaAnomalies = getGPAAnomalies(gpaData)

  const classMap = new Map()
  for (const s of gpaData) {
    const cls = s.className || '未知班级'
    if (!classMap.has(cls)) {
      classMap.set(cls, {
        className: cls,
        students: new Map()
      })
    }
    const classData = classMap.get(cls)

    const failedCourses = s.courses.filter(c => c.failed && !c.absent && !c.cheating && !c.deferred)
    const absentCourses = s.courses.filter(c => c.absent)
    const cheatingCourses = s.courses.filter(c => c.cheating)
    const gpaAbnormal = gpaAnomalies.find(a => a.studentId === s.studentId)

    if (failedCourses.length > 0 || absentCourses.length > 0 || cheatingCourses.length > 0 || gpaAbnormal) {
      classData.students.set(s.studentId, {
        studentId: s.studentId,
        name: s.name,
        className: cls,
        gpa: s.gpa,
        failedCourses: failedCourses.map(c => ({ course: c.course, score: c.score, credits: c.credits })),
        absentCourses: absentCourses.map(c => ({ course: c.course, credits: c.credits })),
        cheatingCourses: cheatingCourses.map(c => ({ course: c.course, credits: c.credits })),
        gpaAbnormal: !!gpaAbnormal,
        gpaValue: gpaAbnormal ? gpaAbnormal.gpa : null,
        confirmed: false
      })
    }
  }

  const result = []
  for (const [_, classData] of classMap) {
    result.push({
      className: classData.className,
      students: Array.from(classData.students.values()),
      totalProblemStudents: classData.students.size
    })
  }
  return result
}

function compareGrades(oldMerged, newMerged, sourceInfo) {
  const revisionRecords = []
  const oldMap = new Map()

  for (const record of oldMerged) {
    const key = `${record.studentId}|||${record.course}`
    oldMap.set(key, record)
  }

  for (const newRecord of newMerged) {
    const key = `${newRecord.studentId}|||${newRecord.course}`
    const oldRecord = oldMap.get(key)

    if (!oldRecord) {
      revisionRecords.push({
        type: '新增',
        studentId: newRecord.studentId,
        name: newRecord.name,
        className: newRecord.className,
        course: newRecord.course,
        oldRegularScore: null,
        newRegularScore: newRecord.regularScore,
        oldExperimentScore: null,
        newExperimentScore: newRecord.experimentScore,
        oldFinalScore: null,
        newFinalScore: newRecord.finalScore,
        oldOverallScore: null,
        newOverallScore: newRecord.overallScore,
        oldAbsent: null,
        newAbsent: newRecord.absent,
        oldCheating: null,
        newCheating: newRecord.cheating,
        oldDeferred: null,
        newDeferred: newRecord.deferred,
        source: sourceInfo || '重新导入',
        oldMakeupEligible: null,
        newMakeupEligible: isMakeupEligible(newRecord),
        makeupStatusChanged: false,
        teacher: newRecord.teacher,
        credits: newRecord.credits
      })
      oldMap.delete(key)
      continue
    }

    const changed = hasScoreChanged(oldRecord, newRecord)
    if (changed) {
      const oldEligible = isMakeupEligible(oldRecord)
      const newEligible = isMakeupEligible(newRecord)
      revisionRecords.push({
        type: '修改',
        studentId: newRecord.studentId,
        name: newRecord.name,
        className: newRecord.className,
        course: newRecord.course,
        oldRegularScore: oldRecord.regularScore,
        newRegularScore: newRecord.regularScore,
        oldExperimentScore: oldRecord.experimentScore,
        newExperimentScore: newRecord.experimentScore,
        oldFinalScore: oldRecord.finalScore,
        newFinalScore: newRecord.finalScore,
        oldOverallScore: oldRecord.overallScore,
        newOverallScore: newRecord.overallScore,
        oldAbsent: oldRecord.absent,
        newAbsent: newRecord.absent,
        oldCheating: oldRecord.cheating,
        newCheating: newRecord.cheating,
        oldDeferred: oldRecord.deferred,
        newDeferred: newRecord.deferred,
        source: sourceInfo || '重新导入',
        oldMakeupEligible: oldEligible,
        newMakeupEligible: newEligible,
        makeupStatusChanged: oldEligible !== newEligible,
        teacher: newRecord.teacher,
        credits: newRecord.credits
      })
    }
    oldMap.delete(key)
  }

  for (const [key, oldRecord] of oldMap) {
    revisionRecords.push({
      type: '删除',
      studentId: oldRecord.studentId,
      name: oldRecord.name,
      className: oldRecord.className,
      course: oldRecord.course,
      oldRegularScore: oldRecord.regularScore,
      newRegularScore: null,
      oldExperimentScore: oldRecord.experimentScore,
      newExperimentScore: null,
      oldFinalScore: oldRecord.finalScore,
      newFinalScore: null,
      oldOverallScore: oldRecord.overallScore,
      newOverallScore: null,
      oldAbsent: oldRecord.absent,
      newAbsent: null,
      oldCheating: oldRecord.cheating,
      newCheating: null,
      oldDeferred: oldRecord.deferred,
      newDeferred: null,
      source: sourceInfo || '重新导入',
      oldMakeupEligible: isMakeupEligible(oldRecord),
      newMakeupEligible: null,
      makeupStatusChanged: true,
      teacher: oldRecord.teacher,
      credits: oldRecord.credits
    })
  }

  return revisionRecords
}

function isMakeupEligible(record) {
  if (!record) return null
  const needMakeup = (record.overallScore !== null && record.overallScore < 60) || record.absent === true
  const cheating = record.cheating === true
  const deferred = record.deferred === true
  return needMakeup && !cheating && !deferred
}

function hasScoreChanged(oldRecord, newRecord) {
  return oldRecord.regularScore !== newRecord.regularScore ||
    oldRecord.experimentScore !== newRecord.experimentScore ||
    oldRecord.finalScore !== newRecord.finalScore ||
    oldRecord.overallScore !== newRecord.overallScore ||
    oldRecord.absent !== newRecord.absent ||
    oldRecord.cheating !== newRecord.cheating ||
    oldRecord.deferred !== newRecord.deferred
}

module.exports = { detect, getMakeupList, getDeferredList, getDeferredSchedule, getClassSummary, calculateGPA, getGPAAnomalies, getClassTeacherView, compareGrades, isMakeupEligible }