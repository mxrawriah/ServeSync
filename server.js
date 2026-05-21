const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(session({
  secret: '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',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('.'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'servesync (3).html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'servesync (3).html'));
});

console.log('Supabase initialized');

// Helper functions
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
  const date = new Date(value);
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
    const { data: memberRows } = await supabase
      .from('roster')
      .select('member_id')
      .eq('leader_id', userRow.id);

    const { data: leaderRows } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'leader')
      .neq('id', userRow.id);

    const memberIds = (memberRows || []).map(r => r.member_id).filter(Boolean);
    const leaderIds = (leaderRows || []).map(r => r.id);
    return Array.from(new Set([...memberIds, ...leaderIds]));
  }

  const { data: leaderRows } = await supabase
    .from('roster')
    .select('leader_id')
    .eq('member_id', userRow.id);

  const leaderIds = (leaderRows || []).map(r => r.leader_id).filter(Boolean);
  if (!leaderIds.length) return [];

  const { data: memberRows } = await supabase
    .from('roster')
    .select('member_id')
    .in('leader_id', leaderIds)
    .neq('member_id', userRow.id);

  const memberIds = (memberRows || []).map(r => r.member_id).filter(Boolean);
  return Array.from(new Set([...leaderIds, ...memberIds]));
}

async function getConversationByParticipants(userIdA, userIdB) {
  const a = Math.min(Number(userIdA), Number(userIdB));
  const b = Math.max(Number(userIdA), Number(userIdB));
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('participant_a_id', a)
    .eq('participant_b_id', b)
    .single();
  return data;
}

async function ensureConversation(userIdA, userIdB) {
  const a = Math.min(Number(userIdA), Number(userIdB));
  const b = Math.max(Number(userIdA), Number(userIdB));
  const existing = await getConversationByParticipants(a, b);
  if (existing) return existing;

  const { data } = await supabase
    .from('conversations')
    .insert([{ participant_a_id: a, participant_b_id: b }])
    .select()
    .single();
  return data;
}

async function getAllowedContacts(userRow, query = '') {
  const allowedIds = await getAccessibleContactIds(userRow);
  if (!allowedIds.length) return [];

  let qb = supabase
    .from('users')
    .select('id, first_name, last_name, handle, email, role')
    .neq('id', userRow.id)
    .in('id', allowedIds);

  if (query) {
    const q = query.toLowerCase();
    qb = qb.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,handle.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data } = await qb.order('first_name').order('last_name');
  return (data || []).map(row => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    handle: row.handle,
    email: row.email,
    role: row.role
  }));
}

