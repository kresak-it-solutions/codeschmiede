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

commit;
