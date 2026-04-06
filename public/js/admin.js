let adminToken = localStorage.getItem('safetymap_admin_token');
let adminName = localStorage.getItem('safetymap_admin_name');
let allAdminReports = [];

const CATEGORY_COLORS = {
  '環境': '#4CAF50', '交通・道路': '#2196F3', '災害': '#F44336', '防災': '#FF9800', 'その他': '#9E9E9E'
};
const STATUS_MAP = { published: '公開', hidden: '非公開', resolved: '対応済' };

document.addEventListener('DOMContentLoaded', () => { if (adminToken) showDashboard(); });

// === 認証 ===
async function handleAdminLogin(e) {
  e.preventDefault();
  try {
    const res = await fetch('/api/auth/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('adminUsername').value, password: document.getElementById('adminPassword').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    adminToken = data.token; adminName = data.admin.display_name;
    localStorage.setItem('safetymap_admin_token', adminToken);
    localStorage.setItem('safetymap_admin_name', adminName);
    showDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

function adminLogout() {
  adminToken = null; adminName = null;
  localStorage.removeItem('safetymap_admin_token');
  localStorage.removeItem('safetymap_admin_name');
  document.getElementById('adminLoginSection').style.display = 'block';
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('adminLogoutBtn').style.display = 'none';
  document.getElementById('adminInfo').textContent = '';
}

function showDashboard() {
  document.getElementById('adminLoginSection').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  document.getElementById('adminLogoutBtn').style.display = 'inline-block';
  document.getElementById('adminInfo').textContent = adminName;
  loadStats(); loadAdminReports();
}

// === タブ切替 ===
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'users') loadAdminUsers();
  if (name === 'backup') loadBackupList();
  if (name === 'settings') loadAreaSettings();
}

// === 統計 ===
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) { if (res.status === 401) adminLogout(); return; }
    const s = await res.json();
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card"><div class="number">${s.totalReports}</div><div class="label">総投稿数</div></div>
      <div class="stat-card"><div class="number">${s.totalUsers}</div><div class="label">登録ユーザー</div></div>
      ${s.byCategory.map(c => `<div class="stat-card"><div class="number" style="color:${CATEGORY_COLORS[c.category]||'#333'}">${c.count}</div><div class="label">${esc(c.category)}</div></div>`).join('')}
    `;
  } catch (err) { console.error(err); }
}

// === 投稿管理 ===
async function loadAdminReports() {
  try {
    const cat = document.getElementById('filterCategory').value;
    const st = document.getElementById('filterStatus').value;
    let url = '/api/admin/reports?';
    if (cat) url += `category=${encodeURIComponent(cat)}&`;
    if (st) url += `status=${encodeURIComponent(st)}&`;
    const res = await fetch(url, { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) { if (res.status === 401) adminLogout(); return; }
    allAdminReports = await res.json();
    renderReportsTable(allAdminReports);
  } catch (err) { showToast('データ読み込み失敗', 'error'); }
}

function renderReportsTable(reports) {
  const tbody = document.getElementById('reportsTable');
  if (!reports.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:40px">投稿がありません</td></tr>'; return; }
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td><span class="report-category-badge" style="background:${CATEGORY_COLORS[r.category]||'#999'}">${esc(r.category)}</span></td>
      <td><strong>${esc(r.title)}</strong>${r.photo1_url ? ' <span style="color:#999;font-size:11px">[写真]</span>' : ''}</td>
      <td><a href="#" onclick="showAuthorDetail('${r.user_id}');return false" style="color:#1a73e8">${esc(r.author_name)}</a></td>
      <td><span class="status-badge status-${r.status}">${STATUS_MAP[r.status]||r.status}</span></td>
      <td style="font-size:13px">${fmtDate(r.created_at)}</td>
      <td>
        <div class="admin-actions">
          <button onclick="openEditModal('${r.id}','${escA(r.category)}','${escA(r.title)}','${escA(r.description||'')}','${r.status}')">編集</button>
          <button class="delete" onclick="deleteReport('${r.id}')">削除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// 投稿者詳細
async function showAuthorDetail(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}`, { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) throw new Error('取得エラー');
    const u = await res.json();
    document.getElementById('authorDetail').innerHTML = `
      <div class="detail-row"><div class="detail-label">表示名</div><div class="detail-value">${esc(u.display_name)}</div></div>
      <div class="detail-row"><div class="detail-label">本名</div><div class="detail-value">${esc(u.real_name || '未登録')}</div></div>
      <div class="detail-row"><div class="detail-label">メール</div><div class="detail-value">${esc(u.email)}</div></div>
      <div class="detail-row"><div class="detail-label">住所</div><div class="detail-value">${esc(u.address || '未登録')}</div></div>
      <div class="detail-row"><div class="detail-label">電話番号</div><div class="detail-value">${esc(u.phone || '未登録')}</div></div>
      <div class="detail-row"><div class="detail-label">登録日</div><div class="detail-value">${fmtDate(u.created_at)}</div></div>
      <div class="detail-row"><div class="detail-label">投稿数</div><div class="detail-value">${u.reports ? u.reports.length : 0}件</div></div>
      ${u.reports && u.reports.length ? '<h3 style="margin-top:16px;font-size:14px">この投稿者の投稿一覧</h3>' +
        u.reports.map(r => `<div class="report-card" style="cursor:default"><div class="report-card-header"><span class="report-category-badge" style="background:${CATEGORY_COLORS[r.category]||'#999'}">${esc(r.category)}</span><span class="status-badge status-${r.status}" style="margin-left:6px">${STATUS_MAP[r.status]||r.status}</span></div><div class="report-card-title">${esc(r.title)}</div><div class="report-card-meta">${fmtDate(r.created_at)} / 座標: ${r.latitude}, ${r.longitude}</div></div>`).join('') : ''}
    `;
    document.getElementById('authorModal').classList.remove('hidden');
  } catch (err) { showToast(err.message, 'error'); }
}

