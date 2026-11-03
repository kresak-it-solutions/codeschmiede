-- Codeschmiede · Datenbank 0063: Regelwerk erzwingen (0.19.0) – Entscheidungen und Freigabe von Gerhard 03.11.2026
-- Grundlage: docs/ABGLEICH-REGELWERK-2026-11-03.md, Konzept docs/KONZEPT-REGELWERK-ERZWINGEN.md.
--
--   1 Phasen 1–12 je Projekt (ws_projekte.phase_frei = Zahl der freigegebenen Phasen, Protokoll ws_phasen_protokoll). Freigeben nur der Admin
--     (immer genau die nächste Phase, Begründung optional); Kurzfassung nach §16 nur mit Begründung (mind. 20 Zeichen), protokolliert.
--     Bestand (trainer-to-go, codeschmiede und alle mit Live-Stand) → Phase 10 „übernommen“; alle anderen und neue Projekte → Phase 1.
--     Eingelesene Projekte: die Werkstatt des Admins schlägt eine Phase vor (ws_phase_vorschlagen), der Admin bestätigt.
--   2 Phase-9-Sperre als Trigger auf ws_auftraege (alle Wege, auch SECURITY-DEFINER-Funktionen): ohne freigegebene Phase 9 wird ein
--     Bau-Auftrag abgelehnt („Bauen erst nach Freigabe von Phase 9 (Bauplan)“), ein Entwurf startet nicht und kein Auftrag geht in „laeuft“.
--     Ausnahme: Einrichtungs- und Doku-Aufträge (zweck einrichtung/doku), die nur der Admin über ws_einrichtung_auftrag anlegt und startet.
--   3 Erst Entwurf, dann Klick: jeder neue Auftrag außer Hand-Änderungen beginnt im Stand „entwurf“. Eine zweite KI (globale Aufgabe „kritik“)
--     prüft ihn kritisch (ws_kritik_nehmen / ws_kritik_melden); Gerhard entscheidet „Bauen“ (trotz Einwänden nur Admin, mit Begründung),
--     „Ändern“ oder „Verwerfen“ (ws_entwurf_entscheiden). Jede Entscheidung steht im Entscheidungsprotokoll ws_entscheidungen.
--   4 Steckbrief Pflicht für Bau-Vorschläge der KI: ziel, umfang, nicht (ausdrücklich nicht), abhaengig (Abhängigkeiten), abnahme.
--   5 Ideensammlung ws_ideen (klein/mittel/groß): Aufgaben und Features aus dem Gespräch landen dort automatisch, Spiegel nach docs/ideen.md
--     über den nächsten Bau-Auftrag (ws_doku_vormerken; nach „Live & Wissen“ als im Repository vermerkt). Gleiches für das Entscheidungsprotokoll.
--   6 Kernpflichten: begründete, vom Admin bestätigte Abweichungen je Projekt (ws_kernpflicht_abweichungen). Ampel-Lampen „doku“ und „kernpflichten“.
--   7 Nachschärfung (unabhängige Prüfung GELB, 03.11.2026): neue Nachrichten an Entwürfe → neue Kritik, „Bauen“ nur auf dem geprüften Text (Prüfsumme)
--     und nur durch den Admin; Kritik nie vom PC des Erstellers, KI nur aus der Zuständigkeit „kritik“; Einrichtungs-Aufträge ohne Nachrichten;
--     lange Antworten auf Rückfragen und Altbestand „wartet“ → Entwurf; Doku-Kennungen „E<id>“ nur bei Treffer im Repository; Abweichungen wirken.
-- Sicherheit: RLS auf allen neuen Tabellen, keine direkten Schreibrechte, alle Funktionen SECURITY DEFINER mit search_path, keine Rechte für
-- public und anon. Interne Freigaben (Entwurf starten, Kritik schreiben, zurück zum Entwurf, Einrichtung) stehen in der Tabelle ws_intern_token, die
-- nur diese Funktionen beschreiben (ws_intern_setzen ist für authenticated, anon und service_role nicht ausführbar) und die nur für die eigene
-- Transaktion gilt – kein Sitzungs-Schalter, den jemand selbst setzen könnte (Nachprüfung N1: der frühere set_config-Schalter war frei setzbar).
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0063. Test: supabase/tests/t50_regelwerk_erzwingen.sql. NICHT in einspielen.txt (Gerhard spielt ein).
-- Weichen: 0010/0012/0014/0015/0018/0020/0026/0048 setzen ws_vorschlag_ok, ws_konzept_ok, ws_konzept_auftraege_anlegen und ws_ki_reihe_ok beim erneuten
-- Einspielen nicht mehr auf die alte Fassung zurück (to_regclass('public.ws_phasen_protokoll')). Die Phase-9-Sperre und der Entwurf stehen im eigenen
-- Trigger ws_auftraege_regelwerk, den keine ältere Datei anfasst. Hinweise (nach erneutem Einspielen 0063 noch einmal einspielen): 0001/0002
-- (Policy ws_auftraege_neu – danach scheitert jedes Anlegen, schließt also dicht), 0005 (Stände ohne „entwurf“ – scheitert bei vorhandenen
-- Entwürfen), 0030/0034/0055/0056/0060 (Lampen ohne doku/kernpflichten – die Ampel-Meldung scheitert, keine Lampe wird grün).

begin;

-- ---------- 0. Interne Freigaben (Nachprüfung N1) ----------
-- Früher ein Sitzungs-Schalter (set_config) – den hätte jede angemeldete Person selbst setzen können. Jetzt eine Tabelle, in die NUR die
-- SECURITY-DEFINER-Funktionen dieser Datei schreiben (über ws_intern_setzen, für niemanden sonst ausführbar). Ein Eintrag gilt nur in der
-- Transaktion, die ihn geschrieben hat (txid_current()), und wird danach gelöscht bzw. mit der Transaktion verworfen.
drop function if exists public.ws_cs_intern();
create table if not exists public.ws_intern_token (
  tx bigint not null,
  schluessel text not null check (char_length(schluessel) <= 60),
  primary key (tx, schluessel)
);
alter table public.ws_intern_token enable row level security;   -- keine Policy: niemand außer den Eigentümer-Funktionen liest oder schreibt
revoke all on public.ws_intern_token from public, anon, authenticated;
create or replace function public.ws_intern_setzen(s text) returns void
language sql security definer set search_path = public as $$ insert into public.ws_intern_token (tx, schluessel) values (txid_current(), s) on conflict do nothing $$;
create or replace function public.ws_intern_weg(s text) returns void
language sql security definer set search_path = public as $$ delete from public.ws_intern_token where tx = txid_current() and schluessel = s $$;
create or replace function public.ws_intern_hat(s text) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.ws_intern_token where tx = txid_current() and schluessel = s) $$;
revoke execute on function public.ws_intern_setzen(text), public.ws_intern_weg(text), public.ws_intern_hat(text) from public, anon, authenticated;
do $$ begin
  execute 'revoke all on public.ws_intern_token from service_role';
  execute 'revoke execute on function public.ws_intern_setzen(text), public.ws_intern_weg(text), public.ws_intern_hat(text) from service_role';
exception when undefined_object then null; end $$;
delete from public.ws_intern_token;   -- Reste (es gibt keine – nur sicherheitshalber)

-- ---------- 1. Phasen ----------
alter table public.ws_projekte add column if not exists phase_frei smallint not null default 0;
alter table public.ws_projekte drop constraint if exists ws_projekte_phase_frei_check;
alter table public.ws_projekte add constraint ws_projekte_phase_frei_check check (phase_frei between 0 and 12);
alter table public.ws_projekte add column if not exists phase_vorschlag jsonb;
alter table public.ws_projekte drop constraint if exists ws_projekte_phase_vorschlag_check;
alter table public.ws_projekte add constraint ws_projekte_phase_vorschlag_check check (phase_vorschlag is null or (jsonb_typeof(phase_vorschlag) = 'object'
  and jsonb_typeof(phase_vorschlag -> 'phase') = 'number' and (phase_vorschlag ->> 'phase')::int between 1 and 12 and pg_column_size(phase_vorschlag) <= 2048));
-- ws_projekte hat nur Spalten-Rechte (0002/0005/0006/0007): phase_frei und phase_vorschlag sind für niemanden direkt änderbar.

create table if not exists public.ws_phasen_protokoll (
  id bigint generated always as identity primary key,
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  art text not null check (art in ('start','bestand','freigabe','kurzfassung','vorschlag','eingelesen')),
  von_phase smallint not null check (von_phase between 1 and 12),
  bis_phase smallint not null check (bis_phase between 1 and 12),
  begruendung text check (char_length(begruendung) <= 2000),
  wer uuid references auth.users(id) on delete set null,
  wann timestamptz not null default now(),
  check (bis_phase >= von_phase)
);
create index if not exists ws_phasen_protokoll_projekt on public.ws_phasen_protokoll (projekt_id, id);
alter table public.ws_phasen_protokoll enable row level security;
revoke all on public.ws_phasen_protokoll from public, anon, authenticated;
grant select on public.ws_phasen_protokoll to authenticated;
drop policy if exists ws_phasen_protokoll_lesen on public.ws_phasen_protokoll;
create policy ws_phasen_protokoll_lesen on public.ws_phasen_protokoll for select to authenticated using (public.ws_sieht_projekt(projekt_id));

-- Bauen erlaubt = Phase 9 (Bauplan) freigegeben – oder eine vom Admin bestätigte, protokollierte Abweichung „phasen“ (Prüfung 0.19.0, B3)
create or replace function public.ws_bau_erlaubt(p_projekt text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select p.phase_frei >= 9 from public.ws_projekte p where p.id = p_projekt), false)
      or (to_regclass('public.ws_kernpflicht_abweichungen') is not null
          and exists (select 1 from public.ws_kernpflicht_abweichungen a where a.projekt_id = p_projekt and a.pflicht = 'phasen'));
end $$;
revoke execute on function public.ws_bau_erlaubt(text) from public, anon;
grant execute on function public.ws_bau_erlaubt(text) to authenticated;

-- ---------- 2. Entscheidungsprotokoll ----------
create table if not exists public.ws_entscheidungen (
  id bigint generated always as identity primary key,
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  auftrag_id bigint references public.ws_auftraege(id) on delete set null,
  art text not null check (art in ('bauen','bauen_trotz','bauen_ohne_kritik','aendern','verwerfen','phase','kurzfassung','eingelesen','bestand','abweichung','abweichung_weg','idee')),
  text text not null check (char_length(text) between 1 and 2000),
  begruendung text check (char_length(begruendung) <= 2000),
  einwaende jsonb check (einwaende is null or (jsonb_typeof(einwaende) = 'array' and pg_column_size(einwaende) <= 16384)),
  wer uuid references auth.users(id) on delete set null,
  wann timestamptz not null default now(),
  vorgemerkt_auftrag bigint references public.ws_auftraege(id) on delete set null,
  im_repo boolean not null default false,
  im_repo_am timestamptz,
  im_diff_auftrag bigint,  -- Kennung „E<id>“ von der Sicherheitsprüfung im Diff dieses Auftrags gefunden (B1)
  text_sha text check (text_sha is null or text_sha ~ '^[0-9a-f]{64}$')   -- bei „Bauen“: Prüfsumme des freigegebenen Textes (N1)
);
alter table public.ws_entscheidungen add column if not exists text_sha text;
alter table public.ws_entscheidungen add column if not exists im_diff_auftrag bigint;
alter table public.ws_entscheidungen drop constraint if exists ws_entscheidungen_art_check;
alter table public.ws_entscheidungen add constraint ws_entscheidungen_art_check check (art in ('bauen','bauen_trotz','bauen_ohne_kritik','aendern','verwerfen','phase','kurzfassung','eingelesen','bestand','abweichung','abweichung_weg','idee'));
create index if not exists ws_entscheidungen_projekt on public.ws_entscheidungen (projekt_id, id);
create index if not exists ws_entscheidungen_offen on public.ws_entscheidungen (projekt_id) where not im_repo;
alter table public.ws_entscheidungen enable row level security;
revoke all on public.ws_entscheidungen from public, anon, authenticated;
grant select on public.ws_entscheidungen to authenticated;
drop policy if exists ws_entscheidungen_lesen on public.ws_entscheidungen;
create policy ws_entscheidungen_lesen on public.ws_entscheidungen for select to authenticated using (public.ws_sieht_projekt(projekt_id));

