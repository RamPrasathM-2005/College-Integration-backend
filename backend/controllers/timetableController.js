import pool from '../db.js';
import catchAsync from '../utils/catchAsync.js';

export const getAllTimetableDepartments = catchAsync(async (req, res) => {
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
        data: [],
      });
    }

    const [rows] = await connection.execute(
      'SELECT Deptid, Deptacronym AS deptCode, Deptname FROM department'
    );

    await connection.commit();
    res.status(200).json({
      status: 'success',
      data: rows || [],
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error fetching timetable departments:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Failed to fetch departments for timetable: ' + error.message,
      data: [],
    });
  } finally {
    if (connection) connection.release();
  }
});

export const getAllTimetableBatches = catchAsync(async (req, res) => {
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
        data: [],
      });
    }

    const [rows] = await connection.execute(
      'SELECT batchId, degree, branch, batch, batchYears FROM Batch WHERE isActive = "YES"'
    );

    await connection.commit();
    res.status(200).json({
      status: 'success',
      data: rows || [],
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error fetching timetable batches:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Failed to fetch batches for timetable: ' + error.message,
      data: [],
    });
  } finally {
    if (connection) connection.release();
  }
});

export const getTimetable = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      throw new Error(`No active user found with email ${userEmail}`);
    }

    // Validate semesterId
    if (isNaN(semesterId) || semesterId <= 0) {
      throw new Error('Invalid semesterId: must be a positive number');
    }

    const [semesterRows] = await connection.execute(
      'SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = "YES"',
      [semesterId]
    );
    if (semesterRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active semester found with semesterId ${semesterId}`,
        data: [],
      });
    }

    const [rows] = await connection.execute(
      `
      SELECT t.timetableId, c.courseId, 
             COALESCE(t.sectionId, 0) AS sectionId, 
             UPPER(COALESCE(t.dayOfWeek, '')) AS dayOfWeek, 
             t.periodNumber, 
             COALESCE(c.courseTitle, c.courseId) AS courseTitle, 
             COALESCE(s.sectionName, 'No Section') AS sectionName
      FROM Timetable t
      LEFT JOIN Course c ON t.courseId = c.courseId AND c.isActive = "YES"
      LEFT JOIN Section s ON t.sectionId = s.sectionId AND (s.isActive = "YES" OR s.isActive IS NULL)
      WHERE t.semesterId = ? 
        AND t.isActive = "YES" 
        AND (t.dayOfWeek IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT') OR t.dayOfWeek IS NULL)
        AND (t.periodNumber BETWEEN 1 AND 8 OR t.periodNumber IS NULL)
      `,
      [semesterId]
    );

    // Log warnings for invalid entries
    rows.forEach((entry, index) => {
      if (!entry.dayOfWeek || entry.periodNumber === null) {
        console.warn(`Invalid timetable entry at index ${index} for semesterId ${semesterId}:`, entry);
      }
    });

    await connection.commit();
    res.status(200).json({
      status: 'success',
      data: rows || [],
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error fetching timetable:', error);
    res.status(error.message.includes('No active user') || error.message.includes('Invalid semesterId') ? 400 : 500).json({
      status: 'failure',
      message: `Failed to fetch timetable: ${error.message}`,
      data: [],
    });
  } finally {
    if (connection) connection.release();
  }
});

export const getTimetableByFilters = catchAsync(async (req, res) => {
  const { degree, Deptid, semesterNumber } = req.query;
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      throw new Error(`No active user found with email ${userEmail}`);
    }

    // Validate required fields
    if (!degree || !Deptid || !semesterNumber) {
      throw new Error('degree, Deptid, and semesterNumber are required');
    }
    if (isNaN(Deptid) || Deptid <= 0) throw new Error('Invalid Deptid: must be a positive number');
    if (isNaN(semesterNumber) || semesterNumber <= 0) throw new Error('Invalid semesterNumber: must be a positive number');
    const validSemesters = [1, 2, 3, 4, 5, 6, 7, 8];
    if (!validSemesters.includes(Number(semesterNumber))) {
      throw new Error(`Invalid semesterNumber: must be one of ${validSemesters.join(', ')}`);
    }

    const [deptRows] = await connection.execute(
      'SELECT Deptid FROM department WHERE Deptid = ?',
      [Deptid]
    );
    if (deptRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No department found with Deptid ${Deptid}`,
        data: [],
      });
    }

    const [rows] = await connection.execute(
      `
      SELECT t.timetableId, c.courseId, 
             COALESCE(t.sectionId, 0) AS sectionId, 
             UPPER(COALESCE(t.dayOfWeek, '')) AS dayOfWeek, 
             t.periodNumber, 
             COALESCE(c.courseTitle, c.courseId) AS courseTitle, 
             COALESCE(s.sectionName, 'No Section') AS sectionName
      FROM Timetable t
      LEFT JOIN Course c ON t.courseId = c.courseId AND c.isActive = "YES"
      LEFT JOIN Section s ON t.sectionId = s.sectionId AND (s.isActive = "YES" OR s.isActive IS NULL)
      JOIN Semester sem ON t.semesterId = sem.semesterId
      JOIN Batch b ON sem.batchId = b.batchId
      WHERE b.degree = ? AND t.Deptid = ? AND sem.semesterNumber = ? 
        AND t.isActive = "YES" 
        AND b.isActive = "YES"
        AND (t.dayOfWeek IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT') OR t.dayOfWeek IS NULL)
        AND (t.periodNumber BETWEEN 1 AND 8 OR t.periodNumber IS NULL)
      `,
      [degree, Deptid, semesterNumber]
    );

    // Log warnings for invalid entries
    rows.forEach((entry, index) => {
      if (!entry.dayOfWeek || entry.periodNumber === null) {
        console.warn(`Invalid timetable entry at index ${index} for degree ${degree}, Deptid ${Deptid}, semesterNumber ${semesterNumber}:`, entry);
      }
    });

    await connection.commit();
    res.status(200).json({
      status: 'success',
      data: rows || [],
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error fetching timetable by filters:', error);
    res.status(error.message.includes('No active user') || error.message.includes('Invalid') || error.message.includes('No department') ? 400 : 500).json({
      status: 'failure',
      message: `Failed to fetch timetable by filters: ${error.message}`,
      data: [],
    });
  } finally {
    if (connection) connection.release();
  }
});

