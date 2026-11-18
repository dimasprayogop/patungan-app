import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

const db = new DatabaseSync(path.join(dataPath, 'database.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'indigo',
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'receipt',
    amount INTEGER NOT NULL,
    paid_by_member_id INTEGER NOT NULL,
    expense_date TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by_member_id) REFERENCES group_members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    share_amount INTEGER NOT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES group_members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    from_member_id INTEGER NOT NULL,
    to_member_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    settled_at DATETIME DEFAULT (datetime('now', '+7 hours')),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (from_member_id) REFERENCES group_members(id) ON DELETE CASCADE,
    FOREIGN KEY (to_member_id) REFERENCES group_members(id) ON DELETE CASCADE
  );
`);

function resequenceTable(tableName) {
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY id ASC`).all();
    if (rows.length === 0) {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tableName);
      return;
    }
    
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN TRANSACTION;');
    
    try {
      db.exec(`DELETE FROM ${tableName}`);
      
      let newId = 1;
      for (const row of rows) {
        row.id = newId++;
        const keys = Object.keys(row);
        const values = keys.map(k => row[k]);
        const placeholders = keys.map(() => '?').join(', ');
        
        db.prepare(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
      }
      db.exec('COMMIT;');
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw txErr;
    }

    db.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    db.exec('PRAGMA foreign_keys = ON;');
    console.error(`Gagal resequence tabel ${tableName}:`, err);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia-patungan-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  }
  next();
};

function verifyGroupOwner(groupId, userId) {
  return db.prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(groupId, userId);
}

function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  balances.forEach(b => {
    if (b.balance < 0) debtors.push({ ...b, amount: Math.abs(b.balance) });
    else if (b.balance > 0) creditors.push({ ...b, amount: b.balance });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);
    if (settleAmount > 0) {
      transactions.push({
        from: { id: debtors[i].id, name: debtors[i].name, color: debtors[i].color },
        to: { id: creditors[j].id, name: creditors[j].name, color: creditors[j].color },
        amount: settleAmount,
        settled: false
      });
    }

    debtors[i].amount -= settleAmount;
    creditors[j].amount -= settleAmount;

    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return transactions;
}

app.post('/api/register', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2, 'Nama minimal 2 karakter'),
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword']
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { name, email, password } = parsed.data;
    const hashed = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(
      name.trim(),
      email.toLowerCase().trim(),
      hashed
    );
    req.session.user = { id: Number(info.lastInsertRowid), name: name.trim(), email: email.toLowerCase().trim() };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(400).json({ error: 'Email sudah terdaftar. Gunakan email lain.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Email atau password salah.' });
  }

  req.session.user = { id: user.id, name: user.name, email: user.email };
  res.json({ success: true, user: req.session.user });
});

app.post('/api/forgot-password', async (req, res) => {
  const schema = z.object({
    email: z.string().email('Format email tidak valid'),
    newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
    confirmNewPassword: z.string()
  }).refine(data => data.newPassword === data.confirmNewPassword, {
    message: 'Konfirmasi password baru tidak cocok'
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, newPassword } = parsed.data;
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(404).json({ error: 'Email tidak ditemukan di sistem.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  res.json({ success: true, message: 'Password berhasil diperbarui! Silakan masuk dengan password baru.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/groups', requireAuth, (req, res) => {
  const groups = db.prepare('SELECT * FROM groups WHERE user_id = ? ORDER BY id ASC').all(req.session.user.id);
  res.json({ groups });
});

app.post('/api/groups', requireAuth, (req, res) => {
  const { title, start_date, end_date } = req.body;
  if (!title || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nama grup, tanggal mulai, dan tanggal selesai wajib diisi.' });
  }

  const info = db.prepare('INSERT INTO groups (user_id, title, start_date, end_date) VALUES (?, ?, ?, ?)').run(
    req.session.user.id,
    title.trim(),
    start_date,
    end_date
  );
  const groupId = Number(info.lastInsertRowid);

  db.prepare('INSERT INTO group_members (group_id, name, color) VALUES (?, ?, ?)').run(
    groupId,
    req.session.user.name,
    'indigo'
  );

  res.json({ success: true, groupId });
});

app.put('/api/groups/:id', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!verifyGroupOwner(groupId, req.session.user.id)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }

  const { title, start_date, end_date } = req.body;
  if (!title || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nama grup dan rentang tanggal wajib diisi.' });
  }

  db.prepare('UPDATE groups SET title = ?, start_date = ?, end_date = ? WHERE id = ?').run(
    title.trim(),
    start_date,
    end_date,
    groupId
  );
  res.json({ success: true });
});

app.delete('/api/groups/:id', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!verifyGroupOwner(groupId, req.session.user.id)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }

  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  resequenceTable('groups');
  res.json({ success: true });
});

