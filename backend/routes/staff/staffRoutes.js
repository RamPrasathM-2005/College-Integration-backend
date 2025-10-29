import express from 'express';
import {
  getCoursePartitions,
  saveCoursePartitions,
  updateCoursePartitions,
  getCOsForCourse,
  getToolsForCO,
  createTool,
  saveToolsForCO,
  updateTool,
  deleteTool,
  getStudentMarksForTool,
  saveStudentMarksForTool,
  importMarksForTool,
  exportCoWiseCsv,
  exportCourseWiseCsv,
  getStudentsForCourse,
  getMyCourses,
  getStudentsForSection,
  updateStudentCOMarkByCoId,
  getStudentCOMarks
} from '../../controllers/markController.js';
import { protect } from '../../controllers/auth/authController.js';
import upload from '../../uploads/upload.js'

const router = express.Router();

router.get('/courses', protect, getMyCourses);
router.get('/partitions/:courseCode', protect, getCoursePartitions);
router.post('/partitions/:courseCode', protect, saveCoursePartitions);
router.put('/partitions/:courseCode', protect, updateCoursePartitions);
router.get('/cos/:courseCode', protect, getCOsForCourse);
router.get('/tools/:coId', protect, getToolsForCO);
router.post('/tools/:coId', protect, createTool);
router.post('/tools/:coId/save', protect, saveToolsForCO);
router.put('/tools/:toolId', protect, updateTool);
router.delete('/tools/:toolId', protect, deleteTool);
router.put('/marks/co/:regno/:coId', protect, updateStudentCOMarkByCoId);
router.get('/marks/:toolId', protect, getStudentMarksForTool);
router.post('/marks/:toolId', protect, saveStudentMarksForTool);
router.post('/marks/:toolId/import', protect, upload.single('file'), importMarksForTool);
router.get('/export/co/:coId', protect, exportCoWiseCsv);
router.get('/export/course/:courseCode', protect, exportCourseWiseCsv);
router.get('/students/:courseCode', protect, getStudentsForCourse);
router.get('/students/:courseCode/section/:sectionId', protect, getStudentsForSection);
router.get('/marks/co/:courseCode', protect, getStudentCOMarks);

export default router;