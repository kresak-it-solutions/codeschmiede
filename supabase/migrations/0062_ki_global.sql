-- Codeschmiede · Datenbank 0062: KI-Anbindungen global (0.18.0) – Claude, Meldung und Freigabe von Gerhard 03.11.2026
-- („In neuen Projekten fehlen die Zuständigkeiten für die KI-Anbindungen. Es sind auch nicht alle Anbieter angeführt. Mach das so wie bei
-- Trainer to go. Das ist eine globale Einstellung.“)
--
--   * Neue Tabelle ws_ki_zustaendigkeit_global: EINE Zuständigkeit je Aufgabe für ALLE Projekte (gleiche Prüfung ws_ki_reihe_ok wie bisher).
--     Für „bauen“ steht hier zusätzlich das globale Programmier-Werkzeug (werkzeug/werkzeug_modell, gleiche Regeln wie 0057).
--   * Startwerte = die Zeilen von Trainer to go (projekt_id 'trainer-to-go'); fehlt dort eine Aufgabe, die bisherigen Standardwerte
--     (ws_ki_standard_reihen aus 0056 = STANDARD im Dienst). Nie überschreibend (on conflict do nothing) – ein zweites Einspielen ändert nichts.
--   * Die Zuständigkeiten je Projekt (ws_ki_zustaendigkeit) gelten ab 0.18.0 NICHT mehr für chat, konzept, design, pruefung, doku, texte, bilder.
--     Die alten Zeilen bleiben stehen (nicht gelöscht), haben aber keine Wirkung. Für „bauen“ bleibt die Wahl je Projekt (0057): gibt es eine
--     Projektzeile, gilt sie; sonst gilt der globale Wert („wie global“).
--   * Lesen: angemeldete, aktive Mitglieder, die mindestens ein Projekt sehen. Schreiben nur über ws_ki_global_setzen (nur Admin, Protokoll).
--   * Der Trigger aus 0056 (Standardzeilen je neuem Projekt) entfällt – neue Projekte haben über die globale Tabelle sofort alle Zuständigkeiten.
--   * Der Auftrags-Schutz aus 0057 prüft das Werkzeug gegen Projektzeile, sonst globalen Wert.
--   * ws_ki_anbieter_loeschen entfernt einen gelöschten eigenen Anbieter auch aus den globalen Zuständigkeiten.
--   * Teil 2 (Gerhard 03.11.2026 08:11): lange Fragen – gemeinsame Obergrenze 200.000 Zeichen (ws_text_max), siehe unten.
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0062. Test: supabase/tests/t49_ki_global.sql.
-- Hinweis: Wird 0057 später noch einmal eingespielt, setzt es den Auftrags-Schutz auf die alte Fassung zurück – danach 0062 erneut einspielen.

begin;

-- ---------- 1. Tabelle ----------
create table if not exists public.ws_ki_zustaendigkeit_global (
  aufgabe text primary key,
  reihe jsonb not null,
  weitergeben_ab int not null default 90 check (weitergeben_ab between 50 and 100),
  werkzeug text not null default 'claude-code',
  werkzeug_modell text,
  geaendert timestamptz not null default now(),
  geaendert_von uuid references auth.users(id),
  check (public.ws_ki_reihe_ok(aufgabe, reihe))
);
alter table public.ws_ki_zustaendigkeit_global drop constraint if exists ws_ki_zust_global_werkzeug_check;
alter table public.ws_ki_zustaendigkeit_global add constraint ws_ki_zust_global_werkzeug_check check (
  werkzeug in ('claude-code', 'codex', 'gemini-cli', 'opencode')
  and (aufgabe = 'bauen' or (werkzeug = 'claude-code' and werkzeug_modell is null))
  and public.ws_werkzeug_modell_ok(werkzeug, werkzeug_modell));

revoke all on public.ws_ki_zustaendigkeit_global from public, anon, authenticated;
grant select on public.ws_ki_zustaendigkeit_global to authenticated;
alter table public.ws_ki_zustaendigkeit_global enable row level security;

-- Wer mindestens ein Projekt sieht (Admin oder Mitglied eines Projekts, aktiv)
create or replace function public.ws_sieht_ein_projekt() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ws_ist_admin() or exists (
    select 1 from public.ws_projekt_mitglieder m join public.ws_benutzer b on b.id = m.benutzer_id
     where m.benutzer_id = auth.uid() and b.aktiv)
