-- Codeschmiede · Datenbank 0059: Ein Arbeitsplatz für jede Art von Programm, Stufe 1 (Entwurf freigegeben von Gerhard 2026-11-02,
-- `docs/entwurf-1.0-arbeitsplatz-alle-arten.html`, Konzept `docs/KONZEPT-ARBEITSPLATZ.md`). 0057 und 0058 sind für parallele Features reserviert;
-- diese Datei hängt von keiner der beiden ab.
--   * ws_projekte.ziele          – Ziele des Projekts (web, handy_pwa, windows, mac, cloud_lauf, pdf), vorbelegt aus technik_art; nur Admin ändert
--   * ws_features.pruefweg_*     – Prüfweg je Feature (seite · fenster · befehl · kapitel); „seite“ IST die bisherige vorschau_pfad
--   * ws_punkt_weiterarbeiten    – offener Punkt (= Aufgabe am Feature, 0042) als Auftrag: Sendung + Auftrag + erste Nachricht in einem Schritt
--   * ws_code_live               – flüchtiger Diff eines LAUFENDEN Auftrags (nur die bearbeitende Werkstatt schreibt; gelöscht bei Auftragsende, spätestens nach 2 Std.)
--   * ws_code_anfragen Art „diff“ – Diff des letzten Auftrags (Zweig gegen main) über den bestehenden Weg des Code-Editors
-- Keine Personendaten. Mehrfach ausführbar. Reihenfolge 0001 → … → 0056 → 0059.
begin;

-- ---------- Ziele ----------
create or replace function public.ws_ziele_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select p is not null and cardinality(p) <= 6
     and p <@ array['web','handy_pwa','windows','mac','cloud_lauf','pdf']::text[]
     and cardinality(p) = (select count(distinct x) from unnest(p) x)
     and array_position(p, null) is null
$$;
revoke execute on function public.ws_ziele_ok(text[]) from public, anon;
grant execute on function public.ws_ziele_ok(text[]) to authenticated;

create or replace function public.ws_ziele_aus_art(p_art text) returns text[]
language sql immutable set search_path = public as $$
  select case p_art when 'handy' then array['handy_pwa'] when 'programm' then array['windows','mac'] when 'werkzeug' then array['cloud_lauf'] else array['web'] end::text[]
$$;
revoke execute on function public.ws_ziele_aus_art(text) from public, anon;
grant execute on function public.ws_ziele_aus_art(text) to authenticated;

alter table public.ws_projekte add column if not exists ziele text[] not null default '{}'::text[];
alter table public.ws_projekte drop constraint if exists ws_projekte_ziele_check;
alter table public.ws_projekte add constraint ws_projekte_ziele_check check (public.ws_ziele_ok(ziele));
-- Vorbelegung nur, wo noch nichts steht (zweites Einspielen ändert nichts)
update public.ws_projekte set ziele = public.ws_ziele_aus_art(technik_art) where cardinality(ziele) = 0;

-- Neue Projekte bzw. geänderte Art: leere Ziele füllen; standen noch die Vorgaben der alten Art, folgen sie der neuen Art
create or replace function public.ws_projekte_ziele_vorbelegen() returns trigger
language plpgsql set search_path = public as $$
begin
  if cardinality(coalesce(new.ziele, '{}'::text[])) = 0 then new.ziele := public.ws_ziele_aus_art(new.technik_art);
  elsif tg_op = 'UPDATE' and new.technik_art is distinct from old.technik_art and new.ziele = public.ws_ziele_aus_art(old.technik_art) then
    new.ziele := public.ws_ziele_aus_art(new.technik_art);
  end if;
  return new;
end $$;
revoke execute on function public.ws_projekte_ziele_vorbelegen() from public, anon, authenticated;
drop trigger if exists ws_projekte_ziele_vorbelegen on public.ws_projekte;
create trigger ws_projekte_ziele_vorbelegen before insert or update of technik_art, ziele on public.ws_projekte
  for each row execute function public.ws_projekte_ziele_vorbelegen();

