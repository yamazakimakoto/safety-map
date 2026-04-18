// === 設定（APIから上書き） ===
let MAP_CENTER = [35.4437, 139.6380];
let MAP_ZOOM = 12;
let MAP_BOUNDS = [[35.30, 139.47], [35.60, 139.78]]; // 横浜市範囲

const CATEGORY_COLORS = {
  '環境': '#4CAF50',
  '交通・道路': '#2196F3',
  '防犯': '#E91E63',
  '防災': '#FF9800',
  'その他': '#9E9E9E',
  '写真スポット': '#FF69B4'
};

const STATUS_LABELS = {
  'published': '公開',
  'hidden': '非公開',
  'resolved': '対応済'
};

const ADMIN_STATUS_COLORS = {
  '投稿': '#9E9E9E',
  '受付': '#2196F3',
  '対応中': '#FF9800',
  '解決': '#4CAF50'
};

// === 状態管理 ===
let map;
let markers = L.markerClusterGroup();
let allReports = [];
let currentFilter = 'all';
let tempMarker = null;
let userToken = localStorage.getItem('safetymap_token');
let userName = localStorage.getItem('safetymap_name');

// === 初期化 ===
document.addEventListener('DOMContentLoaded', async () => {
  // エリア設定をサーバーから取得
  try {
    const res = await fetch('/api/reports/area');
    if (res.ok) {
      const data = await res.json();
      const a = data.area;
      MAP_CENTER = a.center;
      MAP_ZOOM = a.zoom;
      MAP_BOUNDS = [[a.minLat, a.minLng], [a.maxLat, a.maxLng]];
    }
  } catch (e) { console.warn('エリア設定取得失敗、デフォルト使用'); }

  // セッション有効性チェック
  if (userToken) {
    try {
      const res = await fetch('/api/auth/profile', { headers: { 'x-user-token': userToken } });
      if (!res.ok) {
        userToken = null;
        userName = null;
        localStorage.removeItem('safetymap_token');
        localStorage.removeItem('safetymap_name');
      }
    } catch (e) {}
  }

  initMap();
  initFilters();
  loadReports();
  updateAuthUI();
});

