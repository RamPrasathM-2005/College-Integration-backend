import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

export const getStudentEnrollments = catchAsync(async (req, res) => {
  const { batch, dept, sem } = req.query;
  let connection = null;

  try {
    // Validate query parameters (mirroring searchStudents style)
    if (sem) {
      const semNum = parseInt(sem, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 8) {
        return res.status(400).json({
          status: 'failure',
          message: 'Invalid sem. Must be a number between 1 and 8.',
        });
      }
    }
    if (batch && !/^\d{4}$/.test(batch)) {
      return res.status(400).json({
        status: 'failure',
        message: 'Invalid batch format. Must be a 4-digit year.',
      });
    }
    if (dept && !/^[A-Z]{2,}$/.test(dept)) {
      return res.status(400).json({
        status: 'failure',
        message: 'Invalid dept acronym. Must be uppercase letters (e.g., CSE).',
      });
    }

    // Get database connection
    connection = await pool.getConnection();
    console.log('Database connection acquired for getStudentEnrollments');

    // Fixed query: Use 'cr' alias consistently for Course table fields
    let query = `
      SELECT 
        sd.regno,
        u.username AS name,
        cr.courseCode,
        cr.courseTitle,
        us.Userid AS staffId,
        us.username AS staffName
      FROM student_details sd
      JOIN users u ON sd.Userid = u.Userid
      JOIN department d ON sd.Deptid = d.Deptid
      JOIN Batch b ON sd.batch = b.batch
      JOIN StudentCourse sc ON sd.regno = sc.regno
      JOIN Course cr ON sc.courseId = cr.courseId
      JOIN Semester sem ON cr.semesterId = sem.semesterId
      LEFT JOIN Section s ON sc.sectionId = s.sectionId AND sc.courseId = s.courseId
      LEFT JOIN StaffCourse scf ON sc.courseId = scf.courseId AND sc.sectionId = scf.sectionId
      LEFT JOIN users us ON scf.Userid = us.Userid AND us.role = 'Staff' AND us.status = 'active'
      WHERE u.status = 'active' AND cr.isActive = 'YES' AND sem.isActive = 'YES'
    `;
    const queryParams = [];

    if (dept) {
      query += ' AND d.Deptacronym = ?';
      queryParams.push(dept);
    }
    if (batch) {
      query += ' AND b.batch = ?';
      queryParams.push(batch);
    }
    if (sem) {
      query += ' AND sd.Semester = ?';
      queryParams.push(parseInt(sem, 10));
    }

    query += ' ORDER BY sd.regno, cr.courseCode';

    console.log('Executing enrollments query:', query, 'with params:', queryParams);
    const [rows] = await connection.execute(query, queryParams);
    console.log('Enrollments query result count:', rows.length);

    // No aggregation needed - flattened rows for table (filter out rows without course)
    const enrollments = rows.filter(row => row.courseCode).map(row => ({
      regno: row.regno || 'Unknown',
      name: row.name || 'Unknown',
      courseCode: row.courseCode || 'Unknown',
      courseTitle: row.courseTitle || 'Unknown',
      staffId: row.staffId ? String(row.staffId) : 'Not Assigned',
      staffName: row.staffName || 'Not Assigned',
    }));

    connection.release();

    res.status(200).json({
      status: 'success',
      data: enrollments,  // For export: frontend can use this array directly
    });
  } catch (err) {
    if (connection) {
      connection.release();
    }
    console.error('Error in getStudentEnrollments:', {
      message: err.message,
      stack: err.stack,
      queryParams: { batch, dept, sem },
    });
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  }
});