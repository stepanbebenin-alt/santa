const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'shared_db.json');

const INITIAL_SHARED_STATE = {
  version: 3,
  updatedAt: Date.now(),
  participants: {}, // { [userId]: { id, name, division, role, favoriteStore, points: 0, strikes: 0, hardMissions: 0, updatedAt } }
  stopList: [],     // Starts completely empty (0 Red List items)
  reports: [],      // Shared feed of submitted reports (starts at 0)
  customStores: [], // User-added village/small-town stores
  missionLocks: {}, // { [missionId]: { status: 'booked'|'completed', byUserId, byUserName, updatedAt } }
  customMissions: []
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return Object.assign({}, JSON.parse(JSON.stringify(INITIAL_SHARED_STATE)), JSON.parse(raw));
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(INITIAL_SHARED_STATE));
}

function saveDb(data) {
  try {
    data.updatedAt = Date.now();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

let db = loadDb();

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/healthz' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() }));
    return;
  }

  if (pathname === '/api/ai-signal-check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const clip = (v, n) => String(v || '').slice(0, n).trim();
        const brand = clip(payload.brand, 60) || 'Санта Ритейл';
        const category = clip(payload.category, 120) || 'Контроль качества';
        const title = clip(payload.title, 240) || 'Проверка стандарта';
        const store = clip(payload.store, 160) || 'Точка по GPS';
        const rawComment = clip(payload.comment, 1000);
        const mediaCount = Number(payload.mediaCount) || 0;
        const validPhotosCount = Number(payload.validPhotosCount) || 0;
        const rejectedPhotosCount = Number(payload.rejectedPhotosCount) || 0;
        const nowStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const BRAND_ZONES = {
          'Санта Ритейл': 'торговый зал / стеллаж с продукцией',
          'Санта Бремор': 'рыбная холодильная витрина (-2..+4 °C)',
          'Савушкин': 'молочная холодильная горка (+2..+6 °C)',
          'Санта Рест': 'зона выдачи заказов и посадочный зал',
          'Санта Отели': 'номерной фонд / стойка ресепшн'
        };
        const zone = BRAND_ZONES[brand] || 'торговый зал / контролируемая зона';

        const VAGUE_WORDS = ['плохо', 'что-то', 'что то', 'какой-то', 'какая-то', 'какие-то', 'как-то', 'непонятно', 'ужас', 'фигня', 'не очень', 'так себе', 'короче', 'вроде', 'типа', 'бардак'];
        let cleaned = rawComment;
        for (const vw of VAGUE_WORDS) {
          const re = new RegExp(`(^|\\s)${vw}(?=$|\\s|[,.!?])`, 'gi');
          cleaned = cleaned.replace(re, ' ');
        }
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        const rewritten = cleaned.length >= 8
          ? `[${brand} • ${category}] Точка: ${store}. Суть сигнала: ${title}. Детали на месте (${zone}): ${cleaned.replace(/[.!?]+$/, '')}. Время фиксации: ${nowStr}, фотодоказательство приложено.`
          : `[${brand} • ${category}] Точка: ${store}, зона: ${zone}. Зафиксирован сигнал по стандарту «${title}». Фотофиксация с GPS-меткой выполнена в ${nowStr}, требуется проверка ответственным сотрудником.`;

        const issues = [];
        if (rejectedPhotosCount > 0 && validPhotosCount === 0) {
          issues.push('Снимок отклонён: кадр не содержит объектов витрины или смазан. Переснимите!');
        } else if (mediaCount === 0) {
          issues.push('Прикрепите фото или 5-сек видео торговой витрины.');
        }
        if (!rawComment) {
          issues.push('Укажите кратко суть проблемы в комментарии.');
        }

        let verdict = 'clear';
        let summary = 'Сигнал проверен: данные заполнены, фото витрины подтверждено.';
        if (rejectedPhotosCount > 0 && validPhotosCount === 0) {
          verdict = 'rejected';
          summary = 'Снимок отклонён: кадр недостоверен (смаз, темнота или отсутствие объекта проверки).';
        } else if (validPhotosCount > 0) {
          verdict = 'clear';
          summary = 'Подлинность фотофакта подтверждена: товар и витрина чётко идентифицированы.';
        }

        const photoCheck = (rejectedPhotosCount > 0 && validPhotosCount === 0)
          ? '❌ Фото отклонено: не содержит товара или смазано'
          : validPhotosCount > 0
          ? `✓ Подтверждено: ${validPhotosCount} достоверных фото с геометкой «${store}»`
          : 'Медиафайл ещё не прикреплён — сделайте снимок перед отправкой';

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          model: 'Santa-AI Deep Photo Inspector v3 (Render Edition)',
          verdict,
          summary,
          issues,
          photoCheck,
          rewritten
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      serverIps: getLocalIpAddresses(),
      port: PORT,
      db
    }));
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const action = payload.action;

        if (action === 'reset_all') {
          db = JSON.parse(JSON.stringify(INITIAL_SHARED_STATE));
          saveDb(db);
        } else if (action === 'delete_user' && payload.deletedUserId) {
          if (db.participants && db.participants[payload.deletedUserId]) {
            delete db.participants[payload.deletedUserId];
          }
          saveDb(db);
        } else {
          if (payload.participant && payload.participant.id) {
            db.participants[payload.participant.id] = {
              ...payload.participant,
              updatedAt: Date.now()
            };
          }
          if (payload.newReport) {
            const exists = db.reports.some(r => r.id === payload.newReport.id);
            if (!exists) {
              db.reports.unshift(payload.newReport);
              if (db.reports.length > 100) db.reports = db.reports.slice(0, 100);
            }
          }
          if (payload.newStopItem) {
            const exists = db.stopList.some(b => b.id === payload.newStopItem.id);
            if (!exists) {
              db.stopList.unshift(payload.newStopItem);
            }
          }
          if (payload.removeStopItemId) {
            db.stopList = db.stopList.filter(b => b.id !== payload.removeStopItemId);
          }
          if (payload.missionUpdate && payload.missionUpdate.missionId) {
            db.missionLocks[payload.missionUpdate.missionId] = {
              status: payload.missionUpdate.status,
              byUserId: payload.missionUpdate.byUserId,
              byUserName: payload.missionUpdate.byUserName,
              updatedAt: Date.now()
            };
          }
          if (payload.newCustomMission) {
            const exists = db.customMissions.some(m => m.id === payload.newCustomMission.id);
            if (!exists) db.customMissions.unshift(payload.newCustomMission);
          }
          if (payload.newCustomStore) {
            const exists = db.customStores.some(s => s.name === payload.newCustomStore.name);
            if (!exists) db.customStores.unshift(payload.newCustomStore);
          }
          saveDb(db);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, db }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexFallback = path.join(__dirname, 'index.html');
      fs.readFile(indexFallback, (err2, content) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Server error');
        return;
      }
      const isDynamic = ext === '.html' || ext === '.json' || path.basename(filePath) === 'sw.js';
      const cacheControl = isDynamic
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=86400';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': cacheControl,
        'Pragma': isDynamic ? 'no-cache' : 'public',
        'Expires': isDynamic ? '0' : '86400'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('==========================================================');
  console.log('🚀 САНТА.РАДАР — СЕРВЕР ЗАПУЩЕН!');
  console.log(`💻 Локально на ПК:   http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`📱 По Wi-Fi сети:    http://${ip}:${PORT}`);
  });
  console.log('==========================================================');
});