create or replace function public.ws_projekt_ziele_setzen(p_projekt text, p_ziele text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not public.ws_ist_admin() then raise exception 'Ziele legt nur der Admin fest'; end if;
  if p_ziele is null or cardinality(p_ziele) not between 1 and 6 or not public.ws_ziele_ok(p_ziele) then
    raise exception 'Bitte 1 bis 6 Ziele aus der Liste wählen (web, handy_pwa, windows, mac, cloud_lauf, pdf)';
  end if;
  update public.ws_projekte set ziele = p_ziele where id = p_projekt and not coalesce(archiviert, false);
  if not found then raise exception 'Projekt nicht gefunden'; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'projekt_ziele', jsonb_build_object('projekt', p_projekt, 'ziele', to_jsonb(p_ziele)));
end $$;
revoke execute on function public.ws_projekt_ziele_setzen(text, text[]) from public, anon;
grant execute on function public.ws_projekt_ziele_setzen(text, text[]) to authenticated;

-- ---------- Prüfweg je Feature ----------
alter table public.ws_features add column if not exists pruefweg_typ text;
alter table public.ws_features add column if not exists pruefweg_text text;
alter table public.ws_features drop constraint if exists ws_features_pruefweg_typ_check;
alter table public.ws_features add constraint ws_features_pruefweg_typ_check check (pruefweg_typ is null or pruefweg_typ in ('seite','fenster','befehl','kapitel'));
alter table public.ws_features drop constraint if exists ws_features_pruefweg_text_check;
alter table public.ws_features add constraint ws_features_pruefweg_text_check check (
  pruefweg_text is null or (char_length(btrim(pruefweg_text)) between 1 and 200 and char_length(pruefweg_text) <= 200
    and public.ws_aufgabe_text_ok(pruefweg_text, false) and pruefweg_typ is not null and pruefweg_typ <> 'seite'));
-- Spalten nur über ws_feature_pruefweg_setzen (0001 gibt nur name, beschreibung, stand, geaendert frei – zur Sicherheit noch einmal entzogen)
revoke update (pruefweg_typ, pruefweg_text) on public.ws_features from anon, authenticated;

-- Setzen: gleiche Rechte wie „Diese Seite merken“ (ws_feature_vorschau_setzen, 0028). Typ „seite“ schreibt vorschau_pfad (gleiche Prüfung wie 0028).
create or replace function public.ws_feature_pruefweg_setzen(p_feature text, p_typ text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare g text; t text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select gruppe_id into g from public.ws_features where id = p_feature and not ausgebaut;
  if g is null then raise exception 'Feature nicht gefunden'; end if;
  if not public.ws_darf(public.ws_bereich_von_gruppe(g), 'auftraege') then raise exception 'Keine Berechtigung für dieses Feature'; end if;
  if exists (select 1 from public.ws_projekte where id = public.ws_projekt_von_gruppe(g) and coalesce(archiviert, false)) then raise exception 'Das Projekt ist archiviert'; end if;
  if p_typ is not null and p_typ not in ('seite','fenster','befehl','kapitel') then raise exception 'Unbekannter Prüfweg'; end if;
  if p_typ = 'seite' then
    update public.ws_features set pruefweg_typ = 'seite', pruefweg_text = null, vorschau_pfad = t, geaendert = now() where id = p_feature;
  elsif p_typ is null then
    update public.ws_features set pruefweg_typ = null, pruefweg_text = null, geaendert = now() where id = p_feature;
  else
    if t is null or char_length(t) > 200 then raise exception 'Bitte den Prüfweg kurz beschreiben (1–200 Zeichen)'; end if;
    update public.ws_features set pruefweg_typ = p_typ, pruefweg_text = t, geaendert = now() where id = p_feature;
  end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'pruefweg', jsonb_build_object('feature', p_feature, 'typ', p_typ, 'text', t));
end $$;
revoke execute on function public.ws_feature_pruefweg_setzen(text, text, text) from public, anon;
grant execute on function public.ws_feature_pruefweg_setzen(text, text, text) to authenticated;

