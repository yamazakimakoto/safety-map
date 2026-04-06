let adminToken = localStorage.getItem('safetymap_admin_token');
let adminName = localStorage.getItem('safetymap_admin_name');
let allAdminReports = [];

const CATEGORY_COLORS = {
  '環境': '#4CAF50', '交通・道路': '#2196F3', '防犯': '#E91E63', '防災': '#FF9800', 'その他': '#9E9E9E'
};
const STATUS_MAP = { published: '公開', hidden: '非公開', resolved: '対応済' };
const ADMIN_STATUS_COLORS = { '投稿': '#9E9E9E', '受付': '#2196F3', '対応中': '#FF9800', '解決': '#4CAF50' };

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
  if (name === 'settings') { loadAreaSettings(); loadAdmins(); }
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
      <td><strong>${esc(r.title)}</strong>${r.photo1_url ? ' <span style="color:#999;font-size:11px">[写真]</span>' : ''}${r.address ? `<br><span style="font-size:11px;color:#888">${esc(r.address).substring(0,30)}</span>` : ''}</td>
      <td><a href="#" onclick="showAuthorDetail('${r.user_id}');return false" style="color:#1a73e8">${esc(r.author_name)}</a></td>
      <td><span style="background:${ADMIN_STATUS_COLORS[r.admin_status]||'#9E9E9E'};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${esc(r.admin_status||'投稿')}</span></td>
      <td style="font-size:13px">${fmtDate(r.created_at)}</td>
      <td>
        <div class="admin-actions">
          <button onclick="openEditModal('${r.id}','${escA(r.category)}','${escA(r.title)}','${escA(r.description||'')}','${r.status}','${escA(r.admin_status||'投稿')}','${escA(r.admin_memo||'')}')">編集</button>
          <button onclick="printReport('${r.id}')">印刷</button>
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
function openEditModal(id, category, title, description, status, adminStatus, adminMemo) {
  document.getElementById('editId').value = id;
  document.getElementById('editCategory').value = category;
  document.getElementById('editTitle').value = title;
  document.getElementById('editDescription').value = description;
  document.getElementById('editStatus').value = status;
  document.getElementById('editAdminStatus').value = adminStatus || '投稿';
  document.getElementById('editAdminMemo').value = adminMemo || '';
  document.getElementById('editModal').classList.remove('hidden');
}

