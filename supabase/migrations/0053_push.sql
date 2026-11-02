-- Codeschmiede · Datenbank 0053: Push-Nachricht aufs Handy (Befund L3 vom 01.11.2026, Regel AGENTS.md „Braucht Gerhard etwas zu bestätigen
-- oder zu tun: Push-Nachricht aufs Handy“). Plan: docs/KONZEPT.md › Push aufs Handy. Claude, Anweisung Gerhard 01.11.2026 22:18/22:38
-- („alles freigegeben, keine Rückfragen“), gebaut 02.11.2026.
--
-- Weg: Datenbank-Trigger (neue Erlaubnis-Anfrage, Rückfrage, Freigabe bereit, Station angehalten) → Zeile in ws_push_warteschlange
-- → Anstoß der Edge Function „push-senden“ über pg_net (ohne Inhalt, ohne Schlüssel) → die Funktion holt die Zeilen mit dem Dienst-Schlüssel,
-- verschlüsselt sie Ende-zu-Ende (RFC 8291, VAPID) und gibt sie dem Push-Dienst des Handys (Google/Apple/Mozilla/Microsoft).
-- Texte ohne Personendaten: nur Art, Auftragsnummer und Projektname („Trainer to go · Auftrag #12 wartet auf deine Erlaubnis“) –
-- nie Titel, Befehl, Nachrichtentext oder Namen.
-- Mehrfach ausführbar. Braucht 0001–0052.

begin;

-- ---------- Abos: ein Eintrag je Gerät (Browser/PWA) und Person ----------
create table if not exists public.ws_push_abos (
  id bigserial primary key,
  benutzer_id uuid not null references public.ws_benutzer(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  geraet text not null default 'Gerät',
  erstellt timestamptz not null default now(),
  zuletzt_ok timestamptz,
  fehler_zahl int not null default 0
);
create index if not exists ws_push_abos_benutzer on public.ws_push_abos (benutzer_id);
alter table public.ws_push_abos enable row level security;
drop policy if exists ws_push_abos_lesen on public.ws_push_abos;
create policy ws_push_abos_lesen on public.ws_push_abos for select to authenticated using (benutzer_id = auth.uid());
drop policy if exists ws_push_abos_loeschen on public.ws_push_abos;
create policy ws_push_abos_loeschen on public.ws_push_abos for delete to authenticated using (benutzer_id = auth.uid());
-- Anlegen/Ändern nur über ws_push_abo_speichern (prüft Adresse und Schlüssel)
revoke all on public.ws_push_abos from anon, authenticated;
grant select, delete on public.ws_push_abos to authenticated;

-- ---------- Warteschlange: nur die Edge Function (Dienst-Schlüssel) liest ----------
create table if not exists public.ws_push_warteschlange (
  id bigserial primary key,
  benutzer_id uuid not null references public.ws_benutzer(id) on delete cascade,
  art text not null check (art in ('erlaubnis','rueckfrage','freigabe','station','test')),
  titel text not null check (length(titel) <= 80),
  text text not null check (length(text) <= 160),
  url text not null default '/' check (url ~ '^/[A-Za-z0-9/?=&_.-]{0,120}$'),
  tag text not null check (length(tag) <= 60),
  erstellt timestamptz not null default now(),
  abgeholt timestamptz,
  erledigt timestamptz,
  gesendet int not null default 0,
  fehler text
);
create index if not exists ws_push_warteschlange_offen on public.ws_push_warteschlange (erstellt) where abgeholt is null;
alter table public.ws_push_warteschlange enable row level security;
-- keine Regel für anon/authenticated: niemand außer dem Dienst-Schlüssel sieht oder schreibt die Warteschlange
revoke all on public.ws_push_warteschlange from anon, authenticated;

-- ---------- Abo speichern (eigene Person) ----------
-- Nur bekannte Push-Dienste (Adresse https, fester Host), Schlüssel im Base64url-Format, höchstens 10 Geräte je Person.
create or replace function public.ws_push_dienst_ok(p_endpoint text) returns boolean
language sql immutable as $$
  select p_endpoint ~ '^https://[A-Za-z0-9.-]+(:443)?/[A-Za-z0-9/_.:%~+=?&-]+$'
     and lower(substring(p_endpoint from '^https://([A-Za-z0-9.-]+)')) ~ '^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$'
$$;

create or replace function public.ws_push_abo_speichern(p_endpoint text, p_p256dh text, p_auth text, p_geraet text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_geraet text;
begin
  if auth.uid() is null or not exists (select 1 from public.ws_benutzer where id = auth.uid() and aktiv) then raise exception 'Nicht angemeldet'; end if;
  if p_endpoint is null or length(p_endpoint) > 900 or not public.ws_push_dienst_ok(p_endpoint) then raise exception 'Unbekannter Push-Dienst'; end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' then raise exception 'Ungültiger Geräteschlüssel'; end if;
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then raise exception 'Ungültiger Geräteschlüssel'; end if;
  -- Gerätename nur grob (z. B. „iPhone“, „Android“, „Windows“) – keine Kennung
  v_geraet := left(regexp_replace(coalesce(nullif(trim(p_geraet), ''), 'Gerät'), '[^A-Za-zÄÖÜäöüß0-9 ._-]', '', 'g'), 40);
  if v_geraet = '' then v_geraet := 'Gerät'; end if;
  -- gehört die Adresse schon einer anderen Person (Gerät weitergegeben), wird sie nur mit denselben Geräteschlüsseln umgeschrieben
  -- (Review #60: wer nur die Adresse kennt, kann ein fremdes Gerät nicht auf sich umleiten)
  if exists (select 1 from public.ws_push_abos where endpoint = p_endpoint and benutzer_id <> auth.uid()
               and (p256dh <> p_p256dh or auth <> p_auth)) then
    raise exception 'Dieses Gerät ist schon für eine andere Person angemeldet';
  end if;
  delete from public.ws_push_abos where endpoint = p_endpoint and benutzer_id <> auth.uid();
  insert into public.ws_push_abos (benutzer_id, endpoint, p256dh, auth, geraet)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, v_geraet)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, geraet = excluded.geraet, fehler_zahl = 0
  returning id into v_id;
  if (select count(*) from public.ws_push_abos where benutzer_id = auth.uid()) > 10 then
    raise exception 'Höchstens 10 Geräte – bitte ein altes entfernen';
  end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'push_abo', jsonb_build_object('id', v_id, 'geraet', v_geraet));
  return v_id;
end $$;
revoke execute on function public.ws_push_abo_speichern(text, text, text, text) from public, anon;
grant execute on function public.ws_push_abo_speichern(text, text, text, text) to authenticated;

create or replace function public.ws_push_abo_loeschen(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ws_push_abos where endpoint = p_endpoint and benutzer_id = auth.uid();
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'push_abo_weg', null);
end $$;
revoke execute on function public.ws_push_abo_loeschen(text) from public, anon;
grant execute on function public.ws_push_abo_loeschen(text) to authenticated;

-- ---------- Anstoßen der Edge Function (pg_net, ohne Inhalt) ----------
-- Fehlt pg_net oder ist die Funktion noch nicht veröffentlicht, bleibt die Zeile liegen; die Funktion holt beim nächsten Anstoß alles nach.
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net nicht verfügbar – Push wartet in der Warteschlange (%).', sqlerrm;
end $$;

create or replace function public.ws_push_anstossen() returns void
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(url := 'https://mvzlbpijdvsjnemubofy.supabase.co/functions/v1/push-senden',
                          body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
  exception when others then null;   -- ohne pg_net: nichts tun (kein Fehler für den eigentlichen Vorgang)
  end;
end $$;
revoke execute on function public.ws_push_anstossen() from public, anon, authenticated;

-- ---------- Eintragen (nur aus Triggern und ws_push_test) ----------
create or replace function public.ws_push_eintragen(p_benutzer uuid, p_art text, p_titel text, p_text text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_benutzer is null then return; end if;
  if not exists (select 1 from public.ws_push_abos where benutzer_id = p_benutzer) then return; end if;   -- kein Gerät: nichts merken
  -- gleiche Meldung (Tag) an dieselbe Person höchstens alle 2 Minuten
  if exists (select 1 from public.ws_push_warteschlange where benutzer_id = p_benutzer and tag = p_tag and erstellt > now() - interval '2 minutes') then return; end if;
  insert into public.ws_push_warteschlange (benutzer_id, art, titel, text, url, tag)
  values (p_benutzer, p_art, left(p_titel, 80), left(p_text, 160), p_url, left(p_tag, 60));
end $$;
revoke execute on function public.ws_push_eintragen(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Wer darf im Bereich freigeben bzw. erlauben? Admin und Entwickler mit Recht „freigeben“ (wie ws_darf), nur aktive Konten;
-- Review #60: die Rolle IM PROJEKT muss „entwickler“ sein (nicht nur die Rolle im Konto)
create or replace function public.ws_push_freigeber(p_bereich text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from public.ws_benutzer b where b.aktiv and b.rolle = 'admin'
  union
  select b.id from public.ws_rechte r join public.ws_benutzer b on b.id = r.benutzer_id
   where r.bereich_id = p_bereich and r.freigeben and b.aktiv
     and exists (select 1 from public.ws_projekt_mitglieder m join public.ws_bereiche x on x.projekt_id = m.projekt_id
                  where x.id = p_bereich and m.benutzer_id = b.id and m.rolle = 'entwickler')
$$;
revoke execute on function public.ws_push_freigeber(text) from public, anon, authenticated;

-- Projektname als Kennzeichen (kein Personenbezug)
create or replace function public.ws_push_vorsatz(p_gruppe text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(left(p.name, 30) || ' · ', '') from public.ws_gruppen g join public.ws_bereiche b on b.id = g.bereich_id
    left join public.ws_projekte p on p.id = b.projekt_id where g.id = p_gruppe
$$;
revoke execute on function public.ws_push_vorsatz(text) from public, anon, authenticated;

-- ---------- Auslöser ----------
create or replace function public.ws_push_bei_erlaubnis() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; u uuid; n int := 0;
begin
  if new.status <> 'offen' then return new; end if;
  select * into a from public.ws_auftraege where id = new.auftrag_id;
  if a.id is null then return new; end if;
  for u in select * from public.ws_push_freigeber(public.ws_bereich_von_gruppe(a.gruppe_id)) loop
    perform public.ws_push_eintragen(u, 'erlaubnis', public.ws_push_vorsatz(a.gruppe_id) || 'Erlaubnis nötig',
      format('Auftrag #%s wartet auf deine Erlaubnis.', a.id), '/?ansicht=erledigen', format('erlaubnis-%s', a.id));
    n := n + 1;
  end loop;
  if n > 0 then perform public.ws_push_anstossen(); end if;
  return new;
exception when others then
  raise warning 'Push (Erlaubnis) nicht eingetragen: %', sqlerrm;   -- Push darf den eigentlichen Vorgang nie verhindern
  return new;
end $$;
drop trigger if exists ws_push_erlaubnis on public.ws_erlaubnisse;
create trigger ws_push_erlaubnis after insert on public.ws_erlaubnisse for each row execute function public.ws_push_bei_erlaubnis();

create or replace function public.ws_push_bei_auftrag() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; v text; st text; alt_erg text; neu_erg text; n int := 0;
begin
  v := public.ws_push_vorsatz(new.gruppe_id);
  if new.stand = 'frage' and old.stand is distinct from 'frage' then
    perform public.ws_push_eintragen(new.erstellt_von, 'rueckfrage', v || 'Rückfrage',
      format('Auftrag #%s hat eine Rückfrage an dich.', new.id), '/?ansicht=erledigen', format('frage-%s', new.id));
    n := n + 1;
  elsif new.stand = 'freigabe' and old.stand is distinct from 'freigabe' then
    for u in select * from public.ws_push_freigeber(public.ws_bereich_von_gruppe(new.gruppe_id)) loop
      perform public.ws_push_eintragen(u, 'freigabe', v || 'Freigabe',
        format('Auftrag #%s ist fertig und wartet auf deine Freigabe.', new.id), '/?ansicht=erledigen', format('freigabe-%s', new.id));
      n := n + 1;
    end loop;
  elsif new.stand in ('sicherheit', 'feature') then
    st := new.stand;
    neu_erg := new.pruefung -> st ->> 'ergebnis';
    alt_erg := case when old.stand = st then old.pruefung -> st ->> 'ergebnis' end;
    if neu_erg = 'angehalten' and alt_erg is distinct from 'angehalten' then
      for u in select * from public.ws_push_freigeber(public.ws_bereich_von_gruppe(new.gruppe_id)) loop
        perform public.ws_push_eintragen(u, 'station', v || 'Station angehalten',
          format('Auftrag #%s: %s angehalten – bitte „Erneut versuchen“.', new.id, case st when 'sicherheit' then 'Sicherheitsprüfung' else 'Feature-Prüfung' end),
          '/?ansicht=zentrale', format('station-%s-%s', new.id, st));
        n := n + 1;
      end loop;
    end if;
  end if;
  if n > 0 then perform public.ws_push_anstossen(); end if;
  return new;
exception when others then
  raise warning 'Push (Auftrag) nicht eingetragen: %', sqlerrm;
  return new;
end $$;
drop trigger if exists ws_push_auftrag on public.ws_auftraege;
create trigger ws_push_auftrag after update of stand, pruefung on public.ws_auftraege for each row execute function public.ws_push_bei_auftrag();

-- ---------- Test-Nachricht an die eigenen Geräte (Knopf „Test senden“), höchstens 1 je Minute ----------
create or replace function public.ws_push_test() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or not exists (select 1 from public.ws_benutzer where id = auth.uid() and aktiv) then raise exception 'Nicht angemeldet'; end if;
  select count(*) into n from public.ws_push_abos where benutzer_id = auth.uid();
  if n = 0 then raise exception 'Auf keinem Gerät erlaubt – zuerst „Auf diesem Gerät erlauben“'; end if;
  if exists (select 1 from public.ws_push_warteschlange where benutzer_id = auth.uid() and art = 'test' and erstellt > now() - interval '1 minute') then
    raise exception 'Gerade eben gesendet – in einer Minute wieder';
  end if;
  insert into public.ws_push_warteschlange (benutzer_id, art, titel, text, url, tag)
  values (auth.uid(), 'test', 'Codeschmiede', 'Test: Push-Nachrichten kommen auf diesem Gerät an.', '/', 'test');
  perform public.ws_push_anstossen();
  return n;
end $$;
revoke execute on function public.ws_push_test() from public, anon;
grant execute on function public.ws_push_test() to authenticated;

-- ---------- Für die Edge Function (nur Dienst-Schlüssel) ----------
-- Bremse (Review #60): höchstens ein Lauf je 2 Sekunden. Ergebnis 0 = jetzt laufen (Zeit gemerkt), sonst Sekunden bis zum nächsten erlaubten Lauf.
-- Die Funktion wartet diese Zeit und versucht es einmal neu – so bleibt keine Meldung liegen, deren Anstoß gebremst wurde.
create table if not exists public.ws_push_lauf (id int primary key default 1 check (id = 1), zuletzt timestamptz not null default 'epoch');
insert into public.ws_push_lauf (id) values (1) on conflict do nothing;
alter table public.ws_push_lauf enable row level security;
revoke all on public.ws_push_lauf from anon, authenticated;
create or replace function public.ws_push_bremse() returns numeric
language plpgsql security definer set search_path = public as $$
declare z timestamptz;
begin
  update public.ws_push_lauf set zuletzt = clock_timestamp() where id = 1 and zuletzt <= clock_timestamp() - interval '2 seconds';
  if found then return 0; end if;
  select zuletzt into z from public.ws_push_lauf where id = 1;
  return greatest(0.1, round(extract(epoch from (z + interval '2 seconds' - clock_timestamp()))::numeric, 2));
end $$;
revoke execute on function public.ws_push_bremse() from public, anon, authenticated;

-- Holt bis zu p_max offene Zeilen (sperrt sie, damit zwei Anstöße nichts doppelt senden), mit den Geräten der Person.
-- Räumt dabei auf: erledigte Zeilen nach 7 Tagen, hängende (abgeholt, nicht erledigt) nach 10 Minuten wieder frei, Abos mit 5 Fehlern in Folge.
create or replace function public.ws_push_abholen(p_max int default 50) returns table (id bigint, titel text, text text, url text, tag text, abos jsonb)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ws_push_warteschlange w where w.erstellt < now() - interval '7 days';
  delete from public.ws_push_abos a where a.fehler_zahl >= 5;
  update public.ws_push_warteschlange w set abgeholt = null where w.abgeholt < now() - interval '10 minutes' and w.erledigt is null and w.erstellt > now() - interval '1 hour';
  return query
  with z as (
    select w.id from public.ws_push_warteschlange w
     where w.abgeholt is null and w.erstellt > now() - interval '1 hour'   -- ältere Meldungen sind überholt
     order by w.id limit greatest(1, least(coalesce(p_max, 50), 200))
     for update skip locked),
  u as (update public.ws_push_warteschlange w set abgeholt = now() from z where w.id = z.id
        returning w.id, w.benutzer_id, w.titel, w.text, w.url, w.tag)
  select u.id, u.titel, u.text, u.url, u.tag,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth))
                     from public.ws_push_abos a join public.ws_benutzer b on b.id = a.benutzer_id
                    where a.benutzer_id = u.benutzer_id and b.aktiv), '[]'::jsonb)   -- Review #60: nur aktive Personen
    from u order by u.id;
end $$;

-- Ergebnis je Zeile und je Gerät: ok = zugestellt, weg = Gerät abgemeldet (404/410) → Abo löschen, sonst Fehler zählen
create or replace function public.ws_push_ergebnis(p_id bigint, p_gesendet int, p_fehler text, p_ok text[], p_weg text[], p_kaputt text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ws_push_warteschlange set erledigt = now(), gesendet = greatest(0, coalesce(p_gesendet, 0)), fehler = left(p_fehler, 300) where id = p_id;
  update public.ws_push_abos set zuletzt_ok = now(), fehler_zahl = 0 where endpoint = any (coalesce(p_ok, '{}'));
  delete from public.ws_push_abos where endpoint = any (coalesce(p_weg, '{}'));
  update public.ws_push_abos set fehler_zahl = fehler_zahl + 1 where endpoint = any (coalesce(p_kaputt, '{}'));
end $$;

revoke execute on function public.ws_push_abholen(int) from public, anon, authenticated;
revoke execute on function public.ws_push_ergebnis(bigint, int, text, text[], text[], text[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ws_push_abholen(int) to service_role;
    grant execute on function public.ws_push_bremse() to service_role;
    grant execute on function public.ws_push_ergebnis(bigint, int, text, text[], text[], text[]) to service_role;
    grant select, insert, update, delete on public.ws_push_warteschlange, public.ws_push_abos to service_role;
    grant usage on sequence public.ws_push_warteschlange_id_seq, public.ws_push_abos_id_seq to service_role;
  end if;
end $$;

commit;
