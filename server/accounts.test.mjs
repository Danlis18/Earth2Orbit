import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccountHandler, createStore } from "./accounts.mjs";

const dir = await mkdtemp(join(tmpdir(), "orbital-acc-"));
const handle = createAccountHandler(createStore(dir));
let ip = 0;
const call = (method, path, body, cookie) =>
  handle(
    new Request("http://orbital.test" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0." + ++ip,
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];

test("register → session → profile, notes and settings", async () => {
  const reg = await call("POST", "/api/account/register", {
    email: "Test@Example.com",
    name: "Тест",
    password: "correct horse",
    notes: { "earth:0": "нотатка гостя" },
  });
  assert.equal(reg.status, 201);
  const cookie = cookieOf(reg);
  assert.match(reg.headers.get("set-cookie"), /HttpOnly/);
  const me = await (await call("GET", "/api/account/me", null, cookie)).json();
  assert.equal(me.user.email, "test@example.com");
  assert.equal(me.user.notes["earth:0"].text, "нотатка гостя");
  assert.equal(me.user.password, undefined);

  const note = await call("PUT", "/api/account/notes/mars:2", { text: "Перевірити шари осадів" }, cookie);
  assert.equal((await note.json()).notes["mars:2"].text, "Перевірити шари осадів");
  const prof = await (await call("PATCH", "/api/account/profile", { settings: { accent: "violet", bad: { x: 1 } } }, cookie)).json();
  assert.deepEqual(prof.user.settings, { accent: "violet" });

  const stored = await readFile(join(dir, "accounts.json"), "utf8");
  assert.doesNotMatch(stored, /correct horse/);
  assert.match(stored, /scrypt\$/);
});

test("login checks the password and duplicate emails are rejected", async () => {
  assert.equal((await call("POST", "/api/account/register", { email: "test@example.com", name: "X", password: "12345678" })).status, 409);
  assert.equal((await call("POST", "/api/account/login", { email: "test@example.com", password: "wrong pass" })).status, 401);
  const ok = await call("POST", "/api/account/login", { email: "test@example.com", password: "correct horse" });
  assert.equal(ok.status, 200);
  const cookie = cookieOf(ok);
  assert.equal((await call("POST", "/api/account/logout", {}, cookie)).status, 200);
  assert.equal((await (await call("GET", "/api/account/me", null, cookie)).json()).user, null);
});

test("protected routes need a session and validate input", async () => {
  assert.equal((await call("PUT", "/api/account/notes/earth:1", { text: "x" })).status, 401);
  assert.equal((await call("POST", "/api/account/register", { email: "bad", name: "A", password: "12345678" })).status, 400);
  assert.equal((await call("POST", "/api/account/register", { email: "a@b.co", name: "A", password: "short" })).status, 400);
});