function initMap() {
  map = L.map('map', {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    maxBounds: L.latLngBounds(MAP_BOUNDS[0], MAP_BOUNDS[1]),
    maxBoundsViscosity: 0.8,
    minZoom: 11
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.addLayer(markers);

  // 現在位置表示
  let locationMarker = null;
  let locationCircle = null;

  map.on('locationfound', (e) => {
    const radius = e.accuracy / 2;
    if (locationMarker) { map.removeLayer(locationMarker); map.removeLayer(locationCircle); }
    locationMarker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'location-marker',
        html: '<div style="width:16px;height:16px;background:#4285F4;border:3px solid white;border-radius:50%;box-shadow:0 0 6px rgba(66,133,244,0.6)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup('現在地');
    locationCircle = L.circle(e.latlng, { radius, color: '#4285F4', fillColor: '#4285F4', fillOpacity: 0.1, weight: 1 }).addTo(map);
  });

  map.on('locationerror', (e) => {
    showToast('位置情報を取得できませんでした', 'error');
  });

  // 現在位置ボタンを追加
  const locBtn = L.control({ position: 'topleft' });
  locBtn.onAdd = function() {
    const div = L.DomUtil.create('div', 'leaflet-bar');
    div.innerHTML = '<a href="#" title="現在地を表示" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:white;font-size:18px;text-decoration:none;color:#333" onclick="locateMe();return false;">📍</a>';
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  locBtn.addTo(map);

  // タイル読み込み後にサイズ再計算（Safari対応）
  map.whenReady(() => { map.invalidateSize(); });
  setTimeout(() => { map.invalidateSize(); }, 100);
  setTimeout(() => { map.invalidateSize(); }, 500);
  setTimeout(() => { map.invalidateSize(); }, 1500);
  window.addEventListener('resize', () => { map.invalidateSize(); });
  window.addEventListener('load', () => { map.invalidateSize(); });

  // 地図クリックで投稿
  map.on('click', (e) => {
    if (!userToken) {
      showToast('投稿するにはログインが必要です', 'error');
      showAuthModal();
      return;
    }

    const { lat, lng } = e.latlng;

    // エリアチェック
    if (lat < MAP_BOUNDS[0][0] || lat > MAP_BOUNDS[1][0] ||
        lng < MAP_BOUNDS[0][1] || lng > MAP_BOUNDS[1][1]) {
      showToast('横浜市の範囲内を選択してください', 'error');
      return;
    }

    // 一時マーカー
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([lat, lng], {
      icon: createIcon('#1a73e8'),
      opacity: 0.7
    }).addTo(map);

    document.getElementById('reportLat').value = lat;
    document.getElementById('reportLng').value = lng;
    openReportModal();
  });
}

// カスタムマーカーアイコン
function createIcon(color, category) {
  // 写真スポット専用：小さめの丸型カメラアイコン
  if (category === '写真スポット') {
    return L.divIcon({
      className: 'custom-marker',
      html: `<svg width="36" height="36" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="#FF69B4" stroke="white" stroke-width="2"/>
        <path d="M8 9.5h1l.5-1h5l.5 1h1a1 1 0 011 1v4a1 1 0 01-1 1H8a1 1 0 01-1-1v-4a1 1 0 011-1z" fill="none" stroke="white" stroke-width="1.2"/>
        <circle cx="12" cy="12" r="1.8" fill="none" stroke="white" stroke-width="1.2"/>
      </svg>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });
  }
  return L.divIcon({
    className: 'custom-marker',
    html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="6" fill="white"/>
    </svg>`,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40]
  });
}

// === フィルター ===
function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.category;
      renderMarkers();
    });
  });
}

// === データ読み込み ===
async function loadReports() {
  try {
    const res = await fetch('/api/reports');
    if (!res.ok) throw new Error('データ取得エラー');
    allReports = await res.json();
    renderMarkers();
  } catch (err) {
    console.error(err);
    showToast('データの読み込みに失敗しました', 'error');
  }
}

function renderMarkers() {
  markers.clearLayers();

  const filtered = currentFilter === 'all'
    ? allReports
    : allReports.filter(r => r.category === currentFilter);

  filtered.forEach(report => {
    const color = CATEGORY_COLORS[report.category] || '#9E9E9E';
    const marker = L.marker([report.latitude, report.longitude], {
      icon: createIcon(color, report.category)
    });

    // ポップアップ
    let photoHtml = '';
    if (report.photo1_url) {
      photoHtml += `<img src="${escapeHtml(report.photo1_url)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;margin-top:6px;">`;
    }
    if (report.photo2_url) {
      photoHtml += `<img src="${escapeHtml(report.photo2_url)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px;margin-top:6px;margin-left:4px;">`;
    }

    const hasMemoBadge = report.public_memo
      ? `<span style="background:#4CAF50;color:white;padding:1px 8px;border-radius:10px;font-size:11px">💬 メモあり</span>`
      : '';

    marker.bindPopup(`
      <div style="min-width:200px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
          <span style="background:${color};color:white;padding:1px 8px;border-radius:10px;font-size:11px">${escapeHtml(report.category)}</span>
          <span style="background:${ADMIN_STATUS_COLORS[report.admin_status] || '#9E9E9E'};color:white;padding:1px 8px;border-radius:10px;font-size:11px">${escapeHtml(report.admin_status || '投稿')}</span>
          ${hasMemoBadge}
        </div>
        <strong style="font-size:14px">${escapeHtml(report.title)}</strong>
        ${report.description ? `<p style="font-size:13px;margin:6px 0;color:#555">${escapeHtml(report.description).substring(0, 100)}</p>` : ''}
        <div style="display:flex;gap:4px">${photoHtml}</div>
        <div style="font-size:11px;color:#999;margin-top:6px">
          ${escapeHtml(report.author_name)} / ${formatDate(report.created_at)}
        </div>
        <button onclick="showReportDetail('${report.id}')" style="margin-top:8px;padding:4px 12px;background:#1a73e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">詳細を見る</button>
      </div>
    `);

    markers.addLayer(marker);
  });
}

