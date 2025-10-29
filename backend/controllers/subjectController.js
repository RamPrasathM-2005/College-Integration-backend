import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";
import Joi from 'joi';


// Valid enum values (already defined in your code, keep them here or import if in a shared file)
const validTypes = ['THEORY', 'INTEGRATED', 'PRACTICAL', 'EXPERIENTIAL LEARNING'];
const validCategories = ['HSMC', 'BSC', 'ESC', 'PEC', 'OEC', 'EEC', 'PCC'];
const validIsActive = ['YES', 'NO'];


const addCourseSchema = Joi.object({
  courseCode: Joi.string().trim().max(20).required(),
  semesterId: Joi.number().integer().positive().required(),
  courseTitle: Joi.string().trim().max(255).required(),
  type: Joi.string().valid(...validTypes).required(),
  category: Joi.string().valid(...validCategories).required(),
  minMark: Joi.number().integer().min(0).required(),
  maxMark: Joi.number().integer().min(0).required(),
  isActive: Joi.string().valid(...validIsActive).optional(),
  lectureHours: Joi.number().integer().min(0).required(),
  tutorialHours: Joi.number().integer().min(0).required(),
  practicalHours: Joi.number().integer().min(0).required(),
  experientialHours: Joi.number().integer().min(0).required(),
  totalContactPeriods: Joi.number().integer().min(0).required(),
  credits: Joi.number().integer().min(0).required(),
}).custom((value, helpers) => {
  if (value.minMark > value.maxMark) {
    return helpers.error('any.custom', { message: 'minMark must be less than or equal to maxMark' });
  }
  return value;
});

// Note: Joi will auto-coerce strings like "40" to numbers for .number() fields.
// Schema aligns with your DB constraints (e.g., VARCHAR lengths, INT mins).