$$;
revoke execute on function public.ws_sieht_ein_projekt() from public, anon;
grant execute on function public.ws_sieht_ein_projekt() to authenticated;

drop policy if exists ws_ki_zust_global_lesen on public.ws_ki_zustaendigkeit_global;
create policy ws_ki_zust_global_lesen on public.ws_ki_zustaendigkeit_global for select to authenticated
  using (public.ws_ist_mitglied() and public.ws_sieht_ein_projekt());

-- ---------- 2. Startwerte: wie Trainer to go, sonst Standard ----------
with neu as (
  insert into public.ws_ki_zustaendigkeit_global (aufgabe, reihe, weitergeben_ab, werkzeug, werkzeug_modell, geaendert, geaendert_von)
  select s.aufgabe,
         case when z.reihe is not null and public.ws_ki_reihe_ok(s.aufgabe, z.reihe) then z.reihe else s.reihe end,
         coalesce(z.weitergeben_ab, 90),
         case when s.aufgabe = 'bauen' then coalesce(z.werkzeug, 'claude-code') else 'claude-code' end,
         case when s.aufgabe = 'bauen' and coalesce(z.werkzeug, 'claude-code') <> 'claude-code' then z.werkzeug_modell end,
         now(), null
    from public.ws_ki_standard_reihen() s
    left join public.ws_ki_zustaendigkeit z on z.projekt_id = 'trainer-to-go' and z.aufgabe = s.aufgabe
  on conflict (aufgabe) do nothing
  returning aufgabe
)
insert into public.ws_protokoll (wer, was, details)
select null, 'ki_global_start', jsonb_build_object('quelle', 'trainer-to-go', 'aufgaben', jsonb_agg(aufgabe order by aufgabe))
  from neu having count(*) > 0;

