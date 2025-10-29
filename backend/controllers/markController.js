import pool from '../db.js';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import catchAsync from '../utils/catchAsync.js';

const getStaffId = (req) => {
  if (!req.user || !req.user.Userid) {
    console.error('No user or Userid found in req.user:', req.user);
    throw new Error('Authentication required: No user or Userid provided');
  }
  console.log('getStaffId - req.user:', req.user, 'Userid:', req.user.Userid, 'Userid type:', typeof req.user.Userid);
  return String(req.user.Userid); // Return Userid (e.g., '2') as string
};

export const getCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req); // Returns Userid (e.g., '2')
  console.log('getCoursePartitions - courseCode:', courseCode, 'userId:', userId, 'userId type:', typeof userId);

  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  const [courseRows] = await pool.query(
    `SELECT c.courseId 
     FROM Course c
     JOIN StaffCourse sc ON c.courseId = sc.courseId
     WHERE LOWER(c.courseCode) = LOWER(?) AND sc.Userid = ?`,
    [courseCode, userId]
  );
  console.log('getCoursePartitions - courseRows:', courseRows);

  if (courseRows.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: `Course with code '${courseCode}' not found or not assigned to user ID ${userId}`
    });
  }
  const courseId = courseRows[0].courseId;

  const [rows] = await pool.query('SELECT * FROM CoursePartitions WHERE courseId = ?', [courseId]);
  console.log('getCoursePartitions - partitions:', rows);
  res.json({ 
    status: 'success', 
    data: rows[0] || { theoryCount: 0, practicalCount: 0, experientialCount: 0, courseId } 
  });
});

export const saveCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);
  console.log('saveCoursePartitions - courseCode:', courseCode, 'staffId:', staffId, 'body:', req.body);

  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if ( theoryCount === undefined || practicalCount === undefined || experientialCount === undefined) {
    return res.status(400).json({ status: 'error', message: 'Theory, practical, and experiential counts are required' });
  }
  if ( theoryCount < 0 || practicalCount < 0 || experientialCount < 0) {
    return res.status(400).json({ status: 'error', message: 'Counts cannot be negative' });
  }
  if (!staffId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or staffId missing' });
  }

  const [courseCheck] = await pool.query(
    `SELECT c.courseId 
     FROM Course c
     JOIN StaffCourse sc ON c.courseId = sc.courseId
     WHERE LOWER(c.courseCode) = LOWER(?) AND sc.Userid = ?`,
    [courseCode, staffId]
  );
  console.log('saveCoursePartitions - courseCheck:', courseCheck);

  if (courseCheck.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: `Course with code '${courseCode}' does not exist or not assigned to staff with Userid ${staffId}`
    });
  }
  const courseId = courseCheck[0].courseId;

  const [existing] = await pool.query('SELECT partitionId FROM CoursePartitions WHERE courseId = ?', [courseId]);
  console.log('saveCoursePartitions - existing partitions:', existing);
  if (existing.length > 0) {
    return res.status(409).json({
      status: 'error',
      message: 'Partitions already exist for this course. Use PUT to update.',
    });
  }

  const [result] = await pool.query(
    'INSERT INTO CoursePartitions (courseId, theoryCount, practicalCount, experientialCount, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?)',
    [courseId, theoryCount, practicalCount, experientialCount, staffId || 'admin', staffId || 'admin']
  );

  let coNumber = 1;
  const coIds = [];

  for (let i = 0; i < theoryCount; i++) {
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)', // Removed createdBy, updatedBy
      [courseId, `CO${coNumber}`]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy, updatedBy) VALUES (?, ?, ?, ?)',
      [coId, 'THEORY', staffId || 'admin', staffId || 'admin']
    );
    coIds.push(coId);
    coNumber++;
  }

  for (let i = 0; i < practicalCount; i++) {
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)', // Removed createdBy, updatedBy
      [courseId, `CO${coNumber}`]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy, updatedBy) VALUES (?, ?, ?, ?)',
      [coId, 'PRACTICAL', staffId || 'admin', staffId || 'admin']
    );
    coIds.push(coId);
    coNumber++;
  }

  for (let i = 0; i < experientialCount; i++) {
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)', // Removed createdBy, updatedBy
      [courseId, `CO${coNumber}`]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy, updatedBy) VALUES (?, ?, ?, ?)',
      [coId, 'EXPERIENTIAL', staffId || 'admin', staffId || 'admin']
    );
    coIds.push(coId);
    coNumber++;
  }

  res.json({
    status: 'success',
    message: 'Partitions and COs saved successfully',
    data: { partitionId: result.insertId, coIds },
  });
});

export const updateCoursePartitions = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const { theoryCount, practicalCount, experientialCount } = req.body;
  const staffId = getStaffId(req);
  console.log('updateCoursePartitions - courseCode:', courseCode, 'staffId:', staffId, 'body:', req.body);

  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if (theoryCount === undefined || practicalCount === undefined || experientialCount === undefined) {
    return res.status(400).json({ status: 'error', message: 'Theory, practical, and experiential counts are required' });
  }
  if ( theoryCount < 0 || practicalCount < 0 || experientialCount < 0) {
    return res.status(400).json({ status: 'error', message: 'Counts cannot be negative' });
  }
  if (!staffId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or staffId missing' });
  }

  const [courseCheck] = await pool.query(
    `SELECT c.courseId 
     FROM Course c
     JOIN StaffCourse sc ON c.courseId = sc.courseId
     JOIN users u ON sc.Userid = u.Userid
     WHERE LOWER(c.courseCode) = LOWER(?) AND u.staffId = ?`,
    [courseCode, staffId]
  );
  console.log('updateCoursePartitions - courseCheck:', courseCheck);

  if (courseCheck.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: `Course with code '${courseCode}' does not exist or not assigned to staff with ID ${staffId}`
    });
  }
  const courseId = courseCheck[0].courseId;

  const [existing] = await pool.query('SELECT partitionId FROM CoursePartitions WHERE courseId = ?', [courseId]);
  console.log('updateCoursePartitions - existing partitions:', existing);
  if (existing.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: 'No partitions found for this course. Use POST to create.' 
    });
  }

  await pool.query(
    'UPDATE CoursePartitions SET theoryCount = ?, practicalCount = ?, experientialCount = ?, updatedBy = ? WHERE courseId = ?',
    [theoryCount, practicalCount, experientialCount, staffId || 'admin', courseId]
  );

  const [existingCOs] = await pool.query(
    `SELECT co.coId, co.coNumber, ct.coType 
     FROM CourseOutcome co
     LEFT JOIN COType ct ON co.coId = ct.coId
     WHERE co.courseId = ?
     ORDER BY CAST(SUBSTRING(co.coNumber, 3) AS UNSIGNED)`,
    [courseId]
  );

  let theoryCOs = existingCOs.filter(co => co.coType === 'THEORY');
  let practicalCOs = existingCOs.filter(co => co.coType === 'PRACTICAL');
  let experientialCOs = existingCOs.filter(co => co.coType === 'EXPERIENTIAL');

  while (theoryCOs.length > theoryCount) {
    const toDelete = theoryCOs.pop();
    await pool.query('DELETE FROM COType WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM COTool WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM CourseOutcome WHERE coId = ?', [toDelete.coId]);
  }
  for (let i = 0; i < theoryCount - theoryCOs.length; i++) {
    const tempCoNumber = `CO1000${i}`;
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)',
      [courseId, tempCoNumber]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy) VALUES (?, ?, ?)',
      [coId, 'THEORY', staffId || 'admin']
    );
    theoryCOs.push({ coId, coNumber: tempCoNumber, coType: 'THEORY' });
  }

  while (practicalCOs.length > practicalCount) {
    const toDelete = practicalCOs.pop();
    await pool.query('DELETE FROM COType WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM COTool WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM CourseOutcome WHERE coId = ?', [toDelete.coId]);
  }
  for (let i = 0; i < practicalCount - practicalCOs.length; i++) {
    const tempCoNumber = `CO1000${theoryCount + i}`;
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)',
      [courseId, tempCoNumber]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy) VALUES (?, ?, ?)',
      [coId, 'PRACTICAL', staffId || 'admin']
    );
    practicalCOs.push({ coId, coNumber: tempCoNumber, coType: 'PRACTICAL' });
  }

  while (experientialCOs.length > experientialCount) {
    const toDelete = experientialCOs.pop();
    await pool.query('DELETE FROM COType WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM COTool WHERE coId = ?', [toDelete.coId]);
    await pool.query('DELETE FROM CourseOutcome WHERE coId = ?', [toDelete.coId]);
  }
  for (let i = 0; i < experientialCount - experientialCOs.length; i++) {
    const tempCoNumber = `CO1000${ theoryCount + practicalCount + i}`;
    const [result] = await pool.query(
      'INSERT INTO CourseOutcome (courseId, coNumber) VALUES (?, ?)',
      [courseId, tempCoNumber]
    );
    const coId = result.insertId;
    await pool.query(
      'INSERT INTO COType (coId, coType, createdBy) VALUES (?, ?, ?)',
      [coId, 'EXPERIENTIAL', staffId || 'admin']
    );
    experientialCOs.push({ coId, coNumber: tempCoNumber, coType: 'EXPERIENTIAL' });
  }

  const allCOs = [...theoryCOs, ...practicalCOs, ...experientialCOs];
  let coNumber = 1;
  const coIds = [];
  for (const co of allCOs) {
    await pool.query(
      'UPDATE CourseOutcome SET coNumber = ? WHERE coId = ?',
      [`CO${coNumber}`, co.coId]
    );
    await pool.query(
      'UPDATE COType SET updatedBy = ? WHERE coId = ?',
      [staffId || 'admin', co.coId]
    );
    coIds.push(co.coId);
    coNumber++;
  }

  res.json({ 
    status: 'success', 
    message: 'Partitions and COs updated successfully', 
    data: { coIds } 
  });
});


