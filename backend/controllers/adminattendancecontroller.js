// attendancecontroller.js - Fixed SQL syntax by removing invalid // comments
import pool from "../db.js";

// Helper to generate dates between two dates (inclusive)
function generateDates(start, end) {
  const dates = [];
  let current = new Date(start);
  const endDate = new Date(end);

  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]); // YYYY-MM-DD
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Helper to get dayOfWeek (1 = Monday, 7 = Sunday)
function getDayOfWeek(dateStr) {
  const day = new Date(dateStr).getDay(); // 0 = Sunday
  return day === 0 ? 7 : day; // Convert Sunday to 7
}

export async function getTimetableAdmin(req, res, next) {
  try {
    const { startDate, endDate, degree, batch, branch, Deptid, semesterId } =
      req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ status: "error", message: "Start and end dates required" });
    }
    if (!degree || !batch || !branch || !Deptid || !semesterId) {
      return res.status(400).json({
        status: "error",
        message: "Degree, batch, branch, Deptid, and semesterId are required",
      });
    }

    // Fetch all periods for the selected filters (use LEFT JOIN for Course to detect nulls)
    const [periods] = await pool.query(
      `
SELECT 
    t.timetableId, 
    t.courseId, 
    COALESCE(t.sectionId, NULL) as sectionId, 
    t.dayOfWeek, 
    t.periodNumber, 
    c.courseTitle, 
    c.courseCode AS courseCode,
    s.sectionName, 
    t.semesterId, 
    t.Deptid,
    d.Deptacronym as departmentCode
FROM Timetable t
LEFT JOIN Course c ON t.courseId = c.courseId
LEFT JOIN Section s ON t.sectionId = s.sectionId
JOIN department d ON t.Deptid = d.Deptid
JOIN Semester sm ON t.semesterId = sm.semesterId
JOIN Batch b ON sm.batchId = b.batchId
WHERE 
  b.degree = ?
  AND b.batch = ?
  AND b.branch = ?
  AND t.Deptid = ?
  AND t.semesterId = ?
  AND t.isActive = 'YES'
  AND (c.isActive = 'YES' OR c.courseId IS NULL)
ORDER BY FIELD(t.dayOfWeek, 'MON','TUE','WED','THU','FRI','SAT'), t.periodNumber;
      `,
      [degree, batch, branch, Deptid, semesterId]
    );

    // Filter out periods where courseId is null (invalid timetable entries)
    const validPeriods = periods.filter(
      (p) => p.courseId != null && p.courseId !== null
    );

    // Log the fetched periods and any null courseId issues
    console.log("Fetched Timetable for Admin");
    console.log("Filters:", {
      startDate,
      endDate,
      degree,
      batch,
      branch,
      Deptid,
      semesterId,
    });
    if (validPeriods.length < periods.length) {
      console.warn(
        `Filtered out ${
          periods.length - validPeriods.length
        } periods with null courseId`
      );
    }
    console.log("Valid Periods:", JSON.stringify(validPeriods, null, 2));

    // Generate dates between startDate and endDate
    const dates = generateDates(startDate, endDate);

    // Day mapping from number (1-6) to day string
    const dayMap = {
      1: "MON",
      2: "TUE",
      3: "WED",
      4: "THU",
      5: "FRI",
      6: "SAT",
    };

    // Map timetable data to dates
    const timetable = {};
    dates.forEach((date) => {
      const dayOfWeekNum = getDayOfWeek(date);
      const dayOfWeekStr = dayMap[dayOfWeekNum];
      let periodsForDay = [];
      if (dayOfWeekStr) {
        periodsForDay = validPeriods
          .filter((row) => row.dayOfWeek === dayOfWeekStr)
          .map((period) => ({
            ...period,
            sectionId: period.sectionId ? parseInt(period.sectionId) : null,
          }));
      }
      timetable[date] = periodsForDay;
    });

    console.log("Structured Timetable:", JSON.stringify(timetable, null, 2));
    res.status(200).json({ status: "success", data: { timetable } });
  } catch (err) {
    console.error("Error in getTimetableAdmin:", err);
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to fetch timetable",
    });
    next(err);
  }
}

export async function getStudentsForPeriodAdmin(req, res, next) {
  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const userId = req.user.Userid;
    const deptId = req.user.Deptid || null;

    // Log input parameters for debugging
    console.log("Input Parameters:", {
      courseId,
      sectionId,
      dayOfWeek,
      periodNumber,
      date,
      userId,
      deptId,
    });

    // Validate params
    if (!courseId || !dayOfWeek || !periodNumber) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: courseId, dayOfWeek, periodNumber",
      });
    }

    // For admin, ignore sectionId filter if 'all'
    const isAllSections = sectionId === "all";

    if (!isAllSections) {
      console.warn("Specific section requested for admin; treating as all.");
    }

    // Get all students enrolled in this course (irrespective of section)
    const [students] = await pool.query(
      `
      SELECT 
        sd.regno AS rollnumber, 
        u.username AS name, 
        COALESCE(pa.status, '') AS status,
        sc.sectionId,
        s.sectionName
      FROM StudentCourse sc
      JOIN student_details sd ON sc.regno = sd.regno
      JOIN users u ON sd.Userid = u.Userid
      LEFT JOIN Section s ON sc.sectionId = s.sectionId
      LEFT JOIN PeriodAttendance pa ON sc.regno = pa.regno 
        AND pa.courseId = ? 
        AND pa.sectionId = sc.sectionId
        AND pa.dayOfWeek = ? 
        AND pa.periodNumber = ? 
        AND pa.attendanceDate = ?
      WHERE sc.courseId = ? 
        ${deptId ? "AND sd.Deptid = ?" : ""}
      ORDER BY sd.regno
      `,
      deptId
        ? [courseId, dayOfWeek, periodNumber, date, courseId, deptId]
        : [courseId, dayOfWeek, periodNumber, date, courseId]
    );

    // Log the fetched students (including if no students enrolled)
    console.log("Fetched Students for Period (Admin):", {
      courseId,
      sectionId: "all",
      date,
      dayOfWeek,
      periodNumber,
      totalStudents: students.length,
      hasEnrollments: students.length > 0,
    });

    if (students.length === 0) {
      console.log(
        "No students enrolled for courseId:",
        courseId,
        "- Check StudentCourse table for enrollments."
      );
    }

    res.json({ status: "success", data: students || [] });
  } catch (err) {
    console.error("Error in getStudentsForPeriodAdmin:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      status: "error",
      message: err.message || "Internal server error",
    });
    next(err);
  }
}

