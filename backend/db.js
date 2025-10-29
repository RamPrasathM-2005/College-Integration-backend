import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load config.env only if it exists (Railway uses env vars directly)
try {
  dotenv.config({ path: './config.env' });
} catch (err) {
  // Ignore if file not found
}

// === DATABASE CONFIG FROM RAILWAY ===
const dbConfig = {
  host: process.env.DB_HOST,           // ${{MySQL.MYSQLHOST}}
  port: parseInt(process.env.DB_PORT), // ${{MySQL.MYSQLPORT}}
  user: process.env.DB_USER,           // ${{MySQL.MYSQLUSER}}
  password: process.env.DB_PASS,       // ${{MySQL.MYSQLPASSWORD}}
  database: process.env.DB_NAME,       // ${{MySQL.MYSQLDATABASE}}
};

// === CREATE CONNECTION POOL ===
export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4',
  connectTimeout: 15000,
  acquireTimeout: 15000,
  timeout: 15000,
});

// === BRANCH MAPPING ===
export const branchMap = {
  'CSE': { Deptid: 1, Deptname: 'Computer Science Engineering' },
  'IT': { Deptid: 4, Deptname: 'Information Technology' },
  'ECE': { Deptid: 2, Deptname: 'Electronics & Communication' },
  'MECH': { Deptid: 3, Deptname: 'Mechanical Engineering' },
  'CIVIL': { Deptid: 7, Deptname: 'Civil Engineering' },
  'EEE': { Deptid: 5, Deptname: 'Electrical Engineering' },
};