export const getCOsForCourse = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req);
  console.log('getCOsForCourse - courseCode:', courseCode, 'userId:', userId);

  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  const [courseRows] = await pool.query(
    `SELECT c.courseId 
     FROM Course c
     JOIN StaffCourse sc ON c.courseId = sc.courseId
     WHERE UPPER(c.courseCode) = UPPER(?) 
     AND sc.Userid = ?`,
    [courseCode, userId]
  );
  console.log('getCOsForCourse - courseRows:', courseRows);

  if (courseRows.length === 0) {
    const [courseOnly] = await pool.query(
      `SELECT courseId, courseCode FROM Course WHERE UPPER(courseCode) = UPPER(?)`,
      [courseCode]
    );
    const [staffCourseCheck] = await pool.query(
      `SELECT courseId, Userid, sectionId, Deptid 
       FROM StaffCourse 
       WHERE courseId = (SELECT courseId FROM Course WHERE UPPER(courseCode) = UPPER(?)) 
       AND Userid = ?`,
      [courseCode, userId]
    );
    return res.status(404).json({
      status: 'error',
      message: `Course with code '${courseCode}' does not exist or not assigned to staff with Userid ${userId}`,
      debug: { courseOnly, staffCourseCheck }
    });
  }

  const courseId = courseRows[0].courseId;

  const [cos] = await pool.query(
    `SELECT co.coId, co.courseId, co.coNumber, ct.coType 
     FROM CourseOutcome co
     LEFT JOIN COType ct ON co.coId = ct.coId
     WHERE co.courseId = ?
     ORDER BY co.coNumber`,
    [courseId]
  );
  console.log('getCOsForCourse - Course outcomes:', cos);

  res.json({ status: 'success', data: cos });
});

export const getToolsForCO = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const staffId = getStaffId(req);
  console.log('getToolsForCO - coId:', coId, 'staffId:', staffId);

  if (!coId) {
    return res.status(400).json({ status: 'error', message: 'Course outcome ID is required' });
  }
  if (!staffId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or staffId missing' });
  }

  const [coCheck] = await pool.query(
    `SELECT co.coId 
     FROM CourseOutcome co
     JOIN Course c ON co.courseId = c.courseId
     JOIN StaffCourse sc ON c.courseId = sc.courseId
     WHERE co.coId = ? AND sc.Userid = ?`,
    [coId, staffId]
  );
  console.log('getToolsForCO - coCheck:', coCheck);

  if (coCheck.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: `Course outcome with ID ${coId} does not exist or not assigned to staff with Userid ${staffId}`
    });
  }

  const [tools] = await pool.query(
    `SELECT t.toolId, t.coId, t.toolName, t.weightage, td.maxMarks
     FROM COTool t
     JOIN ToolDetails td ON t.toolId = td.toolId
     WHERE t.coId = ?`,
    [coId]
  );
  console.log('getToolsForCO - Tools:', tools);

  res.json({ status: 'success', data: tools });
});

export const createTool = async (req, res) => {
  const { coId } = req.params;
  const { toolName, weightage, maxMarks } = req.body;
  try {
    if (!toolName || !weightage || !maxMarks) {
      return res.status(400).json({ status: 'error', message: 'Tool name, weightage, and max marks are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO COTool (coId, toolName, weightage) VALUES (?, ?, ?)',
      [coId, toolName, weightage]
    );
    const toolId = result.insertId;
    await pool.query(
      'INSERT INTO ToolDetails (toolId, maxMarks, createdBy) VALUES (?, ?, ?)',
      [toolId, maxMarks, req.user.email]
    );
    res.status(201).json({ toolId, toolName, weightage, maxMarks });
  } catch (err) {
    console.error('Error creating tool:', err);
    res.status(500).json({ status: 'error', message: 'Failed to create tool' });
  }
};

export const saveToolsForCO = async (req, res) => {
  const { coId } = req.params;
  const { tools } = req.body;
  const staffId = getStaffId(req);

  console.log('Raw req.body:', req.body); // Debug: Check if payload matches

  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return res.status(400).json({ status: 'error', message: 'tools array is required and must be non-empty' });
  }

  try {
    // Per-tool validation: Prevent undefined/missing props CRASH
    for (const [index, tool] of tools.entries()) {
      if (!tool || typeof tool !== 'object') {
        return res.status(400).json({ status: 'error', message: `Invalid tool at index ${index}: must be an object` });
      }
      if (!tool.toolName || typeof tool.toolName !== 'string' || tool.toolName.trim() === '') {
        return res.status(400).json({ status: 'error', message: `Invalid tool at index ${index}: missing or empty toolName` });
      }
      if (typeof tool.weightage !== 'number' || tool.weightage <= 0 || tool.weightage > 100) {
        return res.status(400).json({ status: 'error', message: `Invalid tool at index ${index}: weightage must be a number (1-100)` });
      }
      if (typeof tool.maxMarks !== 'number' || tool.maxMarks <= 0) {
        return res.status(400).json({ status: 'error', message: `Invalid tool at index ${index}: maxMarks must be a number (>0)` });
      }
      // Normalize
      tool.toolName = tool.toolName.trim();
    }

    const [coCheck] = await pool.query('SELECT courseId FROM CourseOutcome WHERE coId = ?', [coId]);
    if (coCheck.length === 0) {
      return res.status(404).json({ status: 'error', message: 'CO not found' });
    }

    // Now safe to map (all tools validated)
    const toolNamesLower = tools.map(t => t.toolName.toLowerCase());
    if (new Set(toolNamesLower).size !== toolNamesLower.length) {
      return res.status(400).json({ status: 'error', message: 'Duplicate tool names not allowed in the same CO' });
    }
    const totalWeightage = tools.reduce((sum, tool) => sum + tool.weightage, 0);
    if (totalWeightage !== 100) {
      return res.status(400).json({ status: 'error', message: 'Total tool weightage for this CO must equal 100%' });
    }

    const [existingTools] = await pool.query('SELECT toolId FROM COTool WHERE coId = ?', [coId]);
    const existingToolIds = existingTools.map(t => t.toolId);
    const inputToolIds = tools.filter(t => t.toolId && typeof t.toolId === 'number').map(t => t.toolId);

    const toolIdsToDelete = existingToolIds.filter(id => !inputToolIds.includes(id));
    if (toolIdsToDelete.length > 0) {
      const placeholders = toolIdsToDelete.map(() => '?').join(',');
      await pool.query(`DELETE FROM StudentCOTool WHERE toolId IN (${placeholders})`, toolIdsToDelete);
      await pool.query(`DELETE FROM ToolDetails WHERE toolId IN (${placeholders})`, toolIdsToDelete);
      await pool.query(`DELETE FROM COTool WHERE toolId IN (${placeholders})`, toolIdsToDelete);
    }

    for (const tool of tools) {
      if (tool.toolId && existingToolIds.includes(tool.toolId)) {
        await pool.query(
          'UPDATE COTool SET toolName = ?, weightage = ? WHERE toolId = ? AND coId = ?', // Added coId for safety
          [tool.toolName, tool.weightage, tool.toolId, coId]
        );
        await pool.query(
          'UPDATE ToolDetails SET maxMarks = ?, updatedBy = ? WHERE toolId = ?',
          [tool.maxMarks, staffId || 'admin', tool.toolId]
        );
      } else {
        const [result] = await pool.query(
          'INSERT INTO COTool (coId, toolName, weightage) VALUES (?, ?, ?)',
          [coId, tool.toolName, tool.weightage]
        );
        const toolId = result.insertId;
        await pool.query(
          'INSERT INTO ToolDetails (toolId, maxMarks, createdBy) VALUES (?, ?, ?)',
          [toolId, tool.maxMarks, staffId || 'admin']
        );
      }
    }
    res.json({ status: 'success', message: 'Tools saved successfully' });
  } catch (err) {
    console.error('Error in saveToolsForCO:', err.stack);
    res.status(500).json({ status: 'error', message: err.message || 'Internal server error' });
  }
};

export const updateTool = async (req, res) => {
  const { toolId } = req.params;
  const { toolName, weightage, maxMarks } = req.body;
  const staffId = getStaffId(req);
  if (!toolName || weightage === undefined || maxMarks === undefined) {
    return res.status(400).json({ status: 'error', message: 'toolName, weightage, and maxMarks are required' });
  }
  try {
    const [toolCheck] = await pool.query('SELECT coId FROM COTool WHERE toolId = ?', [toolId]);
    if (toolCheck.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Tool not found' });
    }
    await pool.query(
      'UPDATE COTool SET toolName = ?, weightage = ? WHERE toolId = ?',
      [toolName, weightage, toolId]
    );
    await pool.query(
      'UPDATE ToolDetails SET maxMarks = ?, updatedBy = ? WHERE toolId = ?',
      [maxMarks, staffId || 'admin', toolId]
    );
    res.json({ status: 'success', message: 'Tool updated successfully' });
  } catch (err) {
    console.error('Error in updateTool:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

export const deleteTool = async (req, res) => {
  const { toolId } = req.params;
  try {
    const [toolCheck] = await pool.query('SELECT coId FROM COTool WHERE toolId = ?', [toolId]);
    if (toolCheck.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Tool not found' });
    }
    await pool.query('DELETE FROM ToolDetails WHERE toolId = ?', [toolId]);
    await pool.query('DELETE FROM COTool WHERE toolId = ?', [toolId]);
    res.json({ status: 'success', message: 'Tool deleted successfully' });
  } catch (err) {
    console.error('Error in deleteTool:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

export const getStudentMarksForTool = async (req, res) => {
  const { toolId } = req.params; // Extract toolId from req.params for the API route
  try {
    console.log('getStudentMarksForTool - toolId:', toolId);

    // Validate toolId
    if (!toolId || isNaN(parseInt(toolId))) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid toolId: ${toolId}. Tool ID must be a valid number.`,
      });
    }

    // Check if tool exists
    const [toolCheck] = await pool.query(
      `SELECT toolId FROM COTool WHERE toolId = ?`,
      [parseInt(toolId)]
    );
    if (toolCheck.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `Tool with ID ${toolId} not found`,
      });
    }

    // Step 1: Check raw marks in StudentCOTool
    const [rawMarks] = await pool.query(
      `SELECT regno, toolId, marksObtained 
       FROM StudentCOTool 
       WHERE toolId = ?`,
      [parseInt(toolId)]
    );
    console.log('Raw marks from StudentCOTool:', rawMarks);

    // Step 2: Simplified query to retrieve marks
    const [marks] = await pool.query(
      `SELECT sc.regno, u.username AS name, sc.marksObtained
       FROM StudentCOTool sc
       JOIN student_details sd ON sc.regno = sd.regno
       JOIN users u ON sd.Userid = u.Userid
       WHERE sc.toolId = ?`,
      [parseInt(toolId)]
    );
    console.log('Simplified query result:', marks);

    res.json({ status: 'success', data: marks, debug: { rawMarks } });
  } catch (error) {
    console.error('Error in getStudentMarksForTool:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch marks for tool',
    });
  }
};

export const saveStudentMarksForTool = catchAsync(async (req, res) => {
  const { toolId } = req.params;
  const { marks } = req.body;
  const userId = getStaffId(req);
  console.log('saveStudentMarksForTool - toolId:', toolId, 'marks:', marks, 'userId:', userId);

  // Validate input
  if (!toolId || toolId === 'undefined') {
    return res.status(400).json({ status: 'error', message: 'Tool ID is required and cannot be undefined' });
  }
  if (!Array.isArray(marks) || marks.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Marks array is required and cannot be empty' });
  }
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  // Check if tool exists and get maxMarks, courseId, coId
  const [tool] = await pool.query(
    `SELECT td.maxMarks, co.courseId, t.coId 
     FROM ToolDetails td 
     JOIN COTool t ON td.toolId = t.toolId 
     JOIN CourseOutcome co ON t.coId = co.coId 
     WHERE td.toolId = ?`,
    [toolId]
  );
  console.log('saveStudentMarksForTool - tool:', tool);
  if (!tool.length) {
    return res.status(404).json({ status: 'error', message: `Tool with ID ${toolId} not found` });
  }
  const { maxMarks, courseId, coId } = tool[0];

  // Validate regnos
  const regnos = marks.map(m => m.regno);
  const [validStudents] = await pool.query(
    `SELECT sd.regno 
     FROM student_details sd 
     JOIN StudentCourse sc ON sd.regno = sc.regno 
     JOIN StaffCourse stc ON sc.sectionId = stc.sectionId AND sc.courseId = stc.courseId
     WHERE sd.regno IN (?) AND sc.courseId = ? AND stc.Userid = ?`,
    [regnos, courseId, userId]
  );
  const validRegnos = new Set(validStudents.map(s => s.regno));
  const invalidRegnos = regnos.filter(r => !validRegnos.has(r));
  if (invalidRegnos.length > 0) {
    const [courseDetails] = await pool.query(
      `SELECT courseCode FROM Course WHERE courseId = ?`,
      [courseId]
    );
    return res.status(400).json({
      status: 'error',
      message: `Invalid regnos for staff Userid ${userId}'s section in course ${courseDetails[0]?.courseCode || courseId}: ${invalidRegnos.join(', ')}`,
      debug: { regnos, validStudents }
    });
  }

  // Process marks
  for (const mark of marks) {
    const { regno, marksObtained } = mark;
    if (typeof marksObtained !== 'number' || isNaN(marksObtained) || marksObtained < 0) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid marks for ${regno}: marks must be a non-negative number`,
      });
    }
    if (marksObtained > maxMarks) {
      return res.status(400).json({
        status: 'error',
        message: `Marks for ${regno} (${marksObtained}) exceed max (${maxMarks})`,
      });
    }

    const [existing] = await pool.query(
      'SELECT * FROM StudentCOTool WHERE regno = ? AND toolId = ?',
      [regno, toolId]
    );
    try {
      if (existing.length) {
        await pool.query(
          'UPDATE StudentCOTool SET marksObtained = ? WHERE regno = ? AND toolId = ?',
          [marksObtained, regno, toolId]
        );
      } else {
        await pool.query(
          'INSERT INTO StudentCOTool (regno, toolId, marksObtained) VALUES (?, ?, ?)',
          [regno, toolId, marksObtained]
        );
      }
    } catch (queryErr) {
      console.error('saveStudentMarksForTool - query error:', queryErr);
      if (queryErr.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
          status: 'error',
          message: `Foreign key violation: regno ${regno} or toolId ${toolId} is invalid for staff Userid ${userId}'s section`,
        });
      }
      throw queryErr;
    }
  }

  // Calculate and save consolidated marks for the CO
  const [tools] = await pool.query(
    `SELECT t.toolId, t.weightage, td.maxMarks 
     FROM COTool t 
     JOIN ToolDetails td ON t.toolId = td.toolId 
     WHERE t.coId = ?`,
    [coId]
  );

  for (const { regno } of marks) {
    let consolidatedMark = 0;
    let totalToolWeight = 0;
    for (const tool of tools) {
      const [mark] = await pool.query(
        'SELECT marksObtained FROM StudentCOTool WHERE regno = ? AND toolId = ?',
        [regno, tool.toolId]
      );
      const marksObtained = mark[0]?.marksObtained || 0;
      consolidatedMark += (marksObtained / tool.maxMarks) * (tool.weightage / 100);
      totalToolWeight += tool.weightage / 100;
    }
    consolidatedMark = totalToolWeight > 0 ? (consolidatedMark / totalToolWeight) * 100 : 0;
    consolidatedMark = Math.round(consolidatedMark * 100) / 100; // Round to 2 decimal places

    const [existingCOMark] = await pool.query(
      'SELECT studentCoMarkId FROM StudentCOMarks WHERE regno = ? AND coId = ?',
      [regno, coId]
    );
    if (existingCOMark.length) {
      await pool.query(
        'UPDATE StudentCOMarks SET consolidatedMark = ?, updatedBy = ? WHERE regno = ? AND coId = ?',
        [consolidatedMark, userId || 'admin', regno, coId]
      );
    } else {
      await pool.query(
        'INSERT INTO StudentCOMarks (regno, coId, consolidatedMark, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?)',
        [regno, coId, consolidatedMark, userId || 'admin', userId || 'admin']
      );
    }
  }

  res.json({ status: 'success', message: 'Marks and consolidated CO marks saved successfully' });
});

