require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_hostel',
  waitForConnections: true,
  connectionLimit: 10
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const clean = (value) => typeof value === 'string' ? value.trim() : value;
const requireFields = (body, fields) => fields.filter((field) => !clean(body[field]));

function auth(requiredRole) {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ message: 'Authentication required.' });
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      if (requiredRole && req.user.role !== requiredRole) return res.status(403).json({ message: 'Admin access required.' });
      next();
    } catch {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
  };
}

app.get('/api/health', asyncRoute(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const body = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [key, clean(value)]));
  const missing = requireFields(body, ['name', 'email', 'password', 'phone']);
  if (missing.length) return res.status(400).json({ message: `Missing: ${missing.join(', ')}` });
  if (body.password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  if (!/^\S+@\S+\.\S+$/.test(body.email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [body.email]);
  if (existing.length) return res.status(409).json({ message: 'An account with this email already exists.' });
  const hash = await bcrypt.hash(body.password, 10);
  const [result] = await pool.query('INSERT INTO users (name,email,phone,password_hash,role,course,guardian_name) VALUES (?,?,?,?,"student",?,?)', [body.name, body.email, body.phone, hash, body.course || null, body.guardian_name || null]);
  res.status(201).json({ message: 'Registration successful.', id: result.insertId });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = clean(req.body.email);
  const password = req.body.password;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ message: 'Invalid email or password.' });
  const user = rows[0];
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.get('/api/dashboard', auth(), asyncRoute(async (req, res) => {
  const [[students]] = await pool.query('SELECT COUNT(*) total FROM users WHERE role="student"');
  const [[rooms]] = await pool.query('SELECT COUNT(*) total, SUM(status="occupied") occupied, SUM(status="available") available FROM rooms');
  const [[complaints]] = await pool.query('SELECT COUNT(*) total FROM complaints WHERE status != "resolved"');
  const [[payments]] = await pool.query('SELECT COALESCE(SUM(amount),0) total, COALESCE(SUM(status="pending" OR status="overdue"),0) pending FROM payments WHERE month = DATE_FORMAT(CURDATE(), "%Y-%m")');
  const [notices] = await pool.query('SELECT * FROM notices ORDER BY created_at DESC LIMIT 4');
  res.json({ stats: { students: students.total, rooms: rooms.total, occupied: rooms.occupied || 0, available: rooms.available || 0, complaints: complaints.total, payments: payments.total, pendingPayments: payments.pending }, notices });
}));

app.get('/api/students', auth(), asyncRoute(async (req, res) => {
  const search = `%${clean(req.query.search || '')}%`;
  const [rows] = await pool.query(`SELECT u.id,u.name,u.email,u.phone,u.course,u.guardian_name,u.created_at,r.room_number,
    COALESCE((SELECT status FROM payments p WHERE p.student_id=u.id ORDER BY month DESC LIMIT 1), 'pending') payment_status,
    COALESCE((SELECT COUNT(*) FROM complaints c WHERE c.student_id=u.id AND c.status != 'resolved'), 0) complaint_count
    FROM users u LEFT JOIN allocations a ON a.student_id=u.id AND a.active=1 LEFT JOIN rooms r ON r.id=a.room_id
    WHERE u.role='student' AND (u.name LIKE ? OR u.email LIKE ? OR u.course LIKE ?) ORDER BY u.created_at DESC`, [search, search, search]);
  res.json(rows);
}));

app.post('/api/students', auth('admin'), asyncRoute(async (req, res) => {
  const body = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [key, clean(value)]));
  const missing = requireFields(body, ['name', 'email', 'password', 'phone']);
  if (missing.length) return res.status(400).json({ message: `Missing: ${missing.join(', ')}` });
  const hash = await bcrypt.hash(body.password, 10);
  try {
    const [result] = await pool.query('INSERT INTO users (name,email,phone,password_hash,role,course,guardian_name) VALUES (?,?,?,?,"student",?,?)', [body.name, body.email, body.phone, hash, body.course || null, body.guardian_name || null]);
    res.status(201).json({ id: result.insertId });
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists.' }); throw error; }
}));

