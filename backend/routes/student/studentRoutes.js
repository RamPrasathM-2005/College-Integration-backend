import express from "express";
import {
  getStudentDetails,
  getSemesters,
  getMandatoryCourses,
  getElectiveBuckets,
  allocateElectives,
  getStudentEnrolledCourses,
  getAttendanceSummary,
  getUserId,
  getElectiveSelections,
} from "../../controllers/studentpageController.js";
import { protect} from "../../controllers/auth/authController.js";

const router = express.Router();

// Base API: http://localhost:4000/api/student

// Student-only routes - restricted to authenticated students
router.use(protect); // Ensure user is authenticated
//router.use(restrictTo('student')); // Ensure user is a student

// Get authenticated user's Userid
router.get("/userid", getUserId);

// Get student profile details
router.get("/details", getStudentDetails);

// Get semesters for student's batch
router.get("/semesters", getSemesters);

// Course selection routes
router.get("/courses/mandatory", getMandatoryCourses);
router.get("/elective-buckets", getElectiveBuckets);
router.post("/allocate-electives", allocateElectives);

// Get enrolled courses (filtered by semester if provided)
router.get("/enrolled-courses", getStudentEnrolledCourses);

// Get attendance summary for a semester
router.get("/attendance-summary", getAttendanceSummary);

router.get('/elective-selections', protect, getElectiveSelections);

export default router;