export const importMarksForTool = async (req, res) => {
  const { toolId } = req.params;
  const staffId = getStaffId(req);

  console.log('Import request received:', { toolId, staffId, file: req.file });

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded or invalid file upload' });
  }

  try {
    const [tool] = await pool.query(
      `SELECT td.maxMarks, co.courseId, t.coId 
       FROM ToolDetails td 
       JOIN COTool t ON td.toolId = t.toolId 
       JOIN CourseOutcome co ON t.coId = co.coId 
       WHERE td.toolId = ?`,
      [toolId]
    );
    if (!tool.length) {
      return res.status(404).json({ status: 'error', message: `Tool with ID ${toolId} not found` });
    }
    const { maxMarks, courseId, coId } = tool[0];

    const results = [];
    const stream = Readable.from(req.file.buffer);
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          console.log('CSV parsed successfully, rows:', results.length);
          resolve();
        })
        .on('error', (err) => {
          console.error('CSV parsing error:', err);
          reject(err);
        });
    });

    if (results.length === 0) {
      return res.status(400).json({ status: 'error', message: 'CSV file is empty' });
    }

    const regnos = results.map(row => row.regNo || row.regno).filter(r => r);
    if (regnos.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid regnos found in CSV' });
    }

    const [validStudents] = await pool.query(
      `SELECT sd.regno 
       FROM student_details sd 
       JOIN StudentCourse sc ON sd.regno = sc.regno 
       JOIN StaffCourse stc ON sc.sectionId = stc.sectionId AND sc.courseId = stc.courseId
       WHERE sd.regno IN (?) AND sc.courseId = ? AND stc.Userid = ?`,
      [regnos, courseId, staffId]
    );
    const validRegnos = new Set(validStudents.map(s => s.regno));
    const invalidRegnos = regnos.filter(r => !validRegnos.has(r));
    if (invalidRegnos.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid regnos for staff ${staffId}'s section in course: ${invalidRegnos.join(', ')}`,
      });
    }

    for (const row of results) {
      const regno = row.regNo || row.regno;
      const marksObtained = parseFloat(row.marks);
      if (!regno || isNaN(marksObtained)) {
        console.warn('Skipping invalid row:', row);
        continue;
      }
      if (marksObtained < 0) {
        return res.status(400).json({ status: 'error', message: `Negative marks for ${regno}` });
      }
      if (marksObtained > maxMarks) {
        return res.status(400).json({
          status: 'error',
          message: `Marks for ${regno} (${marksObtained}) exceed max (${maxMarks})`,
        });
      }

      const [existing] = await pool.query(
        'SELECT * FROM StudentCOTool WHERE regno = ? AND toolId = ?',
        [regno, toolId]
      );
      if (existing.length) {
        await pool.query(
          'UPDATE StudentCOTool SET marksObtained = ? WHERE regno = ? AND toolId = ?',
          [marksObtained, regno, toolId]
        );
      } else {
        await pool.query(
          'INSERT INTO StudentCOTool (regno, toolId, marksObtained) VALUES (?, ?, ?)',
          [regno, toolId, marksObtained]
        );
      }
      console.log(`Processed marks for ${regno}: ${marksObtained}`);
    }

    // Calculate and save consolidated marks for the CO
    const [tools] = await pool.query(
      `SELECT t.toolId, t.weightage, td.maxMarks 
       FROM COTool t 
       JOIN ToolDetails td ON t.toolId = td.toolId 
       WHERE t.coId = ?`,
      [coId]
    );

    for (const { regNo, regno } of results.filter(row => row.regNo || row.regno)) {
      const studentRegno = regNo || regno;
      if (!validRegnos.has(studentRegno)) continue;

      let consolidatedMark = 0;
      let totalToolWeight = 0;
      for (const tool of tools) {
        const [mark] = await pool.query(
          'SELECT marksObtained FROM StudentCOTool WHERE regno = ? AND toolId = ?',
          [studentRegno, tool.toolId]
        );
        const marksObtained = mark[0]?.marksObtained || 0;
        consolidatedMark += (marksObtained / tool.maxMarks) * (tool.weightage / 100);
        totalToolWeight += tool.weightage / 100;
      }
      consolidatedMark = totalToolWeight > 0 ? (consolidatedMark / totalToolWeight) * 100 : 0;
      consolidatedMark = Math.round(consolidatedMark * 100) / 100;

      const [existingCOMark] = await pool.query(
        'SELECT studentCoMarkId FROM StudentCOMarks WHERE regno = ? AND coId = ?',
        [studentRegno, coId]
      );
      if (existingCOMark.length) {
        await pool.query(
          'UPDATE StudentCOMarks SET consolidatedMark = ?, updatedBy = ? WHERE regno = ? AND coId = ?',
          [consolidatedMark, staffId || 'admin', studentRegno, coId]
        );
      } else {
        await pool.query(
          'INSERT INTO StudentCOMarks (regno, coId, consolidatedMark, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?)',
          [studentRegno, coId, consolidatedMark, staffId || 'admin', staffId || 'admin']
        );
      }
    }

    res.json({ status: 'success', message: 'Marks imported and consolidated CO marks saved successfully' });
  } catch (err) {
    console.error('Error in importMarksForTool:', err);
    res.status(500).json({ status: 'error', message: `Import failed: ${err.message}` });
  }
};