-- ---------- Offener Punkt → Auftrag („Weiterarbeiten“) ----------
-- Derselbe Weg wie „In den Chat schicken“ + „Als Auftrag“ (0042) in EINEM Schritt: Sendung (Stand der Aufgabe), Auftrag, erste Nachricht mit
-- daten.aufgabe (die Werkstatt holt Links/Anhänge wie bisher über die Sendung). Rechte: Recht „Aufträge“ im Bereich des Features (Texter → Art „text“).
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
  if zusatz is not null and (char_length(zusatz) > 4000 or not public.ws_aufgabe_text_ok(zusatz, true)) then raise exception 'Text zu lang oder mit ungültigen Zeichen'; end if;
  select x.id into laeuft from public.ws_aufgabe_sendungen s2 join public.ws_auftraege x on x.id = s2.auftrag_id
   where s2.aufgabe_id = a.id and x.stand not in ('wissen','erledigt','abgebrochen') order by x.id desc limit 1;
  if laeuft is not null then raise exception 'Zu diesem Punkt läuft schon Auftrag #%', laeuft; end if;
  if (select count(*) from public.ws_aufgabe_sendungen x where x.von = auth.uid() and x.erstellt > now() - interval '1 day') >= 100 then
    raise exception 'Heute schon 100 Aufgaben bzw. Punkte als Auftrag gegeben – morgen wieder'; end if;
  t := left('Offener Punkt: ' || a.titel
       || case when btrim(a.beschreibung) <> '' then E'\n\n' || btrim(a.beschreibung) else '' end
       || case when zusatz is not null then E'\n\nDazu: ' || zusatz else '' end, 9000);
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb) into ids from public.ws_aufgabe_anhaenge x where x.aufgabe_id = a.id and x.fertig;
  insert into public.ws_aufgabe_sendungen (aufgabe_id, projekt_id, gruppe_id, feature_id, titel, text, links, anhaenge, von)
    values (a.id, a.projekt_id, g, a.feature_id, a.titel, t, a.links, ids, auth.uid()) returning id into s;
  insert into public.ws_auftraege (gruppe_id, feature_id, titel, art, erstellt_von)
    values (g, a.feature_id, left('Punkt: ' || a.titel, 80), case when public.ws_rolle_fuer_gruppe(g) = 'texter' then 'text' else 'aendern' end, auth.uid())
    returning id into n;
  insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal, daten)
    values (n, auth.uid(), 'text', left(replace(t, '](', '] ('), 8000), 'codeschmiede',
            jsonb_build_object('aufgabe', jsonb_build_object('id', a.id, 'sendung', s, 'anhaenge', ids, 'links', a.links)));
  update public.ws_aufgabe_sendungen set auftrag_id = n, als_auftrag_von = auth.uid(), als_auftrag_am = now() where id = s;
  update public.ws_aufgaben set status = case when status = 'offen' then 'arbeit' else status end where id = a.id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'punkt_weiterarbeiten', jsonb_build_object('aufgabe', a.id, 'sendung', s, 'auftrag', n, 'feature', a.feature_id));
  return n;
end $$;
revoke execute on function public.ws_punkt_weiterarbeiten(bigint, text) from public, anon;
grant execute on function public.ws_punkt_weiterarbeiten(bigint, text) to authenticated;