export const createTimetableEntry = catchAsync(async (req, res) => {
  const { courseId, courseTitle, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      throw new Error(`No active user found with email ${userEmail}`);
    }

    // Validate required fields
    if (!courseId || !dayOfWeek || !periodNumber || !Deptid || !semesterId) {
      throw new Error('courseId, dayOfWeek, periodNumber, Deptid, and semesterId are required');
    }

    // Validate numeric fields
    if (isNaN(Deptid) || Deptid <= 0) throw new Error('Invalid Deptid: must be a positive number');
    if (isNaN(semesterId) || semesterId <= 0) throw new Error('Invalid semesterId: must be a positive number');
    if (isNaN(periodNumber) || periodNumber <= 0) throw new Error('Invalid periodNumber: must be a positive number');

    // Validate dayOfWeek and periodNumber
    const validDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    if (!validDays.includes(dayOfWeek)) {
      throw new Error(`Invalid dayOfWeek: must be one of ${validDays.join(', ')}`);
    }
    const validTeachingPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
    if (!validTeachingPeriods.includes(Number(periodNumber))) {
      throw new Error('Invalid period number: must be a valid teaching period (1-8)');
    }

    // Validate semesterId
    const [semesterRows] = await connection.execute(
      'SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = "YES"',
      [semesterId]
    );
    if (semesterRows.length === 0) {
      throw new Error(`No active semester found with semesterId ${semesterId}`);
    }

    // Validate Deptid
    const [deptRows] = await connection.execute(
      'SELECT Deptid FROM Department WHERE Deptid = ?',
      [Deptid]
    );
    if (deptRows.length === 0) {
      throw new Error(`No department found with Deptid ${Deptid}`);
    }

    // Check for conflicts
    const [conflictCheck] = await connection.execute(
      'SELECT timetableId FROM Timetable WHERE semesterId = ? AND dayOfWeek = ? AND periodNumber = ? AND isActive = "YES"',
      [semesterId, dayOfWeek, periodNumber]
    );
    if (conflictCheck.length > 0) {
      throw new Error('Time slot already assigned');
    }

    // Validate courseId and courseTitle
    let finalCourseTitle = courseTitle;
    const [courseRows] = await connection.execute(
      'SELECT courseId, courseTitle FROM Course WHERE courseId = ? AND isActive = "YES"',
      [courseId]
    );
    if (courseRows.length > 0) {
      finalCourseTitle = courseRows[0].courseTitle; // Use actual courseTitle for valid courses
    } else if (!courseTitle) {
      throw new Error(`No active course found with courseId ${courseId} and no courseTitle provided`);
    }

    // Validate sectionId if provided
    if (sectionId) {
      const [sectionCheck] = await connection.execute(
        'SELECT sectionId FROM Section WHERE sectionId = ? AND courseId = ? AND isActive = "YES"',
        [sectionId, courseId]
      );
      if (sectionCheck.length === 0) {
        throw new Error(`No active section found with sectionId ${sectionId} for courseId ${courseId}`);
      }
    }

    const [result] = await connection.execute(
      `
      INSERT INTO Timetable (courseId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId, isActive, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, 'YES', ?, ?)
      `,
      [courseId, sectionId || null, dayOfWeek, periodNumber, Deptid, semesterId, userEmail, userEmail]
    );

    await connection.commit();
    res.status(201).json({
      status: 'success',
      timetableId: result.insertId,
      message: 'Timetable entry created successfully',
      data: {
        timetableId: result.insertId,
        courseId: courseRows.length > 0 ? courseRows[0].courseId : courseId,
        courseTitle: finalCourseTitle,
        sectionId: sectionId || null,
        dayOfWeek,
        periodNumber,
        Deptid,
        semesterId,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error creating timetable entry:', error);
    res.status(error.message.includes('No active user') || error.message.includes('Invalid') || error.message.includes('No active') || error.message.includes('Time slot') || error.message.includes('No department') ? 400 : 500).json({
      status: 'failure',
      message: `Failed to create timetable entry: ${error.message}`,
    });
  } finally {
    if (connection) connection.release();
  }
});

export const updateTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const { courseId, sectionId, dayOfWeek, periodNumber, Deptid, semesterId } = req.body;
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    // Validate required fields
    if (!courseId || !dayOfWeek || !periodNumber || !Deptid || !semesterId) {
      return res.status(400).json({
        status: 'failure',
        message: 'courseId, dayOfWeek, periodNumber, Deptid, and semesterId are required',
      });
    }

    // Validate timetableId
    const [timetableRows] = await connection.execute(
      'SELECT timetableId FROM Timetable WHERE timetableId = ? AND isActive = "YES"',
      [timetableId]
    );
    if (timetableRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active timetable entry found with timetableId ${timetableId}`,
      });
    }

    // Validate courseId
    const [courseRows] = await connection.execute(
      'SELECT courseId FROM Course WHERE courseId = ? AND isActive = "YES"',
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }

    // Validate semesterId
    const [semesterRows] = await connection.execute(
      'SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = "YES"',
      [semesterId]
    );
    if (semesterRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active semester found with semesterId ${semesterId}`,
      });
    }

    // Validate Deptid
    const [deptRows] = await connection.execute(
      'SELECT Deptid FROM Department WHERE Deptid = ?',
      [Deptid]
    );
    if (deptRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No department found with Deptid ${Deptid}`,
      });
    }

    // Validate periodNumber
    const validTeachingPeriods = [1, 2, 3, 4, 5, 6, 7, 8];
    if (!validTeachingPeriods.includes(Number(periodNumber))) {
      return res.status(400).json({
        status: 'failure',
        message: 'Invalid period number: must be a valid teaching period (1-8)',
      });
    }

    // Check for conflicts
    const [conflictCheck] = await connection.execute(
      'SELECT timetableId FROM Timetable WHERE semesterId = ? AND dayOfWeek = ? AND periodNumber = ? AND timetableId != ? AND isActive = "YES"',
      [semesterId, dayOfWeek, periodNumber, timetableId]
    );
    if (conflictCheck.length > 0) {
      return res.status(400).json({
        status: 'failure',
        message: 'Time slot already assigned',
      });
    }

    // Validate sectionId if provided
    if (sectionId) {
      const [sectionCheck] = await connection.execute(
        'SELECT sectionId FROM Section WHERE sectionId = ? AND courseId = ? AND isActive = "YES"',
        [sectionId, courseId]
      );
      if (sectionCheck.length === 0) {
        return res.status(404).json({
          status: 'failure',
          message: `No active section found with sectionId ${sectionId} for courseId ${courseId}`,
        });
      }
    }

    const [result] = await connection.execute(
      `
      UPDATE Timetable
      SET courseId = ?, sectionId = ?, dayOfWeek = ?, periodNumber = ?, Deptid = ?, semesterId = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE timetableId = ?
      `,
      [courseId, sectionId || null, dayOfWeek, periodNumber, Deptid, semesterId, userEmail, timetableId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'failure',
        message: 'Timetable entry not found',
      });
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: 'Timetable entry updated',
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error updating timetable entry:', error);
    res.status(error.message.includes('No active user') || error.message.includes('Invalid') || error.message.includes('No active') || error.message.includes('Time slot') || error.message.includes('No department') ? 400 : 500).json({
      status: 'failure',
      message: 'Failed to update timetable entry: ' + error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

export const deleteTimetableEntry = catchAsync(async (req, res) => {
  const { timetableId } = req.params;
  const userEmail = req.user?.email || 'admin';
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate user
    const [userCheck] = await connection.execute(
      'SELECT Userid FROM users WHERE Email = ? AND status = "active"',
      [userEmail]
    );
    if (userCheck.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active user found with email ${userEmail}`,
      });
    }

    // Validate timetableId
    const [timetableRows] = await connection.execute(
      'SELECT timetableId FROM Timetable WHERE timetableId = ? AND isActive = "YES"',
      [timetableId]
    );
    if (timetableRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active timetable entry found with timetableId ${timetableId}`,
      });
    }

    // Soft delete
    const [result] = await connection.execute(
      'UPDATE Timetable SET isActive = "NO", updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE timetableId = ?',
      [userEmail, timetableId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'failure',
        message: 'Timetable entry not found',
      });
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: 'Timetable entry deleted',
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Failed to delete timetable entry: ' + error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});