const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function encryptEmail(email) {
  const key = process.env.ENCRYPTION_KEY || 'safety-map-default-key-change-me!';
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(email.toLowerCase().trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptEmail(encryptedEmail) {
  const key = process.env.ENCRYPTION_KEY || 'safety-map-default-key-change-me!';
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const parts = encryptedEmail.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function createAuthRoutes(db) {
  const router = express.Router();

  // ユーザー登録
  router.post('/register', async (req, res) => {
    try {
      const { email, display_name } = req.body;

      if (!email || !display_name) {
        return res.status(400).json({ error: 'メールアドレスと表示名は必須です' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
      }

      const sanitizedName = sanitizeHtml(display_name, { allowedTags: [], allowedAttributes: {} });
      if (!sanitizedName || sanitizedName.length > 50) {
        return res.status(400).json({ error: '表示名は1〜50文字で入力してください' });
      }

      const { real_name, address, phone } = req.body;

      const emailHash = hashEmail(email);
      const existing = await db.get('SELECT id, session_token FROM users WHERE email_hash = ?', [emailHash]);
      if (existing) {
        const newToken = uuidv4();
        await db.run('UPDATE users SET session_token = ? WHERE id = ?', [newToken, existing.id]);
        const user = await db.get('SELECT id, display_name FROM users WHERE id = ?', [existing.id]);
        return res.json({
          message: '登録済みのメールアドレスです。ログインしました。',
          token: newToken,
          user: { id: user.id, display_name: user.display_name }
        });
      }

      const userId = uuidv4();
      const sessionToken = uuidv4();
      const encryptedEmail = encryptEmail(email);

      await db.run(
        'INSERT INTO users (id, email_hash, email_encrypted, display_name, real_name, address, phone, session_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userId, emailHash, encryptedEmail, sanitizedName,
          sanitizeHtml(real_name || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(address || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(phone || '', { allowedTags: [], allowedAttributes: {} }),
          sessionToken
        ]
      );

      res.json({
        message: 'ユーザー登録が完了しました',
        token: sessionToken,
        user: { id: userId, display_name: sanitizedName }
      });
    } catch (error) {
      console.error('登録エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // ログイン
  router.post('/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'メールアドレスを入力してください' });
      }

      const emailHash = hashEmail(email);
      const user = await db.get('SELECT id, display_name FROM users WHERE email_hash = ?', [emailHash]);
      if (!user) {
        return res.status(404).json({ error: '登録されていないメールアドレスです。先にユーザー登録を行ってください。' });
      }

      const newToken = uuidv4();
      await db.run('UPDATE users SET session_token = ? WHERE id = ?', [newToken, user.id]);

      res.json({
        message: 'ログインしました',
        token: newToken,
        user: { id: user.id, display_name: user.display_name }
      });
    } catch (error) {
      console.error('ログインエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // プロフィール取得
  router.get('/profile', async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) return res.status(401).json({ error: '認証が必要です' });
      const user = await db.get('SELECT id, email_encrypted, display_name, real_name, address, phone FROM users WHERE session_token = ?', [token]);
      if (!user) return res.status(401).json({ error: '認証エラー' });
      let email = '';
      try { email = decryptEmail(user.email_encrypted); } catch (e) {}
      res.json({ id: user.id, email, display_name: user.display_name, real_name: user.real_name || '', address: user.address || '', phone: user.phone || '' });
    } catch (error) {
      console.error('プロフィール取得エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // プロフィール更新
  router.put('/profile', async (req, res) => {
    try {
      const token = req.headers['x-user-token'];
      if (!token) return res.status(401).json({ error: '認証が必要です' });
      const user = await db.get('SELECT id FROM users WHERE session_token = ?', [token]);
      if (!user) return res.status(401).json({ error: '認証エラー' });

      const { display_name, real_name, address, phone } = req.body;
      if (!display_name) return res.status(400).json({ error: '表示名は必須です' });

      const sanitizedName = sanitizeHtml(display_name, { allowedTags: [], allowedAttributes: {} });
      await db.run(
        'UPDATE users SET display_name = ?, real_name = ?, address = ?, phone = ? WHERE id = ?',
        [
          sanitizedName,
          sanitizeHtml(real_name || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(address || '', { allowedTags: [], allowedAttributes: {} }),
          sanitizeHtml(phone || '', { allowedTags: [], allowedAttributes: {} }),
          user.id
        ]
      );
      res.json({ message: '登録情報を更新しました', display_name: sanitizedName });
    } catch (error) {
      console.error('プロフィール更新エラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  // 管理者ログイン
  router.post('/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
      }

      const bcrypt = require('bcryptjs');
      const admin = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
      if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
      }

      res.json({
        message: '管理者ログインしました',
        token: admin.id,
        admin: { id: admin.id, display_name: admin.display_name }
      });
    } catch (error) {
      console.error('管理者ログインエラー:', error);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  });

  return router;
}

module.exports = { createAuthRoutes, decryptEmail };
