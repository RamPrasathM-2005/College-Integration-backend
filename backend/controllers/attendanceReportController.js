import { pool } from "../db.js";

// Get all active batches
export const getBatches = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT batchId, branch, batch FROM Batch WHERE isActive = 'YES'`
    );
    res.json({ success: true, batches: rows });
  } catch (error) {
    console.error("Error fetching batches:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get departments for a specific batch
export const getDepartments = async (req, res) => {
  const { batchId } = req.params;
  try {
    if (!batchId) return res.json({ success: true, departments: [] });

    const [rows] = await pool.execute(
      `SELECT DISTINCT d.Deptid AS departmentId, d.Deptname AS departmentName, d.Deptacronym AS departmentCode
       FROM department d
       JOIN Batch b ON d.Deptacronym = b.branch
       WHERE b.batchId = ? AND b.isActive = 'YES' AND d.Deptid IS NOT NULL`,
      [batchId]
    );
    res.json({ success: true, departments: rows });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get semesters for a batch
export const getSemesters = async (req, res) => {
  const { batchId } = req.params;
  try {
    if (!batchId) return res.json({ success: true, semesters: [] });

    const [rows] = await pool.execute(
      `SELECT semesterId, semesterNumber
       FROM Semester
       WHERE batchId = ? AND isActive='YES'
       ORDER BY semesterNumber ASC`,
      [batchId]
    );

    res.json({ success: true, semesters: rows });
  } catch (error) {
    console.error("Error fetching semesters:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get subject-wise attendance report

// Get subject-wise attendance report



export const getSubjectWiseAttendance = async (req, res) => {
  const { batchId, semesterId } = req.params;
  const { fromDate, toDate } = req.query;

  try {
    if (!batchId || !semesterId || !fromDate || !toDate) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required parameters" });
    }

    // 1️⃣ Get batch number
    const [batchRows] = await pool.execute(
      `SELECT batch FROM Batch WHERE batchId = ? AND isActive='YES'`,
      [batchId]
    );
    if (!batchRows.length)
      return res.status(404).json({ success: false, error: "Batch not found" });
    const batchNumber = batchRows[0].batch;

    // 2️⃣ Get students for batch
    const [students] = await pool.execute(
      `SELECT s.regno AS RegisterNumber, u.username AS StudentName
       FROM student_details s
       JOIN users u ON s.Userid = u.Userid
       WHERE s.batch = ?`,
      [batchNumber]
    );
    if (!students.length)
      return res.json({ success: true, courses: [], report: [] });

    // 3️⃣ Get courses for semester (✅ Fetch courseTitle instead of courseCode)
    const [courses] = await pool.execute(
      `SELECT courseId, courseTitle 
       FROM Course 
       WHERE semesterId = ? AND isActive='YES'`,
      [semesterId]
    );
    if (!courses.length)
      return res.json({ success: true, courses: [], report: [] });

    const courseIds = courses.map((c) => c.courseId);
    const courseTitles = courses.map((c) => c.courseTitle);
    const placeholders = courseIds.map(() => "?").join(",");

    // 4️⃣ Get timetable info for those courses
    const [timetableRows] = await pool.execute(
      `SELECT courseId, dayOfWeek, COUNT(*) AS periodsPerDay
       FROM Timetable
       WHERE semesterId = ? AND courseId IN (${placeholders}) AND isActive='YES'
       GROUP BY courseId, dayOfWeek`,
      [semesterId, ...courseIds]
    );

    // Helper function to count how many of each weekday fall in the date range
    function countDaysInRange(from, to, dayOfWeek) {
      const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
      const target = map[dayOfWeek];
      if (target === undefined) return 0;

      let count = 0;
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        if (cur.getDay() === target) count++;
        cur.setDate(cur.getDate() + 1);
      }
      return count;
    }

    // 5️⃣ Compute total conducted periods per course using timetable + date range
    const courseConductedMap = {};
    timetableRows.forEach((r) => {
      const dayCount = countDaysInRange(fromDate, toDate, r.dayOfWeek);
      const total = dayCount * r.periodsPerDay;
      courseConductedMap[r.courseId] =
        (courseConductedMap[r.courseId] || 0) + total;
    });

    // 6️⃣ Fetch attended periods per student per course
    const [attendanceRows] = await pool.execute(
      `SELECT regno, courseId, COUNT(DISTINCT CONCAT(attendanceDate, '-', periodNumber)) AS AttendedPeriods
       FROM PeriodAttendance
       WHERE status = 'P'
         AND courseId IN (${placeholders})
         AND attendanceDate BETWEEN ? AND ?
       GROUP BY regno, courseId`,
      [...courseIds, fromDate, toDate]
    );

    // Build quick lookup
    const attendanceMap = {};
    attendanceRows.forEach((r) => {
      if (!attendanceMap[r.regno]) attendanceMap[r.regno] = {};
      attendanceMap[r.regno][r.courseId] = r.AttendedPeriods;
    });

    // 7️⃣ Build the final report
    const report = students.map((s) => {
      let TotalConducted = 0;
      let TotalAttended = 0;

      const studentData = {
        RegisterNumber: s.RegisterNumber,
        StudentName: s.StudentName,
      };

      // Add course-wise data (✅ using courseTitle)
      courses.forEach((c) => {
        const conducted = courseConductedMap[c.courseId] || 0;
        const attended = attendanceMap[s.RegisterNumber]?.[c.courseId] || 0;

        studentData[`${c.courseTitle} Conducted Periods`] = conducted;
        studentData[`${c.courseTitle} Attended Periods`] = attended;
        studentData[`${c.courseTitle} Att%`] = conducted
          ? ((attended / conducted) * 100).toFixed(2)
          : "0.00";

        TotalConducted += conducted;
        TotalAttended += attended;
      });

      // ✅ Add totals
      studentData["Total Conducted Periods"] = TotalConducted;
      studentData["Total Attended Periods"] = TotalAttended;
      studentData["Total Percentage %"] = TotalConducted
        ? ((TotalAttended / TotalConducted) * 100).toFixed(2)
        : "0.00";

      return studentData;
    });

    // ✅ Final response
    res.json({
      success: true,
      courses: courseTitles, // ✅ Return courseTitle instead of courseCode
      report,
    });
  } catch (err) {
    console.error("Error in getSubjectWiseAttendance:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getUnmarkedAttendanceReport = async (req, res) => {
  const { batchId, semesterId } = req.params;
  const { fromDate, toDate } = req.query;

  try {
    if (!batchId || !semesterId || !fromDate || !toDate) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required parameters" });
    }

    // 1️⃣ Get batch number
    const [batchRows] = await pool.execute(
      `SELECT batch FROM Batch WHERE batchId = ? AND isActive='YES'`,
      [batchId]
    );
    if (!batchRows.length)
      return res.status(404).json({ success: false, error: "Batch not found" });
    const batchNumber = batchRows[0].batch;

    // 2️⃣ Get students
    const [students] = await pool.execute(
      `SELECT s.regno AS RegisterNumber, u.username AS StudentName
       FROM student_details s
       JOIN users u ON s.Userid = u.Userid
       WHERE s.batch = ?`,
      [batchNumber]
    );
    if (!students.length) return res.json({ success: true, report: [] });

    // 3️⃣ Get courses (with courseTitle)
    const [courses] = await pool.execute(
      `SELECT courseId, courseTitle 
       FROM Course 
       WHERE semesterId = ? AND isActive='YES'`,
      [semesterId]
    );
    if (!courses.length) return res.json({ success: true, report: [] });

    const courseIds = courses.map((c) => c.courseId);
    const courseMap = Object.fromEntries(
      courses.map((c) => [c.courseId, c.courseTitle])
    );

    // 4️⃣ Get timetable
    const [timetableRows] = await pool.execute(
      `SELECT courseId, dayOfWeek, periodNumber
       FROM Timetable
       WHERE semesterId = ? 
         AND courseId IN (${courseIds.map(() => "?").join(",")})
         AND isActive='YES'`,
      [semesterId, ...courseIds]
    );

    // 5️⃣ Helper to generate possible dates
    const getPossibleAttendanceDates = (from, to, dayOfWeek, periodNumber) => {
      const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
      const target = map[dayOfWeek];
      if (target === undefined) return [];

      const dates = [];
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        if (cur.getDay() === target) {
          dates.push({
            date: new Date(cur).toISOString().split("T")[0],
            periodNumber,
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    };

    // 6️⃣ Generate all possible attendance instances
    const possibleAttendance = [];
    timetableRows.forEach((t) => {
      const dates = getPossibleAttendanceDates(
        fromDate,
        toDate,
        t.dayOfWeek,
        t.periodNumber
      );
      dates.forEach((d) => {
        possibleAttendance.push({
          courseId: t.courseId,
          date: d.date,
          periodNumber: d.periodNumber,
        });
      });
    });

    if (!possibleAttendance.length)
      return res.json({ success: true, report: [] });

    // 7️⃣ Get marked attendance
    const [markedAttendance] = await pool.execute(
      `SELECT regno, courseId, attendanceDate, periodNumber
       FROM PeriodAttendance
       WHERE courseId IN (${courseIds.map(() => "?").join(",")})
         AND attendanceDate BETWEEN ? AND ?`,
      [...courseIds, fromDate, toDate]
    );

    const markedSet = new Set(
      markedAttendance.map(
        (m) => `${m.regno}-${m.courseId}-${m.attendanceDate}-${m.periodNumber}`
      )
    );

    // 8️⃣ Find unmarked attendance
    const unmarkedReport = [];
    for (const student of students) {
      for (const pa of possibleAttendance) {
        const key = `${student.RegisterNumber}-${pa.courseId}-${pa.date}-${pa.periodNumber}`;
        if (!markedSet.has(key)) {
          unmarkedReport.push({
            RegisterNumber: student.RegisterNumber,
            StudentName: student.StudentName,
            Date: pa.date,
            PeriodNumber: pa.periodNumber,
            Course: courseMap[pa.courseId] || "Unknown", // ✅ Now shows courseTitle
          });
        }
      }
    }

    res.json({ success: true, report: unmarkedReport });
  } catch (err) {
    console.error("Error in getUnmarkedAttendanceReport:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
