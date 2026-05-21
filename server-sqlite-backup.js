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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function addColumnIfMissing(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, (err, columns) => {
    if (err) return console.error(`Inspect ${table}:`, err);
    if (!columns.some(c => c.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) console.error(`Alter ${table}.${column}:`, alterErr);
      });
    }
  });
}

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
    service_time TEXT DEFAULT '09:00',
    role TEXT,
    status TEXT,
    review_status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT,
    service_time TEXT DEFAULT '09:00',
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

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    title TEXT,
    sub TEXT,
    unread INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_a_id INTEGER NOT NULL,
    participant_b_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant_a_id, participant_b_id),
    FOREIGN KEY (participant_a_id) REFERENCES users (id),
    FOREIGN KEY (participant_b_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    subject TEXT,
    message_text TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations (id),
    FOREIGN KEY (sender_id) REFERENCES users (id),
    FOREIGN KEY (receiver_id) REFERENCES users (id)
  )`);

  addColumnIfMissing('availability', 'service_time', `TEXT DEFAULT '09:00'`);
  addColumnIfMissing('availability', 'review_status', `TEXT DEFAULT 'pending'`);
  addColumnIfMissing('schedule', 'service_time', `TEXT DEFAULT '09:00'`);
  addColumnIfMissing('roster', 'service_time', `TEXT DEFAULT '09:00'`);
}

function buildUserPayload(userRow, availability, schedule, roster = [], notifications = [], messages = [], sent = [], messageUnreadCount = 0) {
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
    roster: roster || [],
    notifications: notifications || [],
    messages: messages || [],
    sent: sent || [],
    messageUnreadCount: messageUnreadCount || 0
  };
}

function formatMessageTime(value) {
  if (!value) return 'Recently';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString();
}

function formatConversationSummary(row) {
  const unreadCount = Number(row.unreadCount || 0);
  const displayName = row.otherHandle ? `${row.otherName} (${row.otherHandle})` : row.otherName;
  return {
    id: row.conversationId,
    conversationId: row.conversationId,
    from: displayName,
    to: row.currentName,
    subject: row.subject || '(no subject)',
    preview: row.messageText || '',
    time: formatMessageTime(row.sentAt),
    unread: unreadCount > 0,
    unreadCount,
    latestMessageId: row.latestMessageId,
    latestSenderId: row.senderId,
    latestReceiverId: row.receiverId,
    otherUserId: row.otherUserId,
    otherName: row.otherName,
    otherHandle: row.otherHandle,
    otherEmail: row.otherEmail,
    otherRole: row.otherRole
  };
}

async function getAccessibleContactIds(userRow) {
  if (userRow.role === 'leader') {
    const memberRows = await dbAll(
      'SELECT DISTINCT member_id AS id FROM roster WHERE leader_id = ? AND member_id IS NOT NULL',
      [userRow.id]
    );
    const leaderRows = await dbAll(
      'SELECT id FROM users WHERE role = ? AND id != ?',
      ['leader', userRow.id]
    );
    return Array.from(new Set([...memberRows, ...leaderRows].map(row => Number(row.id)).filter(Boolean)));
  }

  const leaderRows = await dbAll(
    'SELECT DISTINCT leader_id AS id FROM roster WHERE member_id = ? AND leader_id IS NOT NULL',
    [userRow.id]
  );
  const leaderIds = leaderRows.map(row => Number(row.id)).filter(Boolean);
  if (!leaderIds.length) return [];

  const memberRows = await dbAll(
    `SELECT DISTINCT member_id AS id
     FROM roster
     WHERE leader_id IN (${leaderIds.map(() => '?').join(',')})
       AND member_id IS NOT NULL
       AND member_id != ?`,
    [...leaderIds, userRow.id]
  );

  return Array.from(new Set([
    ...leaderIds,
    ...memberRows.map(row => Number(row.id)).filter(Boolean)
  ]));
}

async function getConversationByParticipants(userIdA, userIdB) {
  const a = Math.min(Number(userIdA), Number(userIdB));
  const b = Math.max(Number(userIdA), Number(userIdB));
  return dbGet(
    'SELECT * FROM conversations WHERE participant_a_id = ? AND participant_b_id = ?',
    [a, b]
  );
}

async function ensureConversation(userIdA, userIdB) {
  const a = Math.min(Number(userIdA), Number(userIdB));
  const b = Math.max(Number(userIdA), Number(userIdB));
  const existing = await getConversationByParticipants(a, b);
  if (existing) return existing;
  const result = await dbRun(
    'INSERT INTO conversations (participant_a_id, participant_b_id) VALUES (?, ?)',
    [a, b]
  );
  return dbGet('SELECT * FROM conversations WHERE id = ?', [result.lastID]);
}

async function getAllowedContacts(userRow, query = '') {
  const allowedIds = await getAccessibleContactIds(userRow);
  if (!allowedIds.length) return [];

  const params = [userRow.id, ...allowedIds];
  let sql = `
    SELECT id, first_name, last_name, handle, email, role
    FROM users
    WHERE id != ?
      AND id IN (${allowedIds.map(() => '?').join(',')})
  `;

  if (query) {
    sql += ` AND (
      lower(first_name || ' ' || last_name) LIKE ? OR
      lower(COALESCE(handle, '')) LIKE ? OR
      lower(COALESCE(email, '')) LIKE ?
    )`;
    const q = `%${query.toLowerCase()}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY first_name, last_name';
  const rows = await dbAll(sql, params);
  return rows.map(row => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    handle: row.handle,
    email: row.email,
    role: row.role
  }));
}

