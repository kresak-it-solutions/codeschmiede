// Anmelden – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import CodeschmiedeZeichen from "../Zeichen";
import { Zentriert } from "./Kopfzeile";
import { btn, fehler, input } from "../bausteine/grund";
import { supabase } from "../supabase";

// ---------------- Anmelden ----------------
export function Anmelden() {
  const [modus, setModus] = useState("login");
  const [mail, setMail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const los = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    let r;
    if (modus === "login") r = await supabase.auth.signInWithPassword({ email: mail.trim(), password: pw });
    else if (modus === "neu") r = await supabase.auth.signUp({ email: mail.trim(), password: pw, options: { emailRedirectTo: window.location.origin } });
    else r = await supabase.auth.resetPasswordForEmail(mail.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (r.error) setMsg(fehler(r.error));
    else if (modus === "neu") setMsg("Fast geschafft: Bitte bestätige den Link in der E-Mail, dann hier anmelden.");
    else if (modus === "vergessen") setMsg("Wir haben dir einen Link zum Zurücksetzen geschickt.");
  };
  return (
    <Zentriert>
      <CodeschmiedeZeichen groesse={64} />
      <h1 className="font-display font-bold text-3xl">Codeschmiede</h1>
      <p className="text-sm text-slate-500">Deine Apps. Ein Ort.</p>
      <form onSubmit={los} className="w-full flex flex-col gap-2.5 text-left">
        <label className="text-sm text-slate-500" htmlFor="cs-mail">E-Mail-Adresse</label>
        <input id="cs-mail" type="email" autoComplete="email" className={input} value={mail} onChange={(e) => setMail(e.target.value)} required />
        {modus !== "vergessen" && <><label className="text-sm text-slate-500" htmlFor="cs-pw">Passwort</label>
          <input id="cs-pw" type="password" autoComplete={modus === "neu" ? "new-password" : "current-password"} minLength={10} className={input} value={pw} onChange={(e) => setPw(e.target.value)} required /></>}
        <button type="submit" className={`${btn} w-full mt-1`} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}{{ login: "Anmelden", neu: "Konto anlegen", vergessen: "Link schicken" }[modus]}</button>
      </form>
      {msg && <p className="text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
      <div className="flex gap-4 text-sm text-emerald-700">
        {modus !== "login" && <button type="button" onClick={() => setModus("login")}>Anmelden</button>}
        {modus !== "neu" && <button type="button" onClick={() => setModus("neu")}>Konto anlegen</button>}
        {modus !== "vergessen" && <button type="button" onClick={() => setModus("vergessen")}>Passwort vergessen</button>}
      </div>
      <p className="text-xs text-slate-400">Nur für eingeladene Mitglieder. Bitte keine Daten von Kunden oder Vereinsmitgliedern in Aufträge schreiben.</p>
    </Zentriert>
  );
}
