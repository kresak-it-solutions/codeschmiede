-- Codeschmiede · Datenbank 0058: Bestehendes Projekt einlesen (0.15.0, Entwurf „Projekt einlesen“ freigegeben von Gerhard 02.11.2026,
-- docs/KONZEPT-EINLESEN.md). Unabhängig von 0057 (Werkzeug-Wahl, paralleles Feature) – setzt nur 0001–0056 voraus.
--   ws_einlesen   Ein Einlese-Vorgang: Quelle (nur zufällige Kennung + Dateiname, NIE ein Pfad – der Pfad liegt nur lokal im Programm),
--                 Stand, Prüfbericht (nur Namen und Zahlen: Technik, Ausschlüsse, gefährliche Dateien, Dateien mit Geheimnissen nur mit
--                 Name + Anzahl, Hinweise auf Personendaten nur mit Spaltennamen), Auswahl des Admins, Vorschlag der KI (Gruppen/Features).
-- Ablauf: Admin fordert an (ws_einlesen_anfordern) → die Werkstatt des PCs, auf dem die Quelle gewählt wurde, nimmt ihn (ws_einlesen_nehmen: nur
-- mit der Quell-Kennung, die nur dieser PC kennt) → prüft und meldet (ws_einlesen_melden) → Admin ordnet ein und startet (ws_einlesen_starten) →
-- Werkstatt kopiert, legt das private Repository an und meldet es (ws_einlesen_repo: trägt das Repository ein, legt die Aufgabe „Prüfungen und
-- Regelwerk ergänzen“ an – nicht gestartet – und fordert „Test & Live einrichten“ an) → KI-Vorschlag → Admin übernimmt nur Angehaktes
-- (ws_einlesen_uebernehmen). Alles nur Admin; keine direkten Schreibrechte; Protokoll in ws_protokoll.
-- Mehrfach ausführbar. NICHT in supabase/einspielen.txt (wird beim Zusammenführen eingeordnet).
begin;

create table if not exists public.ws_einlesen (
  id bigserial primary key,
  quelle text not null unique check (quelle ~ '^[0-9a-f]{32}$'),
  quelle_art text not null check (quelle_art in ('ordner','zip')),
  quelle_name text not null check (char_length(quelle_name) between 1 and 120 and quelle_name !~ '[\\/:\u0001-\u001f\u007f]'),
  stand text not null default 'pruefen' check (stand in ('pruefen','pruefung','geprueft','einlesen','einlesen_laeuft','wartet_ki','ki_laeuft','vorschlag','fertig','fehler','abgebrochen')),
  pc uuid references public.ws_werkstatt_pcs(id) on delete set null,
  projekt_id text references public.ws_projekte(id) on delete cascade,
  bericht jsonb check (bericht is null or (jsonb_typeof(bericht) = 'object' and pg_column_size(bericht) <= 600000)),
  auswahl jsonb check (auswahl is null or (jsonb_typeof(auswahl) = 'object' and pg_column_size(auswahl) <= 200000)),
  vorschlag jsonb check (vorschlag is null or (jsonb_typeof(vorschlag) = 'object' and pg_column_size(vorschlag) <= 65536)),
  hinweis text check (char_length(hinweis) <= 1000),
  schritt text check (char_length(schritt) <= 200),
  von uuid references auth.users(id) on delete set null,
  erstellt timestamptz not null default now(),
  geaendert timestamptz not null default now()
);
create unique index if not exists ws_einlesen_ein_projekt on public.ws_einlesen (projekt_id) where projekt_id is not null;
create index if not exists ws_einlesen_stand on public.ws_einlesen (stand, geaendert);
alter table public.ws_einlesen enable row level security;
revoke all on public.ws_einlesen from public, anon, authenticated;
grant select on public.ws_einlesen to authenticated;
drop policy if exists ws_einlesen_lesen on public.ws_einlesen;
create policy ws_einlesen_lesen on public.ws_einlesen for select to authenticated using (public.ws_ist_admin());

-- Texte ohne Pfade (Laufwerk, Benutzer-/Datenträger-Ordner) – Hinweise und Schritte zeigt die Oberfläche an
create or replace function public.ws_einlesen_text_ok(p text) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (char_length(p) <= 1000 and p !~ '[A-Za-z]:[\\/]' and p !~ '(^|[\s"''(])/(Users|home|Volumes|mnt|media|root|tmp|private|var)/' and p !~ '\\\\')
$$;