// 投稿編集
function openEditModal(id, category, title, description, status) {
  document.getElementById('editId').value = id;
  document.getElementById('editCategory').value = category;
  document.getElementById('editTitle').value = title;
  document.getElementById('editDescription').value = description;
  document.getElementById('editStatus').value = status;
  document.getElementById('editModal').classList.remove('hidden');
}

async function handleEditReport(e) {
  e.preventDefault();
  try {
    const res = await fetch(`/api/admin/reports/${document.getElementById('editId').value}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ category: document.getElementById('editCategory').value, title: document.getElementById('editTitle').value, description: document.getElementById('editDescription').value, status: document.getElementById('editStatus').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('更新しました', 'success'); closeModal('editModal'); loadAdminReports(); loadStats();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteReport(id) {
  if (!confirm('この投稿を削除しますか？')) return;
  try {
    const res = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE', headers: { 'x-admin-token': adminToken } });
    if (!res.ok) throw new Error('削除エラー');
    showToast('削除しました', 'success'); loadAdminReports(); loadStats();
  } catch (err) { showToast(err.message, 'error'); }
}

// === ユーザー管理 ===
async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) return;
    const users = await res.json();
    const tbody = document.getElementById('usersTable');
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:40px">ユーザーがいません</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${esc(u.display_name)}</strong></td>
        <td>${esc(u.real_name || '-')}</td>
        <td style="font-size:12px">${esc(u.email)}</td>
        <td>${esc(u.phone || '-')}</td>
        <td>${u.report_count}</td>
        <td style="font-size:13px">${fmtDate(u.created_at)}</td>
        <td>
          <div class="admin-actions">
            <button onclick="openUserEditModal('${u.id}','${escA(u.display_name)}','${escA(u.real_name||'')}','${escA(u.address||'')}','${escA(u.phone||'')}')">編集</button>
            <button class="delete" onclick="deleteUser('${u.id}','${escA(u.display_name)}')">削除</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) { showToast('ユーザー読み込み失敗', 'error'); }
}

function openUserEditModal(id, name, realName, address, phone) {
  document.getElementById('userEditId').value = id;
  document.getElementById('userEditName').value = name;
  document.getElementById('userEditRealName').value = realName;
  document.getElementById('userEditAddress').value = address;
  document.getElementById('userEditPhone').value = phone;
  document.getElementById('userEditModal').classList.remove('hidden');
}

async function handleEditUser(e) {
  e.preventDefault();
  try {
    const res = await fetch(`/api/admin/users/${document.getElementById('userEditId').value}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ display_name: document.getElementById('userEditName').value, real_name: document.getElementById('userEditRealName').value, address: document.getElementById('userEditAddress').value, phone: document.getElementById('userEditPhone').value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('更新しました', 'success'); closeModal('userEditModal'); loadAdminUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteUser(id, name) {
  if (!confirm(`ユーザー「${name}」とその全投稿を削除しますか？`)) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { 'x-admin-token': adminToken } });
    if (!res.ok) throw new Error('削除エラー');
    showToast('削除しました', 'success'); loadAdminUsers(); loadAdminReports(); loadStats();
  } catch (err) { showToast(err.message, 'error'); }
}