// === INITIALIZE DATABASE & TABLES ===
const initDatabase = async () => {
  let connection;
  try {
    console.log('Connecting to Railway MySQL...');

    // 1. Create database if not exists
    const admin = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });
    await admin.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await admin.end();

    // 2. Connect to actual DB
    connection = await pool.getConnection();
    await connection.beginTransaction();
    console.log('Database connection established');

    // === ALL TABLES BELOW (EXACTLY AS YOU HAD) ===

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS department (
        Deptid INT PRIMARY KEY,
        Deptname VARCHAR(100) NOT NULL,
        Deptacronym VARCHAR(10) NOT NULL
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Regulation (
        regulationId INT PRIMARY KEY AUTO_INCREMENT,
        Deptid INT NOT NULL,
        regulationYear INT NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_regulation_dept FOREIGN KEY (Deptid) REFERENCES department(Deptid) ON DELETE RESTRICT,
        UNIQUE (Deptid, regulationYear)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        Userid INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('Student', 'Staff', 'Admin') NOT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        staffId INT UNIQUE,
        Deptid INT NOT NULL,
        image VARCHAR(500) DEFAULT '/Uploads/default.jpg',
        resetPasswordToken VARCHAR(255),
        resetPasswordExpires DATETIME,
        skillrackProfile VARCHAR(255),
        Created_by INT,
        Updated_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_department FOREIGN KEY (Deptid) REFERENCES department(Deptid) ON DELETE RESTRICT,
        CONSTRAINT fk_user_createdby FOREIGN KEY (Created_by) REFERENCES users(Userid) ON DELETE SET NULL,
        CONSTRAINT fk_user_updatedby FOREIGN KEY (Updated_by) REFERENCES users(Userid) ON DELETE SET NULL
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS student_details (
        id INT PRIMARY KEY AUTO_INCREMENT,
        Userid INT NOT NULL,
        regno VARCHAR(50) UNIQUE NOT NULL,
        Deptid INT NOT NULL,
        batch INT,
        Semester VARCHAR(255),
        staffId INT,
        Created_by INT,
        Updated_by INT,
        date_of_joining DATE,
        date_of_birth DATE,
        blood_group ENUM('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'),
        tutorEmail VARCHAR(255),
        personal_email VARCHAR(255),
        first_graduate ENUM('Yes', 'No'),
        aadhar_card_no VARCHAR(12) UNIQUE,
        student_type ENUM('Day-Scholar', 'Hosteller'),
        mother_tongue VARCHAR(255),
        identification_mark VARCHAR(255),
        extracurricularID INT,
        religion ENUM('Hindu', 'Muslim', 'Christian', 'Others'),
        caste VARCHAR(255),
        community ENUM('General', 'OBC', 'SC', 'ST', 'Others'),
        gender ENUM('Male', 'Female', 'Transgender'),
        seat_type ENUM('Counselling', 'Management'),
        section VARCHAR(255),
        door_no VARCHAR(255),
        street VARCHAR(255),
        cityID INT,
        districtID INT,
        stateID INT,
        countryID INT,
        pincode VARCHAR(6),
        personal_phone VARCHAR(10),
        pending BOOLEAN DEFAULT TRUE,
        tutor_approval_status BOOLEAN DEFAULT FALSE,
        Approved_by INT,
        approved_at DATETIME,
        messages JSON,
        skillrackProfile VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_student_details_user FOREIGN KEY (Userid) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_student_details_dept FOREIGN KEY (Deptid) REFERENCES department(Deptid)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_student_details_tutor FOREIGN KEY (staffId) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT fk_student_details_created FOREIGN KEY (Created_by) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT fk_student_details_updated FOREIGN KEY (Updated_by) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT fk_student_details_approved FOREIGN KEY (Approved_by) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Batch (
        batchId INT PRIMARY KEY AUTO_INCREMENT,
        degree VARCHAR(50) NOT NULL,
        branch VARCHAR(100) NOT NULL,
        batch VARCHAR(4) NOT NULL,
        batchYears VARCHAR(20) NOT NULL,
        regulationId INT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_batch (degree, branch, batch),
        CONSTRAINT fk_batch_regulation FOREIGN KEY (regulationId) REFERENCES Regulation(regulationId) ON DELETE SET NULL
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Semester (
        semesterId INT PRIMARY KEY AUTO_INCREMENT,
        batchId INT NOT NULL,
        semesterNumber INT NOT NULL CHECK (semesterNumber BETWEEN 1 AND 8),
        startDate DATE NOT NULL,
        endDate DATE NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sem_batch FOREIGN KEY (batchId) REFERENCES Batch(batchId)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        UNIQUE (batchId, semesterNumber)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Course (
        courseId INT PRIMARY KEY AUTO_INCREMENT,
        courseCode VARCHAR(20) NOT NULL,
        semesterId INT NOT NULL,
        courseTitle VARCHAR(255) NOT NULL,
        category ENUM('HSMC','BSC','ESC','PEC','OEC','EEC','PCC') NOT NULL,
        type ENUM('THEORY','INTEGRATED','PRACTICAL','EXPERIENTIAL LEARNING') NOT NULL,
        lectureHours INT DEFAULT 0,
        tutorialHours INT DEFAULT 0,
        practicalHours INT DEFAULT 0,
        experientialHours INT DEFAULT 0,
        totalContactPeriods INT NOT NULL,
        credits INT NOT NULL,
        minMark INT NOT NULL,
        maxMark INT NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(100),
        updatedBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_course_sem FOREIGN KEY (semesterId) REFERENCES Semester(semesterId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        UNIQUE (courseCode, semesterId)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS RegulationCourse (
        regCourseId INT PRIMARY KEY AUTO_INCREMENT,
        regulationId INT NOT NULL,
        semesterNumber INT NOT NULL CHECK (semesterNumber BETWEEN 1 AND 8),
        courseCode VARCHAR(20) NOT NULL,
        courseTitle VARCHAR(255) NOT NULL,
        category ENUM('HSMC','BSC','ESC','PEC','OEC','EEC','PCC') NOT NULL,
        type ENUM('THEORY','INTEGRATED','PRACTICAL','EXPERIENTIAL LEARNING') NOT NULL,
        lectureHours INT DEFAULT 0,
        tutorialHours INT DEFAULT 0,
        practicalHours INT DEFAULT 0,
        experientialHours INT DEFAULT 0,
        totalContactPeriods INT NOT NULL,
        credits INT NOT NULL,
        minMark INT NOT NULL,
        maxMark INT NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(100),
        updatedBy VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (regulationId, courseCode, semesterNumber),
        CONSTRAINT fk_regcourse_reg FOREIGN KEY (regulationId) REFERENCES Regulation(regulationId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Vertical (
        verticalId INT PRIMARY KEY AUTO_INCREMENT,
        regulationId INT NOT NULL,
        verticalName VARCHAR(100) NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_vertical_regulation FOREIGN KEY (regulationId) REFERENCES Regulation(regulationId) ON DELETE CASCADE,
        UNIQUE (regulationId, verticalName)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS VerticalCourse (
        verticalCourseId INT PRIMARY KEY AUTO_INCREMENT,
        verticalId INT NOT NULL,
        regCourseId INT NOT NULL,
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_vc_vertical FOREIGN KEY (verticalId) REFERENCES Vertical(verticalId) ON DELETE CASCADE,
        CONSTRAINT fk_vc_regcourse FOREIGN KEY (regCourseId) REFERENCES RegulationCourse(regCourseId) ON DELETE CASCADE,
        UNIQUE (verticalId, regCourseId)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Section (
        sectionId INT PRIMARY KEY AUTO_INCREMENT,
        courseId INT NOT NULL,
        sectionName VARCHAR(10) NOT NULL,
        capacity INT NOT NULL DEFAULT 40 CHECK (capacity > 0),
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_section_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        UNIQUE (courseId, sectionName)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS StudentCourse (
        studentCourseId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        courseId INT NOT NULL,
        sectionId INT NOT NULL,
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (regno, courseId, sectionId),
        CONSTRAINT fk_sc_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_sc_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_sc_section FOREIGN KEY (sectionId) REFERENCES Section(sectionId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS StaffCourse (
        staffCourseId INT PRIMARY KEY AUTO_INCREMENT,
        Userid INT NOT NULL,
        courseId INT NOT NULL,
        sectionId INT NOT NULL,
        Deptid INT NOT NULL,
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (Userid, courseId, sectionId, Deptid),
        CONSTRAINT fk_stc_staff FOREIGN KEY (Userid) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_stc_dept FOREIGN KEY (Deptid) REFERENCES department(Deptid)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_stc_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_stc_section FOREIGN KEY (sectionId) REFERENCES Section(sectionId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS CourseOutcome (
        coId INT PRIMARY KEY AUTO_INCREMENT,
        courseId INT NOT NULL,
        coNumber VARCHAR(10) NOT NULL,
        UNIQUE (courseId, coNumber),
        CONSTRAINT fk_co_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS COTool (
        toolId INT PRIMARY KEY AUTO_INCREMENT,
        coId INT NOT NULL,
        toolName VARCHAR(100) NOT NULL,
        weightage INT NOT NULL CHECK (weightage BETWEEN 0 AND 100),
        UNIQUE (coId, toolName),
        CONSTRAINT fk_tool_co FOREIGN KEY (coId) REFERENCES CourseOutcome(coId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS StudentCOTool (
        studentToolId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        toolId INT NOT NULL,
        marksObtained INT NOT NULL CHECK (marksObtained >= 0),
        UNIQUE (regno, toolId),
        CONSTRAINT fk_sct_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_sct_tool FOREIGN KEY (toolId) REFERENCES COTool(toolId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Timetable (
        timetableId INT PRIMARY KEY AUTO_INCREMENT,
        courseId INT NOT NULL,
        sectionId INT NULL,
        dayOfWeek ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
        periodNumber INT NOT NULL CHECK (periodNumber BETWEEN 1 AND 8),
        Deptid INT NOT NULL,
        semesterId INT NOT NULL,
        isActive ENUM('YES','NO') DEFAULT 'YES',
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_tt_dept FOREIGN KEY (Deptid) REFERENCES department(Deptid)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_tt_sem FOREIGN KEY (semesterId) REFERENCES Semester(semesterId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_tt_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_tt_section FOREIGN KEY (sectionId) REFERENCES Section(sectionId)
            ON UPDATE CASCADE ON DELETE SET NULL,
        UNIQUE (semesterId, dayOfWeek, periodNumber)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS DayAttendance (
        dayAttendanceId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        semesterNumber INT NOT NULL CHECK (semesterNumber BETWEEN 1 AND 8),
        attendanceDate DATE NOT NULL,
        status ENUM('P','A') NOT NULL,
        UNIQUE (regno, attendanceDate),
        CONSTRAINT fk_da_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS PeriodAttendance (
        periodAttendanceId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        staffId INT NOT NULL,
        courseId INT NOT NULL,
        sectionId INT NOT NULL,
        semesterNumber INT NOT NULL CHECK (semesterNumber BETWEEN 1 AND 8),
        dayOfWeek ENUM('MON','TUE','WED','THU','FRI','SAT') NOT NULL,
        periodNumber INT NOT NULL CHECK (periodNumber BETWEEN 1 AND 8),
        attendanceDate DATE NOT NULL,
        status ENUM('P','A','OD') NOT NULL,
        Deptid INT NOT NULL,
        updatedBy VARCHAR(150) NOT NULL,
        UNIQUE (regno, courseId, sectionId, attendanceDate, periodNumber),
        CONSTRAINT fk_pa_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_pa_staff FOREIGN KEY (staffId) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_pa_dept FOREIGN KEY (Deptid) REFERENCES department(Deptid)
            ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_pa_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_pa_section FOREIGN KEY (sectionId) REFERENCES Section(sectionId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS CoursePartitions (
        partitionId INT PRIMARY KEY AUTO_INCREMENT,
        courseId INT NOT NULL UNIQUE,
        theoryCount INT DEFAULT 0,
        practicalCount INT DEFAULT 0,
        experientialCount INT DEFAULT 0,
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_partition_course FOREIGN KEY (courseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS COType (
        coTypeId INT PRIMARY KEY AUTO_INCREMENT,
        coId INT NOT NULL UNIQUE,
        coType ENUM('THEORY', 'PRACTICAL', 'EXPERIENTIAL') NOT NULL,
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_cotype_co FOREIGN KEY (coId) REFERENCES CourseOutcome(coId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ToolDetails (
        toolDetailId INT PRIMARY KEY AUTO_INCREMENT,
        toolId INT NOT NULL UNIQUE,
        maxMarks INT NOT NULL CHECK (maxMarks > 0),
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_tooldetail_tool FOREIGN KEY (toolId) REFERENCES COTool(toolId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ElectiveBucket (
        bucketId INT PRIMARY KEY AUTO_INCREMENT,
        semesterId INT NOT NULL,
        bucketNumber INT NOT NULL,
        bucketName VARCHAR(100) NOT NULL,
        createdBy INT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (semesterId, bucketNumber),
        CONSTRAINT fk_bucket_sem FOREIGN KEY (semesterId) REFERENCES Semester(semesterId) ON DELETE CASCADE,
        CONSTRAINT fk_bucket_created FOREIGN KEY (createdBy) REFERENCES users(Userid) ON DELETE SET NULL
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ElectiveBucketCourse (
        id INT PRIMARY KEY AUTO_INCREMENT,
        bucketId INT NOT NULL,
        courseId INT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (bucketId, courseId),
        CONSTRAINT fk_ebc_bucket FOREIGN KEY (bucketId) REFERENCES ElectiveBucket(bucketId) ON DELETE CASCADE,
        CONSTRAINT fk_ebc_course FOREIGN KEY (courseId) REFERENCES Course(courseId) ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS StudentCOMarks (
        studentCoMarkId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        coId INT NOT NULL,
        consolidatedMark DECIMAL(5,2) NOT NULL CHECK (consolidatedMark >= 0 AND consolidatedMark <= 100),
        createdBy VARCHAR(150),
        updatedBy VARCHAR(150),
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (regno, coId),
        CONSTRAINT fk_scm_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_scm_co FOREIGN KEY (coId) REFERENCES CourseOutcome(coId)
            ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS StudentElectiveSelection (
        selectionId INT PRIMARY KEY AUTO_INCREMENT,
        regno VARCHAR(50) NOT NULL,
        bucketId INT NOT NULL,
        selectedCourseId INT NOT NULL,
        status ENUM('pending', 'allocated', 'rejected') DEFAULT 'pending',
        createdBy INT,
        updatedBy INT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE (regno, bucketId),
        CONSTRAINT fk_ses_student FOREIGN KEY (regno) REFERENCES student_details(regno)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_ses_bucket FOREIGN KEY (bucketId) REFERENCES ElectiveBucket(bucketId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_ses_course FOREIGN KEY (selectedCourseId) REFERENCES Course(courseId)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_ses_created FOREIGN KEY (createdBy) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT fk_ses_updated FOREIGN KEY (updatedBy) REFERENCES users(Userid)
            ON UPDATE CASCADE ON DELETE SET NULL
      )
    `);

    // Insert initial departments
    await connection.execute(`
      INSERT IGNORE INTO department (Deptid, Deptname, Deptacronym)
      VALUES
      (1, 'Computer Science Engineering', 'CSE'),
      (2, 'Electronics & Communication', 'ECE'),
      (3, 'Mechanical Engineering', 'MECH'),
      (4, 'Information Technology', 'IT'),
      (5, 'Electrical Engineering', 'EEE'),
      (6, 'Artificial Intelligence and Data Science', 'AIDS'),
      (7, 'Civil Engineering', 'CIVIL')
    `);

    // Insert default regulations and verticals
    const [departments] = await connection.execute('SELECT Deptid FROM department');
    const deptIds = departments.map(row => row.Deptid);
    const regulationYears = [2023, 2019, 2015];
    const defaultVerticals = ['AI', 'Data Science', 'Cybersecurity', 'Cloud Computing'];

    for (const deptId of deptIds) {
      for (const year of regulationYears) {
        const [regResult] = await connection.execute(
          `INSERT IGNORE INTO Regulation (Deptid, regulationYear, createdBy, updatedBy)
           VALUES (?, ?, 'admin', 'admin')`,
          [deptId, year]
        );
        const regulationId = regResult.insertId;

        if (regulationId) {
          for (const verticalName of defaultVerticals) {
            await connection.execute(
              `INSERT IGNORE INTO Vertical (regulationId, verticalName, createdBy, updatedBy)
               VALUES (?, ?, 'admin', 'admin')`,
              [regulationId, verticalName]
            );
          }
        }
      }
    }

    await connection.commit();
    console.log('Database initialized with all tables and default data');

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('DB Initialization Failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
};

// Run on startup
initDatabase();

export default pool;

// === YOUR FUNCTION ===
export const getCourseWiseAttendance = async ({
  deptId,
  batch,
  semesterId,
  fromDate,
  toDate,
}) => {
  try {
    const [students] = await pool.execute(
      `SELECT s.regno AS RegisterNumber, u.username AS StudentName
       FROM student_details s
       JOIN users u ON s.Userid = u.Userid
       WHERE s.batch = ? AND s.Deptid = ? AND u.status = 'active'`,
      [batch, deptId]
    );

    if (!students.length) return { success: true, report: [] };

    const [attendanceRows] = await pool.execute(
      `SELECT a.regno, c.courseCode AS CourseCode,
              COUNT(*) AS ConductedPeriods,
              SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) AS AttendedPeriods
       FROM PeriodAttendance a
       JOIN Course c ON a.courseId = c.courseId
       JOIN student_details s ON a.regno = s.regno
       WHERE s.batch = ? AND s.Deptid = ? AND c.semesterId = ?
         AND a.attendanceDate BETWEEN ? AND ?
         AND c.isActive = 'YES'
       GROUP BY a.regno, c.courseCode`,
      [batch, deptId, semesterId, fromDate, toDate]
    );

    const studentMap = {};
    students.forEach((s) => {
      studentMap[s.RegisterNumber] = { ...s, Courses: {} };
    });

    attendanceRows.forEach((row) => {
      if (studentMap[row.regno]) {
        studentMap[row.regno].Courses[row.CourseCode] = {
          CourseCode: row.CourseCode,
          ConductedPeriods: row.ConductedPeriods,
          AttendedPeriods: row.AttendedPeriods,
        };
      }
    });

    return { success: true, report: Object.values(studentMap) };
  } catch (error) {
    console.error('Error in getCourseWiseAttendance:', error);
    return { success: false, error: error.message };
  }
};