-- ---------- 3. Phasen freigeben (nur Admin) ----------
create or replace function public.ws_phase_freigeben(p_projekt text, p_phase int, p_begruendung text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; b text := nullif(btrim(coalesce(p_begruendung, '')), '');
begin
  if not public.ws_ist_admin() then raise exception 'Phasen gibt nur der Admin frei'; end if;
  select * into p from ws_projekte where id = p_projekt for update;
  if p.id is null or coalesce(p.archiviert, false) then raise exception 'Projekt nicht gefunden'; end if;
  if p.phase_frei >= 12 then raise exception 'Alle 12 Phasen sind schon freigegeben'; end if;
  if p_phase is distinct from p.phase_frei + 1 then raise exception 'Freigegeben wird immer die nächste Phase (jetzt Phase %)', p.phase_frei + 1; end if;
  if b is not null and (char_length(b) > 2000 or b ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then raise exception 'Ungültige Begründung'; end if;
  update ws_projekte set phase_frei = p_phase::smallint, phase_vorschlag = null where id = p.id;
  insert into ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung, wer) values (p.id, 'freigabe', p_phase, p_phase, b, auth.uid());
  insert into ws_entscheidungen (projekt_id, art, text, begruendung, wer)
    values (p.id, 'phase', format('Phase %s (%s) freigegeben', p_phase, public.ws_phase_name(p_phase)), b, auth.uid());
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'phase_freigegeben', jsonb_build_object('projekt', p.id, 'phase', p_phase, 'begruendung', b is not null));
end $$;

-- Namen der Phasen genau nach der Regeldatei (§1)
create or replace function public.ws_phase_name(p int) returns text
language sql immutable set search_path = public as $$
  select (array['Konzept','Kritische Prüfung','Designrichtung','Abläufe und Rollen','Datenschutz','Datenmodell','Technik',
                'Detaildesign mit dem Baukasten','Bauplan','Bauen','Test und Abnahme','Veröffentlichung und Pflege'])[p]
$$;
revoke execute on function public.ws_phase_name(int) from public, anon;
grant execute on function public.ws_phase_name(int) to authenticated;
revoke execute on function public.ws_phase_freigeben(text, int, text) from public, anon;
grant execute on function public.ws_phase_freigeben(text, int, text) to authenticated;

-- Kurzfassung (§16): mehrere Phasen auf einmal, nur als ausdrückliche, begründete Abweichung des Admins
create or replace function public.ws_phasen_kurzfassung(p_projekt text, p_bis int, p_begruendung text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; b text := btrim(coalesce(p_begruendung, ''));
begin
  if not public.ws_ist_admin() then raise exception 'Eine Kurzfassung gibt nur der Admin frei'; end if;
  select * into p from ws_projekte where id = p_projekt for update;
  if p.id is null or coalesce(p.archiviert, false) then raise exception 'Projekt nicht gefunden'; end if;
  if char_length(b) < 20 or char_length(b) > 2000 or b ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'Eine Kurzfassung braucht eine Begründung (mindestens 20 Zeichen)'; end if;
  if p_bis is null or p_bis > 12 or p_bis < p.phase_frei + 2 then
    raise exception 'Kurzfassung heißt: mindestens zwei Phasen zusammenlegen (ab Phase %, höchstens bis 12)', p.phase_frei + 1; end if;
  update ws_projekte set phase_frei = p_bis::smallint, phase_vorschlag = null where id = p.id;
  insert into ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung, wer) values (p.id, 'kurzfassung', p.phase_frei + 1, p_bis, b, auth.uid());
  insert into ws_entscheidungen (projekt_id, art, text, begruendung, wer)
    values (p.id, 'kurzfassung', format('Kurzfassung (§16): Phasen %s–%s zusammengelegt und freigegeben', p.phase_frei + 1, p_bis), b, auth.uid());
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'phasen_kurzfassung', jsonb_build_object('projekt', p.id, 'von', p.phase_frei + 1, 'bis', p_bis));
end $$;
revoke execute on function public.ws_phasen_kurzfassung(text, int, text) from public, anon;
grant execute on function public.ws_phasen_kurzfassung(text, int, text) to authenticated;

-- Eingelesene Projekte (0058): Vorschlag der Werkstatt des Admins (KI), Bestätigung durch den Admin
create or replace function public.ws_phase_vorschlagen(p_pc uuid, p_projekt text, p_phase int, p_grund text) returns void
language plpgsql security definer set search_path = public as $$
declare g text := left(btrim(regexp_replace(coalesce(p_grund, ''), '[\x01-\x1f\x7f]', ' ', 'g')), 600);
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an) then raise exception 'Nur vom eigenen, eingeschalteten Werkstatt-PC'; end if;
  if p_phase is null or p_phase not between 1 and 12 then raise exception 'Ungültige Phase'; end if;
  if not exists (select 1 from ws_einlesen e where e.projekt_id = p_projekt) then raise exception 'Vorschläge gibt es nur für eingelesene Projekte'; end if;
  if exists (select 1 from ws_phasen_protokoll x where x.projekt_id = p_projekt and x.art <> 'start' and x.art <> 'vorschlag') then
    raise exception 'Für dieses Projekt sind schon Phasen freigegeben'; end if;
  update ws_projekte set phase_vorschlag = jsonb_build_object('phase', p_phase, 'grund', g, 'am', now()) where id = p_projekt and phase_frei = 0;
  if not found then raise exception 'Projekt nicht gefunden oder schon über Phase 1 hinaus'; end if;
  insert into ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung, wer) values (p_projekt, 'vorschlag', p_phase, p_phase, nullif(g, ''), auth.uid());
end $$;
revoke execute on function public.ws_phase_vorschlagen(uuid, text, int, text) from public, anon;
grant execute on function public.ws_phase_vorschlagen(uuid, text, int, text) to authenticated;

create or replace function public.ws_phase_vorschlag_bestaetigen(p_projekt text, p_phase int default null, p_begruendung text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; n int; b text := nullif(btrim(coalesce(p_begruendung, '')), '');
begin
  if not public.ws_ist_admin() then raise exception 'Den Phasen-Vorschlag bestätigt nur der Admin'; end if;
  select * into p from ws_projekte where id = p_projekt for update;
  if p.id is null or p.phase_vorschlag is null then raise exception 'Kein Phasen-Vorschlag offen'; end if;
  n := coalesce(p_phase, (p.phase_vorschlag ->> 'phase')::int);
  if n not between 1 and 12 then raise exception 'Ungültige Phase'; end if;
  if b is not null and (char_length(b) > 2000 or b ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then raise exception 'Ungültige Begründung'; end if;
  update ws_projekte set phase_frei = (n - 1)::smallint, phase_vorschlag = null where id = p.id;
  insert into ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung, wer)
    values (p.id, 'eingelesen', 1, n, coalesce(b, nullif(p.phase_vorschlag ->> 'grund', '')), auth.uid());
  insert into ws_entscheidungen (projekt_id, art, text, begruendung, wer)
    values (p.id, 'eingelesen', format('Eingelesenes Projekt: Stand Phase %s (%s) bestätigt%s', n, public.ws_phase_name(n),
      case when n > 1 then format(', Phasen 1–%s als erledigt übernommen', n - 1) else '' end), coalesce(b, nullif(p.phase_vorschlag ->> 'grund', '')), auth.uid());
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'phase_vorschlag_bestaetigt', jsonb_build_object('projekt', p.id, 'phase', n, 'vorschlag', p.phase_vorschlag -> 'phase'));
end $$;
revoke execute on function public.ws_phase_vorschlag_bestaetigen(text, int, text) from public, anon;
grant execute on function public.ws_phase_vorschlag_bestaetigen(text, int, text) to authenticated;

-- Neue Projekte starten bei Phase 1 (auf jedem Weg, auf dem ein Projekt entsteht)
create or replace function public.ws_projekt_phase_start() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase_frei <> 0 then new.phase_frei := 0; end if;   -- nie mit freigegebenen Phasen anlegen
  return new;
end $$;
revoke execute on function public.ws_projekt_phase_start() from public, anon, authenticated;
drop trigger if exists ws_projekte_phase_start on public.ws_projekte;
create trigger ws_projekte_phase_start before insert on public.ws_projekte for each row execute function public.ws_projekt_phase_start();
create or replace function public.ws_projekt_phase_protokoll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung, wer) values (new.id, 'start', 1, 1, 'Neues Projekt – Start bei Phase 1', auth.uid());
  return new;
end $$;
revoke execute on function public.ws_projekt_phase_protokoll() from public, anon, authenticated;
drop trigger if exists ws_projekte_phase_protokoll on public.ws_projekte;
create trigger ws_projekte_phase_protokoll after insert on public.ws_projekte for each row execute function public.ws_projekt_phase_protokoll();

-- Bestand (nur Projekte, die noch nie im Phasen-Protokoll stehen – ein zweites Einspielen ändert nichts)
with bestand as (
  select p.id from public.ws_projekte p
   where not exists (select 1 from public.ws_phasen_protokoll x where x.projekt_id = p.id)
     and (p.id in ('trainer-to-go', 'codeschmiede') or p.live_url is not null or p.live_zweig
          or exists (select 1 from public.ws_auftraege a join public.ws_gruppen g on g.id = a.gruppe_id join public.ws_bereiche b on b.id = g.bereich_id
                      where b.projekt_id = p.id and a.stand = 'wissen'))
), gesetzt as (
  update public.ws_projekte p set phase_frei = 9 from bestand where p.id = bestand.id returning p.id
), protokoll as (
  insert into public.ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung)
  select id, 'bestand', 1, 9, 'Bestand, Phasen 1–9 nachträglich als erledigt übernommen 03.11.2026' from gesetzt returning projekt_id
)
insert into public.ws_entscheidungen (projekt_id, art, text, begruendung)
select projekt_id, 'bestand', 'Phase 10 – übernommen', 'Bestand, Phasen 1–9 nachträglich als erledigt übernommen 03.11.2026' from protokoll;
insert into public.ws_phasen_protokoll (projekt_id, art, von_phase, bis_phase, begruendung)
select p.id, 'start', 1, 1, 'Ohne Live-Stand – Start bei Phase 1 (0.19.0)' from public.ws_projekte p
 where not exists (select 1 from public.ws_phasen_protokoll x where x.projekt_id = p.id);

