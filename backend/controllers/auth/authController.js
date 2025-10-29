import pool from '../../db.js';
import catchAsync from '../../utils/catchAsync.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RESET_TOKEN_EXPIRES_IN = process.env.RESET_TOKEN_EXPIRES_IN || '10m';
const FRONTEND_URL = process.env.FRONTEND_URL;

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

const generateToken = (Userid, role, email) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.sign({ Userid, role, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const sendResetEmail = async (email, resetToken) => {
  const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset</h2>
      <p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p>
      <p>This link expires in ${RESET_TOKEN_EXPIRES_IN}.</p>
      <p>If you did not request this, ignore this email.</p>
    `,
  };
  await transporter.sendMail(mailOptions);
};

export const register = catchAsync(async (req, res) => {
  const { username, email, password, role, Deptid, staffId } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!username || !email || !password || !role || !Deptid) {
      return res.status(400).json({
        status: 'failure',
        message: 'Username, email, password, role, and department are required',
      });
    }

    const normalizedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    if (!['Admin', 'Staff', 'Student'].includes(normalizedRole)) {
      return res.status(400).json({ status: 'failure', message: 'Role must be Admin, Staff, or Student' });
    }

    const [existingUser] = await connection.execute(
      'SELECT Userid FROM users WHERE LOWER(email) = ? OR username = ?',
      [email.toLowerCase(), username]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ status: 'failure', message: 'Email or username already exists' });
    }

    const [dept] = await connection.execute('SELECT Deptid FROM department WHERE Deptid = ?', [Deptid]);
    if (dept.length === 0) {
      return res.status(400).json({ status: 'failure', message: 'Invalid department' });
    }

    if (staffId) {
      const [existingStaff] = await connection.execute(
        'SELECT Userid FROM users WHERE staffId = ? AND Deptid = ?',
        [staffId, Deptid]
      );
      if (existingStaff.length > 0) {
        return res.status(400).json({ status: 'failure', message: 'Staff ID already exists in this department' });
      }
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await connection.execute(
      `INSERT INTO users (username, email, password, role, Deptid, staffId, status, Created_by, Updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [username, email.toLowerCase(), hashedPassword, normalizedRole, Deptid, staffId || null, null, null]
    );

    const Userid = result.insertId;

    await connection.execute(
      `UPDATE users SET Created_by = ?, Updated_by = ? WHERE Userid = ?`,
      [Userid, Userid, Userid]
    );

    const [userRows] = await connection.execute(
      'SELECT Userid, username, email, role, Deptid, staffId FROM users WHERE Userid = ?',
      [Userid]
    );
    const user = userRows[0];

    await connection.commit();

    const token = generateToken(user.Userid, user.role, user.email);

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user: { ...user, role: user.role.toLowerCase() },
        token,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Register error:', error.message);
    res.status(500).json({ status: 'failure', message: 'Registration failed: ' + error.message });
  } finally {
    connection.release();
  }
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!email || !password) {
      console.log('Login error: Email or password missing');
      return res.status(400).json({ status: 'failure', message: 'Email and password are required' });
    }

    const [users] = await connection.execute(
      `SELECT Userid, username, email, password, role, Deptid, staffId, status
       FROM users WHERE LOWER(email) = ?`,
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      console.log('Login error: No user found with email:', email);
      return res.status(401).json({ status: 'failure', message: 'Invalid email or password' });
    }

    const user = users[0];

    if (user.status !== 'active') {
      console.log('Login error: User is inactive:', email);
      return res.status(401).json({ status: 'failure', message: 'User account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Login error: Invalid password for email:', email);
      return res.status(401).json({ status: 'failure', message: 'Invalid email or password' });
    }

    const token = generateToken(user.Userid, user.role, user.email);
    console.log('Login successful, generated token for:', user.email, token);

    await connection.commit();

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: {
          Userid: user.Userid,
          username: user.username,
          email: user.email,
          role: user.role.toLowerCase(),
          Deptid: user.Deptid,
          staffId: user.staffId,
        },
        token,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Login error:', error.message);
    res.status(500).json({ status: 'failure', message: `Login failed: ${error.message}` });
  } finally {
    connection.release();
  }
});

export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!email) {
      return res.status(400).json({ status: 'failure', message: 'Email is required' });
    }

    const [users] = await connection.execute(
      'SELECT Userid, email FROM users WHERE LOWER(email) = ? AND status = "active"',
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(200).json({ status: 'success', message: 'If user exists, reset email sent' });
    }

    const user = users[0];

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresInMs = 10 * 60 * 1000;
    const resetTokenExpiry = new Date(Date.now() + expiresInMs);

    await connection.execute(
      'UPDATE users SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE Userid = ?',
      [resetToken, resetTokenExpiry, user.Userid]
    );

    await sendResetEmail(user.email, resetToken);

    await connection.commit();

    res.status(200).json({
      status: 'success',
      message: 'Password reset email sent',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Forgot password error:', error.message);
    res.status(500).json({ status: 'failure', message: 'Failed to send reset email: ' + error.message });
  } finally {
    connection.release();
  }
});

export const resetPassword = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!password || password.length < 6) {
      return res.status(400).json({ status: 'failure', message: 'New password is required (min 6 chars)' });
    }

    const [users] = await connection.execute(
      `SELECT Userid FROM users 
       WHERE resetPasswordToken = ? AND resetPasswordExpires > NOW() AND status = 'active'`,
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ status: 'failure', message: 'Invalid or expired reset token' });
    }

    const user = users[0];

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    await connection.execute(
      'UPDATE users SET password = ?, resetPasswordToken = NULL, resetPasswordExpires = NULL, Updated_by = ? WHERE Userid = ?',
      [hashedPassword, user.Userid, user.Userid]
    );

    await connection.commit();

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Reset password error:', error.message);
    res.status(500).json({ status: 'failure', message: 'Password reset failed: ' + error.message });
  } finally {
    connection.release();
  }
});

export const logout = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

export const protect = catchAsync(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ status: 'failure', message: 'Not authorized, token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    const connection = await pool.getConnection();
    try {
      const [users] = await connection.execute(
        'SELECT Userid, username, role, email, staffId, Deptid, status FROM users WHERE Userid = ? AND status = ?',
        [decoded.Userid, 'active']
      );

      if (users.length === 0) {
        return res.status(401).json({ status: 'failure', message: 'Invalid token or user not found' });
      }

      const user = users[0];
      if (!user.email) {
        return res.status(401).json({
          status: 'failure',
          message: 'Authentication required: No user or email provided',
        });
      }

      req.user = user;
      next();
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Protect: Token verification error:', error.message);
    return res.status(401).json({ status: 'failure', message: 'Invalid token: ' + error.message });
  }
});