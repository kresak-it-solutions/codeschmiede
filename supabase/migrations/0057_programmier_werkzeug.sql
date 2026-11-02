-- Codeschmiede · Datenbank 0057: Programmier-Werkzeug je Projekt (0.14.0, Entwurf freigegeben von Gerhard 02.11.2026) – Claude
-- Je Projekt programmiert genau ein Werkzeug: Claude Code (Standard), OpenAI Codex CLI, Gemini CLI oder OpenCode. Die Wahl steht an der
-- Zuständigkeit „bauen“ (ws_ki_zustaendigkeit.werkzeug/werkzeug_modell), speichern darf nur der Admin – ein fremdes Werkzeug nur mit bestandenem
-- Sperren-Test auf mindestens einem Entwickler-PC. Die Werkstatt jedes PCs meldet je Werkzeug installiert / angemeldet / Sperren-Test (nur
-- Zustände, keine Inhalte, keine Zugangsdaten). Das Werkzeug wird beim Start am Auftrag gespeichert und ändert sich danach nicht mehr.
-- Bestehende Projekte bleiben bei Claude Code. Mehrfach ausführbar. Konzept: docs/KONZEPT-WERKZEUGE.md, Test: supabase/tests/t46_programmier_werkzeug.sql.

begin;

-- ---------- 1. Wahl je Projekt ----------
alter table public.ws_ki_zustaendigkeit add column if not exists werkzeug text not null default 'claude-code';
alter table public.ws_ki_zustaendigkeit add column if not exists werkzeug_modell text;

create or replace function public.ws_werkzeug_modell_ok(p_werkzeug text, p_modell text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when p_modell is null then true
    when p_werkzeug = 'opencode' then p_modell ~ '^[a-z0-9][a-z0-9-]{0,39}/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
    when p_werkzeug in ('codex', 'gemini-cli') then p_modell ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$'
    else false end                                         -- Claude Code wählt das Modell nach Aufwand (kein Modell hier)
$$;
revoke execute on function public.ws_werkzeug_modell_ok(text, text) from public, anon;

alter table public.ws_ki_zustaendigkeit drop constraint if exists ws_ki_zust_werkzeug_check;
alter table public.ws_ki_zustaendigkeit add constraint ws_ki_zust_werkzeug_check check (
  werkzeug in ('claude-code', 'codex', 'gemini-cli', 'opencode')
  and (aufgabe = 'bauen' or (werkzeug = 'claude-code' and werkzeug_modell is null))
  and public.ws_werkzeug_modell_ok(werkzeug, werkzeug_modell));

-- ---------- 2. Stand je PC und Werkzeug ----------
create or replace function public.ws_werkzeug_punkte_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 12 and not exists (
    select 1 from jsonb_array_elements(p) e
     where jsonb_typeof(e) <> 'object'
        or exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'ok'))
        or coalesce(e ->> 'id', '') not in ('erlaubt', 'regeln', 'setup', 'nachbar', 'projektregeln', 'git', 'link', 'daten')
        or jsonb_typeof(e -> 'ok') is distinct from 'boolean'))
$$;
revoke execute on function public.ws_werkzeug_punkte_ok(jsonb) from public, anon;