-- ---------- 4. Aufträge: Zweck, kritische Prüfung, Entwurf ----------
alter table public.ws_auftraege add column if not exists zweck text not null default 'bau';
alter table public.ws_auftraege drop constraint if exists ws_auftraege_zweck_check;
alter table public.ws_auftraege add constraint ws_auftraege_zweck_check check (zweck in ('bau','einrichtung','doku'));
alter table public.ws_auftraege add column if not exists kritik jsonb;
alter table public.ws_auftraege drop constraint if exists ws_auftraege_kritik_check;
alter table public.ws_auftraege add constraint ws_auftraege_kritik_check check (kritik is null or (jsonb_typeof(kritik) = 'object' and pg_column_size(kritik) <= 32768
  and kritik ->> 'stand' in ('wartet','laeuft','fertig','entfaellt')));
alter table public.ws_auftraege drop constraint if exists ws_auftraege_stand_check;
alter table public.ws_auftraege add constraint ws_auftraege_stand_check
  check (stand in ('entwurf','wartet','laeuft','frage','freigabe','sicherheit','zusammen','feature','wissen','nacharbeit','erledigt','abgebrochen'));

-- Anlegen von Hand: wie 0002, zusätzlich „entwurf“ (der Trigger unten macht aus jedem neuen Auftrag einen Entwurf; die Prüfung läuft danach)
drop policy if exists ws_auftraege_neu on public.ws_auftraege;
create policy ws_auftraege_neu on public.ws_auftraege for insert to authenticated
  with check (public.ws_darf(public.ws_bereich_von_gruppe(gruppe_id), 'auftraege') and erstellt_von = auth.uid()
              and stand in ('wartet','entwurf') and (public.ws_rolle_fuer_gruppe(gruppe_id) <> 'texter' or art = 'text')
              and zweig is null and pr_nummer is null and version is null and werkstatt_pc is null and modell is null
              and (ws_auftraege.feature_id is null
                   or public.ws_projekt_von_feature(ws_auftraege.feature_id) = public.ws_projekt_von_gruppe(ws_auftraege.gruppe_id)));

create or replace function public.ws_auftraege_regelwerk() returns trigger
language plpgsql security definer set search_path = public as $$
declare pj text := public.ws_projekt_von_gruppe(new.gruppe_id);
begin
  if tg_op = 'INSERT' then
    if new.zweck <> 'bau' and not public.ws_intern_hat('einrichtung') then
      raise exception 'Einrichtungs- und Doku-Aufträge legt nur der Admin über die Codeschmiede an'; end if;
    if new.kritik is not null then raise exception 'Die kritische Prüfung setzt nur die Codeschmiede'; end if;
    if new.zweck = 'bau' and not public.ws_bau_erlaubt(pj) then raise exception 'Bauen erst nach Freigabe von Phase 9 (Bauplan)'; end if;
    if new.stand not in ('wartet','entwurf') then raise exception 'Neue Aufträge beginnen als Entwurf'; end if;
    -- Hand-Änderungen (Code-Editor, ohne KI) gehen wie bisher direkt an die Werkstatt – alle anderen beginnen als Entwurf
    if coalesce(new.hand, false) then new.stand := 'wartet';
    else
      new.stand := 'entwurf';
      new.kritik := case when new.zweck = 'bau' then jsonb_build_object('stand', 'wartet', 'runde', 1)
                         else jsonb_build_object('stand', 'entfaellt', 'grund', 'Einrichtungs-Auftrag der Codeschmiede mit festem Text') end;
    end if;
    return new;
  end if;
  if new.zweck is distinct from old.zweck then raise exception 'Der Zweck eines Auftrags ändert sich nicht'; end if;
  if new.kritik is distinct from old.kritik and not public.ws_intern_hat('kritik:' || new.id) and not public.ws_intern_hat('entscheidung:' || new.id)
     and not public.ws_intern_hat('zurueck:' || new.id) then
    raise exception 'Die kritische Prüfung schreibt nur die Codeschmiede'; end if;
  if new.stand is distinct from old.stand then
    if new.stand = 'entwurf' and not public.ws_intern_hat('zurueck:' || new.id) then raise exception 'Ein Auftrag wird nicht wieder zum Entwurf'; end if;
    if old.stand = 'entwurf' and new.stand <> 'abgebrochen' and not public.ws_intern_hat('entscheidung:' || new.id) then
      raise exception 'Ein Entwurf startet erst nach der kritischen Prüfung mit dem Klick „Bauen“'; end if;
    if new.zweck = 'bau' and (new.stand = 'laeuft' or old.stand = 'entwurf' and new.stand = 'wartet') and not public.ws_bau_erlaubt(pj) then
      raise exception 'Bauen erst nach Freigabe von Phase 9 (Bauplan)'; end if;
    -- N2: Kam während des Laufs eine neue Nachricht einer Person, geht der Auftrag nach dem Lauf zurück auf Entwurf (neue Kritik)
    if old.stand = 'laeuft' and new.stand not in ('laeuft','abgebrochen') and coalesce((old.kritik ->> 'neu_nach_lauf')::boolean, false) then
      new.stand := 'entwurf'; new.werkstatt_pc := null;
      new.kritik := jsonb_build_object('stand', 'wartet', 'runde', coalesce((old.kritik ->> 'runde')::int, 1) + 1, 'grund', 'neuer Text während des Laufs');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.ws_auftraege_regelwerk() from public, anon, authenticated;
drop trigger if exists ws_auftraege_regelwerk on public.ws_auftraege;
create trigger ws_auftraege_regelwerk before insert or update on public.ws_auftraege for each row execute function public.ws_auftraege_regelwerk();

-- Altbestand (B2): Aufträge, die vor 0063 im Stand „wartet“ angelegt wurden (ohne Kritik), werden zu Entwürfen – außer Hand-Änderungen.
-- Ein zweites Einspielen findet nichts mehr (nach „Bauen“ tragen sie eine Kritik).
do $$
declare x record;
begin
  for x in select id from public.ws_auftraege where stand = 'wartet' and kritik is null and zweck = 'bau' and not coalesce(hand, false) loop
    perform public.ws_intern_setzen('zurueck:' || x.id);
    update public.ws_auftraege set stand = 'entwurf', kritik = jsonb_build_object('stand', 'wartet', 'runde', 1, 'grund', 'Altbestand vor 0.19.0') where id = x.id;
    perform public.ws_intern_weg('zurueck:' || x.id);
  end loop;
end $$;

-- ---------- 5. Kritische Prüfung (zweite KI, globale Aufgabe „kritik“) ----------
create or replace function public.ws_ki_reihe_ok(p_aufgabe text, r jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare e jsonb;
begin
  if p_aufgabe not in ('chat','konzept','design','pruefung','doku','texte','bilder','bauen','kritik') then return false; end if;
  if r is null or jsonb_typeof(r) <> 'array' or jsonb_array_length(r) not between 1 and 8 then return false; end if;
  for e in select * from jsonb_array_elements(r) loop
    if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('anbieter','modell')) then return false; end if;
    if (e->>'anbieter') is null or (e->>'anbieter') !~ '^[a-z][a-z0-9-]{1,30}$' then return false; end if;
    if e ? 'modell' and (jsonb_typeof(e->'modell') <> 'string' or (e->>'modell') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$') then return false; end if;
  end loop;
  if (select count(distinct x->>'anbieter') from jsonb_array_elements(r) x) <> jsonb_array_length(r) then return false; end if;
  if p_aufgabe = 'bauen' and not (r->0->>'anbieter' = 'claude' and (jsonb_array_length(r) = 1 or (jsonb_array_length(r) = 2 and r->1->>'anbieter' = 'chatgpt'))) then return false; end if;
  if p_aufgabe = 'pruefung' and not exists (select 1 from jsonb_array_elements(r) x where x->>'anbieter' = 'claude') then return false; end if;
  return true;
end $$;
revoke execute on function public.ws_ki_reihe_ok(text, jsonb) from public, anon;

-- Startwert „kritik“: ein anderer Anbieter als der für „bauen“ (aus der Prüf-Zuständigkeit), sonst die Prüf-Zuständigkeit. Nie überschreiben.
with bau as (
  select case coalesce((select werkzeug from public.ws_ki_zustaendigkeit_global where aufgabe = 'bauen'), 'claude-code')
           when 'codex' then 'chatgpt' when 'gemini-cli' then 'gemini' when 'opencode' then 'opencode' else 'claude' end anbieter
), pr as (
  select reihe from public.ws_ki_zustaendigkeit_global where aufgabe = 'pruefung'
), anders as (
  select jsonb_agg(x order by o) r from pr, bau, jsonb_array_elements(pr.reihe) with ordinality t(x, o) where x->>'anbieter' <> bau.anbieter
), neu as (
  insert into public.ws_ki_zustaendigkeit_global (aufgabe, reihe, weitergeben_ab, werkzeug, geaendert)
  select 'kritik', coalesce((select r from anders where r is not null), (select reihe from pr), '[{"anbieter":"claude","modell":"opus"}]'::jsonb), 90, 'claude-code', now()
  on conflict (aufgabe) do nothing returning reihe
)
insert into public.ws_protokoll (wer, was, details) select null, 'ki_global_start', jsonb_build_object('aufgabe', 'kritik', 'reihe', reihe) from neu;

-- Einwände: höchstens 12, je {art, text, schwere}
create or replace function public.ws_einwaende_ok(e jsonb) returns boolean
language sql immutable set search_path = public as $$
  select e is not null and jsonb_typeof(e) = 'array' and jsonb_array_length(e) <= 12 and not exists (
    select 1 from jsonb_array_elements(e) x
     where jsonb_typeof(x) <> 'object'
        or exists (select 1 from jsonb_object_keys(x) k where k not in ('art','text','schwere'))
        or coalesce(x->>'art', '') not in ('sinn','risiko','fehlt','widerspruch','phase','regel')
        or coalesce(x->>'schwere', '') not in ('hoch','mittel','niedrig')
        or jsonb_typeof(x->'text') is distinct from 'string' or char_length(x->>'text') not between 3 and 600
        or (x->>'text') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]')
$$;
revoke execute on function public.ws_einwaende_ok(jsonb) from public, anon;

-- Text eines Entwurfs (N4): alles, was gebaut wird – Nachrichten von Personen mit ihren Daten (z. B. Design-Werte), Anhänge der Aufgabe (Name und Art,
-- Bilder nur als „Bild: name“), Baustein und Bild-Vorlagen. p_bis: nur Nachrichten vor dieser Kennung (= Stand bei „Bauen“).
drop function if exists public.ws_entwurf_text(bigint);
drop function if exists public.ws_entwurf_text_sha(bigint);
create or replace function public.ws_entwurf_text(p_auftrag bigint, p_bis bigint default null) returns text
language sql stable security definer set search_path = public as $$
  select concat_ws(E'\n\n',
    (select string_agg(n.text
        || case when n.daten is not null then E'\n[Daten der Nachricht] ' || left(n.daten::text, 20000) else '' end
        || coalesce((select string_agg(case when x.art = 'bild' then E'\n[Bild: ' else E'\n[Anhang: ' end || x.dateiname || ' · ' || x.mime || ']', '' order by x.id)
             from public.ws_aufgabe_anhaenge x
            where jsonb_typeof(n.daten -> 'aufgabe' -> 'anhaenge') = 'array'
              and x.id in (select e::bigint from jsonb_array_elements_text(n.daten -> 'aufgabe' -> 'anhaenge') e where e ~ '^[0-9]{1,18}$')), ''),
        E'\n\n' order by n.id)
       from public.ws_nachrichten n where n.auftrag_id = p_auftrag and n.von is not null and (p_bis is null or n.id < p_bis)),
    (select '[Baustein] ' || left(a.baustein::text, 4000) from public.ws_auftraege a where a.id = p_auftrag and a.baustein is not null),
    (select string_agg('[Bild: ' || coalesce(b.dateiname, 'ohne Namen') || ']', E'\n' order by b.id) from public.ws_auftrag_bilder b where b.auftrag_id = p_auftrag))
$$;
revoke execute on function public.ws_entwurf_text(bigint, bigint) from public, anon, authenticated;
-- Prüfsumme über Text, Daten, Anhang-Liste und den Inhalt der Bild-Vorlagen
create or replace function public.ws_entwurf_text_sha(p_auftrag bigint, p_bis bigint default null) returns text
language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(public.ws_entwurf_text(p_auftrag, p_bis) || E'\u0001'
    || coalesce((select string_agg(encode(sha256(convert_to(b.bild, 'UTF8')), 'hex'), ',' order by b.id) from public.ws_auftrag_bilder b where b.auftrag_id = p_auftrag), ''), 'UTF8')), 'hex')
