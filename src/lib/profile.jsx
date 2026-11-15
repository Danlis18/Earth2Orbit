// Профіль користувача ORBITAL: акаунт на Node-сервері або гостьовий профіль у
// браузері (після «Пропустити» або на GitHub Pages, де сервера немає).
// Нотатки до локацій і налаштування належать лише цьому профілю.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { hasServer } from "./api.js";

export const ACCENTS = {
  mint: { hex: "#8ceac9", rgb: "140 234 201", ink: "#10272b", uk: "М'ятний", en: "Mint" },
  cyan: { hex: "#7fd3ff", rgb: "127 211 255", ink: "#06202e", uk: "Блакитний", en: "Cyan" },
  violet: { hex: "#b79bff", rgb: "183 155 255", ink: "#1b1033", uk: "Фіолетовий", en: "Violet" },
  amber: { hex: "#ffc46b", rgb: "255 196 107", ink: "#2b1c05", uk: "Бурштиновий", en: "Amber" },
  mars: { hex: "#ff9a76", rgb: "255 154 118", ink: "#2d1208", uk: "Марсіанський", en: "Martian" },
};
export const DEFAULT_SETTINGS = {
  accent: "mint",
  startWorld: 0,
  markers: true,
  orbitSpeed: ".25",
  interfaceScale: 1,
  guideAutoVoice: true,
  guideVoice: "lada",
  reduceMotion: false,
  showScale: true,
};
const GUEST_KEY = "orbital.guest.v1",
  SKIP_KEY = "orbital.authSkipped";

const read = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* сховище недоступне */
  }
};

const ProfileContext = createContext(null);

async function call(method, path, body) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Помилка запиту");
    error.en = data.errorEn || "Request failed";
    error.status = response.status;
    throw error;
  }
  return data;
}

export function ProfileProvider({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ready
  const [accounts, setAccounts] = useState(false); // чи працюють акаунти (є Node-сервер)
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(() => {
    const g = read(GUEST_KEY, {});
    return { settings: g.settings || {}, notes: g.notes || {} };
  });
  const [skipped, setSkipped] = useState(() => read(SKIP_KEY, false) === true);
  const [authOpen, setAuthOpen] = useState(false);
  const noteTimers = useRef({});

  useEffect(() => {
    let alive = true;
    (async () => {
      let available = false;
      if (await hasServer())
        try {
          const me = await call("GET", "/api/account/me");
          available = me.accounts === true;
          if (alive && me.user) setUser(me.user);
        } catch {
          available = false;
        }
      if (!alive) return;
      setAccounts(available);
      setStatus("ready");
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => write(GUEST_KEY, guest), [guest]);

  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(user ? user.settings : guest.settings) }),
    [user, guest.settings],
  );
  const notes = user ? user.notes || {} : guest.notes;

  // акцентний колір застосовуємо до всього сайту
  useEffect(() => {
    const accent = ACCENTS[settings.accent] || ACCENTS.mint;
    const root = document.documentElement.style;
    root.setProperty("--accent", accent.hex);
    root.setProperty("--accent-rgb", accent.rgb);
    root.setProperty("--accent-ink", accent.ink);
    document.body.classList.toggle("reduce-motion", Boolean(settings.reduceMotion));
  }, [settings.accent, settings.reduceMotion]);

  const signedIn = (nextUser) => {
    setUser(nextUser);
    // нотатки гостя вже перенесено в акаунт — локальну копію очищаємо
    setGuest((g) => ({ settings: g.settings, notes: {} }));
    setAuthOpen(false);
  };
  const register = useCallback(
    async ({ name, email, password }) =>
      signedIn((await call("POST", "/api/account/register", { name, email, password, notes: guest.notes, settings: guest.settings })).user),
    [guest],
  );
  const login = useCallback(
    async ({ email, password }) => signedIn((await call("POST", "/api/account/login", { email, password, notes: guest.notes })).user),
    [guest],
  );
  const logout = useCallback(async () => {
    try {
      await call("POST", "/api/account/logout", {});
    } finally {
      setUser(null);
    }
  }, []);
  const skip = useCallback(() => {
    write(SKIP_KEY, true);
    setSkipped(true);
    setAuthOpen(false);
  }, []);

  const updateSettings = useCallback(
    (patch) => {
      if (user) {
        setUser((u) => ({ ...u, settings: { ...u.settings, ...patch } }));
        call("PATCH", "/api/account/profile", { settings: patch }).catch(() => {});
      } else setGuest((g) => ({ ...g, settings: { ...g.settings, ...patch } }));
    },
    [user],
  );
  const resetSettings = useCallback(() => {
    const blank = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, DEFAULT_SETTINGS[k]]));
    updateSettings(blank);
  }, [updateSettings]);

  const setNote = useCallback(
    (id, text) => {
      const apply = (all) => {
        const next = { ...all };
        if (text.trim()) next[id] = { text, updatedAt: Date.now() };
        else delete next[id];
        return next;
      };
      if (user) {
        setUser((u) => ({ ...u, notes: apply(u.notes || {}) }));
        clearTimeout(noteTimers.current[id]);
        noteTimers.current[id] = setTimeout(
          () => call("PUT", "/api/account/notes/" + encodeURIComponent(id), { text }).catch(() => {}),
          600,
        );
      } else setGuest((g) => ({ ...g, notes: apply(g.notes) }));
    },
    [user],
  );

  const updateName = useCallback(async (name) => setUser((await call("PATCH", "/api/account/profile", { name })).user), []);
  const changePassword = useCallback((current, next) => call("POST", "/api/account/password", { current, next }), []);
  const deleteAccount = useCallback(async () => {
    await call("DELETE", "/api/account");
    setUser(null);
  }, []);

  const value = {
    status,
    accounts,
    user,
    settings,
    notes,
    needsAuth: status === "ready" && !user && (!skipped || authOpen),
    openAuth: () => setAuthOpen(true),
    closeAuth: () => setAuthOpen(false),
    register,
    login,
    logout,
    skip,
    updateSettings,
    resetSettings,
    setNote,
    updateName,
    changePassword,
    deleteAccount,
  };
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);
