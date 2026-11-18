let currentUser = null;
let currentGroupId = null;
let currentGroupData = null;

const COLOR_MAP = {
  indigo: { bg: 'bg-[#DCE1F9] dark:bg-indigo-900/80', text: 'text-[#17193B] dark:text-indigo-200' },
  rose: { bg: 'bg-[#F8D7DA] dark:bg-rose-900/80', text: 'text-[#58151C] dark:text-rose-200' },
  cyan: { bg: 'bg-[#BCECEB] dark:bg-cyan-900/80', text: 'text-[#084241] dark:text-cyan-200' },
  amber: { bg: 'bg-[#FCE596] dark:bg-amber-900/80', text: 'text-[#594400] dark:text-amber-200' },
  emerald: { bg: 'bg-[#D1FAE5] dark:bg-emerald-900/80', text: 'text-[#065F46] dark:text-emerald-200' },
  purple: { bg: 'bg-[#EDE9FE] dark:bg-purple-900/80', text: 'text-[#4C1D95] dark:text-purple-200' }
};

const ICON_MAP = {
  home: { icon: 'home', bg: 'bg-[#EEF2FF] dark:bg-indigo-950', text: 'text-[#4F46E5] dark:text-indigo-400' },
  utensils: { icon: 'utensils', bg: 'bg-[#FEF3C7] dark:bg-amber-950', text: 'text-[#D97706] dark:text-amber-400' },
  bike: { icon: 'bike', bg: 'bg-[#CCFBF1] dark:bg-teal-950', text: 'text-[#0D9488] dark:text-teal-400' },
  receipt: { icon: 'receipt', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' }
};

const BULAN_INDO = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function showLoader() {
  const el = document.getElementById('page-loader');
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('flex');
  }
}

function hideLoader() {
  const el = document.getElementById('page-loader');
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const iconEl = document.getElementById('theme-icon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('patungan-theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
}

function formatRupiah(num) {
  return 'Rp' + Math.abs(num).toLocaleString('id-ID');
}

function formatInputRibuan(input) {
  const raw = input.value.replace(/\D/g, '');
  if (!raw) {
    input.value = '';
    return;
  }
  input.value = Number(raw).toLocaleString('id-ID');
}

function parseRibuan(str) {
  return Number(String(str).replace(/\D/g, '')) || 0;
}

function formatTanggalIndo(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const day = Number(parts[2]);
  const month = BULAN_INDO[Number(parts[1]) - 1] || '';
  return `${day} ${month}`;
}

function formatRentangTanggal(startIso, endIso) {
  if (!startIso || !endIso) return '';
  if (startIso === endIso) return formatTanggalIndo(startIso).toUpperCase();
  const s = startIso.split('-');
  const e = endIso.split('-');
  if (s[0] === e[0] && s[1] === e[1]) {
    return `${Number(s[2])}–${Number(e[2])} ${BULAN_INDO[Number(e[1]) - 1].toUpperCase()}`;
  }
  return `${formatTanggalIndo(startIso)} – ${formatTanggalIndo(endIso)}`.toUpperCase();
}

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const gmt7Date = new Date(now.getTime() + (7 * 60 * 60 * 1000) - offset);
  return gmt7Date.toISOString().split('T')[0];
}

function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}

function getAvatarHTML(member, size = 'w-8 h-8 text-xs') {
  const c = COLOR_MAP[member.color] || COLOR_MAP.indigo;
  return `<div title="${member.name}" class="${size} rounded-full ${c.bg} ${c.text} font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shrink-0">${getInitial(member.name)}</div>`;
}

