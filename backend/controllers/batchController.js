// batchController.js
import pool from "../db.js";
import catchAsync from "../utils/catchAsync.js";

export const getAllBatches = catchAsync(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT batchId, degree, branch, batch, batchYears, createdBy, createdDate, isActive 
       FROM Batch WHERE isActive = 'YES'`
    );
    res.status(200).json({ status: "success", data: rows });
  } catch (err) {
    throw err;
  } finally {
    connection.release();
  }
});

export const getBatchById = catchAsync(async (req, res) => {
  const { batchId } = req.params;
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT batchId, degree, branch, batch, batchYears, createdBy, createdDate, isActive 
       FROM Batch WHERE batchId = ? AND isActive = 'YES'`,
      [batchId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ status: "failure", message: `No active batch found with batchId ${batchId}` });
    }
    res.status(200).json({ status: "success", data: rows[0] });
  } catch (err) {
    throw err;
  } finally {
    connection.release();
  }
});

export const getBatchByDetails = catchAsync(async (req, res) => {
  const { degree, branch, batch } = req.query;
  if (!degree || !branch || !batch) {
    return res.status(400).json({ status: "failure", message: "degree, branch, and batch are required query parameters" });
  }

  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT batchId, degree, branch, batch, batchYears, createdBy, createdDate, isActive, regulationId 
       FROM Batch WHERE degree = ? AND branch = ? AND batch = ? AND isActive = 'YES'`,
      [degree, branch, batch]
    );
    if (rows.length === 0) {
      return res.status(404).json({ status: "failure", message: `No active batch found with degree ${degree}, branch ${branch}, and batch ${batch}` });
    }
    res.status(200).json({ status: "success", data: rows[0] });
  } catch (err) {
    console.error('Error fetching batch:', err);
    res.status(500).json({ status: "failure", message: `Server error: ${err.message}` });
  } finally {
    connection.release();
  }
});

export const createBatch = catchAsync(async (req, res) => {
  const { degree, branch, batch, batchYears, createdBy } = req.body;
  if (!degree || !branch || !batch || !batchYears || !createdBy) {
    return res.status(400).json({ status: "failure", message: "All fields (degree, branch, batch, batchYears, createdBy) are required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT batchId FROM Batch WHERE batch = ? AND degree = ? AND branch = ? AND isActive = 'YES'`,
      [batch, degree, branch]
    );
    if (existingRows.length > 0) {
      return res.status(400).json({ status: "failure", message: "Batch already exists" });
    }

    const [result] = await connection.execute(
      `INSERT INTO Batch (degree, branch, batch, batchYears, createdBy, createdDate, isActive) 
       VALUES (?, ?, ?, ?, ?, NOW(), 'YES')`,
      [degree, branch, batch, batchYears, createdBy]
    );

    await connection.commit();
    res.status(201).json({ status: "success", batchId: result.insertId, message: "Batch created successfully" });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

export const updateBatch = catchAsync(async (req, res) => {
  const { batchId } = req.params;
  const { degree, branch, batch, batchYears, isActive, updatedBy } = req.body;
  if (!batchId || (!degree && !branch && !batch && !batchYears && !isActive && !updatedBy)) {
    return res.status(400).json({ status: "failure", message: "At least one field to update is required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT batchId FROM Batch WHERE batchId = ? AND isActive = 'YES'`,
      [batchId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ status: "failure", message: `No active batch found with batchId ${batchId}` });
    }

    const updateFields = [];
    const values = [];
    if (degree) { updateFields.push("degree = ?"); values.push(degree); }
    if (branch) { updateFields.push("branch = ?"); values.push(branch); }
    if (batch) { updateFields.push("batch = ?"); values.push(batch); }
    if (batchYears) { updateFields.push("batchYears = ?"); values.push(batchYears); }
    if (isActive) { updateFields.push("isActive = ?"); values.push(isActive); }
    updateFields.push("updatedBy = ?", "updatedDate = NOW()");
    values.push(updatedBy || req.user?.email || 'admin');

    const query = `UPDATE Batch SET ${updateFields.join(", ")} WHERE batchId = ?`;
    values.push(batchId);
    await connection.execute(query, values);

    await connection.commit();
    res.status(200).json({ status: "success", message: "Batch updated successfully" });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

export const deleteBatch = catchAsync(async (req, res) => {
  const { batchId } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.execute(
      `SELECT batchId FROM Batch WHERE batchId = ? AND isActive = 'YES'`,
      [batchId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ status: "failure", message: `No active batch found with batchId ${batchId}` });
    }

    await connection.execute(
      `UPDATE Batch SET isActive = 'NO', updatedDate = NOW(), updatedBy = ? WHERE batchId = ?`,
      [req.user?.email || 'admin', batchId]
    );

    await connection.commit();
    res.status(200).json({ status: "success", message: "Batch deleted successfully" });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});


export const getOrCreateBatch = async (Deptid, regulationYear, createdBy, updatedBy) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Try to find an existing batch
    const [batches] = await connection.execute(
      `SELECT batchId FROM Batch WHERE Deptid = ? AND batch = ? AND isActive = 'YES'`,
      [Deptid, regulationYear.toString()]
    );

    if (batches.length > 0) {
      await connection.commit();
      return batches[0].batchId;
    }

    // Create a new batch
    const batchYears = `${regulationYear}-${regulationYear + 4}`; // e.g., "2023-2027"
    const [result] = await connection.execute(
      `INSERT INTO Batch (Deptid, degree, branch, batch, batchYears, isActive, createdBy, updatedBy)
       VALUES (?, 'B.Tech', (SELECT Deptacronym FROM department WHERE Deptid = ?), ?, ?, 'YES', ?, ?)`,
      [Deptid, Deptid, regulationYear.toString(), batchYears, createdBy, updatedBy]
    );

    await connection.commit();
    return result.insertId;
  } catch (err) {
    if (connection) await connection.rollback();
    throw new Error(`Error getting or creating batch: ${err.message}`);
  } finally {
    if (connection) connection.release();
  }
};