-- ---------- 3. Speichern (nur Admin, Protokoll) ----------
-- Für „bauen“ optional das globale Programmier-Werkzeug (p_werkzeug; null = unverändert). Ein fremdes Werkzeug nur mit bestandenem
-- Sperren-Test in der Soll-Version auf mindestens einem erlaubten Entwickler-PC (kein Admin-PC; Inhaber aktiv, Admin oder Entwickler
-- in irgendeinem Projekt) – gleiche Bedingungen wie ws_werkzeug_setzen (0057), nur nicht an ein Projekt gebunden.
create or replace function public.ws_ki_global_setzen(p_aufgabe text, p_reihe jsonb, p_ab int default 90, p_werkzeug text default null, p_modell text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m text := nullif(btrim(coalesce(p_modell, '')), '');
begin
  if not public.ws_ist_admin() then raise exception 'Die KI-Anbindungen stellt nur der Admin ein'; end if;
  if not public.ws_ki_reihe_ok(p_aufgabe, p_reihe) then raise exception 'Ungültige Zuständigkeit (Bauen nur Claude; Prüfungen mit Claude als Rückfall)'; end if;
  if exists (select 1 from jsonb_array_elements(p_reihe) x where x->>'anbieter' not in ('claude','chatgpt','gemini')
             and not exists (select 1 from public.ws_ki_anbieter a where a.id = x->>'anbieter')) then raise exception 'Unbekannter KI-Anbieter'; end if;
  if p_ab is not null and p_ab not between 50 and 100 then raise exception 'Ungültige Schwelle'; end if;
  if p_werkzeug is not null then
    if p_aufgabe <> 'bauen' then raise exception 'Ein Programmier-Werkzeug gibt es nur für „Programmieren“'; end if;
    if p_werkzeug not in ('claude-code', 'codex', 'gemini-cli', 'opencode') then raise exception 'Unbekanntes Werkzeug'; end if;
    if not public.ws_werkzeug_modell_ok(p_werkzeug, m) then raise exception 'Ungültiges Modell für dieses Werkzeug'; end if;
    if p_werkzeug = 'gemini-cli' then raise exception 'Gemini CLI ist gesperrt (läuft ohne Rückfrage nur in vertrauten Ordnern)'; end if;
    if p_werkzeug <> 'claude-code' and not exists (
      select 1 from public.ws_werkzeug_stand s join public.ws_werkstatt_pcs w on w.id = s.pc_id join public.ws_benutzer b on b.id = w.benutzer_id
       where s.werkzeug = p_werkzeug and not w.admin_pc and s.sperrbar and s.installiert and s.test = 'bestanden'
         and public.ws_werkzeug_erlaubt(p_werkzeug, w.faehigkeiten ->> 'plattform')
         and s.test_version = s.version and s.version = public.ws_werkzeug_soll_version(p_werkzeug) and b.aktiv
         and (b.rolle = 'admin' or exists (select 1 from public.ws_projekt_mitglieder pm where pm.benutzer_id = w.benutzer_id and pm.rolle = 'entwickler')))
    then raise exception 'Speichern geht erst, wenn der Sperren-Test für dieses Werkzeug auf mindestens einem Entwickler-PC bestanden ist'; end if;
  end if;
  insert into public.ws_ki_zustaendigkeit_global (aufgabe, reihe, weitergeben_ab, werkzeug, werkzeug_modell, geaendert, geaendert_von)
  values (p_aufgabe, p_reihe, coalesce(p_ab, 90), coalesce(p_werkzeug, 'claude-code'), case when coalesce(p_werkzeug, 'claude-code') = 'claude-code' then null else m end, now(), auth.uid())
  on conflict (aufgabe) do update set reihe = excluded.reihe, weitergeben_ab = excluded.weitergeben_ab,
    werkzeug = case when p_werkzeug is null then public.ws_ki_zustaendigkeit_global.werkzeug else excluded.werkzeug end,
    werkzeug_modell = case when p_werkzeug is null then public.ws_ki_zustaendigkeit_global.werkzeug_modell else excluded.werkzeug_modell end,
    geaendert = now(), geaendert_von = auth.uid();
  insert into public.ws_protokoll (wer, was, details)
  values (auth.uid(), 'ki_global', jsonb_build_object('aufgabe', p_aufgabe, 'reihe', p_reihe, 'ab', coalesce(p_ab, 90), 'werkzeug', p_werkzeug, 'modell', m));
end $$;
revoke execute on function public.ws_ki_global_setzen(text, jsonb, int, text, text) from public, anon;
grant execute on function public.ws_ki_global_setzen(text, jsonb, int, text, text) to authenticated;

-- Projekt zurück auf „wie global“ (nur „bauen“): entfernt nur die Projektwahl des Programmier-Werkzeugs (nur Admin, Protokoll).
create or replace function public.ws_werkzeug_wie_global(p_projekt text) returns void
language plpgsql security definer set search_path = public as $$
declare alt text;
begin
  if not public.ws_ist_admin() then raise exception 'Das Programmier-Werkzeug stellt nur der Admin ein'; end if;
  if not exists (select 1 from public.ws_projekte where id = p_projekt) then raise exception 'Unbekanntes Projekt'; end if;
  delete from public.ws_ki_zustaendigkeit where projekt_id = p_projekt and aufgabe = 'bauen' returning werkzeug into alt;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'werkzeug_wie_global', jsonb_build_object('projekt', p_projekt, 'vorher', alt));
end $$;
revoke execute on function public.ws_werkzeug_wie_global(text) from public, anon;
grant execute on function public.ws_werkzeug_wie_global(text) to authenticated;

-- ---------- 4. Trigger aus 0056 entfällt ----------
drop trigger if exists ws_projekte_ki_standard on public.ws_projekte;

-- ---------- 5. Auftrags-Schutz: Werkzeug der Projektzeile, sonst global ----------
create or replace function public.ws_auftraege_werkzeug_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
declare soll text;
begin
  if tg_op = 'INSERT' then
    if new.werkzeug is not null or new.wartet_auf is not null then raise exception 'Werkzeug und Warte-Hinweis setzt nur die Werkstatt'; end if;
    return new;
  end if;
  if new.werkzeug is distinct from old.werkzeug then
    if old.werkzeug is not null then raise exception 'Das Werkzeug eines Auftrags ändert sich nicht mehr (der Auftrag macht mit seinem Werkzeug fertig)'; end if;
    soll := coalesce(
      (select z.werkzeug from public.ws_ki_zustaendigkeit z where z.projekt_id = public.ws_projekt_von_gruppe(new.gruppe_id) and z.aufgabe = 'bauen'),
      (select g.werkzeug from public.ws_ki_zustaendigkeit_global g where g.aufgabe = 'bauen'));
    if soll is null then raise exception 'Für dieses Projekt ist kein Programmier-Werkzeug eingestellt'; end if;
    if new.werkzeug is distinct from soll then raise exception 'Das Werkzeug passt nicht zur Einstellung des Projekts'; end if;
    if new.werkzeug <> 'claude-code' and exists (select 1 from public.ws_werkstatt_pcs w where w.id = new.werkstatt_pc and w.admin_pc) then
      raise exception 'Der Admin-PC programmiert nie mit fremden Werkzeugen'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.ws_auftraege_werkzeug_schutz() from public, anon, authenticated;