async function getMessageThread(userRow, conversationId) {
  const conversation = await dbGet(
    'SELECT * FROM conversations WHERE id = ? AND (participant_a_id = ? OR participant_b_id = ?)',
    [conversationId, userRow.id, userRow.id]
  );
  if (!conversation) return null;

  const otherUserId = conversation.participant_a_id === userRow.id ? conversation.participant_b_id : conversation.participant_a_id;
  const otherUser = await dbGet(
    'SELECT id, first_name, last_name, handle, email, role FROM users WHERE id = ?',
    [otherUserId]
  );
  if (!otherUser) return null;

  const rows = await dbAll(
    `SELECT
      messages.id,
      messages.conversation_id AS conversationId,
      messages.sender_id AS senderId,
      messages.receiver_id AS receiverId,
      messages.subject,
      messages.message_text AS messageText,
      messages.is_read AS isRead,
      messages.sent_at AS sentAt,
      sender.first_name AS senderFirstName,
      sender.last_name AS senderLastName,
      sender.handle AS senderHandle
    FROM messages
    JOIN users sender ON sender.id = messages.sender_id
    WHERE messages.conversation_id = ?
    ORDER BY messages.sent_at ASC, messages.id ASC`,
    [conversationId]
  );

  const thread = rows.map(row => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    subject: row.subject || '(no subject)',
    text: row.messageText,
    time: formatMessageTime(row.sentAt),
    sentAt: row.sentAt,
    isRead: Boolean(row.isRead),
    role: row.senderId === userRow.id ? 'outgoing' : 'incoming',
    sender: `${row.senderFirstName} ${row.senderLastName}`,
    senderHandle: row.senderHandle
  }));

  return {
    conversationId,
    id: conversationId,
    otherUser: {
      id: otherUser.id,
      name: `${otherUser.first_name} ${otherUser.last_name}`,
      handle: otherUser.handle,
      email: otherUser.email,
      role: otherUser.role
    },
    thread
  };
}

