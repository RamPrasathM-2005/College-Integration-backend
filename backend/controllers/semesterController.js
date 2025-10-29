import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

// Utility: format YYYY-MM-DD safely
function formatDate(dateStr) {
  if (!dateStr) return null;
  return dateStr.length > 10 ? dateStr.substring(0, 10) : dateStr;
}


// Helper function to calculate difference in days between two dates
const calculateDaysDifference = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end - start;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Convert milliseconds to days
};

export const addSemester = catchAsync(async (req, res) => {
  const {
    degree,
    batch,
    branch,
    semesterNumber,
    startDate,
    endDate,
  } = req.body;

  // Validation: required fields
  if (!batch || !branch || !degree || !semesterNumber || !startDate || !endDate) {
    return res.status(400).json({ status: "failure", message: "All fields are required" });
  }

  // Validate dates
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  if (formattedStartDate >= formattedEndDate) {
    return res.status(400).json({ status: "failure", message: "startDate must be before endDate" });
  }

  // Validate that endDate is exactly 90 days after startDate
  const daysDifference = calculateDaysDifference(formattedStartDate, formattedEndDate);
  if (daysDifference !== 90) {
    return res.status(400).json({ 
      status: "failure", 
      message: `The duration between startDate and endDate must be exactly 90 days, but got ${daysDifference} days` 
    });
  }

  // 🔍 Get batchId
  const [batchRows] = await pool.execute(
    `SELECT batchId FROM Batch WHERE batch = ? AND branch = ? AND degree = ? AND isActive = 'YES'`,
    [batch, branch, degree]
  );

  if (batchRows.length === 0) {
    return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
  }

  const batchId = batchRows[0].batchId;

  // Prevent duplicate semester
  const [existing] = await pool.execute(
    `SELECT semesterId FROM Semester WHERE batchId = ? AND semesterNumber = ?`,
    [batchId, semesterNumber]
  );

  if (existing.length > 0) {
    return res.status(400).json({ status: "failure", message: "Semester already exists for this batch" });
  }

  // Ensure sequential order
  if (semesterNumber > 1) {
    const [previous] = await pool.execute(
      `SELECT semesterNumber FROM Semester WHERE batchId = ? ORDER BY semesterNumber`,
      [batchId]
    );
    if (previous.length !== semesterNumber - 1) {
      return res.status(400).json({
        status: "failure",
        message: `You must first create semesters 1 to ${semesterNumber - 1} for this batch`,
      });
    }
  }

  // Insert semester
  const [rows] = await pool.execute(
    `INSERT INTO Semester (batchId, semesterNumber, startDate, endDate, createdBy, updatedBy)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [batchId, semesterNumber, formattedStartDate, formattedEndDate, req.user?.email || 'admin', req.user?.email || 'admin']
  );

  return res.status(201).json({
    status: "success",
    message: "Semester added successfully",
    semesterId: rows.insertId,
  });
});
// ✅ Get a single Semester
export const getSemester = catchAsync(async (req, res) => {
  const { batch, branch, degree, semesterNumber } = req.query;

  if (!batch || !branch || !degree || !semesterNumber) {
    return res.status(400).json({
      status: "failure",
      message: "batch, branch, degree, and semesterNumber are required",
    });
  }

  const [rows] = await pool.execute(
    `SELECT s.*, b.degree, b.branch, b.batch, b.batchYears
     FROM Semester s
     INNER JOIN Batch b ON s.batchId = b.batchId
     WHERE b.batch = ? AND b.branch = ? AND b.degree = ? AND s.semesterNumber = ? AND s.isActive = 'YES'`,
    [batch, branch, degree, semesterNumber]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      status: "failure",
      message: `Semester ${semesterNumber} not found for batch ${batch} - ${branch}`,
    });
  }

  res.status(200).json({ status: "success", data: rows[0] });
});

// ✅ Get all Semesters
export const getAllSemesters = catchAsync(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.*, b.degree, b.branch, b.batch, b.batchYears
     FROM Semester s
     INNER JOIN Batch b ON s.batchId = b.batchId
     WHERE s.isActive = 'YES' AND b.isActive = 'YES'`
  );
  return res.status(200).json({ status: "success", data: rows });
});

// ✅ Get Semesters by Batch+Branch
export const getSemestersByBatchBranch = catchAsync(async (req, res) => {
  const { batch, branch, degree } = req.query;

  if (!batch || !branch || !degree) {
    return res.status(400).json({ status: "failure", message: "batch, branch, and degree are required" });
  }

  const [rows] = await pool.execute(
    `SELECT s.*, b.degree, b.branch, b.batch, b.batchYears
     FROM Semester s
     INNER JOIN Batch b ON s.batchId = b.batchId
     WHERE b.batch = ? AND b.branch = ? AND b.degree = ? AND s.isActive = 'YES'
     ORDER BY s.semesterNumber ASC`,
    [batch, branch, degree]
  );

  if (rows.length === 0) {
    return res.status(404).json({ status: "failure", message: `No semesters found for batch ${batch} - ${branch}` });
  }

  res.status(200).json({ status: "success", data: rows });
});

// ✅ Update Semester
export const updateSemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;
  const {
    batch,
    branch,
    degree,
    semesterNumber,
    startDate,
    endDate,
    isActive,
  } = req.body;

  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const id = parseInt(semesterId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ status: "failure", message: "Invalid semesterId provided." });
  }

  // Validate dates
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  if (formattedStartDate && formattedEndDate && formattedStartDate >= formattedEndDate) {
    return res.status(400).json({ status: "failure", message: "startDate must be before endDate" });
  }

  // Resolve batchId
  const [batchRows] = await pool.execute(
    `SELECT batchId FROM Batch WHERE batch = ? AND branch = ? AND degree = ? AND isActive = 'YES'`,
    [batch, branch, degree]
  );

  if (batchRows.length === 0) {
    return res.status(404).json({ status: "failure", message: `Batch ${batch} - ${branch} not found` });
  }

  const batchId = batchRows[0].batchId;

  const [result] = await pool.query(
    `UPDATE Semester
     SET batchId = ?, semesterNumber = ?, startDate = ?, endDate = ?, isActive = ?, updatedBy = ?, updatedDate = NOW()
     WHERE semesterId = ?`,
    [batchId, semesterNumber, formattedStartDate, formattedEndDate, isActive || 'YES', req.user?.email || 'admin', id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  res.status(200).json({
    status: "success",
    message: "Semester updated successfully",
  });
});

// ✅ Delete Semester
export const deleteSemester = catchAsync(async (req, res) => {
  const { semesterId } = req.params;

  if (!semesterId) {
    return res.status(400).json({ status: "failure", message: "semesterId is required" });
  }

  const id = parseInt(semesterId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ status: "failure", message: "Invalid semesterId provided." });
  }

  const [result] = await pool.query(`DELETE FROM Semester WHERE semesterId = ?`, [id]);

  if (result.affectedRows === 0) {
    return res.status(404).json({ status: "failure", message: "Semester not found" });
  }

  res.status(200).json({
    status: "success",
    message: `Semester with id ${id} deleted successfully`,
  });
});