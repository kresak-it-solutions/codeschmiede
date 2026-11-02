-- Codeschmiede · Datenbank 0060: Arbeitsplatz für alle Arten, Stufen 2 und 3 (Entwurf 1.0 freigegeben von Gerhard 2026-11-02,
-- `docs/entwurf-1.0-arbeitsplatz-alle-arten.html`, Konzept `docs/KONZEPT-ARBEITSPLATZ.md`). Baut auf 0059 auf (Ziele, Prüfweg).
--   * ws_projekt_aktionen: neue Arten „bildschirmfoto“ (Sandbox-Fenster an den Chat, nur nach Bestätigung), „dokument“ (PDF in der Cloud bauen,
--     Seiten als Bilder), „vorschau_einrichten“ (Hand-Auftrag mit den Dateien der Vorlage); geprüfte Eingaben (Testlauf: Befehl + Beispiel-Eingabe
--     aus fester Form, nie eine Shell-Zeile), Ergebnis (gekürzte Ausgabe, Seiten), Feature und Chat-Nachricht
--   * Sperre angepasst: Sandbox und Bildschirmfoto auch für Projekte mit Ziel Windows (nicht nur Art „Programm“), Testlauf auch mit Ziel Cloud-Lauf,
--     Testseite auch für Tauri-Programme (Oberfläche als Testseite), nie für den Sonderfall .NET
--   * ws_projekte.programm_technik  – tauri (Standard, leer) oder dotnet (Sonderfall); ändern nur der Admin
--   * Speicher „ws-vorschau“         – Seiten des Dokuments (PNG), privat, nur Admins
-- Keine Personendaten. Mehrfach ausführbar. Reihenfolge 0001 → … → 0059 → 0060.
begin;

-- ---------- Technik für Windows/Mac: Tauri (Standard) oder .NET (Sonderfall) ----------
alter table public.ws_projekte add column if not exists programm_technik text;
alter table public.ws_projekte drop constraint if exists ws_projekte_programm_technik_check;
alter table public.ws_projekte add constraint ws_projekte_programm_technik_check check (programm_technik is null or programm_technik in ('tauri','dotnet'));
revoke update (programm_technik) on public.ws_projekte from anon, authenticated;

create or replace function public.ws_projekt_programm_technik_setzen(p_projekt text, p_technik text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not public.ws_ist_admin() then raise exception 'Die Technik legt nur der Admin fest'; end if;
  if p_technik is not null and p_technik not in ('tauri','dotnet') then raise exception 'Technik: tauri oder dotnet'; end if;
  update public.ws_projekte set programm_technik = nullif(p_technik, 'tauri') where id = p_projekt and not coalesce(archiviert, false);
  if not found then raise exception 'Projekt nicht gefunden'; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'programm_technik', jsonb_build_object('projekt', p_projekt, 'technik', coalesce(p_technik, 'tauri')));
end $$;
revoke execute on function public.ws_projekt_programm_technik_setzen(text, text) from public, anon;
grant execute on function public.ws_projekt_programm_technik_setzen(text, text) to authenticated;

-- ---------- Aktionen: neue Arten, Eingaben, Ergebnis ----------
alter table public.ws_projekt_aktionen drop constraint if exists ws_projekt_aktionen_art_check;
alter table public.ws_projekt_aktionen add constraint ws_projekt_aktionen_art_check check (art in
  ('sandbox','testlauf','pruefen','db_einrichten','testseite','regelwerk_vergleich','bildschirmfoto','dokument','vorschau_einrichten'));
alter table public.ws_projekt_aktionen add column if not exists feature_id text references public.ws_features(id) on delete set null;
alter table public.ws_projekt_aktionen add column if not exists eingaben jsonb;
alter table public.ws_projekt_aktionen add column if not exists ergebnis jsonb;
alter table public.ws_projekt_aktionen add column if not exists chat_id bigint references public.ws_claude_chat(id) on delete set null;

