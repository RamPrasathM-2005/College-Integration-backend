import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

export const searchStudents = catchAsync(async (req, res) => {
  const { degree, branch: originalBranch, batch, semesterNumber } = req.query;
  let connection = null;

  try {
    // Validate query parameters
    if (semesterNumber) {
      const semesterNum = parseInt(semesterNumber, 10);
      if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
        return res.status(400).json({
          status: 'failure',
          message: 'Invalid semesterNumber. Must be a number between 1 and 8.',
        });
      }
    }
    if (batch && !/^\d{4}$/.test(batch)) {
      return res.status(400).json({
        status: 'failure',
        message: 'Invalid batch format. Must be a 4-digit year.',
      });
    }

    console.log('Query params:', { degree, branch: originalBranch, batch, semesterNumber });

    // Get database connection
    connection = await pool.getConnection();
    console.log('Database connection acquired');

    // Fetch all students
    let studentQuery = `
      SELECT 
        u.Userid, 
        u.username AS name, 
        sd.regno AS rollnumber,
        sd.batch AS studentBatch,
        sd.Semester AS semesterNumber,
        b.batchId,
        b.degree,
        b.branch,
        d.Deptacronym,
        sc.courseId,
        c.courseCode,
        sc.sectionId,
        s.sectionName,
        scf.Userid AS staffId,
        us.username AS staffName
      FROM student_details sd
      JOIN users u ON sd.Userid = u.Userid
      JOIN department d ON sd.Deptid = d.Deptid
      JOIN Batch b ON sd.batch = b.batch
      LEFT JOIN StudentCourse sc ON sd.regno = sc.regno
      LEFT JOIN Course c ON sc.courseId = c.courseId
      LEFT JOIN Section s ON sc.sectionId = s.sectionId AND sc.courseId = s.courseId
      LEFT JOIN StaffCourse scf ON sc.courseId = scf.courseId AND sc.sectionId = scf.sectionId
      LEFT JOIN users us ON scf.Userid = us.Userid AND us.role = 'Staff' AND us.status = 'active'
      WHERE u.status = 'active'
        AND sd.pending = 1  -- Updated to match pending students
    `;
    const studentParams = [];

    if (degree) {
      studentQuery += ' AND b.degree = ?';
      studentParams.push(degree);
    }
    if (originalBranch) {
      studentQuery += ' AND d.Deptacronym = ? AND b.branch = ?';
      studentParams.push(originalBranch, originalBranch);
    }
    if (batch) {
      studentQuery += ' AND b.batch = ? AND sd.batch = ?';
      studentParams.push(batch, batch);
    }
    if (semesterNumber) {
      studentQuery += ' AND sd.Semester = ?';
      studentParams.push(parseInt(semesterNumber, 10));
    }

    studentQuery += ' ORDER BY sd.regno, c.courseCode';

    console.log('Executing student query:', studentQuery, 'with params:', studentParams);
    const [studentRows] = await connection.execute(studentQuery, studentParams);
    console.log('Student query result:', studentRows.length, 'rows', studentRows);

    // Fetch elective selections
    let selectionsQuery = `
      SELECT 
        ses.regno,
        ses.selectedCourseId
      FROM StudentElectiveSelection ses
      JOIN ElectiveBucket eb ON ses.bucketId = eb.bucketId
      JOIN Semester sem ON eb.semesterId = sem.semesterId
      JOIN Batch b ON sem.batchId = b.batchId
      JOIN student_details sd ON ses.regno = sd.regno
      JOIN department d ON sd.Deptid = d.Deptid
      JOIN Course c ON ses.selectedCourseId = c.courseId
      WHERE c.category IN ('PEC', 'OEC')
        AND ses.status = 'allocated'
    `;
    const selectionsParams = [];
    if (degree) {
      selectionsQuery += ' AND b.degree = ?';
      selectionsParams.push(degree);
    }
    if (originalBranch) {
      selectionsQuery += ' AND d.Deptacronym = ? AND b.branch = ?';
      selectionsParams.push(originalBranch, originalBranch);
    }
    if (batch) {
      selectionsQuery += ' AND b.batch = ? AND sd.batch = ?';
      selectionsParams.push(batch, batch);
    }
    if (semesterNumber) {
      selectionsQuery += ' AND sem.semesterNumber = ?';
      selectionsParams.push(parseInt(semesterNumber, 10));
    }

    console.log('Executing selections query:', selectionsQuery, 'with params:', selectionsParams);
    const [selectionRows] = await connection.execute(selectionsQuery, selectionsParams);
    console.log('Selections query result:', selectionRows.length, 'rows', selectionRows);

    // Create selectionsMap
    const selectionsMap = new Map();
    selectionRows.forEach(row => {
      if (!selectionsMap.has(row.regno)) {
        selectionsMap.set(row.regno, []);
      }
      selectionsMap.get(row.regno).push(String(row.selectedCourseId));
    });
    console.log('Selections map:', Array.from(selectionsMap.entries()));

    // Aggregate student data
    const studentsMap = new Map();
    studentRows.forEach(row => {
      if (!row.rollnumber) {
        console.warn('Skipping row with missing rollnumber:', row);
        return;
      }
      const studentKey = row.rollnumber;
      if (!studentsMap.has(studentKey)) {
        studentsMap.set(studentKey, {
          rollnumber: row.rollnumber,
          name: row.name || 'Unknown',
          batch: row.studentBatch || 'Unknown',
          semester: row.semesterNumber ? `Semester ${row.semesterNumber}` : 'Unknown',
          enrolledCourses: [],
          selectedElectiveIds: selectionsMap.get(row.rollnumber) || [],
        });
      }
      if (row.courseId && row.sectionId) {
        const existingCourse = studentsMap.get(studentKey).enrolledCourses.find(
          c => c.courseId === row.courseId && c.sectionId === row.sectionId
        );
        if (!existingCourse) {
          studentsMap.get(studentKey).enrolledCourses.push({
            courseId: row.courseId,
            courseCode: row.courseCode || 'Unknown',
            sectionId: row.sectionId,
            sectionName: row.sectionName || 'Unknown',
            staffId: row.staffId ? String(row.staffId) : null,
            staffName: row.staffName || 'Not Assigned',
          });
        }
      }
    });

    const students = Array.from(studentsMap.values());
    console.log('Aggregated students:', students.length, students);

    // Fetch all available courses
    const coursesQuery = `
      SELECT 
        c.courseId,
        c.courseCode,
        c.courseTitle,
        c.category,
        s.sectionId,
        s.sectionName,
        scf.Userid AS staffId,
        us.username AS staffName
      FROM Course c
      JOIN Semester sem ON c.semesterId = sem.semesterId
      JOIN Batch b ON sem.batchId = b.batchId
      LEFT JOIN Section s ON c.courseId = s.courseId
      LEFT JOIN StaffCourse scf ON c.courseId = scf.courseId AND s.sectionId = scf.sectionId
      LEFT JOIN users us ON scf.Userid = us.Userid AND us.role = 'Staff' AND us.status = 'active'
      WHERE c.isActive = 'YES'
        AND sem.isActive = 'YES'
        ${degree ? 'AND b.degree = ?' : ''}
        ${originalBranch ? 'AND b.branch = ?' : ''}
        ${batch ? 'AND b.batch = ?' : ''}
        ${semesterNumber ? 'AND sem.semesterNumber = ?' : ''}
      ORDER BY c.courseCode, s.sectionName
    `;
    const coursesParams = [degree, originalBranch, batch, semesterNumber ? parseInt(semesterNumber, 10) : undefined].filter(Boolean);
    console.log('Executing courses query:', coursesQuery, 'with params:', coursesParams);
    const [courseRows] = await connection.execute(coursesQuery, coursesParams);
    console.log('Courses query result:', courseRows.length, 'rows', courseRows);

    // Aggregate course data
    const coursesMap = new Map();
    courseRows.forEach(row => {
      if (!row.courseId) {
        console.warn('Skipping course row with missing courseId:', row);
        return;
      }
      if (!coursesMap.has(row.courseId)) {
        coursesMap.set(row.courseId, {
          courseId: row.courseId,
          courseCode: row.courseCode || 'Unknown',
          courseTitle: row.courseTitle || 'Unknown Course',
          category: row.category,
          batches: [],
        });
      }
      if (row.sectionId) {
        const existingBatch = coursesMap.get(row.courseId).batches.find(
          b => b.sectionId === row.sectionId
        );
        if (!existingBatch) {
          coursesMap.get(row.courseId).batches.push({
            sectionId: row.sectionId,
            sectionName: row.sectionName || 'Unknown',
            staffId: row.staffId ? String(row.staffId) : null,
            staffName: row.staffName || 'Not Assigned',
            enrolled: row.enrolled || 0,
            capacity: 40, // Adjust as needed
          });
        }
      }
    });

    const availableCourses = Array.from(coursesMap.values());
    console.log('Aggregated courses:', availableCourses.length, availableCourses);

    connection.release();

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      status: 'success',
      studentsData: students,
      coursesData: availableCourses,
    });
  } catch (err) {
    if (connection) {
      connection.release();
    }
    console.error('Error in searchStudents:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.sqlMessage || 'No SQL error',
      sql: err.sql || 'No SQL query',
      queryParams: { degree, branch: originalBranch, batch, semesterNumber },
    });
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  }
});

