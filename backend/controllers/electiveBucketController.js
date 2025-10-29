import express from 'express';
import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

const router = express.Router();

export const getElectiveBuckets = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const connection = await pool.getConnection();
  try {
    const [buckets] = await connection.execute(
      `SELECT bucketId, bucketNumber, bucketName 
       FROM ElectiveBucket 
       WHERE semesterId = ?`,
      [semesterId]
    );
    for (let bucket of buckets) {
      const [courses] = await connection.execute(
        `SELECT c.courseCode, c.courseTitle, vc.verticalId, v.verticalName
         FROM ElectiveBucketCourse ebc 
         JOIN Course c ON ebc.courseId = c.courseId 
         LEFT JOIN VerticalCourse vc ON c.courseId = vc.regCourseId
         LEFT JOIN Vertical v ON vc.verticalId = v.verticalId
         WHERE ebc.bucketId = ? AND c.isActive = 'YES'`,
        [bucket.bucketId]
      );
      bucket.courses = courses;
    }
    res.status(200).json({ status: "success", data: buckets });
  } finally {
    connection.release();
  }
});

export const createElectiveBucket = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const connection = await pool.getConnection();
  try {
    const [maxRow] = await connection.execute(
      `SELECT MAX(bucketNumber) as maxNum FROM ElectiveBucket WHERE semesterId = ?`,
      [semesterId]
    );
    const bucketNumber = (maxRow[0].maxNum || 0) + 1;
    const [result] = await connection.execute(
      `INSERT INTO ElectiveBucket (semesterId, bucketNumber, bucketName, createdBy) 
       VALUES (?, ?, ?, ?)`,
      [semesterId, bucketNumber, `Elective ${bucketNumber}`, req.user.Userid]
    );
    res.status(201).json({ status: "success", bucketId: result.insertId, bucketNumber });
  } finally {
    connection.release();
  }
});

export const updateElectiveBucketName = catchAsync(async (req, res) => {
  const { bucketId } = req.params;
  const { bucketName } = req.body;
  if (!bucketName || !bucketName.trim()) {
    return res.status(400).json({ status: "failure", message: "Bucket name cannot be empty" });
  }
  const connection = await pool.getConnection();
  try {
    const [bucket] = await connection.execute(
      `SELECT bucketId FROM ElectiveBucket WHERE bucketId = ?`,
      [bucketId]
    );
    if (bucket.length === 0) {
      return res.status(404).json({ status: "failure", message: `Bucket with ID ${bucketId} not found` });
    }
    const [result] = await connection.execute(
      `UPDATE ElectiveBucket SET bucketName = ?, updatedAt = CURRENT_TIMESTAMP WHERE bucketId = ?`,
      [bucketName.trim(), bucketId]
    );
    if (result.affectedRows === 0) {
      return res.status(500).json({ status: "failure", message: `Failed to update bucket ${bucketId}` });
    }
    res.status(200).json({ status: "success", message: `Bucket ${bucketId} name updated successfully` });
  } catch (err) {
    console.error('Error updating bucket name:', err);
    res.status(500).json({
      status: "failure",
      message: `Server error: ${err.message}`,
      sqlMessage: err.sqlMessage || 'No SQL message available',
    });
  } finally {
    connection.release();
  }
});