-- Eingaben je Art – feste Form, keine freien Befehle. Testlauf: Befehl (Name aus der Liste des Werkzeugs) und Beispiel-Eingabe (Dateiname in
-- beispiele/, ohne Ordner und ohne „..“). Vorschau einrichten: Ziel windows oder pdf. Alle anderen Arten: keine Eingaben.
create or replace function public.ws_aktion_eingaben_ok(p_art text, e jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when e is null then p_art <> 'vorschau_einrichten'
    when jsonb_typeof(e) <> 'object' then false
    when p_art = 'testlauf' then
      (select coalesce(bool_and(k in ('befehl','eingabe')), true) from jsonb_object_keys(e) k)
      and jsonb_typeof(e -> 'befehl') = 'string' and jsonb_typeof(e -> 'eingabe') = 'string'
      and (e ->> 'befehl') ~ '^[a-z][a-z0-9-]{0,39}$'
      and (e ->> 'eingabe') ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}(\.[A-Za-z0-9]{1,8})?$'
    when p_art = 'vorschau_einrichten' then
      (select coalesce(bool_and(k = 'ziel'), true) from jsonb_object_keys(e) k)
      and jsonb_typeof(e -> 'ziel') = 'string' and (e ->> 'ziel') in ('windows','pdf')
    else false
  end
$$;
revoke execute on function public.ws_aktion_eingaben_ok(text, jsonb) from public, anon;
grant execute on function public.ws_aktion_eingaben_ok(text, jsonb) to authenticated;

alter table public.ws_projekt_aktionen drop constraint if exists ws_projekt_aktionen_eingaben_check;
alter table public.ws_projekt_aktionen add constraint ws_projekt_aktionen_eingaben_check check (public.ws_aktion_eingaben_ok(art, eingaben));
alter table public.ws_projekt_aktionen drop constraint if exists ws_projekt_aktionen_ergebnis_check;
alter table public.ws_projekt_aktionen add constraint ws_projekt_aktionen_ergebnis_check check (ergebnis is null or (jsonb_typeof(ergebnis) = 'object' and pg_column_size(ergebnis) <= 262144));

-- Ein Projekt ist ein Windows-Programm (Art „Programm“ oder Ziel Windows) bzw. kann eine Testseite haben (Web, Handy, Tauri-Programm – nie .NET)
create or replace function public.ws_projekt_windows(p public.ws_projekte) returns boolean
language sql stable set search_path = public as $$ select p.technik_art = 'programm' or 'windows' = any(coalesce(p.ziele, '{}'::text[])) $$;
create or replace function public.ws_projekt_testseite_moeglich(p public.ws_projekte) returns boolean
language sql stable set search_path = public as $$
  select coalesce(p.technik_art, 'web') in ('web','handy') or (p.technik_art = 'programm' and p.programm_technik is distinct from 'dotnet')
$$;
revoke execute on function public.ws_projekt_windows(public.ws_projekte), public.ws_projekt_testseite_moeglich(public.ws_projekte) from public, anon;
grant execute on function public.ws_projekt_windows(public.ws_projekte), public.ws_projekt_testseite_moeglich(public.ws_projekte) to authenticated;