async function getMessageThread(userRow, conversationId) {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .or(`participant_a_id.eq.${userRow.id},participant_b_id.eq.${userRow.id}`)
    .single();

  if (!conversation) return null;

  const otherUserId = conversation.participant_a_id === userRow.id ? conversation.participant_b_id : conversation.participant_a_id;
  const { data: otherUser } = await supabase
    .from('users')
    .select('id, first_name, last_name, handle, email, role')
    .eq('id', otherUserId)
    .single();

  if (!otherUser) return null;

  const { data: rows } = await supabase
    .from('messages')
    .select(`id, conversation_id, sender_id, receiver_id, subject, message_text, is_read, sent_at,
      sender:sender_id(first_name, last_name, handle)`)
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
    .order('id', { ascending: true });

  const thread = (rows || []).map(row => ({
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    subject: row.subject || '(no subject)',
    text: row.message_text,
    time: formatMessageTime(row.sent_at),
    sentAt: row.sent_at,
    isRead: Boolean(row.is_read),
    role: row.sender_id === userRow.id ? 'outgoing' : 'incoming',
    sender: `${row.sender.first_name} ${row.sender.last_name}`,
    senderHandle: row.sender.handle
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
  // Get all conversations for the user
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .or(`participant_a_id.eq.${userRow.id},participant_b_id.eq.${userRow.id}`);

  const summaries = [];
  let unreadCount = 0;

  for (const conversation of conversations || []) {
    const otherUserId = conversation.participant_a_id === userRow.id ? conversation.participant_b_id : conversation.participant_a_id;

    const { data: otherUser } = await supabase
      .from('users')
      .select('id, first_name, last_name, handle, email, role')
      .eq('id', otherUserId)
      .single();

    if (!otherUser) continue;

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);

    if (!messages || messages.length === 0) continue;

    const latestMessage = messages[0];
    const displayName = otherUser.handle ? `${otherUser.first_name} ${otherUser.last_name} (${otherUser.handle})` : `${otherUser.first_name} ${otherUser.last_name}`;

    const { data: unreadMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('receiver_id', userRow.id)
      .eq('is_read', 0);

    const messageUnreadCount = (unreadMessages || []).length;
    unreadCount += messageUnreadCount;

    summaries.push({
      id: conversation.id,
      conversationId: conversation.id,
      from: displayName,
      to: `${userRow.first_name} ${userRow.last_name}`,
      subject: latestMessage.subject || '(no subject)',
      preview: latestMessage.message_text || '',
      time: formatMessageTime(latestMessage.sent_at),
      unread: messageUnreadCount > 0,
      unreadCount: messageUnreadCount,
      latestMessageId: latestMessage.id,
      latestSenderId: latestMessage.sender_id,
      latestReceiverId: latestMessage.receiver_id,
      otherUserId: otherUser.id,
      otherName: `${otherUser.first_name} ${otherUser.last_name}`,
      otherHandle: otherUser.handle,
      otherEmail: otherUser.email,
      otherRole: otherUser.role,
      sentAt: latestMessage.sent_at,
      senderId: latestMessage.sender_id,
      receiverId: latestMessage.receiver_id
    });
  }

  summaries.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

  return {
    conversations: summaries,
    sent: summaries.filter(item => item.latestSenderId === userRow.id),
    unreadCount
  };
}

async function respondWithUserData(userRow, res) {
  try {
    const { data: availability } = await supabase
      .from('availability')
      .select('id, date, service_time, role, status, review_status')
      .eq('user_id', userRow.id)
      .order('date')
      .order('service_time');

    const { data: schedule } = await supabase
      .from('schedule')
      .select('id, date, service_time, role, status')
      .eq('user_id', userRow.id)
      .order('date')
      .order('service_time');

    const { data: notifications } = await supabase
      .from('notifications')
      .select('id, type, title, sub, unread, created_at')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const formattedNotifications = (notifications || []).map(n => ({
      ...n,
      unread: Boolean(n.unread),
      time: formatMessageTime(n.created_at)
    }));

    const messagePayload = await getMessageSummaries(userRow);

    if (userRow.role !== 'leader') {
      return res.json({
        user: buildUserPayload(
          userRow,
          availability || [],
          schedule || [],
          [],
          formattedNotifications,
          messagePayload.conversations,
          messagePayload.sent,
          messagePayload.unreadCount
        )
      });
    }

    const { data: roster } = await supabase
      .from('roster')
      .select('id, member_id, member_name, date, service_time, role')
      .eq('leader_id', userRow.id)
      .order('date')
      .order('service_time');

    res.json({
      user: buildUserPayload(
        userRow,
        availability || [],
        schedule || [],
        roster || [],
        formattedNotifications,
        messagePayload.conversations,
        messagePayload.sent,
        messagePayload.unreadCount
      )
    });
  } catch (err) {
    console.error('Respond with user data error:', err);
    res.status(500).json({ error: 'Database error' });
  }
}

// Passport configuration
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/callback"
},
  async function (accessToken, refreshToken, profile, done) {
    const email = profile.emails[0].value;
    const firstName = profile.name.givenName;
    const lastName = profile.name.familyName;
    const googleId = profile.id;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .or(`google_id.eq.${googleId},email.eq.${email}`)
      .single();

    if (user) {
      if (!user.google_id) {
        await supabase
          .from('users')
          .update({ google_id: googleId, provider: 'google' })
          .eq('id', user.id);
      }
      return done(null, user);
    }

    const handle = `@${firstName.toLowerCase()}`;
    const { data: newUser } = await supabase
      .from('users')
      .insert([{
        email,
        provider: 'google',
        google_id: googleId,
        role: 'member',
        first_name: firstName,
        last_name: lastName,
        handle
      }])
      .select()
      .single();

    done(null, newUser);
  }
));

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  done(null, user);
});