export const addCourse = catchAsync(async (req, res) => {
  // Log raw payload for debugging
  console.log('RAW addCourse payload ->', req.body);

  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --- Joi Validation ---
    const { error, value } = addCourseSchema.validate(req.body, {
      abortEarly: false, // Collect all errors
      stripUnknown: true, // Remove any extra fields
      convert: true, // Enable coercion (strings to numbers, etc.)
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message).join('; ');
      return res.status(400).json({
        status: 'failure',
        message: 'Validation error: ' + errorMessages,
      });
    }

    // Destructure validated/coerced values
    let {
      courseCode,
      semesterId,
      courseTitle,
      type,
      category,
      minMark,
      maxMark,
      isActive = 'YES', // Default if not provided
      lectureHours,
      tutorialHours,
      practicalHours,
      experientialHours,
      totalContactPeriods,
      credits,
    } = value;

    // Optional: Normalize category to uppercase (in case of input variance, though Joi valid() is case-sensitive)
    // If needed, add .uppercase() to schema: Joi.string().valid(...).uppercase()
    category = category.toUpperCase();

    // Log validated values (for debug)
    console.log("Validated minMark: ", minMark, typeof minMark);

    // --- DB: Validate semester exists and is active ---
    const [semesterRows] = await connection.execute(
      `SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = 'YES'`,
      [semesterId]
    );
    if (semesterRows.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: `No active semester found with semesterId ${semesterId}`,
      });
    }

    // --- Check for existing courseCode in the same semester ---
    const [existingCourse] = await connection.execute(
      `SELECT courseId, isActive FROM Course WHERE courseCode = ? AND semesterId = ?`,
      [courseCode, semesterId]
    );

    let courseId;
    if (existingCourse.length > 0) {
      if (existingCourse[0].isActive === 'YES') {
        return res.status(400).json({
          status: 'failure',
          message: `Course code ${courseCode} already exists for semesterId ${semesterId}`,
        });
      } else {
        // Update existing inactive course
        const [updateResult] = await connection.execute(
          `UPDATE Course 
           SET courseTitle = ?, type = ?, category = ?, 
               minMark = ?, maxMark = ?, isActive = 'YES', updatedBy = ?, 
               lectureHours = ?, tutorialHours = ?, practicalHours = ?, 
               experientialHours = ?, totalContactPeriods = ?, credits = ?
           WHERE courseId = ?`,
          [
            courseTitle,
            type,
            category,
            minMark,
            maxMark,
            userEmail,
            lectureHours,
            tutorialHours,
            practicalHours,
            experientialHours,
            totalContactPeriods,
            credits,
            existingCourse[0].courseId
          ]
        );

        if (updateResult.affectedRows === 0) {
          return res.status(500).json({
            status: 'failure',
            message: 'Failed to update existing course',
          });
        }
        courseId = existingCourse[0].courseId;
      }
    } else {
      // Insert new course
      const [insertResult] = await connection.execute(
        `INSERT INTO Course 
          (courseCode, semesterId, courseTitle, type, category, 
           minMark, maxMark, isActive, createdBy, updatedBy, lectureHours, 
           tutorialHours, practicalHours, experientialHours, totalContactPeriods, credits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          courseCode,
          semesterId,
          courseTitle,
          type,
          category,
          minMark,
          maxMark,
          isActive,
          userEmail,
          userEmail,
          lectureHours,
          tutorialHours,
          practicalHours,
          experientialHours,
          totalContactPeriods,
          credits,
        ]
      );
      courseId = insertResult.insertId;
    }

    await connection.commit();
    res.status(201).json({
      status: 'success',
      message: 'Course added successfully',
      courseId: courseId,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error adding course:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

// Import Courses
export const importCourses = catchAsync(async (req, res) => {
  const { courses } = req.body;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Validate user
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

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: 'No courses provided for import',
      });
    }

    let importedCount = 0;
    const errors = [];

    for (const course of courses) {
      const {
        courseCode,
        semesterId,
        courseTitle,
        type,
        category,
        minMark,
        maxMark,
        lectureHours,
        tutorialHours,
        practicalHours,
        experientialHours,
        totalContactPeriods,
        credits,
        isActive = 'YES',
      } = course;

      // Validate required fields
      if (
        !courseCode ||
        !semesterId ||
        !courseTitle ||
        !type ||
        !category ||
        minMark === undefined ||
        maxMark === undefined ||
        lectureHours === undefined ||
        tutorialHours === undefined ||
        practicalHours === undefined ||
        experientialHours === undefined ||
        totalContactPeriods === undefined ||
        credits === undefined
      ) {
        errors.push(`Missing required fields for course ${courseCode || 'unknown'}`);
        continue;
      }

      // Validate enum fields
      if (!validTypes.includes(type)) {
        errors.push(`Invalid type for course ${courseCode}: Must be one of ${validTypes.join(', ')}`);
        continue;
      }
      const normalizedCategory = typeof category === 'string' ? category.trim().toUpperCase() : '';
      if (!validCategories.includes(normalizedCategory)) {
        errors.push(`Invalid category for course ${courseCode}: "${normalizedCategory}" (raw: "${category}"). Must be one of ${validCategories.join(', ')}`);
        continue;
      }
      if (!validIsActive.includes(isActive)) {
        errors.push(`Invalid isActive for course ${courseCode}: Must be one of ${validIsActive.join(', ')}`);
        continue;
      }

      // Validate numeric fields
      const numericFields = { minMark, maxMark, lectureHours, tutorialHours, practicalHours, experientialHours, totalContactPeriods, credits };
      let valid = true;
      for (const [field, value] of Object.entries(numericFields)) {
        if (!Number.isInteger(value) || value < 0) {
          errors.push(`${field} must be a non-negative integer for course ${courseCode}`);
          valid = false;
        }
      }
      if (minMark > maxMark) {
        errors.push(`minMark must be less than or equal to maxMark for course ${courseCode}`);
        valid = false;
      }
      if (!valid) continue;

      // Validate semesterId
      const [semesterRows] = await connection.execute(
        `SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = 'YES'`,
        [semesterId]
      );
      if (semesterRows.length === 0) {
        errors.push(`No active semester found with semesterId ${semesterId} for course ${courseCode}`);
        continue;
      }

      // Check for existing courseCode in the same semester
      const [existingCourse] = await connection.execute(
        `SELECT courseId, isActive FROM Course WHERE courseCode = ? AND semesterId = ?`,
        [courseCode, semesterId]
      );

      if (existingCourse.length > 0) {
        if (existingCourse[0].isActive === 'YES') {
          errors.push(`Course code ${courseCode} already exists for semesterId ${semesterId}`);
          continue;
        } else {
          // Update existing inactive course
          const [updateResult] = await connection.execute(
            `UPDATE Course 
             SET courseTitle = ?, type = ?, category = ?, 
                 minMark = ?, maxMark = ?, isActive = 'YES', updatedBy = ?, 
                 lectureHours = ?, tutorialHours = ?, practicalHours = ?, 
                 experientialHours = ?, totalContactPeriods = ?, credits = ?
             WHERE courseId = ?`,
            [
              courseTitle,
              type,
              normalizedCategory,
              minMark,
              maxMark,
              userEmail,
              lectureHours,
              tutorialHours,
              practicalHours,
              experientialHours,
              totalContactPeriods,
              credits,
              existingCourse[0].courseId
            ]
          );
          if (updateResult.affectedRows > 0) importedCount++;
        }
      } else {
        // Insert new course
        const [insertResult] = await connection.execute(
          `INSERT INTO Course 
            (courseCode, semesterId, courseTitle, type, category, 
             minMark, maxMark, isActive, createdBy, updatedBy, lectureHours, 
             tutorialHours, practicalHours, experientialHours, totalContactPeriods, credits)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            courseCode,
            semesterId,
            courseTitle,
            type,
            normalizedCategory,
            minMark,
            maxMark,
            isActive,
            userEmail,
            userEmail,
            lectureHours,
            tutorialHours,
            practicalHours,
            experientialHours,
            totalContactPeriods,
            credits,
          ]
        );
        if (insertResult.affectedRows > 0) importedCount++;
      }
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: `Imported ${importedCount} courses successfully`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error importing courses:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