export const getAvailableCourses = catchAsync(async (req, res) => {
  const { semesterNumber } = req.params;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    // Validate semesterNumber
    if (!semesterNumber || isNaN(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return res.status(400).json({
        status: "failure",
        message: "Valid semesterNumber (1-8) is required",
      });
    }

    // Check if user exists and is active
    const [userCheck] = await connection.execute(
      'SELECT Userid, role FROM users WHERE email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    const user = userCheck[0];
    let coursesQuery;
    let queryParams = [semesterNumber];

    // If user is a student, fetch their registration number and check elective selections
    let studentRegno = null;
    if (user.role === 'Student') {
      const [studentDetails] = await connection.execute(
        'SELECT regno FROM student_details WHERE Userid = ?',
        [user.Userid]
      );
      if (studentDetails.length === 0) {
        return res.status(400).json({
          status: 'failure',
          message: `No student details found for user with email ${userEmail}`,
        });
      }
      studentRegno = studentDetails[0].regno;
    }

    // Construct the query based on user role
    if (user.role === 'Student') {
      // For students, include PEC/OEC courses only if they selected them
      coursesQuery = `
        SELECT 
          c.courseId, 
          c.courseCode, 
          c.courseTitle,
          c.category,
          s.sectionId, 
          s.sectionName
        FROM Course c
        JOIN Semester sem ON c.semesterId = sem.semesterId
        JOIN Section s ON c.courseId = s.courseId
        LEFT JOIN StudentElectiveSelection ses ON c.courseId = ses.selectedCourseId AND ses.regno = ?
        WHERE sem.semesterNumber = ? 
          AND c.isActive = 'YES' 
          AND s.isActive = 'YES'
          AND (
            c.category NOT IN ('PEC', 'OEC')
            OR (c.category IN ('PEC', 'OEC') AND ses.selectionId IS NOT NULL)
          )
      `;
      queryParams = [studentRegno, semesterNumber];
    } else {
      // For non-students (e.g., Admin, Staff), show all courses
      coursesQuery = `
        SELECT 
          c.courseId, 
          c.courseCode, 
          c.courseTitle,
          c.category,
          s.sectionId, 
          s.sectionName
        FROM Course c
        JOIN Semester sem ON c.semesterId = sem.semesterId
        JOIN Section s ON c.courseId = s.courseId
        WHERE sem.semesterNumber = ? 
          AND c.isActive = 'YES' 
          AND s.isActive = 'YES'
      `;
    }

    // Execute the query
    const [rows] = await connection.execute(coursesQuery, queryParams);

    // Aggregate courses by courseId
    const coursesMap = new Map();
    rows.forEach(row => {
      if (!coursesMap.has(row.courseId)) {
        coursesMap.set(row.courseId, {
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          category: row.category,
          sections: []
        });
      }
      coursesMap.get(row.courseId).sections.push({
        sectionId: row.sectionId,
        sectionName: row.sectionName
      });
    });

    const courses = Array.from(coursesMap.values());

    res.status(200).json({
      status: "success",
      data: courses,
    });
  } catch (err) {
    console.error('Error fetching available courses:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

export const enrollStudentInCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId, sectionName, Userid } = req.body;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!rollnumber || !courseId || !sectionName) {
      return res.status(400).json({
        status: "failure",
        message: "rollnumber, courseId, and sectionName are required",
      });
    }

    console.log('Enroll Request:', { rollnumber, courseId, sectionName, Userid, userEmail });

    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    // Validate student
    const [studentRows] = await connection.execute(
      `SELECT sd.batch, sd.Semester AS semesterNumber, sd.Deptid, d.Deptacronym
       FROM student_details sd
       JOIN department d ON sd.Deptid = d.Deptid
       WHERE sd.regno = ?`,
      [rollnumber]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No student found with rollnumber ${rollnumber}`,
      });
    }
    const { batch, semesterNumber, Deptid, Deptacronym } = studentRows[0];

    console.log('Student Data:', { batch, semesterNumber, Deptid, Deptacronym });

    // Get batchId
    const [batchRows] = await connection.execute(
      `SELECT batchId FROM Batch WHERE batch = ? AND branch = ? AND isActive = 'YES'`,
      [batch, Deptacronym]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active batch found for batch ${batch} and branch ${Deptacronym}`,
      });
    }
    const { batchId } = batchRows[0];

    // Validate course
    const [courseRows] = await connection.execute(
      `SELECT c.courseId, c.courseCode FROM Course c
       JOIN Semester s ON c.semesterId = s.semesterId
       JOIN Batch b ON s.batchId = b.batchId
       WHERE c.courseId = ? AND s.batchId = ? AND s.semesterNumber = ? AND c.isActive = 'YES' AND b.branch = ?`,
      [courseId, batchId, semesterNumber, Deptacronym]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active course with ID ${courseId} found for semester ${semesterNumber} and branch ${Deptacronym}`,
      });
    }
    const { courseCode } = courseRows[0];

    // Get sectionId
    const [sectionRows] = await connection.execute(
      `SELECT sectionId FROM Section WHERE courseId = ? AND sectionName = ? AND isActive = 'YES'`,
      [courseId, sectionName]
    );
    if (sectionRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active section ${sectionName} found for course ID ${courseId}`,
      });
    }
    const { sectionId } = sectionRows[0];

    console.log('Section Data:', { sectionId, sectionName });

    // Check for existing enrollment
    const [existingEnrollment] = await connection.execute(
      `SELECT studentCourseId, sectionId FROM StudentCourse WHERE regno = ? AND courseId = ?`,
      [rollnumber, courseId]
    );
    console.log('Existing Enrollment:', existingEnrollment);

    if (existingEnrollment.length > 0) {
      const existingSectionId = existingEnrollment[0].sectionId;
      if (existingSectionId !== sectionId) {
        await connection.execute(
          `UPDATE StudentCourse SET sectionId = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE studentCourseId = ?`,
          [sectionId, userEmail, existingEnrollment[0].studentCourseId]
        );
        if (Userid) {
          const [staffRows] = await connection.execute(
            `SELECT Userid, Deptid FROM users WHERE Userid = ? AND role = 'Staff' AND status = 'active'`,
            [Userid]
          );
          if (staffRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
              status: 'failure',
              message: `No active staff found with Userid ${Userid}`,
            });
          }
          const { Deptid: staffDeptid } = staffRows[0];
          const [staffCourse] = await connection.execute(
            `SELECT staffCourseId FROM StaffCourse WHERE courseId = ? AND sectionId = ? AND staffId = ?`,
            [courseId, sectionId, Userid]
          );
          if (staffCourse.length === 0) {
            await connection.execute(
              `INSERT INTO StaffCourse (staffId, courseId, sectionId, Deptid, createdBy, updatedBy)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [Userid, courseId, sectionId, staffDeptid, userEmail, userEmail]
            );
          }
        }
        await connection.commit();
        return res.status(200).json({
          status: "success",
          message: `Student ${rollnumber} section updated to ${sectionName} for course ${courseCode}`,
        });
      }
      return res.status(200).json({
        status: "success",
        message: `Student ${rollnumber} already enrolled in course ${courseCode} with section ${sectionName}`,
      });
    }

    // New enrollment
    const [result] = await connection.execute(
      `INSERT INTO StudentCourse (regno, courseId, sectionId, createdBy, updatedBy)
       VALUES (?, ?, ?, ?, ?)`,
      [rollnumber, courseId, sectionId, userEmail, userEmail]
    );

    if (Userid) {
      const [staffRows] = await connection.execute(
        `SELECT Userid, Deptid FROM users WHERE Userid = ? AND role = 'Staff' AND status = 'active'`,
        [Userid]
      );
      if (staffRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          status: 'failure',
          message: `No active staff found with Userid ${Userid}`,
        });
      }
      const { Deptid: staffDeptid } = staffRows[0];
      const [staffCourse] = await connection.execute(
        `SELECT staffCourseId FROM StaffCourse WHERE courseId = ? AND sectionId = ? AND staffId = ?`,
        [courseId, sectionId, Userid]
      );
      if (staffCourse.length === 0) {
        await connection.execute(
          `INSERT INTO StaffCourse (staffId, courseId, sectionId, Deptid, createdBy, updatedBy)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [Userid, courseId, sectionId, staffDeptid, userEmail, userEmail]
        );
      }
    }

    await connection.commit();
    res.status(201).json({
      status: "success",
      message: "Student enrolled in course successfully",
      studentCourseId: result.insertId,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error enrolling student:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

export const updateStudentBatch = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const { batch, semesterNumber } = req.body;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!batch || !semesterNumber || isNaN(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return res.status(400).json({
        status: "failure",
        message: "batch and valid semesterNumber (1-8) are required",
      });
    }

    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    // Validate student
    const [studentRows] = await connection.execute(
      `SELECT regno FROM student_details WHERE regno = ? AND pending = FALSE`,
      [rollnumber]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No approved student found with rollnumber ${rollnumber}`,
      });
    }

    // Validate batch
    const [batchRows] = await connection.execute(
      `SELECT batchId FROM Batch WHERE batch = ? AND isActive = 'YES'`,
      [batch]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active batch found with batch ${batch}`,
      });
    }

    // Update student batch and semester
    const [result] = await connection.execute(
      `UPDATE student_details
       SET batch = ?, Semester = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP
       WHERE regno = ?`,
      [batch, semesterNumber, userEmail, rollnumber]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        status: "failure",
        message: "No changes made to the student batch",
      });
    }

    await connection.commit();
    res.status(200).json({
      status: "success",
      message: "Student batch updated successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error updating student batch:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

export const getAvailableCoursesForBatch = catchAsync(async (req, res) => {
  const { batchId, semesterNumber } = req.params;
  const userEmail = req.user?.email || 'admin';
  let connection = null;

  try {
    if (!batchId || isNaN(batchId) || !semesterNumber || isNaN(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      return res.status(400).json({
        status: "error",
        message: "Valid batchId and semesterNumber (1-8) are required",
      });
    }

    connection = await pool.getConnection();
    console.log('Database connection acquired');

    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    const [rows] = await connection.execute(
      `
      SELECT 
        c.courseId, 
        c.courseCode, 
        c.courseTitle AS courseName,
        c.category,
        sem.semesterNumber,
        sec.sectionId, 
        sec.sectionName,
        u.Userid, 
        u.username AS staff,
        b.branch AS department,
        (SELECT COUNT(DISTINCT sc2.regno) 
         FROM StudentCourse sc2 
         WHERE sc2.courseId = c.courseId 
         AND sc2.sectionId = sec.sectionId) AS enrolled
      FROM Course c
      JOIN Semester sem ON c.semesterId = sem.semesterId
      JOIN Batch b ON sem.batchId = b.batchId
      JOIN Section sec ON c.courseId = sec.courseId
      LEFT JOIN StaffCourse sc ON c.courseId = sc.courseId 
        AND sc.sectionId = sec.sectionId
      LEFT JOIN users u ON sc.Userid = u.Userid
      WHERE sem.batchId = ? 
        AND sem.semesterNumber = ? 
        AND c.isActive = 'YES' 
        AND sec.isActive = 'YES'
      `,
      [batchId, semesterNumber]
    );

    const grouped = rows.reduce((acc, row) => {
      if (!acc[row.courseId]) {
        acc[row.courseId] = {
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseName: row.courseName,
          category: row.category,
          semester: `S${row.semesterNumber}`,
          department: row.department,
          batches: [],
        };
      }
      acc[row.courseId].batches.push({
        sectionId: row.sectionId,
        sectionName: row.sectionName,
        staffId: row.Userid ? String(row.Userid) : null,
        staffName: row.staff || "Not Assigned",
        enrolled: parseInt(row.enrolled) || 0,
        capacity: 40,
      });
      return acc;
    }, {});

    connection.release();

    res.status(200).json({
      status: "success",
      data: Object.values(grouped),
    });
  } catch (err) {
    if (connection) {
      connection.release();
    }
    console.error(`Error fetching available courses for batchId ${batchId}, semester ${semesterNumber}:`, err);
    res.status(500).json({
      status: "error",
      message: "Internal server error while fetching available courses",
    });
  }
});

export const unenrollStudentFromCourse = catchAsync(async (req, res) => {
  const { rollnumber, courseId } = req.body;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!rollnumber || !courseId) {
      return res.status(400).json({
        status: "failure",
        message: "rollnumber and courseId are required",
      });
    }

    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    const [studentRows] = await connection.execute(
      `SELECT regno FROM student_details WHERE regno = ?`,
      [rollnumber]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No student found with rollnumber ${rollnumber}`,
      });
    }

    const [courseRows] = await connection.execute(
      `SELECT courseCode FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active course found with courseId ${courseId}`,
      });
    }
    const { courseCode } = courseRows[0];

    const [enrollmentRows] = await connection.execute(
      `SELECT studentCourseId FROM StudentCourse WHERE regno = ? AND courseId = ?`,
      [rollnumber, courseId]
    );
    if (enrollmentRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `Student ${rollnumber} is not enrolled in course ${courseCode}`,
      });
    }

    const [result] = await connection.execute(
      `DELETE FROM StudentCourse WHERE regno = ? AND courseId = ?`,
      [rollnumber, courseId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        status: "failure",
        message: "No changes made. Student may not be enrolled in the course",
      });
    }

    await connection.commit();
    res.status(200).json({
      status: "success",
      message: `Student ${rollnumber} unenrolled from course ${courseCode} successfully`,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error unenrolling student:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});
