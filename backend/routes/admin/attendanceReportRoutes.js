import express from "express";
import {
  getBatches,
  getDepartments,
  getSemesters,
  getSubjectWiseAttendance,
  getUnmarkedAttendanceReport
} from "../../controllers/attendanceReportController.js";
import { protect } from "../../controllers/auth/authController.js";

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Attendance report-specific routes
router.get("/batches", getBatches);
router.get("/departments/:batchId", getDepartments);
router.get("/semesters/:batchId/:departmentId", getSemesters);
router.get(
  "/subject-wise/:degree/:batchId/:departmentId/:semesterId",
  getSubjectWiseAttendance
);
router.get("/unmarked/:batchId/:semesterId", getUnmarkedAttendanceReport);

export default router;
