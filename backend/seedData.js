import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: './config.env' });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
};

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.beginTransaction();

    // 1) USERS
    await connection.execute(`
      INSERT IGNORE INTO Users (userId, name, staffId, email, passwordHash, role, departmentId, isActive, createdBy, updatedBy)
      VALUES
        -- Admin
        (1, 'Admin User', NULL, 'admin_user@nec.edu.in', 'hashed_password', 'ADMIN', NULL, 'YES', 'admin', 'admin'),
        -- CSE Staff
        (2, 'Kalaiselvi', 'CSE001', 'kalaiselvi@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (3, 'VijayKumar', 'CSE002', 'vijaykumar@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (4, 'Mohideen Pitchai', 'CSE003', 'mohideen_pitchai@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (5, 'ThamaraiSelvi', 'CSE004', 'thamaraiselvi@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (6, 'Rajkumar', 'CSE005', 'rajkumar@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (7, 'M.Kanthimathi', 'CSE006', 'm_kanthimathi@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (8, 'Abisha', 'CSE007', 'abisha@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (9, 'Vazhan Arul Santhiya', 'CSE008', 'vazhan_arul_santhiya@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (10, 'Vignesh', 'CSE009', 'vignesh@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        (11, 'Lincy', 'CSE010', 'lincy@nec.edu.in', 'hashed_password', 'STAFF', 1, 'YES', 'admin', 'admin'),
        -- MECH Staff
        (12, 'Iyahraja', 'MECH001', 'iyahraja@nec.edu.in', 'hashed_password', 'STAFF', 3, 'YES', 'admin', 'admin'),
        (13, 'Manisekar', 'MECH002', 'manisekar@nec.edu.in', 'hashed_password', 'STAFF', 3, 'YES', 'admin', 'admin'),
        (14, 'Venkatkumar', 'MECH003', 'venkatkumar@nec.edu.in', 'hashed_password', 'STAFF', 3, 'YES', 'admin', 'admin'),
        (15, 'Harichandran', 'MECH004', 'harichandran@nec.edu.in', 'hashed_password', 'STAFF', 3, 'YES', 'admin', 'admin'),
        -- IT Staff
        (16, 'Paramasivan', 'IT001', 'paramasivan@nec.edu.in', 'hashed_password', 'STAFF', 4, 'YES', 'admin', 'admin'),
        (17, 'Muthukkumar', 'IT002', 'muthukkumar@nec.edu.in', 'hashed_password', 'STAFF', 4, 'YES', 'admin', 'admin'),
        -- EEE Staff
        (18, 'Maheswari', 'EEE001', 'maheswari@nec.edu.in', 'hashed_password', 'STAFF', 5, 'YES', 'admin', 'admin'),
        (19, 'Vigneshwaran', 'EEE002', 'vigneshwaran@nec.edu.in', 'hashed_password', 'STAFF', 5, 'YES', 'admin', 'admin'),
        -- ECE Staff
        (20, 'Shenbagavalli', 'ECE001', 'shenbagavalli@nec.edu.in', 'hashed_password', 'STAFF', 2, 'YES', 'admin', 'admin'),
        (21, 'Arun', 'ECE002', 'arun@nec.edu.in', 'hashed_password', 'STAFF', 2, 'YES', 'admin', 'admin'),
        -- AIDS Staff
        (22, 'Naskath', 'AIDS001', 'naskath@nec.edu.in', 'hashed_password', 'STAFF', 6, 'YES', 'admin', 'admin'),
        (23, 'Shenbagaraman', 'AIDS002', 'shenbagaraman@nec.edu.in', 'hashed_password', 'STAFF', 6, 'YES', 'admin', 'admin')
    `);

    // 2) BATCH
    await connection.execute(`
      INSERT IGNORE INTO Batch (batchId, degree, branch, batch, batchYears, createdBy, updatedBy)
      VALUES
        (1, 'B.E', 'Computer Science Engineering', '2023', '2023-2027', 'admin', 'admin'),
        (2, 'B.E', 'Electronics and Communication Engineering', '2023', '2023-2027', 'admin', 'admin'),
        (3, 'B.E', 'Mechanical Engineering', '2023', '2023-2027', 'admin', 'admin'),
        (4, 'B.Tech', 'Information Technology', '2024', '2024-2028', 'admin', 'admin'),
        (5, 'B.E', 'Electrical and Electronics Engineering', '2024', '2024-2028', 'admin', 'admin'),
        (6, 'B.Tech', 'Artificial Intelligence and Data Science', '2025', '2025-2029', 'admin', 'admin')
    `);

    // 3) SEMESTER
    await connection.execute(`
      INSERT IGNORE INTO Semester (semesterId, batchId, semesterNumber, startDate, endDate, createdBy, updatedBy)
      VALUES
        -- B.E CSE 2023-2027
        (1, 1, 1, '2023-07-01', '2023-12-15', 'admin', 'admin'),
        (2, 1, 2, '2024-01-10', '2024-05-30', 'admin', 'admin'),
        (3, 1, 3, '2024-07-01', '2024-12-15', 'admin', 'admin'),
        (4, 1, 4, '2025-01-10', '2025-05-30', 'admin', 'admin'),
        -- B.E ECE 2023-2027
        (5, 2, 1, '2023-07-01', '2023-12-15', 'admin', 'admin'),
        (6, 2, 2, '2024-01-10', '2024-05-30', 'admin', 'admin'),
        -- B.E MECH 2023-2027
        (7, 3, 1, '2023-07-01', '2023-12-15', 'admin', 'admin'),
        (8, 3, 2, '2024-01-10', '2024-05-30', 'admin', 'admin'),
        -- B.Tech IT 2024-2028
        (9, 4, 1, '2024-07-01', '2024-12-15', 'admin', 'admin'),
        -- B.E EEE 2024-2028
        (10, 5, 1, '2024-07-01', '2024-12-15', 'admin', 'admin'),
        -- B.Tech AIDS 2025-2029
        (11, 6, 1, '2025-07-01', '2025-12-15', 'admin', 'admin')
    `);

    // 4) COURSE
    await connection.execute(`
      INSERT IGNORE INTO Course (
        courseId, courseCode, semesterId, courseTitle, category, type, 
        lectureHours, tutorialHours, practicalHours, experientialHours, 
        totalContactPeriods, credits, minMark, maxMark, isActive, 
        createdBy, updatedBy
      )
      VALUES
        -- Semester 1: B.E CSE 2023-2027
        (1, 'CS101', 1, 'Programming for Problem Solving', 'ESC', 'INTEGRATED', 3, 0, 2, 0, 5, 4, 0, 100, 'YES', 'admin', 'admin'),
        (2, 'MA101', 1, 'Engineering Mathematics I', 'BSC', 'THEORY', 3, 1, 0, 0, 4, 4, 0, 100, 'YES', 'admin', 'admin'),
        (3, 'PH101', 1, 'Engineering Physics', 'BSC', 'INTEGRATED', 3, 0, 2, 0, 5, 4, 0, 100, 'YES', 'admin', 'admin'),
        (4, 'HS101', 1, 'Technical English', 'HSMC', 'THEORY', 2, 0, 0, 0, 2, 2, 0, 100, 'YES', 'admin', 'admin'),
        -- Semester 2: B.E CSE 2023-2027
        (5, 'CS202', 2, 'Object-Oriented Programming', 'PEC', 'INTEGRATED', 3, 0, 2, 0, 5, 4, 0, 100, 'YES', 'admin', 'admin'),
        (6, 'MA201', 2, 'Engineering Mathematics II', 'BSC', 'THEORY', 3, 1, 0, 0, 4, 4, 0, 100, 'YES', 'admin', 'admin'),
        (7, 'CS203', 2, 'Data Structures', 'PEC', 'INTEGRATED', 3, 0, 2, 0, 5, 4, 0, 100, 'YES', 'admin', 'admin'),
        (8, 'HS201', 2, 'Professional Communication', 'HSMC', 'THEORY', 2, 0, 0, 0, 2, 2, 0, 100, 'YES', 'admin', 'admin'),
        -- Semester 1: B.E ECE 2023-2027
        (9, 'EC101', 5, 'Electronic Devices', 'PEC', 'THEORY', 3, 0, 0, 0, 3, 3, 0, 100, 'YES', 'admin', 'admin'),
        (10, 'MA102', 5, 'Engineering Mathematics I', 'BSC', 'THEORY', 3, 1, 0, 0, 4, 4, 0, 100, 'YES', 'admin', 'admin'),
        -- Semester 1: B.Tech IT 2024-2028
        (11, 'IT101', 9, 'Programming in C', 'ESC', 'INTEGRATED', 3, 0, 2, 0, 5, 4, 0, 100, 'YES', 'admin', 'admin'),
        (12, 'MA103', 9, 'Engineering Mathematics I', 'BSC', 'THEORY', 3, 1, 0, 0, 4, 4, 0, 100, 'YES', 'admin', 'admin'),
        -- Semester 1: B.Tech AIDS 2025-2029
        (13, 'AI101', 11, 'Introduction to AI', 'PEC', 'THEORY', 3, 0, 0, 0, 3, 3, 0, 100, 'YES', 'admin', 'admin'),
        (14, 'MA104', 11, 'Engineering Mathematics I', 'BSC', 'THEORY', 3, 1, 0, 0, 4, 4, 0, 100, 'YES', 'admin', 'admin')
    `);

    // 5) SECTION
    await connection.execute(`
    INSERT IGNORE INTO Section (sectionId, courseCode, sectionName, isActive, createdBy, updatedBy)
    VALUES
        -- Sections for CS101 (Semester 1: B.E CSE 2023-2027)
        (1, 'CS101', 'Batch1', 'YES', 'admin', 'admin'),
        (2, 'CS101', 'Batch2', 'YES', 'admin', 'admin'),
        -- Sections for MA101 (Semester 1: B.E CSE 2023-2027)
        (3, 'MA101', 'Batch1', 'YES', 'admin', 'admin'),
        (4, 'MA101', 'Batch2', 'YES', 'admin', 'admin'),
        -- Sections for CS202 (Semester 2: B.E CSE 2023-2027)
        (5, 'CS202', 'Batch1', 'YES', 'admin', 'admin'),
        (6, 'CS202', 'Batch2', 'YES', 'admin', 'admin'),
        -- Sections for EC101 (Semester 1: B.E ECE 2023-2027)
        (7, 'EC101', 'Batch1', 'YES', 'admin', 'admin'),
        (8, 'EC101', 'Batch2', 'YES', 'admin', 'admin'),
        -- Sections for IT101 (Semester 1: B.Tech IT 2024-2028)
        (9, 'IT101', 'Batch1', 'YES', 'admin', 'admin'),
        (10, 'IT101', 'Batch2', 'YES', 'admin', 'admin'),
        -- Sections for AI101 (Semester 1: B.Tech AIDS 2025-2029)
        (11, 'AI101', 'Batch1', 'YES', 'admin', 'admin'),
        (12, 'AI101', 'Batch2', 'YES', 'admin', 'admin')
    `);

    // 6) STAFFCOURSE
    await connection.execute(`
      INSERT IGNORE INTO StaffCourse (staffCourseId, staffId, courseCode, sectionId, departmentId)
      VALUES
        -- CSE Staff Allocations
        (1, 'CSE001', 'CS101', 1, 1), -- Kalaiselvi -> CS101 Section A (CSE)
        (2, 'CSE002', 'CS101', 2, 1), -- VijayKumar -> CS101 Section B (CSE)
        (3, 'CSE003', 'MA101', 1, 1), -- Mohideen Pitchai -> MA101 Section A (CSE)
        (4, 'CSE004', 'MA101', 2, 1), -- ThamaraiSelvi -> MA101 Section B (CSE)
        (5, 'CSE005', 'CS202', 5, 1), -- Rajkumar -> CS202 Section A (CSE)
        (6, 'CSE006', 'CS202', 6, 1), -- M.Kanthimathi -> CS202 Section B (CSE)
        -- ECE Staff Allocations
        (7, 'ECE001', 'EC101', 7, 2), -- Shenbagavalli -> EC101 Section A (ECE)
        (8, 'ECE002', 'EC101', 8, 2), -- Arun -> EC101 Section B (ECE)
        -- IT Staff Allocations
        (9, 'IT001', 'IT101', 9, 4),  -- Paramasivan -> IT101 Section A (IT)
        (10, 'IT002', 'IT101', 10, 4), -- Muthukkumar -> IT101 Section B (IT)
        -- AIDS Staff Allocations
        (11, 'AIDS001', 'AI101', 11, 6), -- Naskath -> AI101 Section A (AIDS)
        (12, 'AIDS002', 'AI101', 12, 6)  -- Shenbagaraman -> AI101 Section B (AIDS)
    `);

    await connection.execute(`
        INSERT IGNORE INTO Student (rollnumber, name, batchId, semesterNumber, createdBy, updatedBy)
        VALUES
            ('CSE23A001', 'Ram', 1, 1, 'admin', 'admin'),
            ('CSE23A002', 'Shyam', 1, 1, 'admin', 'admin'),
            ('ECE23A001', 'Kiran', 2, 1, 'admin', 'admin');
    `);

// 6) StudentCourse - Seed data for student enrollments
      await connection.execute(`
        INSERT IGNORE INTO StudentCourse (studentCourseId, rollnumber, courseCode, sectionId)
        VALUES
            (1, 'CSE23A001', 'CS101', 1), -- Ram in CS101 Batch1
            (2, 'CSE23A002', 'CS101', 2); -- Shyam in CS101 Batch2
      `);

    await connection.commit();
    console.log('✅ Seed data inserted successfully');
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('❌ Error inserting seed data:', err);
  } finally {
    if (connection) await connection.end();
  }
})();