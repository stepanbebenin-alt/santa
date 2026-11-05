/**
 * PediaSense — Render & Local Web Server
 * Zero external dependencies: pure Node.js built-in modules (http, fs, path, crypto)
 * Supports Family Multi-Access (Мама + Папа), Vaccination Calendar, WHO Percentiles, Real-time Sync
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'pediasense_data.json');
const SALT = 'pediasense_clinical_salt_2026';



// -------------------------------------------------------------
// ХРАНИЛИЩЕ ДАННЫХ (ЧИСТАЯ БАЗА БЕЗ ПРИМЕРОВ)
// -------------------------------------------------------------
let db = {
    users: {},           // userId -> user
    usersByUsername: {}, // username -> userId
    sessions: {},        // token -> userId
    children: {},        // childId -> child
    childrenByUser: {}   // userId -> [childId]
};

function hashPassword(pass) {
    return crypto.createHash('sha256').update(SALT + pass).digest('hex');
}

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            db = JSON.parse(raw);
            console.log('📂 База данных загружена из', DB_FILE);
            return;
        }
    } catch (e) {
        console.error('Ошибка чтения БД, создание новой чистой базы:', e.message);
    }

    db = {
        users: {},
        usersByUsername: {},
        sessions: {},
        children: {},
        childrenByUser: {}
    };
    saveDatabase();
    console.log('✨ Инициализирована чистая база данных без примерных данных');
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
        console.error('Ошибка сохранения БД:', e.message);
    }
}

loadDatabase();

// -------------------------------------------------------------
// ПРОВЕРКА ДОСТУПА К ПРОФИЛЮ (РОДИТЕЛЬ 1 И РОДИТЕЛЬ 2)
// -------------------------------------------------------------
function hasChildAccess(child, userId) {
    if (!child || !userId) return false;
    if (child.userId === userId) return true;
    if (Array.isArray(child.familyMembers)) {
        return child.familyMembers.some(m => (typeof m === 'string' ? m === userId : m.userId === userId));
    }
    return false;
}

function generateFamilyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'FAM-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// -------------------------------------------------------------
// ХЕЛПЕРЫ ДЛЯ HTTP ЗАПРОСОВ
// -------------------------------------------------------------
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) {
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body.trim()) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function getAuthUserId(req) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return db.sessions[token] || null;
}

// -------------------------------------------------------------
// ОСНОВНОЙ HTTP СЕРВЕР
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Health check endpoint (для мониторинга Render)
    if (pathname === '/api/health' || pathname === '/healthz') {
        return sendJson(res, 200, { status: 'ok', service: 'pediasense', uptime: process.uptime() });
    }

    // ---------------- API МАРШРУТЫ ----------------
    if (pathname.startsWith('/api/')) {
        try {
            // POST /api/register
            if (pathname === '/api/register' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';
                const name = (body.name || '').trim();

                if (!username || !password || !name) {
                    return sendJson(res, 400, { success: false, message: 'Заполните все поля' });
                }

                if (db.usersByUsername[username]) {
                    return sendJson(res, 409, { success: false, message: 'Пользователь с таким логином уже существует' });
                }

                const userId = 'u_' + Date.now();
                const user = {
                    id: userId,
                    username,
                    name,
                    passwordHash: hashPassword(password),
                    theme: 'dark',
                    createdAt: new Date().toISOString()
                };

                const token = 'ps_' + crypto.randomBytes(16).toString('hex');
                db.users[userId] = user;
                db.usersByUsername[username] = userId;
                db.sessions[token] = userId;
                db.childrenByUser[userId] = [];
                saveDatabase();

                const safeUser = { ...user };
                delete safeUser.passwordHash;

                return sendJson(res, 200, {
                    success: true,
                    data: { token, user: safeUser, children: [] }
                });
            }

            // POST /api/login
            if (pathname === '/api/login' && method === 'POST') {
                const body = await parseJsonBody(req);
                const username = (body.username || '').trim().toLowerCase();
                const password = body.password || '';

                const userId = db.usersByUsername[username];
                if (!userId || !db.users[userId]) {
                    return sendJson(res, 401, { success: false, message: 'Неверный логин или пароль' });
                }

                const user = db.users[userId];
                if (user.passwordHash !== hashPassword(password)) {
                    return sendJson(res, 401, { success: false, message: 'Неверный логин или пароль' });
                }

                const token = 'ps_' + crypto.randomBytes(16).toString('hex');
                db.sessions[token] = userId;
                saveDatabase();

                const childIds = db.childrenByUser[userId] || [];
                const userChildren = childIds.map(cid => db.children[cid]).filter(Boolean);

                const safeUser = { ...user };
                delete safeUser.passwordHash;

                return sendJson(res, 200, {
                    success: true,
                    data: { token, user: safeUser, children: userChildren }
                });
            }

            // POST /api/logout
            if (pathname === '/api/logout' && method === 'POST') {
                const header = req.headers['authorization'];
                if (header && header.startsWith('Bearer ')) {
                    const token = header.slice(7).trim();
                    delete db.sessions[token];
                    saveDatabase();
                }
                return sendJson(res, 200, { success: true, message: 'Успешный выход' });
            }

            // Авторизованные маршруты
            const authUserId = getAuthUserId(req);
            if (!authUserId) {
                return sendJson(res, 401, { success: false, message: 'Требуется авторизация' });
            }
            const activeUser = db.users[authUserId];

            // GET /api/me (Синхронизация профиля и всех детей семьи)
            if (pathname === '/api/me' && method === 'GET') {
                if (!activeUser) return sendJson(res, 404, { success: false, message: 'Пользователь не найден' });

                const childIds = db.childrenByUser[authUserId] || [];
                const userChildren = childIds.map(cid => db.children[cid]).filter(Boolean);

                const safeUser = { ...activeUser };
                delete safeUser.passwordHash;
                return sendJson(res, 200, { success: true, data: { user: safeUser, children: userChildren } });
            }

            // PUT /api/user/theme
            if (pathname === '/api/user/theme' && method === 'PUT') {
                const body = await parseJsonBody(req);
                const theme = body.theme || 'dark';
                if (db.users[authUserId]) {
                    db.users[authUserId].theme = theme;
                    saveDatabase();
                }
                return sendJson(res, 200, { success: true, data: theme });
            }

            // POST /api/children (Создание нового профиля ребёнка)
            if (pathname === '/api/children' && method === 'POST') {
                const body = await parseJsonBody(req);
                const name = (body.name || '').trim();
                if (!name) return sendJson(res, 400, { success: false, message: 'Имя обязательно' });

                const childId = 'c_' + Date.now();
                const familyCode = generateFamilyCode();

                const newChild = {
                    id: childId,
                    userId: authUserId,
                    familyCode: familyCode,
                    familyMembers: [
                        { userId: authUserId, name: activeUser.name, role: 'Создатель профиля' }
                    ],
                    name,
                    age: parseInt(body.age, 10) || 5,
                    weight: parseFloat(body.weight) || 18,
                    height: parseFloat(body.height) || 110,
                    allergies: (body.allergies || 'Нет').trim(),
                    doctorPhone: (body.doctorPhone || '').trim(),
                    episode: (body.episode || 'Начало наблюдения').trim(),
                    points48h: [], // Чистая история замеров
                    reminders: [], // Напоминания
                    createdAt: new Date().toISOString()
                };

                db.children[childId] = newChild;
                db.childrenByUser[authUserId] = db.childrenByUser[authUserId] || [];
                db.childrenByUser[authUserId].push(childId);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newChild });
            }

            // POST /api/family/join (Семейный мульти-доступ: Мама + Папа)
            if (pathname === '/api/family/join' && method === 'POST') {
                const body = await parseJsonBody(req);
                const inputCode = (body.code || '').trim().toUpperCase();

                if (!inputCode) {
                    return sendJson(res, 400, { success: false, message: 'Введите код семейного доступа' });
                }

                // Ищем ребёнка с таким familyCode
                const matchedChild = Object.values(db.children).find(c => (c.familyCode || '').toUpperCase() === inputCode);

                if (!matchedChild) {
                    return sendJson(res, 404, { success: false, message: 'Семейный код не найден. Проверьте правильность (например FAM-7X9K)' });
                }

                // Добавляем текущего пользователя в семейный доступ к ребёнку
                matchedChild.familyMembers = matchedChild.familyMembers || [];
                const alreadyMember = matchedChild.familyMembers.some(m => (typeof m === 'string' ? m === authUserId : m.userId === authUserId));

                if (!alreadyMember) {
                    matchedChild.familyMembers.push({
                        userId: authUserId,
                        name: activeUser.name,
                        role: 'Второй родитель'
                    });
                }

                db.childrenByUser[authUserId] = db.childrenByUser[authUserId] || [];
                if (!db.childrenByUser[authUserId].includes(matchedChild.id)) {
                    db.childrenByUser[authUserId].push(matchedChild.id);
                }

                saveDatabase();

                return sendJson(res, 200, {
                    success: true,
                    message: `Семейный доступ подключен! Профиль "${matchedChild.name}" теперь синхронизируется между родителями.`,
                    data: matchedChild
                });
            }

            // DELETE /api/children/:id
            const childDelMatch = pathname.match(/^\/api\/children\/([^/]+)$/);
            if (childDelMatch && method === 'DELETE') {
                const childId = childDelMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Профиль не найден или нет доступа' });
                }

                delete db.children[childId];
                Object.keys(db.childrenByUser).forEach(uid => {
                    db.childrenByUser[uid] = db.childrenByUser[uid].filter(id => id !== childId);
                });
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Профиль удален' });
            }

            // POST /api/children/:id/entries (Добавление замера температуры с автором)
            const entryAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries$/);
            if (entryAddMatch && method === 'POST') {
                const childId = entryAddMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден или нет доступа' });
                }

                const body = await parseJsonBody(req);
                const temp = parseFloat(body.temp) || 37.0;

                child.points48h.forEach(p => { p.hours_ago = Math.min(48, (p.hours_ago || 0) + 2); });

                const newEntry = {
                    id: 'p_' + Date.now(),
                    temp,
                    drink: body.drink ? body.drink.trim() : null,
                    med: body.med ? body.med.trim() : null,
                    note: (body.note || 'Замер').trim(),
                    author: activeUser.name || 'Родитель',
                    hours_ago: 0,
                    timestamp: 'Только что'
                };

                child.points48h.push(newEntry);
                saveDatabase();

                return sendJson(res, 200, { success: true, data: newEntry });
            }

            // DELETE /api/children/:id/entries/:entryId
            const entryDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/entries\/([^/]+)$/);
            if (entryDelMatch && method === 'DELETE') {
                const [, childId, entryId] = entryDelMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                child.points48h = child.points48h.filter(p => p.id !== entryId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Запись удалена' });
            }

            // POST /api/children/:id/reminders
            const remAddMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders$/);
            if (remAddMatch && method === 'POST') {
                const childId = remAddMatch[1];
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                const body = await parseJsonBody(req);
                const newRem = {
                    id: 'r_' + Date.now(),
                    title: (body.title || 'Напоминание').trim(),
                    time: (body.time || 'По расписанию').trim(),
                    author: activeUser.name || 'Родитель',
                    done: false
                };

                child.reminders.unshift(newRem);
                saveDatabase();
                return sendJson(res, 200, { success: true, data: newRem });
            }

            // PUT /api/children/:id/reminders/:remId/toggle
            const remToggleMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders\/([^/]+)\/toggle$/);
            if (remToggleMatch && method === 'PUT') {
                const [, childId, remId] = remToggleMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                const rem = child.reminders.find(r => r.id === remId);
                if (!rem) return sendJson(res, 404, { success: false, message: 'Напоминание не найдено' });

                rem.done = !rem.done;
                saveDatabase();
                return sendJson(res, 200, { success: true, data: rem.done });
            }

            // DELETE /api/children/:id/reminders/:remId
            const remDelMatch = pathname.match(/^\/api\/children\/([^/]+)\/reminders\/([^/]+)$/);
            if (remDelMatch && method === 'DELETE') {
                const [, childId, remId] = remDelMatch;
                const child = db.children[childId];
                if (!child || !hasChildAccess(child, authUserId)) {
                    return sendJson(res, 404, { success: false, message: 'Ребёнок не найден' });
                }

                child.reminders = child.reminders.filter(r => r.id !== remId);
                saveDatabase();
                return sendJson(res, 200, { success: true, message: 'Напоминание удалено' });
            }



            return sendJson(res, 404, { success: false, message: 'API маршрут не найден' });
        } catch (err) {
            console.error('API Error:', err);
            return sendJson(res, 500, { success: false, message: 'Внутренняя ошибка сервера' });
        }
    }

    // ---------------- РАЗДАЧА СТАТИКИ (HTML) ----------------
    let indexPath = path.join(__dirname, 'static', 'index.html');
    if (!fs.existsSync(indexPath)) {
        indexPath = path.join(__dirname, 'index.html');
    }

    if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('index.html не найден');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================================');
    console.log('🏥  PediaSense — Сервер готов к работе (Render / Local Node)');
    console.log('===========================================================');
    console.log(`⚡ Сервер запущен на порту: ${PORT}`);
    console.log(`👉 Откройте в браузере:      http://localhost:${PORT}`);
    console.log(`🌐 Для проверки Render:     http://localhost:${PORT}/api/health`);
    console.log('===========================================================');
});