// Get All Courses
export const getAllCourse = catchAsync(async (req, res) => {
  if (!req.user || !req.user.email) {
    return res.status(401).json({
      status: 'failure',
      message: 'Authentication required: No user or email provided',
      data: [],
    });
  }

  if (req.user.role !== 'Admin') {
    return res.status(403).json({
      status: 'failure',
      message: 'Admin access required',
      data: [],
    });
  }

  const connection = await pool.getConnection();
  try {
    const [courses] = await connection.execute(
      `SELECT c.*, b.branch 
       FROM Course c 
       JOIN Semester s ON c.semesterId = s.semesterId 
       JOIN Batch b ON s.batchId = b.batchId 
       WHERE c.isActive = 'YES'`
    );

    res.status(200).json({
      status: 'success',
      results: courses.length,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      status: 'failure',
      message: `Failed to fetch courses: ${error.message}`,
      data: [],
    });
  } finally {
    connection.release();
  }
});

// Get Course By Semester
export const getCourseBySemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    const [semesterRows] = await connection.execute(
      `SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = 'YES'`,
      [semesterId]
    );
    if (semesterRows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active semester found with semesterId ${semesterId}`
      });
    }

    const [rows] = await connection.execute(
      `SELECT c.*, b.branch 
       FROM Course c 
       JOIN Semester s ON c.semesterId = s.semesterId 
       JOIN Batch b ON s.batchId = b.batchId 
       WHERE c.semesterId = ? AND c.isActive = 'YES'`,
      [semesterId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "failure",
        message: `No active courses found for semesterId ${semesterId}`
      });
    }

    res.status(200).json({
      status: "success",
      data: rows
    });
  } catch (err) {
    console.error('Error fetching courses by semester:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

// Update Course
export const updateCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const {
    courseCode,
    semesterId,
    courseTitle,
    type,
    category,
    minMark,
    maxMark,
    isActive,
    lectureHours,
    tutorialHours,
    practicalHours,
    experientialHours,
    totalContactPeriods,
    credits,
  } = req.body;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Validate user
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

    // Validate course exists
    const [courseRows] = await connection.execute(
      `SELECT courseId FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }

    // Validate inputs
    if (
      !courseTitle &&
      !courseCode &&
      !semesterId &&
      !type &&
      !category &&
      minMark === undefined &&
      maxMark === undefined &&
      !isActive &&
      lectureHours === undefined &&
      tutorialHours === undefined &&
      practicalHours === undefined &&
      experientialHours === undefined &&
      totalContactPeriods === undefined &&
      credits === undefined
    ) {
      return res.status(400).json({
        status: 'failure',
        message: 'At least one field must be provided for update',
      });
    }

    const normalizedCategory = category ? category.trim().toUpperCase() : undefined;
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        status: 'failure',
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
      });
    }
    if (normalizedCategory && !validCategories.includes(normalizedCategory)) {
      return res.status(400).json({
        status: 'failure',
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }
    if (isActive && !validIsActive.includes(isActive)) {
      return res.status(400).json({
        status: 'failure',
        message: `Invalid isActive. Must be one of: ${validIsActive.join(', ')}`,
      });
    }

    if (
      (minMark !== undefined || maxMark !== undefined) &&
      (!Number.isInteger(minMark) || !Number.isInteger(maxMark) || minMark < 0 || maxMark < 0 || minMark > maxMark)
    ) {
      return res.status(400).json({
        status: 'failure',
        message: 'minMark and maxMark must be non-negative integers with minMark <= maxMark',
      });
    }

    if (semesterId) {
      const [semesterRows] = await connection.execute(
        `SELECT semesterId FROM Semester WHERE semesterId = ? AND isActive = 'YES'`,
        [semesterId]
      );
      if (semesterRows.length === 0) {
        return res.status(400).json({
          status: 'failure',
          message: `No active semester found with semesterId ${semesterId}`,
        });
      }
    }

    // Check for courseCode conflicts in the same semester
    if (courseCode && semesterId) {
      const [existingCourse] = await connection.execute(
        `SELECT courseId FROM Course WHERE courseCode = ? AND semesterId = ? AND courseId != ? AND isActive = 'YES'`,
        [courseCode, semesterId, courseId]
      );
      if (existingCourse.length > 0) {
        return res.status(400).json({
          status: 'failure',
          message: `Course code ${courseCode} already exists for semesterId ${semesterId}`,
        });
      }
    }

    const updateFields = [];
    const values = [];
    if (courseCode) updateFields.push('courseCode = ?'), values.push(courseCode);
    if (semesterId) updateFields.push('semesterId = ?'), values.push(semesterId);
    if (courseTitle) updateFields.push('courseTitle = ?'), values.push(courseTitle);
    if (type) updateFields.push('type = ?'), values.push(type);
    if (normalizedCategory) updateFields.push('category = ?'), values.push(normalizedCategory);
    if (minMark !== undefined) updateFields.push('minMark = ?'), values.push(minMark);
    if (maxMark !== undefined) updateFields.push('maxMark = ?'), values.push(maxMark);
    if (isActive) updateFields.push('isActive = ?'), values.push(isActive);
    if (lectureHours !== undefined) updateFields.push('lectureHours = ?'), values.push(lectureHours);
    if (tutorialHours !== undefined) updateFields.push('tutorialHours = ?'), values.push(tutorialHours);
    if (practicalHours !== undefined) updateFields.push('practicalHours = ?'), values.push(practicalHours);
    if (experientialHours !== undefined) updateFields.push('experientialHours = ?'), values.push(experientialHours);
    if (totalContactPeriods !== undefined) updateFields.push('totalContactPeriods = ?'), values.push(totalContactPeriods);
    if (credits !== undefined) updateFields.push('credits = ?'), values.push(credits);
    updateFields.push('updatedBy = ?'), values.push(userEmail);
    updateFields.push('updatedAt = CURRENT_TIMESTAMP');

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 'failure',
        message: 'No fields provided for update',
      });
    }

    const query = `UPDATE Course SET ${updateFields.join(', ')} WHERE courseId = ?`;
    values.push(courseId);

    const [result] = await connection.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No course found with courseId ${courseId}`,
      });
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: 'Course updated successfully',
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error updating course:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});

// Delete Course
export const deleteCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const userEmail = req.user?.email || 'admin';
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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

    const [courseRows] = await connection.execute(
      `SELECT courseId FROM Course WHERE courseId = ? AND isActive = 'YES'`,
      [courseId]
    );
    if (courseRows.length === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No active course found with courseId ${courseId}`,
      });
    }

    const [result] = await connection.execute(
      `UPDATE Course SET isActive = 'NO', updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE courseId = ?`,
      [userEmail, courseId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'failure',
        message: `No course found with courseId ${courseId}`,
      });
    }

    await connection.commit();
    res.status(200).json({
      status: 'success',
      message: 'Course deleted successfully',
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error deleting course:', err);
    res.status(500).json({
      status: 'failure',
      message: 'Server error: ' + err.message,
    });
  } finally {
    connection.release();
  }
});