export const exportCoWiseCsv = catchAsync(async (req, res) => {
  const { coId } = req.params;
  const staffId = getStaffId(req);

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Database connection acquired for coId:', coId, 'staffId:', staffId);

    // Validate course outcome and get courseId, ensuring course is CSE12003
    const [courseInfo] = await connection.query(
      `SELECT co.courseId, c.courseCode 
       FROM CourseOutcome co 
       JOIN Course c ON co.courseId = c.courseId 
       WHERE co.coId = ? AND c.courseCode = ? AND c.isActive = "YES"`,
      [coId, 'CSE12003']
    );
    if (courseInfo.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: `CO ${coId} not found or not associated with course CSE12003` 
      });
    }
    const { courseId, courseCode } = courseInfo[0];
    console.log('Course info:', { courseId, courseCode });

    // Fetch evaluation tools and their max marks
    const [tools] = await connection.query(
      'SELECT t.toolId, t.toolName, t.weightage, td.maxMarks FROM COTool t JOIN ToolDetails td ON t.toolId = td.toolId WHERE t.coId = ?',
      [coId]
    );
    if (tools.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No tools found for this CO' });
    }
    console.log('Evaluation tools:', tools);

    // Fetch students enrolled in the course and staff's section
    const [students] = await connection.query(
      `SELECT DISTINCT sd.regno, u.username AS name 
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       JOIN StudentCourse sc ON sd.regno = sc.regno
       JOIN StaffCourse stc ON sc.sectionId = stc.sectionId AND sc.courseId = stc.courseId
       JOIN CourseOutcome co ON sc.courseId = co.courseId
       WHERE co.coId = ? AND stc.Userid = ? AND u.status = 'active'`,
      [coId, staffId]
    );
    if (students.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: `No students found in your section for CO ${coId}` 
      });
    }
    console.log('Students:', students);

    // Fetch consolidated marks
    const [consolidatedMarks] = await connection.query(
      'SELECT regno, consolidatedMark FROM StudentCOMarks WHERE coId = ? AND regno IN (?)',
      [coId, students.map(s => s.regno)]
    );
    const consolidatedMarksMap = consolidatedMarks.reduce((acc, cm) => {
      acc[cm.regno] = Number(cm.consolidatedMark) || 0; // Ensure number
      return acc;
    }, {});
    console.log('Consolidated marks:', consolidatedMarks);

    // Define CSV header
    const header = [
      { id: 'regNo', title: 'Reg No' },
      { id: 'name', title: 'Name' },
      ...tools.map((tool) => ({ id: tool.toolName, title: `${tool.toolName} (${tool.maxMarks})` })),
      { id: 'consolidated', title: 'Consolidated' },
    ];

    // Prepare CSV data
    const data = await Promise.all(
      students.map(async (student) => {
        const row = { regNo: student.regno, name: student.name };
        for (const tool of tools) {
          const [mark] = await connection.query(
            'SELECT marksObtained FROM StudentCOTool WHERE regno = ? AND toolId = ?',
            [student.regno, tool.toolId]
          );
          row[tool.toolName] = Number(mark[0]?.marksObtained || 0).toFixed(2); // Ensure number
        }
        const consolidatedMark = Number(consolidatedMarksMap[student.regno] || 0);
        row.consolidated = isNaN(consolidatedMark) ? '0.00' : consolidatedMark.toFixed(2);
        return row;
      })
    );

    // Generate CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${courseCode}_co_${coId}_marks_${timestamp}.csv`;
    const filePath = path.join(os.tmpdir(), filename);

    const csvWriter = createCsvWriter({
      path: filePath,
      header,
    });
    await csvWriter.writeRecords(data);
    console.log('CSV file written:', filePath);

    // Send the file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ status: 'error', message: 'Error sending CSV file' });
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  } catch (err) {
    console.error('Error in exportCoWiseCsv:', err);
    res.status(500).json({ 
      status: 'error', 
      message: `Export failed: ${err.message}. Check if tools/students exist for CO ${coId} and staff ${staffId}.` 
    });
  } finally {
    if (connection) {
      connection.release();
      console.log('Database connection released');
    }
  }
});

export const getStudentsForCourse = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const userId = getStaffId(req); // Returns Userid (e.g., '2')
  console.log('getStudentsForCourse - Input:', { courseCode, userId, userIdType: typeof userId });

  // Input validation
  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  try {
    // Step 1: Find all courseIds and sectionIds assigned to the staff for the courseCode
    const [staffCourseRows] = await pool.query(
      `SELECT sc.courseId, sc.sectionId, sc.Userid, c.courseCode, c.semesterId, s.sectionName,
              c.isActive AS courseActive, s.isActive AS sectionActive
       FROM StaffCourse sc
       JOIN Course c ON sc.courseId = c.courseId
       JOIN Section s ON sc.sectionId = s.sectionId
       WHERE UPPER(c.courseCode) = UPPER(?) AND sc.Userid = ?`,
      [courseCode, userId]
    );
    console.log('getStudentsForCourse - StaffCourse query result:', staffCourseRows);

    if (staffCourseRows.length === 0) {
      const [availableCourses] = await pool.query(
        `SELECT c.courseId, c.courseCode, c.semesterId, c.isActive
         FROM Course c
         WHERE UPPER(c.courseCode) = UPPER(?)`,
        [courseCode]
      );
      return res.status(404).json({
        status: 'error',
        message: `Course '${courseCode}' not found or not assigned to staff with Userid ${userId}`,
        debug: { availableCourses, staffCourseRows },
      });
    }

    // Step 2: Validate that all courses and sections are active
    const inactiveCourses = staffCourseRows.filter(row => row.courseActive !== 'YES');
    if (inactiveCourses.length > 0) {
      return res.status(404).json({
        status: 'error',
        message: `Some courses for '${courseCode}' are inactive`,
        debug: { inactiveCourses },
      });
    }

    const inactiveSections = staffCourseRows.filter(row => row.sectionActive !== 'YES');
    if (inactiveSections.length > 0) {
      return res.status(404).json({
        status: 'error',
        message: `Some sections for course '${courseCode}' are inactive`,
        debug: { inactiveSections },
      });
    }

    // Step 3: Fetch students for all matching courseIds and sectionIds
    const courseIds = staffCourseRows.map(row => row.courseId);
    const sectionIds = staffCourseRows.map(row => row.sectionId);
    const [studentRows] = await pool.query(
      `SELECT DISTINCT sd.regno, u.username AS name
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       JOIN StudentCourse sc ON sd.regno = sc.regno
       JOIN StaffCourse stc ON sc.courseId = stc.courseId AND sc.sectionId = stc.sectionId
       WHERE sc.courseId IN (?) AND sc.sectionId IN (?) AND stc.Userid = ?`,
      [courseIds, sectionIds, userId]
    );
    console.log('getStudentsForCourse - Students query result:', studentRows);

    // Step 4: Return response in the format expected by the frontend
    res.json({
      status: 'success',
      results: studentRows.length,
      data: studentRows,
    });
  } catch (err) {
    console.error('Error in getStudentsForCourse:', {
      message: err.message,
      stack: err.stack,
      query: { courseCode, userId },
    });
    res.status(500).json({
      status: 'error',
      message: `Error fetching students: ${err.message}`,
      debug: { error: err.message },
    });
  }
});