$$;
revoke execute on function public.ws_entwurf_text_sha(bigint, bigint) from public, anon, authenticated;

-- Nehmen (A3): nie der PC der Person, die den Entwurf angelegt hat – nur die Werkstatt einer anderen Person mit Werkstatt-Recht in der Gruppe
-- oder ein Admin-PC. Geliefert wird genau der Text, dessen Prüfsumme gemerkt wird (A1).
drop function if exists public.ws_kritik_nehmen(uuid);
create or replace function public.ws_kritik_nehmen(p_pc uuid) returns table (auftrag_id bigint, projekt_id text, text text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare a public.ws_auftraege; jetzt numeric := extract(epoch from now()); w public.ws_werkstatt_pcs; t text;
begin
  select * into w from ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an;
  if w.id is null then raise exception 'Nur vom eigenen, eingeschalteten Werkstatt-PC'; end if;
  select x.* into a from ws_auftraege x
   where x.stand = 'entwurf' and x.zweck = 'bau'
     and ((x.kritik ->> 'stand' = 'wartet' and coalesce((x.kritik ->> 'naechster_s')::numeric, 0) <= jetzt)
          or (x.kritik ->> 'stand' = 'laeuft' and coalesce((x.kritik ->> 'seit_s')::numeric, 0) < jetzt - 900))
     and ((w.admin_pc and public.ws_ist_admin()) or (x.erstellt_von is distinct from auth.uid() and public.ws_ist_werkstatt_fuer(x.gruppe_id)))
     and public.ws_sieht_projekt(public.ws_projekt_von_gruppe(x.gruppe_id))
     and exists (select 1 from ws_nachrichten n where n.auftrag_id = x.id and n.von is not null)
   order by x.id limit 1 for update skip locked;
  if a.id is null then return; end if;
  -- N4: die Kritik bekommt alles, was gebaut wird, dazu frühere Werkstatt-Nachrichten gekürzt; die Prüfsumme deckt Text, Daten und Anhänge ab
  t := public.ws_entwurf_text(a.id)
    || coalesce(E'

[Frühere Werkstatt-Nachrichten, gekürzt]
' || (select string_agg('- ' || n.art || ': ' || left(regexp_replace(n.text, '\s+', ' ', 'g'), 400), E'
' order by n.id)
         from (select w.* from ws_nachrichten w where w.auftrag_id = a.id and w.von is null and w.art in ('text','frage','ergebnis') order by w.id desc limit 10) n), '');
  perform public.ws_intern_setzen('kritik:' || a.id);
  update ws_auftraege set kritik = (kritik - 'wartet_auf' - 'naechster_s') || jsonb_build_object('stand', 'laeuft', 'pc', p_pc, 'seit_s', round(jetzt),
    'text_sha', public.ws_entwurf_text_sha(a.id)) where id = a.id;
  perform public.ws_intern_weg('kritik:' || a.id);
  return query select a.id, public.ws_projekt_von_gruppe(a.gruppe_id), t;
end $$;
revoke execute on function public.ws_kritik_nehmen(uuid) from public, anon;
grant execute on function public.ws_kritik_nehmen(uuid) to authenticated;

-- Melden: nur der PC, der die Prüfung genommen hat; KI nur aus der globalen Zuständigkeit „kritik“ (A3). ergebnis ok | einwaende | wartet
create or replace function public.ws_kritik_melden(p_pc uuid, p_auftrag bigint, p_ergebnis text, p_einwaende jsonb default '[]'::jsonb,
  p_ki text default null, p_hinweis text default null, p_regeln text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; h text := left(btrim(regexp_replace(coalesce(p_hinweis, ''), '[\x01-\x1f\x7f]', ' ', 'g')), 200);
begin
  if not exists (select 1 from ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an) then raise exception 'Nur vom eigenen, eingeschalteten Werkstatt-PC'; end if;
  select * into a from ws_auftraege where id = p_auftrag for update;
  if a.id is null or a.stand <> 'entwurf' or a.kritik ->> 'stand' <> 'laeuft' or a.kritik ->> 'pc' is distinct from p_pc::text then
    raise exception 'Diese kritische Prüfung läuft nicht auf diesem PC'; end if;
  if p_ergebnis not in ('ok','einwaende','wartet') then raise exception 'Ungültiges Ergebnis'; end if;
  perform public.ws_intern_setzen('kritik:' || a.id);
  if p_ergebnis = 'wartet' then
    update ws_auftraege set kritik = jsonb_build_object('stand', 'wartet', 'runde', coalesce((a.kritik ->> 'runde')::int, 1), 'wartet_auf', nullif(h, ''),
      'naechster_s', round(extract(epoch from now())) + 600) where id = a.id;
  else
    if not public.ws_einwaende_ok(p_einwaende) then raise exception 'Ungültige Einwände'; end if;
    if p_ergebnis = 'einwaende' and jsonb_array_length(p_einwaende) = 0 then raise exception 'Einwände fehlen'; end if;
    if p_ergebnis = 'ok' and exists (select 1 from jsonb_array_elements(p_einwaende) x where x->>'schwere' <> 'niedrig') then
      raise exception 'Mit Einwänden „hoch“ oder „mittel“ ist das Ergebnis „einwaende“'; end if;
    if p_ki is null or p_ki !~ '^[a-z][a-z0-9-]{1,30}(/[A-Za-z0-9][A-Za-z0-9._:-]{0,59})?$' then raise exception 'Ungültige KI-Kennung'; end if;
    if not exists (select 1 from ws_ki_zustaendigkeit_global g, jsonb_array_elements(g.reihe) e
                    where g.aufgabe = 'kritik' and e->>'anbieter' = split_part(p_ki, '/', 1)) then
      raise exception 'Diese KI ist für die kritische Prüfung nicht eingestellt'; end if;
    if p_regeln is not null and p_regeln !~ '^[0-9a-f]{64}$' then raise exception 'Ungültiger Regel-Stempel'; end if;
    update ws_auftraege set kritik = jsonb_build_object('stand', 'fertig', 'ergebnis', p_ergebnis, 'einwaende', p_einwaende, 'ki', p_ki, 'zeit', now(),
      'runde', coalesce((a.kritik ->> 'runde')::int, 1), 'regeln', p_regeln, 'text_sha', a.kritik ->> 'text_sha') where id = a.id;
  end if;
  perform public.ws_intern_weg('kritik:' || a.id);
end $$;
revoke execute on function public.ws_kritik_melden(uuid, bigint, text, jsonb, text, text, text) from public, anon;
grant execute on function public.ws_kritik_melden(uuid, bigint, text, jsonb, text, text, text) to authenticated;

-- Neue Nachrichten an Aufträge (A1, A2, N2, N3):
--   Einrichtungs-Aufträge: keine Nachrichten von Personen.
--   Entwurf: Kritik neu (neue Runde).  wartet (nach „Bauen“), nacharbeit, freigabe: zurück auf Entwurf mit neuer Kritik.
--   laeuft: Merker – nach dem Lauf geht der Auftrag zurück auf Entwurf (Trigger ws_auftraege_regelwerk).
--   frage: Antworten auf eine Rückfrage laufen weiter, solange ALLE Antworten seit der letzten Rückfrage zusammen höchstens 500 Zeichen haben
--   (dokumentierte Ausnahme); darüber zurück auf Entwurf mit neuer Kritik.  Hand-Änderungen und Altbestand ohne Kritik: unverändert.
create or replace function public.ws_nachricht_regelwerk() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; summe int; neu jsonb;
begin
  if new.von is null then return new; end if;
  select * into a from public.ws_auftraege where id = new.auftrag_id for update;
  if a.id is null then return new; end if;
  if a.zweck <> 'bau' then
    if not public.ws_intern_hat('einrichtung') then raise exception 'Einrichtungs-Aufträge haben einen festen Text – keine Nachrichten'; end if;
    return new;
  end if;
  if coalesce(a.hand, false) or a.kritik is null then return new; end if;
  neu := jsonb_build_object('stand', 'wartet', 'runde', coalesce((a.kritik ->> 'runde')::int, 1) + 1);
  if a.stand = 'entwurf' then
    if a.kritik ->> 'stand' <> 'wartet' then
      perform public.ws_intern_setzen('kritik:' || a.id);
      update public.ws_auftraege set kritik = neu || '{"grund":"neuer Text"}' where id = a.id;
      perform public.ws_intern_weg('kritik:' || a.id);
    end if;
  elsif a.stand in ('wartet','nacharbeit','freigabe') then
    perform public.ws_intern_setzen('zurueck:' || a.id);
    update public.ws_auftraege set stand = 'entwurf', werkstatt_pc = null, kritik = neu || jsonb_build_object('grund', format('neuer Text im Stand „%s“', a.stand)) where id = a.id;
    perform public.ws_intern_weg('zurueck:' || a.id);
  elsif a.stand = 'laeuft' then
    perform public.ws_intern_setzen('kritik:' || a.id);
    update public.ws_auftraege set kritik = kritik || '{"neu_nach_lauf":true}' where id = a.id;
    perform public.ws_intern_weg('kritik:' || a.id);
  elsif a.stand = 'frage' then
    select coalesce(sum(char_length(n.text)), 0) into summe from public.ws_nachrichten n
     where n.auftrag_id = a.id and n.von is not null
       and n.id > coalesce((select max(f.id) from public.ws_nachrichten f where f.auftrag_id = a.id and f.von is null and f.art = 'frage'), 0);
    if summe > 500 then
      perform public.ws_intern_setzen('zurueck:' || a.id);
      update public.ws_auftraege set stand = 'entwurf', werkstatt_pc = null, kritik = neu || '{"grund":"Antworten auf die Rückfrage über 500 Zeichen (neuer Umfang?)"}' where id = a.id;
      perform public.ws_intern_weg('zurueck:' || a.id);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.ws_nachricht_regelwerk() from public, anon, authenticated;
drop trigger if exists ws_nachrichten_regelwerk on public.ws_nachrichten;
create trigger ws_nachrichten_regelwerk after insert on public.ws_nachrichten for each row execute function public.ws_nachricht_regelwerk();

-- ---------- 6. Entscheidung am Entwurf: Bauen · Ändern · Verwerfen ----------
-- „Bauen“ nur der Admin (A3: Freigeben nur Gerhard); Entwickler: „Ändern“ oder „Verwerfen“. Bauen nur auf genau dem geprüften Text (Prüfsumme, A1).
-- Abweichung „kritik“ (B3): der Admin darf einen Entwurf auch ohne fertige Kritik bauen (protokolliert als bauen_ohne_kritik).
create or replace function public.ws_entwurf_entscheiden(p_auftrag bigint, p_entscheidung text, p_begruendung text default null, p_text text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; pj text; b text := nullif(btrim(coalesce(p_begruendung, '')), ''); t text := btrim(coalesce(p_text, ''));
        einw jsonb; trotz boolean; ohne boolean := false; e_art text; v_sha text; v_frei bigint;
begin
  select * into a from ws_auftraege where id = p_auftrag for update;
  if a.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  pj := public.ws_projekt_von_gruppe(a.gruppe_id);
  if not public.ws_darf(public.ws_bereich_von_gruppe(a.gruppe_id), 'auftraege') or not (a.erstellt_von = auth.uid() or public.ws_ist_admin()) then
    raise exception 'Über den Entwurf entscheidet, wer ihn angelegt hat (oder der Admin)'; end if;
  if a.stand <> 'entwurf' then raise exception 'Der Auftrag ist kein Entwurf mehr'; end if;
  if b is not null and (char_length(b) > 2000 or b ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]') then raise exception 'Ungültige Begründung'; end if;
  einw := coalesce(a.kritik -> 'einwaende', '[]'::jsonb);
  perform public.ws_intern_setzen('entscheidung:' || a.id);
  if p_entscheidung = 'bauen' then
    if not public.ws_ist_admin() then raise exception '„Bauen“ gibt nur der Admin frei – du kannst den Entwurf ändern oder verwerfen'; end if;
    if a.kritik ->> 'stand' not in ('fertig','entfaellt') then
      if a.zweck = 'bau' and exists (select 1 from ws_kernpflicht_abweichungen x where x.projekt_id = pj and x.pflicht = 'kritik') then
        ohne := true;
        if b is null or char_length(b) < 10 then raise exception 'Bauen ohne kritische Prüfung (Abweichung „kritik“) braucht eine Begründung (mindestens 10 Zeichen)'; end if;
      else raise exception 'Die kritische Prüfung ist noch nicht fertig – „Bauen“ geht erst danach'; end if;
    end if;
    if a.zweck = 'bau' and not ohne and a.kritik ->> 'text_sha' is distinct from public.ws_entwurf_text_sha(a.id) then
      raise exception 'Der Text hat sich seit der kritischen Prüfung geändert – sie läuft neu'; end if;
    trotz := not ohne and a.kritik ->> 'ergebnis' = 'einwaende' and jsonb_array_length(einw) > 0;
    if trotz and (b is null or char_length(b) < 10) then raise exception 'Bauen trotz Einwänden braucht eine Begründung (mindestens 10 Zeichen)'; end if;
    if a.zweck = 'bau' and not public.ws_bau_erlaubt(pj) then raise exception 'Bauen erst nach Freigabe von Phase 9 (Bauplan)'; end if;
    e_art := case when ohne then 'bauen_ohne_kritik' when trotz then 'bauen_trotz' else 'bauen' end;
    v_sha := case when a.zweck = 'bau' then public.ws_entwurf_text_sha(a.id) end;
    insert into ws_nachrichten (auftrag_id, von, art, text) values (a.id, null, 'system',
      case when ohne then 'Entwurf freigegeben: Bauen ohne kritische Prüfung – Begründung: ' || b
           when trotz then 'Entwurf freigegeben: Bauen trotz Einwänden – Begründung: ' || b else 'Entwurf freigegeben: Bauen' end) returning id into v_frei;
    update ws_auftraege set stand = 'wartet', geaendert = now(),
      kritik = kritik || jsonb_build_object('entscheidung', e_art, 'von', auth.uid(), 'am', now(), 'begruendung', b, 'freigabe_nachricht', v_frei, 'freigabe_sha', v_sha)
     where id = a.id;
    insert into ws_entscheidungen (projekt_id, auftrag_id, art, text, begruendung, einwaende, wer, text_sha)
      values (pj, a.id, e_art,
              format('Auftrag #%s „%s“: Bauen%s', a.id, left(a.titel, 80), case when ohne then ' ohne kritische Prüfung (bestätigte Abweichung „kritik“)'
                when trotz then format(' trotz %s Einwand/Einwänden', jsonb_array_length(einw)) else '' end),
              b, case when jsonb_array_length(einw) > 0 then einw end, auth.uid(), v_sha);
  elsif p_entscheidung = 'aendern' then
    if a.zweck <> 'bau' then raise exception 'Einrichtungs-Aufträge haben einen festen Text'; end if;
    if char_length(t) < 10 or char_length(t) > public.ws_text_max() then raise exception 'Bitte die Änderung beschreiben (mindestens 10 Zeichen)'; end if;
    if t ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]' then raise exception 'Ungültige Zeichen in der Änderung'; end if;
    insert into ws_nachrichten (auftrag_id, von, art, text, kanal) values (a.id, auth.uid(), 'text', 'Änderung am Entwurf: ' || t, 'codeschmiede');   -- Trigger: Kritik neu
    insert into ws_entscheidungen (projekt_id, auftrag_id, art, text, begruendung, einwaende, wer)
      values (pj, a.id, 'aendern', format('Auftrag #%s „%s“: Entwurf geändert – neue kritische Prüfung', a.id, left(a.titel, 80)), coalesce(b, left(t, 2000)),
              case when jsonb_array_length(einw) > 0 then einw end, auth.uid());
  elsif p_entscheidung = 'verwerfen' then
    update ws_auftraege set stand = 'abgebrochen', geaendert = now() where id = a.id;
    insert into ws_entscheidungen (projekt_id, auftrag_id, art, text, begruendung, einwaende, wer)
      values (pj, a.id, 'verwerfen', format('Auftrag #%s „%s“: Entwurf verworfen', a.id, left(a.titel, 80)), b, case when jsonb_array_length(einw) > 0 then einw end, auth.uid());
  else raise exception 'Unbekannte Entscheidung'; end if;
  perform public.ws_intern_weg('entscheidung:' || a.id);
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'entwurf_' || p_entscheidung, jsonb_build_object('auftrag', a.id, 'projekt', pj, 'einwaende', jsonb_array_length(einw)));
end $$;
revoke execute on function public.ws_entwurf_entscheiden(bigint, text, text, text) from public, anon;
grant execute on function public.ws_entwurf_entscheiden(bigint, text, text, text) to authenticated;

