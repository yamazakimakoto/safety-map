const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { createAuthRoutes } = require('./routes/auth');
const { createReportRoutes } = require('./routes/reports');
const { createAdminRoutes } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// セキュリティ（CSPは無効化 - Leaflet/OpenStreetMap互換性のため）
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// レート制限
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// データベース初期化 & ルート設定
(async () => {
  try {
  const db = await initDatabase();

  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/reports', createReportRoutes(db));
  app.use('/api/admin', createAdminRoutes(db));

  // SPA フォールバック
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'APIエンドポイントが見つかりません' });
    }
    // admin.htmlへの直接アクセス
    if (req.path === '/admin' || req.path === '/admin.html') {
      return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`街の安全安心マップ サーバー起動: http://localhost:${PORT}`);
  });
  } catch (err) {
    console.error('サーバー起動エラー:', err);
    process.exit(1);
  }
})();