-- Anfordern: alte Fassung (5 Werte) ersetzen; benannte Aufrufe der Oberfläche (p_projekt, p_art, p_zweig, p_pc, p_netz) gehen weiter
drop function if exists public.ws_projekt_aktion_anfordern(text, text, text, uuid, boolean);
create or replace function public.ws_projekt_aktion_anfordern(p_projekt text, p_art text, p_zweig text default null, p_pc uuid default null,
  p_netz boolean default false, p_eingaben jsonb default null, p_feature text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; n bigint;
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  if p_art not in ('sandbox','testlauf','pruefen','db_einrichten','testseite','regelwerk_vergleich','bildschirmfoto','dokument','vorschau_einrichten') then raise exception 'Unbekannte Aktion'; end if;
  select * into p from public.ws_projekte where id = p_projekt and not coalesce(archiviert, false);
  if p.id is null then raise exception 'Projekt nicht gefunden'; end if;
  if p_art in ('sandbox','bildschirmfoto') and not public.ws_projekt_windows(p) then raise exception 'Die Sandbox gibt es nur für Programme mit Ziel Windows'; end if;
  if p_art = 'testlauf' and p.technik_art <> 'werkzeug' and not 'cloud_lauf' = any(p.ziele) then raise exception 'Testläufe gibt es nur für Werkzeuge (Ziel Cloud-Lauf)'; end if;
  if p_art = 'dokument' and not 'pdf' = any(p.ziele) then raise exception 'Die Seiten-Vorschau gibt es nur für Projekte mit Ziel PDF'; end if;
  if p_art in ('sandbox','testlauf','db_einrichten','testseite','dokument','vorschau_einrichten') and p.repo is null then raise exception 'Das Projekt hat noch kein Repository'; end if;
  if p_art = 'db_einrichten' and p.db_test_ref is null and p.db_live_ref is null then raise exception 'Zuerst die Datenbanken eintragen'; end if;
  if p_art = 'testseite' and not public.ws_projekt_testseite_moeglich(p) then raise exception 'Eine Testseite gibt es nur für Web- und Handy-Apps und Tauri-Programme (nicht für .NET)'; end if;
  if p_art = 'testseite' and p.vorschau_domain is not null and p.testseite_stand is distinct from 'fehler' and p.testseite_stand is distinct from 'lotse' then
    raise exception 'Die Testseite ist schon eingerichtet';
  end if;
  if p_art in ('sandbox','bildschirmfoto') and (p_pc is null or not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid())) then
    raise exception 'Für die Sandbox braucht es deinen Werkstatt-PC';
  end if;
  if not public.ws_aktion_eingaben_ok(p_art, p_eingaben) then raise exception 'Ungültige Eingaben für diese Aktion'; end if;
  if p_art = 'vorschau_einrichten' then
    if p_eingaben ->> 'ziel' = 'windows' and not (p.technik_art = 'programm' and p.programm_technik is distinct from 'dotnet') then
      raise exception 'Die Testseite der Programm-Oberfläche gibt es nur für Tauri-Programme';
    end if;
    if p_eingaben ->> 'ziel' = 'pdf' and not 'pdf' = any(p.ziele) then raise exception 'Die Seiten-Vorschau gibt es nur für Projekte mit Ziel PDF'; end if;
  end if;
  if p_feature is not null and not exists (select 1 from public.ws_features f where f.id = p_feature and not f.ausgebaut and public.ws_projekt_von_gruppe(f.gruppe_id) = p_projekt) then
    raise exception 'Feature gehört nicht zum Projekt';
  end if;
  if exists (select 1 from public.ws_projekt_aktionen a where a.projekt_id = p_projekt and a.art = p_art and a.stand in ('angefragt','laeuft')
              and a.geaendert > now() - interval '15 minutes') then raise exception 'Läuft schon – bitte kurz warten'; end if;
  if (select count(*) from public.ws_projekt_aktionen a where a.projekt_id = p_projekt and a.erstellt > now() - interval '1 day') >= 200 then
    raise exception 'Höchstens 200 Aktionen am Tag je Projekt';
  end if;
  insert into public.ws_projekt_aktionen (projekt_id, art, zweig, ziel_pc, netz, eingaben, feature_id)
  values (p_projekt, p_art, nullif(p_zweig, ''), case when p_art in ('sandbox','bildschirmfoto') then p_pc end, p_art = 'sandbox' and coalesce(p_netz, false),
          p_eingaben, p_feature)
  returning id into n;
  if p_art = 'testseite' then update public.ws_projekte set testseite_stand = 'laeuft', testseite_hinweis = 'Wartet auf die Werkstatt des Admins' where id = p_projekt; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'projekt_aktion', jsonb_build_object('projekt', p_projekt, 'art', p_art, 'zweig', p_zweig,
    'netz', coalesce(p_netz, false), 'eingaben', p_eingaben, 'feature', p_feature));
  return n;
