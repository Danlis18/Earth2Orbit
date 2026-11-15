import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";
import { useProfile } from "../lib/profile.jsx";
import LanguageSwitch from "./LanguageSwitch.jsx";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Стартовий екран: вхід / реєстрація з можливістю пропустити.
// Ліворуч — сцена в стилі сайту (◈ ORBITAL, орбіти, планети), праворуч — форма.
export default function AuthScreen() {
  const { lang } = useLang();
  const L = (uk, en) => (lang === "en" ? en : uk);
  const { accounts, login, register, skip } = useProfile();
  const [mode, setMode] = useState("signin"); // signin | register
  const [step, setStep] = useState(1); // 1 — пошта, 2 — пароль
  const [info, setInfo] = useState(null); // about | trouble | privacy
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
  }, [mode, step, info]);
  // сайт під стартовим екраном недоступний для клавіатури й читачів екрана
  const screen = useRef(null);
  useEffect(() => {
    const siblings = [...(screen.current?.parentElement?.children || [])].filter((el) => el !== screen.current);
    siblings.forEach((el) => el.setAttribute("inert", ""));
    return () => siblings.forEach((el) => el.removeAttribute("inert"));
  }, []);
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && skip();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [skip]);

  const validEmail = EMAIL.test(email.trim());
  const fail = (e) => setError(lang === "en" ? e.en || e.message : e.message);
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (mode === "signin" && step === 1) {
      if (validEmail) setStep(2);
      return;
    }
    if (mode === "register") {
      if (password.length < 8) return setError(L("Пароль має містити щонайменше 8 символів.", "The password must have at least 8 characters."));
      if (password !== confirm) return setError(L("Паролі не збігаються.", "The passwords do not match."));
    }
    setBusy(true);
    try {
      if (mode === "signin") await login({ email: email.trim(), password });
      else await register({ name: name.trim(), email: email.trim(), password });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const switchMode = (next) => {
    setMode(next);
    setStep(1);
    setPassword("");
    setConfirm("");
    setError("");
    setInfo(null);
  };
  const strength = password.length >= 12 && /\d/.test(password) && /[^\w]/.test(password) ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0;

  const infoText = {
    about: [
      L("Про акаунт ORBITAL", "About the ORBITAL account"),
      L(
        "Акаунт зберігає твій профіль: ім'я, нотатки до локацій і налаштування сайту (колір, мова, швидкість орбіт, голос гіда тощо). Вони доступні лише тобі й синхронізуються на будь-якому пристрої, де ти входиш. Без акаунта все те саме зберігається тільки в цьому браузері.",
        "The account keeps your profile: name, notes for locations and site settings (colour, language, orbit speed, guide voice and more). Only you can see them, and they follow you to any device where you sign in. Without an account the same data stays only in this browser.",
      ),
    ],
    trouble: [
      L("Не вдається увійти?", "Trouble signing in?"),
      L(
        "Перевір адресу пошти й розкладку клавіатури. Після 10 невдалих спроб вхід блокується на 15 хвилин. Відновлення пароля поштою поки немає: можна створити новий акаунт або продовжити без входу — нотатки збережуться в браузері, а пізніше перейдуть в акаунт.",
        "Check the email address and keyboard layout. After 10 failed attempts sign-in is locked for 15 minutes. Password reset by email is not available yet: create a new account or continue without signing in — notes stay in this browser and move into your account later.",
      ),
    ],
    privacy: [
      L("Конфіденційність", "Privacy"),
      L(
        "Сервер проєкту зберігає лише пошту, ім'я, хеш пароля (сам пароль — ніколи), нотатки й налаштування. Сесія — захищене cookie на 30 днів. Дані не передаються третім сторонам, а видалити акаунт з усіма даними можна в профілі. Запитання до гіда ОРІ надсилаються AI-сервісу без даних акаунта.",
        "The project server stores only your email, name, a password hash (never the password itself), notes and settings. The session is a secure cookie for 30 days. Data is not shared with third parties, and you can delete the account with all data in your profile. Questions to the ORI guide go to the AI service without account data.",
      ),
    ],
  };

  return (
    <div ref={screen} className="auth-screen" role="dialog" aria-modal="true" aria-label={L("Вхід в ORBITAL", "Sign in to ORBITAL")}>
      <div className="auth-art" aria-hidden="true">
        <div className="auth-stars" />
        <svg className="auth-orbits" viewBox="0 0 800 800">
          <ellipse cx="400" cy="400" rx="330" ry="120" />
          <ellipse cx="400" cy="400" rx="250" ry="250" transform="rotate(-24 400 400)" />
          <ellipse cx="400" cy="400" rx="370" ry="190" transform="rotate(18 400 400)" />
        </svg>
        <span className="auth-planet earth" />
        <span className="auth-planet moon" />
        <span className="auth-planet mars" />
        <span className="auth-shape ring" />
        <span className="auth-shape tri" />
        <span className="auth-shape dia" />
        <div className="auth-emblem">
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="emb" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="#7fd3ff" />
              </linearGradient>
            </defs>
            <path d="M60 6 114 60 60 114 6 60Z" fill="none" stroke="url(#emb)" strokeWidth="5" />
            <path d="M60 34 86 60 60 86 34 60Z" fill="url(#emb)" />
          </svg>
          <b>ORBITAL</b>
          <small>EARTH ANALOG EXPLORER</small>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-top">
          <LanguageSwitch />
          <button className="auth-close" onClick={skip} aria-label={L("Закрити й продовжити без входу", "Close and continue without signing in")}>
            ×
          </button>
        </div>

        <div className="auth-body">
          {info ? (
            <div className="auth-info">
              <h1>{infoText[info][0]}</h1>
              <p>{infoText[info][1]}</p>
              <button ref={firstField} className="auth-secondary" onClick={() => setInfo(null)}>
                {L("← Назад", "← Back")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1>{mode === "signin" ? L("Увійти в ORBITAL", "Sign in to ORBITAL") : L("Створити акаунт", "Create an account")}</h1>
              {!accounts && (
                <p className="auth-note warn">
                  {L(
                    "На цій версії сайту немає сервера акаунтів. Продовж без входу — нотатки й налаштування збережуться в цьому браузері.",
                    "This version of the site has no account server. Continue without signing in — notes and settings will be saved in this browser.",
                  )}
                </p>
              )}
              {mode === "register" && (
                <label>
                  {L("Ім'я", "Name")}
                  <input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required disabled={!accounts} />
                </label>
              )}
              {mode === "signin" && step === 2 ? (
                <div className="auth-chip">
                  <span>{email.trim()}</span>
                  <button type="button" onClick={() => (setStep(1), setPassword(""), setError(""))}>
                    {L("Змінити", "Change")}
                  </button>
                </div>
              ) : (
                <label>
                  {L("Електронна пошта", "Email address")}
                  <input
                    ref={mode === "signin" ? firstField : undefined}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={120}
                    autoComplete={mode === "signin" ? "username" : "email"}
                    required
                    disabled={!accounts}
                  />
                </label>
              )}
              {(mode === "register" || step === 2) && (
                <label>
                  {L("Пароль", "Password")}
                  <span className="auth-password">
                    <input
                      ref={mode === "signin" ? firstField : undefined}
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={200}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      required
                    />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? L("Сховати пароль", "Hide password") : L("Показати пароль", "Show password")}>
                      {show ? "◉" : "○"}
                    </button>
                  </span>
                </label>
              )}
              {mode === "register" && (
                <>
                  <div className={"auth-strength s" + strength} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <span>
                      {[L("щонайменше 8 символів", "at least 8 characters"), L("достатньо", "fair"), L("добре", "good"), L("надійно", "strong")][strength]}
                    </span>
                  </div>
                  <label>
                    {L("Повтори пароль", "Repeat password")}
                    <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={200} autoComplete="new-password" required />
                  </label>
                </>
              )}
              {error && (
                <p className="auth-note error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="auth-primary"
                disabled={
                  !accounts ||
                  busy ||
                  (mode === "signin" && step === 1 && !validEmail) ||
                  (mode === "signin" && step === 2 && !password) ||
                  (mode === "register" && (!name.trim() || !validEmail || !password || !confirm))
                }
              >
                {busy
                  ? L("Зачекай…", "Please wait…")
                  : mode === "register"
                    ? L("Створити акаунт", "Create account")
                    : step === 1
                      ? L("Далі", "Next")
                      : L("Увійти", "Sign in")}
              </button>
              <div className="auth-links">
                <button type="button" onClick={() => setInfo("about")}>
                  {L("Про акаунт ORBITAL", "About the ORBITAL account")}
                </button>
                {mode === "signin" && (
                  <button type="button" onClick={() => setInfo("trouble")}>
                    {L("Не вдається увійти?", "Trouble signing in?")}
                  </button>
                )}
              </div>
              <button type="button" className="auth-secondary" onClick={() => switchMode(mode === "signin" ? "register" : "signin")}>
                {mode === "signin" ? L("Створити акаунт", "Create an account") : L("Вже є акаунт? Увійти", "Have an account? Sign in")}
              </button>
            </form>
          )}
        </div>

        <div className="auth-foot">
          <button className="auth-skip" onClick={skip}>
            {L("Пропустити", "Skip")} <span aria-hidden="true">→</span>
          </button>
          <small>{L("Без входу профіль зберігається лише в цьому браузері. Увійти можна будь-коли з профілю.", "Without signing in, your profile stays in this browser. You can sign in any time from the profile.")}</small>
          <div className="auth-legal">
            <button onClick={() => setInfo("privacy")}>{L("Конфіденційність", "Privacy")}</button>
            <span>·</span>
            <span>NASA Space Apps Challenge 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