export const getStudentsForSection = catchAsync(async (req, res) => {
  const { courseCode, sectionId } = req.params;
  const userId = getStaffId(req); // Returns Userid (e.g., '2')
  console.log('getStudentsForSection - Input:', { courseCode, sectionId, userId, userIdType: typeof userId });

  // Input validation
  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }
  if (!sectionId || sectionId === 'undefined') {
    return res.status(400).json({ status: 'error', message: 'Section ID is required and cannot be undefined' });
  }
  if (!userId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  try {
    // Step 1: Check if the staff is assigned to the course and section
    const [staffCourseRows] = await pool.query(
      `SELECT sc.courseId, sc.sectionId, sc.Userid, c.courseCode, c.semesterId, s.sectionName, s.isActive AS sectionActive, c.isActive AS courseActive
       FROM StaffCourse sc
       JOIN Course c ON sc.courseId = c.courseId
       JOIN Section s ON sc.sectionId = s.sectionId
       WHERE UPPER(c.courseCode) = UPPER(?) AND sc.sectionId = ? AND sc.Userid = ?`,
      [courseCode, sectionId, userId]
    );
    console.log('getStudentsForSection - StaffCourse query result:', staffCourseRows);

    if (staffCourseRows.length === 0) {
      const [availableSections] = await pool.query(
        `SELECT s.sectionId, s.sectionName, s.isActive, c.courseId, c.courseCode, c.semesterId
         FROM Section s
         JOIN Course c ON s.courseId = c.courseId
         JOIN StaffCourse sc ON s.courseId = sc.courseId AND s.sectionId = sc.sectionId
         WHERE UPPER(c.courseCode) = UPPER(?) AND sc.Userid = ?`,
        [courseCode, userId]
      );
      return res.status(403).json({
        status: 'error',
        message: `Course '${courseCode}' with section ${sectionId} is not assigned to staff with Userid ${userId}`,
        debug: { staffCourseRows, availableSections },
      });
    }

    const { courseId, sectionActive, courseActive, semesterId, sectionName } = staffCourseRows[0];

    // Step 2: Validate course and section are active
    if (courseActive !== 'YES') {
      return res.status(404).json({
        status: 'error',
        message: `Course '${courseCode}' is inactive`,
        debug: { courseId, courseCode, semesterId, sectionId, sectionName },
      });
    }

    if (sectionActive !== 'YES') {
      return res.status(404).json({
        status: 'error',
        message: `Section ${sectionId} (${sectionName}) for course '${courseCode}' is inactive`,
        debug: { courseId, sectionId, sectionName },
      });
    }

    // Step 3: Fetch enrolled students
    const [studentRows] = await pool.query(
      `SELECT sd.regno, u.username AS name
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       JOIN StudentCourse sc ON sd.regno = sc.regno
       JOIN StaffCourse stc ON sc.courseId = stc.courseId AND sc.sectionId = stc.sectionId
       WHERE sc.courseId = ? AND sc.sectionId = ? AND stc.Userid = ?`,
      [courseId, sectionId, userId]
    );
    console.log('getStudentsForSection - Students query result:', studentRows);

    // Step 4: Return response in the format expected by the frontend
    res.json({
      status: 'success',
      results: studentRows.length,
      data: studentRows,
    });
  } catch (err) {
    console.error('Error in getStudentsForSection:', {
      message: err.message,
      stack: err.stack,
      query: { courseCode, sectionId, userId },
    });
    res.status(500).json({
      status: 'error',
      message: `Error fetching students: ${err.message}`,
      debug: { error: err.message },
    });
  }
});

export const exportCourseWiseCsv = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);

  try {
    // Fetch course details
    const [course] = await pool.query(
      'SELECT courseId FROM Course WHERE courseCode = ?',
      [courseCode]
    );
    if (!course.length) {
      return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
    }
    const courseId = course[0].courseId;

    // Verify if staff is assigned to the course
    const [staffCourseCheck] = await pool.query(
      'SELECT sectionId FROM StaffCourse WHERE courseId = ? AND Userid = ?',
      [courseId, staffId]
    );
    if (!staffCourseCheck.length) {
      return res.status(403).json({
        status: 'error',
        message: `User ${staffId} is not assigned to course ${courseCode}`,
        debug: { courseId, staffId },
      });
    }

    // Fetch course outcomes with their types using LEFT JOIN
    const [cos] = await pool.query(
      `SELECT co.coId, co.coNumber, ct.coType 
       FROM CourseOutcome co 
       LEFT JOIN COType ct ON co.coId = ct.coId 
       WHERE co.courseId = ? 
       ORDER BY co.coNumber`,
      [courseId]
    );
    if (!cos.length) {
      return res.status(404).json({ status: 'error', message: 'No course outcomes found' });
    }

    // Fetch students enrolled in the course and staff's section
    const [students] = await pool.query(
      `SELECT DISTINCT sd.regno, u.username AS name 
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       JOIN StudentCourse sc ON sd.regno = sc.regno
       WHERE sc.courseId = ? AND sc.sectionId IN (
         SELECT sectionId FROM StaffCourse WHERE Userid = ? AND courseId = ?
       )`,
      [courseId, staffId, courseId]
    );
    if (!students.length) {
      return res.status(404).json({ status: 'error', message: 'No students found in your section' });
    }

    // Fetch consolidated marks for course outcomes
    const [coMarks] = await pool.query(
      'SELECT regno, coId, consolidatedMark FROM StudentCOMarks WHERE coId IN (?) AND regno IN (?)',
      [cos.map(co => co.coId), students.map(s => s.regno)]
    );

    // Map course outcome marks by student
    const coMarksMap = coMarks.reduce((acc, cm) => {
      if (!acc[cm.regno]) acc[cm.regno] = {};
      // Ensure consolidatedMark is a number, default to 0 if null or invalid
      acc[cm.regno][cm.coId] = Number(cm.consolidatedMark) || 0;
      return acc;
    }, {});

    // Calculate averages for theory, practical, experiential, and final average
    const calculateAverages = (regno) => {
      let theorySum = 0, theoryCount = 0, pracSum = 0, pracCount = 0, expSum = 0, expCount = 0;
      const marks = {};
      cos.forEach(co => {
        // Ensure coMark is a number, default to 0 if undefined or invalid
        const coMark = Number(coMarksMap[regno]?.[co.coId] || 0);
        marks[co.coNumber] = coMark.toFixed(2); // Safe to call toFixed on a number
        if (co.coType === 'THEORY') {
          theorySum += coMark;
          theoryCount++;
        } else if (co.coType === 'PRACTICAL') {
          pracSum += coMark;
          pracCount++;
        } else if (co.coType === 'EXPERIENTIAL') {
          expSum += coMark;
          expCount++;
        } // NULL coType is ignored
      });
      const avgTheory = theoryCount ? (theorySum / theoryCount).toFixed(2) : '0.00';
      const avgPractical = pracCount ? (pracSum / pracCount).toFixed(2) : '0.00';
      const avgExperiential = expCount ? (expSum / expCount).toFixed(2) : '0.00';
      const activePartitions = [
        { count: theoryCount, avg: parseFloat(avgTheory) },
        { count: pracCount, avg: parseFloat(avgPractical) },
        { count: expCount, avg: parseFloat(avgExperiential) },
      ].filter(p => p.count > 0);
      const finalAvg = activePartitions.length
        ? (activePartitions.reduce((sum, p) => sum + p.avg, 0) / activePartitions.length).toFixed(2)
        : '0.00';
      return { ...marks, avgTheory, avgPractical, avgExperiential, finalAvg };
    };

    // Define CSV header
    const header = [
      { id: 'regNo', title: 'Reg No' },
      { id: 'name', title: 'Name' },
      ...cos.map(co => ({ id: co.coNumber, title: co.coNumber })),
      { id: 'avgTheory', title: 'Theory Avg' },
      { id: 'avgPractical', title: 'Practical Avg' },
      { id: 'avgExperiential', title: 'Experiential Avg' },
      { id: 'finalAvg', title: 'Final Avg' },
    ];

    // Prepare CSV data
    const data = students.map(student => {
      const averages = calculateAverages(student.regno);
      return {
        regNo: student.regno,
        name: student.name,
        ...averages,
      };
    });

    // Generate CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${courseCode}_marks_${timestamp}.csv`;
    const filePath = path.join(os.tmpdir(), filename);

    const csvWriter = createCsvWriter({
      path: filePath,
      header,
    });
    await csvWriter.writeRecords(data);

    // Send the file as a download
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up the temporary file
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  } catch (err) {
    console.error('Error in exportCourseWiseCsv:', err.stack);
    res.status(500).json({ 
      status: 'error', 
      message: `Export failed: ${err.message}. Check if course ${courseCode} and staff ${staffId} are valid.` 
    });
  }
});
export const getMyCourses = catchAsync(async (req, res) => {
  const userId = getStaffId(req); // Returns Userid (e.g., '2')
  console.log('getMyCourses - userId:', userId, 'userId type:', typeof userId);

  if (!userId) {
    console.log('getMyCourses - Invalid user ID');
    return res.status(401).json({ 
      status: 'error', 
      message: 'User not authenticated or Userid missing', 
      data: [] 
    });
  }

  const [courses] = await pool.query(
    `SELECT 
       sc.staffCourseId,
       sc.Userid AS staffUserId,
       u.staffId,
       c.courseCode AS id,
       c.courseTitle AS title,
       sc.sectionId,
       s.sectionName,
       sc.Deptid,
       d.Deptname AS departmentName,
       CONCAT(
         b.batchYears, ' ',
         CASE WHEN sem.semesterNumber % 2 = 1 THEN 'ODD' ELSE 'EVEN' END,
         ' SEMESTER'
       ) AS semester,
       sem.semesterNumber,
       b.degree,
       b.branch,
       b.batch
     FROM StaffCourse sc
     JOIN Course c ON sc.courseId = c.courseId
     JOIN Section s ON sc.sectionId = s.sectionId
     JOIN department d ON sc.Deptid = d.Deptid
     JOIN Semester sem ON c.semesterId = sem.semesterId
     JOIN Batch b ON sem.batchId = b.batchId
     JOIN users u ON sc.Userid = u.Userid
     WHERE sc.Userid = ?
       AND c.isActive = 'YES'
       AND s.isActive = 'YES'
       AND sem.isActive = 'YES'
       AND b.isActive = 'YES'
     ORDER BY c.courseTitle`,
    [userId]
  );
  console.log('getMyCourses - Fetched courses:', courses);

  res.json({ 
    status: 'success', 
    results: courses.length, 
    data: courses 
  });
});