// === 投稿詳細 ===
function showReportDetail(id) {
  const report = allReports.find(r => r.id === id);
  if (!report) return;

  const panel = document.getElementById('sidePanel');
  const body = document.getElementById('panelBody');
  const color = CATEGORY_COLORS[report.category] || '#9E9E9E';

  let photos = '';
  if (report.photo1_url) {
    photos += `<img src="${escapeHtml(report.photo1_url)}" style="width:100%;border-radius:8px;margin-bottom:8px">`;
  }
  if (report.photo2_url) {
    photos += `<img src="${escapeHtml(report.photo2_url)}" style="width:100%;border-radius:8px;margin-bottom:8px">`;
  }

  const adminStatusColor = ADMIN_STATUS_COLORS[report.admin_status] || '#9E9E9E';

  body.innerHTML = `
    <div>
      <span class="report-category-badge" style="background:${color}">${escapeHtml(report.category)}</span>
      <span style="background:${adminStatusColor};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-left:6px">${escapeHtml(report.admin_status || '投稿')}</span>
    </div>
    <h3 style="margin:12px 0 8px;font-size:18px">${escapeHtml(report.title)}</h3>
    ${report.address ? `<p style="font-size:13px;color:#888;margin-bottom:8px">📍 ${escapeHtml(report.address)}</p>` : ''}
    <p style="color:#666;font-size:14px;line-height:1.6;margin-bottom:16px">${escapeHtml(report.description || '詳細なし')}</p>
    ${report.public_memo ? `<div style="background:#e8f5e9;border-left:4px solid #4CAF50;padding:10px 12px;border-radius:4px;margin-bottom:16px">
      <div style="font-size:12px;color:#2e7d32;font-weight:600;margin-bottom:4px">💬 運営からのメモ</div>
      <div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">${escapeHtml(report.public_memo)}</div>
    </div>` : ''}
    ${photos}
    <div style="font-size:13px;color:#999;margin-top:12px;padding-top:12px;border-top:1px solid #e0e0e0">
      <div>投稿者: ${escapeHtml(report.author_name)}</div>
      <div>投稿日: ${formatDate(report.created_at)}</div>
      <div>位置: ${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}</div>
    </div>
  `;

  panel.classList.remove('hidden');
  map.flyTo([report.latitude, report.longitude], 16, { duration: 0.5 });
}

function closeSidePanel() {
  document.getElementById('sidePanel').classList.add('hidden');
}

// === 認証 ===
function updateAuthUI() {
  const info = document.getElementById('userInfo');
  const oldBtn = document.getElementById('authBtn');
  // onclick属性の競合を避けるためボタンを置換
  const btn = oldBtn.cloneNode(false);
  oldBtn.parentNode.replaceChild(btn, oldBtn);
  btn.id = 'authBtn';

  const myBtn = document.getElementById('myPostsBtn');
  if (userToken && userName) {
    info.textContent = userName;
    btn.textContent = 'ログアウト';
    btn.addEventListener('click', handleLogout);
    myBtn.style.display = 'inline-block';
    document.getElementById('changePwBtn').style.display = 'inline-block';
  } else {
    info.textContent = '';
    btn.textContent = 'ログイン';
    btn.addEventListener('click', showAuthModal);
    myBtn.style.display = 'none';
    document.getElementById('changePwBtn').style.display = 'none';
  }
}