app.get('/api/groups/:id', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const group = verifyGroupOwner(groupId, req.session.user.id);
  if (!group) return res.status(404).json({ error: 'Grup tidak ditemukan' });

  const members = db.prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY id ASC').all(groupId);
  const expenses = db.prepare(`
    SELECT e.*, gm.name as paid_by_name, gm.color as paid_by_color
    FROM expenses e
    JOIN group_members gm ON e.paid_by_member_id = gm.id
    WHERE e.group_id = ?
    ORDER BY e.expense_date DESC, e.id DESC
  `).all(groupId);

  const expensesWithSplits = expenses.map(exp => {
    const splits = db.prepare(`
      SELECT es.share_amount, gm.id, gm.name, gm.color
      FROM expense_splits es
      JOIN group_members gm ON es.member_id = gm.id
      WHERE es.expense_id = ?
    `).all(exp.id);
    return { ...exp, splits };
  });

  const balanceMap = {};
  members.forEach(m => {
    balanceMap[m.id] = { id: m.id, name: m.name, color: m.color, paid: 0, owed: 0, balance: 0 };
  });

  expensesWithSplits.forEach(exp => {
    if (balanceMap[exp.paid_by_member_id]) {
      balanceMap[exp.paid_by_member_id].paid += exp.amount;
    }
    exp.splits.forEach(sp => {
      if (balanceMap[sp.id]) {
        balanceMap[sp.id].owed += sp.share_amount;
      }
    });
  });

  const settlements = db.prepare(`
    SELECT s.*,
           mf.name as from_name, mf.color as from_color,
           mt.name as to_name, mt.color as to_color
    FROM settlements s
    JOIN group_members mf ON s.from_member_id = mf.id
    JOIN group_members mt ON s.to_member_id = mt.id
    WHERE s.group_id = ?
    ORDER BY s.id DESC
  `).all(groupId);

  settlements.forEach(st => {
    if (balanceMap[st.from_member_id]) balanceMap[st.from_member_id].paid += st.amount;
    if (balanceMap[st.to_member_id]) balanceMap[st.to_member_id].owed += st.amount;
  });

  const balances = Object.values(balanceMap).map(b => ({
    ...b,
    balance: b.paid - b.owed
  }));

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const averagePerPerson = members.length > 0 ? Math.round(totalExpense / members.length) : 0;
  const pendingTransactions = simplifyDebts(balances);

  const settledTransactions = settlements.map(st => ({
    settlementId: st.id,
    from: { id: st.from_member_id, name: st.from_name, color: st.from_color },
    to: { id: st.to_member_id, name: st.to_name, color: st.to_color },
    amount: st.amount,
    settled: true
  }));

  res.json({
    group,
    members,
    expenses: expensesWithSplits,
    balances,
    totalExpense,
    averagePerPerson,
    pendingTransactions,
    settledTransactions
  });
});

app.post('/api/groups/:id/members', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama anggota wajib diisi' });

  const colors = ['indigo', 'rose', 'cyan', 'amber', 'emerald', 'purple'];
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(groupId).c;
  const chosenColor = colors[existingCount % colors.length];

  db.prepare('INSERT INTO group_members (group_id, name, color) VALUES (?, ?, ?)').run(groupId, name.trim(), chosenColor);
  res.json({ success: true });
});

app.put('/api/groups/:id/members/:memberId', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama anggota wajib diisi' });

  db.prepare('UPDATE group_members SET name = ? WHERE id = ? AND group_id = ?').run(name.trim(), memberId, groupId);
  res.json({ success: true });
});