async function handleEditReport(e) {
  e.preventDefault();
  try {
    const res = await fetch(`/api/admin/reports/${document.getElementById('editId').value}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ category: document.getElementById('editCategory').value, title: document.getElementById('editTitle').value, description: document.getElementById('editDescription').value, status: document.getElementById('editStatus').value, admin_status: document.getElementById('editAdminStatus').value, admin_memo: document.getElementById('editAdminMemo').value })
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

// === 印刷機能（A4カード） ===
async function printReport(id) {
  try {
    const res = await fetch(`/api/admin/reports/${id}`, { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) throw new Error('取得エラー');
    const r = await res.json();

    const color = CATEGORY_COLORS[r.category] || '#999';
    const adminColor = ADMIN_STATUS_COLORS[r.admin_status] || '#9E9E9E';

    let photosHtml = '';
    if (r.photo1_url) photosHtml += `<img src="${r.photo1_url}" style="max-width:48%;max-height:200px;object-fit:cover;border-radius:6px;border:1px solid #ddd">`;
    if (r.photo2_url) photosHtml += `<img src="${r.photo2_url}" style="max-width:48%;max-height:200px;object-fit:cover;border-radius:6px;border:1px solid #ddd">`;

    const memoSummary = (r.admin_memo || '').substring(0, 300);

    // iframe方式で印刷（ポップアップブロッカー対策）
    let printFrame = document.getElementById('printFrame');
    if (printFrame) printFrame.remove();
    printFrame = document.createElement('iframe');
    printFrame.id = 'printFrame';
    printFrame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;border:none;background:white;';
    document.body.appendChild(printFrame);
    const printDoc = printFrame.contentDocument || printFrame.contentWindow.document;
    printDoc.open();
    printDoc.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>投稿カード - ${esc(r.title)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  @page { size: A4; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Hiragino Sans', sans-serif; color: #333; font-size: 10pt; line-height: 1.5; }
  .card { border: 2px solid #1a73e8; border-radius: 10px; padding: 16px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
  .card-header h1 { font-size: 13pt; color: #1a73e8; }
  .badges { display: flex; gap: 6px; }
  .badge { padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: 600; color: white; }
  .title { font-size: 15pt; font-weight: 700; margin-bottom: 4px; }
  .address { font-size: 9pt; color: #666; margin-bottom: 8px; }
  .description { font-size: 9pt; color: #555; line-height: 1.6; margin-bottom: 12px; padding: 8px; background: #f8f9fa; border-radius: 6px; min-height: 30px; }
  .content-grid { display: flex; gap: 12px; margin-bottom: 12px; }
  .map-area { flex: 1; min-width: 0; }
  #printMap { width: 100%; height: 220px; border: 1px solid #ddd; border-radius: 6px; }
  .photos { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; justify-content: center; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; font-size: 8pt; color: #666; padding-top: 8px; border-top: 1px solid #e0e0e0; }
  .meta-item { display: flex; gap: 4px; }
  .meta-label { font-weight: 600; color: #444; min-width: 55px; }
  .memo-section { margin-top: 8px; padding: 8px; background: #fffde7; border-radius: 6px; border: 1px solid #fff9c4; }
  .memo-section h3 { font-size: 9pt; color: #f57f17; margin-bottom: 3px; }
  .memo-section p { font-size: 8pt; color: #555; white-space: pre-wrap; }
  .footer { margin-top: 8px; text-align: center; font-size: 7pt; color: #999; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="no-print" style="padding:8px;text-align:right;background:#f0f0f0">
  <button onclick="window.print()" style="padding:6px 16px;background:#1a73e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷</button>
  <button onclick="parent.document.getElementById('printFrame').remove()" style="padding:6px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-left:4px">閉じる</button>
</div>
<div class="card">
  <div class="card-header">
    <h1>街の安全安心マップ - 投稿カード</h1>
    <div class="badges">
      <span class="badge" style="background:${color}">${esc(r.category)}</span>
      <span class="badge" style="background:${adminColor}">${esc(r.admin_status || '投稿')}</span>
    </div>
  </div>

  <div class="title">${esc(r.title)}</div>
  ${r.address ? `<div class="address">📍 ${esc(r.address)}</div>` : ''}

  ${r.description ? `<div class="description">${esc(r.description)}</div>` : ''}

  <div class="content-grid">
    <div class="map-area">
      <div id="printMap"></div>
    </div>
    ${photosHtml ? `<div class="photos">${photosHtml}</div>` : ''}
  </div>

  ${memoSummary ? `<div class="memo-section"><h3>管理メモ</h3><p>${esc(memoSummary)}${r.admin_memo && r.admin_memo.length > 300 ? '...' : ''}</p></div>` : ''}

  <div class="meta-grid">
    <div class="meta-item"><span class="meta-label">投稿者:</span> ${esc(r.author_name)}</div>
    <div class="meta-item"><span class="meta-label">投稿日:</span> ${fmtDate(r.created_at)}</div>
    <div class="meta-item"><span class="meta-label">座標:</span> ${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}</div>
    <div class="meta-item"><span class="meta-label">Gマップ:</span> <a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" style="color:#1a73e8;font-size:8pt">開く</a></div>
    ${r.author_real_name ? `<div class="meta-item"><span class="meta-label">本名:</span> ${esc(r.author_real_name)}</div>` : ''}
    ${r.author_phone ? `<div class="meta-item"><span class="meta-label">電話:</span> ${esc(r.author_phone)}</div>` : ''}
  </div>

  <div class="footer">投稿ID: ${r.id} | 印刷日: ${new Date().toLocaleDateString('ja-JP')}</div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('printMap', { zoomControl: false, attributionControl: false }).setView([${r.latitude}, ${r.longitude}], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
var icon = L.divIcon({
  className: 'custom-marker',
  html: '<svg width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="14" cy="14" r="6" fill="white"/></svg>',
  iconSize: [28, 40], iconAnchor: [14, 40]
});
L.marker([${r.latitude}, ${r.longitude}], { icon: icon }).addTo(map);
// タイル読み込み完了後に印刷可能に
setTimeout(function() { map.invalidateSize(); }, 500);
</script>
</body>
</html>`);
    printDoc.close();
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

// === 管理者アカウント管理 ===
async function loadAdmins() {
  try {
    const res = await fetch('/api/admin/admins', { headers: { 'x-admin-token': adminToken } });
    if (!res.ok) return;
    const admins = await res.json();
    document.getElementById('adminsTableBody').innerHTML = admins.map(a => `
      <tr>
        <td>${esc(a.username)}</td>
        <td>${esc(a.display_name)}</td>
        <td>${fmtDate(a.created_at)}</td>
        <td>
          <div class="admin-actions">
            <button onclick="resetAdminPassword('${a.id}','${escA(a.display_name)}')">PW変更</button>
            <button class="delete" onclick="deleteAdmin('${a.id}','${escA(a.display_name)}')">削除</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

async function changeMyPassword() {
  const current = document.getElementById('currentPw').value;
  const newPw = document.getElementById('newPw').value;
  if (!current || !newPw) { showToast('両方入力してください', 'error'); return; }
  try {
    const res = await fetch('/api/auth/admin/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ current_password: current, new_password: newPw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    document.getElementById('currentPw').value = '';
    document.getElementById('newPw').value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

async function addAdmin() {
  const username = document.getElementById('newAdminUsername').value;
  const password = document.getElementById('newAdminPassword').value;
  const display_name = document.getElementById('newAdminDisplayName').value;
  if (!username || !password || !display_name) { showToast('全項目を入力してください', 'error'); return; }
  try {
    const res = await fetch('/api/admin/admins', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ username, password, display_name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminDisplayName').value = '';
    loadAdmins();
  } catch (err) { showToast(err.message, 'error'); }
}

async function resetAdminPassword(id, name) {
  const newPw = prompt(`「${name}」の新しいパスワードを入力（8文字以上）:`);
  if (!newPw) return;
  try {
    const res = await fetch(`/api/admin/admins/${id}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ new_password: newPw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteAdmin(id, name) {
  if (!confirm(`管理者「${name}」を削除しますか？`)) return;
  try {
    const res = await fetch(`/api/admin/admins/${id}`, {
      method: 'DELETE', headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    loadAdmins();
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