export const getConsolidatedMarks = catchAsync(async (req, res) => {
  const { batch, dept, sem, batchId, deptId } = req.query;
  const batchParam = batch || batchId;
  const deptParam = dept || deptId;
  const semParam = sem;

  console.log('Received query params:', { batchParam, deptParam, semParam });

  if (!batchParam || !deptParam || !semParam) {
    return res.status(400).json({ status: 'failure', message: 'Missing required parameters' });
  }

  // Get Deptid
  let deptIdValue = deptParam;
  const [deptRows] = await pool.query(
    `SELECT Deptid FROM department WHERE Deptacronym = ? OR Deptid = ?`,
    [deptParam, deptParam]
  );
  if (deptRows.length === 0) {
    return res.status(404).json({ status: 'failure', message: 'Department not found' });
  }
  deptIdValue = deptRows[0].Deptid;

  // Get batchId
  const [batchRows] = await pool.query(
    `SELECT batchId FROM Batch 
     WHERE batch = ? 
       AND branch = (SELECT Deptacronym FROM department WHERE Deptid = ?) 
       AND isActive = 'YES'`,
    [batchParam, deptIdValue]
  );
  if (batchRows.length === 0) {
    console.log('Batch query failed for:', { batch: batchParam, deptId: deptIdValue });
    return res.status(404).json({ status: 'failure', message: 'Batch not found' });
  }
  const batchIdValue = batchRows[0].batchId;

  // Get semesterId
  const [semRows] = await pool.query(
    `SELECT semesterId FROM Semester 
     WHERE batchId = ? AND semesterNumber = ? AND isActive = 'YES'`,
    [batchIdValue, semParam]
  );
  if (semRows.length === 0) {
    return res.status(404).json({ status: 'failure', message: 'Semester not found' });
  }
  const semesterId = semRows[0].semesterId;

  // Get students - Use CAST for Semester if needed, but since it's VARCHAR, compare as string
  const [students] = await pool.query(
    `SELECT sd.regno, u.username AS name 
     FROM student_details sd 
     JOIN users u ON sd.Userid = u.Userid 
     WHERE sd.Deptid = ? 
       AND sd.batch = ? 
       AND sd.Semester = ? 
       AND u.status = 'active' ORDER BY sd.regno`,
    [deptIdValue, batchParam, semParam]
  );

  // Get courses
  const [courses] = await pool.query(
    `SELECT c.courseId, c.courseCode, c.courseTitle, 
            COALESCE(cp.theoryCount, 0) AS theoryCount, 
            COALESCE(cp.practicalCount, 0) AS practicalCount, 
            COALESCE(cp.experientialCount, 0) AS experientialCount 
     FROM Course c 
     LEFT JOIN CoursePartitions cp ON c.courseId = cp.courseId 
     WHERE c.semesterId = ? AND c.isActive = 'YES'`,
    [semesterId]
  );
  console.log('Courses fetched:', courses);

  if (courses.length === 0) {
    return res.status(200).json({
      status: 'success',
      data: { students, courses: [], marks: {} },
      message: 'No courses found for the selected semester',
    });
  }

  // Get COs with types
  const courseIds = courses.map(c => c.courseId);
  console.log('Course IDs:', courseIds);
  let cosMap = {};
  let cos = [];
  if (courseIds.length > 0) {
    try {
      [cos] = await pool.query(
        `SELECT co.coId, co.courseId, co.coNumber, ct.coType 
         FROM CourseOutcome co 
         LEFT JOIN COType ct ON co.coId = ct.coId 
         WHERE co.courseId IN (?)`,
        [courseIds]
      );
      console.log('Course outcomes fetched:', cos);
      if (cos.length > 0) {
        cosMap = cos.reduce((acc, co) => {
          if (!acc[co.courseId]) acc[co.courseId] = [];
          acc[co.courseId].push(co);
          return acc;
        }, {});
      } else {
        console.warn('No course outcomes found for courseIds:', courseIds);
      }
    } catch (err) {
      console.error('Error fetching course outcomes:', err.message, err.sql);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch course outcomes',
      });
    }
  }

  // Get consolidated marks from StudentCOMarks
  const regnos = students.map(s => s.regno);
  const coIds = cos.map(co => co.coId).filter(id => id != null);
  console.log('Student regnos:', regnos, 'Course outcome IDs:', coIds);
  let marksMap = {};
  if (regnos.length > 0 && coIds.length > 0) {
    try {
      const [marksRows] = await pool.query(
        `SELECT scm.regno, scm.coId, scm.consolidatedMark, co.courseId, ct.coType 
         FROM StudentCOMarks scm 
         JOIN CourseOutcome co ON scm.coId = co.coId 
         LEFT JOIN COType ct ON co.coId = ct.coId 
         WHERE scm.regno IN (?) AND scm.coId IN (?)`,
        [regnos, coIds]
      );
      console.log('Consolidated marks fetched:', marksRows);

      // Build marksMap
      marksMap = students.reduce((acc, student) => {
        acc[student.regno] = {};
        courses.forEach(course => {
          acc[student.regno][course.courseCode] = {
            theory: null,
            practical: null,
            experiential: null,
          };
        });
        return acc;
      }, {});

      // Populate marks for each CO - FIXED: Robust handling for string/null/undefined/NaN
      marksRows.forEach(mark => {
        const course = courses.find(c => c.courseId === mark.courseId);
        if (!course) return;

        const co = cos.find(co_ => co_.coId === mark.coId);  // Renamed to avoid shadow
        if (!co) return;

        let markValue = null;
        if (mark.consolidatedMark != null) {  // Catches null/undefined
          const numMark = Number(mark.consolidatedMark);
          if (!isNaN(numMark)) {
            markValue = numMark.toFixed(2);
          } else {
            console.warn(`Invalid consolidatedMark for regno ${mark.regno}, coId ${mark.coId}: ${mark.consolidatedMark}`);
          }
        }

        if (mark.coType === 'THEORY') {
          marksMap[mark.regno][course.courseCode].theory = markValue;
        } else if (mark.coType === 'PRACTICAL') {
          marksMap[mark.regno][course.courseCode].practical = markValue;
        } else if (mark.coType === 'EXPERIENTIAL') {
          marksMap[mark.regno][course.courseCode].experiential = markValue;
        }
      });

      // Calculate averages for each course - Unchanged (already safe)
      courses.forEach(course => {
        const courseCos = cosMap[course.courseId] || [];
        students.forEach(student => {
          const typeCos = {
            THEORY: courseCos.filter(co => co.coType === 'THEORY'),
            PRACTICAL: courseCos.filter(co => co.coType === 'PRACTICAL'),
            EXPERIENTIAL: courseCos.filter(co => co.coType === 'EXPERIENTIAL'),
          };

          ['theory', 'practical', 'experiential'].forEach(type => {
            const typeKey = type.toUpperCase();
            const typeCount = typeCos[typeKey].length;
            if (typeCount === 0) {
              marksMap[student.regno][course.courseCode][type] = null;
            } else {
              const sum = typeCos[typeKey].reduce((acc, co) => {
                const m = marksRows.find(m => m.regno === student.regno && m.coId === co.coId);
                return acc + (m && m.consolidatedMark != null ? parseFloat(m.consolidatedMark) : 0);
              }, 0);
              marksMap[student.regno][course.courseCode][type] = (sum / typeCount).toFixed(2);
            }
          });
        });
      });
    } catch (err) {
      console.error('Error fetching consolidated marks:', err.message, err.sql);
      return res.status(200).json({
        status: 'success',
        data: { students, courses, marks: {} },
        message: 'No consolidated marks found for the selected students and courses',
      });
    }
  }

  console.log('Final marks map:', marksMap);
  res.status(200).json({
    status: 'success',
    data: { students, courses, marks: marksMap },
    message: `Loaded ${cos.length} course outcomes`  // Fixed syntax + descriptive
  });
});