async function init() {
  showLoader();
  updateThemeIcon();

  try {
    const meRes = await fetch('/api/me');
    const meData = await meRes.json();

    if (!meData.user) {
      window.location.href = '/login.html';
      return;
    }

    currentUser = meData.user;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-avatar').textContent = getInitial(currentUser.name);

    await loadGroups();
    lucide.createIcons();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function loadGroups(selectId = null) {
  const res = await fetch('/api/groups');
  const { groups } = await res.json();

  const tabsDesktopEl = document.getElementById('group-tabs-desktop');
  const tabsMobileEl = document.getElementById('group-tabs-mobile');
  const emptyStateEl = document.getElementById('empty-state');
  const dashboardEl = document.getElementById('dashboard-content');

  if (groups.length === 0) {
    currentGroupId = null;
    currentGroupData = null;
    tabsDesktopEl.innerHTML = '';
    tabsMobileEl.innerHTML = '';
    dashboardEl.classList.add('hidden');
    emptyStateEl.classList.remove('hidden');
    lucide.createIcons();
    return;
  }

  emptyStateEl.classList.add('hidden');
  dashboardEl.classList.remove('hidden');

  const validTarget = groups.find(g => g.id === (selectId || currentGroupId));
  currentGroupId = validTarget ? validTarget.id : groups[0].id;

  const tabsHTML = groups
    .map(g => {
      const active = g.id === currentGroupId;
      return `<button onclick="switchGroup(${g.id})" class="px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${
        active
          ? 'bg-[#191B42] dark:bg-[#4F46E5] text-white shadow-xs'
          : 'bg-[#ECEEF5] dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }">${g.title}</button>`;
    })
    .join('');

  tabsDesktopEl.innerHTML = tabsHTML;
  tabsMobileEl.innerHTML = tabsHTML;

  await loadGroupDetail(currentGroupId);
}

async function switchGroup(groupId) {
  showLoader();
  currentGroupId = groupId;
  await loadGroups(groupId);
  hideLoader();
}

async function loadGroupDetail(groupId) {
  const res = await fetch(`/api/groups/${groupId}`);
  const data = await res.json();
  currentGroupData = data;

  const dateRangeStr = formatRentangTanggal(data.group.start_date, data.group.end_date);
  document.getElementById('hero-date').textContent = `${data.group.title.toUpperCase()} • ${dateRangeStr}`;
  document.getElementById('hero-total').textContent = formatRupiah(data.totalExpense);
  document.getElementById('hero-subtitle').textContent =
    `Total pengeluaran dari ${data.expenses.length} transaksi, rata-rata ${formatRupiah(data.averagePerPerson)} per orang.`;

  document.getElementById('hero-avatars').innerHTML = data.members
    .map(m => {
      const c = COLOR_MAP[m.color] || COLOR_MAP.indigo;
      return `<div class="w-8 h-8 rounded-full ${c.bg} ${c.text} font-bold text-xs flex items-center justify-center ring-2 ring-[#191B42]">${getInitial(m.name)}</div>`;
    })
    .join('');

  document.getElementById('hero-member-names').textContent = data.members.map(m => m.name).join(', ');

  document.getElementById('my-account-label').textContent = currentUser.name;
  const myBalanceObj =
    data.balances.find(b => b.name.toLowerCase() === currentUser.name.toLowerCase()) || data.balances[0];
  const posAmountEl = document.getElementById('my-position-amount');
  const posDescEl = document.getElementById('my-position-desc');

  if (myBalanceObj) {
    if (myBalanceObj.balance > 0) {
      posAmountEl.textContent = `+${formatRupiah(myBalanceObj.balance)}`;
      posAmountEl.className = 'text-2xl sm:text-3xl font-extrabold text-[#4DD4D0] tracking-tight';
      const debtors = data.balances
        .filter(b => b.balance < 0 && b.name.toLowerCase() !== currentUser.name.toLowerCase())
        .map(b => b.name);
      posDescEl.textContent =
        debtors.length > 0
          ? `Kamu menalangi lebih dulu. ${debtors.join(' dan ')} masih berutang ke kamu.`
          : 'Kamu menalangi lebih dulu.';
    } else if (myBalanceObj.balance < 0) {
      posAmountEl.textContent = `-${formatRupiah(myBalanceObj.balance)}`;
      posAmountEl.className = 'text-2xl sm:text-3xl font-extrabold text-amber-400 tracking-tight';
      posDescEl.textContent = 'Kamu memiliki bagian tagihan yang perlu dilunasi.';
    } else {
      posAmountEl.textContent = 'Rp0';
      posAmountEl.className = 'text-2xl sm:text-3xl font-extrabold text-emerald-300 tracking-tight';
      posDescEl.textContent = 'Semua tagihanmu di grup ini sudah lunas.';
    }
  }

  document.getElementById('expense-count').textContent = `${data.expenses.length} transaksi`;
  const expenseListEl = document.getElementById('expense-list');

  if (data.expenses.length === 0) {
    expenseListEl.innerHTML = `<p class="text-xs sm:text-sm text-slate-400 text-center py-8">Belum ada pengeluaran di grup ini. Klik <b>+ Tambah pengeluaran</b> untuk mulai mencatat.</p>`;
  } else {
    expenseListEl.innerHTML = data.expenses
      .map(exp => {
        const ic = ICON_MAP[exp.category] || ICON_MAP.receipt;
        const perPerson = exp.splits.length > 0 ? Math.round(exp.amount / exp.splits.length) : exp.amount;
        const splitAvatars = exp.splits.map(s => getAvatarHTML(s, 'w-5 h-5 sm:w-6 sm:h-6 text-[10px]')).join('');
        const dateLabel = formatTanggalIndo(exp.expense_date);

        return `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition border border-slate-100/80 dark:border-slate-800/80 sm:border-transparent sm:border-b sm:border-b-slate-100 dark:sm:border-b-slate-800 last:border-none">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl ${ic.bg} ${ic.text} flex items-center justify-center shrink-0">
              <i data-lucide="${ic.icon}" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-bold text-[#17193B] dark:text-white truncate">${exp.title}</h4>
              <p class="text-xs text-slate-400 truncate">Dibayar ${exp.paid_by_name} • ${dateLabel}</p>
            </div>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-3 pl-13 sm:pl-0 pt-1 sm:pt-0 border-t sm:border-none border-slate-100 dark:border-slate-800/80 shrink-0">
            <div class="flex items-center -space-x-1">
              ${splitAvatars}
            </div>
            <div class="flex items-center gap-2.5">
              <div class="text-right">
                <p class="text-sm font-extrabold text-[#17193B] dark:text-white">${formatRupiah(exp.amount)}</p>
                <p class="text-[11px] text-slate-400">${formatRupiah(perPerson)} / orang</p>
              </div>
              <div class="flex items-center gap-0.5 ml-1">
                <button onclick="openEditExpenseModal(${exp.id})" title="Edit Pengeluaran" class="p-1.5 rounded-lg text-slate-400 hover:text-[#4F46E5] dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteExpense(${exp.id})" title="Hapus Pengeluaran" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  const maxAbs = Math.max(...data.balances.map(b => Math.abs(b.balance)), 1);
  document.getElementById('balance-bars').innerHTML = data.balances
    .map(b => {
      const pct = Math.min(100, Math.round((Math.abs(b.balance) / maxAbs) * 100));
      let leftBar = '';
      let rightBar = '';
      let labelHTML = `<span class="text-xs font-semibold text-slate-400">Lunas</span>`;

      if (b.balance > 0) {
        rightBar = `<div style="width: ${pct}%" class="h-full bg-[#1098AD] dark:bg-[#22B8CF] rounded-r-full"></div>`;
        labelHTML = `<span class="text-xs font-extrabold text-[#0B7285] dark:text-[#4DD4D0]">+${formatRupiah(b.balance)}</span>`;
      } else if (b.balance < 0) {
        leftBar = `<div style="width: ${pct}%" class="h-full bg-[#C85A17] dark:bg-amber-500 rounded-l-full ml-auto"></div>`;
        labelHTML = `<span class="text-xs font-extrabold text-[#C85A17] dark:text-amber-400">-${formatRupiah(b.balance)}</span>`;
      }

      return `
      <div class="grid grid-cols-12 items-center gap-2 sm:gap-3">
        <span class="col-span-3 text-xs font-bold text-[#17193B] dark:text-slate-200 truncate">${b.name}</span>
        <div class="col-span-5 flex items-center h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div class="w-1/2 h-full flex justify-end border-r border-slate-300 dark:border-slate-600">${leftBar}</div>
          <div class="w-1/2 h-full flex justify-start">${rightBar}</div>
        </div>
        <div class="col-span-4 text-right truncate">${labelHTML}</div>
      </div>
    `;
    })
    .join('');

  const settleSubEl = document.getElementById('settle-subtitle');
  const settleListEl = document.getElementById('settle-list');

  const pending = data.pendingTransactions || [];
  const settled = data.settledTransactions || [];

  if (pending.length === 0 && settled.length === 0) {
    settleSubEl.textContent = 'Belum ada tagihan yang perlu dilunasi.';
    settleListEl.innerHTML = `<div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-medium text-center">Semua saldo masih Rp0.</div>`;
  } else {
    settleSubEl.textContent =
      pending.length > 0
        ? `Cukup ${pending.length} transfer untuk menyelesaikan semuanya.`
        : 'Semua tagihan sudah selesai dilunasi.';

    const pendingHTML = pending
      .map(
        tx => `
      <div class="flex items-center justify-between gap-2 p-3 rounded-2xl bg-[#F4F5FA] dark:bg-slate-800/80">
        <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
          ${getAvatarHTML(tx.from, 'w-7 h-7 text-xs')}
          <span class="text-slate-400 text-xs">→</span>
          ${getAvatarHTML(tx.to, 'w-7 h-7 text-xs')}
          <span class="text-xs font-extrabold text-[#17193B] dark:text-white ml-1 truncate">${formatRupiah(tx.amount)}</span>
        </div>
        <button onclick="markSettled(${tx.from.id}, ${tx.to.id}, ${tx.amount})" class="bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold px-3 sm:px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs shrink-0">
          <i data-lucide="check" class="w-3.5 h-3.5"></i> Tandai lunas
        </button>
      </div>
    `
      )
      .join('');

    const settledHTML = settled
      .map(
        tx => `
      <div class="flex items-center justify-between gap-2 p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
        <div class="flex items-center gap-1.5 sm:gap-2 opacity-80 min-w-0">
          ${getAvatarHTML(tx.from, 'w-7 h-7 text-xs')}
          <span class="text-emerald-600 dark:text-emerald-400 text-xs">→</span>
          ${getAvatarHTML(tx.to, 'w-7 h-7 text-xs')}
          <span class="text-xs font-bold text-slate-600 dark:text-slate-400 line-through ml-1 truncate">${formatRupiah(tx.amount)}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Lunas
          </span>
          <button onclick="undoSettled(${tx.settlementId})" title="Batalkan status lunas" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `
      )
      .join('');

    settleListEl.innerHTML = pendingHTML + settledHTML;
  }

  if (!document.getElementById('modal-member').classList.contains('hidden')) {
    renderMemberManageList();
  }

  lucide.createIcons();
}

function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.classList.add('flex');
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.add('hidden');
  el.classList.remove('flex');
}

function openGroupModal() {
  document.getElementById('modal-group-title').textContent = 'Buat Grup Patungan Baru';
  document.getElementById('group-edit-id').value = '';
  document.getElementById('group-title').value = '';
  const today = getTodayISO();
  document.getElementById('group-start-date').value = today;
  document.getElementById('group-end-date').value = today;
  openModal('modal-group');
}

function openEditGroupModal() {
  if (!currentGroupData) return;
  const g = currentGroupData.group;
  document.getElementById('modal-group-title').textContent = 'Edit Grup Patungan';
  document.getElementById('group-edit-id').value = g.id;
  document.getElementById('group-title').value = g.title;
  document.getElementById('group-start-date').value = g.start_date;
  document.getElementById('group-end-date').value = g.end_date;
  openModal('modal-group');
}

async function submitGroup(e) {
  e.preventDefault();
  showLoader();
  const editId = document.getElementById('group-edit-id').value;
  const title = document.getElementById('group-title').value;
  const start_date = document.getElementById('group-start-date').value;
  const end_date = document.getElementById('group-end-date').value;

  const url = editId ? `/api/groups/${editId}` : '/api/groups';
  const method = editId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, start_date, end_date })
    });

    if (res.ok) {
      const data = await res.json();
      closeModal('modal-group');
      await loadGroups(editId ? Number(editId) : data.groupId);
    } else {
      const err = await res.json();
      alert(err.error || 'Gagal menyimpan grup');
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function deleteCurrentGroup() {
  if (!currentGroupData) return;
  const ok = confirm(
    `Yakin ingin menghapus grup "${currentGroupData.group.title}" beserta seluruh transaksi di dalamnya?`
  );
  if (!ok) return;

  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}`, { method: 'DELETE' });
    if (res.ok) {
      currentGroupId = null;
      await loadGroups();
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

function openMemberModal() {
  renderMemberManageList();
  openModal('modal-member');
  lucide.createIcons();
}

function renderMemberManageList() {
  if (!currentGroupData) return;
  const container = document.getElementById('member-manage-list');
  container.innerHTML = currentGroupData.members
    .map(
      m => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
      <div class="flex items-center gap-2.5">
        ${getAvatarHTML(m, 'w-7 h-7 text-xs')}
        <span class="text-sm font-bold text-[#17193B] dark:text-white">${m.name}</span>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="editMember(${m.id}, '${m.name.replace(/'/g, "\\'")}')" title="Edit Nama" class="p-1.5 text-slate-400 hover:text-[#4F46E5] dark:hover:text-indigo-400 rounded-lg transition">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteMember(${m.id}, '${m.name.replace(/'/g, "\\'")}')" title="Hapus Anggota" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `
    )
    .join('');
  lucide.createIcons();
}

