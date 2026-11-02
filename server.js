"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const connectSqlite3 = require("connect-sqlite3");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { rateLimit } = require("express-rate-limit");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PHONE = "0506 948 405";
const PHONE_LINK = "+996506948405";
const PUBLIC_PAGES = new Map([
  ["/", "index.html"],
  ["/rooms", "rooms.html"],
  ["/rooms.html", "rooms.html"],
  ["/tours", "tours.html"],
  ["/tours.html", "tours.html"],
  ["/conference", "conference.html"],
  ["/conference.html", "conference.html"],
  ["/news", "news.html"],
  ["/news.html", "news.html"],
  ["/contacts", "contact.html"],
  ["/contact", "contact.html"],
  ["/contact.html", "contact.html"],
  ["/admin", "admin.html"],
  ["/admin.html", "admin.html"]
]);
const ASSET_FILES = new Set(["style.css", "script.js", "admin.css", "admin.js"]);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid port number.");
}
if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
  throw new Error("This installation is local-only. Set HOST to 127.0.0.1.");
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "hotel.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price > 0),
    area INTEGER NOT NULL CHECK (area > 0),
    capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 10),
    image TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    score TEXT NOT NULL DEFAULT '—',
    description TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 10),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    room_name TEXT NOT NULL,
    price_per_night INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings(created_at DESC);
  CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
`);

if (db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count === 0) {
  const insertRoom = db.prepare(`
    INSERT INTO rooms (slug, name, description, price, area, capacity, image)
    VALUES (@slug, @name, @description, @price, @area, @capacity, @image)
  `);
  const seedRooms = db.transaction(() => {
    [
      {
        slug: "standard",
        name: "Стандарт",
        description: "Уютный номер с удобной кроватью и всем необходимым для спокойного отдыха.",
        price: 4500,
        area: 22,
        capacity: 2,
        image: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1000&q=75&fm=webp"
      },
      {
        slug: "comfort",
        name: "Комфорт",
        description: "Больше пространства, мягкий свет и уютная зона, чтобы отдыхать в своём ритме.",
        price: 6800,
        area: 30,
        capacity: 2,
        image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=75&fm=webp"
      },
      {
        slug: "suite",
        name: "Люкс с видом",
        description: "Просторный номер с балконом для особенного отдыха и долгих завтраков.",
        price: 9500,
        area: 42,
        capacity: 4,
        image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=75&fm=webp"
      }
    ].forEach((room) => insertRoom.run(room));
  });
  seedRooms();
}

if (db.prepare("SELECT COUNT(*) AS count FROM news").get().count === 0) {
  const insertNews = db.prepare(`
    INSERT INTO news (category, title, description, image)
    VALUES (@category, @title, @description, @image)
  `);
  const seedNews = db.transaction(() => {
    [
      {
        category: "Сезонное предложение",
        title: "Спокойный отдых среди гор",
        description: "Уточните по телефону доступность номеров и актуальные условия на ваши даты.",
        image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=75&fm=webp"
      },
      {
        category: "Экскурсии",
        title: "Маршруты к высокогорным озёрам",
        description: "Узнайте, какие прогулки доступны в выбранный сезон и какая подготовка потребуется.",
        image: "https://images.unsplash.com/photo-1464278533981-50106e6176b1?auto=format&fit=crop&w=900&q=75&fm=webp"
      },
      {
        category: "Совет путешественникам",
        title: "Путешествуйте без спешки",
        description: "Оставьте время на красивые остановки, местную кухню и отдых на свежем воздухе.",
        image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=75&fm=webp"
      }
    ].forEach((item) => insertNews.run(item));
  });
  seedNews();
}

if (db.prepare("SELECT COUNT(*) AS count FROM reviews").get().count === 0) {
  const insertReview = db.prepare(`
    INSERT INTO reviews (platform, score, description, url)
    VALUES (@platform, '—', @description, '')
  `);
  const seedReviews = db.transaction(() => {
    [
      { platform: "Booking.com", description: "Добавьте действующую оценку и ссылку на профиль отеля в админ-панели." },
      { platform: "Google", description: "Укажите проверенные отзывы и оценку компании в Google." },
      { platform: "Tripadvisor", description: "Добавьте подтверждённую оценку отеля на сервисе." }
    ].forEach((review) => insertReview.run(review));
  });
  seedReviews();
}

const setupToken = crypto.randomBytes(24).toString("hex");
const isLoopback = (req) => {
  const address = req.socket.remoteAddress || "";
  const host = (req.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  return (address === "::1" || address === "::ffff:127.0.0.1" || address === "127.0.0.1")
    && ["127.0.0.1", "localhost", "::1"].includes(host);
};
const adminCount = () => db.prepare("SELECT COUNT(*) AS count FROM admins").get().count;
const publicRooms = () => db.prepare("SELECT slug, name, description, price, area, capacity, image FROM rooms ORDER BY id").all();
const publicNews = () => db.prepare("SELECT id, category, title, description, image, created_at FROM news ORDER BY created_at DESC, id DESC").all();

const app = express();
const SQLiteStore = connectSqlite3(session);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(express.json({ limit: "20kb", type: "application/json" }));
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) req.body = {};
  next();
});
app.use(session({
  name: "ala-too.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR, concurrentDB: true }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Подождите 15 минут." }
});
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Слишком много заявок. Пожалуйста, попробуйте позже." }
});

function requireAdmin(req, res, next) {
  if (Number.isInteger(req.session.adminId)
      && db.prepare("SELECT 1 FROM admins WHERE id = ?").get(req.session.adminId)) return next();
  return res.status(401).json({ error: "Войдите в панель администратора." });
}

function requireCsrf(req, res, next) {
  const supplied = req.get("x-csrf-token");
  const expected = req.session.csrfToken;
  if (typeof supplied !== "string" || typeof expected !== "string") {
    return res.status(403).json({ error: "Сессия истекла. Обновите страницу и войдите снова." });
  }
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: "Сессия истекла. Обновите страницу и войдите снова." });
  }
  return next();
}

function textField(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`Укажите поле «${label}».`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`Поле «${label}» должно содержать от 1 до ${maxLength} символов.`);
  return text;
}

function positiveInt(value, label, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`Проверьте значение поля «${label}».`);
  return parsed;
}

function httpsUrl(value, label) {
  const link = textField(value, label, 1500);
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Добавьте корректную ссылку HTTPS (${label}).`);
  }
  if (url.protocol !== "https:") throw new Error(`Ссылка (${label}) должна начинаться с HTTPS.`);
  return url.href;
}