-- Gibt es zu diesem Auftrag eine echte Freigabe? (Dienst vor dem Start, Prüf-Station): Zeile „bauen…“ im Entscheidungsprotokoll, deren Prüfsumme
-- dem Text bis zur Freigabe-Nachricht entspricht. Hand-Änderungen: immer; Einrichtung: Zeile „bauen“ vorhanden.
create or replace function public.ws_auftrag_freigabe_ok(p_auftrag bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a public.ws_auftraege; e public.ws_entscheidungen;
begin
  select * into a from ws_auftraege where id = p_auftrag;
  if a.id is null or not public.ws_sieht_projekt(public.ws_projekt_von_gruppe(a.gruppe_id)) then return false; end if;
  if coalesce(a.hand, false) then return true; end if;
  select * into e from ws_entscheidungen x where x.auftrag_id = a.id and x.art in ('bauen','bauen_trotz','bauen_ohne_kritik') order by x.id desc limit 1;
  if e.id is null or a.kritik is null or a.kritik ->> 'entscheidung' is null then return false; end if;
  if a.zweck <> 'bau' then return true; end if;
  return e.text_sha is not null and e.text_sha = a.kritik ->> 'freigabe_sha'
     and e.text_sha = public.ws_entwurf_text_sha(a.id, (a.kritik ->> 'freigabe_nachricht')::bigint);
end $$;
revoke execute on function public.ws_auftrag_freigabe_ok(bigint) from public, anon;
grant execute on function public.ws_auftrag_freigabe_ok(bigint) to authenticated;

-- Werkstatt-Update (wie 0005): zusätzlich „entwurf“ – nur, damit der Rücksprung nach einem Lauf mit neuer Nachricht (N2) gelingt;
-- selbst setzen kann die Werkstatt „entwurf“ nicht (Trigger ws_auftraege_regelwerk verlangt die interne Freigabe).
drop policy if exists ws_auftraege_werkstatt on public.ws_auftraege;
create policy ws_auftraege_werkstatt on public.ws_auftraege for update to authenticated
  using (public.ws_ist_werkstatt_fuer(gruppe_id))
  with check (public.ws_ist_werkstatt_fuer(gruppe_id)
              and stand in ('entwurf','wartet','laeuft','frage','freigabe','sicherheit','zusammen','feature','wissen','nacharbeit','erledigt','abgebrochen'));

-- ---------- 7. Einrichtungs-Auftrag „Doku-Gerüst anlegen“ (nur Admin; startet wie jeder Entwurf erst mit „Bauen“) ----------
create or replace function public.ws_doku_geruest_text() returns text
language sql immutable set search_path = public as $$
  select E'Einrichtung „Doku-Gerüst anlegen“ (Codeschmiede 0.19.0, Pflicht nach §15 von Gerhards Regeldatei).\n'
    || E'Lege im Repository die fehlenden Dateien des Doku-Gerüsts an – vorhandene Dateien NIE überschreiben oder kürzen, nur fehlende neu anlegen:\n'
    || E'- docs/01-konzept.md\n- docs/02-pruefung.md\n- docs/03-designrichtung.md\n- docs/04-ablaeufe-rollen.md\n- docs/05-datenschutz.md\n'
    || E'- docs/06-datenmodell.md\n- docs/07-technik.md\n- docs/08-design/ (Ordner mit LIESMICH.md: Baukasten und Bildschirmentwürfe)\n- docs/09-bauplan.md\n'
    || E'- docs/entscheidungen.md\n- docs/ideen.md\n- docs/fehler.md\n- docs/versionen.md\n- docs/stand.md\n'
    || E'Jede neue Phasen-Datei bekommt die Überschrift der Phase und die Pflichtpunkte aus der Regeldatei als Gliederung. Fasse vorhandenes Wissen '
    || E'(docs/KONZEPT.md, docs/CHANGELOG.md, AGENTS.md) kurz zusammen und verweise darauf, statt es zu kopieren. docs/stand.md: wo das Projekt steht, '
    || E'was als Nächstes kommt, was offen ist. Nur Dokumentation – kein Code, keine Einstellungen, keine Abläufe ändern.'
$$;
revoke execute on function public.ws_doku_geruest_text() from public, anon;
grant execute on function public.ws_doku_geruest_text() to authenticated;   -- fester Text, den der Dienst für Einrichtungs-Aufträge nimmt (A2)

create or replace function public.ws_einrichtung_gruppe(p_projekt text) returns text
language sql stable security definer set search_path = public as $$
  select g.id from public.ws_gruppen g join public.ws_bereiche b on b.id = g.bereich_id join public.ws_projekte p on p.id = b.projekt_id
   where b.projekt_id = p_projekt and g.id is distinct from p.konzept_gruppe_id and g.id is distinct from p.design_gruppe_id and g.id is distinct from p.db_gruppe_id
   order by coalesce(b.global, false) desc, g.id limit 1
$$;
revoke execute on function public.ws_einrichtung_gruppe(text) from public, anon, authenticated;

create or replace function public.ws_einrichtung_auftrag(p_projekt text, p_art text default 'doku_geruest') returns bigint
language plpgsql security definer set search_path = public as $$
declare g text; n bigint;
begin
  if not public.ws_ist_admin() then raise exception 'Einrichtungs-Aufträge legt nur der Admin an'; end if;
  if p_art is distinct from 'doku_geruest' then raise exception 'Unbekannte Einrichtung'; end if;
  if not exists (select 1 from ws_projekte where id = p_projekt and not coalesce(archiviert, false)) then raise exception 'Projekt nicht gefunden'; end if;
  if exists (select 1 from ws_auftraege a where a.zweck = 'einrichtung' and a.titel = 'Doku-Gerüst anlegen' and public.ws_projekt_von_gruppe(a.gruppe_id) = p_projekt
              and a.stand not in ('abgebrochen','erledigt','wissen')) then raise exception 'Für dieses Projekt ist schon ein Auftrag „Doku-Gerüst anlegen“ offen'; end if;
  g := public.ws_einrichtung_gruppe(p_projekt);
  if g is null then raise exception 'Das Projekt hat noch keine Gruppe für den Auftrag'; end if;
  perform public.ws_intern_setzen('einrichtung');
  insert into ws_auftraege (gruppe_id, titel, art, zweck, erstellt_von) values (g, 'Doku-Gerüst anlegen', 'aendern', 'einrichtung', auth.uid()) returning id into n;
  perform public.ws_intern_weg('einrichtung');
  insert into ws_nachrichten (auftrag_id, von, art, text, kanal) values (n, null, 'system', public.ws_doku_geruest_text(), 'codeschmiede');   -- Systemtext, nicht von Gerhard
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'einrichtung_auftrag', jsonb_build_object('projekt', p_projekt, 'auftrag', n, 'art', p_art));
  return n;
