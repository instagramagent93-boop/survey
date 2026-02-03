const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Delete old database file if exists
if (fs.existsSync('./rental_assistance.db')) {
    fs.unlinkSync('./rental_assistance.db');
    console.log('✅ Old database deleted');
}

// Create new database
const db = new sqlite3.Database('./rental_assistance.db');

// Create table with correct schema
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
        ssn TEXT NOT NULL,  -- Store plain SSN for admin
        past_due_rent REAL NOT NULL,
        applied_before TEXT NOT NULL,
        receiving_ss TEXT NOT NULL,
        verified_idme TEXT NOT NULL,
        dl_front TEXT,
        dl_back TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('❌ Error creating table:', err);
        } else {
            console.log('✅ Table created successfully');
        }
    });
});

db.close();
console.log('✅ Database reset complete');