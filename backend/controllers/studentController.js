import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

export const addStudent = catchAsync(async (req, res) => {
  const { rollnumber, name, degree, branch, batch, semesterNumber } = req.body;
  if (!rollnumber || !name || !degree || !branch || !batch || !semesterNumber) {
    return res.status(400).json({ status: "failure", message: "All fields are required" });
  }
  const [existingStudent] = await pool.execute(`SELECT rollnumber FROM Student WHERE rollnumber = ?`, [rollnumber]);
  if (existingStudent.length > 0) {
    return res.status(400).json({ status: "failure", message: "Student with this roll number already exists" });
  }
  const [batchRows] = await pool.execute(
    `SELECT batchId FROM Batch WHERE degree = ? AND branch = ? AND batch = ? AND IsActive = 'YES'`,
    [degree, branch, batch]
  );
  if (batchRows.length === 0) {
    return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
  }
  const batchId = batchRows[0].batchId;
  const [result] = await pool.execute(
    `INSERT INTO Student (rollnumber, name, batchId, semesterNumber, createdBy, updatedBy)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rollnumber, name, batchId, semesterNumber, req.user?.email || 'admin', req.user?.email || 'admin']
  );
  res.status(201).json({
    status: "success",
    message: "Student added successfully",
    rollnumber: rollnumber,
  });
});

export const getAllStudents = catchAsync(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.*, b.degree, b.branch, b.batch, b.batchYears
     FROM Student s
     INNER JOIN Batch b ON s.batchId = b.batchId
     WHERE s.IsActive = 'YES' AND b.IsActive = 'YES'
     ORDER BY s.rollnumber ASC`
  );
  res.status(200).json({ status: "success", data: rows });
});

export const getStudentByRollNumber = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const [rows] = await pool.execute(
    `SELECT s.*, b.degree, b.branch, b.batch, b.batchYears
     FROM Student s
     INNER JOIN Batch b ON s.batchId = b.batchId
     WHERE s.rollnumber = ? AND s.IsActive = 'YES' AND b.IsActive = 'YES'`,
    [rollnumber]
  );
  if (rows.length === 0) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }
  res.status(200).json({ status: "success", data: rows[0] });
});

export const updateStudent = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const { name, degree, branch, batch, semesterNumber } = req.body;
  const [existingStudent] = await pool.execute(`SELECT batchId FROM Student WHERE rollnumber = ? AND IsActive = 'YES'`, [rollnumber]);
  if (existingStudent.length === 0) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }
  let batchId = existingStudent[0].batchId;
  if (batch || branch || degree) {
    if (!batch || !branch || !degree) {
      return res.status(400).json({ status: "failure", message: "degree, branch, and batch are required together" });
    }
    const [batchRows] = await pool.execute(
      `SELECT batchId FROM Batch WHERE degree = ? AND branch = ? AND batch = ? AND IsActive = 'YES'`,
      [degree, branch, batch]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
    }
    batchId = batchRows[0].batchId;
  }
  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (semesterNumber !== undefined) updateFields.semesterNumber = semesterNumber;
  if (batchId !== undefined) updateFields.batchId = batchId;
  updateFields.updatedBy = req.user?.email || 'admin';
  if (Object.keys(updateFields).length <= 1) { // Only updatedBy is not enough
    return res.status(400).json({ status: "failure", message: "No valid fields to update" });
  }
  const keys = Object.keys(updateFields).map((key) => `${key} = ?`).join(", ");
  const values = Object.values(updateFields);
  const [result] = await pool.execute(`UPDATE Student SET ${keys}, updatedDate = NOW() WHERE rollnumber = ?`, [
    ...values,
    rollnumber,
  ]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ status: "failure", message: "Student not found or no changes made" });
  }
  res.status(200).json({
    status: "success",
    message: "Student updated successfully",
    rollnumber: rollnumber,
  });
});