end $$;
revoke execute on function public.ws_einrichtung_auftrag(text, text) from public, anon;
grant execute on function public.ws_einrichtung_auftrag(text, text) to authenticated;

-- Bestand: je Projekt mit Repository einmal den Entwurf „Doku-Gerüst anlegen“ (als der Admin; gestartet wird er erst mit „Bauen“)
do $$
declare p record; adm uuid; g text; n bigint;
begin
  select b.id into adm from public.ws_benutzer b where b.rolle = 'admin' and b.aktiv and exists (select 1 from auth.users u where u.id = b.id) order by b.id limit 1;
  if adm is null then return; end if;
  for p in select x.id from public.ws_projekte x where x.repo is not null and not coalesce(x.archiviert, false) and x.phase_frei >= 9 loop
    if exists (select 1 from public.ws_auftraege a where a.zweck = 'einrichtung' and a.titel = 'Doku-Gerüst anlegen' and public.ws_projekt_von_gruppe(a.gruppe_id) = p.id) then continue; end if;
    g := public.ws_einrichtung_gruppe(p.id); if g is null then continue; end if;
    perform public.ws_intern_setzen('einrichtung');
    insert into public.ws_auftraege (gruppe_id, titel, art, zweck, erstellt_von) values (g, 'Doku-Gerüst anlegen', 'aendern', 'einrichtung', adm) returning id into n;
    perform public.ws_intern_weg('einrichtung');
    insert into public.ws_nachrichten (auftrag_id, von, art, text, kanal) values (n, null, 'system', public.ws_doku_geruest_text(), 'codeschmiede');
    insert into public.ws_protokoll (wer, was, details) values (null, 'einrichtung_auftrag', jsonb_build_object('projekt', p.id, 'auftrag', n, 'art', 'doku_geruest', 'quelle', '0063'));
  end loop;
end $$;

-- ---------- 8. Steckbrief Pflicht (ziel, umfang, ausdrücklich nicht, Abhängigkeiten, Abnahme) ----------
create or replace function public.ws_konzept_ok(k jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare key text;
begin
  if k is null then return true; end if;
  if jsonb_typeof(k) <> 'object' then return false; end if;
  for key in select jsonb_object_keys(k) loop
    if key in ('ziel','umfang','datenschutz') then
      if jsonb_typeof(k->key) <> 'string' or char_length(k->>key) > 2000 then return false; end if;
    elsif key in ('entscheidungen','offen','abnahme','nicht','abhaengig') then
      if jsonb_typeof(k->key) <> 'array' or jsonb_array_length(k->key) > 20
         or exists (select 1 from jsonb_array_elements(k->key) x where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') > 500) then return false; end if;
    else return false; end if;
  end loop;
  return true;
end $$;
revoke execute on function public.ws_konzept_ok(jsonb) from public, anon;

create or replace function public.ws_steckbrief_ok(k jsonb) returns boolean
language sql immutable set search_path = public as $$
  select public.ws_konzept_ok(k) and jsonb_typeof(k) = 'object'
     and char_length(btrim(coalesce(k->>'ziel', ''))) >= 3 and char_length(btrim(coalesce(k->>'umfang', ''))) >= 3
     and jsonb_typeof(k->'nicht') = 'array' and jsonb_array_length(k->'nicht') >= 1
     and jsonb_typeof(k->'abhaengig') = 'array' and jsonb_array_length(k->'abhaengig') >= 1
     and jsonb_typeof(k->'abnahme') = 'array' and jsonb_array_length(k->'abnahme') >= 1
     and not exists (select 1 from jsonb_array_elements_text(k->'nicht') x where char_length(btrim(x)) < 2)
     and not exists (select 1 from jsonb_array_elements_text(k->'abhaengig') x where char_length(btrim(x)) < 2)
     and not exists (select 1 from jsonb_array_elements_text(k->'abnahme') x where char_length(btrim(x)) < 3)
$$;
revoke execute on function public.ws_steckbrief_ok(jsonb) from public, anon;

create or replace function public.ws_vorschlag_ok(p_projekt text, v jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare x jsonb; o jsonb;
begin
  if v is null then return true; end if;
  if jsonb_typeof(v) <> 'object' then return false; end if;
  if v ? 'fragen' then
    if exists (select 1 from jsonb_object_keys(v) k where k <> 'fragen') or jsonb_typeof(v->'fragen') <> 'array'
       or jsonb_array_length(v->'fragen') not between 1 and 4 then return false; end if;
    for x in select * from jsonb_array_elements(v->'fragen') loop
      if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('frage','optionen')) then return false; end if;
      if coalesce(jsonb_typeof(x->'frage'), '') <> 'string' or char_length(x->>'frage') not between 3 and 300 then return false; end if;
      if coalesce(jsonb_typeof(x->'optionen'), '') <> 'array' or jsonb_array_length(x->'optionen') not between 2 and 5 then return false; end if;
      for o in select * from jsonb_array_elements(x->'optionen') loop
        if jsonb_typeof(o) <> 'string' or char_length(o #>> '{}') not between 1 and 120 then return false; end if;
      end loop;
    end loop;
    return true;
  end if;
  -- mehrere Aufträge (Konzept-Gespräch): 1–5, ohne offene Punkte, je mit vollständigem Steckbrief (0063)
  if v ? 'auftraege' then
    if exists (select 1 from jsonb_object_keys(v) k where k <> 'auftraege') or jsonb_typeof(v->'auftraege') <> 'array'
       or jsonb_array_length(v->'auftraege') not between 1 and 5 then return false; end if;
    for x in select * from jsonb_array_elements(v->'auftraege') loop
      if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('gruppe_id','feature_id','titel','text','konzept')) then return false; end if;
      if not (x ? 'gruppe_id') or not public.ws_vorschlag_ok(p_projekt, x) then return false; end if;
      if jsonb_typeof(x->'konzept') = 'object' and jsonb_typeof(x->'konzept'->'offen') = 'array' and jsonb_array_length(x->'konzept'->'offen') > 0 then return false; end if;
    end loop;
    return true;
  end if;
  if v ? 'wissen' then
    if exists (select 1 from jsonb_object_keys(v) k where k <> 'wissen') or jsonb_typeof(v->'wissen') <> 'object'
       or exists (select 1 from jsonb_object_keys(v->'wissen') k where k not in ('kapitel','text')) then return false; end if;
    if coalesce(jsonb_typeof(v->'wissen'->'kapitel'), '') <> 'string' or coalesce(jsonb_typeof(v->'wissen'->'text'), '') <> 'string' then return false; end if;
    return (v->'wissen'->>'kapitel') in ('ziel','funktionen','daten','design','ablauf','offen','sonstiges')
       and char_length(v->'wissen'->>'text') between 3 and 2000;
  end if;
  if v ? 'feature_neu' then
    if exists (select 1 from jsonb_object_keys(v) k where k <> 'feature_neu') or jsonb_typeof(v->'feature_neu') <> 'object'
       or exists (select 1 from jsonb_object_keys(v->'feature_neu') k where k not in ('gruppe_id','name','beschreibung')) then return false; end if;
    if coalesce(jsonb_typeof(v->'feature_neu'->'gruppe_id'), '') <> 'string' or coalesce(jsonb_typeof(v->'feature_neu'->'name'), '') <> 'string' then return false; end if;
    if char_length(v->'feature_neu'->>'name') not between 2 and 80 or char_length(coalesce(v->'feature_neu'->>'beschreibung','')) > 1000 then return false; end if;
    return public.ws_projekt_von_gruppe(v->'feature_neu'->>'gruppe_id') is not distinct from p_projekt and not public.ws_ist_konzept_gruppe(v->'feature_neu'->>'gruppe_id');
  end if;
  if v ? 'bezug' then
    if exists (select 1 from jsonb_object_keys(v) k where k <> 'bezug') or jsonb_typeof(v->'bezug') <> 'object'
       or exists (select 1 from jsonb_object_keys(v->'bezug') k where k not in ('von','zu')) then return false; end if;
    return exists (select 1 from public.ws_features a join public.ws_features b on b.id = v->'bezug'->>'zu'
                   where a.id = v->'bezug'->>'von' and a.id <> b.id
                     and public.ws_projekt_von_gruppe(a.gruppe_id) = p_projekt and public.ws_projekt_von_gruppe(b.gruppe_id) = p_projekt);
  end if;
  -- ein Auftrag: Steckbrief Pflicht (0063) – solange Fragen offen sind, darf er unvollständig sein (Freigabe ist dann ohnehin gesperrt)
  if exists (select 1 from jsonb_object_keys(v) k where k not in ('gruppe_id','feature_id','titel','text','konzept')) then return false; end if;
  if coalesce(jsonb_typeof(v->'gruppe_id'), '') <> 'string' or coalesce(jsonb_typeof(v->'titel'), '') <> 'string' or coalesce(jsonb_typeof(v->'text'), '') <> 'string' then return false; end if;
  if char_length(v->>'titel') not between 3 and 80 or char_length(v->>'text') not between 10 and 8000 then return false; end if;
  if public.ws_projekt_von_gruppe(v->>'gruppe_id') is distinct from p_projekt or public.ws_ist_konzept_gruppe(v->>'gruppe_id') then return false; end if;
  if v ? 'feature_id' and v->'feature_id' <> 'null'::jsonb then
    if jsonb_typeof(v->'feature_id') <> 'string' or not exists (select 1 from public.ws_features f where f.id = v->>'feature_id' and f.gruppe_id = v->>'gruppe_id') then return false; end if;
  end if;
  if not public.ws_konzept_ok(v->'konzept') then return false; end if;
  if not coalesce(jsonb_typeof(v->'konzept'->'offen') = 'array' and jsonb_array_length(v->'konzept'->'offen') > 0, false)
     and not coalesce(public.ws_steckbrief_ok(v->'konzept'), false) then return false; end if;
  return true;
end $$;
revoke execute on function public.ws_vorschlag_ok(text, jsonb) from public, anon, authenticated;

-- Aufträge aus dem Konzept-Gespräch: wie 0048, aber als ENTWURF (Trigger) und mit dem ganzen Steckbrief im Text
create or replace function public.ws_konzept_auftraege_anlegen(p_antwort bigint) returns bigint[]
language plpgsql security definer set search_path = public as $$
declare a public.ws_claude_chat; f public.ws_claude_chat; x jsonb; k jsonb; ids bigint[] := '{}'; neu bigint; t text; n int;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into a from ws_claude_chat where id = p_antwort and frage_id is not null for update;
  if a.id is null or a.vorschlag is null or not (a.vorschlag ? 'auftraege') then raise exception 'Kein Auftrags-Vorschlag'; end if;
  if a.entscheidung is not null then return coalesce((select array_agg(e::bigint) from jsonb_array_elements_text(a.vorschlag->'angelegt') e), '{}'); end if;
  select * into f from ws_claude_chat where id = a.frage_id;
  if f.von is distinct from auth.uid() then raise exception 'Nur wer gefragt hat, legt die Aufträge an'; end if;
  if f.ort is distinct from 'konzept' then raise exception 'Aufträge legt die KI nur im Konzept-Gespräch selbst an'; end if;
  if not public.ws_darf_fragen(f.projekt_id) then raise exception 'Kein Zugriff mehr auf dieses Projekt'; end if;
  if exists (select 1 from ws_projekte where id = f.projekt_id and coalesce(archiviert, false)) then raise exception 'Das Projekt ist archiviert'; end if;
  if not public.ws_bau_erlaubt(f.projekt_id) then raise exception 'Bauen erst nach Freigabe von Phase 9 (Bauplan)'; end if;
  if not public.ws_vorschlag_ok(f.projekt_id, a.vorschlag) then raise exception 'Der Vorschlag passt nicht mehr zum Projekt (Gruppe, Feature oder Steckbrief)'; end if;
  n := jsonb_array_length(a.vorschlag->'auftraege');
  perform pg_advisory_xact_lock(hashtext('konzept_auftrag:' || auth.uid()::text));
  if (select count(*) from ws_protokoll where wer = auth.uid() and was = 'konzept_auftrag' and wann > now() - interval '1 hour') + n > 15 then
    raise exception 'Höchstens 15 Aufträge je Stunde aus dem Konzept – bitte später „Entwürfe anlegen“ klicken'; end if;
  for x in select * from jsonb_array_elements(a.vorschlag->'auftraege') loop
    if not public.ws_darf(public.ws_bereich_von_gruppe(x->>'gruppe_id'), 'auftraege') then
      raise exception 'Keine Berechtigung für Aufträge in der Gruppe %', x->>'gruppe_id'; end if;
    if (x->>'titel') ~ '[[:cntrl:]​-‏‪-‮  ⁦-⁩﻿]'
       or (x->>'text') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f​-‏‪-‮  ⁦-⁩﻿]'
       or coalesce(x->>'konzept', '') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f​-‏‪-‮  ⁦-⁩﻿]' then
      raise exception 'Ungültige Zeichen im Auftrag „%“', left(x->>'titel', 40); end if;
    k := x->'konzept';
    t := x->>'text';
    if jsonb_typeof(k) = 'object' then
      t := t || E'\n\n## Steckbrief (Konzept-Gespräch, ' || to_char(now() at time zone 'Europe/Vienna', 'DD.MM.YYYY') || ')'
        || coalesce(E'\n**Ziel:** ' || (k->>'ziel'), '') || coalesce(E'\n**Umfang:** ' || (k->>'umfang'), '') || coalesce(E'\n**Datenschutz:** ' || (k->>'datenschutz'), '')
        || coalesce(E'\n**Ausdrücklich nicht:**\n' || (select string_agg('- ' || e, E'\n') from jsonb_array_elements_text(case when jsonb_typeof(k->'nicht') = 'array' then k->'nicht' else '[]' end) e), '')
        || coalesce(E'\n**Abhängigkeiten:**\n' || (select string_agg('- ' || e, E'\n') from jsonb_array_elements_text(case when jsonb_typeof(k->'abhaengig') = 'array' then k->'abhaengig' else '[]' end) e), '')
        || coalesce(E'\n**Entscheidungen:**\n' || (select string_agg('- ' || e, E'\n') from jsonb_array_elements_text(case when jsonb_typeof(k->'entscheidungen') = 'array' then k->'entscheidungen' else '[]' end) e), '')
        || coalesce(E'\n**Abnahme (Fertig-Kriterien inkl. Fehlerfälle):**\n' || (select string_agg('- ' || e, E'\n') from jsonb_array_elements_text(case when jsonb_typeof(k->'abnahme') = 'array' then k->'abnahme' else '[]' end) e), '')
        || E'\n\nLege dieses Konzept zusätzlich als docs/konzepte/' || to_char(now(), 'YYYY-MM-DD') || '-'
        || coalesce(nullif(left(btrim(regexp_replace(lower(x->>'titel'), '[^a-z0-9]+', '-', 'g'), '-'), 40), ''), 'konzept') || '.md im Projekt ab (mit dem Bau-PR).';
    end if;
    t := t || E'\n\n(Aus dem Konzept-Gespräch als Entwurf angelegt – Chat-Antwort #' || a.id || E'. Gebaut wird erst nach der kritischen Prüfung und dem Klick „Bauen“.)';
    insert into ws_auftraege (gruppe_id, feature_id, titel, art, erstellt_von)
      values (x->>'gruppe_id', nullif(x->>'feature_id', ''), left(x->>'titel', 80),
              case when public.ws_rolle_fuer_gruppe(x->>'gruppe_id') = 'texter' then 'text' else 'aendern' end, auth.uid())
      returning id into neu;
    insert into ws_nachrichten (auftrag_id, von, art, text, kanal) values (neu, auth.uid(), 'text', left(t, 8000), 'codeschmiede');
    insert into ws_protokoll (wer, was, details) values (auth.uid(), 'konzept_auftrag', jsonb_build_object('projekt', f.projekt_id, 'antwort', a.id, 'auftrag', neu));
    ids := ids || neu;
  end loop;
  update ws_claude_chat set entscheidung = 'uebernommen', auftrag_id = ids[1], vorschlag = vorschlag || jsonb_build_object('angelegt', to_jsonb(ids)), geaendert = now() where id = a.id;
  return ids;