create table if not exists public.ws_werkzeug_stand (
  pc_id uuid not null references public.ws_werkstatt_pcs(id) on delete cascade,
  werkzeug text not null check (werkzeug in ('codex', 'gemini-cli', 'opencode')),
  installiert boolean not null default false,
  angemeldet boolean not null default false,
  version text check (version is null or version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  soll_version text check (soll_version is null or soll_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  sperrbar boolean not null default false,
  sperre_grund text check (sperre_grund is null or char_length(sperre_grund) <= 200),
  test text check (test is null or test in ('bestanden', 'durchgefallen', 'laeuft')),
  test_version text check (test_version is null or test_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$'),
  test_zeit timestamptz,
  test_punkte jsonb check (public.ws_werkzeug_punkte_ok(test_punkte)),
  hinweis text check (hinweis is null or char_length(hinweis) <= 300),
  aktion text check (aktion is null or aktion in ('installieren', 'anmelden', 'test', 'pruefen')),
  aktion_zeit timestamptz,
  geaendert timestamptz not null default now(),
  primary key (pc_id, werkzeug)
);
revoke all on public.ws_werkzeug_stand from public, anon, authenticated;
grant select on public.ws_werkzeug_stand to authenticated;
alter table public.ws_werkzeug_stand enable row level security;
drop policy if exists ws_werkzeug_stand_lesen on public.ws_werkzeug_stand;
create policy ws_werkzeug_stand_lesen on public.ws_werkzeug_stand for select to authenticated
  using (exists (select 1 from public.ws_werkstatt_pcs w where w.id = pc_id and (w.benutzer_id = auth.uid() or public.ws_ist_admin())));

-- Meldung der eigenen Werkstatt. Hinweise ohne Pfade (kein „\“ und kein „/Users/“, „/home/“, „/Volumes/“).
create or replace function public.ws_werkzeug_melden(p_pc uuid, p_werkzeug text, p_werte jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare w public.ws_werkstatt_pcs; v jsonb := coalesce(p_werte, '{}'::jsonb); b text; hw text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into w from public.ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid();
  if w.id is null then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if p_werkzeug not in ('codex', 'gemini-cli', 'opencode') then raise exception 'Unbekanntes Werkzeug'; end if;
  if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) k where k not in
     ('installiert', 'angemeldet', 'version', 'soll_version', 'sperrbar', 'sperre_grund', 'test', 'test_version', 'test_zeit', 'test_punkte', 'hinweis', 'aktion_erledigt')) then
    raise exception 'Ungültige Meldung'; end if;
  foreach b in array array['installiert', 'angemeldet', 'sperrbar', 'aktion_erledigt'] loop
    if v ? b and jsonb_typeof(v -> b) <> 'boolean' then raise exception 'Ungültige Meldung (%)', b; end if;
  end loop;
  hw := nullif(left(v ->> 'hinweis', 300), '');
  if concat(hw, v ->> 'sperre_grund') ~ '(\\|/Users/|/home/|/Volumes/|[A-Za-z]:/)' then raise exception 'Hinweis ohne Pfade'; end if;
  -- Der Admin-PC programmiert nie mit fremden Werkzeugen (kein Projekt-Code auf dem Admin-PC)
  if w.admin_pc and (coalesce((v ->> 'installiert')::boolean, false) or coalesce((v ->> 'sperrbar')::boolean, false) or v ->> 'test' = 'bestanden') then
    raise exception 'Der Admin-PC programmiert nie mit fremden Werkzeugen'; end if;
  -- „bestanden“ nur für genau die installierte Version und nur, wenn jeder Punkt in Ordnung ist
  if v ->> 'test' = 'bestanden' and (v ->> 'test_version' is null or v ->> 'test_version' is distinct from v ->> 'version'
     or v -> 'test_punkte' is null or jsonb_typeof(v -> 'test_punkte') <> 'array' or jsonb_array_length(v -> 'test_punkte') <> 8
     or exists (select 1 from jsonb_array_elements(v -> 'test_punkte') e where jsonb_typeof(e) <> 'object' or e -> 'ok' is distinct from 'true'::jsonb)) then
    raise exception 'Sperren-Test „bestanden“ passt nicht zur Version bzw. zu den Punkten'; end if;
  insert into public.ws_werkzeug_stand as s (pc_id, werkzeug, installiert, angemeldet, version, soll_version, sperrbar, sperre_grund, test, test_version, test_zeit, test_punkte, hinweis, geaendert)
  values (p_pc, p_werkzeug, coalesce((v ->> 'installiert')::boolean, false), coalesce((v ->> 'angemeldet')::boolean, false), v ->> 'version', v ->> 'soll_version',
          coalesce((v ->> 'sperrbar')::boolean, false), nullif(left(v ->> 'sperre_grund', 200), ''), v ->> 'test', v ->> 'test_version',
          (v ->> 'test_zeit')::timestamptz, case when jsonb_typeof(v -> 'test_punkte') = 'array' then v -> 'test_punkte' end, hw, now())
  on conflict (pc_id, werkzeug) do update set installiert = excluded.installiert, angemeldet = excluded.angemeldet, version = excluded.version,
    soll_version = excluded.soll_version, sperrbar = excluded.sperrbar, sperre_grund = excluded.sperre_grund, test = excluded.test,
    test_version = excluded.test_version, test_zeit = excluded.test_zeit, test_punkte = excluded.test_punkte,
    hinweis = case when v ? 'hinweis' then excluded.hinweis else s.hinweis end,
    aktion = case when coalesce((v ->> 'aktion_erledigt')::boolean, false) then null else s.aktion end,
    geaendert = now();
end $$;
revoke execute on function public.ws_werkzeug_melden(uuid, text, jsonb) from public, anon;
grant execute on function public.ws_werkzeug_melden(uuid, text, jsonb) to authenticated;

-- Knopf in der Oberfläche: nur die Person, der der PC gehört. Installieren, Anmelden und Test nie auf dem Admin-PC.
create or replace function public.ws_werkzeug_aktion(p_pc uuid, p_werkzeug text, p_aktion text) returns void
language plpgsql security definer set search_path = public as $$
declare w public.ws_werkstatt_pcs;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into w from public.ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid();
  if w.id is null then raise exception 'Nur auf dem eigenen Werkstatt-PC'; end if;
  if p_werkzeug not in ('codex', 'gemini-cli', 'opencode') then raise exception 'Unbekanntes Werkzeug'; end if;
  if p_aktion not in ('installieren', 'anmelden', 'test', 'pruefen') then raise exception 'Unbekannte Aktion'; end if;
  if w.admin_pc and p_aktion <> 'pruefen' then raise exception 'Auf dem Admin-PC wird kein fremdes Werkzeug installiert oder gestartet'; end if;
  if exists (select 1 from public.ws_werkzeug_stand where pc_id = p_pc and werkzeug = p_werkzeug and aktion is not null and aktion_zeit > now() - interval '20 minutes')
  then raise exception 'Auf diesem PC läuft für das Werkzeug schon eine Aktion'; end if;
  insert into public.ws_werkzeug_stand (pc_id, werkzeug, aktion, aktion_zeit, hinweis, geaendert)
  values (p_pc, p_werkzeug, p_aktion, now(), 'Wartet auf deine Werkstatt (das Codeschmiede-Programm muss laufen) …', now())
  on conflict (pc_id, werkzeug) do update set aktion = excluded.aktion, aktion_zeit = now(), hinweis = excluded.hinweis, geaendert = now();
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'werkzeug_aktion', jsonb_build_object('pc', p_pc, 'werkzeug', p_werkzeug, 'aktion', p_aktion));
end $$;
revoke execute on function public.ws_werkzeug_aktion(uuid, text, text) from public, anon;
grant execute on function public.ws_werkzeug_aktion(uuid, text, text) to authenticated;

-- ---------- 3. Wahl speichern (nur Admin) ----------
-- Fremdes Werkzeug nur mit bestandenem Sperren-Test in genau der Soll-Version auf mindestens einem Entwickler-PC: kein Admin-PC, Inhaber ist
-- Admin oder Entwickler in diesem Projekt.
create or replace function public.ws_werkzeug_setzen(p_projekt text, p_werkzeug text, p_modell text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m text := nullif(btrim(coalesce(p_modell, '')), '');
begin
  if not public.ws_ist_admin() then raise exception 'Das Programmier-Werkzeug stellt nur der Admin ein'; end if;
  if not exists (select 1 from public.ws_projekte where id = p_projekt) then raise exception 'Unbekanntes Projekt'; end if;
  if p_werkzeug is null or p_werkzeug not in ('claude-code', 'codex', 'gemini-cli', 'opencode') then raise exception 'Unbekanntes Werkzeug'; end if;
  if not public.ws_werkzeug_modell_ok(p_werkzeug, m) then raise exception 'Ungültiges Modell für dieses Werkzeug'; end if;
  if p_werkzeug <> 'claude-code' and not exists (
    select 1 from public.ws_werkzeug_stand s join public.ws_werkstatt_pcs w on w.id = s.pc_id join public.ws_benutzer b on b.id = w.benutzer_id
     where s.werkzeug = p_werkzeug and not w.admin_pc and s.sperrbar and s.installiert and s.test = 'bestanden'
       and s.test_version = s.version and s.version = s.soll_version and b.aktiv
       and (b.rolle = 'admin' or exists (select 1 from public.ws_projekt_mitglieder pm where pm.projekt_id = p_projekt and pm.benutzer_id = w.benutzer_id and pm.rolle = 'entwickler')))
  then raise exception 'Speichern geht erst, wenn der Sperren-Test für dieses Werkzeug auf mindestens einem Entwickler-PC bestanden ist'; end if;
  insert into public.ws_ki_zustaendigkeit (projekt_id, aufgabe, reihe, weitergeben_ab, werkzeug, werkzeug_modell, geaendert, geaendert_von)
  values (p_projekt, 'bauen', '[{"anbieter":"claude"}]'::jsonb, 90, p_werkzeug, case when p_werkzeug = 'claude-code' then null else m end, now(), auth.uid())
  on conflict (projekt_id, aufgabe) do update set werkzeug = excluded.werkzeug, werkzeug_modell = excluded.werkzeug_modell, geaendert = now(), geaendert_von = auth.uid();
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'werkzeug_gewaehlt', jsonb_build_object('projekt', p_projekt, 'werkzeug', p_werkzeug, 'modell', m));
end $$;
revoke execute on function public.ws_werkzeug_setzen(text, text, text) from public, anon;
grant execute on function public.ws_werkzeug_setzen(text, text, text) to authenticated;

-- ---------- 4. Werkzeug am Auftrag ----------
alter table public.ws_auftraege add column if not exists werkzeug text;
alter table public.ws_auftraege add column if not exists wartet_auf text;
alter table public.ws_auftraege drop constraint if exists ws_auftraege_werkzeug_check;
alter table public.ws_auftraege add constraint ws_auftraege_werkzeug_check check (werkzeug is null or werkzeug in ('claude-code', 'codex', 'gemini-cli', 'opencode'));
alter table public.ws_auftraege drop constraint if exists ws_auftraege_wartet_auf_check;
alter table public.ws_auftraege add constraint ws_auftraege_wartet_auf_check check (wartet_auf is null or char_length(wartet_auf) <= 200);

-- Gesetzt wird das Werkzeug nur einmal (beim Start durch die Werkstatt) und nur so, wie das Projekt es gerade einstellt; danach nie mehr geändert.
create or replace function public.ws_auftraege_werkzeug_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.werkzeug is not null or new.wartet_auf is not null then raise exception 'Werkzeug und Warte-Hinweis setzt nur die Werkstatt'; end if;
    return new;
  end if;
  if new.werkzeug is distinct from old.werkzeug then
    if old.werkzeug is not null then raise exception 'Das Werkzeug eines Auftrags ändert sich nicht mehr (der Auftrag macht mit seinem Werkzeug fertig)'; end if;
    if new.werkzeug is distinct from coalesce((select z.werkzeug from public.ws_ki_zustaendigkeit z
          where z.projekt_id = public.ws_projekt_von_gruppe(new.gruppe_id) and z.aufgabe = 'bauen'), 'claude-code') then
      raise exception 'Das Werkzeug passt nicht zur Einstellung des Projekts'; end if;
    if new.werkzeug <> 'claude-code' and exists (select 1 from public.ws_werkstatt_pcs w where w.id = new.werkstatt_pc and w.admin_pc) then
      raise exception 'Der Admin-PC programmiert nie mit fremden Werkzeugen'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.ws_auftraege_werkzeug_schutz() from public, anon, authenticated;
drop trigger if exists ws_auftraege_werkzeug on public.ws_auftraege;
create trigger ws_auftraege_werkzeug before insert or update on public.ws_auftraege for each row execute function public.ws_auftraege_werkzeug_schutz();

do $$ begin
  begin alter publication supabase_realtime add table public.ws_werkzeug_stand; exception when duplicate_object then null; end;
end $$;

commit;
