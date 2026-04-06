const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const https = require('https');

const VALID_CATEGORIES = ['環境', '交通・道路', '防犯', '防災', 'その他'];
const VALID_ADMIN_STATUSES = ['投稿', '受付', '対応中', '解決'];

// 逆ジオコーディング（OpenStreetMap Nominatim）
function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ja`;
    https.get(url, { headers: { 'User-Agent': 'SafetyMapApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.display_name || '');
        } catch (e) { resolve(''); }
      });
    }).on('error', () => resolve(''));
  });
}

// エリアプリセット
const AREA_PRESETS = {
  '戸塚区・泉区': { name: '戸塚区・泉区', center: [35.3950, 139.5330], zoom: 14, minLat: 35.35, maxLat: 35.44, minLng: 139.48, maxLng: 139.58 },
  '横浜市': { name: '横浜市', center: [35.4437, 139.6380], zoom: 12, minLat: 35.30, maxLat: 35.60, minLng: 139.47, maxLng: 139.78 },
  '川崎市': { name: '川崎市', center: [35.5309, 139.7030], zoom: 12, minLat: 35.47, maxLat: 35.62, minLng: 139.59, maxLng: 139.78 },
  '相模原市': { name: '相模原市', center: [35.5714, 139.3734], zoom: 12, minLat: 35.47, maxLat: 35.68, minLng: 139.20, maxLng: 139.50 },
  '神奈川県': { name: '神奈川県', center: [35.4478, 139.3425], zoom: 10, minLat: 35.10, maxLat: 35.68, minLng: 138.90, maxLng: 139.80 },
  '東京都': { name: '東京都', center: [35.6812, 139.7671], zoom: 11, minLat: 35.50, maxLat: 35.90, minLng: 139.40, maxLng: 139.95 },
  '全国': { name: '全国', center: [36.5, 138.0], zoom: 6, minLat: 24.0, maxLat: 46.0, minLng: 122.0, maxLng: 154.0 }
};

// 現在のエリア設定（デフォルト: 戸塚区・泉区）
let currentArea = { ...AREA_PRESETS['戸塚区・泉区'] };

function getAreaBounds() { return currentArea; }
function setArea(area) { currentArea = { ...area }; }

function isWithinArea(lat, lng) {
  return lat >= currentArea.minLat && lat <= currentArea.maxLat &&
         lng >= currentArea.minLng && lng <= currentArea.maxLng;
}

// multer設定（一時ファイル保存）
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function createReportRoutes(db) {
  const router = express.Router();

  // Cloudinary設定
  let cloudinary = null;
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary = require('cloudinary').v2;
    if (!process.env.CLOUDINARY_URL) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
    }
  }

  async function uploadToCloudinary(filePath) {
    if (!cloudinary) {
      // Cloudinary未設定時はローカルパスを返す
      return '/uploads/' + path.basename(filePath);
    }
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'safety-map',
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }, { quality: 'auto' }]
      });
      // 一時ファイル削除
      fs.unlink(filePath, () => {});
      return result.secure_url;
    } catch (err) {
      console.error('Cloudinaryアップロードエラー:', err);
      fs.unlink(filePath, () => {});
      throw err;
    }
  }

  // エリア設定取得
  router.get('/area', (req, res) => {
    res.json({ area: getAreaBounds(), presets: AREA_PRESETS });
  });

  // 全投稿取得（公開のみ）
  router.get('/', async (req, res) => {
    try {
      const { category } = req.query;
      let sql = `SELECT r.*, u.display_name as author_name
                 FROM reports r JOIN users u ON r.user_id = u.id
                 WHERE r.status = 'published'`;
      const params = [];

      if (category && VALID_CATEGORIES.includes(category)) {
        sql += ' AND r.category = ?';
        params.push(category);
      }

      sql += ' ORDER BY r.created_at DESC';

      const reports = await db.all(sql, params);
      res.json(reports);
    } catch (error) {
      console.error('投稿取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 自分の投稿一覧（/:id より前に定義する必要あり）
  router.get('/my', async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) return res.status(401).json({ error: 'ログインが必要です' });
      const user = await db.get('SELECT id FROM users WHERE session_token = ?', [token]);
      if (!user) return res.status(401).json({ error: '無効なセッションです' });

      const reports = await db.all(
        `SELECT r.*, u.display_name as author_name FROM reports r JOIN users u ON r.user_id = u.id
         WHERE r.user_id = ? ORDER BY r.created_at DESC`,
        [user.id]
      );
      res.json(reports);
    } catch (error) {
      console.error('マイ投稿取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 投稿詳細
  router.get('/:id', async (req, res) => {
    try {
      const report = await db.get(
        `SELECT r.*, u.display_name as author_name
         FROM reports r JOIN users u ON r.user_id = u.id
         WHERE r.id = ?`,
        [req.params.id]
      );
      if (!report) {
        return res.status(404).json({ error: '投稿が見つかりません' });
      }
      res.json(report);
    } catch (error) {
      console.error('投稿詳細取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 新規投稿（認証必須）
  router.post('/', upload.array('photos', 2), async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) {
        return res.status(401).json({ error: 'ログインが必要です' });
      }
      const user = await db.get('SELECT id, display_name FROM users WHERE session_token = ?', [token]);
      if (!user) {
        return res.status(401).json({ error: '無効なセッションです' });
      }

      const { latitude, longitude, category, title, description } = req.body;

      if (!latitude || !longitude || !category || !title) {
        return res.status(400).json({ error: '位置情報、カテゴリー、タイトルは必須です' });
      }

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: '無効な位置情報です' });
      }

      if (!isWithinArea(lat, lng)) {
        return res.status(400).json({ error: `${currentArea.name}の範囲外です。${currentArea.name}内の位置を選択してください。` });
      }

      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: '無効なカテゴリーです' });
      }

      const sanitizedTitle = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
      const sanitizedDesc = sanitizeHtml(description || '', { allowedTags: [], allowedAttributes: {} });

      // 写真アップロード
      let photo1_url = '';
      let photo2_url = '';
      if (req.files && req.files.length > 0) {
        photo1_url = await uploadToCloudinary(req.files[0].path);
        if (req.files.length > 1) {
          photo2_url = await uploadToCloudinary(req.files[1].path);
        }
      }

      // 住所を自動取得
      let address = '';
      try { address = await reverseGeocode(lat, lng); } catch (e) {}

      const reportId = uuidv4();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO reports (id, user_id, latitude, longitude, address, category, title, description, photo1_url, photo2_url, status, admin_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', '投稿', ?, ?)`,
        [reportId, user.id, lat, lng, address, category, sanitizedTitle, sanitizedDesc, photo1_url, photo2_url, now, now]
      );

      const report = await db.get(
        `SELECT r.*, u.display_name as author_name
         FROM reports r JOIN users u ON r.user_id = u.id
         WHERE r.id = ?`,
        [reportId]
      );

      res.json({ message: '投稿が完了しました', report });
    } catch (error) {
      console.error('投稿エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 自分の投稿を編集（場所以外、写真の更新・削除に対応）
  router.put('/:id', upload.array('photos', 2), async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) return res.status(401).json({ error: 'ログインが必要です' });
      const user = await db.get('SELECT id FROM users WHERE session_token = ?', [token]);
      if (!user) return res.status(401).json({ error: '無効なセッションです' });

      const report = await db.get('SELECT * FROM reports WHERE id = ? AND user_id = ?', [req.params.id, user.id]);
      if (!report) return res.status(404).json({ error: '投稿が見つからないか、編集権限がありません' });

      const { category, title, description, delete_photo1, delete_photo2 } = req.body;
      const updates = [];
      const params = [];

      if (category && VALID_CATEGORIES.includes(category)) { updates.push('category = ?'); params.push(category); }
      if (title) { updates.push('title = ?'); params.push(sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} })); }
      if (description !== undefined) { updates.push('description = ?'); params.push(sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} })); }

      // 写真削除
      if (delete_photo1 === '1') { updates.push("photo1_url = ?"); params.push(''); }
      if (delete_photo2 === '1') { updates.push("photo2_url = ?"); params.push(''); }

      // 新しい写真アップロード
      if (req.files && req.files.length > 0) {
        let fileIndex = 0;
        // photo1が空（削除済み or 元々なし）なら1枚目をphoto1に
        const photo1Empty = delete_photo1 === '1' || !report.photo1_url;
        const photo2Empty = delete_photo2 === '1' || !report.photo2_url;

        if (photo1Empty && fileIndex < req.files.length) {
          const url = await uploadToCloudinary(req.files[fileIndex].path);
          updates.push("photo1_url = ?"); params.push(url);
          fileIndex++;
        }
        if (photo2Empty && fileIndex < req.files.length) {
          const url = await uploadToCloudinary(req.files[fileIndex].path);
          updates.push("photo2_url = ?"); params.push(url);
          fileIndex++;
        }
        // 既存写真があっても新しいファイルがあれば上書き
        if (fileIndex === 0 && req.files.length > 0) {
          const url = await uploadToCloudinary(req.files[0].path);
          updates.push("photo1_url = ?"); params.push(url);
          if (req.files.length > 1) {
            const url2 = await uploadToCloudinary(req.files[1].path);
            updates.push("photo2_url = ?"); params.push(url2);
          }
        }
      }

      if (updates.length === 0) return res.status(400).json({ error: '更新する項目がありません' });

      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(req.params.id);

      await db.run(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`, params);

      const updated = await db.get(
        `SELECT r.*, u.display_name as author_name FROM reports r JOIN users u ON r.user_id = u.id WHERE r.id = ?`,
        [req.params.id]
      );
      res.json({ message: '投稿を更新しました', report: updated });
    } catch (error) {
      console.error('投稿更新エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 自分の投稿を削除
  router.delete('/:id', async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) return res.status(401).json({ error: 'ログインが必要です' });
      const user = await db.get('SELECT id FROM users WHERE session_token = ?', [token]);
      if (!user) return res.status(401).json({ error: '無効なセッションです' });

      const report = await db.get('SELECT * FROM reports WHERE id = ? AND user_id = ?', [req.params.id, user.id]);
      if (!report) return res.status(404).json({ error: '投稿が見つからないか、削除権限がありません' });

      await db.run('DELETE FROM reports WHERE id = ?', [req.params.id]);
      res.json({ message: '投稿を削除しました' });
    } catch (error) {
      console.error('投稿削除エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  return router;
}

module.exports = { createReportRoutes, VALID_CATEGORIES, VALID_ADMIN_STATUSES, AREA_PRESETS, getAreaBounds, setArea };
