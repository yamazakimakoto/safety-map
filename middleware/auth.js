function adminAuth(db) {
  return async (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) {
      return res.status(401).json({ error: '管理者認証が必要です' });
    }
    const admin = await db.get('SELECT * FROM admins WHERE id = ?', [token]);
    if (!admin) {
      return res.status(401).json({ error: '無効な管理者トークンです' });
    }
    req.admin = admin;
    next();
  };
}

function userAuth(db) {
  return async (req, res, next) => {
    const token = req.headers['x-user-token'];
    if (!token) {
      return res.status(401).json({ error: 'ログインが必要です' });
    }
    const user = await db.get('SELECT id, display_name FROM users WHERE session_token = ?', [token]);
    if (!user) {
      return res.status(401).json({ error: '無効なセッションです。再度ログインしてください。' });
    }
    req.user = user;
    next();
  };
}

module.exports = { adminAuth, userAuth };