end $$;
revoke execute on function public.ws_projekt_aktion_anfordern(text, text, text, uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.ws_projekt_aktion_anfordern(text, text, text, uuid, boolean, jsonb, text) to authenticated;

-- Nehmen: eine Werkstatt nimmt nur Arten, die sie kennt (p_arten). Ältere Dienste ohne p_arten bekommen nur die bisherigen Arten –
-- so bleibt eine neue Aktion nie bei einem Dienst hängen, der sie nicht ausführen kann.
drop function if exists public.ws_projekt_aktion_nehmen(uuid);
drop function if exists public.ws_projekt_aktion_nehmen(uuid, text[]);
create or replace function public.ws_projekt_aktion_nehmen(p_pc uuid, p_arten text[] default null)
returns table (id bigint, projekt_id text, art text, zweig text, repo text, technik_art text, netz boolean, eingaben jsonb, feature_id text, ziele text[], programm_technik text)
language plpgsql security definer set search_path = public as $$
declare a public.ws_projekt_aktionen; arten text[] := coalesce(p_arten, array['sandbox','testlauf','pruefen','db_einrichten','testseite','regelwerk_vergleich']);
begin
  if not public.ws_ist_admin() then return; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into a from public.ws_projekt_aktionen x
   where (x.stand = 'angefragt' or (x.stand = 'laeuft' and x.geaendert < now() - interval '15 minutes'))
     and (x.ziel_pc is null or x.ziel_pc = p_pc)
     and x.art = any(arten)
     and x.erstellt > now() - interval '1 day'
   order by x.erstellt limit 1 for update skip locked;
  if a.id is null then return; end if;
  update public.ws_projekt_aktionen set stand = 'laeuft', pc = p_pc, geaendert = now(), hinweis = 'Werkstatt arbeitet' where ws_projekt_aktionen.id = a.id;
  return query select a.id, a.projekt_id, a.art, a.zweig, p.repo, p.technik_art, a.netz, a.eingaben, a.feature_id, p.ziele, p.programm_technik
    from public.ws_projekte p where p.id = a.projekt_id;
end $$;
revoke execute on function public.ws_projekt_aktion_nehmen(uuid, text[]) from public, anon;
grant execute on function public.ws_projekt_aktion_nehmen(uuid, text[]) to authenticated;

-- Lange Läufe (Testlauf, Dokument warten auf GitHub): die haltende Werkstatt meldet „lebt noch“, damit keine andere die Aktion übernimmt
create or replace function public.ws_projekt_aktion_lebt(p_pc uuid, p_id bigint, p_hinweis text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  update public.ws_projekt_aktionen set geaendert = now(), hinweis = coalesce(left(nullif(p_hinweis, ''), 500), hinweis)
   where id = p_id and pc = p_pc and stand = 'laeuft' and art in ('testlauf','dokument') and erstellt > now() - interval '1 hour'
     and exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid());
  if not found then raise exception 'Keine laufende Aktion dieser Werkstatt'; end if;
end $$;
revoke execute on function public.ws_projekt_aktion_lebt(uuid, bigint, text) from public, anon;
grant execute on function public.ws_projekt_aktion_lebt(uuid, bigint, text) to authenticated;

-- ---------- Bildschirmfoto der Windows-Sandbox ----------
-- Die Werkstatt auf dem PC, der die Sandbox gestartet hat, legt das Foto im eigenen Chat-Speicher ab (ws-chat, Pfad <ich>/<projekt>/<zufall>.png,
-- gleiche Regel wie 0050) und meldet es hier. In den Chat kommt es erst, wenn Gerhard es in der Vorschau bestätigt (ws_bildschirmfoto_gesendet).
create or replace function public.ws_bildschirmfoto_melden(p_pc uuid, p_aktion bigint, p_pfad text, p_groesse integer, p_breite integer, p_hoehe integer) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_projekt_aktionen;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into a from public.ws_projekt_aktionen where id = p_aktion for update;
  if a.id is null or a.art <> 'bildschirmfoto' or a.stand <> 'laeuft' or a.pc is distinct from p_pc or a.ziel_pc is distinct from p_pc then
    raise exception 'Keine laufende Bildschirmfoto-Aktion dieser Werkstatt';
  end if;
  if p_pfad is null or p_pfad !~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,60}/[a-f0-9-]{36}\.png$'
     or split_part(p_pfad, '/', 1) <> auth.uid()::text or split_part(p_pfad, '/', 2) <> a.projekt_id then raise exception 'Ungültiger Ablageort'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'ws-chat' and o.name = p_pfad) then raise exception 'Bild nicht gefunden'; end if;
  if p_groesse is null or p_groesse not between 1 and 10485760 or p_breite is null or p_breite not between 1 and 10000 or p_hoehe is null or p_hoehe not between 1 and 10000 then
    raise exception 'Ungültige Bildgröße';
  end if;
  update public.ws_projekt_aktionen set stand = 'fertig', geaendert = now(),
         ergebnis = jsonb_build_object('bild', jsonb_build_object('pfad', p_pfad, 'groesse', p_groesse, 'breite', p_breite, 'hoehe', p_hoehe)),
         hinweis = 'Bildschirmfoto bereit – bitte ansehen und bestätigen, erst dann geht es in den Chat'
   where id = a.id;
