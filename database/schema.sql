CREATE DATABASE IF NOT EXISTS smart_hostel;
USE smart_hostel;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','student') NOT NULL DEFAULT 'student',
  course VARCHAR(100),
  guardian_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  room_number VARCHAR(20) NOT NULL UNIQUE,
  floor INT NOT NULL DEFAULT 1,
  capacity INT NOT NULL DEFAULT 2,
  rent DECIMAL(10,2) NOT NULL DEFAULT 5000,
  status ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS allocations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  room_id INT NOT NULL,
  allocated_on DATE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE KEY one_active_room (student_id, active),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  month VARCHAR(7) NOT NULL,
  status ENUM('paid','pending','overdue') NOT NULL DEFAULT 'pending',
  paid_on DATE NULL,
  UNIQUE KEY student_month (student_id, month),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late') NOT NULL DEFAULT 'present',
  UNIQUE KEY student_date (student_id, attendance_date),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaints (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  subject VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  priority ENUM('normal','important') NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO users (id, name, email, phone, password_hash, role, course, guardian_name) VALUES
(1, 'System Administrator', 'admin@staywise.local', '9000000000', '$2a$10$wH6u9Xy0JdO5tF0r9qU4teV7G5kqV5cM9vH9O1Q8D8M6rjZV2pQ7K', 'admin', NULL, NULL),
(2, 'Alex Morgan', 'alex@example.com', '9000000001', '$2a$10$wH6u9Xy0JdO5tF0r9qU4teV7G5kqV5cM9vH9O1Q8D8M6rjZV2pQ7K', 'student', 'Computer Science', 'Taylor Morgan'),
(3, 'Priya Nair', 'priya@example.com', '9000000002', '$2a$10$wH6u9Xy0JdO5tF0r9qU4teV7G5kqV5cM9vH9O1Q8D8M6rjZV2pQ7K', 'student', 'Business Administration', 'Sam Nair'),
(4, 'Jordan Lee', 'jordan@example.com', '9000000003', '$2a$10$wH6u9Xy0JdO5tF0r9qU4teV7G5kqV5cM9vH9O1Q8D8M6rjZV2pQ7K', 'student', 'Mechanical Engineering', 'Morgan Lee');

INSERT IGNORE INTO rooms (id, room_number, floor, capacity, rent, status) VALUES
(1, 'A-101', 1, 2, 6500, 'occupied'), (2, 'A-102', 1, 2, 6500, 'occupied'),
(3, 'B-201', 2, 3, 5500, 'available'), (4, 'B-202', 2, 3, 5500, 'available'),
(5, 'C-301', 3, 1, 8000, 'maintenance');

INSERT IGNORE INTO allocations (student_id, room_id, allocated_on) VALUES (2, 1, '2026-01-05'), (3, 2, '2026-02-01');
INSERT IGNORE INTO payments (student_id, amount, month, status, paid_on) VALUES
(2, 6500, '2026-09', 'paid', '2026-09-03'), (3, 6500, '2026-09', 'pending', NULL), (4, 5500, '2026-09', 'overdue', NULL);
INSERT IGNORE INTO complaints (student_id, subject, description, status) VALUES
(3, 'Water cooler issue', 'The second-floor water cooler needs servicing.', 'open'),
(2, 'Wi-Fi connectivity', 'Wi-Fi drops frequently in the evening.', 'in_progress');
INSERT IGNORE INTO notices (title, content, priority) VALUES
('Welcome to Staywise', 'Monthly rent is due by the 5th of every month.', 'important'),
('Weekend maintenance', 'Common area cleaning will take place this Saturday at 10:00 AM.', 'normal');
