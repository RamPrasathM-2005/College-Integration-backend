// Updated staffattendanceroutes.js
import express from "express";
import {
  getTimetable,
  getStudentsForPeriod,
  markAttendance,
  getSkippedStudents,
} from "../../controllers/attendanceController.js";
import { protect } from "../../controllers/auth/authController.js";

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

router.get("/timetable", getTimetable);
router.get(
  "/students/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  getStudentsForPeriod
);
router.get(
  "/skipped/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  getSkippedStudents
);
router.post(
  "/mark/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  markAttendance
);

export default router;
