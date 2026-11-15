import { useState } from "react";
import Modal from "./Modal.jsx";
import { useLang } from "../i18n/LanguageContext.jsx";
import { ACCENTS, useProfile } from "../lib/profile.jsx";

// Профіль: нотатки до локацій, особисті налаштування сайту, акаунт.
// Усе тут належить лише поточному профілю (акаунту або гостю в цьому браузері).
export default function ProfileModal({ places, worlds, onOpenPlace, onClose, initialTab = "notes" }) {
  const { lang, setLang } = useLang();
  const L = (uk, en) => (lang === "en" ? en : uk);
  const p = useProfile();
  const [tab, setTab] = useState(initialTab);
  const initials = p.user ? p.user.name.trim().slice(0, 1).toUpperCase() : "◈";
  const noteIds = Object.keys(p.notes).sort((a, b) => (p.notes[b].updatedAt || 0) - (p.notes[a].updatedAt || 0));
  const placeById = Object.fromEntries(places.map((place) => [place.id, place]));
  const S = p.settings;

  const Toggle = ({ k }) => (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(S[k])}
      className="toggle"
      onClick={() => p.updateSettings({ [k]: !S[k] })}
    />
  );

  function exportNotes() {
    const data = noteIds.map((id) => ({
      id,
      place: placeById[id]?.name || id,
      world: placeById[id]?.worldName || "",
      text: p.notes[id].text,
      updatedAt: new Date(p.notes[id].updatedAt).toISOString(),
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "orbital-notes.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      title={p.user ? p.user.name : L("Гостьовий профіль", "Guest profile")}
      eyebrow={L("ORBITAL · МІЙ ПРОФІЛЬ", "ORBITAL · MY PROFILE")}
      className="profile-modal"
      onClose={onClose}
    >
      <div className="profile-layout">
        <nav className="profile-side" aria-label={L("Розділи профілю", "Profile sections")}>
          <div className="profile-id">
            <span className={"profile-avatar" + (p.user ? "" : " guest")}>{initials}</span>
            <b>{p.user ? p.user.name : L("Гість", "Guest")}</b>
            <small>{p.user ? p.user.email : L("дані лише в цьому браузері", "data only in this browser")}</small>
          </div>
          {[
            ["notes", L(`✎ Мої нотатки (${noteIds.length})`, `✎ My notes (${noteIds.length})`)],
            ["settings", L("⚙ Налаштування", "⚙ Settings")],
            ["account", L("◉ Акаунт", "◉ Account")],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id}>
              {label}
            </button>
          ))}
        </nav>

        <section className="profile-main">
          {tab === "notes" && (
            <>
              <h3>{L("Мої нотатки до локацій", "My location notes")}</h3>
              <p className="mini-note">
                {L(
                  "Нотатку можна додати на сторінці будь-якої локації (блок «Мої нотатки»). Тут — усі разом: редагуй, відкривай локацію або видаляй.",
                  "Add a note on any location page (the “My notes” block). Here they are all together: edit, open the location or delete.",
                )}
              </p>
              {noteIds.length === 0 && (
                <p className="mini-note">{L("Поки що нотаток немає.", "No notes yet.")}</p>
              )}
              {noteIds.map((id) => (
                <article className="note-card" key={id}>
                  <header>
                    <b>
                      {placeById[id]?.name || id}
                      {placeById[id] && <small> · {placeById[id].worldName}</small>}
                    </b>
                    <small>{new Date(p.notes[id].updatedAt).toLocaleString(lang === "en" ? "en-GB" : "uk-UA")}</small>
                  </header>
                  <textarea
                    value={p.notes[id].text}
                    maxLength={4000}
                    onChange={(e) => p.setNote(id, e.target.value)}
                    aria-label={L("Текст нотатки", "Note text")}
                  />
                  <div className="row">
                    {placeById[id] && (
                      <button onClick={() => onOpenPlace(id)}>{L("↗ Відкрити локацію", "↗ Open location")}</button>
                    )}
                    <button className="danger" onClick={() => p.setNote(id, "")}>
                      {L("✕ Видалити", "✕ Delete")}
                    </button>
                  </div>
                </article>
              ))}
              {noteIds.length > 0 && (
                <div className="profile-actions">
                  <button onClick={exportNotes}>{L("⤓ Експорт нотаток (JSON)", "⤓ Export notes (JSON)")}</button>
                </div>
              )}
            </>
          )}

          {tab === "settings" && (
            <>
              <h3>{L("Налаштування під себе", "Make it yours")}</h3>
              <p className="mini-note">
                {p.user
                  ? L("Зберігаються в акаунті й діють на будь-якому пристрої після входу.", "Saved to your account and applied on any device after sign-in.")
                  : L("Зберігаються в цьому браузері. Після входу перейдуть в акаунт.", "Saved in this browser. They move to your account when you sign in.")}
              </p>
              <div className="setting-row">
                <span>{L("Мова інтерфейсу", "Interface language")}</span>
                <select
                  value={lang}
                  onChange={(e) => {
                    setLang(e.target.value);
                    p.updateSettings({ lang: e.target.value });
                  }}
                >
                  <option value="uk">Українська</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="setting-row">
                <span>{L("Акцентний колір", "Accent colour")}</span>
                <div className="swatches" role="radiogroup" aria-label={L("Акцентний колір", "Accent colour")}>
                  {Object.entries(ACCENTS).map(([id, a]) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={S.accent === id}
                      aria-label={lang === "en" ? a.en : a.uk}
                      title={lang === "en" ? a.en : a.uk}
                      className={S.accent === id ? "active" : ""}
                      style={{ background: a.hex, color: a.hex }}
                      onClick={() => p.updateSettings({ accent: id })}
                    />
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <span>
                  {L("Стартовий світ", "Start world")}
                  <small>{L("що показувати після відкриття сайту", "what to show when the site opens")}</small>
                </span>
                <select value={S.startWorld} onChange={(e) => p.updateSettings({ startWorld: Number(e.target.value) })}>
                  {worlds.map((w, i) => (
                    <option key={w.id} value={i}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <span>{L("Мітки локацій на планетах", "Location markers on planets")}</span>
                <Toggle k="markers" />
              </div>
              <div className="setting-row">
                <span>{L("Швидкість орбіт", "Orbit speed")}</span>
                <select value={S.orbitSpeed} onChange={(e) => p.updateSettings({ orbitSpeed: e.target.value })}>
                  {[".25", "1", "3", "8"].map((v) => (
                    <option key={v} value={v}>
                      {Number(v)}×
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <span>
                  {L("Масштаб інтерфейсу", "Interface scale")}
                  <small>{Math.round(S.interfaceScale * 100)}%</small>
                </span>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={S.interfaceScale}
                  onChange={(e) => p.updateSettings({ interfaceScale: Number(e.target.value) })}
                />
              </div>
              <div className="setting-row">
                <span>
                  {L("Гід ОРІ озвучує відповіді", "ORI reads replies aloud")}
                  <small>{L("автоматично після кожної відповіді", "automatically after each reply")}</small>
                </span>
                <Toggle k="guideAutoVoice" />
              </div>
              <div className="setting-row">
                <span>
                  {L("Український голос гіда", "Ukrainian guide voice")}
                  <small>{L("нейронний голос Piper", "Piper neural voice")}</small>
                </span>
                <select value={S.guideVoice} onChange={(e) => p.updateSettings({ guideVoice: e.target.value })}>
                  <option value="lada">{L("Лада", "Lada")}</option>
                  <option value="tetiana">{L("Тетяна", "Tetiana")}</option>
                  <option value="mykyta">{L("Микита", "Mykyta")}</option>
                </select>
              </div>
              <div className="setting-row">
                <span>
                  {L("Менше анімації", "Reduce motion")}
                  <small>{L("спокійніший інтерфейс і гід", "calmer interface and guide")}</small>
                </span>
                <Toggle k="reduceMotion" />
              </div>
              <div className="profile-actions">
                <button onClick={p.resetSettings}>{L("↺ Скинути до стандартних", "↺ Reset to defaults")}</button>
              </div>
            </>
          )}

          {tab === "account" && <AccountTab L={L} lang={lang} onClose={onClose} />}
        </section>
      </div>
    </Modal>
  );
}

function AccountTab({ L, lang, onClose }) {
  const p = useProfile();
  const [name, setName] = useState(p.user?.name || "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState(["", false]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const err = (e) => setMsg([lang === "en" ? e.en || e.message : e.message, true]);

  if (!p.user)
    return (
      <>
        <h3>{L("Ти зараз гість", "You are a guest")}</h3>
        <p className="mini-note">
          {p.accounts
            ? L(
                "Нотатки й налаштування зберігаються лише в цьому браузері. Увійди або створи акаунт — вони перейдуть у нього й будуть доступні на будь-якому пристрої.",
                "Notes and settings are kept only in this browser. Sign in or create an account — they move into it and follow you on any device.",
              )
            : L(
                "На цій версії сайту (без сервера) акаунти недоступні, тож профіль живе в цьому браузері.",
                "Accounts are not available on this version of the site (no server), so the profile lives in this browser.",
              )}
        </p>
        {p.accounts && (
          <div className="profile-actions">
            <button className="action" style={{ width: "auto" }} onClick={() => (onClose(), p.openAuth())}>
              {L("Увійти або створити акаунт", "Sign in or create an account")}
            </button>
          </div>
        )}
      </>
    );

  return (
    <>
      <h3>{L("Акаунт", "Account")}</h3>
      <p className="mini-note">
        {p.user.email} · {L("з", "since")} {new Date(p.user.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "uk-UA")}
      </p>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await p.updateName(name);
            setMsg([L("Ім'я збережено.", "Name saved."), false]);
          } catch (error) {
            err(error);
          }
        }}
      >
        <label className="mini-note">{L("Ім'я", "Name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="action">{L("Зберегти ім'я", "Save name")}</button>
      </form>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await p.changePassword(current, next);
            setCurrent("");
            setNext("");
            setMsg([L("Пароль змінено.", "Password changed."), false]);
          } catch (error) {
            err(error);
          }
        }}
      >
        <label className="mini-note">{L("Змінити пароль", "Change password")}</label>
        <input type="password" placeholder={L("Поточний пароль", "Current password")} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <input type="password" placeholder={L("Новий пароль (8+ символів)", "New password (8+ characters)")} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <button className="action secondary" disabled={!current || next.length < 8}>
          {L("Змінити пароль", "Change password")}
        </button>
      </form>
      <p className={"profile-msg" + (msg[1] ? " error" : "")} role="status">
        {msg[0]}
      </p>
      <div className="profile-actions">
        <button onClick={p.logout}>{L("⎋ Вийти", "⎋ Sign out")}</button>
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            {L("Видалити акаунт", "Delete account")}
          </button>
        ) : (
          <button
            className="danger"
            onClick={async () => {
              try {
                await p.deleteAccount();
              } catch (error) {
                err(error);
              }
            }}
          >
            {L("Так, видалити назавжди разом із нотатками", "Yes, delete forever with all notes")}
          </button>
        )}
      </div>
    </>
  );
}
