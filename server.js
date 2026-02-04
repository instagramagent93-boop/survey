const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Create directories if they don't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

if (!fs.existsSync('admin')) {
    fs.mkdirSync('admin', { recursive: true });
}

// File upload setup
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Database setup
const db = new Database('./rental_assistance.db');

// Create table with correct column count
db.prepare(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    dob TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    mothers_maiden_name TEXT NOT NULL,
    mothers_full_name TEXT NOT NULL,
    fathers_full_name TEXT NOT NULL,
    place_of_birth TEXT NOT NULL,
    city_of_birth TEXT NOT NULL,
    city TEXT NOT NULL,
    ssn TEXT NOT NULL,
    past_due_rent REAL NOT NULL,
    applied_before TEXT NOT NULL,
    receiving_ss TEXT NOT NULL,
    verified_idme TEXT NOT NULL,
    dl_front TEXT,
    dl_back TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

console.log('✅ Database and table ready');

// Public Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/survey', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

app.get('/confirmation', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'confirmation.html'));
});

app.get('/name.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'name.html'));
});

// ADMIN LOGIN PAGE
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Submit application - FIXED SQL INSERT
app.post('/submit', upload.fields([{ name: 'dl_front' }, { name: 'dl_back' }]), (req, res) => {
    try {
        console.log('📝 Submission received');
        console.log('Body:', req.body);
        console.log('Files:', req.files);
        
        const data = req.body;

        // Validate required fields
        const requiredFields = [
            'full_name', 'phone', 'email', 'dob', 'gender', 'age',
            'mothers_maiden_name', 'mothers_full_name', 'fathers_full_name',
            'place_of_birth', 'city_of_birth', 'city', 'ssn',
            'past_due_rent', 'applied_before', 'receiving_ss', 'verified_idme'
        ];

        const missingFields = requiredFields.filter(field => !data[field] || data[field].toString().trim() === '');
        
        if (missingFields.length > 0) {
            console.log('❌ Missing fields:', missingFields);
            return res.status(400).json({ 
                success: false, 
                error: `Missing required fields: ${missingFields.join(', ')}` 
            });
        }

        // Prepare SQL statement with correct number of values (19 columns)
        const stmt = db.prepare(`INSERT INTO applications (
            full_name, phone, email, dob, gender, age,
            mothers_maiden_name, mothers_full_name, fathers_full_name,
            place_of_birth, city_of_birth, city, ssn,
            past_due_rent, applied_before, receiving_ss, verified_idme,
            dl_front, dl_back, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        // Execute insertion with 20 values (19 columns + id auto)
        const info = stmt.run(
            data.full_name.trim(),
            data.phone.trim(),
            data.email.trim().toLowerCase(),
            data.dob,
            data.gender,
            parseInt(data.age),
            data.mothers_maiden_name.trim(),
            data.mothers_full_name.trim(),
            data.fathers_full_name.trim(),
            data.place_of_birth.trim(),
            data.city_of_birth.trim(),
            data.city.trim(),
            data.ssn.trim(),
            parseFloat(data.past_due_rent),
            data.applied_before,
            data.receiving_ss,
            data.verified_idme,
            req.files?.dl_front ? req.files.dl_front[0].filename : null,
            req.files?.dl_back ? req.files.dl_back[0].filename : null,
            new Date().toISOString() // submitted_at
        );

        console.log('✅ Application saved successfully. ID:', info.lastInsertRowid);
        
        res.json({ 
            success: true, 
            message: 'Application submitted successfully', 
            applicationId: info.lastInsertRowid,
            redirect: '/confirmation.html'
        });

    } catch (error) {
        console.error('❌ Submission error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// ===== ADMIN ROUTES =====
const ADMIN_PASSWORD = 'admin123';

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
    const password = req.query.password || req.headers['x-admin-password'];
    
    if (req.path === '/admin-login') {
        return next();
    }
    
    if (password === ADMIN_PASSWORD) {
        return next();
    }
    
    res.redirect('/admin-login');
};

// Admin dashboard
app.get('/admin', requireAdmin, (req, res) => {
    const password = req.query.password;
    
    if (password !== ADMIN_PASSWORD) {
        return res.redirect('/admin-login');
    }
    
    const dashboardPath = path.join(__dirname, 'admin', 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        return res.sendFile(dashboardPath);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard</title>
        </head>
        <body>
            <h1>Admin Dashboard</h1>
            <div id="applications"></div>
        </body>
        </html>
    `);
});

// Admin API routes
app.get('/api/admin/applications', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM applications ORDER BY submitted_at DESC').all();
    res.json(rows);
});

app.get('/api/admin/applications/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Application not found' });
    res.json(row);
});

app.get('/api/admin/search', requireAdmin, (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const searchPattern = `%${q}%`;
    const rows = db.prepare(`SELECT * FROM applications 
                             WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR ssn LIKE ? 
                             OR city LIKE ? OR mothers_full_name LIKE ? OR fathers_full_name LIKE ? 
                             OR city_of_birth LIKE ? ORDER BY submitted_at DESC`).all(
        searchPattern, searchPattern, searchPattern, searchPattern, 
        searchPattern, searchPattern, searchPattern, searchPattern
    );
    res.json(rows);
});

app.delete('/api/admin/applications/:id', requireAdmin, (req, res) => {
    const info = db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Application not found' });
    res.json({ success: true, message: 'Application deleted' });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const row = db.prepare(`
        SELECT 
            COUNT(*) as total_applications,
            SUM(past_due_rent) as total_rent_owed,
            AVG(past_due_rent) as avg_rent_owed,
            COUNT(CASE WHEN receiving_ss = 'Yes' THEN 1 END) as receiving_social_security
        FROM applications
    `).get();
    res.json(row);
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Something went wrong'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Server running on http://localhost:${PORT}
🔐 Admin login: http://localhost:${PORT}/admin-login
📊 Dashboard: http://localhost:${PORT}/admin?password=${ADMIN_PASSWORD}
📁 Uploads: http://localhost:${PORT}/uploads
📊 Database: rental_assistance.db
`);
});