-- Vorschlag der KI: {"gruppen":[{"name","features":[{"name","beschreibung"}]}]} – höchstens 10 Gruppen, je 15 Features, Namen 2–60 Zeichen
create or replace function public.ws_einlesen_gruppen_ok(v jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare g jsonb; f jsonb;
begin
  if v is null or jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) k where k <> 'gruppen') then return false; end if;
  if jsonb_typeof(v->'gruppen') <> 'array' or jsonb_array_length(v->'gruppen') > 10 then return false; end if;
  for g in select * from jsonb_array_elements(v->'gruppen') loop
    if jsonb_typeof(g) <> 'object' or exists (select 1 from jsonb_object_keys(g) k where k not in ('name','features')) then return false; end if;
    if jsonb_typeof(g->'name') <> 'string' or char_length(btrim(g->>'name')) not between 2 and 60 or (g->>'name') ~ '[\u0001-\u001f\u007f<>{}]'
       or lower(btrim(g->>'name')) = 'konzept' then return false; end if;
    if jsonb_typeof(coalesce(g->'features','[]')) <> 'array' or jsonb_array_length(coalesce(g->'features','[]')) > 15 then return false; end if;
    for f in select * from jsonb_array_elements(coalesce(g->'features','[]')) loop
      if jsonb_typeof(f) <> 'object' or exists (select 1 from jsonb_object_keys(f) k where k not in ('name','beschreibung')) then return false; end if;
      if jsonb_typeof(f->'name') <> 'string' or char_length(btrim(f->>'name')) not between 2 and 60 or (f->>'name') ~ '[\u0001-\u001f\u007f<>{}]' then return false; end if;
      if f ? 'beschreibung' and (jsonb_typeof(f->'beschreibung') <> 'string' or char_length(f->>'beschreibung') > 300) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- Admin: Einlesen anfordern (Quelle wurde im Programm gewählt; hier nur Kennung, Art und Dateiname)
create or replace function public.ws_einlesen_anfordern(p_quelle text, p_art text, p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not public.ws_ist_admin() then raise exception 'Bestehende Projekte liest nur der Admin ein'; end if;
  if p_quelle is null or p_quelle !~ '^[0-9a-f]{32}$' then raise exception 'Ungültige Quelle'; end if;
  if p_art not in ('ordner','zip') then raise exception 'Ungültige Art der Quelle'; end if;
  if p_name is null or char_length(p_name) not between 1 and 120 or p_name ~ '[\\/:\u0001-\u001f\u007f]' then raise exception 'Ungültiger Name der Quelle'; end if;
  begin
    insert into public.ws_einlesen (quelle, quelle_art, quelle_name, von) values (p_quelle, p_art, p_name, auth.uid()) returning id into n;
  exception when unique_violation then raise exception 'Diese Quelle wird schon eingelesen – bitte neu wählen';
  end;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_angefordert', jsonb_build_object('id', n, 'art', p_art, 'name', p_name));
  return n;
end $$;

-- Werkstatt des Admins: Vorgang nehmen – nur mit einer Quell-Kennung, die dieser PC lokal kennt (p_quellen)
create or replace function public.ws_einlesen_nehmen(p_pc uuid, p_quellen text[])
returns table (id bigint, quelle text, quelle_art text, stand text, projekt_id text, bericht jsonb, auswahl jsonb)
language plpgsql security definer set search_path = public as $$
declare e public.ws_einlesen; neu text;
begin
  if not public.ws_ist_admin() then return; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid() and w.an) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if p_quellen is null or cardinality(p_quellen) = 0 or cardinality(p_quellen) > 50 then return; end if;
  -- Hängengebliebenes Einlesen (Werkstatt abgestürzt) nie halb fortsetzen: nach 2 Stunden als Fehler
  update public.ws_einlesen x set stand = 'fehler', hinweis = 'Unterbrochen (Werkstatt beendet) – bitte Projektordner prüfen und neu einlesen', geaendert = now()
   where x.stand = 'einlesen_laeuft' and x.geaendert < now() - interval '2 hours' and x.quelle = any (p_quellen);
  select * into e from public.ws_einlesen x
   where x.quelle = any (p_quellen)
     and (x.stand in ('pruefen','einlesen')
          or (x.stand = 'wartet_ki' and x.geaendert < now() - interval '5 minutes')
          or (x.stand in ('pruefung','ki_laeuft') and x.geaendert < now() - interval '30 minutes'))
   order by x.geaendert limit 1 for update skip locked;
  if e.id is null then return; end if;
  neu := case when e.stand in ('pruefen','pruefung') then 'pruefung' when e.stand = 'einlesen' then 'einlesen_laeuft' else 'ki_laeuft' end;
  update public.ws_einlesen x set stand = neu, pc = p_pc, geaendert = now(), schritt = null where x.id = e.id;
  return query select e.id, e.quelle, e.quelle_art, neu, e.projekt_id, e.bericht, e.auswahl;