function imageUrl(value) {
  const image = textField(value, "ссылка на изображение", 1500);
  if (image.startsWith("/") && !image.startsWith("//")) return image;
  return httpsUrl(image, "изображение");
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function rejectForeignOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return res.status(403).json({ error: "Запрос отклонён." });
  }
  if (originHost !== (req.get("host") || "").toLowerCase()) {
    return res.status(403).json({ error: "Запрос отклонён." });
  }
  return next();
}

for (const [route, filename] of PUBLIC_PAGES) {
  app.get(route, (_req, res, next) => {
    res.sendFile(path.join(ROOT, filename), (error) => {
      if (error) next(error);
    });
  });
}

app.get(/^\/(style\.css|script\.js|admin\.css|admin\.js)$/, (req, res, next) => {
  const filename = req.path.slice(1);
  if (!ASSET_FILES.has(filename)) return res.sendStatus(404);
  res.sendFile(path.join(ROOT, filename), (error) => {
    if (error) next(error);
  });
});

app.get("/api/public", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const reviews = db.prepare("SELECT id, platform, score, description, url FROM reviews ORDER BY id").all();
  res.json({ hotel: { name: "Ала-Тоо Inn", phone: PHONE, phoneLink: PHONE_LINK }, rooms: publicRooms(), news: publicNews(), reviews });
});

