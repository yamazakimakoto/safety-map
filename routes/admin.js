const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const { adminAuth } = require('../middleware/auth');
const { decryptEmail } = require('./auth');
const { VALID_CATEGORIES, VALID_ADMIN_STATUSES, AREA_PRESETS, getAreaBounds, setArea } = require('./reports');

function createAdminRoutes(db) {
  const router = express.Router();
  const auth = adminAuth(db);

  // === 投稿管理 ===

  // 全投稿取得（管理者用・全ステータス + 投稿者詳細）
  router.get('/reports', auth, async (req, res) => {
    try {
      const { category, status } = req.query;
      let sql = `SELECT r.*, u.display_name as author_name, u.email_encrypted as author_email_enc,
                 u.real_name as author_real_name, u.address as author_address, u.phone as author_phone
                 FROM reports r JOIN users u ON r.user_id = u.id WHERE 1=1`;
      const params = [];

      if (category && VALID_CATEGORIES.includes(category)) {
        sql += ' AND r.category = ?';
        params.push(category);
      }
      if (status) {
        sql += ' AND r.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY r.created_at DESC';
      const reports = await db.all(sql, params);

      // メールアドレスを復号化
      for (const r of reports) {
        try { r.author_email = decryptEmail(r.author_email_enc); } catch (e) { r.author_email = ''; }
        delete r.author_email_enc;
      }

      res.json(reports);
    } catch (error) {
      console.error('管理者投稿取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 投稿詳細（投稿者の全情報付き）
  router.get('/reports/:id', auth, async (req, res) => {
    try {
      const report = await db.get(
        `SELECT r.*, u.display_name as author_name, u.email_encrypted as author_email_enc,
         u.real_name as author_real_name, u.address as author_address, u.phone as author_phone,
         u.created_at as author_registered_at
         FROM reports r JOIN users u ON r.user_id = u.id WHERE r.id = ?`,
        [req.params.id]
      );
      if (!report) return res.status(404).json({ error: '投稿が見つかりません' });
      try { report.author_email = decryptEmail(report.author_email_enc); } catch (e) { report.author_email = ''; }
      delete report.author_email_enc;
      res.json(report);
    } catch (error) {
      console.error('投稿詳細取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 投稿編集
  router.put('/reports/:id', auth, async (req, res) => {
    try {
      const { category, status, title, description, admin_status, admin_memo } = req.body;
      const report = await db.get('SELECT * FROM reports WHERE id = ?', [req.params.id]);
      if (!report) return res.status(404).json({ error: '投稿が見つかりません' });

      const updates = [];
      const params = [];

      if (category && VALID_CATEGORIES.includes(category)) { updates.push('category = ?'); params.push(category); }
      if (status && ['published', 'hidden', 'resolved'].includes(status)) { updates.push('status = ?'); params.push(status); }
      if (title) { updates.push('title = ?'); params.push(sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} })); }
      if (description !== undefined) { updates.push('description = ?'); params.push(sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} })); }
      if (admin_status && VALID_ADMIN_STATUSES.includes(admin_status)) { updates.push('admin_status = ?'); params.push(admin_status); }
      if (admin_memo !== undefined) { updates.push('admin_memo = ?'); params.push(sanitizeHtml(admin_memo.substring(0, 2000), { allowedTags: [], allowedAttributes: {} })); }

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

  // 投稿削除
  router.delete('/reports/:id', auth, async (req, res) => {
    try {
      const report = await db.get('SELECT * FROM reports WHERE id = ?', [req.params.id]);
      if (!report) return res.status(404).json({ error: '投稿が見つかりません' });
      await db.run('DELETE FROM reports WHERE id = ?', [req.params.id]);
      res.json({ message: '投稿を削除しました' });
    } catch (error) {
      console.error('投稿削除エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // === ユーザー管理 ===

  // ユーザー一覧（全情報）
  router.get('/users', auth, async (req, res) => {
    try {
      const users = await db.all(
        'SELECT id, email_encrypted, display_name, real_name, address, phone, created_at FROM users ORDER BY created_at DESC'
      );
      for (const u of users) {
        try { u.email = decryptEmail(u.email_encrypted); } catch (e) { u.email = ''; }
        delete u.email_encrypted;
        const rc = await db.get('SELECT COUNT(*) as count FROM reports WHERE user_id = ?', [u.id]);
        u.report_count = rc.count;
      }
      res.json(users);
    } catch (error) {
      console.error('ユーザー一覧取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ユーザー詳細
  router.get('/users/:id', auth, async (req, res) => {
    try {
      const user = await db.get(
        'SELECT id, email_encrypted, display_name, real_name, address, phone, created_at FROM users WHERE id = ?',
        [req.params.id]
      );
      if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
      try { user.email = decryptEmail(user.email_encrypted); } catch (e) { user.email = ''; }
      delete user.email_encrypted;
      const reports = await db.all('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
      user.reports = reports;
      res.json(user);
    } catch (error) {
      console.error('ユーザー詳細取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ユーザー編集
  router.put('/users/:id', auth, async (req, res) => {
    try {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

      const { display_name, real_name, address, phone } = req.body;
      if (!display_name) return res.status(400).json({ error: '表示名は必須です' });

      await db.run(
        'UPDATE users SET display_name = ?, real_name = ?, address = ?, phone = ? WHERE id = ?',
        [
          sanitizeHtml(display_name, { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(real_name || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(address || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(phone || '', { allowedTags: [], allowedAttributes: {} }),
          req.params.id
        ]
      );
      res.json({ message: 'ユーザー情報を更新しました' });
    } catch (error) {
      console.error('ユーザー更新エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ユーザー削除（関連投稿も削除）
  router.delete('/users/:id', auth, async (req, res) => {
    try {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
      await db.run('DELETE FROM reports WHERE user_id = ?', [req.params.id]);
      await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
      res.json({ message: 'ユーザーと関連投稿を削除しました' });
    } catch (error) {
      console.error('ユーザー削除エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // === バックアップ（CSVエクスポート） ===

  router.get('/backup/reports', auth, async (req, res) => {
    try {
      const { category, status, date_from, date_to, ids } = req.query;
      let sql = `SELECT r.*, u.display_name as author_name, u.email_encrypted as author_email_enc,
                 u.real_name as author_real_name, u.phone as author_phone
                 FROM reports r JOIN users u ON r.user_id = u.id WHERE 1=1`;
      const params = [];

      if (ids) {
        const idList = ids.split(',').map(id => id.trim()).filter(Boolean);
        if (idList.length > 0) {
          sql += ` AND r.id IN (${idList.map(() => '?').join(',')})`;
          params.push(...idList);
        }
      }
      if (category && VALID_CATEGORIES.includes(category)) { sql += ' AND r.category = ?'; params.push(category); }
      if (status) { sql += ' AND r.status = ?'; params.push(status); }
      if (date_from) { sql += ' AND r.created_at >= ?'; params.push(date_from); }
      if (date_to) { sql += ' AND r.created_at <= ?'; params.push(date_to + 'T23:59:59'); }

      sql += ' ORDER BY r.created_at DESC';
      const reports = await db.all(sql, params);

      // CSV生成
      const BOM = '\uFEFF';
      // CSV安全エスケープ関数
      function csvCell(val) {
        const s = String(val == null ? '' : val);
        return '"' + s.replace(/"/g, '""') + '"';
      }

      const header = 'ID,カテゴリー,タイトル,詳細,住所,公開ステータス,管理ステータス,管理メモ,緯度,経度,Googleマップ座標,投稿者表示名,投稿者本名,投稿者電話番号,写真1,写真2,投稿日時,更新日時';
      const rows = reports.map(r => {
        return [
          csvCell(r.id),
          csvCell(r.category),
          csvCell(r.title),
          csvCell(r.description),
          csvCell(r.address),
          csvCell(r.status),
          csvCell(r.admin_status || '投稿'),
          csvCell(r.admin_memo),
          csvCell(r.latitude),
          csvCell(r.longitude),
          csvCell(`${r.latitude} ${r.longitude}`),
          csvCell(r.author_name),
          csvCell(r.author_real_name),
          csvCell(r.author_phone),
          csvCell(r.photo1_url),
          csvCell(r.photo2_url),
          csvCell(r.created_at),
          csvCell(r.updated_at)
        ].join(',');
      });

      const csv = BOM + header + '\n' + rows.join('\n');
      const filename = `safety-map-backup-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('バックアップエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ユーザーバックアップ
  router.get('/backup/users', auth, async (req, res) => {
    try {
      const users = await db.all('SELECT id, email_encrypted, display_name, real_name, address, phone, created_at FROM users ORDER BY created_at DESC');

      const BOM = '\uFEFF';
      const header = 'ID,メールアドレス,表示名,本名,住所,電話番号,登録日時';
      function csvCell2(val) {
        const s = String(val == null ? '' : val);
        return '"' + s.replace(/"/g, '""') + '"';
      }
      const rows = users.map(u => {
        let email = '';
        try { email = decryptEmail(u.email_encrypted); } catch (e) {}
        return [
          csvCell2(u.id), csvCell2(email), csvCell2(u.display_name), csvCell2(u.real_name),
          csvCell2(u.address), csvCell2(u.phone), csvCell2(u.created_at)
        ].join(',');
      });

      const csv = BOM + header + '\n' + rows.join('\n');
      const filename = `safety-map-users-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('ユーザーバックアップエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // === エリア設定 ===

  router.get('/area', auth, (req, res) => {
    res.json({ area: getAreaBounds(), presets: AREA_PRESETS });
  });

  router.put('/area', auth, (req, res) => {
    const { preset, custom } = req.body;
    if (preset && AREA_PRESETS[preset]) {
      setArea(AREA_PRESETS[preset]);
      return res.json({ message: `エリアを「${preset}」に変更しました`, area: getAreaBounds() });
    }
    if (custom && custom.name && custom.center && custom.minLat != null) {
      setArea(custom);
      return res.json({ message: `エリアを「${custom.name}」に変更しました`, area: getAreaBounds() });
    }
    res.status(400).json({ error: 'プリセット名またはカスタム設定を指定してください' });
  });

  // === データ初期化 ===

  // 投稿データのみ初期化
  router.delete('/reset/reports', auth, async (req, res) => {
    try {
      const { confirm } = req.body;
      if (confirm !== 'DELETE_ALL_REPORTS') {
        return res.status(400).json({ error: '確認コードが一致しません' });
      }
      await db.run('DELETE FROM reports');
      res.json({ message: '全投稿データを削除しました' });
    } catch (error) {
      console.error('投稿初期化エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ユーザーデータ初期化（投稿も一緒に削除）
  router.delete('/reset/users', auth, async (req, res) => {
    try {
      const { confirm } = req.body;
      if (confirm !== 'DELETE_ALL_USERS') {
        return res.status(400).json({ error: '確認コードが一致しません' });
      }
      await db.run('DELETE FROM reports');
      await db.run('DELETE FROM users');
      res.json({ message: '全ユーザー・投稿データを削除しました' });
    } catch (error) {
      console.error('ユーザー初期化エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // === 統計情報 ===

  router.get('/stats', auth, async (req, res) => {
    try {
      const totalReports = await db.get('SELECT COUNT(*) as count FROM reports');
      const byCategory = await db.all('SELECT category, COUNT(*) as count FROM reports GROUP BY category');
      const byStatus = await db.all('SELECT status, COUNT(*) as count FROM reports GROUP BY status');
      const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');

      res.json({ totalReports: totalReports.count, totalUsers: totalUsers.count, byCategory, byStatus });
    } catch (error) {
      console.error('統計情報取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // === 管理者アカウント管理 ===

  // 管理者一覧
  router.get('/admins', auth, async (req, res) => {
    try {
      const admins = await db.all('SELECT id, username, display_name, created_at FROM admins ORDER BY created_at');
      res.json(admins);
    } catch (error) {
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 管理者追加
  router.post('/admins', auth, async (req, res) => {
    try {
      const { username, password, display_name } = req.body;
      if (!username || !password || !display_name) {
        return res.status(400).json({ error: 'ユーザー名、パスワード、表示名は必須です' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
      }
      const existing = await db.get('SELECT id FROM admins WHERE username = ?', [username]);
      if (existing) {
        return res.status(400).json({ error: 'そのユーザー名は既に使用されています' });
      }
      const id = uuidv4();
      const hash = bcrypt.hashSync(password, 10);
      const sanitizedName = sanitizeHtml(display_name, { allowedTags: [], allowedAttributes: {} });
      await db.run('INSERT INTO admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
        [id, sanitizeHtml(username, { allowedTags: [], allowedAttributes: {} }), hash, sanitizedName]);
      res.json({ message: `管理者「${sanitizedName}」を追加しました` });
    } catch (error) {
      console.error('管理者追加エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 管理者削除
  router.delete('/admins/:id', auth, async (req, res) => {
    try {
      if (req.params.id === req.admin.id) {
        return res.status(400).json({ error: '自分自身は削除できません' });
      }
      const count = await db.get('SELECT COUNT(*) as count FROM admins');
      if (parseInt(count.count) <= 1) {
        return res.status(400).json({ error: '最後の管理者は削除できません' });
      }
      const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.params.id]);
      if (!admin) return res.status(404).json({ error: '管理者が見つかりません' });
      await db.run('DELETE FROM admins WHERE id = ?', [req.params.id]);
      res.json({ message: `管理者「${admin.display_name}」を削除しました` });
    } catch (error) {
      console.error('管理者削除エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 管理者パスワードリセット（他の管理者のパスワードを変更）
  router.put('/admins/:id/reset-password', auth, async (req, res) => {
    try {
      const { new_password } = req.body;
      if (!new_password || new_password.length < 8) {
        return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
      }
      const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.params.id]);
      if (!admin) return res.status(404).json({ error: '管理者が見つかりません' });
      const hash = bcrypt.hashSync(new_password, 10);
      await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
      res.json({ message: `「${admin.display_name}」のパスワードを変更しました` });
    } catch (error) {
      console.error('パスワードリセットエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  return router;
}

module.exports = { createAdminRoutes };