end $$;

-- Werkstatt: Stand melden (nur der PC, der den Vorgang hält; nur erlaubte Übergänge)
create or replace function public.ws_einlesen_melden(p_pc uuid, p_id bigint, p_stand text, p_bericht jsonb default null, p_vorschlag jsonb default null,
  p_hinweis text default null, p_schritt text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ws_einlesen;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  select * into e from public.ws_einlesen where id = p_id for update;
  if e.id is null or e.pc is distinct from p_pc or not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then
    raise exception 'Kein Einlese-Vorgang dieser Werkstatt'; end if;
  if not public.ws_einlesen_text_ok(p_hinweis) or not public.ws_einlesen_text_ok(p_schritt) or char_length(p_schritt) > 200 then raise exception 'Hinweis mit Pfad oder zu lang'; end if;
  if not ((e.stand = 'pruefung' and p_stand in ('geprueft','fehler'))
       or (e.stand = 'einlesen_laeuft' and p_stand in ('einlesen_laeuft','wartet_ki','vorschlag','fehler'))
       or (e.stand = 'ki_laeuft' and p_stand in ('wartet_ki','vorschlag','fehler'))) then
    raise exception 'Unerwarteter Schritt (% → %)', e.stand, p_stand; end if;
  if p_stand = 'geprueft' then
    if p_bericht is null or jsonb_typeof(p_bericht) <> 'object' or jsonb_typeof(p_bericht->'einheiten') <> 'array' then raise exception 'Prüfbericht fehlt'; end if;
    -- Der Bericht trägt nur Namen und Zahlen – nie Inhalte (kein Schlüssel „inhalt“/„text“/„wert“ irgendwo)
    if p_bericht::text ~* '"(inhalt|text|wert|daten|schluessel)"\s*:' or not public.ws_einlesen_text_ok(left(p_bericht::text, 600000)) then raise exception 'Prüfbericht enthält Inhalte oder Pfade'; end if;
  elsif p_bericht is not null then raise exception 'Prüfbericht nur nach der Prüfung';
  end if;
  if p_stand = 'vorschlag' and not public.ws_einlesen_gruppen_ok(p_vorschlag) then raise exception 'Ungültiger Vorschlag'; end if;
  if p_stand <> 'vorschlag' and p_vorschlag is not null then raise exception 'Vorschlag nur im Schritt „vorschlag“'; end if;
  update public.ws_einlesen set stand = p_stand, geaendert = now(),
    bericht = coalesce(p_bericht, bericht), vorschlag = coalesce(p_vorschlag, vorschlag),
    hinweis = case when p_stand = 'einlesen_laeuft' then hinweis else left(p_hinweis, 1000) end,
    schritt = case when p_stand = 'einlesen_laeuft' then left(p_schritt, 200) else schritt end
   where id = p_id;
  if p_stand in ('geprueft','fehler','vorschlag') then
    insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_' || p_stand, jsonb_build_object('id', p_id, 'projekt', e.projekt_id));
  end if;
end $$;

-- Admin: Einordnen fertig → Einlesen starten (Projekt muss neu und ohne Repository sein)
create or replace function public.ws_einlesen_starten(p_id bigint, p_projekt text, p_auswahl jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ws_einlesen; p public.ws_projekte;
begin
  if not public.ws_ist_admin() then raise exception 'Einlesen startet nur der Admin'; end if;
  select * into e from public.ws_einlesen where id = p_id for update;
  if e.id is null or e.stand <> 'geprueft' then raise exception 'Der Vorgang ist nicht (mehr) geprüft'; end if;
  select * into p from public.ws_projekte where id = p_projekt;
  if p.id is null or coalesce(p.archiviert, false) or p.repo is not null then raise exception 'Projekt nicht gefunden, archiviert oder hat schon ein Repository'; end if;
  if exists (select 1 from public.ws_einlesen x where x.projekt_id = p_projekt) then raise exception 'In dieses Projekt wurde schon eingelesen'; end if;
  if p_auswahl is null or jsonb_typeof(p_auswahl) <> 'object' or exists (select 1 from jsonb_object_keys(p_auswahl) k where k not in ('zuordnung','personen','wissen'))
     or jsonb_typeof(coalesce(p_auswahl->'zuordnung','{}')) <> 'object' or jsonb_typeof(coalesce(p_auswahl->'personen','[]')) <> 'array'
     or exists (select 1 from jsonb_each_text(coalesce(p_auswahl->'zuordnung','{}')) z where z.value not in ('code','konzept','doku','material','code+doku','weglassen'))
     or pg_column_size(p_auswahl) > 200000 then raise exception 'Ungültige Auswahl'; end if;
  update public.ws_einlesen set stand = 'einlesen', projekt_id = p_projekt, auswahl = p_auswahl, hinweis = null, geaendert = now() where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_gestartet', jsonb_build_object('id', p_id, 'projekt', p_projekt));
end $$;

-- Werkstatt: Repository angelegt → eintragen (nur genau kresak-it-solutions/<kennung>), Aufgabe „Prüfungen und Regelwerk ergänzen“ (nicht
-- gestartet) und „Test & Live einrichten“ (Zweig live, wie bei neuen Projekten) anlegen
create or replace function public.ws_einlesen_repo(p_pc uuid, p_id bigint, p_repo text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ws_einlesen;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  select * into e from public.ws_einlesen where id = p_id for update;
  if e.id is null or e.pc is distinct from p_pc or e.stand <> 'einlesen_laeuft' or e.projekt_id is null
     or not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Kein laufendes Einlesen dieser Werkstatt'; end if;
  if p_repo is null or p_repo <> 'kresak-it-solutions/' || e.projekt_id or not public.ws_repo_ok(p_repo) then raise exception 'Ungültiges Repository'; end if;
  update public.ws_projekte set repo = p_repo, repo_privat = true, repo_wunsch_privat = true, repo_stand = 'fertig', repo_aktion = null,
         repo_hinweis = 'Eingelesen (privat)', repo_geaendert = now() where id = e.projekt_id and repo is null;
  if not found then raise exception 'Projekt hat schon ein Repository'; end if;
  insert into public.ws_aufgaben (projekt_id, titel, beschreibung, prioritaet, zustaendig, erstellt_von, geaendert_von)
  values (e.projekt_id, 'Prüfungen und Regelwerk ergänzen',
    'Das Projekt wurde eingelesen, ohne dass Prüfungen (GitHub-Ablauf „Prüfung“: Tests und Bauen), Regelwerk (AGENTS.md, CHANGELOG, Handbuch) '
    || 'und Fehler-Melder eingebaut wurden. Bitte prüfen, was passt, und dann mit „In den Chat schicken“ › „Als Auftrag“ an die Werkstatt geben. '
    || 'GitHub Actions ist aus (beim Einlesen abgeschaltet, damit keine Abläufe aus dem Projekt laufen) – erst nach dieser Aufgabe bei GitHub › Settings › Actions einschalten.',
    'hoch', (select b.id from public.ws_benutzer b where b.id = e.von), e.von, e.von);
  begin
    insert into public.ws_live_auftraege (projekt_id, art, von) values (e.projekt_id, 'einrichten', e.von);
  exception when unique_violation then null;
  end;
  update public.ws_einlesen set geaendert = now(), schritt = 'Repository angelegt' where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_repo', jsonb_build_object('id', p_id, 'projekt', e.projekt_id, 'repo', p_repo));
end $$;

-- Admin: angehakte Gruppen und Features übernehmen (Bereich „App“, Features Stand „test“ = im Hauptstand, noch nicht live) → fertig
create or replace function public.ws_einlesen_uebernehmen(p_id bigint, p_gruppen jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare e public.ws_einlesen; b text; g jsonb; f jsonb; gid text; slug text; n int := 0; r int := 0;
begin
  if not public.ws_ist_admin() then raise exception 'Gruppen übernimmt nur der Admin'; end if;
  select * into e from public.ws_einlesen where id = p_id for update;
  if e.id is null or e.stand not in ('vorschlag','wartet_ki') or e.projekt_id is null then raise exception 'Es gibt keinen Vorschlag zum Übernehmen'; end if;
  if not public.ws_einlesen_gruppen_ok(p_gruppen) then raise exception 'Ungültige Auswahl der Gruppen'; end if;
  select id into b from public.ws_bereiche where projekt_id = e.projekt_id and not global and (id = e.projekt_id || '-app' or name = 'App')
    order by (id = e.projekt_id || '-app') desc limit 1;
  if b is null and jsonb_array_length(p_gruppen->'gruppen') > 0 then raise exception 'Bereich „App“ fehlt im Projekt'; end if;
  for g in select * from jsonb_array_elements(p_gruppen->'gruppen') loop
    r := r + 1;
    slug := left(trim(both '-' from regexp_replace(replace(replace(replace(replace(lower(btrim(g->>'name')), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), '[^a-z0-9]+', '-', 'g')), 30);
    gid := e.projekt_id || '-' || coalesce(nullif(slug, ''), 'gruppe');
    while exists (select 1 from public.ws_gruppen where id = gid) loop gid := e.projekt_id || '-' || coalesce(nullif(slug, ''), 'gruppe') || '-' || substr(md5(random()::text), 1, 4); end loop;
    insert into public.ws_gruppen (id, bereich_id, name, symbol, reihenfolge, erstellt_von) values (gid, b, btrim(g->>'name'), 'layers', 10 + r, auth.uid());
    for f in select * from jsonb_array_elements(coalesce(g->'features','[]')) loop
      n := n + 1;
      insert into public.ws_features (id, gruppe_id, name, beschreibung, stand, quelle, neu_bis, erstellt_von)
      values ('N-' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || n, gid, btrim(f->>'name'), nullif(btrim(coalesce(f->>'beschreibung', '')), ''),
              'test', 'manuell', now() + interval '7 days', auth.uid());
    end loop;
  end loop;
  update public.ws_einlesen set stand = 'fertig', geaendert = now(), hinweis = null where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_fertig', jsonb_build_object('id', p_id, 'projekt', e.projekt_id, 'gruppen', r, 'features', n));
  return n;
end $$;

-- Admin: Vorgang vor dem Einlesen abbrechen (nach dem Einlesen gibt es Projekt und Repository – dann „ohne Gruppen abschließen“)
create or replace function public.ws_einlesen_abbrechen(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  update public.ws_einlesen set stand = 'abgebrochen', geaendert = now() where id = p_id and stand in ('pruefen','pruefung','geprueft','fehler') and projekt_id is null;
  if not found then
    update public.ws_einlesen set stand = 'abgebrochen', geaendert = now() where id = p_id and stand = 'fehler';
    if not found then raise exception 'Dieser Vorgang lässt sich nicht (mehr) abbrechen'; end if;
  end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'einlesen_abgebrochen', jsonb_build_object('id', p_id));
end $$;

revoke execute on function public.ws_einlesen_text_ok(text), public.ws_einlesen_gruppen_ok(jsonb) from public, anon;
grant execute on function public.ws_einlesen_text_ok(text), public.ws_einlesen_gruppen_ok(jsonb) to authenticated;
revoke execute on function public.ws_einlesen_anfordern(text, text, text), public.ws_einlesen_nehmen(uuid, text[]),
  public.ws_einlesen_melden(uuid, bigint, text, jsonb, jsonb, text, text), public.ws_einlesen_starten(bigint, text, jsonb),
  public.ws_einlesen_repo(uuid, bigint, text), public.ws_einlesen_uebernehmen(bigint, jsonb), public.ws_einlesen_abbrechen(bigint) from public, anon;
grant execute on function public.ws_einlesen_anfordern(text, text, text), public.ws_einlesen_nehmen(uuid, text[]),
  public.ws_einlesen_melden(uuid, bigint, text, jsonb, jsonb, text, text), public.ws_einlesen_starten(bigint, text, jsonb),
  public.ws_einlesen_repo(uuid, bigint, text), public.ws_einlesen_uebernehmen(bigint, jsonb), public.ws_einlesen_abbrechen(bigint) to authenticated;

commit;
