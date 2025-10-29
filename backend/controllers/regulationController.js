// Modified regulationController.js
import pool, { branchMap } from '../db.js';

const determineCourseType = (lectureHours, tutorialHours, practicalHours, experientialHours) => {
  if (experientialHours > 0) return 'EXPERIENTIAL LEARNING';
  if (practicalHours > 0) {
    if (lectureHours > 0 || tutorialHours > 0) return 'INTEGRATED';
    return 'PRACTICAL';
  }
  return 'THEORY';
};

export const getAllRegulations = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT r.regulationId, r.Deptid, r.regulationYear, d.Deptacronym
      FROM Regulation r
      JOIN department d ON r.Deptid = d.Deptid
      WHERE r.isActive = 'YES'
    `);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching regulations:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getVerticalsByRegulation = async (req, res) => {
  const { regulationId } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT verticalId, verticalName FROM Vertical WHERE regulationId = ? AND isActive = "YES"',
      [regulationId]
    );
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching verticals:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const createVertical = async (req, res) => {
  const { regulationId, verticalName } = req.body;
  const createdBy = req.user?.username || 'admin';
  const updatedBy = createdBy;

  if (!regulationId || !verticalName) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and vertical name are required' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO Vertical (regulationId, verticalName, createdBy, updatedBy)
       VALUES (?, ?, ?, ?)`,
      [regulationId, verticalName, createdBy, updatedBy]
    );
    res.json({ status: 'success', message: 'Vertical added successfully', data: { verticalId: result.insertId } });
  } catch (err) {
    console.error('Error adding vertical:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const importRegulationCourses = async (req, res) => {
  const { regulationId, courses } = req.body;
  const createdBy = req.user?.username || 'admin';
  const updatedBy = createdBy;

  if (!regulationId || !Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'Regulation ID and courses array are required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const courseInserts = courses.map(async (course, index) => {
      const {
        courseCode, courseTitle, category, lectureHours, tutorialHours,
        practicalHours, experientialHours, totalContactPeriods, credits,
        minMark, maxMark, semesterNumber
      } = course;

      if (!semesterNumber || semesterNumber < 1 || semesterNumber > 8) {
        throw new Error(`Invalid semester number ${semesterNumber} for course ${courseCode} at row ${index + 2}`);
      }

      const [result] = await connection.execute(
        `INSERT INTO RegulationCourse (
          regulationId, semesterNumber, courseCode, courseTitle, category, type,
          lectureHours, tutorialHours, practicalHours, experientialHours,
          totalContactPeriods, credits, minMark, maxMark, createdBy, updatedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          regulationId,
          semesterNumber,
          courseCode,
          courseTitle,
          category.toUpperCase(),
          determineCourseType(lectureHours, tutorialHours, practicalHours, experientialHours),
          lectureHours,
          tutorialHours,
          practicalHours,
          experientialHours,
          totalContactPeriods,
          credits,
          minMark,
          maxMark,
          createdBy,
          updatedBy
        ]
      );
      return result.insertId;
    });

    await Promise.all(courseInserts);
    await connection.commit();
    res.json({ status: 'success', message: 'Courses added to regulation successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error adding courses:', err);
    res.status(500).json({ status: 'failure', message: `Server error: ${err.message}` });
  } finally {
    if (connection) connection.release();
  }
};

export const allocateCoursesToVertical = async (req, res) => {
  const { verticalId, regCourseIds } = req.body;
  const createdBy = req.user?.username || 'admin';
  const updatedBy = createdBy;

  if (!verticalId || !Array.isArray(regCourseIds) || regCourseIds.length === 0) {
    return res.status(400).json({ status: 'failure', message: 'Vertical ID and regCourse IDs are required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const inserts = regCourseIds.map(regCourseId =>
      connection.execute(
        `INSERT INTO VerticalCourse (verticalId, regCourseId, createdBy, updatedBy)
         VALUES (?, ?, ?, ?)`,
        [verticalId, regCourseId, createdBy, updatedBy]
      )
    );

    await Promise.all(inserts);
    await connection.commit();
    res.json({ status: 'success', message: 'Courses allocated to vertical successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error allocating courses:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
};

export const getAvailableCoursesForVertical = async (req, res) => {
  const { regulationId } = req.params;
  try {
    const [rows] = await pool.execute(`
      SELECT rc.regCourseId AS courseId, rc.courseCode, rc.courseTitle, rc.category, rc.semesterNumber
      FROM RegulationCourse rc
      LEFT JOIN VerticalCourse vc ON rc.regCourseId = vc.regCourseId
      WHERE rc.regulationId = ? AND rc.category IN ('PEC', 'OEC') AND vc.regCourseId IS NULL
      AND rc.isActive = 'YES'
    `, [regulationId]);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching available courses:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const getCoursesByVertical = async (req, res) => {
  const { verticalId } = req.params;
  const { semesterNumber } = req.query;

  let query = `
    SELECT rc.regCourseId AS courseId, rc.courseCode, rc.courseTitle, rc.category, rc.semesterNumber
    FROM RegulationCourse rc
    JOIN VerticalCourse vc ON rc.regCourseId = vc.regCourseId
    WHERE vc.verticalId = ? AND rc.isActive = 'YES' AND rc.category IN ('PEC', 'OEC')
  `;
  let params = [verticalId];

  if (semesterNumber) {
    query += ' AND rc.semesterNumber = ?';
    params.push(semesterNumber);
  }

  try {
    const [rows] = await pool.execute(query, params);
    res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching courses by vertical:', err);
    res.status(500).json({ status: 'failure', message: 'Server error: ' + err.message });
  }
};

export const allocateRegulationToBatch = async (req, res) => {
  const { batchId, regulationId } = req.body;
  const createdBy = req.user?.username || 'admin';
  const updatedBy = createdBy;

  if (!batchId || !regulationId) {
    return res.status(400).json({ status: 'failure', message: 'Batch ID and regulation ID are required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fetch batch to get branch
    const [batches] = await connection.execute(
      `SELECT batchId, branch FROM Batch WHERE batchId = ? AND isActive = 'YES'`,
      [batchId]
    );
    if (batches.length === 0) {
      throw new Error('Batch not found or inactive');
    }
    const { branch } = batches[0];

    // Validate branch and get Deptid
    const dept = branchMap[branch];
    if (!dept) {
      throw new Error(`Invalid branch: ${branch}`);
    }
    const Deptid = dept.Deptid;

    // Validate regulation
    const [regulations] = await connection.execute(
      `SELECT Deptid FROM Regulation WHERE regulationId = ? AND isActive = 'YES'`,
      [regulationId]
    );
    if (regulations.length === 0) {
      throw new Error('Regulation not found or inactive');
    }
    if (regulations[0].Deptid !== Deptid) {
      throw new Error(`Regulation department (${regulations[0].Deptid}) does not match batch department (${Deptid})`);
    }

    // Update Batch table with regulationId
    const [updateResult] = await connection.execute(
      `UPDATE Batch SET regulationId = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE batchId = ?`,
      [regulationId, updatedBy, batchId]
    );
    if (updateResult.affectedRows === 0) {
      throw new Error(`Failed to update batch ${batchId} with regulationId ${regulationId}`);
    }

    // Fetch regulation courses
    const [regCourses] = await connection.execute(
      `SELECT * FROM RegulationCourse WHERE regulationId = ? AND isActive = 'YES'`,
      [regulationId]
    );
    if (regCourses.length === 0) {
      throw new Error('No active courses found for the regulation');
    }

    // Create all 8 semesters for the batch if they don't exist
    const [existingSemesters] = await connection.execute(
      `SELECT semesterNumber FROM Semester WHERE batchId = ?`,
      [batchId]
    );
    const existingSemesterNumbers = existingSemesters.map(sem => sem.semesterNumber);
    const requiredSemesters = [1, 2, 3, 4, 5, 6, 7, 8];
    const missingSemesters = requiredSemesters.filter(num => !existingSemesterNumbers.includes(num));

    for (const semesterNumber of missingSemesters) {
      const startDate = new Date(`${new Date().getFullYear()}-01-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(startDate.getMonth() + 6);

      await connection.execute(
        `INSERT INTO Semester (batchId, semesterNumber, startDate, endDate, isActive, createdBy, updatedBy)
         VALUES (?, ?, ?, ?, 'YES', ?, ?)`,
        [batchId, semesterNumber, startDate, endDate, createdBy, updatedBy]
      );
    }

    // Fetch updated semesters for the batch
    const [semesters] = await connection.execute(
      `SELECT semesterId, semesterNumber FROM Semester WHERE batchId = ? AND isActive = 'YES'`,
      [batchId]
    );
    const semesterMap = semesters.reduce((map, sem) => {
      map[sem.semesterNumber] = sem.semesterId;
      return map;
    }, {});

    // Copy regulation courses to Course table (check for duplicates by courseCode and semesterId)
    const courseInserts = regCourses.map(async (regCourse) => {
      const semesterId = semesterMap[regCourse.semesterNumber];
      if (!semesterId) {
        throw new Error(`Semester ${regCourse.semesterNumber} not found for batch ${batchId}`);
      }

      // Check if course already exists for this semester
      const [existingCourses] = await connection.execute(
        `SELECT courseId FROM Course WHERE courseCode = ? AND semesterId = ?`,
        [regCourse.courseCode, semesterId]
      );
      if (existingCourses.length > 0) {
        return; // Skip if already exists
      }

      await connection.execute(
        `INSERT INTO Course (
          courseCode, semesterId, courseTitle, category, type,
          lectureHours, tutorialHours, practicalHours, experientialHours,
          totalContactPeriods, credits, minMark, maxMark, createdBy, updatedBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          regCourse.courseCode,
          semesterId,
          regCourse.courseTitle,
          regCourse.category,
          regCourse.type,
          regCourse.lectureHours,
          regCourse.tutorialHours,
          regCourse.practicalHours,
          regCourse.experientialHours,
          regCourse.totalContactPeriods,
          regCourse.credits,
          regCourse.minMark,
          regCourse.maxMark,
          createdBy,
          updatedBy
        ]
      );
    });

    await Promise.all(courseInserts);
    await connection.commit();
    res.json({ status: 'success', message: 'Regulation allocated to batch successfully, all semesters and courses created' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error allocating regulation to batch:', err);
    res.status(500).json({ status: 'failure', message: `Server error: ${err.message}` });
  } finally {
    if (connection) connection.release();
  }
};