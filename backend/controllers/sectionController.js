import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

export const addSectionsToCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { numberOfSections } = req.body;
  const userEmail = req.user?.email || 'admin';

  if (!courseId || !numberOfSections || isNaN(numberOfSections) || numberOfSections < 1) {
    return res.status(400).json({
      status: 'failure',
      message: 'courseId and a valid numberOfSections (minimum 1) are required',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate user email
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

    // Validate course
    const [courseRows] = await connection.execute(
      `SELECT courseId, courseCode FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }
    const courseCode = courseRows[0].courseCode;

    // Find the current maximum Batch number among active sections
    const [maxRows] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING(sectionName, 6) AS UNSIGNED)) as maxNum 
       FROM Section 
       WHERE courseId = ? AND sectionName LIKE 'Batch%' AND isActive = 'YES'`,
      [courseId]
    );
    const currentMax = maxRows[0].maxNum || 0;

    const sectionsToAdd = [];
    const sectionsToUpdate = [];
    let newSectionsAdded = 0;
    let sectionsUpdated = 0;

    for (let i = 1; i <= numberOfSections; i++) {
      const sectionNum = currentMax + i;
      const sectionName = `Batch ${sectionNum}`;

      // Check for existing section (active or inactive)
      const [existingSection] = await connection.execute(
        `SELECT sectionId, isActive FROM Section WHERE courseId = ? AND sectionName = ?`,
        [courseId, sectionName]
      );

      if (existingSection.length > 0) {
        if (existingSection[0].isActive === 'YES') {
          continue; // Skip to avoid duplicate active sections
        } else {
          // Inactive section exists, mark for update
          sectionsToUpdate.push([userEmail, existingSection[0].sectionId, sectionName]);
          sectionsUpdated++;
        }
      } else {
        // No section exists, mark for insert
        sectionsToAdd.push([courseId, sectionName, userEmail, userEmail]);
        newSectionsAdded++;
      }
    }

    // Update inactive sections
    if (sectionsToUpdate.length > 0) {
      for (const [updatedBy, sectionId, sectionName] of sectionsToUpdate) {
        const [updateResult] = await connection.execute(
          `UPDATE Section 
           SET isActive = 'YES', updatedBy = ?, updatedDate = CURRENT_TIMESTAMP
           WHERE sectionId = ?`,
          [updatedBy, sectionId]
        );
        if (updateResult.affectedRows === 0) {
          throw new Error(`Failed to update section ${sectionName}`);
        }
      }
    }

    // Insert new sections
    if (sectionsToAdd.length > 0) {
      const placeholders = sectionsToAdd.map(() => "(?, ?, ?, ?)").join(",");
      const query = `
        INSERT INTO Section (courseId, sectionName, createdBy, updatedBy)
        VALUES ${placeholders}
      `;
      const values = sectionsToAdd.flat();
      await connection.execute(query, values);
    }

    await connection.commit();
    res.status(201).json({
      status: 'success',
      message: `${newSectionsAdded} new section(s) added and ${sectionsUpdated} section(s) reactivated for course ${courseCode}`,
      data: [
        ...sectionsToAdd.map(([_, sectionName]) => ({ sectionName })),
        ...sectionsToUpdate.map(([_, __, sectionName]) => ({ sectionName })),
      ],
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error adding sections:', err.message, err.stack);
    res.status(500).json({
      status: 'failure',
      message: `Failed to add sections: ${err.message}`,
    });
  } finally {
    connection.release();
  }
});

export const getSectionsForCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  const connection = await pool.getConnection();
  try {
    const [sectionRows] = await connection.execute(
      `SELECT sectionId, sectionName, c.courseCode 
       FROM Section s 
       JOIN Course c ON s.courseId = c.courseId 
       WHERE s.courseId = ? AND s.isActive = 'YES'`,
      [courseId]
    );
    res.status(200).json({
      status: 'success',
      data: sectionRows.map(row => ({ sectionId: row.sectionId, sectionName: row.sectionName, courseCode: row.courseCode })),
    });
  } catch (err) {
    console.error('Error fetching sections:', err);
    res.status(500).json({ status: 'failure', message: 'Failed to fetch sections' });
  } finally {
    connection.release();
  }
});