async function getMessageSummaries(userRow) {
  const rows = await dbAll(`
    SELECT
      c.id AS conversationId,
      CASE WHEN c.participant_a_id = ? THEN c.participant_b_id ELSE c.participant_a_id END AS otherUserId,
      other.first_name || ' ' || other.last_name AS otherName,
      other.handle AS otherHandle,
      other.email AS otherEmail,
      other.role AS otherRole,
      me.first_name || ' ' || me.last_name AS currentName,
      latest.id AS latestMessageId,
      latest.sender_id AS senderId,
      latest.receiver_id AS receiverId,
      latest.subject AS subject,
      latest.message_text AS messageText,
      latest.sent_at AS sentAt,
      (
        SELECT COUNT(*)
        FROM messages unread
        WHERE unread.conversation_id = c.id
          AND unread.receiver_id = ?
          AND unread.is_read = 0
      ) AS unreadCount
    FROM conversations c
    JOIN users me ON me.id = ?
    JOIN users other ON other.id = CASE
      WHEN c.participant_a_id = ? THEN c.participant_b_id
      ELSE c.participant_a_id
    END
    JOIN messages latest ON latest.id = (
      SELECT id
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY sent_at DESC, id DESC
      LIMIT 1
    )
    WHERE c.participant_a_id = ? OR c.participant_b_id = ?
    ORDER BY latest.sent_at DESC, latest.id DESC
  `, [userRow.id, userRow.id, userRow.id, userRow.id, userRow.id]);

  const summaries = rows.map(formatConversationSummary);
  return {
    conversations: summaries,
    sent: summaries.filter(item => item.latestSenderId === userRow.id),
    unreadCount: rows.reduce((total, row) => total + Number(row.unreadCount || 0), 0)
  };
}