end $$;
revoke execute on function public.ws_bildschirmfoto_melden(uuid, bigint, text, integer, integer, integer) from public, anon;
grant execute on function public.ws_bildschirmfoto_melden(uuid, bigint, text, integer, integer, integer) to authenticated;

-- Nach der Bestätigung: Die Oberfläche hat die Chat-Nachricht mit dem Foto als Anhang angelegt (normaler Weg, 0050) und verknüpft sie hier.
create or replace function public.ws_bildschirmfoto_gesendet(p_aktion bigint, p_chat bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_projekt_aktionen; c public.ws_claude_chat;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  select * into a from public.ws_projekt_aktionen where id = p_aktion for update;
  if a.id is null or a.art <> 'bildschirmfoto' or a.stand <> 'fertig' or a.von is distinct from auth.uid() or a.chat_id is not null
     or jsonb_typeof(a.ergebnis -> 'bild' -> 'pfad') is distinct from 'string' then raise exception 'Kein offenes Bildschirmfoto'; end if;
  select * into c from public.ws_claude_chat where id = p_chat;
  if c.id is null or c.von is distinct from auth.uid() or c.projekt_id <> a.projekt_id or c.frage_id is not null
     or not coalesce(c.anhaenge @> jsonb_build_array(jsonb_build_object('pfad', a.ergebnis -> 'bild' ->> 'pfad')), false) then
    raise exception 'Die Chat-Nachricht passt nicht zum Bildschirmfoto';
  end if;
  update public.ws_projekt_aktionen set chat_id = c.id, geaendert = now(), hinweis = 'Bildschirmfoto im Chat' where id = a.id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'bildschirmfoto_chat', jsonb_build_object('projekt', a.projekt_id, 'aktion', a.id, 'chat', c.id, 'feature', a.feature_id));
end $$;
revoke execute on function public.ws_bildschirmfoto_gesendet(bigint, bigint) from public, anon;
grant execute on function public.ws_bildschirmfoto_gesendet(bigint, bigint) to authenticated;

