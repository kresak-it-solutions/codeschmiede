-- Codeschmiede 0.20.0 · Updates & Freigabe + Abgleich mit main (Anweisung Gerhard 2026-11-07 21:07 „Die Codeschmiede muss jetzt wieder auf
-- aktuellen Stand gebracht werden … Auch das mit den Updates muss Codeschmiede übernehmen“; Antworten 21:12: „Gleicher Weg in beiden“,
-- „Automatisch nachziehen“, alte Entwürfe verwerfen; Entwurf freigegeben 21:16 „passt so“). Konzept: docs/KONZEPT-UPDATES-ABGLEICH.md
--
-- 1 Updates & Freigabe: Hat ein Projekt den Ablauf .github/workflows/freigabe.yml (Trainer to go), schaltet die Codeschmiede NICHT mehr selbst
--   den Zweig „live“, sondern startet genau diesen Ablauf – wie die Plattform der App. Neue Arten „planen“ (heute 22:00) und „zuruecknehmen“;
--   „zurueck“ auch auf eine Version per Name (version/…). Den Stand (wartende Pull Requests, geplant, Verlauf, „Was ist neu?“) meldet die
--   Werkstatt des Admins in ws_freigabe_stand. Geht live außerhalb der Codeschmiede (Plattform, Fehlerbehebung), entsteht eine Version „extern“.
-- 2 Abgleich mit main: Projekte mit Aufbau-Datei (aufbau_datei, z. B. src/lib/appStruktur.js) – die Werkstatt des Admins liest nach jedem neuen
--   Stand von main Aufbau und Features (ohne Projekt-Code auszuführen) und gleicht Obergruppen, Gruppen und Features an (die App ist die Quelle).
--   Was in der App fehlt, wird nur markiert (Bestätigen in der Oberfläche). Pull Requests aus Claude-Chats erscheinen in ws_chat_arbeit.
--   Offene Aufbau-Änderungen der Codeschmiede (noch nicht in die App übernommen) halten den Abgleich an – nichts wird überschrieben.
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0064. Test: supabase/tests/t52_updates_abgleich.sql.
begin;

-- ---------- 1. Updates & Freigabe ----------
alter table public.ws_projekte add column if not exists freigabe_ablauf boolean not null default false;   -- nur von ws_freigabe_stand_melden gesetzt

alter table public.ws_live_versionen drop constraint if exists ws_live_versionen_art_check;
alter table public.ws_live_versionen add constraint ws_live_versionen_art_check check (art in ('einrichten','live','zurueck','extern'));

alter table public.ws_live_auftraege add column if not exists ziel_version text
  check (ziel_version is null or (ziel_version ~ '^version/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$' and char_length(ziel_version) <= 120));