export const deleteStudent = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const [result] = await pool.execute(`DELETE FROM Student WHERE rollnumber = ?`, [rollnumber]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ status: "failure", message: "Student not found" });
  }
  res.status(200).json({
    status: "success",
    message: `Student with roll number ${rollnumber} deleted successfully`,
  });
});

export const getStudentEnrolledCourses = catchAsync(async (req, res) => {
  const { rollnumber } = req.params;
  const [rows] = await pool.execute(
    `SELECT 
      sc.courseId,
      c.courseCode, 
      c.courseTitle AS courseName, 
      sec.sectionName AS batch, 
      u.username AS staff
     FROM StudentCourse sc
     JOIN Course c ON sc.courseId = c.courseId
     JOIN Section sec ON sc.sectionId = sec.sectionId
     LEFT JOIN StaffCourse stc ON sc.courseId = stc.courseId AND sc.sectionId = stc.sectionId
     LEFT JOIN users u ON stc.staffId = u.Userid
     WHERE sc.regno = ? AND c.isActive = 'YES' AND sec.isActive = 'YES'`,
    [rollnumber]
  );
  res.status(200).json({
    status: "success",
    data: rows,
  });
});

export const getStudentsByCourseAndSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.query;

  if (!courseCode || !sectionId) {
    return res.status(400).json({
      status: 'failure',
      message: 'courseCode and sectionId are required',
    });
  }

  try {
    // Fetch courseId from courseCode
    const [courseRows] = await pool.execute(
      `SELECT courseId FROM Course WHERE courseCode = ? AND isActive = 'YES'`,
      [courseCode]
    );

    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `Course with code ${courseCode} not found or inactive`,
      });
    }

    const courseId = courseRows[0].courseId;

    const [rows] = await pool.execute(
      `SELECT 
        sd.regno AS rollnumber,
        u.username AS name,
        sec.sectionName AS batch
       FROM StudentCourse sc
       JOIN student_details sd ON sc.regno = sd.regno
       JOIN users u ON sd.Userid = u.Userid
       JOIN Section sec ON sc.sectionId = sec.sectionId
       JOIN Course c ON sc.courseId = c.courseId
       WHERE sc.courseId = ? AND sc.sectionId = ? AND u.status = 'active' AND sec.isActive = 'YES'`,
      [courseId, sectionId]
    );

    res.status(200).json({
      status: 'success',
      data: rows,
    });
  } catch (err) {
    console.error('Error fetching students by course and section:', {
      message: err.message,
      stack: err.stack,
      query: { courseCode, sectionId },
    });
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
});

export const getBranches = catchAsync(async (req, res) => {
  const [rows] = await pool.execute(`SELECT DISTINCT branch FROM Batch WHERE IsActive = 'YES'`);
  if (!rows.length) {
    return res.status(404).json({
      status: "failure",
      message: "No active branches found",
    });
  }
  res.status(200).json({
    status: "success",
    data: rows.map((row) => row.branch),
  });
});

export const getSemesters = catchAsync(async (req, res) => {
  const [rows] = await pool.execute(`SELECT DISTINCT semesterNumber FROM Semester WHERE IsActive = 'YES'`);
  if (!rows.length) {
    return res.status(404).json({
      status: "failure",
      message: "No active semesters found",
    });
  }
  res.status(200).json({
    status: "success",
    data: rows.map((row) => `Semester ${row.semesterNumber}`),
  });
});

export const getBatches = catchAsync(async (req, res) => {
  const { branch } = req.query;
  let query = `SELECT batchId, degree, branch, batch, batchYears FROM Batch WHERE IsActive = 'YES'`;
  let params = [];
  if (branch) {
    query += ` AND branch = ?`;
    params.push(branch);
  }
  const [rows] = await pool.execute(query, params);
  if (!rows.length) {
    return res.status(404).json({
      status: "failure",
      message: "No active batches found",
    });
  }
  res.status(200).json({
    status: "success",
    data: rows,
  });
});