-- ---------- Code live (flüchtig) ----------
-- Form einer Datei-Liste: [{p, art, plus, minus, zeilen?, gekuerzt?}] – Geheimnis-Pfade nur als „ausgeblendet“ ohne Inhalt
create or replace function public.ws_code_live_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 60 and pg_column_size(p) <= 409600
    and not exists (select 1 from jsonb_array_elements(p) e where
          jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('p','art','plus','minus','zeilen','gekuerzt'))
       or jsonb_typeof(e -> 'p') is distinct from 'string' or not public.ws_code_pfad_ok(e ->> 'p')
       or coalesce(e ->> 'art', '') not in ('geaendert','neu','geloescht','binaer','ausgeblendet','gross','verknuepfung')
       -- CASE statt OR: Postgres garantiert keine Reihenfolge, die Umwandlung darf nur bei Zahlen laufen
       or (e ? 'plus' and case when jsonb_typeof(e -> 'plus') = 'number' then (e ->> 'plus')::numeric not between 0 and 10000000 else true end)
       or (e ? 'minus' and case when jsonb_typeof(e -> 'minus') = 'number' then (e ->> 'minus')::numeric not between 0 and 10000000 else true end)
       or (e ? 'gekuerzt' and jsonb_typeof(e -> 'gekuerzt') <> 'boolean')
       or (e ? 'zeilen' and (jsonb_typeof(e -> 'zeilen') <> 'string' or char_length(e ->> 'zeilen') > 30000
                             or e ->> 'art' in ('binaer','ausgeblendet','gross','verknuepfung')))
       or (public.ws_code_geheim(e ->> 'p') and (e ->> 'art' <> 'ausgeblendet' or e ? 'zeilen')))
$$;
revoke execute on function public.ws_code_live_ok(jsonb) from public, anon;
grant execute on function public.ws_code_live_ok(jsonb) to authenticated;

create table if not exists public.ws_code_live (
  auftrag_id bigint primary key references public.ws_auftraege(id) on delete cascade,
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  pc uuid not null references public.ws_werkstatt_pcs(id) on delete cascade,
  basis_sha text not null check (basis_sha ~ '^[0-9a-f]{40}$'),
  dateien jsonb not null default '[]'::jsonb check (public.ws_code_live_ok(dateien)),
  gekuerzt boolean not null default false,
  aktualisiert timestamptz not null default now()
);
-- Sicherheitsprüfung 02.11.2026 (H1): verdächtige Git-Einstellung im Arbeitsordner → Code live für diesen Auftrag abgeschaltet (Hinweis in der Oberfläche)
alter table public.ws_code_live add column if not exists abgeschaltet boolean not null default false;
alter table public.ws_code_live drop constraint if exists ws_code_live_abgeschaltet_leer;
alter table public.ws_code_live add constraint ws_code_live_abgeschaltet_leer check (not abgeschaltet or jsonb_array_length(dateien) = 0);
create index if not exists ws_code_live_alt on public.ws_code_live (aktualisiert);
alter table public.ws_code_live enable row level security;
revoke all on public.ws_code_live from public, anon, authenticated;
grant select on public.ws_code_live to authenticated;
drop policy if exists ws_code_live_lesen on public.ws_code_live;
-- nur frische Zeilen (Sicherheitsprüfung M1): auch wenn das Aufräumen einmal ausbleibt, ist nichts älter als 2 Stunden lesbar
create policy ws_code_live_lesen on public.ws_code_live for select to authenticated
  using (public.ws_sieht_projekt(projekt_id) and aktualisiert > now() - interval '2 hours');
-- bewusst nicht in der Realtime-Veröffentlichung (wie ws_code_anfragen seit 0032); die Oberfläche fragt kurz ab
do $$ begin alter publication supabase_realtime drop table public.ws_code_live; exception when others then null; end $$;

