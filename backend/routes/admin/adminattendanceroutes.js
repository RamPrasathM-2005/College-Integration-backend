// adminAttendanceRoutes.js - Updated with consistent param names (:courseId for POST)
import express from "express";
import {
  getTimetableAdmin,
  getStudentsForPeriodAdmin,
  markAttendanceAdmin,
} from "../../controllers/adminattendancecontroller.js";
import { protect } from "../../controllers/auth/authController.js";

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Admin-specific routes
router.get("/timetable", getTimetableAdmin);
router.get(
  "/students/:courseId/all/:dayOfWeek/:periodNumber",
  getStudentsForPeriodAdmin
);
router.post(
  "/mark/:courseId/:sectionId/:dayOfWeek/:periodNumber",
  markAttendanceAdmin
);

export default router;