function respondWithUserData(userRow, res) {
  db.all(`SELECT id, date, service_time AS serviceTime, role, status, review_status AS reviewStatus FROM availability WHERE user_id = ? ORDER BY date, service_time`, [userRow.id], (err, availability) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    db.all(`SELECT id, date, service_time AS serviceTime, role, status FROM schedule WHERE user_id = ? ORDER BY date, service_time`, [userRow.id], (err, schedule) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.all(`SELECT id, type, title, sub, unread, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userRow.id], (err, notifications) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        const formattedNotifications = notifications.map(n => ({
          ...n,
          unread: Boolean(n.unread),
          time: n.createdAt ? new Date(n.createdAt.replace(' ', 'T')).toLocaleString() : 'Recently'
        }));

        const messagePayloadPromise = getMessageSummaries(userRow);

        if (userRow.role !== 'leader') {
          return messagePayloadPromise.then(messagePayload => {
            res.json({
              user: buildUserPayload(
                userRow,
                availability,
                schedule,
                [],
                formattedNotifications,
                messagePayload.conversations,
                messagePayload.sent,
                messagePayload.unreadCount
              )
            });
          }).catch(() => res.status(500).json({ error: 'Database error' }));
        }

        db.all(`SELECT id, member_id AS memberId, member_name AS memberName, date, service_time AS serviceTime, role FROM roster WHERE leader_id = ? ORDER BY date, service_time`, [userRow.id], async (err, roster) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          try {
            const messagePayload = await messagePayloadPromise;
            res.json({
              user: buildUserPayload(
                userRow,
                availability,
                schedule,
                roster,
                formattedNotifications,
                messagePayload.conversations,
                messagePayload.sent,
                messagePayload.unreadCount
              )
            });
          } catch (payloadErr) {
            console.error('Load message payload error:', payloadErr);
            res.status(500).json({ error: 'Database error' });
          }
        });
      });
    });
  });
}

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL // 
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

          req.login({ id: this.lastID, email, role, first_name: firstName, last_name: lastName, handle }, (loginErr) => {
            if (loginErr) {
              return res.status(500).json({ error: 'Login error' });
            }
            res.json({ message: 'User created successfully', user });
          });
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

    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ error: 'Login error' });
      }
      respondWithUserData(user, res);
    });
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
      availability.id AS availability_id,
      availability.service_time AS availability_time,
      availability.role AS availability_role,
      availability.status AS availability_status,
      availability.review_status AS availability_review_status
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
          id: row.availability_id,
          date: row.availability_date,
          serviceTime: row.availability_time || '09:00',
          role: row.availability_role,
          status: row.availability_status,
          reviewStatus: row.availability_review_status || 'pending'
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
        db.run('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          db.run('DELETE FROM conversations WHERE participant_a_id = ? OR participant_b_id = ?', [userId, userId], (convErr) => {
            if (convErr) {
              return res.status(500).json({ error: 'Database error' });
            }
            db.run('DELETE FROM notifications WHERE user_id = ?', [userId], (notifErr) => {
              if (notifErr) {
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
    if (availability && Array.isArray(availability)) {
      const stmt = db.prepare('INSERT INTO availability (user_id, date, service_time, role, status, review_status) VALUES (?, ?, ?, ?, ?, ?)');
      availability.forEach(item => {
        stmt.run([userId, item.date, item.serviceTime || item.service_time || '09:00', item.role, item.status, item.reviewStatus || item.review_status || 'pending']);
      });
      stmt.finalize();
    }

    db.get('SELECT first_name, last_name FROM users WHERE id = ?', [userId], (userErr, member) => {
      if (!userErr && member) {
        db.all("SELECT id FROM users WHERE role = 'leader'", [], (leaderErr, leaders) => {
          if (!leaderErr && leaders.length) {
            const stmt = db.prepare('INSERT INTO notifications (user_id, type, title, sub) VALUES (?, ?, ?, ?)');
            leaders.forEach(leader => {
              stmt.run([leader.id, 'calendar', 'Availability submitted', `${member.first_name} ${member.last_name} submitted availability for review`]);
            });
            stmt.finalize();
          }
        });
      }
      res.json({ message: 'Availability updated' });
    });
  });
});

app.get('/api/messages/contacts', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const contacts = await getAllowedContacts(req.user, req.query.q || '');
    res.json({ contacts });
  } catch (err) {
    console.error('Search contacts error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/messages/conversations/:conversationId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const conversationId = Number(req.params.conversationId);
  try {
    const payload = await getMessageThread(req.user, conversationId);
    if (!payload) return res.status(404).json({ error: 'Conversation not found' });
    await dbRun(
      'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ?',
      [conversationId, req.user.id]
    );
    res.json({ conversation: payload });
  } catch (err) {
    console.error('Load conversation error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/messages', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { receiverId, recipientQuery, subject, messageText } = req.body;
  const senderId = req.user.id;
  try {
    let resolvedReceiverId = Number(receiverId);
    if (!resolvedReceiverId && recipientQuery) {
      const query = String(recipientQuery).trim().toLowerCase();
      const contacts = await getAllowedContacts(req.user, query);
      const exact = contacts.find(contact =>
        contact.handle?.toLowerCase() === query ||
        contact.email?.toLowerCase() === query ||
        contact.name?.toLowerCase() === query
      ) || (contacts.length === 1 ? contacts[0] : null);
      if (!exact) {
        return res.status(400).json({ error: 'Select a valid recipient from the accessible contacts list.' });
      }
      resolvedReceiverId = exact.id;
    }

    if (!resolvedReceiverId || !messageText || !String(messageText).trim()) {
      return res.status(400).json({ error: 'Recipient and message are required.' });
    }
    if (resolvedReceiverId === senderId) {
      return res.status(400).json({ error: 'You cannot message yourself.' });
    }

    const allowedIds = await getAccessibleContactIds(req.user);
    if (!allowedIds.includes(Number(resolvedReceiverId))) {
      return res.status(403).json({ error: 'You are not allowed to message this user.' });
    }

    const recipient = await dbGet('SELECT id, first_name, last_name, handle, email, role FROM users WHERE id = ?', [resolvedReceiverId]);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const conversation = await ensureConversation(senderId, resolvedReceiverId);
    const finalSubject = String(subject || '').trim() || '(no subject)';
    const messageResult = await dbRun(
      'INSERT INTO messages (conversation_id, sender_id, receiver_id, subject, message_text, is_read) VALUES (?, ?, ?, ?, ?, 0)',
      [conversation.id, senderId, resolvedReceiverId, finalSubject, String(messageText).trim()]
    );

    await dbRun(
      'INSERT INTO notifications (user_id, type, title, sub) VALUES (?, ?, ?, ?)',
      [
        resolvedReceiverId,
        'message',
        `New message from ${req.user.first_name} ${req.user.last_name}`,
        finalSubject
      ]
    );

    const thread = await getMessageThread(req.user, conversation.id);
    const summaries = await getMessageSummaries(req.user);
    res.json({
      message: 'Message sent',
      messageItem: {
        id: messageResult.lastID,
        conversationId: conversation.id,
        receiverId: resolvedReceiverId,
        subject: finalSubject,
        messageText: String(messageText).trim()
      },
      conversation: thread,
      messages: summaries.conversations,
      sent: summaries.sent,
      unreadCount: summaries.unreadCount
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/messages/conversations/:conversationId/reply', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const conversationId = Number(req.params.conversationId);
  const { messageText } = req.body;
  try {
    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ? AND (participant_a_id = ? OR participant_b_id = ?)',
      [conversationId, req.user.id, req.user.id]
    );
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!messageText || !String(messageText).trim()) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const receiverId = conversation.participant_a_id === req.user.id ? conversation.participant_b_id : conversation.participant_a_id;
    const reply = await dbRun(
      'INSERT INTO messages (conversation_id, sender_id, receiver_id, subject, message_text, is_read) VALUES (?, ?, ?, ?, ?, 0)',
      [conversationId, req.user.id, receiverId, '(reply)', String(messageText).trim()]
    );
    await dbRun(
      'INSERT INTO notifications (user_id, type, title, sub) VALUES (?, ?, ?, ?)',
      [receiverId, 'message', `New reply from ${req.user.first_name} ${req.user.last_name}`, String(messageText).trim().slice(0, 80)]
    );

    const thread = await getMessageThread(req.user, conversationId);
    const summaries = await getMessageSummaries(req.user);
    res.json({
      message: 'Reply sent',
      replyId: reply.lastID,
      conversation: thread,
      messages: summaries.conversations,
      sent: summaries.sent,
      unreadCount: summaries.unreadCount
    });
  } catch (err) {
    console.error('Reply message error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/messages/conversations/:conversationId/read', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const conversationId = Number(req.params.conversationId);
  try {
    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ? AND (participant_a_id = ? OR participant_b_id = ?)',
      [conversationId, req.user.id, req.user.id]
    );
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await dbRun('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ?', [conversationId, req.user.id]);
    const summaries = await getMessageSummaries(req.user);
    res.json({ message: 'Conversation marked as read', messages: summaries.conversations, sent: summaries.sent, unreadCount: summaries.unreadCount });
  } catch (err) {
    console.error('Mark conversation read error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/messages/conversations/:conversationId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const conversationId = Number(req.params.conversationId);
  try {
    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ? AND (participant_a_id = ? OR participant_b_id = ?)',
      [conversationId, req.user.id, req.user.id]
    );
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await dbRun('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    await dbRun('DELETE FROM conversations WHERE id = ?', [conversationId]);
    const summaries = await getMessageSummaries(req.user);
    res.json({ message: 'Conversation deleted', messages: summaries.conversations, sent: summaries.sent, unreadCount: summaries.unreadCount });
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/schedule', (req, res) => {
  const { userId, schedule } = req.body;

  const seenSlots = new Set();
  for (const item of schedule || []) {
    const serviceTime = normalizeServiceTime(item.serviceTime || item.service_time);
    const key = `${item.date}|${serviceTime}`;
    if (seenSlots.has(key)) {
      return res.status(409).json({ error: 'Schedule conflict: a member can only have one assignment per service date and time.' });
    }
    seenSlots.add(key);
  }

  db.run('DELETE FROM schedule WHERE user_id = ?', [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const stmt = db.prepare('INSERT INTO schedule (user_id, date, service_time, role, status) VALUES (?, ?, ?, ?, ?)');
    (schedule || []).forEach(item => {
      stmt.run([userId, item.date, item.serviceTime || item.service_time || '09:00', item.role, item.status]);
    });
    stmt.finalize();

    res.json({ message: 'Schedule updated' });
  });
});

app.post('/api/roster', async (req, res) => {
  const { leaderId, memberId, memberName, date, serviceTime, role } = req.body;
  const normalizedTime = normalizeServiceTime(serviceTime);

  if (!leaderId || !memberId || !date || !role) {
    return res.status(400).json({ error: 'Leader, member, date, and role are required.' });
  }

  try {
    const memberConflict = await findMemberSlotConflict(memberId, date, normalizedTime);
    if (memberConflict) {
      return res.status(409).json({
        error: `${memberName || 'This member'} is already assigned to ${memberConflict.role} on ${date} at ${normalizedTime}.`,
        conflict: memberConflict
      });
    }

    const slotConflict = await findRoleSlotConflict(date, normalizedTime, role);
    if (slotConflict) {
      return res.status(409).json({
        error: `${role} is already assigned to ${slotConflict.memberName} on ${date} at ${normalizedTime}.`,
        conflict: slotConflict
      });
    }

    const rosterResult = await dbRun(
      'INSERT INTO roster (leader_id, member_id, member_name, date, service_time, role) VALUES (?, ?, ?, ?, ?, ?)',
      [leaderId, memberId, memberName, date, normalizedTime, role]
    );
    await dbRun(
      'INSERT INTO schedule (user_id, date, service_time, role, status) VALUES (?, ?, ?, ?, ?)',
      [memberId, date, normalizedTime, role, 'confirmed']
    );

    res.json({
      message: 'Roster assignment saved',
      rosterItem: {
        id: rosterResult.lastID,
        memberId,
        memberName,
        date,
        serviceTime: normalizedTime,
        role
      }
    });
  } catch (err) {
    console.error('Save roster assignment error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/roster/:id', (req, res) => {
  const rosterId = Number(req.params.id);

  db.get('SELECT member_id AS memberId, date, service_time AS serviceTime, role FROM roster WHERE id = ?', [rosterId], (err, rosterItem) => {
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
        'DELETE FROM schedule WHERE user_id = ? AND date = ? AND service_time = ? AND role = ? AND status = ?',
        [rosterItem.memberId, rosterItem.date, rosterItem.serviceTime || '09:00', rosterItem.role, 'confirmed'],
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

app.patch('/api/availability/:id/review', async (req, res) => {
  const availabilityId = Number(req.params.id);
  const { reviewStatus } = req.body;

  if (!['approved', 'rejected'].includes(reviewStatus)) {
    return res.status(400).json({ error: 'Review status must be approved or rejected' });
  }

  try {
    const submission = await dbGet(`
      SELECT availability.*, users.first_name, users.last_name
      FROM availability
      JOIN users ON users.id = availability.user_id
      WHERE availability.id = ?
    `, [availabilityId]);

    if (!submission) {
      return res.status(404).json({ error: 'Availability submission not found' });
    }

    await dbRun('UPDATE availability SET review_status = ? WHERE id = ?', [reviewStatus, availabilityId]);
    await dbRun(
      'INSERT INTO notifications (user_id, type, title, sub) VALUES (?, ?, ?, ?)',
      [
        submission.user_id,
        reviewStatus === 'approved' ? 'schedule' : 'bell',
        reviewStatus === 'approved' ? 'Availability approved' : 'Availability rejected',
        `${submission.date} ${submission.service_time || '09:00'} ${submission.role} was ${reviewStatus}`
      ]
    );

    res.json({
      message: `Availability ${reviewStatus}`,
      availability: {
        id: submission.id,
        userId: submission.user_id,
        memberName: `${submission.first_name} ${submission.last_name}`,
        date: submission.date,
        serviceTime: submission.service_time || '09:00',
        role: submission.role,
        status: submission.status,
        reviewStatus
      }
    });
  } catch (err) {
    console.error('Review availability error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

function normalizeServiceTime(serviceTime) {
  return serviceTime || '09:00';
}

function assignmentMemberKey(memberId, date, serviceTime) {
  return `${memberId}|${date}|${normalizeServiceTime(serviceTime)}`;
}

function assignmentRoleKey(date, serviceTime, role) {
  return `${date}|${normalizeServiceTime(serviceTime)}|${role}`;
}

async function findMemberSlotConflict(memberId, date, serviceTime) {
  const normalizedTime = normalizeServiceTime(serviceTime);
  const rosterConflict = await dbGet(
    'SELECT id, member_id AS memberId, member_name AS memberName, date, service_time AS serviceTime, role FROM roster WHERE member_id = ? AND date = ? AND service_time = ? LIMIT 1',
    [memberId, date, normalizedTime]
  );
  if (rosterConflict) return { ...rosterConflict, source: 'roster' };

  const scheduleConflict = await dbGet(
    `SELECT
      schedule.id,
      schedule.user_id AS memberId,
      users.first_name || ' ' || users.last_name AS memberName,
      schedule.date,
      schedule.service_time AS serviceTime,
      schedule.role
    FROM schedule
    JOIN users ON users.id = schedule.user_id
    WHERE schedule.user_id = ? AND schedule.date = ? AND schedule.service_time = ?
    LIMIT 1`,
    [memberId, date, normalizedTime]
  );
  return scheduleConflict ? { ...scheduleConflict, source: 'schedule' } : null;
}

async function findRoleSlotConflict(date, serviceTime, role) {
  return dbGet(
    'SELECT id, member_id AS memberId, member_name AS memberName, date, service_time AS serviceTime, role FROM roster WHERE date = ? AND service_time = ? AND role = ? LIMIT 1',
    [date, normalizeServiceTime(serviceTime), role]
  );
}

async function findExistingAssignmentConflicts() {
  return dbAll(`
    SELECT
      member_id AS memberId,
      member_name AS memberName,
      date,
      service_time AS serviceTime,
      COUNT(*) AS assignmentCount,
      GROUP_CONCAT(role, ', ') AS roles
    FROM roster
    GROUP BY member_id, date, service_time
    HAVING COUNT(*) > 1
    ORDER BY date, service_time, member_name
  `);
}

function buildConflictFreeSchedule(approved, existingRoster, existingSchedule = []) {
  const assignments = [];
  let bestAssignments = [];
  const assignedBySlot = new Set(existingRoster.map(item => assignmentRoleKey(item.date, item.service_time, item.role)));
  const memberBusy = new Set([
    ...existingRoster.map(item => assignmentMemberKey(item.member_id, item.date, item.service_time)),
    ...existingSchedule.map(item => assignmentMemberKey(item.user_id, item.date, item.service_time))
  ]);
  const slotMap = new Map();

  approved.forEach(item => {
    const key = assignmentRoleKey(item.date, item.service_time, item.role);
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(item);
  });

  slotMap.forEach(candidates => {
    candidates.sort((a, b) => {
      const loadDiff = (a.assignment_count || 0) - (b.assignment_count || 0);
      if (loadDiff !== 0) return loadDiff;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
  });

  const slots = Array.from(slotMap.entries())
    .filter(([key]) => !assignedBySlot.has(key))
    .sort((a, b) => a[1].length - b[1].length);

  function backtrack(index) {
    if (assignments.length + (slots.length - index) <= bestAssignments.length) return;
    if (index >= slots.length) {
      if (assignments.length > bestAssignments.length) bestAssignments = [...assignments];
      return;
    }

    const [, candidates] = slots[index];

    for (const candidate of candidates) {
      const timeKey = assignmentMemberKey(candidate.user_id, candidate.date, candidate.service_time);
      if (memberBusy.has(timeKey)) continue;

      memberBusy.add(timeKey);
      assignments.push(candidate);

      backtrack(index + 1);

      assignments.pop();
      memberBusy.delete(timeKey);
    }

    // Leave this role open only if no conflict-free candidate completes it.
    backtrack(index + 1);
  }

  backtrack(0);
  return bestAssignments;
}

app.post('/api/schedule/generate', async (req, res) => {
  const leaderId = Number(req.body.leaderId || (req.user && req.user.id));

  if (!leaderId) {
    return res.status(400).json({ error: 'Leader ID is required' });
  }

  try {
    const existingConflicts = await findExistingAssignmentConflicts();
    if (existingConflicts.length) {
      const firstConflict = existingConflicts[0];
      return res.status(409).json({
        error: `Existing conflict found: ${firstConflict.memberName} has ${firstConflict.assignmentCount} assignments on ${firstConflict.date} at ${firstConflict.serviceTime}. Remove the duplicate before generating a new schedule.`,
        conflicts: existingConflicts
      });
    }

    const approved = await dbAll(`
      SELECT
        availability.id,
        availability.user_id,
        availability.date,
        availability.service_time,
        availability.role,
        users.first_name,
        users.last_name,
        COALESCE(load.assignment_count, 0) AS assignment_count
      FROM availability
      JOIN users ON users.id = availability.user_id
      LEFT JOIN (
        SELECT member_id, COUNT(*) AS assignment_count
        FROM roster
        GROUP BY member_id
      ) load ON load.member_id = availability.user_id
      WHERE availability.status = 'yes'
        AND availability.review_status = 'approved'
      ORDER BY availability.date, availability.service_time, availability.role
    `);

    const existingRoster = await dbAll('SELECT member_id, date, service_time, role FROM roster');
    const existingSchedule = await dbAll('SELECT user_id, date, service_time, role FROM schedule');
    const generated = buildConflictFreeSchedule(approved, existingRoster, existingSchedule);

    const created = [];
    for (const item of generated) {
      const memberName = `${item.first_name} ${item.last_name}`;
      const normalizedTime = normalizeServiceTime(item.service_time);
      const memberConflict = await findMemberSlotConflict(item.user_id, item.date, normalizedTime);
      if (memberConflict) continue;
      const slotConflict = await findRoleSlotConflict(item.date, normalizedTime, item.role);
      if (slotConflict) continue;

      const rosterResult = await dbRun(
        'INSERT INTO roster (leader_id, member_id, member_name, date, service_time, role) VALUES (?, ?, ?, ?, ?, ?)',
        [leaderId, item.user_id, memberName, item.date, normalizedTime, item.role]
      );
      await dbRun(
        'INSERT INTO schedule (user_id, date, service_time, role, status) VALUES (?, ?, ?, ?, ?)',
        [item.user_id, item.date, normalizedTime, item.role, 'confirmed']
      );
      await dbRun(
        'INSERT INTO notifications (user_id, type, title, sub) VALUES (?, ?, ?, ?)',
        [item.user_id, 'schedule', 'Schedule published', `${item.date} ${normalizedTime} - ${item.role} is confirmed`]
      );

      created.push({
        id: rosterResult.lastID,
        memberId: item.user_id,
        memberName,
        date: item.date,
        serviceTime: normalizedTime,
        role: item.role
      });
    }

    res.json({
      message: `Generated ${created.length} schedule assignment${created.length === 1 ? '' : 's'}`,
      roster: created
    });
  } catch (err) {
    console.error('Generate schedule error:', err);
    res.status(500).json({ error: 'Database error' });
  }
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