async function submitMember(e) {
  e.preventDefault();
  showLoader();
  const nameInput = document.getElementById('member-name');
  const name = nameInput.value;

  try {
    const res = await fetch(`/api/groups/${currentGroupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      nameInput.value = '';
      await loadGroupDetail(currentGroupId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function editMember(memberId, oldName) {
  const newName = prompt('Ubah nama anggota:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;

  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/members/${memberId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() })
    });

    if (res.ok) {
      await loadGroupDetail(currentGroupId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function deleteMember(memberId, memberName) {
  const ok = confirm(`Hapus anggota "${memberName}" dari grup ini?`);
  if (!ok) return;

  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/members/${memberId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadGroupDetail(currentGroupId);
    } else {
      const err = await res.json();
      alert(err.error || 'Gagal menghapus anggota');
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

function openExpenseModal() {
  if (!currentGroupData) return;
  document.getElementById('modal-expense-title').textContent = 'Tambah Pengeluaran';
  document.getElementById('exp-id').value = '';
  document.getElementById('exp-title').value = '';
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-category').value = 'home';
  document.getElementById('exp-date').value = getTodayISO();

  const members = currentGroupData.members;
  document.getElementById('exp-paid-by').innerHTML = members
    .map(m => `<option value="${m.id}">${m.name}</option>`)
    .join('');
  document.getElementById('exp-split-members').innerHTML = members
    .map(
      m => `
    <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-950/80 has-[:checked]:border-[#4F46E5] has-[:checked]:text-[#4F46E5] dark:has-[:checked]:text-indigo-300">
      <input type="checkbox" name="split_member" value="${m.id}" checked class="accent-[#4F46E5]">
      ${m.name}
    </label>
  `
    )
    .join('');

  openModal('modal-expense');
}

function openEditExpenseModal(expenseId) {
  if (!currentGroupData) return;
  const exp = currentGroupData.expenses.find(e => e.id === expenseId);
  if (!exp) return;

  document.getElementById('modal-expense-title').textContent = 'Edit Pengeluaran';
  document.getElementById('exp-id').value = exp.id;
  document.getElementById('exp-title').value = exp.title;
  document.getElementById('exp-amount').value = Number(exp.amount).toLocaleString('id-ID');
  document.getElementById('exp-category').value = exp.category;
  document.getElementById('exp-date').value = exp.expense_date;

  const members = currentGroupData.members;
  const splitIds = exp.splits.map(s => s.id);

  document.getElementById('exp-paid-by').innerHTML = members
    .map(m => `<option value="${m.id}" ${m.id === exp.paid_by_member_id ? 'selected' : ''}>${m.name}</option>`)
    .join('');

  document.getElementById('exp-split-members').innerHTML = members
    .map(
      m => `
    <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-950/80 has-[:checked]:border-[#4F46E5] has-[:checked]:text-[#4F46E5] dark:has-[:checked]:text-indigo-300">
      <input type="checkbox" name="split_member" value="${m.id}" ${splitIds.includes(m.id) ? 'checked' : ''} class="accent-[#4F46E5]">
      ${m.name}
    </label>
  `
    )
    .join('');

  openModal('modal-expense');
}

async function submitExpense(e) {
  e.preventDefault();
  showLoader();
  const editId = document.getElementById('exp-id').value;
  const title = document.getElementById('exp-title').value;
  const amount = parseRibuan(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value;
  const paid_by_member_id = document.getElementById('exp-paid-by').value;
  const expense_date = document.getElementById('exp-date').value;
  const split_member_ids = Array.from(document.querySelectorAll('input[name="split_member"]:checked')).map(cb =>
    Number(cb.value)
  );

  const url = editId ? `/api/groups/${currentGroupId}/expenses/${editId}` : `/api/groups/${currentGroupId}/expenses`;
  const method = editId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, amount, category, paid_by_member_id, split_member_ids, expense_date })
    });

    if (res.ok) {
      closeModal('modal-expense');
      await loadGroupDetail(currentGroupId);
    } else {
      const err = await res.json();
      alert(err.error || 'Gagal menyimpan pengeluaran');
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function deleteExpense(expenseId) {
  const ok = confirm('Hapus catatan pengeluaran ini?');
  if (!ok) return;

  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/expenses/${expenseId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadGroupDetail(currentGroupId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function markSettled(fromId, toId, amount) {
  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_member_id: fromId, to_member_id: toId, amount })
    });

    if (res.ok) {
      await loadGroupDetail(currentGroupId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function undoSettled(settlementId) {
  showLoader();
  try {
    const res = await fetch(`/api/groups/${currentGroupId}/settle/${settlementId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadGroupDetail(currentGroupId);
    }
  } catch (err) {
    console.error(err);
  } finally {
    hideLoader();
  }
}

async function logout() {
  showLoader();
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

init();