// Modified adminroutes.js
import express from "express";
import {
  addSemester,
  deleteSemester,
  getAllSemesters,
  getSemester,
  updateSemester,
  getSemestersByBatchBranch,
} from "../../controllers/semesterController.js";
import {
  addCourse,
  getAllCourse,
  getCourseBySemester,
  updateCourse,
  deleteCourse,
  importCourses,
} from "../../controllers/subjectController.js";
import {
  allocateStaffToCourse,
  allocateCourseToStaff,
  updateStaffAllocation,
  getStaffAllocationsByCourse,
  getCourseAllocationsByStaff,
  deleteStaffAllocation,
  getUsers,
  getCourseAllocationsByStaffEnhanced,
  updateStaffCourseBatch,
} from "../../controllers/staffCourseController.js";
import {
  searchStudents,
  getAvailableCourses,
  enrollStudentInCourse,
  updateStudentBatch,
  getAvailableCoursesForBatch,
  unenrollStudentFromCourse,
} from "../../controllers/studentAllocationController.js";
import {
  getSectionsForCourse,
  addSectionsToCourse,
  updateSectionsForCourse,
  deleteSection,
  getSections,
} from "../../controllers/sectionController.js";
import {
  addStudent,
  getAllStudents,
  getStudentByRollNumber,
  updateStudent,
  deleteStudent,
  getStudentEnrolledCourses,
  getBranches,
  getSemesters,
  getBatches,
  getStudentsByCourseAndSection,
} from "../../controllers/studentController.js";
import {
  getAllBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  getBatchByDetails,
} from "../../controllers/batchController.js";
import {
  getAllTimetableBatches,
  getAllTimetableDepartments,
  getTimetable,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTimetableByFilters,
} from "../../controllers/timetableController.js";
import { exportCourseWiseCsvAdmin, getConsolidatedMarks } from "../../controllers/markController.js";
import { getDepartments } from "../../controllers/departmentController.js";
import {
  getElectiveBuckets,
  createElectiveBucket,
  addCoursesToBucket,
  deleteElectiveBucket,
  removeCourseFromBucket,
  updateElectiveBucketName,
  
} from "../../controllers/electiveBucketController.js";
import {
  getAllRegulations,
  importRegulationCourses,
  createVertical,
  getVerticalsByRegulation,
  getAvailableCoursesForVertical,
  allocateCoursesToVertical,
  allocateRegulationToBatch,
  getCoursesByVertical, // Added this import
} from "../../controllers/regulationController.js";
import { protect } from "../../controllers/auth/authController.js";
import { getStudentEnrollments } from "../../controllers/studentEnrollmentViewController.js";
import { getElectiveSelections } from "../../controllers/studentpageController.js";
import { getCOsForCourseAdmin, getStudentCOMarksAdmin, updateStudentCOMarkAdmin } from "../../controllers/markController.js";

const router = express.Router();

// Base API: http://localhost:4000/api/admin

/* =========================
   📌 Semester Routes
   ========================= */
router.route("/semesters").post(protect, addSemester).get(protect, getAllSemesters);
router.get("/semesters/search", protect, getSemester);
router.get("/semesters/by-batch-branch", protect, getSemestersByBatchBranch);
router.route("/semesters/:semesterId").put(protect, updateSemester).delete(protect, deleteSemester);

/* =========================
   📌 Course Routes
   ========================= */
router
  .route("/semesters/:semesterId/courses")
  .post(protect, addCourse)
  .get(protect, getCourseBySemester);

router
  .route("/courses")
  .get(protect, getAllCourse)
  .post(protect, importCourses);

router
  .route("/courses/:courseId")
  .put(protect, updateCourse)
  .delete(protect, deleteCourse);

/* =========================
   📌 Staff-Course Allocation Routes
   ========================= */
router.get("/users", protect, getUsers);
router.post("/courses/:courseId/staff", protect, allocateStaffToCourse);
router.post("/staff/:Userid/courses", protect, allocateCourseToStaff);
router.put("/staff-courses/:staffCourseId", protect, updateStaffAllocation);
router.patch("/staff-courses/:staffCourseId", protect, updateStaffCourseBatch);
router.get("/courses/:courseId/staff", protect, getStaffAllocationsByCourse);
router.get("/staff/:Userid/courses", protect, getCourseAllocationsByStaff);
router.delete("/staff-courses/:staffCourseId", protect, deleteStaffAllocation);
router.get("/staff/:Userid/courses-enhanced", protect, getCourseAllocationsByStaffEnhanced);