end $$;
revoke all on function public.ws_konzept_auftraege_anlegen(bigint) from public, anon;
grant execute on function public.ws_konzept_auftraege_anlegen(bigint) to authenticated;

-- ---------- 9. Ideensammlung (§11) ----------
create table if not exists public.ws_ideen (
  id bigint generated always as identity primary key,
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  titel text not null check (char_length(btrim(titel)) between 3 and 120 and titel !~ '[\x01-\x1f\x7f]'),
  text text not null default '' check (char_length(text) <= 4000 and text !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  einstufung text not null default 'klein' check (einstufung in ('klein','mittel','gross')),
  herkunft text not null check (herkunft in ('feature_neu','aufgabe','wunsch')),
  stand text not null default 'offen' check (stand in ('offen','freigegeben','verworfen','umgesetzt')),
  vermerk text check (char_length(vermerk) <= 1000),
  feature_id text references public.ws_features(id) on delete set null,
  aufgabe_id bigint references public.ws_aufgaben(id) on delete set null,
  von uuid references auth.users(id) on delete set null,
  erstellt timestamptz not null default now(),
  geaendert timestamptz not null default now(),
  vorgemerkt_auftrag bigint references public.ws_auftraege(id) on delete set null,
  im_repo boolean not null default false
);
create index if not exists ws_ideen_projekt on public.ws_ideen (projekt_id, id);
create unique index if not exists ws_ideen_aufgabe on public.ws_ideen (aufgabe_id) where aufgabe_id is not null;
create unique index if not exists ws_ideen_feature on public.ws_ideen (feature_id) where feature_id is not null and herkunft = 'feature_neu';
alter table public.ws_ideen enable row level security;
revoke all on public.ws_ideen from public, anon, authenticated;
grant select on public.ws_ideen to authenticated;
drop policy if exists ws_ideen_lesen on public.ws_ideen;
create policy ws_ideen_lesen on public.ws_ideen for select to authenticated using (public.ws_sieht_projekt(projekt_id));

create or replace function public.ws_idee_anlegen(p_projekt text, p_titel text, p_text text default '', p_einstufung text default 'klein') returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not public.ws_darf_fragen(p_projekt) then raise exception 'Keine Berechtigung für dieses Projekt'; end if;
  if p_einstufung not in ('klein','mittel','gross') then raise exception 'Einstufung: klein, mittel oder groß'; end if;
  insert into ws_ideen (projekt_id, titel, text, einstufung, herkunft, von) values (p_projekt, btrim(p_titel), coalesce(p_text, ''), p_einstufung, 'wunsch', auth.uid()) returning id into n;
  return n;
end $$;
revoke execute on function public.ws_idee_anlegen(text, text, text, text) from public, anon;
grant execute on function public.ws_idee_anlegen(text, text, text, text) to authenticated;

-- Einstufen, Prüfvermerk („Braucht das wirklich jemand?“), Stand. Freigeben/Verwerfen/Umgesetzt nur der Admin (ins Entscheidungsprotokoll).
create or replace function public.ws_idee_aendern(p_id bigint, p_einstufung text default null, p_stand text default null, p_vermerk text default null) returns void
language plpgsql security definer set search_path = public as $$
declare i public.ws_ideen; v text := nullif(btrim(coalesce(p_vermerk, '')), '');
begin
  select * into i from ws_ideen where id = p_id for update;
  if i.id is null or not public.ws_sieht_projekt(i.projekt_id) then raise exception 'Idee nicht gefunden'; end if;
  if not (public.ws_ist_admin() or (i.von = auth.uid() and public.ws_darf_fragen(i.projekt_id))) then raise exception 'Ideen ändert, wer sie angelegt hat (oder der Admin)'; end if;
  if p_einstufung is not null and p_einstufung not in ('klein','mittel','gross') then raise exception 'Einstufung: klein, mittel oder groß'; end if;
  if p_stand is not null and p_stand not in ('offen','freigegeben','verworfen','umgesetzt') then raise exception 'Unbekannter Stand'; end if;
  if p_stand is not null and p_stand <> i.stand and not public.ws_ist_admin() then raise exception 'Ideen gibt nur der Admin frei'; end if;
  if v is not null and (char_length(v) > 1000 or v ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then raise exception 'Ungültiger Vermerk'; end if;
  update ws_ideen set einstufung = coalesce(p_einstufung, einstufung), stand = coalesce(p_stand, stand), vermerk = coalesce(v, vermerk), geaendert = now(),
    im_repo = case when coalesce(p_stand, stand) <> stand or coalesce(p_einstufung, einstufung) <> einstufung then false else im_repo end
   where id = i.id;
  if p_stand is not null and p_stand <> i.stand then
    insert into ws_entscheidungen (projekt_id, art, text, begruendung, wer)
      values (i.projekt_id, 'idee', format('Idee #%s „%s“ (%s): %s', i.id, left(i.titel, 80), coalesce(p_einstufung, i.einstufung), p_stand), v, auth.uid());
  end if;
end $$;
revoke execute on function public.ws_idee_aendern(bigint, text, text, text) from public, anon;
grant execute on function public.ws_idee_aendern(bigint, text, text, text) to authenticated;

-- Aufgaben und Features aus dem Gespräch (FEATURE-NEU) landen automatisch in der Ideensammlung
create or replace function public.ws_idee_aus_aufgabe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ws_ideen (projekt_id, titel, text, einstufung, herkunft, aufgabe_id, feature_id, von)
  values (new.projekt_id, left(rpad(btrim(new.titel), 3, '.'), 120), left(coalesce(new.beschreibung, ''), 4000), 'klein', 'aufgabe', new.id, null, new.erstellt_von)
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.ws_idee_aus_aufgabe() from public, anon, authenticated;
drop trigger if exists ws_aufgaben_idee on public.ws_aufgaben;
create trigger ws_aufgaben_idee after insert on public.ws_aufgaben for each row execute function public.ws_idee_aus_aufgabe();

create or replace function public.ws_idee_aus_feature() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quelle is distinct from 'gespraech' then return new; end if;
  insert into public.ws_ideen (projekt_id, titel, text, einstufung, herkunft, feature_id, von)
  values (public.ws_projekt_von_gruppe(new.gruppe_id), left(rpad(btrim(new.name), 3, '.'), 120), left(coalesce(new.beschreibung, ''), 4000), 'mittel', 'feature_neu', new.id, new.erstellt_von)
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.ws_idee_aus_feature() from public, anon, authenticated;
drop trigger if exists ws_features_idee on public.ws_features;
create trigger ws_features_idee after insert on public.ws_features for each row execute function public.ws_idee_aus_feature();

-- ---------- 10. Spiegel ins Repository: Entscheidungen und Ideen beim nächsten Bau-Auftrag (nie direkt auf main) ----------
create or replace function public.ws_doku_vormerken(p_pc uuid, p_auftrag bigint, p_entscheidungen bigint[] default '{}', p_ideen bigint[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; pj text;
begin
  if not exists (select 1 from ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an) then raise exception 'Nur vom eigenen, eingeschalteten Werkstatt-PC'; end if;
  select * into a from ws_auftraege where id = p_auftrag;
  if a.id is null or a.stand <> 'laeuft' or a.werkstatt_pc is distinct from p_pc or not public.ws_ist_werkstatt_fuer(a.gruppe_id) then
    raise exception 'Dieser Auftrag läuft nicht auf diesem PC'; end if;
  if coalesce(array_length(p_entscheidungen, 1), 0) > 50 or coalesce(array_length(p_ideen, 1), 0) > 50 then raise exception 'Höchstens 50 Einträge je Auftrag'; end if;
  pj := public.ws_projekt_von_gruppe(a.gruppe_id);
  -- Nie einem anderen, noch offenen Auftrag wegnehmen
  update ws_entscheidungen e set vorgemerkt_auftrag = a.id where e.projekt_id = pj and not e.im_repo and e.id = any (coalesce(p_entscheidungen, '{}'))
     and (e.vorgemerkt_auftrag is null or e.vorgemerkt_auftrag = a.id or not exists (select 1 from ws_auftraege x where x.id = e.vorgemerkt_auftrag and x.stand not in ('abgebrochen','erledigt','wissen')));
  update ws_ideen i set vorgemerkt_auftrag = a.id where i.projekt_id = pj and not i.im_repo and i.id = any (coalesce(p_ideen, '{}'))
     and (i.vorgemerkt_auftrag is null or i.vorgemerkt_auftrag = a.id or not exists (select 1 from ws_auftraege x where x.id = i.vorgemerkt_auftrag and x.stand not in ('abgebrochen','erledigt','wissen')));
end $$;
revoke execute on function public.ws_doku_vormerken(uuid, bigint, bigint[], bigint[]) from public, anon;
grant execute on function public.ws_doku_vormerken(uuid, bigint, bigint[], bigint[]) to authenticated;

-- Gefunden (B1): die Sicherheitsprüfung (Werkstatt des Admins) meldet, welche Kennungen „E<id>“/„I<id>“ sie in den neuen Zeilen gefunden hat
alter table public.ws_ideen add column if not exists im_diff_auftrag bigint;
create or replace function public.ws_doku_gefunden(p_pc uuid, p_auftrag bigint, p_entscheidungen bigint[] default '{}', p_ideen bigint[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege;
begin
  if not public.ws_ist_admin() or not exists (select 1 from ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an and admin_pc) then
    raise exception 'Nur die Werkstatt des Admins (Prüf-Station)'; end if;
  select * into a from ws_auftraege where id = p_auftrag;
  if a.id is null or a.stand <> 'sicherheit' then raise exception 'Der Auftrag ist nicht in der Sicherheitsprüfung'; end if;
  if coalesce(array_length(p_entscheidungen, 1), 0) > 50 or coalesce(array_length(p_ideen, 1), 0) > 50 then raise exception 'Höchstens 50 Einträge je Auftrag'; end if;
  update ws_entscheidungen set im_diff_auftrag = a.id where vorgemerkt_auftrag = a.id and id = any (coalesce(p_entscheidungen, '{}'));
  update ws_ideen set im_diff_auftrag = a.id where vorgemerkt_auftrag = a.id and id = any (coalesce(p_ideen, '{}'));
end $$;
revoke execute on function public.ws_doku_gefunden(uuid, bigint, bigint[], bigint[]) from public, anon;
grant execute on function public.ws_doku_gefunden(uuid, bigint, bigint[], bigint[]) to authenticated;

create or replace function public.ws_doku_im_repo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stand = 'wissen' and old.stand is distinct from 'wissen' then
    -- nur, was im Diff wirklich gefunden wurde (nicht pauschal alles Vorgemerkte)
    update public.ws_entscheidungen set im_repo = true, im_repo_am = now() where vorgemerkt_auftrag = new.id and im_diff_auftrag = new.id and not im_repo;
    update public.ws_ideen set im_repo = true where vorgemerkt_auftrag = new.id and im_diff_auftrag = new.id and not im_repo;
  elsif new.stand = 'nacharbeit' and old.stand is distinct from 'nacharbeit' then
    -- Nacharbeit: der Diff ändert sich – Gefunden-Meldung verwerfen, die nächste Sicherheitsprüfung meldet neu
    update public.ws_entscheidungen set im_diff_auftrag = null where im_diff_auftrag = new.id;
    update public.ws_ideen set im_diff_auftrag = null where im_diff_auftrag = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.ws_doku_im_repo() from public, anon, authenticated;
drop trigger if exists ws_auftraege_doku_im_repo on public.ws_auftraege;
create trigger ws_auftraege_doku_im_repo after update of stand on public.ws_auftraege for each row execute function public.ws_doku_im_repo();

-- ---------- 11. Kernpflichten: begründete, bestätigte Abweichungen je Projekt ----------
create table if not exists public.ws_kernpflicht_abweichungen (
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  pflicht text not null check (pflicht in ('phasen','doku','kritik','regelpruefung')),
  begruendung text not null check (char_length(begruendung) between 20 and 2000),
  von uuid references auth.users(id) on delete set null,
  am timestamptz not null default now(),
  primary key (projekt_id, pflicht)
);
alter table public.ws_kernpflicht_abweichungen enable row level security;
revoke all on public.ws_kernpflicht_abweichungen from public, anon, authenticated;
grant select on public.ws_kernpflicht_abweichungen to authenticated;
drop policy if exists ws_kernpflicht_abweichungen_lesen on public.ws_kernpflicht_abweichungen;
create policy ws_kernpflicht_abweichungen_lesen on public.ws_kernpflicht_abweichungen for select to authenticated using (public.ws_sieht_projekt(projekt_id));

create or replace function public.ws_abweichung_bestaetigen(p_projekt text, p_pflicht text, p_begruendung text) returns void
language plpgsql security definer set search_path = public as $$
declare b text := btrim(coalesce(p_begruendung, ''));
begin
  if not public.ws_ist_admin() then raise exception 'Abweichungen von Kernpflichten bestätigt nur der Admin'; end if;
  if p_pflicht not in ('phasen','doku','kritik','regelpruefung') then raise exception 'Unbekannte Kernpflicht'; end if;
  if not exists (select 1 from ws_projekte where id = p_projekt) then raise exception 'Projekt nicht gefunden'; end if;
  if char_length(b) < 20 or char_length(b) > 2000 or b ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Eine Abweichung braucht eine Begründung (mindestens 20 Zeichen)'; end if;
  insert into ws_kernpflicht_abweichungen (projekt_id, pflicht, begruendung, von, am) values (p_projekt, p_pflicht, b, auth.uid(), now())
  on conflict (projekt_id, pflicht) do update set begruendung = excluded.begruendung, von = excluded.von, am = excluded.am;
  insert into ws_entscheidungen (projekt_id, art, text, begruendung, wer) values (p_projekt, 'abweichung', format('Abweichung von der Kernpflicht „%s“ bestätigt', p_pflicht), b, auth.uid());
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'kernpflicht_abweichung', jsonb_build_object('projekt', p_projekt, 'pflicht', p_pflicht));
end $$;
revoke execute on function public.ws_abweichung_bestaetigen(text, text, text) from public, anon;
grant execute on function public.ws_abweichung_bestaetigen(text, text, text) to authenticated;

create or replace function public.ws_abweichung_aufheben(p_projekt text, p_pflicht text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Abweichungen hebt nur der Admin auf'; end if;
  delete from ws_kernpflicht_abweichungen where projekt_id = p_projekt and pflicht = p_pflicht;
  if not found then raise exception 'Keine bestätigte Abweichung'; end if;
  insert into ws_entscheidungen (projekt_id, art, text, wer) values (p_projekt, 'abweichung_weg', format('Abweichung von der Kernpflicht „%s“ aufgehoben – die Kernpflicht gilt wieder', p_pflicht), auth.uid());
  insert into ws_protokoll (wer, was, details) values (auth.uid(), 'kernpflicht_abweichung_weg', jsonb_build_object('projekt', p_projekt, 'pflicht', p_pflicht));
end $$;
revoke execute on function public.ws_abweichung_aufheben(text, text) from public, anon;
grant execute on function public.ws_abweichung_aufheben(text, text) to authenticated;

-- ---------- 12. Ampel: Lampen „doku“ (Doku vollständig) und „kernpflichten“ ----------
create or replace function public.ws_anbindungen_ok(w jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(w) = 'object' and not exists (
    select 1 from jsonb_each(w) e
     where e.key not in ('github','pruefung','testseite','build','signatur','sandbox','datenbank','datenbank_live','testlauf','fehler','projektordner','regeln','sicherungen','setup','dokument','doku','kernpflichten')
        or jsonb_typeof(e.value) <> 'object'
        or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('stand','text'))
        or coalesce(e.value ->> 'stand', '') not in ('gruen','gelb','rot','grau')
        or jsonb_typeof(e.value -> 'text') is distinct from 'string'
        or char_length(e.value ->> 'text') > 200)
$$;

-- ---------- 13. Live-Abgleich in der Oberfläche ----------
do $$ begin
  begin alter publication supabase_realtime add table public.ws_phasen_protokoll; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ws_entscheidungen; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ws_ideen; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ws_kernpflicht_abweichungen; exception when others then null; end;
end $$;

commit;