export const getStudentCOMarks = catchAsync(async (req, res) => {
  const { courseCode } = req.params;
  const staffId = getStaffId(req);

  console.log('getStudentCOMarks - courseCode:', courseCode, 'staffId:', staffId);

  // Validate course
  const [course] = await pool.query(
    'SELECT courseId FROM Course WHERE courseCode = ?',
    [courseCode]
  );
  if (!course.length) {
    return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
  }
  const courseId = course[0].courseId;

  // Verify staff assignment
  const [staffCourseCheck] = await pool.query(
    'SELECT * FROM StaffCourse WHERE courseId = ? AND Userid = ?',
    [courseId, staffId]
  );
  if (!staffCourseCheck.length) {
    return res.status(403).json({
      status: 'error',
      message: `User ${staffId} is not assigned to course ${courseCode}`,
      debug: { courseId, staffId },
    });
  }

  // Fetch consolidated marks with CO details
  const [coMarks] = await pool.query(
    `SELECT 
        scm.regno, 
        u.username AS name, 
        co.coId, 
        co.coNumber, 
        ct.coType, 
        scm.consolidatedMark
     FROM StudentCOMarks scm
     JOIN student_details sd ON scm.regno = sd.regno
     JOIN users u ON sd.Userid = u.Userid
     JOIN CourseOutcome co ON scm.coId = co.coId
     LEFT JOIN COType ct ON co.coId = ct.coId
     JOIN StudentCourse sc ON sd.regno = sc.regno
     WHERE co.courseId = ? 
       AND sc.courseId = ? 
       AND sc.sectionId IN (
         SELECT sectionId FROM StaffCourse WHERE Userid = ? AND courseId = ?
       )
     ORDER BY scm.regno, co.coNumber`,
    [courseId, courseId, staffId, courseId]
  );

  // Fetch course partitions to determine theory, practical, experiential counts
  const [partitions] = await pool.query(
    'SELECT theoryCount, practicalCount, experientialCount FROM CoursePartitions WHERE courseId = ?',
    [courseId]
  );
  const partitionData = partitions[0] || { theoryCount: 0, practicalCount: 0, experientialCount: 0 };

  // Structure the response to include marks by student and averages
  const marksByStudent = {};
  coMarks.forEach(mark => {
    if (!marksByStudent[mark.regno]) {
      marksByStudent[mark.regno] = {
        name: mark.name,
        marks: {},
        averages: {
          theory: null,
          practical: null,
          experiential: null,
          finalAvg: null,
        },
      };
    }
    // Ensure consolidatedMark is a number before calling toFixed
    const markValue = mark.consolidatedMark != null && !isNaN(parseFloat(mark.consolidatedMark))
      ? parseFloat(mark.consolidatedMark).toFixed(2)
      : '0.00';
    marksByStudent[mark.regno].marks[mark.coNumber] = {
      coId: mark.coId,
      coType: mark.coType,
      consolidatedMark: markValue,
    };
  });

  // Calculate averages for each student
  Object.keys(marksByStudent).forEach(regno => {
    const student = marksByStudent[regno];
    let theorySum = 0, theoryCount = 0;
    let practicalSum = 0, practicalCount = 0;
    let experientialSum = 0, experientialCount = 0;

    Object.values(student.marks).forEach(mark => {
      const markValue = parseFloat(mark.consolidatedMark) || 0;
      if (mark.coType === 'THEORY') {
        theorySum += markValue;
        theoryCount++;
      } else if (mark.coType === 'PRACTICAL') {
        practicalSum += markValue;
        practicalCount++;
      } else if (mark.coType === 'EXPERIENTIAL') {
        experientialSum += markValue;
        experientialCount++;
      }
    });

    student.averages.theory = theoryCount > 0 ? (theorySum / theoryCount).toFixed(2) : null;
    student.averages.practical = practicalCount > 0 ? (practicalSum / practicalCount).toFixed(2) : null;
    student.averages.experiential = experientialCount > 0 ? (experientialSum / experientialCount).toFixed(2) : null;

    const activeAverages = [
      ...(student.averages.theory ? [parseFloat(student.averages.theory)] : []),
      ...(student.averages.practical ? [parseFloat(student.averages.practical)] : []),
      ...(student.averages.experiential ? [parseFloat(student.averages.experiential)] : []),
    ];
    student.averages.finalAvg = activeAverages.length > 0
      ? (activeAverages.reduce((sum, avg) => sum + avg, 0) / activeAverages.length).toFixed(2)
      : '0.00';
  });

  res.json({
    status: 'success',
    data: {
      students: Object.keys(marksByStudent).map(regno => ({
        regno,
        name: marksByStudent[regno].name,
        marks: marksByStudent[regno].marks,
        averages: marksByStudent[regno].averages,
      })),
      partitions: partitionData,
    },
  });
});

export const updateStudentCOMark = catchAsync(async (req, res) => {
  const { courseCode, regno, coId } = req.params;
  const { consolidatedMark } = req.body;
  const staffId = getStaffId(req);

  console.log('updateStudentCOMark - courseCode:', courseCode, 'regno:', regno, 'coId:', coId, 'consolidatedMark:', consolidatedMark, 'staffId:', staffId);

  if (typeof consolidatedMark !== 'number' || consolidatedMark < 0 || consolidatedMark > 100) {
    return res.status(400).json({ status: 'error', message: 'Consolidated mark must be a number between 0 and 100' });
  }

  const [course] = await pool.query(
    'SELECT courseId FROM Course WHERE courseCode = ?',
    [courseCode]
  );
  if (!course.length) {
    return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
  }
  const courseId = course[0].courseId;

  const [staffCourseCheck] = await pool.query(
    'SELECT * FROM StaffCourse WHERE courseId = ? AND Userid = ?',
    [courseId, staffId]
  );
  if (!staffCourseCheck.length) {
    return res.status(403).json({
      status: 'error',
      message: `User ${staffId} is not assigned to course ${courseCode}`,
    });
  }

  const [coCheck] = await pool.query(
    'SELECT coId FROM CourseOutcome WHERE coId = ? AND courseId = ?',
    [coId, courseId]
  );
  if (!coCheck.length) {
    return res.status(404).json({ status: 'error', message: `CO ${coId} not found for course ${courseCode}` });
  }

  const [studentCheck] = await pool.query(
    `SELECT sd.regno 
     FROM student_details sd 
     JOIN StudentCourse sc ON sd.regno = sc.regno 
     WHERE sd.regno = ? AND sc.courseId = ? AND sc.sectionId IN (
       SELECT sectionId FROM StaffCourse WHERE Userid = ? AND courseId = ?
     )`,
    [regno, courseId, staffId, courseId]
  );
  if (!studentCheck.length) {
    return res.status(404).json({
      status: 'error',
      message: `Student ${regno} not found in your section for course ${courseCode}`,
    });
  }

  const [existing] = await pool.query(
    'SELECT studentCoMarkId FROM StudentCOMarks WHERE regno = ? AND coId = ?',
    [regno, coId]
  );
  if (existing.length) {
    await pool.query(
      'UPDATE StudentCOMarks SET consolidatedMark = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE regno = ? AND coId = ?',
      [consolidatedMark, staffId || 'admin', regno, coId]
    );
  } else {
    await pool.query(
      'INSERT INTO StudentCOMarks (regno, coId, consolidatedMark, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?)',
      [regno, coId, consolidatedMark, staffId || 'admin', staffId || 'admin']
    );
  }

  res.json({ status: 'success', message: 'Consolidated mark updated successfully' });
});

export const updateStudentCOMarkByCoId = catchAsync(async (req, res) => {
  const { regno, coId } = req.params;
  const { consolidatedMark } = req.body;
  const staffId = getStaffId(req);

  console.log('updateStudentCOMarkByCoId - regno:', regno, 'coId:', coId, 'consolidatedMark:', consolidatedMark, 'staffId:', staffId);

  // Validate input
  if (typeof consolidatedMark !== 'number' || consolidatedMark < 0 || consolidatedMark > 100) {
    return res.status(400).json({ status: 'error', message: 'Consolidated mark must be a number between 0 and 100' });
  }
  if (!regno || !coId) {
    return res.status(400).json({ status: 'error', message: 'Regno and CO ID are required' });
  }
  if (!staffId) {
    return res.status(401).json({ status: 'error', message: 'User not authenticated or Userid missing' });
  }

  // Get courseId and courseCode from coId
  const [coCheck] = await pool.query(
    `SELECT co.coId, co.courseId, c.courseCode 
     FROM CourseOutcome co 
     JOIN Course c ON co.courseId = c.courseId 
     WHERE co.coId = ?`,
    [coId]
  );
  if (!coCheck.length) {
    return res.status(404).json({ status: 'error', message: `Course outcome with ID ${coId} not found` });
  }
  const { courseId, courseCode } = coCheck[0];

  // Verify staff assignment
  const [staffCourseCheck] = await pool.query(
    'SELECT * FROM StaffCourse WHERE courseId = ? AND Userid = ?',
    [courseId, staffId]
  );
  if (!staffCourseCheck.length) {
    return res.status(403).json({
      status: 'error',
      message: `User ${staffId} is not assigned to course ${courseCode}`,
    });
  }

  // Verify student enrollment
  const [studentCheck] = await pool.query(
    `SELECT sd.regno 
     FROM student_details sd 
     JOIN StudentCourse sc ON sd.regno = sc.regno 
     WHERE sd.regno = ? AND sc.courseId = ? AND sc.sectionId IN (
       SELECT sectionId FROM StaffCourse WHERE Userid = ? AND courseId = ?
     )`,
    [regno, courseId, staffId, courseId]
  );
  if (!studentCheck.length) {
    return res.status(404).json({
      status: 'error',
      message: `Student ${regno} not found in your section for course ${courseCode}`,
    });
  }

  // Update or insert consolidated mark
  const [existing] = await pool.query(
    'SELECT studentCoMarkId FROM StudentCOMarks WHERE regno = ? AND coId = ?',
    [regno, coId]
  );
  if (existing.length) {
    await pool.query(
      'UPDATE StudentCOMarks SET consolidatedMark = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE regno = ? AND coId = ?',
      [consolidatedMark, staffId || 'admin', regno, coId]
    );
  } else {
    await pool.query(
      'INSERT INTO StudentCOMarks (regno, coId, consolidatedMark, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?)',
      [regno, coId, consolidatedMark, staffId || 'admin', staffId || 'admin']
    );
  }

  res.json({ status: 'success', message: 'Consolidated mark updated successfully' });
});


export const getCOsForCourseAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;

  if (!courseCode) {
    return res.status(400).json({ status: 'error', message: 'Course code is required' });
  }

  // Directly fetch course by code (no staff check)
  const [courseRows] = await pool.query(
    `SELECT c.courseId 
     FROM Course c
     WHERE UPPER(c.courseCode) = UPPER(?)`,
    [courseCode]
  );

  if (courseRows.length === 0) {
    return res.status(404).json({ 
      status: 'error', 
      message: `Course with code '${courseCode}' does not exist` 
    });
  }

  const courseId = courseRows[0].courseId;

  const [cos] = await pool.query(
    `SELECT co.coId, co.courseId, co.coNumber, ct.coType 
     FROM CourseOutcome co
     LEFT JOIN COType ct ON co.coId = ct.coId
     WHERE co.courseId = ?
     ORDER BY co.coNumber`,
    [courseId]
  );

  res.json({ status: 'success', data: cos });
});