drop trigger if exists ws_auftraege_werkzeug on public.ws_auftraege;
create trigger ws_auftraege_werkzeug before insert or update on public.ws_auftraege for each row execute function public.ws_auftraege_werkzeug_schutz();

-- ---------- 6. Eigenen Anbieter löschen: auch aus den globalen Zuständigkeiten ----------
create or replace function public.ws_ki_anbieter_loeschen(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'KI-Anbieter löscht nur der Admin'; end if;
  delete from public.ws_ki_kopplung where anbieter = p_id;
  update public.ws_ki_zustaendigkeit set reihe = coalesce((select jsonb_agg(x) from jsonb_array_elements(reihe) x where x->>'anbieter' <> p_id), '[{"anbieter":"claude"}]'::jsonb)
   where exists (select 1 from jsonb_array_elements(reihe) x where x->>'anbieter' = p_id);
  update public.ws_ki_zustaendigkeit_global set reihe = coalesce((select jsonb_agg(x) from jsonb_array_elements(reihe) x where x->>'anbieter' <> p_id), '[{"anbieter":"claude"}]'::jsonb),
         geaendert = now(), geaendert_von = auth.uid()
   where exists (select 1 from jsonb_array_elements(reihe) x where x->>'anbieter' = p_id);
  delete from public.ws_ki_anbieter where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'ki_anbieter_geloescht', jsonb_build_object('id', p_id));