app.put('/api/students/:id', auth('admin'), asyncRoute(async (req, res) => {
  const { name, email, phone, course, guardian_name } = req.body;
  if (requireFields(req.body, ['name', 'email', 'phone']).length) return res.status(400).json({ message: 'Name, email, and phone are required.' });
  await pool.query('UPDATE users SET name=?,email=?,phone=?,course=?,guardian_name=? WHERE id=? AND role="student"', [clean(name), clean(email), clean(phone), clean(course) || null, clean(guardian_name) || null, req.params.id]);
  res.json({ message: 'Student updated.' });
}));

app.delete('/api/students/:id', auth('admin'), asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM users WHERE id=? AND role="student"', [req.params.id]);
  res.json({ message: 'Student removed.' });
}));

app.get('/api/rooms', auth(), asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`SELECT r.*, u.name student_name, u.id student_id FROM rooms r LEFT JOIN allocations a ON a.room_id=r.id AND a.active=1 LEFT JOIN users u ON u.id=a.student_id ORDER BY r.floor,r.room_number`);
  res.json(rows);
}));

app.post('/api/rooms', auth('admin'), asyncRoute(async (req, res) => {
  const { room_number, floor, capacity, rent, status } = req.body;
  if (requireFields(req.body, ['room_number', 'floor', 'capacity', 'rent']).length) return res.status(400).json({ message: 'Room number, floor, capacity, and rent are required.' });
  try { const [result] = await pool.query('INSERT INTO rooms (room_number,floor,capacity,rent,status) VALUES (?,?,?,?,?)', [clean(room_number), Number(floor), Number(capacity), Number(rent), status || 'available']); res.status(201).json({ id: result.insertId }); }
  catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Room number already exists.' }); throw error; }
}));

app.put('/api/rooms/:id', auth('admin'), asyncRoute(async (req, res) => {
  const { room_number, floor, capacity, rent, status } = req.body;
  await pool.query('UPDATE rooms SET room_number=?,floor=?,capacity=?,rent=?,status=? WHERE id=?', [clean(room_number), Number(floor), Number(capacity), Number(rent), status, req.params.id]);
  res.json({ message: 'Room updated.' });
}));

app.delete('/api/rooms/:id', auth('admin'), asyncRoute(async (req, res) => {
  const [[active]] = await pool.query('SELECT COUNT(*) total FROM allocations WHERE room_id=? AND active=1', [req.params.id]);
  if (active.total) return res.status(409).json({ message: 'Deallocate the room before removing it.' });
  await pool.query('DELETE FROM rooms WHERE id=?', [req.params.id]); res.json({ message: 'Room removed.' });
}));

app.post('/api/allocations', auth('admin'), asyncRoute(async (req, res) => {
  const { student_id, room_id } = req.body;
  if (!student_id || !room_id) return res.status(400).json({ message: 'Student and room are required.' });
  const connection = await pool.getConnection();
  try { await connection.beginTransaction();
    const [[room]] = await connection.query('SELECT * FROM rooms WHERE id=? FOR UPDATE', [room_id]);
    const [[current]] = await connection.query('SELECT id FROM allocations WHERE student_id=? AND active=1', [student_id]);
    if (!room || room.status !== 'available') throw Object.assign(new Error('Room is not available.'), { status: 409 });
    if (current) throw Object.assign(new Error('Student already has an active room.'), { status: 409 });
    await connection.query('INSERT INTO allocations (student_id,room_id,allocated_on) VALUES (?,?,CURDATE())', [student_id, room_id]);
    await connection.query('UPDATE rooms SET status="occupied" WHERE id=?', [room_id]); await connection.commit(); res.status(201).json({ message: 'Room allocated.' });
  } catch (error) { await connection.rollback(); res.status(error.status || 500).json({ message: error.message }); } finally { connection.release(); }
}));