export const getStudentCOMarksAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;

  // Fetch course
  const [course] = await pool.query('SELECT courseId FROM Course WHERE courseCode = ?', [courseCode]);
  if (!course.length) {
    return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
  }
  const courseId = course[0].courseId;

  // Fetch COs for the course with join to COType
  const [cos] = await pool.query(
    `SELECT co.coId, co.coNumber, ct.coType 
     FROM CourseOutcome co
     LEFT JOIN COType ct ON co.coId = ct.coId
     WHERE co.courseId = ?
     ORDER BY co.coNumber`,
    [courseId]
  );

  // Fetch students enrolled in the course (all sections, no staff filter)
  const [students] = await pool.query(
    `SELECT DISTINCT sd.regno, u.username AS name 
     FROM student_details sd
     JOIN users u ON sd.Userid = u.Userid
     JOIN StudentCourse sc ON sd.regno = sc.regno
     WHERE sc.courseId = ?`,
    [courseId]
  );

  // Fetch consolidated marks
  const regnos = students.map(s => s.regno);
  const coIds = cos.map(co => co.coId);
  const [coMarks] = await pool.query(
    `SELECT scm.regno, co.coId, co.coNumber, ct.coType, scm.consolidatedMark
     FROM StudentCOMarks scm
     JOIN CourseOutcome co ON scm.coId = co.coId
     LEFT JOIN COType ct ON co.coId = ct.coId
     WHERE scm.regno IN (?) AND scm.coId IN (?)`,
    [regnos, coIds]
  );

  // Structure response
  const marksByStudent = {};
  coMarks.forEach(mark => {
    if (!marksByStudent[mark.regno]) {
      marksByStudent[mark.regno] = { name: '', marks: {} };
    }
    const student = students.find(s => s.regno === mark.regno);
    if (student) marksByStudent[mark.regno].name = student.name;
    marksByStudent[mark.regno].marks[mark.coNumber] = {
      coId: mark.coId,
      coType: mark.coType,
      consolidatedMark: mark.consolidatedMark != null ? parseFloat(mark.consolidatedMark).toFixed(2) : '0.00'
    };
  });

  // Ensure all students are included, even if no marks
  students.forEach(student => {
    if (!marksByStudent[student.regno]) {
      marksByStudent[student.regno] = { name: student.name, marks: {} };
    }
  });

  // Convert to array format expected by frontend
  const processedStudents = Object.keys(marksByStudent).map(regno => ({
    regno,
    name: marksByStudent[regno].name,
    marks: marksByStudent[regno].marks
  }));

  res.json({
    status: 'success',
    data: {
      students: processedStudents,
      partitions: { 
        theoryCount: cos.filter(c => c.coType === 'THEORY').length, 
        practicalCount: cos.filter(c => c.coType === 'PRACTICAL').length, 
        experientialCount: cos.filter(c => c.coType === 'EXPERIENTIAL').length 
      }
    }
  });
});

export const updateStudentCOMarkAdmin = catchAsync(async (req, res) => {
  const { regno, coId } = req.params;
  const { consolidatedMark } = req.body;

  if (typeof consolidatedMark !== 'number' || consolidatedMark < 0 || consolidatedMark > 100) {
    return res.status(400).json({ status: 'error', message: 'Consolidated mark must be a number between 0 and 100' });
  }

  // Verify CO exists
  const [coCheck] = await pool.query('SELECT coId FROM CourseOutcome WHERE coId = ?', [coId]);
  if (!coCheck.length) {
    return res.status(404).json({ status: 'error', message: `Course outcome with ID ${coId} not found` });
  }

  // Verify student exists and enrolled in the course
  const [studentCourse] = await pool.query(
    `SELECT sd.regno 
     FROM student_details sd 
     JOIN StudentCourse sc ON sd.regno = sc.regno 
     JOIN CourseOutcome co ON sc.courseId = co.courseId
     WHERE sd.regno = ? AND co.coId = ?`,
    [regno, coId]
  );
  if (!studentCourse.length) {
    return res.status(404).json({ status: 'error', message: `Student ${regno} not enrolled in course for CO ${coId}` });
  }

  // Update or insert
  const [existing] = await pool.query('SELECT studentCoMarkId FROM StudentCOMarks WHERE regno = ? AND coId = ?', [regno, coId]);
  if (existing.length) {
    await pool.query(
      'UPDATE StudentCOMarks SET consolidatedMark = ?, updatedBy = ?, updatedDate = CURRENT_TIMESTAMP WHERE regno = ? AND coId = ?',
      [consolidatedMark, 'admin', regno, coId]
    );
  } else {
    await pool.query(
      'INSERT INTO StudentCOMarks (regno, coId, consolidatedMark, createdBy, updatedBy) VALUES (?, ?, ?, ?, ?)',
      [regno, coId, consolidatedMark, 'admin', 'admin']
    );
  }

  res.json({ status: 'success', message: 'Consolidated mark updated successfully' });
});


export const exportCourseWiseCsvAdmin = catchAsync(async (req, res) => {
  const { courseCode } = req.params;

  try {
    // Step 1: Validate course existence
    const [course] = await pool.query(
      'SELECT courseId FROM Course WHERE UPPER(courseCode) = UPPER(?)',
      [courseCode]
    );
    if (!course.length) {
      return res.status(404).json({ status: 'error', message: `Course ${courseCode} not found` });
    }
    const courseId = course[0].courseId;

    // Step 2: Fetch all course outcomes for the course
    const [cos] = await pool.query(
      `SELECT co.coId, co.coNumber, ct.coType 
       FROM CourseOutcome co
       LEFT JOIN COType ct ON co.coId = ct.coId
       WHERE co.courseId = ? 
       ORDER BY co.coNumber`,
      [courseId]
    );
    if (!cos.length) {
      return res.status(404).json({ status: 'error', message: 'No course outcomes found' });
    }

    // Step 3: Fetch all students enrolled in the course (across all sections)
    const [students] = await pool.query(
      `SELECT DISTINCT sd.regno, u.username AS name 
       FROM student_details sd
       JOIN users u ON sd.Userid = u.Userid
       JOIN StudentCourse sc ON sd.regno = sc.regno
       WHERE sc.courseId = ?
       ORDER BY sd.regno`,
      [courseId]
    );
    if (!students.length) {
      return res.status(404).json({ status: 'error', message: 'No students found for this course' });
    }

    // Step 4: Fetch consolidated marks for all students and COs
    const [coMarks] = await pool.query(
      `SELECT regno, coId, consolidatedMark 
       FROM StudentCOMarks 
       WHERE coId IN (?) AND regno IN (?)`,
      [cos.map(co => co.coId), students.map(s => s.regno)]
    );

    // Step 5: Build coMarksMap with explicit number parsing
    const coMarksMap = coMarks.reduce((acc, cm) => {
      if (!acc[cm.regno]) acc[cm.regno] = {};
      // Convert consolidatedMark to a number, default to 0 if invalid
      const mark = parseFloat(cm.consolidatedMark);
      acc[cm.regno][cm.coId] = isNaN(mark) ? 0 : mark;
      return acc;
    }, {});
    console.log('coMarksMap:', coMarksMap); // Debug log

    // Step 6: Calculate averages for each student
    const calculateAverages = (regno) => {
      let theorySum = 0, theoryCount = 0, pracSum = 0, pracCount = 0, expSum = 0, expCount = 0;
      const marks = {};
      cos.forEach(co => {
        const coMarkRaw = coMarksMap[regno]?.[co.coId];
        const coMark = (typeof coMarkRaw === 'number' && !isNaN(coMarkRaw)) ? coMarkRaw : 0;
        console.log(`Regno: ${regno}, coId: ${co.coId}, coMark: ${coMark}, type: ${typeof coMark}`); // Debug log
        marks[co.coNumber] = coMark.toFixed(2);
        if (co.coType === 'THEORY') {
          theorySum += coMark;
          theoryCount++;
        } else if (co.coType === 'PRACTICAL') {
          pracSum += coMark;
          pracCount++;
        } else if (co.coType === 'EXPERIENTIAL') {
          expSum += coMark;
          expCount++;
        }
      });
      const avgTheory = theoryCount ? (theorySum / theoryCount).toFixed(2) : '0.00';
      const avgPractical = pracCount ? (pracSum / pracCount).toFixed(2) : '0.00';
      const avgExperiential = expCount ? (expSum / expCount).toFixed(2) : '0.00';
      const activePartitions = [
        { count: theoryCount, avg: parseFloat(avgTheory) },
        { count: pracCount, avg: parseFloat(avgPractical) },
        { count: expCount, avg: parseFloat(avgExperiential) },
      ].filter(p => p.count > 0);
      const finalAvg = activePartitions.length
        ? (activePartitions.reduce((sum, p) => sum + p.avg, 0) / activePartitions.length).toFixed(2)
        : '0.00';
      return { ...marks, avgTheory, avgPractical, avgExperiential, finalAvg };
    };

    // Step 7: Define CSV header
    const header = [
      { id: 'regNo', title: 'Reg No' },
      { id: 'name', title: 'Name' },
      ...cos.map(co => ({ id: co.coNumber, title: co.coNumber })),
      { id: 'avgTheory', title: 'Theory Avg' },
      { id: 'avgPractical', title: 'Practical Avg' },
      { id: 'avgExperiential', title: 'Experiential Avg' },
      { id: 'finalAvg', title: 'Final Avg' },
    ];

    // Step 8: Prepare CSV data
    const data = students.map(student => {
      const averages = calculateAverages(student.regno);
      return {
        regNo: student.regno,
        name: student.name,
        ...averages,
      };
    });

    // Step 9: Generate and send CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${courseCode}_marks_admin_${timestamp}.csv`;
    const filePath = path.join(os.tmpdir(), filename);

    const csvWriter = createCsvWriter({
      path: filePath,
      header,
    });
    await csvWriter.writeRecords(data);

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting file:', unlinkErr);
      });
    });
  } catch (err) {
    console.error('Error in exportCourseWiseCsvAdmin:', err);
    res.status(500).json({ 
      status: 'error', 
      message: `Export failed: ${err.message}. Check if course ${courseCode} is valid.` 
    });
  }
});