end $$;
revoke execute on function public.ws_ki_anbieter_loeschen(text) from public, anon;
grant execute on function public.ws_ki_anbieter_loeschen(text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.ws_ki_zustaendigkeit_global; exception when duplicate_object then null; end;
end $$;

-- ========== Teil 2: Lange Fragen (Gerhard 03.11.2026 08:11: „Auf Fragen will ich so viel Text schreiben können, wie ich will.“) ==========
-- Eine gemeinsame, sehr großzügige Obergrenze für alles, was Gerhard als Frage oder Auftrag schreibt: 200.000 Zeichen (ws_text_max – an EINER
-- Stelle; gleicher Wert in web/src/textGrenze.js und desktop/dienst/lib/ki.mjs). Ganz ohne Grenze geht es nicht (Datenbank, Realtime, KI-Kontext).
-- Angehoben: ws_claude_chat.text, ws_design_chat.text (Fragen; Antworten der Werkstatt bleiben über ihre Funktionen bei 8000), ws_aufgaben.beschreibung,
-- ws_aufgabe_sendungen.text (+ Platz für den Kopf), Design-/Kachel-Auftrag, Umdesign (Beschreibung und Auftragstext), Grunddesign senden,
-- „Weiterarbeiten“-Zusatz. Nicht mehr still gekürzt: Aufgabe/Punkt als Auftrag (vorher left(…, 8000)). ws_nachrichten bekommt erstmals eine Grenze
-- (Text + Kopf/Werte, NOT VALID: alte Zeilen werden nicht geprüft). Wissen (ws_wissen, 2000) ist keine Frage und bleibt.
create or replace function public.ws_text_max() returns int
language sql immutable set search_path = public as $$
  select 200000
$$;
revoke execute on function public.ws_text_max() from public, anon;
grant execute on function public.ws_text_max() to authenticated;

alter table public.ws_claude_chat drop constraint if exists ws_claude_chat_text_check;
alter table public.ws_claude_chat add constraint ws_claude_chat_text_check check (char_length(text) between 1 and public.ws_text_max());
alter table public.ws_design_chat drop constraint if exists ws_design_chat_text_check;
alter table public.ws_design_chat add constraint ws_design_chat_text_check check (char_length(text) between 1 and public.ws_text_max());
alter table public.ws_aufgaben drop constraint if exists ws_aufgaben_beschreibung_check;
alter table public.ws_aufgaben add constraint ws_aufgaben_beschreibung_check check (char_length(beschreibung) <= public.ws_text_max() and public.ws_aufgabe_text_ok(beschreibung, true));
alter table public.ws_aufgabe_sendungen drop constraint if exists ws_aufgabe_sendungen_text_check;
alter table public.ws_aufgabe_sendungen add constraint ws_aufgabe_sendungen_text_check check (char_length(text) between 1 and 2 * public.ws_text_max() + 200);
alter table public.ws_nachrichten drop constraint if exists ws_nachrichten_text_laenge;
alter table public.ws_nachrichten add constraint ws_nachrichten_text_laenge check (char_length(text) <= 2 * public.ws_text_max() + 50000) not valid;

create or replace function public.ws_umdesign_werte_ok(p_art text, w jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; e jsonb;
begin
  if w is null or jsonb_typeof(w) <> 'object' or pg_column_size(w) > 12000 + 4 * public.ws_text_max() then return false; end if;
  for k, v in select * from jsonb_each(w) loop
    if k = 'beschreibung' then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > public.ws_text_max() then return false; end if;
    elsif k = 'neu' and p_art = 'symbol' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[A-Z][A-Za-z0-9]{1,40}$' then return false; end if;
    elsif k = 'eigen' and p_art = 'symbol' then
      -- eigenes Symbol im Lucide-Stil: 24 × 24, nur Striche (Pfade, Kreise), Farbe = Textfarbe
      if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) x where x not in ('pfade','kreise','name')) then return false; end if;
      if v ? 'name' and (jsonb_typeof(v -> 'name') <> 'string' or (v ->> 'name') !~ '^[A-Z][A-Za-z0-9]{1,40}$') then return false; end if;
      if jsonb_typeof(coalesce(v -> 'pfade', '[]')) <> 'array' or jsonb_array_length(coalesce(v -> 'pfade', '[]')) > 20 then return false; end if;
      for e in select * from jsonb_array_elements(coalesce(v -> 'pfade', '[]')) loop
        if jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 1200 or (e #>> '{}') !~ '^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$' then return false; end if;
      end loop;
      if jsonb_typeof(coalesce(v -> 'kreise', '[]')) <> 'array' or jsonb_array_length(coalesce(v -> 'kreise', '[]')) > 10 then return false; end if;
      for e in select * from jsonb_array_elements(coalesce(v -> 'kreise', '[]')) loop
        if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) x where x not in ('cx','cy','r'))
           or not public.ws_marke_zahl_ok(e -> 'cx', 0, 24) or not public.ws_marke_zahl_ok(e -> 'cy', 0, 24) or not public.ws_marke_zahl_ok(e -> 'r', 0, 12) then return false; end if;
      end loop;
      if jsonb_array_length(coalesce(v -> 'pfade', '[]')) + jsonb_array_length(coalesce(v -> 'kreise', '[]')) = 0 then return false; end if;
    elsif k = 'einstellungen' and p_art = 'baustein' then
      if jsonb_typeof(v) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_each(v) x where not (
           (x.key in ('hintergrund','rand','text') and jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') ~ '^#[0-9a-fA-F]{6}$')
        or (x.key = 'ecken' and (x.value #>> '{}') in ('rund','eckig','pille') and jsonb_typeof(x.value) = 'string')
        or (x.key = 'schrift' and (x.value #>> '{}') in ('normal','fett') and jsonb_typeof(x.value) = 'string')
        or (x.key = 'symbol' and jsonb_typeof(x.value) = 'string' and ((x.value #>> '{}') ~ '^[A-Z][A-Za-z0-9]{1,40}$' or (x.value #>> '{}') = 'keins'))
        or (x.key = 'variante' and jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') ~ '^[a-z0-9-]{1,30}$'))) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.ws_design_auftrag(p_projekt text, p_art text, p_titel text, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare g text; a bigint; t text; x text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if p_art is null or p_art not in ('baustein','kachel') then raise exception 'Unbekannte Auftragsart'; end if;
  if not public.ws_darf_design(p_projekt) then raise exception 'Keine Berechtigung für das Design dieses Projekts'; end if;
  -- Mengengrenze (Sicherheitsprüfung Chat zur Kachel, 0041): höchstens 10 Design-Aufträge je Person und Stunde
  -- gleichzeitige Aufrufe derselben Person nacheinander zählen (sonst ließe sich die Grenze mit parallelen Aufrufen überlaufen)
  perform pg_advisory_xact_lock(hashtext('design_auftrag:' || auth.uid()::text));
  if (select count(*) from public.ws_protokoll where wer = auth.uid() and was = 'design_auftrag' and wann > now() - interval '1 hour') >= 10 then
    raise exception 'Höchstens 10 Design-Aufträge je Stunde – bitte später noch einmal'; end if;
  t := btrim(coalesce(p_titel, '')); x := btrim(coalesce(p_text, ''));
  if char_length(t) not between 2 and 80 then raise exception 'Name fehlt oder ist zu lang (höchstens 80 Zeichen)'; end if;
  if char_length(x) not between 10 and public.ws_text_max() then raise exception 'Beschreibung fehlt oder ist zu lang (10 bis 200.000 Zeichen)'; end if;
  -- Steuerzeichen (außer Zeilenumbruch und Tabulator) haben im Titel und Text nichts verloren
  -- dazu C1-Steuerzeichen, Richtungs- und unsichtbare Zeichen (Verschleierung, Prüfung 2026-10-24)
  if t ~ '[[:cntrl:]\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]'
     or x ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]' then raise exception 'Ungültige Zeichen'; end if;
  select design_gruppe_id into g from public.ws_projekte where id = p_projekt and not coalesce(archiviert, false);
  if not found then raise exception 'Projekt nicht gefunden oder archiviert'; end if;
  if g is null then raise exception 'Der App-Designer ist für dieses Projekt noch nicht eingerichtet'; end if;
  t := left(case p_art when 'baustein' then 'Neuer Baustein: ' else 'Neue Kachel für den Seiten-Designer: ' end || t, 80);
  insert into public.ws_auftraege (gruppe_id, titel, art, erstellt_von) values (g, t, 'neu', auth.uid()) returning id into a;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal) values (a, auth.uid(), 'text', x, 'codeschmiede');
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'design_auftrag', jsonb_build_object('projekt', p_projekt, 'art', p_art, 'auftrag', a));
  return a;
end $$;

create or replace function public.ws_umdesign_senden(p_id bigint, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare u public.ws_umdesign; g text; neu bigint;
begin
  select * into u from public.ws_umdesign where id = p_id for update;
  if u.id is null or u.stand <> 'entwurf' then raise exception 'Entwurf nicht gefunden oder schon gesendet'; end if;
  if not public.ws_darf_design(u.projekt_id) then raise exception 'Umdesignen dürfen Admin und Entwickler des Projekts'; end if;
  select design_gruppe_id into g from public.ws_projekte where id = u.projekt_id;
  if g is null then raise exception 'Das Projekt hat noch keine Design-Gruppe'; end if;
  if u.werte - 'beschreibung' = '{}'::jsonb then raise exception 'Noch keine Änderung gewählt'; end if;
  if p_text is null or char_length(p_text) not between 10 and public.ws_text_max() then raise exception 'Auftragstext fehlt oder ist zu lang (höchstens 200.000 Zeichen)'; end if;
  insert into public.ws_auftraege (gruppe_id, titel, art, erstellt_von)
    values (g, left(case u.art when 'symbol' then 'Symbol ' else 'Grundbaustein ' end || u.ziel || ' umdesignen (' || cardinality(u.stellen) || ' Stellen)', 80), 'aendern', auth.uid())
    returning id into neu;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal)
    values (neu, auth.uid(), 'text', p_text || chr(10) || chr(10) || 'Werte (JSON, geprüft): ' || (u.werte - 'beschreibung')::text || chr(10) || 'Stellen (' || cardinality(u.stellen) || ' von ' || u.alle_stellen || '):' || chr(10) || array_to_string(u.stellen, chr(10)), 'codeschmiede');
  update public.ws_umdesign set stand = 'gesendet', auftrag_id = neu, geaendert = now() where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'umdesign_gesendet', jsonb_build_object('id', p_id, 'auftrag', neu));
  return neu;
end $$;

create or replace function public.ws_design_senden(p_entwurf bigint, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare e public.ws_design_entwuerfe; g text; a bigint;
begin
  select * into e from public.ws_design_entwuerfe where id = p_entwurf for update;
  if e.id is null then raise exception 'Entwurf nicht gefunden'; end if;
  if not public.ws_darf_design(e.projekt_id) then raise exception 'Keine Berechtigung für das Design dieses Projekts'; end if;
  if e.erstellt_von <> auth.uid() and not public.ws_ist_admin() then raise exception 'Nur der eigene Entwurf kann gesendet werden'; end if;
  if e.stand <> 'entwurf' then raise exception 'Entwurf wurde schon gesendet'; end if;
  if p_text is null or char_length(p_text) not between 10 and public.ws_text_max() then raise exception 'Beschreibung fehlt oder ist zu lang (höchstens 200.000 Zeichen)'; end if;
  select design_gruppe_id into g from public.ws_projekte where id = e.projekt_id;
  insert into public.ws_auftraege (gruppe_id, titel, art, erstellt_von)
    values (g, left('Grunddesign: ' || e.name, 80), 'aendern', auth.uid()) returning id into a;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, daten)
    values (a, auth.uid(), 'text', p_text, jsonb_build_object('design_entwurf', e.id, 'version', e.version, 'werte', e.werte));
  update public.ws_design_entwuerfe set stand = 'gesendet', auftrag_id = a, geaendert = now() where id = p_entwurf;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'design_senden', jsonb_build_object('entwurf', e.id, 'auftrag', a));
  return a;
end $$;

create or replace function public.ws_aufgabe_als_auftrag(p_sendung bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare s public.ws_aufgabe_sendungen; g text; f text; n bigint; ids jsonb;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into s from public.ws_aufgabe_sendungen where id = p_sendung for update;
  if s.id is null or not public.ws_sieht_projekt(s.projekt_id) then raise exception 'Sendung nicht gefunden'; end if;
  if s.auftrag_id is not null then raise exception 'Daraus ist schon Auftrag #% geworden', s.auftrag_id; end if;
  if s.zurueckgezogen is not null then raise exception 'Diese Sendung wurde zurückgezogen'; end if;
  g := s.gruppe_id; f := s.feature_id;
  if f is not null then   -- Feature inzwischen verschoben: Auftrag geht an seine jetzige Gruppe (Verlauf bleibt beim Feature)
    select x.gruppe_id into g from public.ws_features x where x.id = f and not x.ausgebaut;
    if g is null then raise exception 'Das Feature gibt es nicht mehr'; end if;
  end if;
  if public.ws_projekt_von_gruppe(g) is distinct from s.projekt_id then raise exception 'Ziel gehört nicht mehr zu diesem Projekt'; end if;
  if exists (select 1 from public.ws_projekte where id = s.projekt_id and coalesce(archiviert, false)) then raise exception 'Das Projekt ist archiviert'; end if;
  if not public.ws_darf(public.ws_bereich_von_gruppe(g), 'auftraege') then raise exception 'Für diesen Bereich hast du kein Recht, Aufträge zu geben'; end if;
  -- nur Anhänge, die es noch gibt
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb) into ids from public.ws_aufgabe_anhaenge x
    where x.aufgabe_id = s.aufgabe_id and x.projekt_id = s.projekt_id and x.fertig and to_jsonb(x.id) <@ s.anhaenge;
  insert into public.ws_auftraege (gruppe_id, feature_id, titel, art, erstellt_von)
    values (g, f, left('Aufgabe: ' || s.titel, 80), case when public.ws_rolle_fuer_gruppe(g) = 'texter' then 'text' else 'aendern' end, auth.uid())
    returning id into n;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal, daten)
    -- Ganzer Text (0.18.0: nicht mehr gekürzt). Klartext ohne klickbare Markdown-Links („](“ entschärft); die Oberfläche zeigt diese Nachricht ohnehin ohne Markdown (Prüfung N3)
    values (n, auth.uid(), 'text', replace('Aufgabe: ' || s.titel || E'\n' || s.text, '](', '] ('), case when f is null then 'gruppe' else 'codeschmiede' end,
            jsonb_build_object('aufgabe', jsonb_build_object('id', s.aufgabe_id, 'sendung', s.id, 'anhaenge', ids, 'links', s.links)));
  update public.ws_aufgabe_sendungen set auftrag_id = n, als_auftrag_von = auth.uid(), als_auftrag_am = now() where id = s.id;
  update public.ws_aufgaben set status = case when status = 'offen' then 'arbeit' else status end where id = s.aufgabe_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'aufgabe_auftrag', jsonb_build_object('sendung', s.id, 'aufgabe', s.aufgabe_id, 'auftrag', n));
  return n;
end $$;

create or replace function public.ws_punkt_weiterarbeiten(p_aufgabe bigint, p_text text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare a public.ws_aufgaben; g text; s bigint; n bigint; t text; zusatz text := nullif(btrim(coalesce(p_text, '')), ''); ids jsonb; laeuft bigint;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from public.ws_aufgaben where id = p_aufgabe for update;
  if a.id is null or not public.ws_sieht_projekt(a.projekt_id) then raise exception 'Punkt nicht gefunden'; end if;
  if a.feature_id is null then raise exception 'Dieser Punkt gehört zu keinem Feature'; end if;
  if a.status = 'erledigt' then raise exception 'Dieser Punkt ist erledigt'; end if;
  select f.gruppe_id into g from public.ws_features f where f.id = a.feature_id and not f.ausgebaut;
  if g is null or public.ws_projekt_von_gruppe(g) is distinct from a.projekt_id then raise exception 'Das Feature gehört nicht zu diesem Projekt'; end if;
  if public.ws_ist_konzept_gruppe(g) then raise exception 'In der Gruppe „Konzept“ wird nicht gebaut'; end if;
  if exists (select 1 from public.ws_projekte where id = a.projekt_id and coalesce(archiviert, false)) then raise exception 'Das Projekt ist archiviert'; end if;
  if not public.ws_darf(public.ws_bereich_von_gruppe(g), 'auftraege') then raise exception 'Für diesen Bereich hast du kein Recht, Aufträge zu geben'; end if;
  if zusatz is not null and (char_length(zusatz) > public.ws_text_max() or not public.ws_aufgabe_text_ok(zusatz, true)) then raise exception 'Text zu lang oder mit ungültigen Zeichen'; end if;
  select x.id into laeuft from public.ws_aufgabe_sendungen s2 join public.ws_auftraege x on x.id = s2.auftrag_id
   where s2.aufgabe_id = a.id and x.stand not in ('wissen','erledigt','abgebrochen') order by x.id desc limit 1;
  if laeuft is not null then raise exception 'Zu diesem Punkt läuft schon Auftrag #%', laeuft; end if;
  if (select count(*) from public.ws_aufgabe_sendungen x where x.von = auth.uid() and x.erstellt > now() - interval '1 day') >= 100 then
    raise exception 'Heute schon 100 Aufgaben bzw. Punkte als Auftrag gegeben – morgen wieder'; end if;
  t := left('Offener Punkt: ' || a.titel
       || case when btrim(a.beschreibung) <> '' then E'\n\n' || btrim(a.beschreibung) else '' end
       || case when zusatz is not null then E'\n\nDazu: ' || zusatz else '' end, 2 * public.ws_text_max() + 200);
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb) into ids from public.ws_aufgabe_anhaenge x where x.aufgabe_id = a.id and x.fertig;
  insert into public.ws_aufgabe_sendungen (aufgabe_id, projekt_id, gruppe_id, feature_id, titel, text, links, anhaenge, von)
    values (a.id, a.projekt_id, g, a.feature_id, a.titel, t, a.links, ids, auth.uid()) returning id into s;
  insert into public.ws_auftraege (gruppe_id, feature_id, titel, art, erstellt_von)
    values (g, a.feature_id, left('Punkt: ' || a.titel, 80), case when public.ws_rolle_fuer_gruppe(g) = 'texter' then 'text' else 'aendern' end, auth.uid())
    returning id into n;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal, daten)
    values (n, auth.uid(), 'text', replace(t, '](', '] ('), 'codeschmiede',
            jsonb_build_object('aufgabe', jsonb_build_object('id', a.id, 'sendung', s, 'anhaenge', ids, 'links', a.links)));
  update public.ws_aufgabe_sendungen set auftrag_id = n, als_auftrag_von = auth.uid(), als_auftrag_am = now() where id = s;
  update public.ws_aufgaben set status = case when status = 'offen' then 'arbeit' else status end where id = a.id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'punkt_weiterarbeiten', jsonb_build_object('aufgabe', a.id, 'sendung', s, 'auftrag', n, 'feature', a.feature_id));
  return n;
end $$;

revoke execute on function public.ws_umdesign_werte_ok(text, jsonb) from public, anon;
grant execute on function public.ws_umdesign_werte_ok(text, jsonb) to authenticated;
revoke execute on function public.ws_design_auftrag(text, text, text, text), public.ws_umdesign_senden(bigint, text), public.ws_design_senden(bigint, text),
  public.ws_aufgabe_als_auftrag(bigint), public.ws_punkt_weiterarbeiten(bigint, text) from public, anon;
grant execute on function public.ws_design_auftrag(text, text, text, text), public.ws_umdesign_senden(bigint, text), public.ws_design_senden(bigint, text),
  public.ws_aufgabe_als_auftrag(bigint), public.ws_punkt_weiterarbeiten(bigint, text) to authenticated;

commit;