export const addCoursesToBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;
  const { courseCodes } = req.body;
  if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
    return res.status(400).json({ status: "failure", message: "courseCodes must be a non-empty array" });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate bucket existence
    const [bucket] = await connection.execute(
      `SELECT semesterId FROM ElectiveBucket WHERE bucketId = ?`,
      [bucketId]
    );
    if (bucket.length === 0) {
      return res.status(404).json({ status: "failure", message: `Bucket with ID ${bucketId} not found` });
    }
    const bucketSemesterId = bucket[0].semesterId;

    const errors = [];
    const addedCourses = [];

    for (let courseCode of courseCodes) {
      // Validate course existence and elective status
      const [course] = await connection.execute(
        `SELECT courseId, semesterId, category, isActive FROM Course 
         WHERE courseCode = ? AND category IN ('PEC', 'OEC') AND isActive = 'YES'`,
        [courseCode]
      );
      if (course.length === 0) {
        errors.push(`Course ${courseCode} is invalid, not an elective (PEC/OEC), or not active`);
        continue;
      }
      const courseId = course[0].courseId;
      if (course[0].semesterId !== bucketSemesterId) {
        errors.push(`Course ${courseCode} belongs to semester ${course[0].semesterId}, but bucket requires semester ${bucketSemesterId}`);
        continue;
      }

      // Check if course is already in another bucket
      const [existingBucket] = await connection.execute(
        `SELECT ebc.bucketId FROM ElectiveBucketCourse ebc 
         JOIN Course c ON ebc.courseId = c.courseId 
         WHERE c.courseCode = ? AND ebc.bucketId != ?`,
        [courseCode, bucketId]
      );
      if (existingBucket.length > 0) {
        errors.push(`Course ${courseCode} is already assigned to bucket ${existingBucket[0].bucketId}`);
        continue;
      }

      // Check for existing entry in this bucket
      const [existing] = await connection.execute(
        `SELECT ebc.id FROM ElectiveBucketCourse ebc 
         JOIN Course c ON ebc.courseId = c.courseId 
         WHERE ebc.bucketId = ? AND c.courseCode = ?`,
        [bucketId, courseCode]
      );
      if (existing.length > 0) {
        errors.push(`Course ${courseCode} is already in bucket ${bucketId}`);
        continue;
      }

      // Insert course into bucket
      const [result] = await connection.execute(
        `INSERT INTO ElectiveBucketCourse (bucketId, courseId) VALUES (?, ?)`,
        [bucketId, courseId]
      );
      if (result.affectedRows > 0) {
        addedCourses.push(courseCode);
      } else {
        errors.push(`Failed to add course ${courseCode} to bucket ${bucketId}`);
      }
    }

    if (errors.length > 0 && addedCourses.length === 0) {
      await connection.rollback();
      return res.status(400).json({ status: "failure", message: "Failed to add courses", errors });
    }

    await connection.commit();
    res.status(200).json({
      status: "success",
      message: `Successfully added ${addedCourses.length} course(s) to bucket`,
      addedCourses,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error adding courses to bucket:', err);
    res.status(500).json({
      status: "failure",
      message: `Server error: ${err.message}`,
      sqlMessage: err.sqlMessage || 'No SQL message available',
    });
  } finally {
    connection.release();
  }
});

export const removeCourseFromBucket = catchAsync(async (req, res) => {
  const { bucketId, courseCode } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate bucket existence
    const [bucket] = await connection.execute(
      `SELECT bucketId FROM ElectiveBucket WHERE bucketId = ?`,
      [bucketId]
    );
    if (bucket.length === 0) {
      return res.status(404).json({ status: "failure", message: `Bucket with ID ${bucketId} not found` });
    }

    // Get courseId from courseCode
    const [courses] = await connection.execute(
      `SELECT courseId FROM Course WHERE courseCode = ?`,
      [courseCode]
    );
    if (courses.length === 0) {
      return res.status(404).json({ status: "failure", message: `Course ${courseCode} not found` });
    }
    const courseId = courses[0].courseId;

    // Check if course exists in the bucket
    const [existing] = await connection.execute(
      `SELECT id FROM ElectiveBucketCourse WHERE bucketId = ? AND courseId = ?`,
      [bucketId, courseId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ status: "failure", message: `Course ${courseCode} not found in bucket ${bucketId}` });
    }

    // Remove course from bucket
    const [result] = await connection.execute(
      `DELETE FROM ElectiveBucketCourse WHERE bucketId = ? AND courseId = ?`,
      [bucketId, courseId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(500).json({ status: "failure", message: `Failed to remove course ${courseCode} from bucket ${bucketId}` });
    }

    await connection.commit();
    res.status(200).json({
      status: "success",
      message: `Course ${courseCode} removed from bucket ${bucketId} successfully`,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error removing course from bucket:', err);
    res.status(500).json({
      status: "failure",
      message: `Server error: ${err.message}`,
      sqlMessage: err.sqlMessage || 'No SQL message available',
    });
  } finally {
    connection.release();
  }
});

export const deleteElectiveBucket = catchAsync(async (req, res) => {
  const { bucketId } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Delete associated courses first
    await connection.execute(
      `DELETE FROM ElectiveBucketCourse WHERE bucketId = ?`,
      [bucketId]
    );
    // Delete the bucket
    const [result] = await connection.execute(
      `DELETE FROM ElectiveBucket WHERE bucketId = ?`,
      [bucketId]
    );
    if (result.affectedRows === 0) {
      throw new Error(`Bucket with ID ${bucketId} not found`);
    }
    await connection.commit();
    res.status(200).json({ status: "success", message: "Bucket deleted successfully" });
  } catch (err) {
    await connection.rollback();
    console.error('Error deleting bucket:', err);
    res.status(500).json({
      status: "failure",
      message: `Server error: ${err.message}`,
      sqlMessage: err.sqlMessage || 'No SQL message available',
    });
  } finally {
    connection.release();
  }
});