-- Zahl in JSON sicher prüfen (ohne Umwandlungsfehler bei Text oder Kommazahlen)
create or replace function public.ws_json_ganz(j jsonb, p_min numeric, p_max numeric) returns boolean
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(j) = 'number' and (j #>> '{}') ~ '^[0-9]{1,12}$' then (j #>> '{}')::numeric between p_min and p_max else false end
$$;
revoke execute on function public.ws_json_ganz(jsonb, numeric, numeric) from public, anon;
grant execute on function public.ws_json_ganz(jsonb, numeric, numeric) to authenticated;

-- ---------- Ergebnis von Testlauf (Konsole) und Dokument (Seiten) ----------
create or replace function public.ws_aktion_ergebnis_ok(p_art text, p_projekt text, p_aktion bigint, e jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select jsonb_typeof(e) = 'object' and pg_column_size(e) <= 262144 and case
    when p_art = 'testlauf' then
      (select coalesce(bool_and(k in ('ausgabe','gekuerzt','dateien','erfolg','lauf','befehl','eingabe')), true) from jsonb_object_keys(e) k)
      and jsonb_typeof(e -> 'ausgabe') = 'string' and char_length(e ->> 'ausgabe') <= 20000
      and coalesce(jsonb_typeof(e -> 'gekuerzt'), 'boolean') = 'boolean' and coalesce(jsonb_typeof(e -> 'erfolg'), 'boolean') = 'boolean'
      and (e -> 'lauf' is null or (jsonb_typeof(e -> 'lauf') = 'string' and (e ->> 'lauf') ~ '^[0-9]{1,20}$'))
      and (e -> 'befehl' is null or (jsonb_typeof(e -> 'befehl') = 'string' and (e ->> 'befehl') ~ '^[a-z][a-z0-9-]{0,39}$'))
      and (e -> 'eingabe' is null or (jsonb_typeof(e -> 'eingabe') = 'string' and (e ->> 'eingabe') ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}(\.[A-Za-z0-9]{1,8})?$'))
      and coalesce(jsonb_typeof(e -> 'dateien'), 'array') = 'array' and coalesce(jsonb_array_length(e -> 'dateien'), 0) <= 30
      and not exists (select 1 from jsonb_array_elements(coalesce(e -> 'dateien', '[]'::jsonb)) d
        where jsonb_typeof(d) <> 'object'
           or exists (select 1 from jsonb_object_keys(d) k where k not in ('name','groesse','text','gekuerzt'))
           or jsonb_typeof(d -> 'name') is distinct from 'string' or (d ->> 'name') !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,79}(/[A-Za-z0-9_][A-Za-z0-9._-]{0,79}){0,3}$' or (d ->> 'name') ~ '\.\.'
           or not public.ws_json_ganz(d -> 'groesse', 0, 1073741824)
           or (d -> 'text' is not null and (jsonb_typeof(d -> 'text') <> 'string' or char_length(d ->> 'text') > 16000))
           or coalesce(jsonb_typeof(d -> 'gekuerzt'), 'boolean') <> 'boolean')
    when p_art = 'dokument' then
      (select coalesce(bool_and(k in ('seiten','gesamt','gekuerzt','lauf')), true) from jsonb_object_keys(e) k)
      and jsonb_typeof(e -> 'seiten') = 'array' and jsonb_array_length(e -> 'seiten') <= 60
      and coalesce(jsonb_typeof(e -> 'gekuerzt'), 'boolean') = 'boolean'
      and (e -> 'gesamt' is null or public.ws_json_ganz(e -> 'gesamt', 0, 9999))
      and (e -> 'lauf' is null or (jsonb_typeof(e -> 'lauf') = 'string' and (e ->> 'lauf') ~ '^[0-9]{1,20}$'))
      and not exists (select 1 from jsonb_array_elements(e -> 'seiten') s
        where jsonb_typeof(s) <> 'object'
           or exists (select 1 from jsonb_object_keys(s) k where k not in ('nr','pfad','breite','hoehe'))
           or not public.ws_json_ganz(s -> 'nr', 1, 999)
           or not public.ws_json_ganz(s -> 'breite', 1, 4000) or not public.ws_json_ganz(s -> 'hoehe', 1, 6000)
           or jsonb_typeof(s -> 'pfad') is distinct from 'string'
           or (s ->> 'pfad') <> (auth.uid()::text || '/' || p_projekt || '/' || p_aktion::text || '/seite-' || lpad(s ->> 'nr', 3, '0') || '.png')
           or not exists (select 1 from storage.objects o where o.bucket_id = 'ws-vorschau' and o.name = s ->> 'pfad'))
    else false end
$$;
revoke execute on function public.ws_aktion_ergebnis_ok(text, text, bigint, jsonb) from public, anon;
grant execute on function public.ws_aktion_ergebnis_ok(text, text, bigint, jsonb) to authenticated;

create or replace function public.ws_aktion_ergebnis_melden(p_pc uuid, p_aktion bigint, p_ergebnis jsonb, p_hinweis text, p_link text default null, p_fehler boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_projekt_aktionen;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into a from public.ws_projekt_aktionen where id = p_aktion for update;
  if a.id is null or a.art not in ('testlauf','dokument') or a.stand <> 'laeuft' or a.pc is distinct from p_pc then raise exception 'Keine laufende Aktion dieser Werkstatt'; end if;
  if p_ergebnis is not null and not public.ws_aktion_ergebnis_ok(a.art, a.projekt_id, a.id, p_ergebnis) then raise exception 'Ungültiges Ergebnis'; end if;
  update public.ws_projekt_aktionen set stand = case when p_fehler then 'fehler' else 'fertig' end, ergebnis = p_ergebnis, hinweis = left(coalesce(p_hinweis, ''), 500),
         link = case when p_link ~ '^https://github\.com/[A-Za-z0-9._/-]{1,200}$' then p_link end, geaendert = now()
   where id = a.id;
end $$;
revoke execute on function public.ws_aktion_ergebnis_melden(uuid, bigint, jsonb, text, text, boolean) from public, anon;
grant execute on function public.ws_aktion_ergebnis_melden(uuid, bigint, jsonb, text, text, boolean) to authenticated;

-- ---------- Speicher „ws-vorschau“: Seiten des Dokuments als PNG (nur Admins, nur zur laufenden Dokument-Aktion der eigenen Werkstatt) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ws-vorschau', 'ws-vorschau', false, 3145728, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.ws_vorschau_datei_ok(p_name text, p_hochladen boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select case when coalesce(p_name, '') !~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,60}/[0-9]{1,15}/seite-[0-9]{3}\.png$' then false
    else public.ws_ist_admin()
     and (not p_hochladen or (split_part(p_name, '/', 1) = auth.uid()::text and exists (
       select 1 from public.ws_projekt_aktionen a join public.ws_werkstatt_pcs w on w.id = a.pc
        where a.id = split_part(p_name, '/', 3)::bigint and a.projekt_id = split_part(p_name, '/', 2)
          and a.art = 'dokument' and a.stand = 'laeuft' and w.benutzer_id = auth.uid()))) end
$$;
revoke execute on function public.ws_vorschau_datei_ok(text, boolean) from public, anon;
grant execute on function public.ws_vorschau_datei_ok(text, boolean) to authenticated;

drop policy if exists ws_vorschau_lesen on storage.objects;
create policy ws_vorschau_lesen on storage.objects for select to authenticated using (bucket_id = 'ws-vorschau' and public.ws_vorschau_datei_ok(name));
drop policy if exists ws_vorschau_hochladen on storage.objects;
create policy ws_vorschau_hochladen on storage.objects for insert to authenticated with check (bucket_id = 'ws-vorschau' and public.ws_vorschau_datei_ok(name, true));
drop policy if exists ws_vorschau_loeschen on storage.objects;
create policy ws_vorschau_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'ws-vorschau' and public.ws_vorschau_datei_ok(name) and split_part(name, '/', 1) = auth.uid()::text);

-- ---------- Ampel: Lampe „dokument“ (Seiten-Vorschau) ----------
create or replace function public.ws_anbindungen_ok(w jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(w) = 'object' and not exists (
    select 1 from jsonb_each(w) e
     where e.key not in ('github','pruefung','testseite','build','signatur','sandbox','datenbank','datenbank_live','testlauf','fehler','projektordner','regeln','sicherungen','setup','dokument')
        or jsonb_typeof(e.value) <> 'object'
        or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('stand','text'))
        or coalesce(e.value ->> 'stand', '') not in ('gruen','gelb','rot','grau')
        or jsonb_typeof(e.value -> 'text') is distinct from 'string'
        or char_length(e.value ->> 'text') > 200)
$$;

commit;
