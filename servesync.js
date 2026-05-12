// Clear auth form fields when auth page is shown
function clearAuthFields() {
  const fields = ['login-email', 'login-pw', 'signup-first', 'signup-last', 'signup-email', 'signup-pw', 'signup-confirm'];
  fields.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.value = '';
      element.defaultValue = '';
    }
  });
}

// ════════════════════════════════════════
// APP STATE
// ════════════════════════════════════════
let authRole = 'member';
let currentRole = null;
let currentPage = null;
let msgFilter = { member: 'all', leader: 'all' };
let currentMsgId = null;
let editNameCb = null;
let allUsers = [];
let userSortKey = 'id';
let userSortDirection = 'asc';

const ROLES_LIST = ['Usher','Multimedia','Worship Team','Creatives','Social Media','Production','Service Lead','Preacher','Performing Arts','Design Team','Maintenance and Repair','Housekeeping'];

const MEMBER_PAGES = ['dashboard','schedule','inbox','notification','profile'];
const LEADER_PAGES = ['leader-dashboard','leader-roster','leader-users','leader-inbox','leader-notification','leader-profile'];
const EXTRA_PAGES = ['message-detail'];
const ALL_PAGES = [...MEMBER_PAGES, ...LEADER_PAGES, ...EXTRA_PAGES];