export async function markAttendanceAdmin(req, res, next) {
  const connection = await pool.getConnection();

  try {
    const { courseId, sectionId, dayOfWeek, periodNumber } = req.params;
    const { date, attendances } = req.body;
    const markedBy = req.user.Userid; // Use Userid for admin
    const deptId = req.user.Deptid || 1;

    // Log input for debugging
    console.log("markAttendanceAdmin Input:", {
      courseId,
      sectionId,
      dayOfWeek,
      periodNumber,
      date,
      markedBy,
      deptId,
      attendances,
    });

    // Validate input
    if (!Array.isArray(attendances) || attendances.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No attendance data provided",
      });
    }

    if (!date) {
      return res.status(400).json({
        status: "error",
        message: "Date is required",
      });
    }

    if (!courseId || !dayOfWeek || !periodNumber) {
      return res.status(400).json({
        status: "error",
        message:
          "Missing required parameters: courseId, dayOfWeek, periodNumber",
      });
    }

    // Verify that the period exists in Timetable
    const [timetableCheck] = await connection.query(
      `
      SELECT COUNT(*) as count
      FROM Timetable
      WHERE courseId = ? AND dayOfWeek = ? AND periodNumber = ?
      `,
      [courseId, dayOfWeek, periodNumber]
    );

    if (timetableCheck[0].count === 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid period: not found in Timetable",
      });
    }

    await connection.beginTransaction();

    // Get semester information
    const [courseInfo] = await connection.query(
      `SELECT c.semesterId, s.semesterNumber 
       FROM Course c 
       JOIN Semester s ON c.semesterId = s.semesterId
       WHERE c.courseId = ?`,
      [courseId]
    );

    if (!courseInfo[0]) {
      throw new Error("Course not found or invalid semester information");
    }
    const semesterNumber = courseInfo[0].semesterNumber;

    // Track inserted/updated records and errors for logging
    const processedStudents = [];
    const skippedStudents = [];

    // Process each student's attendance
    for (const att of attendances) {
      if (!att.rollnumber || !["P", "A", "OD"].includes(att.status)) {
        console.log("Skipping invalid attendance record:", att);
        skippedStudents.push({
          rollnumber: att.rollnumber || "unknown",
          reason: "Invalid rollnumber or status",
        });
        continue;
      }

      // Fetch the student's sectionId for this course
      const [studentCourse] = await connection.query(
        `SELECT sectionId FROM StudentCourse WHERE regno = ? AND courseId = ?`,
        [att.rollnumber, courseId]
      );

      if (studentCourse.length === 0) {
        console.log("Student not enrolled:", att.rollnumber);
        skippedStudents.push({
          rollnumber: att.rollnumber,
          reason: "Not enrolled in course",
        });
        continue;
      }

      const studentSectionId = studentCourse[0].sectionId;
      const statusToSave = att.status === "OD" ? "OD" : att.status;

      // Insert or update PeriodAttendance (using markedBy column)
      await connection.query(
        `
        INSERT INTO PeriodAttendance 
        (regno, staffId, courseId, sectionId, semesterNumber, dayOfWeek, periodNumber, attendanceDate, status, Deptid, updatedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          status = ?,
          staffId =null,
          updatedBy = ?
        `,
        [
          att.rollnumber,
          markedBy,
          courseId,
          studentSectionId,
          semesterNumber,
          dayOfWeek,
          periodNumber,
          date,
          statusToSave,
          deptId,
          "admin",
          statusToSave,
          markedBy,
          "admin",
        ]
      );

      console.log("Processed attendance for student:", {
        rollnumber: att.rollnumber,
        status: statusToSave,
        sectionId: studentSectionId,
      });

      processedStudents.push({
        rollnumber: att.rollnumber,
        status: statusToSave,
        sectionId: studentSectionId,
      });
    }

    await connection.commit();

    // Log successful and skipped records
    console.log("Attendance Marked Successfully (Admin):", {
      courseId,
      sectionId: sectionId || "all",
      date,
      periodNumber,
      markedBy,
      processedStudents,
      skippedStudents,
    });

    res.json({
      status: "success",
      message: `Attendance marked for ${processedStudents.length} students, skipped ${skippedStudents.length} students`,
      data: { processedStudents, skippedStudents },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error in markAttendanceAdmin:", {
      message: err.message,
      stack: err.stack,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
    });
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to mark attendance",
      sqlError: err.sqlMessage || "No SQL error details available",
    });
  } finally {
    connection.release();
  }
}