alter table public.ws_live_auftraege drop constraint if exists ws_live_auftraege_art_check;
alter table public.ws_live_auftraege add constraint ws_live_auftraege_art_check check (art in ('einrichten','live','zurueck','planen','zuruecknehmen'));
do $$ declare c record; begin
  -- alte, unbenannte Prüfungen aus 0024 ((art = 'zurueck') = …, (art = 'live') = …) ersetzen
  for c in select conname from pg_constraint where conrelid = 'public.ws_live_auftraege'::regclass and contype = 'c'
            and conname not in ('ws_live_auftraege_art_check','ws_live_auftraege_stand_check','ws_live_auftraege_hinweis_check',
                                'ws_live_auftraege_ziel_commit_check','ws_live_auftraege_ziel_version_check','ws_live_auftraege_ziele')
            and pg_get_constraintdef(oid) ~ 'art' loop
    execute format('alter table public.ws_live_auftraege drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.ws_live_auftraege drop constraint if exists ws_live_auftraege_ziele;
alter table public.ws_live_auftraege add constraint ws_live_auftraege_ziele check (
  case art when 'einrichten' then version_id is null and ziel_commit is null and ziel_version is null
           when 'live' then ziel_commit is not null and version_id is null and ziel_version is null
           when 'planen' then ziel_commit is not null and version_id is null and ziel_version is null
           when 'zuruecknehmen' then ziel_commit is null and version_id is null and ziel_version is null
           when 'zurueck' then ziel_commit is null and ((version_id is not null) <> (ziel_version is not null)) end);

create table if not exists public.ws_freigabe_stand (
  projekt_id text primary key references public.ws_projekte(id) on delete cascade,
  stand jsonb not null,
  aktualisiert timestamptz not null default now()
);
alter table public.ws_freigabe_stand enable row level security;
drop policy if exists ws_freigabe_stand_lesen on public.ws_freigabe_stand;
create policy ws_freigabe_stand_lesen on public.ws_freigabe_stand for select to authenticated using (public.ws_sieht_projekt(projekt_id));
revoke all on public.ws_freigabe_stand from anon, authenticated;
grant select on public.ws_freigabe_stand to authenticated;

-- Strenge Form des gemeldeten Stands (nur Technik-Daten aus GitHub; Texte begrenzt, keine weiteren Schlüssel)
create or replace function public.ws_text_ok(v jsonb, n int, leer_ok boolean default true) returns boolean
language sql immutable set search_path = public as $$
  select v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= n and (leer_ok or char_length(v #>> '{}') > 0))
$$;
create or replace function public.ws_nur_schluessel(v jsonb, erlaubt text[]) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(v) = 'object' and not exists (select 1 from jsonb_object_keys(v) k where k <> all (erlaubt))
$$;
create or replace function public.ws_freigabe_stand_ok(s jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare x jsonb; sha constant text := '^[0-9a-f]{40}$';
begin
  if s is null or octet_length(s::text) > 262144 then return false; end if;
  if not public.ws_nur_schluessel(s, array['ablauf','live_sha','main_sha','live_bez','wartet','commits','datenbank','mitteilungen','geplant','verlauf','zurueck','lauf']) then return false; end if;
  if jsonb_typeof(s->'ablauf') is distinct from 'boolean' then return false; end if;
  if coalesce(s->>'live_sha', '') !~ sha or coalesce(s->>'main_sha', '') !~ sha then return false; end if;
  if not public.ws_text_ok(s->'live_bez', 60) then return false; end if;
  if jsonb_typeof(coalesce(s->'datenbank', 'false')) <> 'boolean' then return false; end if;
  if s ? 'commits' and (jsonb_typeof(s->'commits') <> 'number' or (s->>'commits')::numeric not between 0 and 100000) then return false; end if;
  -- wartende Pull Requests
  if jsonb_typeof(coalesce(s->'wartet', '[]')) <> 'array' or jsonb_array_length(coalesce(s->'wartet', '[]')) > 300 then return false; end if;
  for x in select * from jsonb_array_elements(coalesce(s->'wartet', '[]')) loop
    if not public.ws_nur_schluessel(x, array['nr','titel','zweig','art','am']) or jsonb_typeof(x->'nr') <> 'number'
       or (x->>'nr')::numeric not between 1 and 10000000 or not public.ws_text_ok(x->'titel', 200) or not public.ws_text_ok(x->'zweig', 255)
       or coalesce(x->>'art', '') not in ('neu','fix','doku') or not public.ws_text_ok(x->'am', 40) then return false; end if;
  end loop;
  -- „Was ist neu?“ (src/lib/neuigkeiten.json, nur Einträge, die noch nicht live sind)
  if jsonb_typeof(coalesce(s->'mitteilungen', '[]')) <> 'array' or jsonb_array_length(coalesce(s->'mitteilungen', '[]')) > 100 then return false; end if;
  for x in select * from jsonb_array_elements(coalesce(s->'mitteilungen', '[]')) loop
    if not public.ws_nur_schluessel(x, array['id','titel','text','fuer']) or not public.ws_text_ok(x->'id', 80, false)
       or not public.ws_text_ok(x->'titel', 200) or not public.ws_text_ok(x->'text', 2000)
       or jsonb_typeof(coalesce(x->'fuer', '[]')) <> 'array' or jsonb_array_length(coalesce(x->'fuer', '[]')) > 12
       or exists (select 1 from jsonb_array_elements(coalesce(x->'fuer', '[]')) r where jsonb_typeof(r) <> 'string' or (r #>> '{}') !~ '^[a-z_-]{1,30}$') then return false; end if;
  end loop;
  -- geplant (Zweig freigabe/geplant)
  if s ? 'geplant' and s->'geplant' <> 'null'::jsonb then
    x := s->'geplant';
    if not public.ws_nur_schluessel(x, array['sha','datum','von','am']) or coalesce(x->>'sha', '') !~ sha
       or not (x->'datum' is null or x->'datum' = 'null'::jsonb or coalesce(x->>'datum', '') ~ '^\d{4}-\d{2}-\d{2}$')
       or not public.ws_text_ok(x->'von', 120) or not public.ws_text_ok(x->'am', 40) then return false; end if;
  end if;
  -- Verlauf (Läufe des Ablaufs)
  if jsonb_typeof(coalesce(s->'verlauf', '[]')) <> 'array' or jsonb_array_length(coalesce(s->'verlauf', '[]')) > 40 then return false; end if;
  for x in select * from jsonb_array_elements(coalesce(s->'verlauf', '[]')) loop
    if not public.ws_nur_schluessel(x, array['am','art','ziel','von','ergebnis','status']) or not public.ws_text_ok(x->'am', 40)
       or coalesce(x->>'art', '') not in ('freigabe','planen','zuruecknehmen','abend','zurueck','direkt')
       or not public.ws_text_ok(x->'ziel', 120) or not public.ws_text_ok(x->'von', 120)
       or not public.ws_text_ok(x->'ergebnis', 20) or not public.ws_text_ok(x->'status', 20) then return false; end if;
  end loop;
  -- Versionen, auf die man zurück darf (schon einmal live)
  if jsonb_typeof(coalesce(s->'zurueck', '[]')) <> 'array' or jsonb_array_length(coalesce(s->'zurueck', '[]')) > 12 then return false; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(s->'zurueck', '[]')) v
             where jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^version/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$' or char_length(v #>> '{}') > 120) then return false; end if;
  if s ? 'lauf' and s->'lauf' <> 'null'::jsonb then
    x := s->'lauf';
    if not public.ws_nur_schluessel(x, array['status','ergebnis','am','titel']) or not public.ws_text_ok(x->'status', 20)
       or not public.ws_text_ok(x->'ergebnis', 20) or not public.ws_text_ok(x->'am', 40) or not public.ws_text_ok(x->'titel', 200) then return false; end if;
  end if;
  return true;
end $$;

-- Werkstatt des Admins meldet den Freigabe-Stand eines Projekts (alle paar Minuten)
create or replace function public.ws_freigabe_stand_melden(p_pc uuid, p_projekt text, p_stand jsonb,
  p_live_features text[] default '{}', p_test_features text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; jetzt public.ws_live_versionen; neu_live text;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into p from public.ws_projekte where id = p_projekt;
  if p.id is null or coalesce(p.archiviert, false) or p.repo is null or not p.live_zweig then raise exception 'Projekt ohne Test & Live'; end if;
  if not public.ws_freigabe_stand_ok(p_stand) then raise exception 'Ungültiger Freigabe-Stand'; end if;
  if cardinality(coalesce(p_live_features, '{}')) > 2000 or cardinality(coalesce(p_test_features, '{}')) > 2000 then raise exception 'Zu viele Features'; end if;
  insert into public.ws_freigabe_stand (projekt_id, stand, aktualisiert) values (p_projekt, p_stand, now())
  on conflict (projekt_id) do update set stand = excluded.stand, aktualisiert = now();
  update public.ws_projekte set freigabe_ablauf = (p_stand->>'ablauf')::boolean where id = p_projekt and freigabe_ablauf is distinct from (p_stand->>'ablauf')::boolean;
  -- Live hat sich außerhalb der Codeschmiede geändert (Plattform, Fehlerbehebung direkt live)? → Version „extern“ und Feature-Stände
  neu_live := p_stand->>'live_sha';
  select * into jetzt from public.ws_live_versionen where projekt_id = p_projekt order by id desc limit 1;
  if jetzt.id is not null and jetzt.commit_sha is distinct from neu_live
     and not exists (select 1 from public.ws_live_auftraege a where a.projekt_id = p_projekt and a.stand in ('wartet','laeuft')) then
    insert into public.ws_live_versionen (projekt_id, commit_sha, bezeichnung, migrationen, art, von)
      values (p_projekt, neu_live, left(coalesce(nullif(p_stand->>'live_bez', ''), 'Stand ' || left(neu_live, 7)), 60), '{}', 'extern', null);
    update public.ws_features f set stand = 'live', geaendert = now()
     where f.id = any (coalesce(p_live_features, '{}')) and f.stand = 'test' and public.ws_projekt_von_gruppe(f.gruppe_id) = p_projekt;
    update public.ws_features f set stand = 'test', geaendert = now()
     where f.id = any (coalesce(p_test_features, '{}')) and f.stand = 'live' and public.ws_projekt_von_gruppe(f.gruppe_id) = p_projekt;
    insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'live_extern', jsonb_build_object('projekt', p_projekt, 'commit', neu_live));
  end if;
end $$;

-- Admin: Live-Schaltung anfordern. Mit Ablauf (freigabe_ablauf): live / planen / zuruecknehmen / zurueck (per Versionsname) – die Werkstatt
-- startet .github/workflows/freigabe.yml; ohne Ablauf wie bisher (0024).
drop function if exists public.ws_live_anfordern(text, text, bigint, text);
create or replace function public.ws_live_anfordern(p_projekt text, p_art text, p_version bigint default null, p_commit text default null,
  p_version_name text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; v public.ws_live_versionen; jetzt public.ws_live_versionen; neu bigint; st jsonb;
begin
  if not public.ws_ist_admin() then raise exception 'Live schalten und zurücksetzen darf nur der Admin'; end if;
  select * into p from public.ws_projekte where id = p_projekt;
  if p.id is null or coalesce(p.archiviert, false) or p.repo is null then raise exception 'Projekt nicht gefunden, archiviert oder ohne GitHub-Repository'; end if;
  if p_art = 'einrichten' then
    if p.live_zweig then raise exception 'Test & Live ist schon eingerichtet'; end if;
    p_version := null; p_commit := null; p_version_name := null;
  elsif not p.live_zweig then raise exception 'Zuerst „Test & Live einrichten“';
  elsif p.freigabe_ablauf then
    select stand into st from public.ws_freigabe_stand where projekt_id = p_projekt;
    if st is null then raise exception 'Der Freigabe-Stand ist noch nicht bekannt – bitte kurz warten (Werkstatt des Admins)'; end if;
    if p_art in ('live','planen') then
      -- nur genau der gesehene Stand von main (der Ablauf prüft das noch einmal)
      if p_commit is null or p_commit !~ '^[0-9a-f]{40}$' or p_commit is distinct from st->>'main_sha' then
        raise exception 'In der Zwischenzeit ist etwas dazugekommen – bitte die Seite neu laden'; end if;
      if p_commit = st->>'live_sha' then raise exception 'Dieser Stand ist schon live'; end if;
      if p_art = 'planen' and coalesce(st->'geplant', 'null'::jsonb) <> 'null'::jsonb and st->'geplant'->>'sha' = p_commit then raise exception 'Dieser Stand ist schon für 22:00 geplant'; end if;
      p_version := null; p_version_name := null;
    elsif p_art = 'zuruecknehmen' then
      if coalesce(st->'geplant', 'null'::jsonb) = 'null'::jsonb then raise exception 'Es ist keine Freigabe geplant'; end if;
      p_version := null; p_commit := null; p_version_name := null;
    elsif p_art = 'zurueck' then
      if p_version_name is null or not (coalesce(st->'zurueck', '[]'::jsonb) ? p_version_name) then
        raise exception 'Zurück geht nur auf eine Version, die schon einmal live war'; end if;
      p_version := null; p_commit := null;
    else raise exception 'Unbekannte Aktion';
    end if;
  elsif p_art in ('live','zurueck') then
    p_version_name := null;
    if p_art = 'live' then
      p_version := null;
      if p_commit is null or p_commit !~ '^[0-9a-f]{40}$' then raise exception 'Der Test-Stand ist noch nicht bekannt – bitte kurz warten (Abgleich der Werkstatt)'; end if;
    else
      p_commit := null;
      select * into v from public.ws_live_versionen where id = p_version and projekt_id = p_projekt;
      if v.id is null then raise exception 'Version nicht gefunden'; end if;
      select * into jetzt from public.ws_live_versionen where projekt_id = p_projekt order by id desc limit 1;
      if jetzt.commit_sha = v.commit_sha then raise exception 'Diese Version ist schon live'; end if;
      if exists (select 1 from unnest(jetzt.migrationen) m where m <> all (v.migrationen)) then
        raise exception 'Version passt nicht zur Datenbank: seitdem neue Datenbank-Dateien (%)',
          (select string_agg(m, ', ') from (select m from unnest(jetzt.migrationen) m where m <> all (v.migrationen) limit 3) x);
      end if;
    end if;
  else raise exception 'Diese Aktion gibt es nur mit dem Freigabe-Ablauf (.github/workflows/freigabe.yml)';
  end if;
  begin
    insert into public.ws_live_auftraege (projekt_id, art, version_id, ziel_commit, ziel_version, von)
      values (p_projekt, p_art, p_version, p_commit, p_version_name, auth.uid()) returning id into neu;
  exception when unique_violation then raise exception 'Es läuft schon eine Live-Schaltung für dieses Projekt';
  end;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'live_angefordert',
    jsonb_build_object('projekt', p_projekt, 'art', p_art, 'version', coalesce(p_version::text, p_version_name), 'commit', p_commit, 'id', neu, 'ablauf', p.freigabe_ablauf));
  return neu;
end $$;

drop function if exists public.ws_live_nehmen(uuid);
create or replace function public.ws_live_nehmen(p_pc uuid)
returns table (id bigint, projekt_id text, art text, repo text, commit_sha text, ziel_version text, ablauf boolean, von_name text)
language plpgsql security definer set search_path = public as $$
declare a public.ws_live_auftraege;
begin
  if not public.ws_ist_admin() then return; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  -- Projekte mit Freigabe-Ablauf nur an einen Dienst ab 0.20.0 (ein älterer würde den Zweig live selbst setzen und den Ablauf umgehen)
  select * into a from public.ws_live_auftraege x
   where (x.stand = 'wartet' or (x.stand = 'laeuft' and x.geaendert < now() - interval '30 minutes'))
     and (not exists (select 1 from public.ws_projekte pp where pp.id = x.projekt_id and pp.freigabe_ablauf)
          or coalesce((select case when w.faehigkeiten ->> 'dienst' ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'
                                   then string_to_array(w.faehigkeiten ->> 'dienst', '.')::int[] >= array[0,20,0] else false end
                         from public.ws_werkstatt_pcs w where w.id = p_pc), false))
   order by x.id limit 1 for update skip locked;
  if a.id is null then return; end if;
  update public.ws_live_auftraege x set stand = 'laeuft', pc = p_pc, geaendert = now(), hinweis = 'Werkstatt arbeitet' where x.id = a.id;
  return query select a.id, a.projekt_id, a.art, p.repo, coalesce(v.commit_sha, a.ziel_commit), a.ziel_version, p.freigabe_ablauf,
                      (select left(b.name, 80) from public.ws_benutzer b where b.id = a.von)
    from public.ws_projekte p left join public.ws_live_versionen v on v.id = a.version_id where p.id = a.projekt_id;
end $$;

-- Ergebnis: planen/zuruecknehmen ohne neue Version; sonst wie 0024
create or replace function public.ws_live_ergebnis(p_pc uuid, p_id bigint, p_commit text, p_bezeichnung text, p_migrationen text[], p_fehler text default null,
  p_live_features text[] default '{}', p_test_features text[] default '{}', p_hinweis text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_live_auftraege;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  select * into a from public.ws_live_auftraege where id = p_id for update;
  if a.id is null or a.pc is distinct from p_pc or a.stand <> 'laeuft' then raise exception 'Keine laufende Live-Schaltung dieser Werkstatt'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if p_fehler is not null then
    update public.ws_live_auftraege set stand = 'fehler', hinweis = left(p_fehler, 1000), geaendert = now() where id = p_id;
  elsif a.art in ('planen','zuruecknehmen') then
    update public.ws_live_auftraege set stand = 'fertig', geaendert = now(),
           hinweis = left(concat_ws(' · ', case a.art when 'planen' then 'Für 22:00 geplant' else 'Geplante Freigabe zurückgenommen' end, p_hinweis), 1000)
     where id = p_id;
  else
    if p_commit is null or p_commit !~ '^[0-9a-f]{40}$' then raise exception 'Ungültiger Stand'; end if;
    insert into public.ws_live_versionen (projekt_id, commit_sha, bezeichnung, migrationen, art, von)
      values (a.projekt_id, p_commit, left(p_bezeichnung, 60), coalesce(p_migrationen, '{}'), a.art, a.von);
    update public.ws_features f set stand = 'live', geaendert = now()
     where f.id = any (coalesce(p_live_features, '{}')) and f.stand = 'test' and public.ws_projekt_von_gruppe(f.gruppe_id) = a.projekt_id;
    if a.art = 'zurueck' then
      update public.ws_features f set stand = 'test', geaendert = now()
       where f.id = any (coalesce(p_test_features, '{}')) and f.stand = 'live' and public.ws_projekt_von_gruppe(f.gruppe_id) = a.projekt_id;
    end if;
    update public.ws_live_auftraege set stand = 'fertig', geaendert = now(),
           hinweis = left(concat_ws(' · ', case a.art when 'einrichten' then 'Zweig „live“ angelegt – jetzt bei Cloudflare umstellen' when 'live' then 'Live geschaltet' else 'Zurückgesetzt' end, p_hinweis), 1000)
     where id = p_id;
  end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'live_ergebnis', jsonb_build_object('id', p_id, 'art', a.art, 'commit', p_commit, 'fehler', p_fehler));
end $$;

-- ---------- 2. Abgleich mit main ----------
alter table public.ws_bereiche add column if not exists app_key text check (app_key is null or app_key ~ '^[a-z0-9-]{1,40}$');
update public.ws_bereiche set app_key = id where app_teil = 'app' and app_key is null and id ~ '^[a-z0-9-]{1,40}$';
update public.ws_bereiche set app_key = case id when 'erp-uebersicht' then 'start' else substr(id, 5) end
 where app_teil = 'erp' and app_key is null and id ~ '^erp-[a-z0-9-]{1,36}$';
alter table public.ws_gruppen add column if not exists app_fehlt boolean not null default false;   -- Menüpunkt gibt es in der App nicht mehr

create table if not exists public.ws_aufbau_stand (
  projekt_id text primary key references public.ws_projekte(id) on delete cascade,
  main_sha text not null check (main_sha ~ '^[0-9a-f]{40}$'),
  ergebnis jsonb not null default '{}'::jsonb check (octet_length(ergebnis::text) <= 131072),
  wartet text check (char_length(wartet) <= 300),     -- gesetzt, wenn der Abgleich angehalten ist (offene Aufbau-Änderungen)
  zeit timestamptz not null default now()
);
create table if not exists public.ws_chat_arbeit (
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  nr int not null check (nr between 1 and 10000000),
  titel text not null check (char_length(titel) <= 200),
  zweig text check (char_length(zweig) <= 255),
  am timestamptz,
  feature_ids text[] not null default '{}' check (cardinality(feature_ids) <= 50),
  primary key (projekt_id, nr)
);
create index if not exists ws_chat_arbeit_am on public.ws_chat_arbeit (projekt_id, am desc);
create index if not exists ws_chat_arbeit_features on public.ws_chat_arbeit using gin (feature_ids);
alter table public.ws_aufbau_stand enable row level security;
alter table public.ws_chat_arbeit enable row level security;
drop policy if exists ws_aufbau_stand_lesen on public.ws_aufbau_stand;
create policy ws_aufbau_stand_lesen on public.ws_aufbau_stand for select to authenticated using (public.ws_sieht_projekt(projekt_id));
drop policy if exists ws_chat_arbeit_lesen on public.ws_chat_arbeit;
create policy ws_chat_arbeit_lesen on public.ws_chat_arbeit for select to authenticated using (public.ws_sieht_projekt(projekt_id));
revoke all on public.ws_aufbau_stand, public.ws_chat_arbeit from anon, authenticated;
grant select on public.ws_aufbau_stand, public.ws_chat_arbeit to authenticated;

-- Form des gelesenen Aufbaus: { app: [{key,label,gruppen:[{key,label}]}], erp: […], features: { app: {menuKey: [{id,name,beschreibung,stunden,verkauf}]}, erp: {…} } }
create or replace function public.ws_aufbau_ok(a jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare t text; o jsonb; g jsonb; k text; fl jsonb; f jsonb; n int := 0; keyre constant text := '^[a-z0-9-]{1,40}$';
begin
  if a is null or octet_length(a::text) > 2097152 or not public.ws_nur_schluessel(a, array['app','erp','features']) then return false; end if;
  foreach t in array array['app','erp'] loop
    if jsonb_typeof(coalesce(a->t, '[]')) <> 'array' or jsonb_array_length(coalesce(a->t, '[]')) > 40 then return false; end if;
    for o in select * from jsonb_array_elements(coalesce(a->t, '[]')) loop
      if not public.ws_nur_schluessel(o, array['key','label','gruppen']) or coalesce(o->>'key', '') !~ keyre or not public.ws_text_ok(o->'label', 60)
         or jsonb_typeof(coalesce(o->'gruppen', '[]')) <> 'array' or jsonb_array_length(coalesce(o->'gruppen', '[]')) > 60 then return false; end if;
      for g in select * from jsonb_array_elements(coalesce(o->'gruppen', '[]')) loop
        if not public.ws_nur_schluessel(g, array['key','label']) or coalesce(g->>'key', '') !~ keyre or not public.ws_text_ok(g->'label', 80) then return false; end if;
      end loop;
    end loop;
  end loop;
  if not public.ws_nur_schluessel(coalesce(a->'features', '{}'), array['app','erp']) then return false; end if;
  foreach t in array array['app','erp'] loop
    if jsonb_typeof(coalesce(a->'features'->t, '{}')) <> 'object' then return false; end if;
    for k, fl in select * from jsonb_each(coalesce(a->'features'->t, '{}')) loop
      if k !~ keyre or jsonb_typeof(fl) <> 'array' or jsonb_array_length(fl) > 200 then return false; end if;
      for f in select * from jsonb_array_elements(fl) loop
        n := n + 1;
        if n > 3000 or not public.ws_nur_schluessel(f, array['id','name','beschreibung','stunden','verkauf'])
           or coalesce(f->>'id', '') !~ '^F-[0-9]{3,5}$' or not public.ws_text_ok(f->'name', 120, false) or not public.ws_text_ok(f->'beschreibung', 1000)
           or not public.ws_text_ok(f->'verkauf', 40)
           or not (f->'stunden' is null or f->'stunden' = 'null'::jsonb or (jsonb_typeof(f->'stunden') = 'number' and (f->>'stunden')::numeric between 0 and 100000))
        then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end $$;

-- Werkstatt des Admins: Aufbau aus main übernehmen (die App ist die Quelle). Gibt eine Zusammenfassung zurück.
create or replace function public.ws_aufbau_abgleichen(p_pc uuid, p_projekt text, p_main text, p_aufbau jsonb, p_live_ids text[] default '{}', p_prs jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; t text; o jsonb; g jsonb; f jsonb; k text; fl jsonb; oi int; gi int; fi int;
  b_id text; g_id text; erg jsonb := jsonb_build_object('neue_obergruppen', '[]'::jsonb, 'neue_gruppen', '[]'::jsonb, 'neue_features', '[]'::jsonb,
    'verschoben', 0, 'umbenannt', 0, 'fehlt_gruppen', '[]'::jsonb, 'fehlt_features', '[]'::jsonb, 'chat_neu', 0);
  gesehen_g text[] := '{}'; gesehen_f text[] := '{}'; alt public.ws_features; altg public.ws_gruppen; x jsonb; offen int; n int;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into p from public.ws_projekte where id = p_projekt for update;
  if p.id is null or coalesce(p.archiviert, false) or p.repo is null or p.aufbau_datei is null then raise exception 'Projekt ohne Aufbau-Datei'; end if;
  if p_main is null or p_main !~ '^[0-9a-f]{40}$' then raise exception 'Ungültiger Stand von main'; end if;
  if cardinality(coalesce(p_live_ids, '{}')) > 5000 or exists (select 1 from unnest(coalesce(p_live_ids, '{}')) i where i !~ '^F-[0-9]{3,5}$') then raise exception 'Ungültige Feature-Liste'; end if;
  if jsonb_typeof(coalesce(p_prs, '[]')) <> 'array' or jsonb_array_length(coalesce(p_prs, '[]')) > 500 then raise exception 'Ungültige Pull-Request-Liste'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_prs, '[]')) loop
    if not public.ws_nur_schluessel(x, array['nr','titel','zweig','am','features']) or jsonb_typeof(x->'nr') <> 'number'
       or (x->>'nr')::numeric not between 1 and 10000000 or not public.ws_text_ok(x->'titel', 200, false) or not public.ws_text_ok(x->'zweig', 255)
       or not (coalesce(x->>'am', '') ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$')
       or jsonb_typeof(coalesce(x->'features', '[]')) <> 'array' or jsonb_array_length(coalesce(x->'features', '[]')) > 50
       or exists (select 1 from jsonb_array_elements(coalesce(x->'features', '[]')) i where jsonb_typeof(i) <> 'string' or (i #>> '{}') !~ '^F-[0-9]{3,5}$')
    then raise exception 'Ungültige Pull-Request-Liste'; end if;
  end loop;

  -- Pull Requests aus Claude-Chats (immer, auch wenn der Aufbau wartet)
  with neu as (
    insert into public.ws_chat_arbeit (projekt_id, nr, titel, zweig, am, feature_ids)
    select p_projekt, (pr->>'nr')::int, pr->>'titel', nullif(pr->>'zweig', ''), (pr->>'am')::timestamptz,
           coalesce((select array_agg(i #>> '{}') from jsonb_array_elements(pr->'features') i), '{}')
      from jsonb_array_elements(coalesce(p_prs, '[]')) pr
    on conflict (projekt_id, nr) do nothing returning 1)
  select count(*) into n from neu;
  erg := jsonb_set(erg, '{chat_neu}', to_jsonb(n));

  -- offene Aufbau-Änderungen der Codeschmiede (noch nicht in der App) → Aufbau nicht anfassen
  select count(*) into offen from public.ws_aufbau_aenderungen c
   where c.projekt_id = p_projekt and (c.auftrag_id is null
      or exists (select 1 from public.ws_auftraege a where a.id = c.auftrag_id and a.stand not in ('erledigt','abgebrochen')));
  if offen > 0 then
    insert into public.ws_aufbau_stand (projekt_id, main_sha, ergebnis, wartet, zeit)
      values (p_projekt, p_main, erg, format('%s Aufbau-Änderung(en) der Codeschmiede sind noch nicht in der App – Aufbau wird erst danach nachgezogen', offen), now())
    on conflict (projekt_id) do update set main_sha = excluded.main_sha, ergebnis = excluded.ergebnis, wartet = excluded.wartet, zeit = now();
    return erg;
  end if;
  if not public.ws_aufbau_ok(p_aufbau) then raise exception 'Ungültiger Aufbau'; end if;

  perform set_config('cs.aufbau_still', 'an', true);   -- der Abgleich ist keine Änderung der Codeschmiede (kein „In die App übernehmen“)
  foreach t in array array['app','erp'] loop
    oi := 0;
    for o in select * from jsonb_array_elements(coalesce(p_aufbau->t, '[]')) loop
      oi := oi + 1;
      select id into b_id from public.ws_bereiche where projekt_id = p_projekt and app_teil = t and app_key = o->>'key' limit 1;
      if b_id is null then
        b_id := case when t = 'erp' then 'erp-' || (o->>'key') else o->>'key' end;
        if exists (select 1 from public.ws_bereiche where id = b_id) then b_id := p_projekt || '-' || t || '-' || (o->>'key'); end if;
        if exists (select 1 from public.ws_bereiche where id = b_id) then raise exception 'Obergruppe % lässt sich nicht anlegen', o->>'key'; end if;
        insert into public.ws_bereiche (id, name, reihenfolge, projekt_id, global, app_teil, app_key)
          values (b_id, left(coalesce(nullif(o->>'label', ''), o->>'key'), 60), (case t when 'erp' then 20 else 0 end) + oi, p_projekt, false, t, o->>'key');
        erg := jsonb_set(erg, '{neue_obergruppen}', (erg->'neue_obergruppen') || to_jsonb(coalesce(nullif(o->>'label', ''), o->>'key')));
      else
        update public.ws_bereiche set reihenfolge = (case t when 'erp' then 20 else 0 end) + oi,
               name = case when coalesce(o->>'label', '') <> '' then left(o->>'label', 60) else name end
         where id = b_id and (reihenfolge is distinct from (case t when 'erp' then 20 else 0 end) + oi
                              or (coalesce(o->>'label', '') <> '' and name is distinct from left(o->>'label', 60)));
      end if;
      gi := 0;
      for g in select * from jsonb_array_elements(coalesce(o->'gruppen', '[]')) loop
        gi := gi + 1;
        select gr.* into altg from public.ws_gruppen gr join public.ws_bereiche b on b.id = gr.bereich_id
         where b.projekt_id = p_projekt and b.app_teil = t and gr.app_key = g->>'key' order by gr.erstellt limit 1;
        if altg.id is null then
          g_id := case when t = 'erp' then 'erp-' || (g->>'key') else g->>'key' end;
          if exists (select 1 from public.ws_gruppen where id = g_id) then g_id := p_projekt || '-' || t || '-' || (g->>'key'); end if;
          if exists (select 1 from public.ws_gruppen where id = g_id) then raise exception 'Gruppe % lässt sich nicht anlegen', g->>'key'; end if;
          insert into public.ws_gruppen (id, bereich_id, name, symbol, reihenfolge, app_key)
            values (g_id, b_id, left(coalesce(nullif(g->>'label', ''), g->>'key'), 80), 'layers', gi, g->>'key');
          erg := jsonb_set(erg, '{neue_gruppen}', (erg->'neue_gruppen') || to_jsonb(left(coalesce(nullif(g->>'label', ''), g->>'key'), 80)));
        else
          g_id := altg.id;
          if altg.bereich_id is distinct from b_id or altg.reihenfolge is distinct from gi or altg.app_fehlt
             or (coalesce(g->>'label', '') <> '' and altg.name is distinct from left(g->>'label', 80)) then
            update public.ws_gruppen set bereich_id = b_id, reihenfolge = gi, app_fehlt = false,
                   name = case when coalesce(g->>'label', '') <> '' then left(g->>'label', 80) else name end where id = g_id;
            if altg.bereich_id is distinct from b_id then erg := jsonb_set(erg, '{verschoben}', to_jsonb((erg->>'verschoben')::int + 1)); end if;
            if coalesce(g->>'label', '') <> '' and altg.name is distinct from left(g->>'label', 80) then erg := jsonb_set(erg, '{umbenannt}', to_jsonb((erg->>'umbenannt')::int + 1)); end if;
          end if;
        end if;
        gesehen_g := gesehen_g || g_id;
        -- Features dieses Menüpunkts
        fi := 0;
        for f in select * from jsonb_array_elements(coalesce(p_aufbau->'features'->t->(g->>'key'), '[]')) loop
          fi := fi + 1;
          gesehen_f := gesehen_f || (f->>'id');
          select * into alt from public.ws_features where id = f->>'id';
          if alt.id is null then
            insert into public.ws_features (id, gruppe_id, name, beschreibung, stand, quelle, reihenfolge, stunden_schaetzung, verkauf_key)
              values (f->>'id', g_id, f->>'name', nullif(f->>'beschreibung', ''), case when (f->>'id') = any (coalesce(p_live_ids, '{}')) then 'live' else 'test' end,
                      'registry', fi, nullif(f->>'stunden', '')::numeric, nullif(f->>'verkauf', ''));
            erg := jsonb_set(erg, '{neue_features}', (erg->'neue_features') || to_jsonb((f->>'id') || ' ' || (f->>'name')));
          elsif public.ws_projekt_von_gruppe(alt.gruppe_id) is distinct from p_projekt then
            raise exception 'Feature % gehört zu einem anderen Projekt', f->>'id';
          else
            if alt.gruppe_id is distinct from g_id then erg := jsonb_set(erg, '{verschoben}', to_jsonb((erg->>'verschoben')::int + 1)); end if;
            update public.ws_features set gruppe_id = g_id, name = f->>'name', beschreibung = nullif(f->>'beschreibung', ''), reihenfolge = fi,
                   stunden_schaetzung = coalesce(nullif(f->>'stunden', '')::numeric, stunden_schaetzung), verkauf_key = nullif(f->>'verkauf', ''),
                   fehlt_im_verzeichnis = false, quelle = 'registry', geaendert = now()
             where id = alt.id and (gruppe_id is distinct from g_id or name is distinct from f->>'name' or beschreibung is distinct from nullif(f->>'beschreibung', '')
                    or reihenfolge is distinct from fi or fehlt_im_verzeichnis or verkauf_key is distinct from nullif(f->>'verkauf', '')
                    or (nullif(f->>'stunden', '') is not null and stunden_schaetzung is distinct from (f->>'stunden')::numeric));
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  -- In der App nicht mehr vorhanden → nur markieren (bestätigen in der Oberfläche)
  with weg as (
    update public.ws_gruppen gr set app_fehlt = true from public.ws_bereiche b
     where b.id = gr.bereich_id and b.projekt_id = p_projekt and b.app_teil in ('app','erp') and gr.app_key is not null
       and gr.id <> all (gesehen_g) and not gr.app_fehlt returning gr.name as eintrag)
  select coalesce(jsonb_agg(eintrag), '[]') into x from weg;
  erg := jsonb_set(erg, '{fehlt_gruppen}', x);
  with weg as (
    update public.ws_features f set fehlt_im_verzeichnis = true, geaendert = now()
     where f.quelle = 'registry' and f.id ~ '^F-' and f.id <> all (gesehen_f) and not f.fehlt_im_verzeichnis and not f.ausgebaut
       and public.ws_projekt_von_gruppe(f.gruppe_id) = p_projekt
       and exists (select 1 from public.ws_gruppen gr join public.ws_bereiche b on b.id = gr.bereich_id where gr.id = f.gruppe_id and b.app_teil in ('app','erp'))
     returning f.id || ' ' || f.name as eintrag)
  select coalesce(jsonb_agg(eintrag), '[]') into x from weg;
  erg := jsonb_set(erg, '{fehlt_features}', x);
  perform set_config('cs.aufbau_still', '', true);

  insert into public.ws_aufbau_stand (projekt_id, main_sha, ergebnis, wartet, zeit) values (p_projekt, p_main, erg, null, now())
  on conflict (projekt_id) do update set main_sha = excluded.main_sha, zeit = now(), wartet = null,
    -- Zusammenfassung des letzten Abgleichs, der etwas geändert hat, bleibt sichtbar
    ergebnis = case when excluded.ergebnis->'neue_obergruppen' = '[]' and excluded.ergebnis->'neue_gruppen' = '[]' and excluded.ergebnis->'neue_features' = '[]'
                         and (excluded.ergebnis->>'verschoben')::int = 0 and (excluded.ergebnis->>'umbenannt')::int = 0
                         and excluded.ergebnis->'fehlt_gruppen' = '[]' and excluded.ergebnis->'fehlt_features' = '[]' and (excluded.ergebnis->>'chat_neu')::int = 0
                    then public.ws_aufbau_stand.ergebnis else excluded.ergebnis end;
  if erg->'neue_obergruppen' <> '[]' or erg->'neue_gruppen' <> '[]' or erg->'neue_features' <> '[]' or (erg->>'verschoben')::int > 0
     or erg->'fehlt_gruppen' <> '[]' or erg->'fehlt_features' <> '[]' then
    insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'aufbau_abgleich', jsonb_build_object('projekt', p_projekt, 'main', p_main, 'ergebnis', erg));
  end if;
  return erg;
end $$;

-- Admin: in der App entfernte Gruppe/Feature bestätigen (Feature → ausgebaut; Gruppe nur, wenn leer und ohne Aufträge → gelöscht)
create or replace function public.ws_aufbau_entfernt_bestaetigen(p_projekt text, p_art text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  if p_art = 'feature' then
    update public.ws_features f set ausgebaut = true, geaendert = now()
     where f.id = p_id and f.fehlt_im_verzeichnis and public.ws_projekt_von_gruppe(f.gruppe_id) = p_projekt;
    if not found then raise exception 'Feature nicht gefunden oder in der App vorhanden'; end if;
  elsif p_art = 'gruppe' then
    if not exists (select 1 from public.ws_gruppen gr join public.ws_bereiche b on b.id = gr.bereich_id where gr.id = p_id and gr.app_fehlt and b.projekt_id = p_projekt) then
      raise exception 'Gruppe nicht gefunden oder in der App vorhanden'; end if;
    if exists (select 1 from public.ws_features where gruppe_id = p_id and not ausgebaut) then raise exception 'Zuerst die Features der Gruppe ausbauen oder verschieben'; end if;
    if exists (select 1 from public.ws_auftraege where gruppe_id = p_id) then raise exception 'Die Gruppe hat Aufträge – sie bleibt als Verlauf bestehen'; end if;
    perform set_config('cs.aufbau_still', 'an', true);
    delete from public.ws_features where gruppe_id = p_id and ausgebaut
      and not exists (select 1 from public.ws_auftraege a where a.feature_id = ws_features.id);
    delete from public.ws_gruppen where id = p_id;
    perform set_config('cs.aufbau_still', '', true);
  else raise exception 'Unbekannte Art';
  end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'aufbau_entfernt_bestaetigt', jsonb_build_object('projekt', p_projekt, 'art', p_art, 'id', p_id));
end $$;

revoke execute on function public.ws_text_ok(jsonb, int, boolean), public.ws_nur_schluessel(jsonb, text[]), public.ws_freigabe_stand_ok(jsonb),
  public.ws_aufbau_ok(jsonb), public.ws_freigabe_stand_melden(uuid, text, jsonb, text[], text[]),
  public.ws_live_anfordern(text, text, bigint, text, text), public.ws_live_nehmen(uuid),
  public.ws_live_ergebnis(uuid, bigint, text, text, text[], text, text[], text[], text),
  public.ws_aufbau_abgleichen(uuid, text, text, jsonb, text[], jsonb), public.ws_aufbau_entfernt_bestaetigen(text, text, text) from public, anon;
grant execute on function public.ws_freigabe_stand_melden(uuid, text, jsonb, text[], text[]),
  public.ws_live_anfordern(text, text, bigint, text, text), public.ws_live_nehmen(uuid),
  public.ws_live_ergebnis(uuid, bigint, text, text, text[], text, text[], text[], text),
  public.ws_aufbau_abgleichen(uuid, text, text, jsonb, text[], jsonb), public.ws_aufbau_entfernt_bestaetigen(text, text, text) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.ws_freigabe_stand; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ws_aufbau_stand; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ws_chat_arbeit; exception when others then null; end;
end $$;

commit;
