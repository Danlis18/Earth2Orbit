// Облікові записи ORBITAL (лише Node-сервер): реєстрація, вхід, сесії, профіль.
// Паролі зберігаються як scrypt-хеш із сіллю, сесія — випадковий токен у
// HttpOnly-cookie (на сервері лежить лише його SHA-256). Дані — JSON-файл у
// DATA_DIR (типово ./data, у git не потрапляє). Профіль містить лише те, що
// користувач сам вніс: ім'я, налаштування й нотатки до локацій.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const COOKIE = "orbital_session";
const SESSION_DAYS = 30;
export const LIMITS = { name: 60, email: 120, password: [8, 200], note: 4000, notes: 300, settingsBytes: 4000 };

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
const bi = (uk, en) => ({ error: uk, errorEn: en });

// ---- сховище -------------------------------------------------------------------
export function createStore(dir = process.env.DATA_DIR || "data") {
  const file = resolve(dir, "accounts.json");
  let data = null,
    writing = Promise.resolve();
  async function load() {
    if (data) return data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch {
      data = { users: {}, sessions: {} };
    }
    data.users ??= {};
    data.sessions ??= {};
    return data;
  }
  function save() {
    // послідовний атомарний запис: тимчасовий файл → rename
    writing = writing.then(async () => {
      await mkdir(dir, { recursive: true });
      const tmp = file + "." + process.pid + ".tmp";
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, file);
    });
    return writing;
  }
  return { load, save };
}

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
async function hashPassword(password, salt = randomBytes(16)) {
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function checkPassword(password, stored) {
  const [, salt, key] = String(stored).split("$");
  if (!salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

function readCookie(request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}
function sessionCookie(token, request, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---- перевірка вхідних даних ----------------------------------------------------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function cleanSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!/^[a-zA-Z][\w]{0,40}$/.test(k)) continue;
    if (["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return JSON.stringify(out).length <= LIMITS.settingsBytes ? out : {};
}
export function cleanNotes(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, note] of Object.entries(value).slice(0, LIMITS.notes)) {
    if (!/^[\w:-]{1,80}$/.test(id)) continue;
    const text = typeof note === "string" ? note : note?.text;
    if (typeof text !== "string" || !text.trim()) continue;
    out[id] = { text: text.slice(0, LIMITS.note), updatedAt: Number(note?.updatedAt) || Date.now() };
  }
  return out;
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt, settings: u.settings || {}, notes: u.notes || {} });

// ---- обмеження спроб входу -------------------------------------------------------
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: now + 15 * 60000 };
  if (a.until < now) {
    a.n = 0;
    a.until = now + 15 * 60000;
  }
  a.n++;
  attempts.set(key, a);
  if (attempts.size > 5000) attempts.clear();
  return a.n > 10;
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Обробник /api/account/*. Повертає Response або null, якщо маршрут не наш.
export function createAccountHandler(store = createStore()) {
  async function current(request) {
    const token = readCookie(request);
    if (!token) return null;
    const db = await store.load();
    const s = db.sessions[hashToken(token)];
    if (!s || s.expires < Date.now()) return null;
    return db.users[s.userId] || null;
  }
  async function startSession(user, request) {
    const db = await store.load();
    const token = randomBytes(32).toString("base64url");
    for (const [k, s] of Object.entries(db.sessions)) if (s.expires < Date.now()) delete db.sessions[k];
    db.sessions[hashToken(token)] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 86400000 };
    await store.save();
    return sessionCookie(token, request);
  }
  return async function handleAccount(request, env = {}) {
    const url = new URL(request.url),
      path = url.pathname;
    if (!path.startsWith("/api/account")) return null;
    if (request.method !== "GET") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin && origin !== env.PUBLIC_ORIGIN)
        return json(bi("Запит має надходити з цього сайту.", "Requests must come from this site."), 403);
    }
    const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();

    if (request.method === "GET" && path === "/api/account/me") {
      const user = await current(request);
      return json({ accounts: true, user: user ? publicUser(user) : null });
    }
    if (request.method === "POST" && path === "/api/account/register") {
      if (tooMany("reg:" + ip)) return json(bi("Забагато спроб. Спробуй за кілька хвилин.", "Too many attempts. Try again in a few minutes."), 429);
      const data = await body(request);
      const email = String(data?.email || "").trim().toLowerCase();
      const name = String(data?.name || "").trim();
      const password = String(data?.password || "");
      if (!EMAIL.test(email) || email.length > LIMITS.email)
        return json(bi("Вкажи коректну електронну адресу.", "Enter a valid email address."), 400);
      if (!name || name.length > LIMITS.name) return json(bi("Вкажи ім'я до 60 символів.", "Enter a name up to 60 characters."), 400);
      if (password.length < LIMITS.password[0] || password.length > LIMITS.password[1])
        return json(bi("Пароль має містити щонайменше 8 символів.", "The password must have at least 8 characters."), 400);
      const db = await store.load();
      if (Object.values(db.users).some((u) => u.email === email))
        return json(bi("Акаунт із цією адресою вже існує. Увійди або використай іншу адресу.", "An account with this email already exists. Sign in or use another email."), 409);
      const user = {
        id: randomUUID(),
        email,
        name,
        password: await hashPassword(password),
        createdAt: new Date().toISOString(),
        settings: cleanSettings(data?.settings),
        notes: cleanNotes(data?.notes), // нотатки гостя переносяться в новий акаунт
      };
      db.users[user.id] = user;
      await store.save();
      return json({ user: publicUser(user) }, 201, { "Set-Cookie": await startSession(user, request) });
    }
    if (request.method === "POST" && path === "/api/account/login") {
      const data = await body(request);
      const email = String(data?.email || "").trim().toLowerCase();
      if (tooMany("login:" + ip) || tooMany("login:" + email))
        return json(bi("Забагато спроб входу. Спробуй за 15 хвилин.", "Too many sign-in attempts. Try again in 15 minutes."), 429);
      const db = await store.load();
      const user = Object.values(db.users).find((u) => u.email === email);
      const ok = user ? await checkPassword(String(data?.password || ""), user.password) : (await hashPassword("x"), false);
      if (!ok) return json(bi("Неправильна адреса або пароль.", "Wrong email or password."), 401);
      // нотатки гостя доповнюють акаунт, не перезаписуючи наявні
      const guest = cleanNotes(data?.notes);
      for (const [id, note] of Object.entries(guest)) if (!user.notes?.[id]) (user.notes ??= {})[id] = note;
      await store.save();
      return json({ user: publicUser(user) }, 200, { "Set-Cookie": await startSession(user, request) });
    }
    if (request.method === "POST" && path === "/api/account/logout") {
      const token = readCookie(request);
      if (token) {
        const db = await store.load();
        delete db.sessions[hashToken(token)];
        await store.save();
      }
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(null, request, 0) });
    }
    const user = await current(request);
    if (!user) return json(bi("Потрібно увійти в акаунт.", "Please sign in."), 401);
    if (request.method === "PATCH" && path === "/api/account/profile") {
      const data = await body(request);
      if (data?.name !== undefined) {
        const name = String(data.name).trim();
        if (!name || name.length > LIMITS.name) return json(bi("Вкажи ім'я до 60 символів.", "Enter a name up to 60 characters."), 400);
        user.name = name;
      }
      if (data?.settings !== undefined) user.settings = cleanSettings({ ...user.settings, ...data.settings });
      await store.save();
      return json({ user: publicUser(user) });
    }
    if (request.method === "PUT" && path.startsWith("/api/account/notes/")) {
      const id = decodeURIComponent(path.slice("/api/account/notes/".length));
      if (!/^[\w:-]{1,80}$/.test(id)) return json(bi("Невідома локація.", "Unknown location."), 400);
      const data = await body(request);
      const text = String(data?.text ?? "").slice(0, LIMITS.note);
      user.notes ??= {};
      if (!text.trim()) delete user.notes[id];
      else {
        if (!user.notes[id] && Object.keys(user.notes).length >= LIMITS.notes)
          return json(bi("Забагато нотаток.", "Too many notes."), 400);
        user.notes[id] = { text, updatedAt: Date.now() };
      }
      await store.save();
      return json({ notes: user.notes });
    }
    if (request.method === "POST" && path === "/api/account/password") {
      const data = await body(request);
      if (!(await checkPassword(String(data?.current || ""), user.password)))
        return json(bi("Поточний пароль неправильний.", "The current password is wrong."), 401);
      const next = String(data?.next || "");
      if (next.length < LIMITS.password[0] || next.length > LIMITS.password[1])
        return json(bi("Пароль має містити щонайменше 8 символів.", "The password must have at least 8 characters."), 400);
      user.password = await hashPassword(next);
      await store.save();
      return json({ ok: true });
    }
    if (request.method === "DELETE" && path === "/api/account") {
      const db = await store.load();
      delete db.users[user.id];
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[k];
      await store.save();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(null, request, 0) });
    }
    return json(bi("Маршрут акаунта не знайдено.", "Account route not found."), 404);
  };
}