/* =========================
   📌 Student Allocation Routes
   ========================= */
router.get("/students/search", protect, searchStudents);
router.get("/courses/available/:semesterNumber", protect, getAvailableCourses);
router.post("/students/enroll", protect, enrollStudentInCourse);
router.put("/students/:rollNumber/batch", protect, updateStudentBatch);
router.get("/courses/available/:batchId/:semesterNumber", protect, getAvailableCoursesForBatch);
router.delete("/students/unenroll", protect, unenrollStudentFromCourse);

/* =========================
   📌 Section Routes
   ========================= */
router.get("/sections", protect, getSections);
router.get("/courses/:courseId/sections", protect, getSectionsForCourse);
router.post("/courses/:courseId/sections", protect, addSectionsToCourse);
router.put("/courses/:courseId/sections", protect, updateSectionsForCourse);
router.delete("/courses/:courseId/sections/:sectionName", protect, deleteSection);

/* =========================
   📌 Student Routes
   ========================= */
router.route("/students").post(protect, addStudent).get(protect, getAllStudents);
router.get("/students/branches", protect, getBranches);
router.get("/students/semesters", protect, getSemesters);
router.get("/students/batches", protect, getBatches);
router.get("/students/enrolled-courses", protect, getStudentsByCourseAndSection);
router
  .route("/students/:rollNumber")
  .get(protect, getStudentByRollNumber)
  .put(protect, updateStudent)
  .delete(protect, deleteStudent);
router.get("/students/:rollNumber/enrolled-courses", protect, getStudentEnrolledCourses);

/* =========================
   📌 Batch Routes
   ========================= */
router.get("/batches/find", protect, getBatchByDetails);
router.route("/batches").get(protect, getAllBatches).post(protect, createBatch);
router
  .route("/batches/:batchId")
  .get(protect, getBatchById)
  .put(protect, updateBatch)
  .delete(protect, deleteBatch);

/* =========================
   📌 Timetable Routes
   ========================= */
router.get("/timetable/batches", protect, getAllTimetableBatches);
router.get("/timetable/departments", protect, getAllTimetableDepartments);
router.get("/timetable/by-filters", protect, getTimetableByFilters);
router.get("/timetable/semester/:semesterId", protect, getTimetable);
router.post("/timetable/entry", protect, createTimetableEntry);
router.put("/timetable/entry/:timetableId", protect, updateTimetableEntry);
router.delete("/timetable/entry/:timetableId", protect, deleteTimetableEntry);

/* =========================
   📌 Elective Bucket Routes
   ========================= */
router.get("/semesters/:semesterId/buckets", protect, getElectiveBuckets);
router.post("/semesters/:semesterId/buckets", protect, createElectiveBucket);
router.put("/buckets/:bucketId", protect, updateElectiveBucketName);
router.post("/buckets/:bucketId/courses", protect, addCoursesToBucket);
router.delete("/buckets/:bucketId", protect, deleteElectiveBucket);
router.delete("/buckets/:bucketId/courses/:courseId", protect, removeCourseFromBucket);

/* =========================
   📌 Consolidated Marks Routes
   ========================= */
router.get("/consolidated-marks", protect, getConsolidatedMarks);

/* =========================
   📌 Regulation Routes
   ========================= */
router.route('/regulations').get(protect, getAllRegulations);
router.route('/regulations/courses').post(protect, importRegulationCourses);
router.route('/regulations/verticals').post(protect, createVertical);
router.route('/regulations/:regulationId/verticals').get(protect, getVerticalsByRegulation);
router.route('/regulations/:regulationId/courses/available').get(protect, getAvailableCoursesForVertical);
router.route('/regulations/verticals/courses').post(protect, allocateCoursesToVertical);
router.route('/regulations/verticals/:verticalId/courses').get(protect, getCoursesByVertical); // Added this route
router.route('/regulations/allocate-to-batch').post(protect, allocateRegulationToBatch); // Added this route




router.get("/enrollments/view", protect, getStudentEnrollments);


router.get("/admin-marks/cos/:courseCode", protect, getCOsForCourseAdmin);
router.get("/admin-marks/marks/co/:courseCode", protect, getStudentCOMarksAdmin);
router.put("/admin-marks/marks/co/:regno/:coId", protect, updateStudentCOMarkAdmin);
router.get('/export/course/:courseCode', protect, exportCourseWiseCsvAdmin);


router.get("/elective-selections", getElectiveSelections);

export default router;