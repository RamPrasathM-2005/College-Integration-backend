import pool from '../db.js';

export const getDepartments = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT Deptid, Deptname, Deptacronym FROM department'
    );
    res.status(200).json({
      status: 'success',
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ status: 'failure', message: 'Failed to fetch departments' });
  } finally {
    if (connection) connection.release();
  }
};