export const updateSectionsForCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { sections } = req.body;
  const userEmail = req.user?.email || 'admin';

  if (!courseId || !sections || !Array.isArray(sections)) {
    return res.status(400).json({
      status: 'failure',
      message: 'courseId and an array of sections are required',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate user email
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

    // Validate course
    const [courseRows] = await connection.execute(
      `SELECT courseId, courseCode FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }
    const courseCode = courseRows[0].courseCode;

    for (const section of sections) {
      const { sectionId, sectionName, isActive } = section;
      if (!sectionId || (sectionName && typeof sectionName !== 'string') || (isActive && !['YES', 'NO'].includes(isActive))) {
        return res.status(400).json({
          status: 'failure',
          message: 'Each section must have a valid sectionId, optional sectionName, and optional isActive (YES/NO)',
        });
      }

      // Validate existing section
      const [sectionRows] = await connection.execute(
        `SELECT sectionId FROM Section WHERE sectionId = ? AND courseId = ? AND isActive = 'YES'`,
        [sectionId, courseId]
      );
      if (sectionRows.length === 0) {
        return res.status(404).json({
          status: 'failure',
          message: `No active section found with sectionId ${sectionId} for courseId ${courseId}`,
        });
      }

      // Update section
      const updateFields = [];
      const values = [];
      if (sectionName) {
        updateFields.push('sectionName = ?');
        values.push(sectionName);
      }
      if (isActive) {
        updateFields.push('isActive = ?');
        values.push(isActive);
      }
      updateFields.push('updatedBy = ?', 'updatedDate = CURRENT_TIMESTAMP');
      values.push(userEmail);

      if (updateFields.length > 0) {
        const query = `
          UPDATE Section
          SET ${updateFields.join(', ')}
          WHERE sectionId = ?
        `;
        values.push(sectionId);
        await connection.execute(query, values);
      }
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: `Sections updated successfully for course ${courseCode}`,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error updating sections:', err);
    res.status(500).json({ status: 'failure', message: 'Failed to update sections' });
  } finally {
    connection.release();
  }
});

export const deleteSection = catchAsync(async (req, res) => {
  const { courseId, sectionName } = req.params;
  const userEmail = req.user?.email || 'admin';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate user email
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

    // Validate course
    const [courseRows] = await connection.execute(
      `SELECT courseId, courseCode FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }
    const courseCode = courseRows[0].courseCode;

    // Validate section
    const [sectionRows] = await connection.execute(
      `SELECT sectionId FROM Section WHERE courseId = ? AND sectionName = ? AND isActive = 'YES'`,
      [courseId, sectionName]
    );
    if (sectionRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active section found with sectionName ${sectionName} for courseId ${courseId}`,
      });
    }
    const sectionId = sectionRows[0].sectionId;

    // Soft delete the section
    await connection.execute(
      `UPDATE Section SET isActive = 'NO', updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE sectionId = ?`,
      [userEmail, sectionId]
    );

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: `Section ${sectionName} deleted successfully for course ${courseCode}`,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error deleting section:', err.message, err.stack);
    res.status(500).json({
      status: 'failure',
      message: `Failed to delete section: ${err.message}`,
    });
  } finally {
    connection.release();
  }
});

export const allocateStaffToCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { Userid, sectionId, Deptid } = req.body;
  const userEmail = req.user?.email || 'admin';

  if (!courseId || !Userid || !sectionId || !Deptid) {
    return res.status(400).json({
      status: 'failure',
      message: 'Missing required fields: courseId, Userid, sectionId, Deptid',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate user email
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

    // Validate course
    const [courseRows] = await connection.execute(
      `SELECT courseId, courseCode FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }
    const courseCode = courseRows[0].courseCode;

    // Validate section
    const [sectionRows] = await connection.execute(
      `SELECT sectionId FROM Section WHERE sectionId = ? AND courseId = ? AND isActive = 'YES'`,
      [sectionId, courseId]
    );
    if (sectionRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active section found with sectionId ${sectionId} for courseId ${courseId}`,
      });
    }

    // Validate Userid and Deptid
    const [staffRows] = await connection.execute(
      `SELECT Userid FROM users WHERE Userid = ? AND Deptid = ? AND status = 'active'`,
      [Userid, Deptid]
    );
    if (staffRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active staff found with Userid ${Userid} in department ${Deptid}`,
      });
    }

    // Check if staff is already allocated to another section for this course
    const [existingAllocation] = await connection.execute(
      `SELECT staffCourseId, sectionId FROM StaffCourse 
       WHERE Userid = ? AND courseId = ? AND sectionId != ?`,
      [Userid, courseId, sectionId]
    );
    if (existingAllocation.length > 0) {
      return res.status(400).json({
        status: 'failure',
        message: `Staff ${Userid} is already allocated to another section for courseId ${courseId}`,
      });
    }

    // Insert new allocation
    const [result] = await connection.execute(
      `INSERT INTO StaffCourse (Userid, courseId, sectionId, Deptid, createdBy, updatedBy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Userid, courseId, sectionId, Deptid, userEmail, userEmail]
    );

    await connection.commit();
    res.status(201).json({
      status: 'success',
      message: 'Staff allocated successfully',
      data: {
        staffCourseId: result.insertId,
        Userid,
        courseId,
        sectionId,
        Deptid,
        courseCode,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error allocating staff:', err);
    res.status(500).json({ status: 'failure', message: 'Failed to allocate staff' });
  } finally {
    connection.release();
  }
});

export const getSections = catchAsync(async (req, res) => {
  const { courseId, semesterId } = req.query; // Optional filters
  const connection = await pool.getConnection();
  try {
    let query = `
      SELECT s.sectionId, s.sectionName, s.courseId, c.courseCode, c.semesterId, sem.batchId, b.branch
      FROM Section s
      JOIN Course c ON s.courseId = c.courseId
      JOIN Semester sem ON c.semesterId = sem.semesterId
      JOIN Batch b ON sem.batchId = b.batchId
      WHERE s.isActive = 'YES' AND c.isActive = 'YES' AND sem.isActive = 'YES'
    `;
    const params = [];

    if (courseId) {
      query += ` AND s.courseId = ?`;
      params.push(parseInt(courseId, 10));
    }
    if (semesterId) {
      query += ` AND c.semesterId = ?`;
      params.push(parseInt(semesterId, 10));
    }

    const [rows] = await connection.execute(query, params);
    res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    console.error('Error fetching sections:', err);
    res.status(500).json({ status: 'failure', message: 'Failed to fetch sections' });
  } finally {
    connection.release();
  }
});