function showAuthModal() {
  document.getElementById('authModal').classList.remove('hidden');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  if (tab === 'login') {
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
  } else {
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    userToken = data.token;
    userName = data.user.display_name;
    localStorage.setItem('safetymap_token', userToken);
    localStorage.setItem('safetymap_name', userName);
    updateAuthUI();
    closeAuthModal();
    showToast('ログインしました', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('regEmail').value;
  const emailConfirm = document.getElementById('regEmailConfirm').value;
  const password = document.getElementById('regPassword').value;
  const passwordConfirm = document.getElementById('regPasswordConfirm').value;
  const display_name = document.getElementById('regName').value;
  const real_name = document.getElementById('regRealName').value;
  const address = document.getElementById('regAddress').value;
  const phone = document.getElementById('regPhone').value;

  if (email !== emailConfirm) {
    showToast('メールアドレスが一致しません', 'error');
    return;
  }
  if (password !== passwordConfirm) {
    showToast('パスワードが一致しません', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('パスワードは6文字以上にしてください', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name, real_name, address, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    userToken = data.token;
    userName = data.user.display_name;
    localStorage.setItem('safetymap_token', userToken);
    localStorage.setItem('safetymap_name', userName);
    updateAuthUI();
    closeAuthModal();
    showToast(data.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleLogout() {
  userToken = null;
  userName = null;
  localStorage.removeItem('safetymap_token');
  localStorage.removeItem('safetymap_name');
  updateAuthUI();
  showToast('ログアウトしました');
}

// === 投稿 ===
function openReportModal() {
  document.getElementById('reportModal').classList.remove('hidden');
  // フォームリセット
  document.getElementById('reportForm').reset();
  document.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
  resetPhotoSlots();

  // カテゴリー選択イベント
  document.querySelectorAll('.category-option').forEach(opt => {
    opt.onclick = () => {
      document.querySelectorAll('.category-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
    };
  });
}

function closeReportModal() {
  document.getElementById('reportModal').classList.add('hidden');
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
}

function previewPhoto(input, slot) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('写真のサイズは5MB以下にしてください', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const slotEl = document.getElementById('photoSlot' + slot);
    slotEl.innerHTML = `
      <img src="${e.target.result}">
      <button type="button" class="remove-photo" onclick="removePhoto(event, ${slot})">&times;</button>
    `;
  };
  reader.readAsDataURL(file);
}

function removePhoto(e, slot) {
  e.stopPropagation();
  document.getElementById('photoInput' + slot).value = '';
  const slotEl = document.getElementById('photoSlot' + slot);
  slotEl.innerHTML = `
    <div class="placeholder">写真${slot}</div>
    <button type="button" class="remove-photo" onclick="removePhoto(event, ${slot})">&times;</button>
  `;
}

function resetPhotoSlots() {
  [1, 2].forEach(slot => {
    document.getElementById('photoInput' + slot).value = '';
    const slotEl = document.getElementById('photoSlot' + slot);
    slotEl.innerHTML = `
      <div class="placeholder">写真${slot}</div>
      <button type="button" class="remove-photo" onclick="removePhoto(event, ${slot})">&times;</button>
    `;
  });
}

async function handleSubmitReport(e) {
  e.preventDefault();

  const category = document.querySelector('input[name="category"]:checked');
  if (!category) {
    showToast('カテゴリーを選択してください', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> 投稿中...';

  const formData = new FormData();
  formData.append('latitude', document.getElementById('reportLat').value);
  formData.append('longitude', document.getElementById('reportLng').value);
  formData.append('category', category.value);
  formData.append('title', document.getElementById('reportTitle').value);
  formData.append('description', document.getElementById('reportDescription').value);

  const photo1 = document.getElementById('photoInput1').files[0];
  const photo2 = document.getElementById('photoInput2').files[0];
  if (photo1) formData.append('photos', photo1);
  if (photo2) formData.append('photos', photo2);

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'x-user-token': userToken },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('投稿が完了しました', 'success');
    closeReportModal();
    loadReports();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '投稿する';
  }
}

// === パスワード変更 ===
function showChangePwModal() {
  document.getElementById('changePwModal').classList.remove('hidden');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const current_password = document.getElementById('currentPwUser').value;
  const new_password = document.getElementById('newPwUser').value;
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
    document.getElementById('changePwModal').classList.add('hidden');
    document.getElementById('currentPwUser').value = '';
    document.getElementById('newPwUser').value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

// === マイ投稿 ===
async function showMyPosts() {
  if (!userToken) { showToast('ログインが必要です', 'error'); return; }
  document.getElementById('myPostsModal').classList.remove('hidden');
  document.getElementById('myPostsList').innerHTML = '<p style="text-align:center;color:#999">読み込み中...</p>';

  try {
    const res = await fetch('/api/reports/my', { headers: { 'x-user-token': userToken } });
    if (!res.ok) throw new Error('取得エラー');
    const posts = await res.json();

    if (posts.length === 0) {
      document.getElementById('myPostsList').innerHTML = '<p style="text-align:center;color:#999;padding:20px">投稿はまだありません</p>';
      return;
    }

    document.getElementById('myPostsList').innerHTML = posts.map(r => {
      const color = CATEGORY_COLORS[r.category] || '#9E9E9E';
      return `
        <div class="report-card" style="cursor:default">
          <div class="report-card-header">
            <span class="report-category-badge" style="background:${color}">${escapeHtml(r.category)}</span>
            <span style="background:${ADMIN_STATUS_COLORS[r.admin_status] || '#9E9E9E'};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-left:6px">${escapeHtml(r.admin_status || '投稿')}</span>
          </div>
          <div class="report-card-title">${escapeHtml(r.title)}</div>
          <p style="font-size:13px;color:#666;margin:4px 0">${escapeHtml((r.description || '').substring(0, 100))}</p>
          ${r.public_memo ? `<div style="background:#e8f5e9;border-left:3px solid #4CAF50;padding:6px 10px;border-radius:3px;margin:6px 0;font-size:12px"><strong style="color:#2e7d32">💬 運営メモ:</strong> ${escapeHtml(r.public_memo.substring(0, 100))}${r.public_memo.length > 100 ? '...' : ''}</div>` : ''}
          <div class="report-card-meta">投稿日: ${formatDate(r.created_at)} / 座標: ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</div>
          ${r.photo1_url || r.photo2_url ? `<div class="report-photos" style="margin-top:6px">${r.photo1_url ? `<img src="${escapeHtml(r.photo1_url)}">` : ''}${r.photo2_url ? `<img src="${escapeHtml(r.photo2_url)}">` : ''}</div>` : ''}
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn btn-primary" style="padding:6px 14px;font-size:13px" onclick="openUserEditReport('${r.id}','${escapeAttr(r.category)}','${escapeAttr(r.title)}','${escapeAttr(r.description||'')}','${escapeAttr(r.photo1_url||'')}','${escapeAttr(r.photo2_url||'')}')">編集</button>
            <button class="btn btn-danger" style="padding:6px 14px;font-size:13px" onclick="deleteMyReport('${r.id}')">削除</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('myPostsList').innerHTML = '<p style="text-align:center;color:#F44336">読み込みに失敗しました</p>';
  }
}

function closeMyPostsModal() {
  document.getElementById('myPostsModal').classList.add('hidden');
}

let editDeletePhoto1 = false;
let editDeletePhoto2 = false;

function openUserEditReport(id, category, title, description, photo1, photo2) {
  document.getElementById('userEditId').value = id;
  document.getElementById('userEditCategory').value = category;
  document.getElementById('userEditTitle').value = title;
  document.getElementById('userEditDescription').value = description;
  editDeletePhoto1 = false;
  editDeletePhoto2 = false;
  document.getElementById('editPhotoInput1').value = '';
  document.getElementById('editPhotoInput2').value = '';

  // 既存写真の表示
  let photosHtml = '';
  if (photo1) {
    photosHtml += `<div style="display:inline-block;position:relative;margin-right:8px;margin-bottom:8px">
      <img src="${escapeHtml(photo1)}" id="existingPhoto1" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #ddd">
      <button type="button" onclick="markDeletePhoto(1)" style="position:absolute;top:-6px;right:-6px;background:#F44336;color:white;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px">&times;</button>
    </div>`;
  }
  if (photo2) {
    photosHtml += `<div style="display:inline-block;position:relative;margin-right:8px;margin-bottom:8px">
      <img src="${escapeHtml(photo2)}" id="existingPhoto2" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #ddd">
      <button type="button" onclick="markDeletePhoto(2)" style="position:absolute;top:-6px;right:-6px;background:#F44336;color:white;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px">&times;</button>
    </div>`;
  }
  if (!photo1 && !photo2) photosHtml = '<p style="font-size:13px;color:#999">写真なし</p>';
  document.getElementById('userEditPhotos').innerHTML = photosHtml;

  // 新しい写真スロットをリセット
  resetEditPhotoSlot(1);
  resetEditPhotoSlot(2);

  document.getElementById('userEditModal').classList.remove('hidden');
}

function markDeletePhoto(n) {
  if (n === 1) editDeletePhoto1 = true;
  if (n === 2) editDeletePhoto2 = true;
  const el = document.getElementById('existingPhoto' + n);
  if (el) el.parentElement.style.opacity = '0.3';
  showToast(`写真${n}を削除対象にしました（更新ボタンで確定）`);
}

function previewEditPhoto(input, slot) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('写真のサイズは5MB以下にしてください', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const slotEl = document.getElementById('editPhotoSlot' + slot);
    slotEl.innerHTML = `<img src="${e.target.result}"><button type="button" class="remove-photo" onclick="resetEditPhotoSlot(${slot})" style="display:block">&times;</button>`;
  };
  reader.readAsDataURL(file);
}

function resetEditPhotoSlot(slot) {
  document.getElementById('editPhotoInput' + slot).value = '';
  document.getElementById('editPhotoSlot' + slot).innerHTML = `<div class="placeholder">新しい写真${slot}</div>`;
}

function closeUserEditModal() {
  document.getElementById('userEditModal').classList.add('hidden');
}

async function handleUserEditReport(e) {
  e.preventDefault();
  const id = document.getElementById('userEditId').value;
  const submitBtn = document.getElementById('userEditSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> 更新中...';

  try {
    const formData = new FormData();
    formData.append('category', document.getElementById('userEditCategory').value);
    formData.append('title', document.getElementById('userEditTitle').value);
    formData.append('description', document.getElementById('userEditDescription').value);

    if (editDeletePhoto1) formData.append('delete_photo1', '1');
    if (editDeletePhoto2) formData.append('delete_photo2', '1');

    const newPhoto1 = document.getElementById('editPhotoInput1').files[0];
    const newPhoto2 = document.getElementById('editPhotoInput2').files[0];
    if (newPhoto1) formData.append('photos', newPhoto1);
    if (newPhoto2) formData.append('photos', newPhoto2);

    const res = await fetch(`/api/reports/${id}`, {
      method: 'PUT',
      headers: { 'x-user-token': userToken },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('投稿を更新しました', 'success');
    closeUserEditModal();
    showMyPosts();
    loadReports();
  } catch (err) { showToast(err.message, 'error'); }
  finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '更新する';
  }
}

async function deleteMyReport(id) {
  if (!confirm('この投稿を削除しますか？場所を変更する場合は削除後に再投稿してください。')) return;
  try {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-token': userToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('投稿を削除しました', 'success');
    showMyPosts();
    loadReports();
  } catch (err) { showToast(err.message, 'error'); }
}

function escapeAttr(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// === 現在位置 ===
function locateMe() {
  map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
}

// === ユーティリティ ===
function showToast(message, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
}
