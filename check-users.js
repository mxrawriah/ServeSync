const sqlite3 = require('sqlite3').verbose();

// Open the database
const db = new sqlite3.Database('./servesync.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to SQLite database.');
});

// Query all users
db.all(`SELECT id, email, role, first_name, last_name, handle, created_at FROM users`, [], (err, rows) => {
  if (err) {
    console.error('Error querying users:', err.message);
    return;
  }

  console.log('\n=== USERS IN DATABASE ===');
  if (rows.length === 0) {
    console.log('No users found in database.');
  } else {
    rows.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.first_name} ${user.last_name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Handle: ${user.handle}`);
      console.log(`Created: ${user.created_at}`);
      console.log('---');
    });
  }

  // Close the database
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
});