app.get('/api/complaints', auth(), asyncRoute(async (req, res) => { const [rows] = await pool.query(`SELECT c.*,u.name student_name FROM complaints c JOIN users u ON u.id=c.student_id ${req.user.role === 'student' ? 'WHERE c.student_id=?' : ''} ORDER BY c.created_at DESC`, req.user.role === 'student' ? [req.user.id] : []); res.json(rows); }));
app.post('/api/complaints', auth(), asyncRoute(async (req, res) => { const { subject, description } = req.body; if (requireFields(req.body, ['subject', 'description']).length) return res.status(400).json({ message: 'Subject and description are required.' }); await pool.query('INSERT INTO complaints (student_id,subject,description) VALUES (?,?,?)', [req.user.id, clean(subject), clean(description)]); res.status(201).json({ message: 'Complaint submitted.' }); }));
app.put('/api/complaints/:id', auth('admin'), asyncRoute(async (req, res) => { if (!['open', 'in_progress', 'resolved'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid complaint status.' }); await pool.query('UPDATE complaints SET status=? WHERE id=?', [req.body.status, req.params.id]); res.json({ message: 'Complaint status updated.' }); }));

app.get('/api/payments', auth(), asyncRoute(async (req, res) => { const [rows] = await pool.query(`SELECT p.*,u.name student_name FROM payments p JOIN users u ON u.id=p.student_id ${req.user.role === 'student' ? 'WHERE p.student_id=?' : ''} ORDER BY p.month DESC,p.status`, req.user.role === 'student' ? [req.user.id] : []); res.json(rows); }));
app.put('/api/payments/:id', auth('admin'), asyncRoute(async (req, res) => { if (!['paid', 'pending', 'overdue'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid payment status.' }); await pool.query('UPDATE payments SET status=?,paid_on=IF(?="paid",CURDATE(),NULL) WHERE id=?', [req.body.status, req.body.status, req.params.id]); res.json({ message: 'Payment updated.' }); }));

app.get('/api/attendance', auth(), asyncRoute(async (req, res) => { const [rows] = await pool.query(`SELECT a.*,u.name student_name FROM attendance a JOIN users u ON u.id=a.student_id WHERE a.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ${req.user.role === 'student' ? 'AND a.student_id=?' : ''} ORDER BY a.attendance_date DESC`, req.user.role === 'student' ? [req.user.id] : []); res.json(rows); }));
app.post('/api/attendance', auth('admin'), asyncRoute(async (req, res) => { const { student_id, attendance_date, status } = req.body; if (!student_id || !attendance_date || !['present', 'absent', 'late'].includes(status)) return res.status(400).json({ message: 'Student, date, and valid status are required.' }); await pool.query('INSERT INTO attendance (student_id,attendance_date,status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)', [student_id, attendance_date, status]); res.status(201).json({ message: 'Attendance saved.' }); }));

app.get('/api/notices', auth(), asyncRoute(async (req, res) => { const [rows] = await pool.query('SELECT * FROM notices ORDER BY created_at DESC'); res.json(rows); }));
app.post('/api/notices', auth('admin'), asyncRoute(async (req, res) => { const { title, content, priority } = req.body; if (requireFields(req.body, ['title', 'content']).length) return res.status(400).json({ message: 'Title and content are required.' }); await pool.query('INSERT INTO notices (title,content,priority) VALUES (?,?,?)', [clean(title), clean(content), priority || 'normal']); res.status(201).json({ message: 'Notice published.' }); }));
app.delete('/api/notices/:id', auth('admin'), asyncRoute(async (req, res) => { await pool.query('DELETE FROM notices WHERE id=?', [req.params.id]); res.json({ message: 'Notice removed.' }); }));

app.use((error, req, res, next) => { console.error(error); res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: 'Something went wrong on the server.' }); });
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

async function start() {
  // Keep the documented demo account usable after importing the schema.
  const demoHash = await bcrypt.hash('admin123', 10);
  await pool.query('UPDATE users SET password_hash=? WHERE email=? AND role="admin"', [demoHash, 'admin@staywise.local']);
  app.listen(port, () => console.log(`Staywise server running at http://localhost:${port}`));
}

start().catch((error) => {
  console.error('Unable to start Staywise:', error.message);
  process.exit(1);
});