// === バックアップ ===
async function loadBackupList() {
  try {
    const res = await fetch('/api/admin/reports', { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) return;
    allAdminReports = await res.json();
    renderBackupCheckboxes();
  } catch (err) {}
}

function renderBackupCheckboxes() {
  const container = document.getElementById('backupCheckboxes');
  container.innerHTML = allAdminReports.map(r =>
    `<label class="checkbox-item"><input type="checkbox" value="${r.id}" checked>
     <span style="background:${CATEGORY_COLORS[r.category]||'#999'};width:8px;height:8px;border-radius:50%;display:inline-block"></span>
     ${esc(r.title)} <span style="color:#999;font-size:11px">(${fmtDate(r.created_at)})</span></label>`
  ).join('');
}

function toggleBackupSelect() {
  document.getElementById('backupSelectList').style.display =
    document.getElementById('backupSelectMode').checked ? 'block' : 'none';
}

function toggleAllBackup(checked) {
  document.querySelectorAll('#backupCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = checked);
}

function downloadBackup(type) {
  if (type === 'users') {
    window.location.href = `/api/admin/backup/users?token=${adminToken}`;
    // トークンをヘッダーで送れないのでクエリパラメータ方式にフォールバック
    // 代わりにfetchでblobダウンロード
    fetchDownload(`/api/admin/backup/users`);
    return;
  }

  let url = '/api/admin/backup/reports?';
  const cat = document.getElementById('backupCategory').value;
  const st = document.getElementById('backupStatus').value;
  const from = document.getElementById('backupDateFrom').value;
  const to = document.getElementById('backupDateTo').value;

  if (cat) url += `category=${encodeURIComponent(cat)}&`;
  if (st) url += `status=${encodeURIComponent(st)}&`;
  if (from) url += `date_from=${from}&`;
  if (to) url += `date_to=${to}&`;

  if (document.getElementById('backupSelectMode').checked) {
    const ids = Array.from(document.querySelectorAll('#backupCheckboxes input:checked')).map(cb => cb.value);
    if (ids.length === 0) { showToast('投稿を選択してください', 'error'); return; }
    url += `ids=${ids.join(',')}&`;
  }

  fetchDownload(url);
}

async function fetchDownload(url) {
  try {
    const res = await fetch(url, { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) throw new Error('ダウンロードエラー');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : 'backup.csv';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('ダウンロード完了', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// === エリア設定 ===
async function loadAreaSettings() {
  try {
    const res = await fetch('/api/admin/area', { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('currentAreaName').textContent = data.area.name;
    const select = document.getElementById('areaPreset');
    select.innerHTML = Object.keys(data.presets).map(k =>
      `<option value="${k}" ${k === data.area.name ? 'selected' : ''}>${k}</option>`
    ).join('');
  } catch (err) { console.error(err); }
}

async function changeArea() {
  const preset = document.getElementById('areaPreset').value;
  if (!confirm(`エリアを「${preset}」に変更しますか？`)) return;
  try {
    const res = await fetch('/api/admin/area', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ preset })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    document.getElementById('currentAreaName').textContent = data.area.name;
  } catch (err) { showToast(err.message, 'error'); }
}

// === データ初期化 ===
async function resetData(type) {
  const label = type === 'reports' ? '全投稿データ' : '全ユーザー・投稿データ';
  const code = type === 'reports' ? 'DELETE_ALL_REPORTS' : 'DELETE_ALL_USERS';

  const input = prompt(`${label}を削除します。\n確認のため「${code}」と入力してください:`);
  if (input !== code) {
    if (input !== null) showToast('確認コードが一致しません', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/reset/${type}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ confirm: code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    loadStats(); loadAdminReports();
  } catch (err) { showToast(err.message, 'error'); }
}

// === ユーティリティ ===
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg, type = '') {
  const old = document.querySelector('.toast'); if (old) old.remove();
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escA(s) { return (s||'').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n'); }
function fmtDate(d) { if (!d) return ''; const dt = new Date(d); return `${dt.getFullYear()}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getDate().toString().padStart(2,'0')}`; }
