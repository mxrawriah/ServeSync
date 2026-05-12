const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(session({
  secret: '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', // Change this in production
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('.')); // Serve static files from current directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'servesync (3).html'));
});

// Database setup
const db = new sqlite3.Database('./servesync.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    createTables();
  }
});

// Create tables
function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    provider TEXT DEFAULT 'local',
    google_id TEXT,
    role TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    handle TEXT,
    phone TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrate existing users table to allow nullable password if needed
  db.get(`PRAGMA table_info(users)`, (err, row) => {
    if (!err) {
      db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (!err) {
          const passwordCol = columns.find(c => c.name === 'password');
          if (passwordCol && passwordCol.notnull === 1) {
            console.log('Migrating users table to allow nullable password');
            db.serialize(() => {
              db.run(`CREATE TABLE IF NOT EXISTS users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT,
                provider TEXT DEFAULT 'local',
                google_id TEXT,
                role TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                handle TEXT,
                phone TEXT,
                bio TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`);
              db.run(`INSERT INTO users_new (id, email, password, provider, google_id, role, first_name, last_name, handle, phone, bio, created_at)
                      SELECT id, email, password, provider, google_id, role, first_name, last_name, handle, phone, bio, created_at FROM users`);
              db.run(`DROP TABLE users`);
              db.run(`ALTER TABLE users_new RENAME TO users`);
            });
          }
        }
      });
    }
  });

  // Add columns if they don't exist (for existing databases)
  db.run(`ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'local'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error('Alter provider:', err);
  });
  db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error('Alter google_id:', err);
  });

  db.run(`CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT,
    role TEXT,
    status TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT,
    role TEXT,
    status TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leader_id INTEGER,
    member_id INTEGER,
    member_name TEXT,
    date TEXT,
    role TEXT,
    FOREIGN KEY (leader_id) REFERENCES users (id),
    FOREIGN KEY (member_id) REFERENCES users (id)
  )`);
}

function buildUserPayload(userRow, availability, schedule, roster = []) {
  return {
    id: userRow.id,
    name: `${userRow.first_name} ${userRow.last_name}`,
    handle: userRow.handle,
    email: userRow.email,
    phone: userRow.phone || '',
    bio: userRow.bio || '',
    role: userRow.role,
    availability: availability || [],
    schedule: schedule || [],
    roster: roster || []
  };
}

function respondWithUserData(userRow, res) {
  db.all(`SELECT date, role, status FROM availability WHERE user_id = ?`, [userRow.id], (err, availability) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    db.all(`SELECT date, role, status FROM schedule WHERE user_id = ?`, [userRow.id], (err, schedule) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (userRow.role !== 'leader') {
        return res.json({ user: buildUserPayload(userRow, availability, schedule) });
      }

      db.all(`SELECT id, member_id AS memberId, member_name AS memberName, date, role FROM roster WHERE leader_id = ? ORDER BY date`, [userRow.id], (err, roster) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({ user: buildUserPayload(userRow, availability, schedule, roster) });
      });
    });
  });
}

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // Find or create user
    const email = profile.emails[0].value;
    const firstName = profile.name.givenName;
    const lastName = profile.name.familyName;
    const googleId = profile.id;

    db.get('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email], (err, user) => {
      if (err) return done(err);

      if (user) {
        // Update google_id if not set
        if (!user.google_id) {
          db.run('UPDATE users SET google_id = ?, provider = ? WHERE id = ?', [googleId, 'google', user.id]);
        }
        return done(null, user);
      } else {
        // Create new user
        const handle = `@${firstName.toLowerCase()}`;
        db.run(`INSERT INTO users (email, password, provider, google_id, role, first_name, last_name, handle)
                VALUES (?, ?, 'google', ?, 'member', ?, ?, ?)`,
          [email, '', googleId, firstName, lastName, handle],
          function(err) {
            if (err) return done(err);
            const newUser = {
              id: this.lastID,
              email,
              provider: 'google',
              google_id: googleId,
              role: 'member',
              first_name: firstName,
              last_name: lastName,
              handle,
              phone: '',
              bio: ''
            };
            done(null, newUser);
          });
      }
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    done(err, user);
  });
});

// Routes

// Google Auth
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect to home
    res.redirect('/');
  });

// Get current user
app.get('/api/me', (req, res) => {
  if (req.user) {
    respondWithUserData(req.user, res);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout error' });
    res.json({ message: 'Logged out' });
  });
});

// Signup
app.post('/api/signup', async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  try {
    // Check if user already exists
    db.get('SELECT email FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }
      const handle = `@${firstName.toLowerCase()}`;

      // Insert user
      db.run(`INSERT INTO users (email, password, role, first_name, last_name, handle)
              VALUES (?, ?, ?, ?, ?, ?)`,
        [email, hashedPassword, role, firstName, lastName, handle],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error creating user' });
          }

          const user = {
            id: this.lastID,
            name: `${firstName} ${lastName}`,
            handle,
            email,
            phone: '',
            bio: '',
            role,
            availability: [],
            schedule: [],
            messages: [],
            notifications: []
          };

          res.json({ message: 'User created successfully', user });
        });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Please login with Google' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    respondWithUserData(user, res);
  });
});

// Get all members (for leader view)
app.get('/api/members', (req, res) => {
  db.all(`
    SELECT
      users.id,
      users.first_name,
      users.last_name,
      users.handle,
      users.role,
      availability.date AS availability_date,
      availability.role AS availability_role,
      availability.status AS availability_status
    FROM users
    LEFT JOIN availability ON availability.user_id = users.id
    WHERE users.role = 'member'
    ORDER BY users.id, availability.date
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const membersById = new Map();
    rows.forEach(row => {
      if (!membersById.has(row.id)) {
        membersById.set(row.id, {
          id: row.id,
          name: `${row.first_name} ${row.last_name}`,
          handle: row.handle,
          role: row.role,
          availability: []
        });
      }

      if (row.availability_date) {
        membersById.get(row.id).availability.push({
          date: row.availability_date,
          role: row.availability_role,
          status: row.availability_status
        });
      }
    });

    const members = Array.from(membersById.values());

    res.json({ members });
  });
});