const MEMBER_NAV = [
  {id:'dashboard',label:'Dashboard',icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'},
  {id:'schedule',label:'Schedule',icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'},
  {id:'inbox',label:'Inbox',badge:'inbox-badge',icon:'<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'},
  {id:'notification',label:'Notifications',badge:'notif-badge',icon:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'},
  {id:'profile',label:'Profile',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'}
];

const LEADER_NAV = [
  {id:'leader-dashboard',label:'Dashboard',icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'},
  {id:'leader-roster',label:'Roster',icon:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
  {id:'leader-users',label:'Users',icon:'<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 7h8M8 12h8M8 17h8"/>'},
  {id:'leader-inbox',label:'Inbox',badge:'leader-inbox-badge',icon:'<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'},
  {id:'leader-notification',label:'Notifications',badge:'leader-notif-badge',icon:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'},
  {id:'leader-profile',label:'Profile',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'}
];

// ─── DATA ───
const data = {
  members: [
    {id:1,name:'Mariah D. Dano-og',handle:'@mkdganda',role:'Usher',availability:[
      {date:'2025-05-24',role:'Usher',status:'yes'},
      {date:'2025-05-25',role:'Worship Team',status:'yes'},
      {date:'2025-05-26',role:'Multimedia',status:'no'}
    ]},
    {id:2,name:'James R. Santos',handle:'@jrsantos',role:'Worship Team',availability:[{date:'2025-05-24',role:'Worship Team',status:'yes'}]},
    {id:3,name:'Claire Mae Reyes',handle:'@cmreyes',role:'Multimedia',availability:[{date:'2025-05-25',role:'Multimedia',status:'yes'},{date:'2025-05-26',role:'Multimedia',status:'no'}]},
    {id:4,name:'Daniel T. Flores',handle:'@dtflores',role:'Creatives',availability:[]}
  ],
  member: {
    name:'Mariah D. Dano-og',handle:'@mkdganda',email:'mariah@church.com',phone:'09123456789',bio:'',
    schedule:[{date:'May 8',role:'Usher',status:'confirmed'},{date:'May 12',role:'Multimedia',status:'confirmed'}],
    availability:[{date:'2025-05-24',role:'Usher',status:'yes'},{date:'2025-05-25',role:'Worship Team',status:'yes'}],
    notifications:[
      {id:1,type:'schedule',title:'New schedule assigned',sub:'May 8 – Usher confirmed by leader',time:'2h ago',unread:true},
      {id:2,type:'bell',title:'Announcement',sub:'Church assembly this Sunday 8 AM',time:'1d ago',unread:true}
    ],
    messages:[
      {id:1,from:'Pastor Rico',subject:'May 8 Assignment',time:'2h ago',unread:true,thread:[{role:'incoming',sender:'Pastor Rico',text:'Hi Mariah! Your May 8 Usher slot is confirmed. Please be there at 6:30 AM for briefing. God bless!',time:'2h ago'}]},
      {id:2,from:'Admin Team',subject:'Assembly Sunday',time:'1d ago',unread:false,thread:[{role:'incoming',sender:'Admin Team',text:'Church-wide assembly this Sunday at 8 AM. All volunteers are expected to attend. Venue: Main Sanctuary.',time:'1d ago'}]}
    ],
    sent:[]
  },
  leader: {
    name:'Pastor Rico',handle:'@pastorrico',email:'pastor@church.com',phone:'09987654321',bio:'',
    roster:[
      {id:1,memberId:1,memberName:'Mariah D. Dano-og',date:'May 8',role:'Usher'},
      {id:2,memberId:2,memberName:'James R. Santos',date:'May 8',role:'Worship Team'},
      {id:3,memberId:3,memberName:'Claire Mae Reyes',date:'May 12',role:'Multimedia'}
    ],
    notifications:[
      {id:1,type:'calendar',title:'Availability submitted',sub:'Mariah submitted availability for May 24–26',time:'1h ago',unread:true},
      {id:2,type:'schedule',title:'James confirmed May 8',sub:'Worship Team slot confirmed',time:'3h ago',unread:false}
    ],
    messages:[
      {id:1,from:'Mariah D. Dano-og',subject:'Re: May 8 Assignment',time:'1h ago',unread:true,thread:[
        {role:'outgoing',sender:'Pastor Rico',text:'Hi Mariah! Your May 8 Usher slot is confirmed. Please be there at 6:30 AM for briefing. God bless!',time:'2h ago'},
        {role:'incoming',sender:'Mariah D. Dano-og',text:'Thank you Pastor Rico! I will be there early. God bless!',time:'1h ago'}
      ]}
    ],
    sent:[]
  }
};

// ════════════════════════════════════════
// AUTH
// ════════════════════════════════════════
function setAuthRole(role) {
  authRole = role;
  const isLeader = role === 'leader';
  document.getElementById('auth-page').className = isLeader ? 'leader-bg' : '';
  document.getElementById('role-btn-member').classList.toggle('active', !isLeader);
  document.getElementById('role-btn-leader').classList.toggle('active', isLeader);
  const accent = isLeader ? '#1565C0' : '#E8531D';
  document.getElementById('auth-header').style.background = accent;
  const sib = document.getElementById('signin-role-badge');
  sib.className = 'role-badge-inline ' + role;
  sib.textContent = isLeader ? '⭐ Signing in as Leader' : '👤 Signing in as Member';
  const sub = document.getElementById('signup-role-badge');
  sub.className = 'role-badge-inline ' + role;
  sub.textContent = isLeader ? '⭐ Signing up as Leader' : '👤 Signing up as Member';
  document.getElementById('signin-btn').textContent = isLeader ? 'SIGN IN AS LEADER' : 'SIGN IN AS MEMBER';
  document.getElementById('signup-btn').textContent = isLeader ? 'CREATE LEADER ACCOUNT' : 'CREATE MEMBER ACCOUNT';
  document.getElementById('signin-btn').style.background = accent;
  document.getElementById('signup-btn').style.background = accent;
  document.querySelectorAll('.auth-tab.active').forEach(t=>t.style.color=accent);
}

function switchAuthTab(tab) {
  ['signin','signup'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('panel-'+t).classList.toggle('active',t===tab);
  });
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.querySelector('.eye-icon').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

function checkPw(pw) {
  const wrap = document.getElementById('pw-strength-wrap');
  if (!pw) { wrap.style.display='none'; return; } wrap.style.display='flex';
  let s=0; if(pw.length>=8)s++; if(/[A-Z]/.test(pw))s++; if(/[0-9]/.test(pw))s++; if(/[^A-Za-z0-9]/.test(pw))s++;
  const c=['#D93025','#F4A07A','#f5a623','#2e7d32'],l=['Weak','Fair','Good','Strong'];
  [1,2,3,4].forEach(i=>document.getElementById('pb'+i).style.background=i<=s?c[s-1]:'var(--gray-200)');
  const lbl=document.getElementById('pw-lbl'); lbl.textContent=l[s-1]||''; lbl.style.color=c[s-1]||'var(--gray-500)';
}

function normalizeUserState(user) {
  user.schedule = user.schedule || [];
  user.availability = user.availability || [];
  user.messages = user.messages || [];
  user.notifications = user.notifications || [];
  user.sent = user.sent || [];
  if (user.role === 'leader') user.roster = user.roster || [];
  return user;
}

function demoLogin(role) {
  setAuthRole(role);
  showToast('Loading ' + (role==='leader'?'Leader':'Member') + ' demo...','success');
  setTimeout(()=>enterApp(role), 500);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-pw').value;

  if (!email || !password) {
    showToast('Please fill in all fields.','error');
    return;
  }

  showToast('Signing in...','success');

  // Send login request to backend
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  .then(response => response.json())
  .then(result => {
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      // Store user data globally and provide default arrays
      const user = normalizeUserState(result.user);
      localStorage.setItem('servesync_user', JSON.stringify(user));
      if (user.role === 'leader') {
        data.leader = user;
        currentRole = 'leader';
      } else {
        data.member = user;
        currentRole = 'member';
      }
      enterApp(user.role);
    }
  })
  .catch(error => {
    showToast('Login failed. Please try again.', 'error');
    console.error('Login error:', error);
  });
}

function handleSignup(e) {
  e.preventDefault();
  const first = document.getElementById('signup-first').value.trim();
  const last = document.getElementById('signup-last').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-pw').value;
  const conf = document.getElementById('signup-confirm').value;
  if (!first||!last||!email||!pw||!conf) { showToast('Please fill in all fields.','error'); return; }
  if (pw!==conf) { showToast('Passwords do not match.','error'); return; }
  if (pw.length<8) { showToast('Password must be at least 8 characters.','error'); return; }

  // Send signup request to backend
  fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: first,
      lastName: last,
      email: email,
      password: pw,
      role: authRole
    })
  })
  .then(response => response.json())
  .then(result => {
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      const user = normalizeUserState(result.user);
      localStorage.setItem('servesync_user', JSON.stringify(user));
      if (user.role === 'leader') {
        data.leader = user;
        currentRole = 'leader';
      } else {
        data.member = user;
        currentRole = 'member';
      }
      showToast('Account created! Welcome, '+first+'!','success');
      setTimeout(()=>enterApp(user.role), 800);
    }
  })
  .catch(error => {
    showToast('Error creating account. Please try again.', 'error');
    console.error('Signup error:', error);
  });
}

function handleGoogleLogin() {
  window.location.href = '/auth/google';
}

// ════════════════════════════════════════
// ENTER APP — THE CRITICAL FUNCTION
// ════════════════════════════════════════
function enterApp(role) {
  currentRole = role;

  // Set accent colors
  if (role === 'leader') {
    document.documentElement.style.setProperty('--accent','#1565C0');
    document.documentElement.style.setProperty('--accent-dark','#0D47A1');
    document.documentElement.style.setProperty('--accent-bg','#E3F2FD');
  } else {
    document.documentElement.style.setProperty('--accent','#E8531D');
    document.documentElement.style.setProperty('--accent-dark','#C94218');
    document.documentElement.style.setProperty('--accent-bg','#FEF0EA');
  }

  // Hide auth, show app
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // If leader, fetch members data
  if (role === 'leader') {
    fetch('/api/members')
      .then(response => response.json())
      .then(result => {
        data.members = result.members || [];
        continueEnterApp(role);
      })
      .catch(error => {
        console.error('Error fetching members:', error);
        data.members = [];
        continueEnterApp(role);
      });
  } else {
    continueEnterApp(role);
  }
}

function continueEnterApp(role) {
  // Build sidebar nav
  buildSidebarNav(role);

  // Set sidebar user info
  const state = role==='leader' ? data.leader : data.member;
  document.getElementById('sidebar-name').textContent = state.name;
  document.getElementById('sidebar-handle').textContent = state.handle;
  document.getElementById('sidebar-role-chip').textContent = role==='leader' ? '⭐ Ministry Leader' : '👤 Member';
  document.getElementById('sidebar-header').style.background = role==='leader' ? '#1565C0' : '#E8531D';

  // Populate account fields
  populateAccountFields(role);

  // Go to dashboard
  goTo(role === 'leader' ? 'leader-dashboard' : 'dashboard');

  updateBadges();
}

function buildSidebarNav(role) {
  const nav = document.getElementById('sidebar-nav');
  const items = role==='leader' ? LEADER_NAV : MEMBER_NAV;
  nav.innerHTML = '<div class="sidebar-nav-section">MENU</div>' +
    items.map(item => `
      <div class="nav-item" id="nav-${item.id}" onclick="goTo('${item.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
        ${item.label}
        ${item.badge ? `<span class="nav-badge" id="${item.badge}" style="display:none">0</span>` : ''}
      </div>`).join('') +
    '<div class="nav-divider"></div>';
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
function goTo(target) {
  // Show app if hidden
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // Deactivate all pages
  ALL_PAGES.forEach(p => {
    const el = document.getElementById(p+'-page');
    if (el) el.classList.remove('active');
  });

  // Activate target
  const targetEl = document.getElementById(target+'-page');
  if (!targetEl) { console.warn('Page not found: '+target+'-page'); return; }
  targetEl.classList.add('active');
  currentPage = target;

  // Update sidebar nav
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const navEl = document.getElementById('nav-'+target);
  if (navEl) navEl.classList.add('active');

  // Update topbar title
  const titles = {
    'dashboard':'Dashboard','schedule':'Schedule','inbox':'Inbox','notification':'Notifications','profile':'Profile',
    'leader-dashboard':'Dashboard','leader-roster':'Roster Management','leader-users':'Registered Users','leader-inbox':'Inbox',
    'leader-notification':'Notifications','leader-profile':'Profile','message-detail':'Message'
  };
  document.getElementById('topbar-title').textContent = titles[target] || target;

  // Render
  if (target==='dashboard') renderMemberDash();
  if (target==='schedule') renderMemberSchedule();
  if (target==='inbox') renderInbox('member');
  if (target==='notification') renderNotifs('member');
  if (target==='leader-dashboard') renderLeaderDash();
  if (target==='leader-roster') renderRoster();
  if (target==='leader-users') renderLeaderUsers();
  if (target==='leader-inbox') renderInbox('leader');
  if (target==='leader-notification') renderNotifs('leader');

  updateBadges();
  window.scrollTo(0,0);
}

function goToInbox() {
  goTo(currentRole==='leader' ? 'leader-inbox' : 'inbox');
}

// ════════════════════════════════════════
// RENDERS
// ════════════════════════════════════════
function renderMemberDash() {
  const h = new Date().getHours();
  const name = data.member.name.split(' ')[0];
  document.getElementById('dash-greeting').textContent = `${h<12?'Good morning':h<17?'Good afternoon':'Good evening'}, ${name}! 👋`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  document.getElementById('stat-upcoming').textContent = data.member.schedule.length;
  document.getElementById('stat-messages').textContent = data.member.messages.filter(m=>m.unread).length;

  const sb = document.getElementById('dash-sched-body');
  sb.innerHTML = data.member.schedule.length
    ? data.member.schedule.map(s=>`<tr><td>${s.date}</td><td><span class="role-badge">${s.role}</span></td><td><span class="chip ${s.status}">${s.status==='confirmed'?'✓ Confirmed':'⏳ Pending'}</span></td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:18px;font-size:13px">No upcoming schedule</td></tr>';

  const ip = document.getElementById('dash-inbox-preview');
  const msgs = data.member.messages.slice(0,3);
  ip.innerHTML = msgs.length ? msgs.map(m=>{
    const init = m.from.split(' ').map(w=>w[0]).slice(0,2).join('');
    return `<div class="inbox-row ${m.unread?'unread':''}" onclick="openMessage(${m.id},'member')" style="padding:10px 0;margin:0">
      <div class="inbox-avatar" style="width:36px;height:36px;font-size:13px">${init}</div>
      <div class="inbox-content"><div class="inbox-top"><span class="inbox-from">${m.from}</span><span class="inbox-time">${m.time}</span></div><div class="inbox-subject">${m.subject}</div></div>
      ${m.unread?'<div class="unread-dot"></div>':''}
    </div>`;
  }).join('') : '<div class="empty" style="padding:20px 0"><p>No messages yet</p></div>';
}

function renderMemberSchedule() {
  const sb = document.getElementById('member-sched-body');
  sb.innerHTML = data.member.schedule.length
    ? data.member.schedule.map(s=>`<tr><td>${s.date}</td><td><span class="role-badge">${s.role}</span></td><td><span class="chip ${s.status}">${s.status==='confirmed'?'✓ Confirmed':'⏳ Pending'}</span></td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:18px;font-size:13px">No upcoming schedule</td></tr>';

  const ab = document.getElementById('avail-table-body');
  ab.innerHTML = data.member.availability.length
    ? data.member.availability.map((a,i)=>`<tr>
        <td>${fmtDate(a.date)}</td>
        <td><select class="avail-select" onchange="data.member.availability[${i}].role=this.value">${ROLES_LIST.map(r=>`<option ${r===a.role?'selected':''}>${r}</option>`).join('')}</select></td>
        <td><select class="avail-select" onchange="data.member.availability[${i}].status=this.value"><option value="yes" ${a.status==='yes'?'selected':''}>Yes ✓</option><option value="no" ${a.status==='no'?'selected':''}>No ✗</option></select></td>
        <td><button onclick="rmAvail(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px">✕</button></td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:14px;font-size:12px">No availability added yet</td></tr>';
}

function renderLeaderDash() {
  const h = new Date().getHours();
  const name = data.leader.name.split(' ')[0];
  document.getElementById('leader-greeting').textContent = `${h<12?'Good morning':h<17?'Good afternoon':'Good evening'}, ${name}! 👋`;
  document.getElementById('leader-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  document.getElementById('stat-members').textContent = (data.members || []).length;
  document.getElementById('stat-roster').textContent = (data.leader && data.leader.roster ? data.leader.roster.length : 0);
  const allAvails = (data.members || []).flatMap(m=>m.availability || []);
  document.getElementById('stat-responses').textContent = allAvails.length;
  const ar = document.getElementById('leader-avail-resp');
  if (!allAvails.length) { ar.innerHTML='<div class="empty" style="padding:20px 0"><p>No responses yet</p></div>'; }
  else ar.innerHTML = (data.members || []).flatMap(m=>(m.availability || []).map(a=>({...a,memberName:m.name}))).map(a=>{
    const init = a.memberName.split(' ').map(w=>w[0]).slice(0,2).join('');
    return `<div class="avail-resp-item">
      <div class="avail-resp-av">${init}</div>
      <div class="avail-resp-body"><div class="avail-resp-name">${a.memberName}</div><div class="avail-resp-detail">${fmtDate(a.date)} · ${a.role}</div></div>
      <span class="chip ${a.status==='yes'?'yes':'no'}">${a.status==='yes'?'✓ Available':'✗ Unavailable'}</span>
    </div>`;
  }).join('');

  const ldi = document.getElementById('leader-dash-inbox');
  const msgs = data.leader.messages.slice(0,3);
  ldi.innerHTML = msgs.length ? msgs.map(m=>{
    const init = m.from.split(' ').map(w=>w[0]).slice(0,2).join('');
    return `<div class="inbox-row ${m.unread?'unread':''}" onclick="openMessage(${m.id},'leader')" style="padding:10px 0;margin:0">
      <div class="inbox-avatar" style="width:36px;height:36px;font-size:13px;background:linear-gradient(135deg,#1565C0,#0D47A1)">${init}</div>
      <div class="inbox-content"><div class="inbox-top"><span class="inbox-from">${m.from}</span><span class="inbox-time">${m.time}</span></div><div class="inbox-subject">${m.subject}</div></div>
      ${m.unread?'<div class="unread-dot" style="background:#1565C0"></div>':''}
    </div>`;
  }).join('') : '<div class="empty" style="padding:20px 0"><p>No messages</p></div>';
}

function renderLeaderUsers() {
  const body = document.getElementById('users-table-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:20px">Loading users...</td></tr>';
  fetch('/api/users')
    .then(response => response.json())
    .then(result => {
      if (result.error) {
        body.innerHTML = `<tr><td colspan="6" style="color:var(--red);text-align:center;padding:20px">${result.error}</td></tr>`;
        return;
      }
      allUsers = result.users || [];
      if (!allUsers.length) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:20px">No users found.</td></tr>';
        return;
      }
      updateUserSortHeaders();
      applyUserSortAndFilter();
    })
    .catch(err => {
      console.error('Error fetching users:', err);
      body.innerHTML = '<tr><td colspan="6" style="color:var(--red);text-align:center;padding:20px">Unable to load users.</td></tr>';
    });
}

function displayUserRows(users) {
  const body = document.getElementById('users-table-body');
  if (!body) return;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:20px">No users match your search.</td></tr>';
    return;
  }
  body.innerHTML = users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>${user.role}</td>
      <td>${user.handle}</td>
      <td>${user.created_at ? user.created_at.split(' ')[0] : ''}</td>
      <td><button class="btn-sm btn-red-sm" onclick="handleUserDelete(${user.id}, '${user.name.replace(/'/g, "\\'")}')">Delete</button></td>
    </tr>
  `).join('');
}

function handleUserDelete(userId, userName) {
  if (!confirm(`Delete user ${userName}? This cannot be undone.`)) return;
  fetch(`/api/users/${userId}`, { method: 'DELETE' })
    .then(response => response.json())
    .then(result => {
      if (result.error) {
        showToast(result.error, 'error');
      } else {
        showToast('User deleted successfully.','success');
        refreshUsers();
      }
    })
    .catch(err => {
      console.error('Delete user error:', err);
      showToast('Could not delete user.', 'error');
    });
}

function filterUsers() {
  applyUserSortAndFilter();
}

function setUserSort(key) {
  if (userSortKey === key) {
    userSortDirection = userSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    userSortKey = key;
    userSortDirection = 'asc';
  }
  applyUserSortAndFilter();
  updateUserSortHeaders();
}

function applyUserSortAndFilter() {
  const query = document.getElementById('user-search')?.value.trim().toLowerCase();
  let users = allUsers.slice();
  if (query) {
    users = users.filter(user => {
      return [user.name, user.email, user.role, user.handle].some(value =>
        String(value || '').toLowerCase().includes(query)
      );
    });
  }
  users = sortUserRows(users, userSortKey, userSortDirection);
  displayUserRows(users);
}

function sortUserRows(users, key, direction) {
  return users.slice().sort((a, b) => {
    const va = a[key] || '';
    const vb = b[key] || '';
    let result;
    if (key === 'id') {
      result = Number(va) - Number(vb);
    } else if (key === 'created_at') {
      result = String(va).localeCompare(String(vb));
    } else {
      result = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
    }
    return direction === 'asc' ? result : -result;
  });
}

function refreshUsers() {
  document.getElementById('user-search').value = '';
  renderLeaderUsers();
}

function updateUserSortHeaders() {
  ['id','name','email','role','handle','created_at'].forEach(key => {
    const header = document.getElementById('th-user-' + (key==='created_at' ? 'created' : key));
    if (!header) return;
    header.classList.toggle('active', userSortKey === key);
    header.classList.toggle('asc', userSortKey === key && userSortDirection === 'asc');
    header.classList.toggle('desc', userSortKey === key && userSortDirection === 'desc');
  });
}

function renderRoster() {
  const sel = document.getElementById('assign-member');
  sel.innerHTML = '<option value="">Select member...</option>' + (data.members || []).map(m=>`<option value="${m.id}">${m.name}</option>`).join('');

  const rl = document.getElementById('roster-list');
  rl.innerHTML = (data.leader && data.leader.roster && data.leader.roster.length)
    ? data.leader.roster.map(r=>{
        const parts = (r.date||'').split(' ');
        return `<div class="roster-item">
          <div class="roster-datebox"><div class="roster-month">${parts[0]||''}</div><div class="roster-day">${parts[1]||''}</div></div>
          <div class="roster-info"><div class="roster-name-t">${r.memberName}</div><div class="roster-role-t"><span class="role-badge" style="background:#E3F2FD;color:#1565C0">${r.role}</span></div></div>
          <button class="btn-sm btn-red-sm" onclick="removeRoster(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Remove</button>
        </div>`;
      }).join('')
    : '<div class="empty" style="padding:20px 0"><p>No assignments yet. Click New Assignment to create one.</p></div>';

  const ml = document.getElementById('members-list');
  ml.innerHTML = data.members.map(m=>{
    const init = m.name.split(' ').map(w=>w[0]).slice(0,2).join('');
    return `<div class="member-row">
      <div class="member-av">${init}</div>
      <div class="member-info"><div class="member-name-t">${m.name}</div><div class="member-role-t">${m.role} · ${m.handle}</div></div>
      <span class="chip ${m.availability.length?'confirmed':'pending'}">${m.availability.length?'✓ Responded':'⏳ Pending'}</span>
    </div>`;
  }).join('');
}

function renderInbox(who) {
  const id = who==='leader' ? 'leader-inbox-list' : 'member-inbox-list';
  const el = document.getElementById(id); if(!el) return;
  const state = who==='leader' ? data.leader : data.member;
  const filter = msgFilter[who];
  let msgs = filter==='sent' ? state.sent : state.messages;
  if (filter==='unread') msgs = msgs.filter(m=>m.unread);

  if (!msgs.length) {
    el.innerHTML=`<div class="empty" style="padding:40px 0"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><p>${filter==='sent'?'No sent messages.':filter==='unread'?'No unread messages.':'Your inbox is empty.'}</p></div>`;
    return;
  }

  el.innerHTML = msgs.map(m=>{
    const init = m.from.split(' ').map(w=>w[0]).slice(0,2).join('');
    const preview = m.thread&&m.thread.length ? m.thread[m.thread.length-1].text : '';
    return `<div class="inbox-row ${m.unread&&filter!=='sent'?'unread':''}" onclick="openMessage(${m.id},'${who}')">
      <div class="inbox-avatar" style="${who==='leader'?'background:linear-gradient(135deg,#1565C0,#0D47A1)':''}">${init}</div>
      <div class="inbox-content">
        <div class="inbox-top"><span class="inbox-from">${m.from}</span><span class="inbox-time">${m.time}</span></div>
        <div class="inbox-subject">${m.subject}</div>
        <div class="inbox-preview">${preview.substring(0,80)}${preview.length>80?'…':''}</div>
      </div>
      ${m.unread&&filter!=='sent'?'<div class="unread-dot"></div>':''}
    </div>`;
  }).join('');
}

function setMsgFilter(filter, who) {
  msgFilter[who] = filter;
  const prefix = who==='leader' ? 'lf' : 'mf';
  ['all','unread','sent'].forEach(f=>document.getElementById(prefix+'-'+f)?.classList.toggle('active',f===filter));
  renderInbox(who);
}

function renderNotifs(who) {
  const id = who==='leader' ? 'leader-notif-list' : 'notif-list';
  const el = document.getElementById(id); if(!el) return;
  const notifs = (who==='leader' ? data.leader : data.member).notifications;
  const icons = {
    schedule:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
  };
  if (!notifs.length) { el.innerHTML='<div class="empty" style="padding:30px 0"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>All caught up!</p></div>'; return; }
  el.innerHTML = notifs.map(n=>`
    <div class="notif-item ${n.unread?'unread':''}" onclick="markNotifRead(${n.id},'${who}')">
      <div class="notif-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[n.type]||icons.bell}</svg></div>
      <div class="notif-body"><div class="notif-title">${n.title}</div><div class="notif-sub">${n.sub}</div><div class="notif-time">${n.time}</div></div>
      <button class="notif-dismiss" onclick="dismissNotif(event,${n.id},'${who}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('');
  updateBadges();
}

// ════════════════════════════════════════
// SCHEDULE ACTIONS
// ════════════════════════════════════════
function toggleAddForm() {
  const f = document.getElementById('add-avail-form');
  f.classList.toggle('show');
  if (f.classList.contains('show')) {
    const d = new Date(); d.setDate(d.getDate()+1);
    document.getElementById('avail-date').value = d.toISOString().split('T')[0];
  }
}

function addAvailRow() {
  const date = document.getElementById('avail-date').value;
  const role = document.getElementById('avail-role').value;
  const status = document.getElementById('avail-status').value;
  if (!date) { showToast('Please select a date.','error'); return; }
  data.member.availability.push({date,role,status});
  data.members[0].availability.push({date,role,status});
  renderMemberSchedule();
  document.getElementById('add-avail-form').classList.remove('show');
  showToast('Added to availability.','success');
}

function rmAvail(i) { data.member.availability.splice(i,1); renderMemberSchedule(); }

async function submitAvailability() {
  if (!data.member.availability.length) { showToast('No availability to submit.','error'); return; }
  const previousSchedule = [...data.member.schedule];
  const previousAvailability = [...data.member.availability];
  const memberRecord = (data.members || []).find(m => m.id === data.member.id || m.handle === data.member.handle || m.name === data.member.name);
  const previousMemberAvailability = memberRecord ? [...(memberRecord.availability || [])] : null;
  data.member.availability.filter(a=>a.status==='yes').forEach(a=>{
    if (!data.member.schedule.find(s=>s.date===fmtDate(a.date)&&s.role===a.role))
      data.member.schedule.push({date:fmtDate(a.date),role:a.role,status:'pending'});
  });
  data.leader.notifications.unshift({id:Date.now(),type:'calendar',title:'Availability submitted',sub:data.member.name+' submitted new availability',time:'Just now',unread:true});
  data.member.availability = [];
  if (memberRecord) memberRecord.availability = [];

  try {
    await persistMemberScheduleState();
  } catch (error) {
    data.member.schedule = previousSchedule;
    data.member.availability = previousAvailability;
    if (memberRecord) memberRecord.availability = previousMemberAvailability;
    console.error('Error saving availability submission:', error);
    showToast('Could not save your schedule. Please try again.','error');
    return;
  }

  renderMemberSchedule();
  updateBadges();

  const list = document.getElementById('flash-list');
  list.innerHTML = data.member.schedule.map((s,i)=>{
    const parts = s.date.split(' ');
    return `<div class="flash-card" style="animation-delay:${.06+i*.07}s">
      <div class="flash-datebox"><div class="flash-month">${parts[0]||''}</div><div class="flash-day">${parts[1]||''}</div></div>
      <div class="flash-info"><div class="flash-role">${s.role}</div><span class="flash-status ${s.status==='confirmed'?'confirmed':'pending'}">${s.status==='confirmed'?'✓ Confirmed':'⏳ Pending review'}</span></div>
    </div>`;
  }).join('') || '<p style="color:var(--gray-400);text-align:center;padding:16px">No schedule yet.</p>';

  document.getElementById('flash-modal').classList.add('show');
}

// ════════════════════════════════════════
// ROSTER ACTIONS
// ════════════════════════════════════════
function toggleAssignForm() {
  const f = document.getElementById('assign-form');
  f.classList.toggle('show');
  if (f.classList.contains('show')) {
    const d = new Date(); d.setDate(d.getDate()+1);
    document.getElementById('assign-date').value = d.toISOString().split('T')[0];
  }
}

async function addRosterItem() {
  const date = document.getElementById('assign-date').value;
  const memberId = parseInt(document.getElementById('assign-member').value);
  const role = document.getElementById('assign-role').value;
  if (!date||!memberId) { showToast('Please select a date and member.','error'); return; }
  const member = data.members.find(m=>m.id===memberId);
  if (!member) return;

  try {
    const response = await fetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaderId: data.leader.id,
        memberId,
        memberName: member.name,
        date: fmtDate(date),
        role
      })
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to save assignment.');

    data.leader.roster.push(result.rosterItem);
    persistCurrentUser();
  } catch (error) {
    console.error('Error saving roster assignment:', error);
    showToast('Could not save assignment. Please try again.','error');
    return;
  }

  document.getElementById('assign-form').classList.remove('show');
  renderRoster();
  document.getElementById('stat-roster').textContent = data.leader.roster.length;
  updateBadges();
  showToast(`${member.name.split(' ')[0]} assigned as ${role} on ${fmtDate(date)}!`,'success');
}

async function removeRoster(id) {
  try {
    const response = await fetch(`/api/roster/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to remove assignment.');
  } catch (error) {
    console.error('Error removing roster assignment:', error);
    showToast('Could not remove assignment.','error');
    return;
  }

  data.leader.roster = data.leader.roster.filter(r=>r.id!==id);
  persistCurrentUser();
  renderRoster();
  document.getElementById('stat-roster').textContent = data.leader.roster.length;
  showToast('Assignment removed.','success');
}

// ════════════════════════════════════════
// MESSAGES
// ════════════════════════════════════════
function openMessage(id, who) {
  const state = who==='leader' ? data.leader : data.member;
  const msg = state.messages.find(m=>m.id===id) || state.sent.find(m=>m.id===id);
  if (!msg) return;
  msg.unread = false;
  currentMsgId = {id, who};

  document.getElementById('msg-subject').textContent = msg.subject;
  const init = msg.from.split(' ').map(w=>w[0]).slice(0,2).join('');
  document.getElementById('msg-avatar').textContent = init;
  document.getElementById('msg-avatar').style.background = who==='leader'?'linear-gradient(135deg,#1565C0,#0D47A1)':'linear-gradient(135deg,#E8531D,#C94218)';
  document.getElementById('msg-from').textContent = msg.from;
  document.getElementById('msg-to').textContent = 'To: '+(who==='leader'?data.leader.name:data.member.name);
  document.getElementById('msg-time').textContent = msg.time;

  renderThread(msg);
  ALL_PAGES.forEach(p=>{const el=document.getElementById(p+'-page');if(el)el.classList.remove('active')});
  document.getElementById('message-detail-page').classList.add('active');
  currentPage = 'message-detail';
  document.getElementById('topbar-title').textContent = msg.subject;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  updateBadges();
  renderInbox(who);
}

function renderThread(msg) {
  const thread = document.getElementById('msg-thread');
  thread.innerHTML = (msg.thread||[]).map(b=>`
    <div class="bubble-wrap ${b.role==='outgoing'?'out':'in'}">
      <div class="bubble-meta"><span>${b.role==='outgoing'?'You':b.sender}</span><span>${b.time}</span></div>
      <div class="bubble ${b.role==='outgoing'?'out':'in'}">${b.text}</div>
    </div>`).join('');
  setTimeout(()=>{thread.scrollTop=thread.scrollHeight},50);
}

function sendReply() {
  const input = document.getElementById('reply-input');
  const text = input.value.trim();
  if (!text||!currentMsgId) return;
  const {id,who} = currentMsgId;
  const state = who==='leader' ? data.leader : data.member;
  const msg = state.messages.find(m=>m.id===id);
  if (!msg) { showToast('Cannot reply to sent messages.','error'); return; }
  const t = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  msg.thread.push({role:'outgoing',sender:'You',text,time:t});
  input.value=''; input.style.height='auto';
  renderThread(msg);
  const replies=['Got it! Thank you. 🙏','Noted! See you there.','Received. God bless!','Understood, thanks!','Appreciate your response! 😊'];
  setTimeout(()=>{
    const rt = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    msg.thread.push({role:'incoming',sender:msg.from,text:replies[Math.floor(Math.random()*replies.length)],time:rt});
    msg.unread=true; renderThread(msg); updateBadges(); showToast('New reply from '+msg.from+'!','success');
  },1500);
  showToast('Reply sent!','success');
}

function replyKeydown(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendReply();} }

function deleteCurrentMessage() {
  if (!currentMsgId) return;
  const {id,who} = currentMsgId;
  const state = who==='leader' ? data.leader : data.member;
  state.messages = state.messages.filter(m=>m.id!==id);
  showToast('Message deleted.','success');
  goToInbox();
}

function openCompose() { document.getElementById('compose-modal').classList.add('show'); }

function sendComposedMessage() {
  const to = document.getElementById('compose-to').value.trim();
  const subj = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value.trim();
  if (!to||!body) { showToast('Please fill in recipient and message.','error'); return; }
  const t = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  const state = currentRole==='leader' ? data.leader : data.member;
  state.sent.unshift({id:Date.now(),from:'You',to,subject:subj||'(no subject)',body,time:t,unread:false,thread:[{role:'outgoing',sender:'You',text:body,time:t}]});
  document.getElementById('compose-modal').classList.remove('show');
  ['compose-to','compose-subject','compose-body'].forEach(id=>document.getElementById(id).value='');
  showToast('Message sent to '+to+'!','success');
}

// ════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════
function markNotifRead(id, who) {
  const notifs = (who==='leader'?data.leader:data.member).notifications;
  const n = notifs.find(n=>n.id===id); if(n){n.unread=false;renderNotifs(who);updateBadges();}
}

function dismissNotif(e, id, who) {
  e.stopPropagation();
  if (who==='leader') data.leader.notifications=data.leader.notifications.filter(n=>n.id!==id);
  else data.member.notifications=data.member.notifications.filter(n=>n.id!==id);
  renderNotifs(who); updateBadges();
}

function markAllRead(who) {
  (who==='leader'?data.leader:data.member).notifications.forEach(n=>n.unread=false);
  renderNotifs(who); updateBadges(); showToast('All marked as read.','success');
}

// ════════════════════════════════════════
// BADGES
// ════════════════════════════════════════
function updateBadges() {
  const mn = data.member.notifications.filter(n=>n.unread).length;
  const mm = data.member.messages.filter(m=>m.unread).length;
  const ln = data.leader.notifications.filter(n=>n.unread).length;
  const lm = data.leader.messages.filter(m=>m.unread).length;
  setBadge('notif-badge',mn); setBadge('inbox-badge',mm);
  setBadge('leader-notif-badge',ln); setBadge('leader-inbox-badge',lm);
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = ((currentRole==='leader'?ln+lm:mn+mm)>0)?'block':'none';
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count; el.style.display = count ? 'inline-block' : 'none';
}

// ════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════
function switchMemberProfTab(tab) {
  ['about','edit','settings'].forEach(t=>{
    document.getElementById('mpt-'+t).classList.toggle('active',t===tab);
    document.getElementById('mpp-'+t).style.display=t===tab?'block':'none';
  });
  if (tab==='edit') document.getElementById('member-bio-input').value=data.member.bio;
  if (tab==='settings') populateAccountFields('member');
}

function switchLeaderProfTab(tab) {
  ['about','edit','settings'].forEach(t=>{
    document.getElementById('lpt-'+t).classList.toggle('active',t===tab);
    document.getElementById('lpp-'+t).style.display=t===tab?'block':'none';
  });
  if (tab==='edit') document.getElementById('leader-bio-input').value=data.leader.bio;
  if (tab==='settings') populateAccountFields('leader');
}

function saveMemberBio() {
  const t = document.getElementById('member-bio-input').value.trim();
  data.member.bio = t;
  document.getElementById('member-bio-placeholder').style.display=t?'none':'inline';
  const bt=document.getElementById('member-bio-text'); bt.style.display=t?'inline':'none'; bt.textContent=t;
  showToast('Bio saved!','success');
}

function saveLeaderBio() {
  const t = document.getElementById('leader-bio-input').value.trim();
  data.leader.bio = t;
  document.getElementById('leader-bio-placeholder').style.display=t?'none':'inline';
  const bt=document.getElementById('leader-bio-text'); bt.style.display=t?'inline':'none'; bt.textContent=t;
  showToast('Bio saved!','success');
}

function handleMemberAvatar(e) {
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader(); r.onload=ev=>{
    document.getElementById('member-prof-img').src=ev.target.result;
    document.getElementById('member-prof-img').style.display='block';
    document.getElementById('member-prof-svg').style.display='none';
    document.getElementById('sidebar-avatar-img').src=ev.target.result;
    document.getElementById('sidebar-avatar-img').style.display='block';
    document.getElementById('sidebar-avatar-svg').style.display='none';
    showToast('Photo updated!','success');
  }; r.readAsDataURL(file);
}

function handleLeaderAvatar(e) {
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader(); r.onload=ev=>{
    document.getElementById('leader-prof-img').src=ev.target.result;
    document.getElementById('leader-prof-img').style.display='block';
    document.getElementById('leader-prof-svg').style.display='none';
    document.getElementById('sidebar-avatar-img').src=ev.target.result;
    document.getElementById('sidebar-avatar-img').style.display='block';
    document.getElementById('sidebar-avatar-svg').style.display='none';
    showToast('Photo updated!','success');
  }; r.readAsDataURL(file);
}

// ════════════════════════════════════════
// ACCOUNT FIELDS
// ════════════════════════════════════════
function populateAccountFields(who) {
  const elId = who==='leader' ? 'leader-acct-fields' : 'member-acct-fields';
  const el = document.getElementById(elId); if(!el) return;
  const state = who==='leader' ? data.leader : data.member;
  const fields = [
    {key:'name',label:'Full Name',val:state.name,type:'text'},
    {key:'email',label:'Email Address',val:state.email,type:'email'},
    {key:'phone',label:'Phone Number',val:state.phone,type:'tel',inputmode:'numeric',pattern:'[0-9]*'},
    {key:'handle',label:'Username',val:state.handle,type:'text'}
  ];
  el.innerHTML = fields.map(f=>`
    <div class="acct-field">
      <div class="acct-label">${f.label}</div>
      <div class="acct-row">
        <span class="acct-val" id="${who}-val-${f.key}">${f.val}</span>
        <button class="acct-edit-btn" onclick="toggleAcctField('${who}','${f.key}')">Edit</button>
      </div>
      <div class="acct-edit-form" id="${who}-edit-${f.key}">
        <input type="${f.type}" class="finput" id="${who}-input-${f.key}" value="${f.val}"
          ${f.inputmode?'inputmode="'+f.inputmode+'"':''} ${f.pattern?'pattern="'+f.pattern+'"':''}
          ${f.type==='tel'?'oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"':''}/>
        <button class="btn-save" onclick="saveAcctField('${who}','${f.key}')">Save</button>
      </div>
    </div>`).join('');
}

function toggleAcctField(who, key) {
  document.querySelectorAll('.acct-edit-form').forEach(el=>el.classList.remove('show'));
  document.getElementById(who+'-edit-'+key).classList.add('show');
}

function saveAcctField(who, key) {
  const input = document.getElementById(who+'-input-'+key);
  if (!input.value.trim()) { showToast('Field cannot be empty.','error'); return; }
  if (key==='phone') {
    const digits = input.value.replace(/[^0-9]/g,'');
    if (digits.length<7) { showToast('Please enter a valid phone number.','error'); return; }
    input.value = digits;
  }
  const state = who==='leader' ? data.leader : data.member;
  state[key] = input.value.trim();
  document.getElementById(who+'-val-'+key).textContent = input.value.trim();
  document.getElementById(who+'-edit-'+key).classList.remove('show');
  if (key==='name') {
    document.getElementById('sidebar-name').textContent = input.value.trim();
    document.getElementById((who==='leader'?'leader':'member')+'-prof-name').textContent = input.value.trim();
  }
  if (key==='handle') {
    document.getElementById('sidebar-handle').textContent = input.value.trim();
    document.getElementById((who==='leader'?'leader':'member')+'-prof-handle').textContent = input.value.trim();
  }
  showToast('Saved!','success');
}

function showEditNameModal(who) {
  const state = who==='leader' ? data.leader : data.member;
  document.getElementById('edit-name-input').value = state.name;
  editNameCb = () => {
    const n = document.getElementById('edit-name-input').value.trim();
    if (!n) return;
    state.name = n;
    document.getElementById('sidebar-name').textContent = n;
    document.getElementById((who==='leader'?'leader':'member')+'-prof-name').textContent = n;
  };
  document.getElementById('edit-name-modal').classList.add('show');
}

function saveEditName() {
  const n = document.getElementById('edit-name-input').value.trim();
  if (!n) { showToast('Name cannot be empty.','error'); return; }
  if (editNameCb) editNameCb();
  document.getElementById('edit-name-modal').classList.remove('show');
  showToast('Name updated!','success');
}

// ════════════════════════════════════════
// LOGOUT / DELETE
// ════════════════════════════════════════
function handleLogout() {
  // Call logout API
  fetch('/api/logout', { method: 'POST' })
  .then(() => {
    localStorage.removeItem('servesync_user');
    showToast('Logged out successfully.','success');

    // Aggressive field clearing - multiple methods to ensure it works
    const fields = ['login-email', 'login-pw', 'signup-first', 'signup-last', 'signup-email', 'signup-pw', 'signup-confirm'];
    fields.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.value = '';
        element.defaultValue = '';
        // Force clear by dispatching input event
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    setTimeout(()=>{
      document.getElementById('app').classList.remove('visible');
      document.getElementById('auth-page').style.display='flex';
      clearAuthFields(); // Clear fields when auth page is shown
      currentRole = null; currentPage = null;
      setAuthRole('member');

      // Switch to sign-in tab
      switchAuthTab('signin');

      // Clear fields again after the page transition (triple assurance)
      setTimeout(() => {
        clearAuthFields();
      }, 50);
    },400);
  })
  .catch(() => {
    // Even if API fails, logout locally
    localStorage.removeItem('servesync_user');
    showToast('Logged out successfully.','success');
    setTimeout(()=>{
      document.getElementById('app').classList.remove('visible');
      document.getElementById('auth-page').style.display='flex';
      clearAuthFields();
      currentRole = null; currentPage = null;
      setAuthRole('member');
      switchAuthTab('signin');
      setTimeout(() => {
        clearAuthFields();
      }, 50);
    },400);
  });
}

function confirmDelete() {
  document.getElementById('delete-modal').classList.remove('show');
  showToast('Account deleted.','error');
  setTimeout(()=>handleLogout(),800);
}

// ════════════════════════════════════════
// UTILS
// ════════════════════════════════════════
function fmtDate(s) {
  try{const d=new Date(s+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}catch{return s}
}

let toastTimer;
function showToast(msg, type) {
  const t=document.getElementById('toast'); t.textContent=msg; t.className='toast'+(type?' '+type:''); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

function persistCurrentUser() {
  const user = currentRole === 'leader' ? data.leader : data.member;
  localStorage.setItem('servesync_user', JSON.stringify(user));
}

async function persistMemberScheduleState() {
  if (!data.member.id) {
    persistCurrentUser();
    return;
  }

  const responses = await Promise.all([
    fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.member.id, availability: data.member.availability })
    }),
    fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.member.id, schedule: data.member.schedule })
    })
  ]);

  const results = await Promise.all(responses.map(async response => {
    const text = await response.text();
    let payload = {};

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(response.ok ? 'Unexpected server response.' : `Request failed with status ${response.status}.`);
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || `Request failed with status ${response.status}.`);
    }

    return payload;
  }));

  const failedResult = results.find(result => result.error);
  if (failedResult) {
    throw new Error(failedResult.error);
  }

  persistCurrentUser();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.querySelectorAll('.modal-backdrop').forEach(m=>m.classList.remove('show'));}
});

document.addEventListener('DOMContentLoaded',()=>{
  // Check for existing session or stored user
  const storedUser = localStorage.getItem('servesync_user');
  if (storedUser) {
    const user = normalizeUserState(JSON.parse(storedUser));
    if (user.role === 'leader') {
      data.leader = user;
      currentRole = 'leader';
    } else {
      data.member = user;
      currentRole = 'member';
    }
    enterApp(user.role);
  } else {
    // Check session-based auth
    fetch('/api/me')
    .then(response => response.json())
    .then(result => {
      if (result.user) {
        const user = normalizeUserState(result.user);
        localStorage.setItem('servesync_user', JSON.stringify(user));
        if (user.role === 'leader') {
          data.leader = user;
          currentRole = 'leader';
        } else {
          data.member = user;
          currentRole = 'member';
        }
        enterApp(user.role);
      } else {
        // Show auth
        document.getElementById('auth-page').style.display = 'flex';
        document.getElementById('app').classList.remove('visible');
        setAuthRole('member');
        updateBadges();
      }
    })
    .catch(() => {
      // Show auth
      document.getElementById('auth-page').style.display = 'flex';
      document.getElementById('app').classList.remove('visible');
      setAuthRole('member');
      updateBadges();
    });
  }
});