// Routes

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function (req, res) {
    res.redirect('/');
  });

app.get('/api/me', (req, res) => {
  if (req.user) {
    respondWithUserData(req.user, res);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout error' });
    res.json({ message: 'Logged out' });
  });
});

app.post('/api/signup', async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }
    const handle = `@${firstName.toLowerCase()}`;

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
        role,
        first_name: firstName,
        last_name: lastName,
        handle
      }])
      .select()
      .single();

    if (insertError || !newUser) {
      console.error('Signup insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create user. ' + (insertError?.message || '') });
    }

    const user = {
      id: newUser.id,
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

    req.login(newUser, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ error: 'Login error' });
      }
      res.json({ message: 'User created successfully', user });
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Please login with Google' });
    }

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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/members', async (req, res) => {
  try {
    const { data: rows } = await supabase
      .from('users')
      .select(`id, first_name, last_name, handle, role, availability(id, date, service_time, role, status, review_status)`)
      .eq('role', 'member');

    const members = (rows || []).map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      handle: row.handle,
      role: row.role,
      availability: (row.availability || []).map(a => ({
        id: a.id,
        date: a.date,
        serviceTime: a.service_time || '09:00',
        role: a.role,
        status: a.status,
        reviewStatus: a.review_status || 'pending'
      }))
    }));

    res.json({ members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { data: rows } = await supabase
      .from('users')
      .select('id, email, role, first_name, last_name, handle, phone, bio, created_at');

    const users = (rows || []).map(row => ({
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
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/users/:userId', async (req, res) => {
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

  try {
    await supabase.from('availability').delete().eq('user_id', userId);
    await supabase.from('schedule').delete().eq('user_id', userId);
    await supabase.from('messages').delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await supabase.from('conversations').delete().or(`participant_a_id.eq.${userId},participant_b_id.eq.${userId}`);
    await supabase.from('notifications').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/availability', async (req, res) => {
  const { userId, availability } = req.body;

  console.log('[availability] save requested', {
    userId,
    count: Array.isArray(availability) ? availability.length : 0
  });

  try {
    const { error: deleteError } = await supabase.from('availability').delete().eq('user_id', userId);
    if (deleteError) {
      console.error('[availability] delete failed', { userId, error: deleteError.message });
      throw deleteError;
    }

    console.log('[availability] cleared existing rows', { userId });

    if (availability && Array.isArray(availability)) {
      const records = availability.map(item => ({
        user_id: userId,
        date: item.date,
        service_time: item.serviceTime || item.service_time || '09:00',
        role: item.role,
        status: item.status,
        review_status: item.reviewStatus || item.review_status || 'pending'
      }));

      const { error: insertError } = await supabase.from('availability').insert(records);
      if (insertError) {
        console.error('[availability] insert failed', { userId, error: insertError.message, records });
        throw insertError;
      }

      console.log('[availability] rows inserted', { userId, count: records.length, records });
    } else {
      console.log('[availability] no rows to insert', { userId });
    }

    const { data: member } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    if (member) {
      const { data: leaders } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'leader');

      if (leaders && leaders.length) {
        const notifs = leaders.map(leader => ({
          user_id: leader.id,
          type: 'calendar',
          title: 'Availability submitted',
          sub: `${member.first_name} ${member.last_name} submitted availability for review`
        }));

        const { error: notificationError } = await supabase.from('notifications').insert(notifs);
        if (notificationError) {
          console.error('[availability] notification insert failed', { userId, error: notificationError.message });
          throw notificationError;
        }

        console.log('[availability] notifications inserted', { userId, count: notifs.length });
      }
    }

    console.log('[availability] save completed', { userId });
    res.json({ message: 'Availability updated' });
  } catch (error) {
    console.error('[availability] save failed', { userId, error: error.message || error });
    res.status(500).json({ error: 'Database error' });
  }
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

    await supabase
      .from('messages')
      .update({ is_read: 1 })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', req.user.id);

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

    const { data: recipient } = await supabase
      .from('users')
      .select('id, first_name, last_name, handle, email, role')
      .eq('id', resolvedReceiverId)
      .single();

    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const conversation = await ensureConversation(senderId, resolvedReceiverId);
    const finalSubject = String(subject || '').trim() || '(no subject)';

    const { data: message } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        sender_id: senderId,
        receiver_id: resolvedReceiverId,
        subject: finalSubject,
        message_text: String(messageText).trim(),
        is_read: 0
      }])
      .select()
      .single();

    await supabase.from('notifications').insert([{
      user_id: resolvedReceiverId,
      type: 'message',
      title: `New message from ${req.user.first_name} ${req.user.last_name}`,
      sub: finalSubject
    }]);

    const thread = await getMessageThread(req.user, conversation.id);
    const summaries = await getMessageSummaries(req.user);
    res.json({
      message: 'Message sent',
      messageItem: {
        id: message.id,
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
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant_a_id.eq.${req.user.id},participant_b_id.eq.${req.user.id}`)
      .single();

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!messageText || !String(messageText).trim()) {
      return res.status(400).json({ error: 'Message text is required.' });
    }

    const receiverId = conversation.participant_a_id === req.user.id ? conversation.participant_b_id : conversation.participant_a_id;

    const { data: reply } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: req.user.id,
        receiver_id: receiverId,
        subject: '(reply)',
        message_text: String(messageText).trim(),
        is_read: 0
      }])
      .select()
      .single();

    await supabase.from('notifications').insert([{
      user_id: receiverId,
      type: 'message',
      title: `New reply from ${req.user.first_name} ${req.user.last_name}`,
      sub: String(messageText).trim().slice(0, 80)
    }]);

    const thread = await getMessageThread(req.user, conversationId);
    const summaries = await getMessageSummaries(req.user);
    res.json({
      message: 'Reply sent',
      replyId: reply.id,
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
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant_a_id.eq.${req.user.id},participant_b_id.eq.${req.user.id}`)
      .single();

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await supabase
      .from('messages')
      .update({ is_read: 1 })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', req.user.id);

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
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .or(`participant_a_id.eq.${req.user.id},participant_b_id.eq.${req.user.id}`)
      .single();

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await supabase.from('messages').delete().eq('conversation_id', conversationId);
    await supabase.from('conversations').delete().eq('id', conversationId);

    const summaries = await getMessageSummaries(req.user);
    res.json({ message: 'Conversation deleted', messages: summaries.conversations, sent: summaries.sent, unreadCount: summaries.unreadCount });
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/schedule', async (req, res) => {
  const { userId, schedule } = req.body;

  console.log('[schedule] save requested', {
    userId,
    count: Array.isArray(schedule) ? schedule.length : 0
  });

  const seenSlots = new Set();
  for (const item of schedule || []) {
    const serviceTime = normalizeServiceTime(item.serviceTime || item.service_time);
    const key = `${item.date}|${serviceTime}`;
    if (seenSlots.has(key)) {
      return res.status(409).json({ error: 'Schedule conflict: a member can only have one assignment per service date and time.' });
    }
    seenSlots.add(key);
  }

  try {
    const { error: deleteError } = await supabase.from('schedule').delete().eq('user_id', userId);
    if (deleteError) {
      console.error('[schedule] delete failed', { userId, error: deleteError.message });
      throw deleteError;
    }

    console.log('[schedule] cleared existing rows', { userId });

    if (schedule && Array.isArray(schedule)) {
      const records = schedule.map(item => ({
        user_id: userId,
        date: item.date,
        service_time: item.serviceTime || item.service_time || '09:00',
        role: item.role,
        status: item.status
      }));

      const { error: insertError } = await supabase.from('schedule').insert(records);
      if (insertError) {
        console.error('[schedule] insert failed', { userId, error: insertError.message, records });
        throw insertError;
      }

      console.log('[schedule] rows inserted', { userId, count: records.length, records });
    } else {
      console.log('[schedule] no rows to insert', { userId });
    }

    console.log('[schedule] save completed', { userId });
    res.json({ message: 'Schedule updated' });
  } catch (error) {
    console.error('[schedule] save failed', { userId, error: error.message || error });
    res.status(500).json({ error: 'Database error' });
  }
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
        error: `${role} is already assigned to ${slotConflict.member_name} on ${date} at ${normalizedTime}.`,
        conflict: slotConflict
      });
    }

    const { data: rosterItem } = await supabase
      .from('roster')
      .insert([{
        leader_id: leaderId,
        member_id: memberId,
        member_name: memberName,
        date,
        service_time: normalizedTime,
        role
      }])
      .select()
      .single();

    await supabase.from('schedule').insert([{
      user_id: memberId,
      date,
      service_time: normalizedTime,
      role,
      status: 'confirmed'
    }]);

    res.json({
      message: 'Roster assignment saved',
      rosterItem: {
        id: rosterItem.id,
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

app.delete('/api/roster/:id', async (req, res) => {
  const rosterId = Number(req.params.id);

  try {
    const { data: rosterItem } = await supabase
      .from('roster')
      .select('member_id, date, service_time, role')
      .eq('id', rosterId)
      .single();

    if (!rosterItem) {
      return res.status(404).json({ error: 'Roster item not found' });
    }

    await supabase.from('roster').delete().eq('id', rosterId);
    await supabase
      .from('schedule')
      .delete()
      .eq('user_id', rosterItem.member_id)
      .eq('date', rosterItem.date)
      .eq('service_time', rosterItem.service_time || '09:00')
      .eq('role', rosterItem.role)
      .eq('status', 'confirmed');

    res.json({ message: 'Roster item removed' });
  } catch (error) {
    console.error('Delete roster error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/availability/:id/review', async (req, res) => {
  const availabilityId = Number(req.params.id);
  const { reviewStatus } = req.body;

  if (!['approved', 'rejected'].includes(reviewStatus)) {
    return res.status(400).json({ error: 'Review status must be approved or rejected' });
  }

  try {
    const { data: submission } = await supabase
      .from('availability')
      .select('*, user:user_id(first_name, last_name)')
      .eq('id', availabilityId)
      .single();

    if (!submission) {
      return res.status(404).json({ error: 'Availability submission not found' });
    }

    await supabase
      .from('availability')
      .update({ review_status: reviewStatus })
      .eq('id', availabilityId);

    await supabase.from('notifications').insert([{
      user_id: submission.user_id,
      type: reviewStatus === 'approved' ? 'schedule' : 'bell',
      title: reviewStatus === 'approved' ? 'Availability approved' : 'Availability rejected',
      sub: `${submission.date} ${submission.service_time || '09:00'} ${submission.role} was ${reviewStatus}`
    }]);

    res.json({
      message: `Availability ${reviewStatus}`,
      availability: {
        id: submission.id,
        userId: submission.user_id,
        memberName: `${submission.user.first_name} ${submission.user.last_name}`,
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

  const { data: rosterConflict } = await supabase
    .from('roster')
    .select('id, member_id, member_name, date, service_time, role')
    .eq('member_id', memberId)
    .eq('date', date)
    .eq('service_time', normalizedTime)
    .limit(1)
    .single();

  if (rosterConflict) return { ...rosterConflict, source: 'roster' };

  const { data: scheduleConflict } = await supabase
    .from('schedule')
    .select('*, user:user_id(first_name, last_name)')
    .eq('user_id', memberId)
    .eq('date', date)
    .eq('service_time', normalizedTime)
    .limit(1)
    .single();

  if (scheduleConflict) {
    return {
      id: scheduleConflict.id,
      member_id: scheduleConflict.user_id,
      member_name: `${scheduleConflict.user.first_name} ${scheduleConflict.user.last_name}`,
      date: scheduleConflict.date,
      service_time: scheduleConflict.service_time,
      role: scheduleConflict.role,
      source: 'schedule'
    };
  }

  return null;
}

async function findRoleSlotConflict(date, serviceTime, role) {
  const { data } = await supabase
    .from('roster')
    .select('id, member_id, member_name, date, service_time, role')
    .eq('date', date)
    .eq('service_time', normalizeServiceTime(serviceTime))
    .eq('role', role)
    .limit(1)
    .single();

  return data || null;
}

async function findExistingAssignmentConflicts() {
  const { data } = await supabase
    .from('roster')
    .select('member_id, member_name, date, service_time, role');

  const conflicts = new Map();
  (data || []).forEach(item => {
    const key = `${item.member_id}|${item.date}|${item.service_time}`;
    if (!conflicts.has(key)) {
      conflicts.set(key, { member_id: item.member_id, member_name: item.member_name, date: item.date, service_time: item.service_time, roles: [], count: 0 });
    }
    conflicts.get(key).roles.push(item.role);
    conflicts.get(key).count += 1;
  });

  return Array.from(conflicts.values())
    .filter(c => c.count > 1)
    .map(c => ({
      memberId: c.member_id,
      memberName: c.member_name,
      date: c.date,
      serviceTime: c.service_time,
      assignmentCount: c.count,
      roles: c.roles.join(', ')
    }));
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

    const { data: approved } = await supabase
      .from('availability')
      .select(`id, user_id, date, service_time, role, user:user_id(first_name, last_name)`)
      .eq('status', 'yes')
      .eq('review_status', 'approved')
      .order('date')
      .order('service_time')
      .order('role');

    const { data: existingRoster } = await supabase
      .from('roster')
      .select('member_id, date, service_time, role');

    const { data: existingSchedule } = await supabase
      .from('schedule')
      .select('user_id, date, service_time, role');

    const approvedWithLoadCount = (approved || []).map(item => ({
      ...item,
      first_name: item.user.first_name,
      last_name: item.user.last_name,
      assignment_count: (existingRoster || []).filter(r => r.member_id === item.user_id).length
    }));

    const generated = buildConflictFreeSchedule(approvedWithLoadCount, existingRoster || [], existingSchedule || []);

    const created = [];
    for (const item of generated) {
      const memberName = `${item.first_name} ${item.last_name}`;
      const normalizedTime = normalizeServiceTime(item.service_time);
      const memberConflict = await findMemberSlotConflict(item.user_id, item.date, normalizedTime);
      if (memberConflict) continue;
      const slotConflict = await findRoleSlotConflict(item.date, normalizedTime, item.role);
      if (slotConflict) continue;

      const { data: rosterItem } = await supabase
        .from('roster')
        .insert([{
          leader_id: leaderId,
          member_id: item.user_id,
          member_name: memberName,
          date: item.date,
          service_time: normalizedTime,
          role: item.role
        }])
        .select()
        .single();

      await supabase.from('schedule').insert([{
        user_id: item.user_id,
        date: item.date,
        service_time: normalizedTime,
        role: item.role,
        status: 'confirmed'
      }]);

      await supabase.from('notifications').insert([{
        user_id: item.user_id,
        type: 'schedule',
        title: 'Schedule published',
        sub: `${item.date} ${normalizedTime} - ${item.role} is confirmed`
      }]);

      created.push({
        id: rosterItem.id,
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

app.put('/api/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { phone, bio } = req.body;

  try {
    await supabase
      .from('users')
      .update({ phone, bio })
      .eq('id', userId);

    res.json({ message: 'Profile updated' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

function startServer(port, canFallback = true) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && canFallback) {
      const fallbackPort = Number(port) + 1;
      console.log(`Port ${port} is in use. Trying http://localhost:${fallbackPort}`);
      startServer(fallbackPort, false);
      return;
    }
    throw error;
  });
}

startServer(PORT);