app.post("/api/bookings", bookingLimiter, rejectForeignOrigin, (req, res, next) => {
  try {
    const guestName = textField(req.body.guestName, "имя", 100);
    const phone = textField(req.body.phone, "телефон", 30);
    if (!/^[+\d\s().-]{7,30}$/.test(phone)) return res.status(400).json({ error: "Проверьте формат номера телефона." });
    const { checkIn, checkOut } = req.body;
    if (!validDate(checkIn) || !validDate(checkOut)) return res.status(400).json({ error: "Выберите корректные даты заезда и выезда." });
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
    if (checkIn < todayUtc || checkOut <= checkIn) return res.status(400).json({ error: "Выезд должен быть позже заезда, а даты не могут быть в прошлом." });
    const nights = (Date.parse(`${checkOut}T00:00:00.000Z`) - Date.parse(`${checkIn}T00:00:00.000Z`)) / 86400000;
    if (!Number.isInteger(nights) || nights > 90) return res.status(400).json({ error: "Максимальная продолжительность проживания — 90 ночей." });
    const guests = positiveInt(req.body.guests, "количество гостей", 10);
    const room = db.prepare("SELECT id, name, price, capacity FROM rooms WHERE slug = ?").get(req.body.room);
    if (!room) return res.status(400).json({ error: "Выберите категорию номера." });
    if (guests > room.capacity) return res.status(400).json({ error: `В выбранном номере можно разместить не более ${room.capacity} гостей.` });

    const total = room.price * nights;
    const inserted = db.prepare(`
      INSERT INTO bookings (guest_name, phone, check_in, check_out, guests, room_id, room_name, price_per_night, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guestName, phone, checkIn, checkOut, guests, room.id, room.name, room.price, total);
    return res.status(201).json({
      message: `Заявка №${inserted.lastInsertRowid} принята. Мы позвоним вам для подтверждения бронирования.`,
      bookingId: inserted.lastInsertRowid,
      room: room.name,
      nights,
      total,
      phone: PHONE
    });
  } catch (error) {
    if (error instanceof Error && !error.code) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

app.get("/api/admin/session", (req, res) => {
  if (!adminCount()) return res.json({ setupRequired: true, authenticated: false });
  if (!Number.isInteger(req.session.adminId)
      || !db.prepare("SELECT 1 FROM admins WHERE id = ?").get(req.session.adminId)) {
    return res.json({ setupRequired: false, authenticated: false });
  }
  req.session.csrfToken ||= crypto.randomBytes(32).toString("hex");
  req.session.save((error) => {
    if (error) return res.status(500).json({ error: "Не удалось создать защищённую сессию." });
    return res.json({ setupRequired: false, authenticated: true, username: req.session.username, csrfToken: req.session.csrfToken });
  });
});

app.post("/api/admin/setup", loginLimiter, rejectForeignOrigin, async (req, res, next) => {
  if (!isLoopback(req)) return res.status(403).json({ error: "Первоначальная настройка доступна только на этом компьютере." });
  if (adminCount()) return res.status(409).json({ error: "Учётная запись администратора уже создана." });
  try {
    const suppliedToken = textField(req.body.setupToken, "одноразовый код", 256);
    const expected = Buffer.from(setupToken);
    const actual = Buffer.from(suppliedToken);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(403).json({ error: "Неверный одноразовый код. Скопируйте его из окна сервера." });
    }
    const username = "admin";
    if (typeof req.body.password !== "string" || !req.body.password) return res.status(400).json({ error: "Укажите пароль." });
    const password = YOUR_VALUE_HERE;
    if (password.length < 12) return res.status(400).json({ error: "Пароль должен содержать не менее 12 символов." });
    if (password.length > 200) return res.status(400).json({ error: "Пароль не должен превышать 200 символов." });
    const hash = await bcrypt.hash(password, 12);
    const created = db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, hash);
    req.session.adminId = Number(created.lastInsertRowid);
    req.session.username = username;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    req.session.save((error) => {
      if (error) return next(error);
      return res.status(201).json({ username, csrfToken: req.session.csrfToken });
    });
  } catch (error) {
    if (error instanceof Error && !error.code) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

app.post("/api/admin/login", loginLimiter, rejectForeignOrigin, async (req, res, next) => {
  try {
    const username = textField(req.body.username, "логин", 80);
    if (typeof req.body.password !== "string" || !req.body.password || req.body.password.length > 200) {
      return res.status(400).json({ error: "Проверьте пароль." });
    }
    const password = YOUR_VALUE_HERE;
    const admin = db.prepare("SELECT id, username, password_hash FROM admins WHERE username = ?").get(username);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: "Неверный логин или пароль." });
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.adminId = admin.id;
      req.session.username = admin.username;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.json({ username: admin.username, csrfToken: req.session.csrfToken });
      });
    });
  } catch (error) {
    if (error instanceof Error && !error.code) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

app.post("/api/admin/logout", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("ala-too.sid", { httpOnly: true, sameSite: "strict", secure: false });
    return res.json({ message: "Вы вышли из панели." });
  });
});

app.get("/api/admin/data", requireAdmin, (_req, res) => {
  const bookings = db.prepare(`
    SELECT id, guest_name, phone, check_in, check_out, guests, room_name, price_per_night, total, status, created_at
    FROM bookings ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, created_at DESC, id DESC
  `).all();
  res.set("Cache-Control", "no-store");
  const reviews = db.prepare("SELECT id, platform, score, description, url FROM reviews ORDER BY id").all();
  res.json({ rooms: publicRooms(), news: publicNews(), reviews, bookings, phone: PHONE });
});

app.put("/api/admin/rooms/:slug", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res) => {
  try {
    const name = textField(req.body.name, "название номера", 80);
    const description = textField(req.body.description, "описание номера", 500);
    const price = positiveInt(req.body.price, "цена", 10000000);
    const area = positiveInt(req.body.area, "площадь", 1000);
    const capacity = positiveInt(req.body.capacity, "вместимость", 10);
    const image = imageUrl(req.body.image);
    const result = db.prepare(`
      UPDATE rooms SET name = ?, description = ?, price = ?, area = ?, capacity = ?, image = ? WHERE slug = ?
    `).run(name, description, price, area, capacity, image, req.params.slug);
    if (!result.changes) return res.status(404).json({ error: "Номер не найден." });
    return res.json({ room: db.prepare("SELECT slug, name, description, price, area, capacity, image FROM rooms WHERE slug = ?").get(req.params.slug) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/news", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res) => {
  try {
    const category = textField(req.body.category, "категория", 60);
    const title = textField(req.body.title, "заголовок", 160);
    const description = textField(req.body.description, "текст новости", 600);
    const image = imageUrl(req.body.image);
    const result = db.prepare("INSERT INTO news (category, title, description, image) VALUES (?, ?, ?, ?)").run(category, title, description, image);
    return res.status(201).json({ news: db.prepare("SELECT id, category, title, description, image, created_at FROM news WHERE id = ?").get(result.lastInsertRowid) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete("/api/admin/news/:id", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Некорректный номер новости." });
  const result = db.prepare("DELETE FROM news WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Новость не найдена." });
  return res.json({ message: "Новость удалена." });
});

app.put("/api/admin/reviews/:id", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Некорректная запись рейтинга." });
  try {
    const score = textField(req.body.score, "оценку", 24);
    const description = textField(req.body.description, "подпись", 180);
    const url = typeof req.body.url === "string" && req.body.url.trim() ? httpsUrl(req.body.url, "страница рейтинга") : "";
    const result = db.prepare("UPDATE reviews SET score = ?, description = ?, url = ? WHERE id = ?").run(score, description, url, id);
    if (!result.changes) return res.status(404).json({ error: "Запись рейтинга не найдена." });
    const review = db.prepare("SELECT id, platform, score, description, url FROM reviews WHERE id = ?").get(id);
    return res.json({ review });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.patch("/api/admin/bookings/:id", requireAdmin, rejectForeignOrigin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Некорректный номер бронирования." });
  if (!["new", "confirmed", "cancelled"].includes(status)) return res.status(400).json({ error: "Выберите корректный статус заявки." });
  const result = db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
  if (!result.changes) return res.status(404).json({ error: "Заявка не найдена." });
  return res.json({ message: "Статус заявки обновлён." });
});

app.get("/api/*path", (_req, res) => res.status(404).json({ error: "Такой API-адрес не найден." }));
app.get("*path", (_req, res) => res.status(404).type("text").send("Страница не найдена."));

app.use((error, _req, res, _next) => {
  console.error("[server]", error);
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  const message = status === 400
    ? "Проверьте формат запроса и переданные данные."
    : status === 413
      ? "Слишком большой запрос."
      : "Ошибка сервера. Проверьте окно, в котором запущен сайт.";
  return res.status(status).json({ error: message });
});

const server = app.listen(PORT, HOST, () => {
  console.log("");
  console.log(`Ала-Тоо Inn запущен: http://${HOST}:${PORT}`);
  console.log(`Телефон отеля: ${PHONE}`);
  if (!adminCount()) {
    console.log("ПЕРВОНАЧАЛЬНАЯ НАСТРОЙКА АДМИНИСТРАТОРА");
    console.log(`Одноразовый код (сохраните его для формы /admin): ${setupToken}`);
  }
  console.log("Оставьте это окно открытым, пока пользуетесь сайтом.");
  console.log("");
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