app.delete('/api/groups/:id/members/:memberId', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const totalMembers = db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(groupId).c;
  if (totalMembers <= 1) {
    return res.status(400).json({ error: 'Minimal harus ada 1 anggota di dalam grup.' });
  }

  db.prepare('DELETE FROM group_members WHERE id = ? AND group_id = ?').run(memberId, groupId);
  resequenceTable('group_members');
  res.json({ success: true });
});

app.post('/api/groups/:id/expenses', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const { title, category, amount, paid_by_member_id, split_member_ids, expense_date } = req.body;
  const parsedAmount = Number(amount);

  if (!title || !parsedAmount || parsedAmount <= 0 || !paid_by_member_id || !expense_date || !Array.isArray(split_member_ids) || split_member_ids.length === 0) {
    return res.status(400).json({ error: 'Lengkapi semua data pengeluaran, tanggal, dan pilih minimal 1 peserta patungan.' });
  }

  const expInfo = db.prepare(`
    INSERT INTO expenses (group_id, title, category, amount, paid_by_member_id, expense_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(groupId, title.trim(), category || 'receipt', parsedAmount, Number(paid_by_member_id), expense_date);

  const expenseId = Number(expInfo.lastInsertRowid);
  const count = split_member_ids.length;
  const baseShare = Math.floor(parsedAmount / count);
  const remainder = parsedAmount % count;

  split_member_ids.forEach((memberId, index) => {
    const share = baseShare + (index < remainder ? 1 : 0);
    db.prepare('INSERT INTO expense_splits (expense_id, member_id, share_amount) VALUES (?, ?, ?)').run(
      expenseId,
      Number(memberId),
      share
    );
  });

  res.json({ success: true });
});

app.put('/api/groups/:id/expenses/:expenseId', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const expenseId = Number(req.params.expenseId);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const { title, category, amount, paid_by_member_id, split_member_ids, expense_date } = req.body;
  const parsedAmount = Number(amount);

  if (!title || !parsedAmount || parsedAmount <= 0 || !paid_by_member_id || !expense_date || !Array.isArray(split_member_ids) || split_member_ids.length === 0) {
    return res.status(400).json({ error: 'Lengkapi semua data pengeluaran.' });
  }

  db.prepare(`
    UPDATE expenses
    SET title = ?, category = ?, amount = ?, paid_by_member_id = ?, expense_date = ?
    WHERE id = ? AND group_id = ?
  `).run(title.trim(), category || 'receipt', parsedAmount, Number(paid_by_member_id), expense_date, expenseId, groupId);

  db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(expenseId);
  const count = split_member_ids.length;
  const baseShare = Math.floor(parsedAmount / count);
  const remainder = parsedAmount % count;

  split_member_ids.forEach((memberId, index) => {
    const share = baseShare + (index < remainder ? 1 : 0);
    db.prepare('INSERT INTO expense_splits (expense_id, member_id, share_amount) VALUES (?, ?, ?)').run(
      expenseId,
      Number(memberId),
      share
    );
  });

  res.json({ success: true });
});

app.delete('/api/groups/:id/expenses/:expenseId', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const expenseId = Number(req.params.expenseId);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  db.prepare('DELETE FROM expenses WHERE id = ? AND group_id = ?').run(expenseId, groupId);
  resequenceTable('expenses');
  resequenceTable('expense_splits');
  res.json({ success: true });
});

app.post('/api/groups/:id/settle', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  const { from_member_id, to_member_id, amount } = req.body;
  db.prepare('INSERT INTO settlements (group_id, from_member_id, to_member_id, amount) VALUES (?, ?, ?, ?)').run(
    groupId,
    Number(from_member_id),
    Number(to_member_id),
    Number(amount)
  );

  res.json({ success: true });
});

app.delete('/api/groups/:id/settle/:settlementId', requireAuth, (req, res) => {
  const groupId = Number(req.params.id);
  const settlementId = Number(req.params.settlementId);
  if (!verifyGroupOwner(groupId, req.session.user.id)) return res.status(403).json({ error: 'Akses ditolak' });

  db.prepare('DELETE FROM settlements WHERE id = ? AND group_id = ?').run(settlementId, groupId);
  resequenceTable('settlements');
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Server Patungan berjalan di http://localhost:${PORT}`);
});