// Get all users
app.get('/api/users', (req, res) => {
  db.all(`SELECT id, email, role, first_name, last_name, handle, phone, bio, created_at FROM users`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const users = rows.map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email,
      role: row.role,
      handle: row.handle,
      phone: row.phone || '',
      bio: row.bio || '',
      created_at: row.created_at
    }));

    res.json({ users });
  });
});

// Delete user (leader admin only)
app.delete('/api/users/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user.role !== 'leader') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (req.user.id === userId) {
    return res.status(403).json({ error: 'Cannot delete your own account from admin panel' });
  }

  db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run('DELETE FROM availability WHERE user_id = ?', [userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      db.run('DELETE FROM schedule WHERE user_id = ?', [userId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ message: 'User deleted successfully' });
        });
      });
    });
  });
});

// Update availability
app.post('/api/availability', (req, res) => {
  const { userId, availability } = req.body;

  // Delete existing availability
  db.run('DELETE FROM availability WHERE user_id = ?', [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Insert new availability
    const stmt = db.prepare('INSERT INTO availability (user_id, date, role, status) VALUES (?, ?, ?, ?)');
    availability.forEach(item => {
      stmt.run([userId, item.date, item.role, item.status]);
    });
    stmt.finalize();

    res.json({ message: 'Availability updated' });
  });
});

app.post('/api/schedule', (req, res) => {
  const { userId, schedule } = req.body;

  db.run('DELETE FROM schedule WHERE user_id = ?', [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const stmt = db.prepare('INSERT INTO schedule (user_id, date, role, status) VALUES (?, ?, ?, ?)');
    (schedule || []).forEach(item => {
      stmt.run([userId, item.date, item.role, item.status]);
    });
    stmt.finalize();

    res.json({ message: 'Schedule updated' });
  });
});

app.post('/api/roster', (req, res) => {
  const { leaderId, memberId, memberName, date, role } = req.body;

  db.run(
    'INSERT INTO roster (leader_id, member_id, member_name, date, role) VALUES (?, ?, ?, ?, ?)',
    [leaderId, memberId, memberName, date, role],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(
        'INSERT INTO schedule (user_id, date, role, status) VALUES (?, ?, ?, ?)',
        [memberId, date, role, 'confirmed'],
        (scheduleErr) => {
          if (scheduleErr) {
            return res.status(500).json({ error: 'Database error' });
          }

          res.json({
            message: 'Roster assignment saved',
            rosterItem: {
              id: this.lastID,
              memberId,
              memberName,
              date,
              role
            }
          });
        }
      );
    }
  );
});

app.delete('/api/roster/:id', (req, res) => {
  const rosterId = Number(req.params.id);

  db.get('SELECT member_id AS memberId, date, role FROM roster WHERE id = ?', [rosterId], (err, rosterItem) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!rosterItem) {
      return res.status(404).json({ error: 'Roster item not found' });
    }

    db.run('DELETE FROM roster WHERE id = ?', [rosterId], (deleteErr) => {
      if (deleteErr) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(
        'DELETE FROM schedule WHERE user_id = ? AND date = ? AND role = ? AND status = ?',
        [rosterItem.memberId, rosterItem.date, rosterItem.role, 'confirmed'],
        (scheduleErr) => {
          if (scheduleErr) {
            return res.status(500).json({ error: 'Database error' });
          }

          res.json({ message: 'Roster item removed' });
        }
      );
    });
  });
});

// Update profile
app.put('/api/profile/:userId', (req, res) => {
  const { userId } = req.params;
  const { phone, bio } = req.body;

  db.run('UPDATE users SET phone = ?, bio = ? WHERE id = ?', [phone, bio, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Profile updated' });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});