-- Melden: nur die Werkstatt, die den Auftrag gerade bearbeitet (eigener, eingeschalteter PC, Auftrag „läuft“ auf genau diesem PC)
drop function if exists public.ws_code_live_melden(uuid, bigint, text, jsonb, boolean);   -- frühere Entwurfs-Fassung ohne „abgeschaltet“
create or replace function public.ws_code_live_melden(p_pc uuid, p_auftrag bigint, p_basis text, p_dateien jsonb, p_gekuerzt boolean default false, p_abgeschaltet boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; pj text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into a from public.ws_auftraege where id = p_auftrag;
  if a.id is null or a.stand <> 'laeuft' or a.werkstatt_pc is distinct from p_pc then raise exception 'Dieser Auftrag läuft nicht auf diesem PC'; end if;
  if p_basis is null or p_basis !~ '^[0-9a-f]{40}$' then raise exception 'Ungültiger Startstand'; end if;
  if not public.ws_code_live_ok(p_dateien) then raise exception 'Ungültige oder zu große Datei-Liste'; end if;
  if coalesce(p_abgeschaltet, false) and jsonb_array_length(p_dateien) > 0 then raise exception 'Abgeschaltet heißt: keine Dateien'; end if;
  -- einmal abgeschaltet bleibt abgeschaltet (bis der Auftrag „läuft“ verlässt)
  if exists (select 1 from public.ws_code_live where auftrag_id = p_auftrag and abgeschaltet) and not coalesce(p_abgeschaltet, false) then
    raise exception 'Code live ist für diesen Auftrag abgeschaltet'; end if;
  pj := public.ws_projekt_von_gruppe(a.gruppe_id);
  delete from public.ws_code_live where aktualisiert < now() - interval '2 hours';
  insert into public.ws_code_live (auftrag_id, projekt_id, pc, basis_sha, dateien, gekuerzt, abgeschaltet, aktualisiert)
    values (a.id, pj, p_pc, p_basis, p_dateien, coalesce(p_gekuerzt, false), coalesce(p_abgeschaltet, false), now())
  on conflict (auftrag_id) do update set projekt_id = excluded.projekt_id, pc = excluded.pc, basis_sha = excluded.basis_sha,
    dateien = excluded.dateien, gekuerzt = excluded.gekuerzt, abgeschaltet = excluded.abgeschaltet, aktualisiert = now();
end $$;

-- Nach dem Lauf: eigene Zeile löschen (auch wenn der Auftrag schon nicht mehr „läuft“)
create or replace function public.ws_code_live_ende(p_pc uuid, p_auftrag bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  delete from public.ws_code_live where auftrag_id = p_auftrag and pc = p_pc;
  delete from public.ws_code_live where aktualisiert < now() - interval '2 hours';
end $$;
revoke execute on function public.ws_code_live_melden(uuid, bigint, text, jsonb, boolean, boolean), public.ws_code_live_ende(uuid, bigint) from public, anon;
grant execute on function public.ws_code_live_melden(uuid, bigint, text, jsonb, boolean, boolean), public.ws_code_live_ende(uuid, bigint) to authenticated;

-- Regelmäßiges Aufräumen (Sicherheitsprüfung M1): Es gibt kein pg_cron; ws_code_aufraeumen (0031/0032) ruft jeder Werkstatt-Dienst beim Start
-- und danach alle 10 Minuten auf – ab jetzt räumt sie auch ws_code_live auf (älter als 2 Stunden).
create or replace function public.ws_code_aufraeumen() returns void
language sql security definer set search_path = public as $$
  update public.ws_code_anfragen set inhalt = null, baum = null where erstellt < now() - interval '5 minutes' and (inhalt is not null or baum is not null);
  delete from public.ws_code_anfragen where erstellt < now() - interval '1 hour';
  delete from public.ws_code_live where aktualisiert < now() - interval '2 hours';
$$;
revoke execute on function public.ws_code_aufraeumen() from public, anon;
grant execute on function public.ws_code_aufraeumen() to authenticated;

-- Auftrag verlässt „läuft“ (fertig, Rückfrage, Fehler, Abbruch): Diff sofort weg
create or replace function public.ws_code_live_aufraeumen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.stand = 'laeuft' and new.stand is distinct from 'laeuft' then delete from public.ws_code_live where auftrag_id = new.id; end if;
  return new;
end $$;
revoke execute on function public.ws_code_live_aufraeumen() from public, anon, authenticated;
drop trigger if exists ws_code_live_aufraeumen on public.ws_auftraege;
create trigger ws_code_live_aufraeumen after update of stand on public.ws_auftraege for each row execute function public.ws_code_live_aufraeumen();

-- ---------- Diff des letzten Auftrags: ws_code_anfragen mit Art „diff“ (Zweig gegen main, Antwort im Feld „baum“ als Datei-Liste) ----------
alter table public.ws_code_anfragen drop constraint if exists ws_code_anfragen_art_check;
alter table public.ws_code_anfragen add constraint ws_code_anfragen_art_check check (art in ('baum','datei','diff'));
alter table public.ws_code_anfragen drop constraint if exists ws_code_anfragen_check;
alter table public.ws_code_anfragen add constraint ws_code_anfragen_check check (art in ('baum','diff') or pfad is not null);

create or replace function public.ws_code_anfragen(p_projekt text, p_zweig text, p_art text, p_pfad text default null, p_pc uuid default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint; grenze int := 60;
begin
  if p_art not in ('baum','datei','diff') then raise exception 'Unbekannte Anfrage'; end if;
  if p_art in ('baum','diff') then grenze := 6; end if;
  if not public.ws_sieht_projekt(p_projekt) then raise exception 'Kein Zugriff auf dieses Projekt'; end if;
  if not exists (select 1 from public.ws_projekte where id = p_projekt and repo is not null and not coalesce(archiviert, false)) then
    raise exception 'Das Projekt hat noch kein Repository';
  end if;
  if p_art = 'datei' and (not public.ws_code_pfad_ok(p_pfad) or public.ws_code_geheim(p_pfad)) then raise exception 'Diese Datei kann nicht geöffnet werden'; end if;
  if p_art = 'diff' and lower(btrim(p_zweig)) in ('main','live') then raise exception 'Der Vergleich geht nur für einen Auftrags-Zweig'; end if;
  if p_pc is not null and not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then
    raise exception 'Unbekannter Werkstatt-PC';
  end if;
  if (select count(*) from public.ws_code_anfragen where von = auth.uid() and erstellt > now() - interval '1 minute' and art = p_art) >= grenze then
    raise exception 'Zu viele Anfragen – bitte kurz warten';
  end if;
  insert into public.ws_code_anfragen (projekt_id, zweig, art, pfad, ziel_pc) values (p_projekt, p_zweig, p_art, case when p_art = 'datei' then p_pfad end, p_pc)
  returning id into n;
  return n;
end $$;
revoke execute on function public.ws_code_anfragen(text, text, text, text, uuid) from public, anon;
grant execute on function public.ws_code_anfragen(text, text, text, text, uuid) to authenticated;

-- Antwort einer diff-Anfrage: Datei-Liste wie Code live (gleiche Formprüfung)
create or replace function public.ws_code_antwort(p_pc uuid, p_id bigint, p_stand_sha text, p_baum jsonb, p_inhalt text, p_blob_sha text, p_hinweis text, p_nur_lesen boolean, p_fehler boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare art_ text;
begin
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select art into art_ from public.ws_code_anfragen where id = p_id and pc = p_pc and stand = 'laeuft';
  if art_ = 'diff' and not coalesce(p_fehler, false) and (p_inhalt is not null or not public.ws_code_live_ok(coalesce(p_baum, '[]'::jsonb))) then
    raise exception 'Ungültige oder zu große Datei-Liste';
  end if;
  update public.ws_code_anfragen set stand = case when p_fehler then 'fehler' else 'fertig' end, stand_sha = p_stand_sha, baum = p_baum,
         inhalt = p_inhalt, blob_sha = p_blob_sha, hinweis = left(p_hinweis, 300), nur_lesen = coalesce(p_nur_lesen, false), geaendert = now()
   where id = p_id and pc = p_pc and stand = 'laeuft';
  if not found then raise exception 'Keine laufende Anfrage dieser Werkstatt'; end if;
end $$;
revoke execute on function public.ws_code_antwort(uuid, bigint, text, jsonb, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.ws_code_antwort(uuid, bigint, text, jsonb, text, text, text, boolean, boolean) to authenticated;

commit;

select count(*) filter (where cardinality(ziele) > 0) as projekte_mit_zielen from public.ws_projekte;
