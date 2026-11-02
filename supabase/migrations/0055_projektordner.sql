-- Codeschmiede · Datenbank 0055: Projektordner, Regeln und Ein-Klick-Anbindungen (Entwurf 1.0 „Projektordner“, freigegeben von Gerhard
-- 02.11.2026 07:04, docs/entwurf-1.0-projektordner.html, Konzept docs/KONZEPT-PROJEKTORDNER.md).
--   * Pfade der Projektordner stehen NIE in der Datenbank (je PC verschieden) – sie liegen in der lokalen Einstellung des Programms.
--     Hier steht je Werkstatt-PC und Projekt nur der STAND für die Anzeige (ok · fehlt · kein · umzug · umzug_wartet · fehler) und die Zahl der
--     erkannten Regel-Konflikte. Hinweise sind feste Texte ohne Pfade (Schrägstriche werden abgelehnt).
--   * Ampel: neue Lampen „projektordner“ und „regeln“ (Konflikt Projektregel ↔ Sicherheit) – meldet die Werkstatt des Admins.
--   * Testseite per Knopf (Cloudflare Pages mit Git-Anbindung, kostenlos): neue Projekt-Aktion „testseite“, Ergebnis über
--     ws_testseite_melden (trägt vorschau_domain und test_url ein – live_url nie automatisch; Lotse, wenn die Git-Anbindung per Schnittstelle nicht geht).
--   * Datenbank „gewünscht“: ws_datenbank_wuenschen vermerkt den Wunsch nach Bestätigung der Kosten – angelegt wird noch nichts.
--   * REGELN.md bestätigen (Prüfung 02.11.2026, M1): Die Werkstatt meldet Prüfsumme und Text der REGELN.md; der Auftrag nutzt nur die zuletzt
--     vom Admin bestätigte Fassung (ws_regeln_bestaetigen).
--   * Projekt-Kennungen dürfen keine reservierten Windows-Namen sein (con, nul, aux, prn, com1–9, lpt1–9) – sie werden zu Ordnernamen (N4).
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0055.
begin;

-- ---------- Kennungen werden Ordnernamen: keine reservierten Windows-Namen ----------
alter table public.ws_projekte drop constraint if exists ws_projekte_id_windows_check;
alter table public.ws_projekte add constraint ws_projekte_id_windows_check check (id !~ '^(con|prn|aux|nul|com[0-9]|lpt[0-9])$');

-- ---------- Stand der Projektordner je Werkstatt-PC ----------
create table if not exists public.ws_projektordner_stand (
  pc_id uuid not null references public.ws_werkstatt_pcs(id) on delete cascade,
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  stand text not null check (stand in ('ok','fehlt','kein','umzug','umzug_wartet','fehler')),
  konflikte smallint not null default 0 check (konflikte between 0 and 50),
  hinweis text check (hinweis is null or (char_length(hinweis) <= 200 and hinweis !~ '[\\/]')),
  geaendert timestamptz not null default now(),
  primary key (pc_id, projekt_id)
);
alter table public.ws_projektordner_stand enable row level security;
revoke all on public.ws_projektordner_stand from anon, authenticated;
grant select on public.ws_projektordner_stand to authenticated;
drop policy if exists ws_projektordner_stand_lesen on public.ws_projektordner_stand;
create policy ws_projektordner_stand_lesen on public.ws_projektordner_stand for select to authenticated using (public.ws_sieht_projekt(projekt_id));
do $$ begin alter publication supabase_realtime add table public.ws_projektordner_stand; exception when others then null; end $$;

-- Werkstatt meldet den Stand ihres PCs: [{ projekt, stand, konflikte, hinweis }] – nur eigener PC, nur sichtbare Projekte
create or replace function public.ws_projektordner_melden(p_pc uuid, p_werte jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if jsonb_typeof(p_werte) is distinct from 'array' or jsonb_array_length(p_werte) > 200 then raise exception 'Ungültige Meldung'; end if;
  for e in select * from jsonb_array_elements(p_werte) loop
    if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('projekt','stand','konflikte','hinweis')) then raise exception 'Ungültige Meldung'; end if;
    if not public.ws_sieht_projekt(e ->> 'projekt') then continue; end if;
    insert into public.ws_projektordner_stand (pc_id, projekt_id, stand, konflikte, hinweis, geaendert)
    values (p_pc, e ->> 'projekt', e ->> 'stand', coalesce((e ->> 'konflikte')::smallint, 0), nullif(left(e ->> 'hinweis', 200), ''), now())
    on conflict (pc_id, projekt_id) do update set stand = excluded.stand, konflikte = excluded.konflikte, hinweis = excluded.hinweis, geaendert = now();
  end loop;
end $$;
revoke execute on function public.ws_projektordner_melden(uuid, jsonb) from public, anon;
grant execute on function public.ws_projektordner_melden(uuid, jsonb) to authenticated;

-- ---------- REGELN.md: gemeldete Fassung je Projekt und PC, Bestätigung je Prüfsumme (M1, Nachprüfung M1a/M1b) ----------
-- Jede Werkstatt meldet die REGELN.md, die SIE sieht (verschiedene Festplatten/PCs möglich). Der Admin bestätigt eine Prüfsumme; sie gilt für
-- alle PCs mit derselben Prüfsumme. Die Prüfsumme muss zum gemeldeten Text passen (sonst ließe sich ein harmloser Text mit der Prüfsumme
-- eines anderen bestätigen); Dateien über 30.000 Zeichen werden abgelehnt (nie gekürzt bestätigen).
create table if not exists public.ws_regeln_stand (
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  pc_id uuid not null references public.ws_werkstatt_pcs(id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{64}$'),
  text text not null check (char_length(text) <= 30000),
  konflikte smallint not null default 0 check (konflikte between 0 and 50),
  gemeldet timestamptz not null default now(),
  primary key (projekt_id, pc_id)
);
alter table public.ws_regeln_stand enable row level security;
revoke all on public.ws_regeln_stand from anon, authenticated;
grant select on public.ws_regeln_stand to authenticated;
drop policy if exists ws_regeln_stand_lesen on public.ws_regeln_stand;
create policy ws_regeln_stand_lesen on public.ws_regeln_stand for select to authenticated using (public.ws_sieht_projekt(projekt_id));
do $$ begin alter publication supabase_realtime add table public.ws_regeln_stand; exception when others then null; end $$;

create table if not exists public.ws_regeln_freigaben (
  projekt_id text not null references public.ws_projekte(id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{64}$'),
  von uuid references auth.users(id) on delete set null,
  am timestamptz not null default now(),
  primary key (projekt_id, sha)
);
alter table public.ws_regeln_freigaben enable row level security;
revoke all on public.ws_regeln_freigaben from anon, authenticated;
grant select on public.ws_regeln_freigaben to authenticated;
drop policy if exists ws_regeln_freigaben_lesen on public.ws_regeln_freigaben;
create policy ws_regeln_freigaben_lesen on public.ws_regeln_freigaben for select to authenticated using (public.ws_sieht_projekt(projekt_id));
do $$ begin alter publication supabase_realtime add table public.ws_regeln_freigaben; exception when others then null; end $$;

-- Werkstatt (Admin oder Entwickler im Projekt, eigener PC) meldet die REGELN.md, die sie sieht
drop function if exists public.ws_regeln_melden(uuid, text, text, text, int);
create or replace function public.ws_regeln_melden(p_pc uuid, p_projekt text, p_sha text, p_text text, p_konflikte int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if coalesce(public.ws_rolle_im_projekt(p_projekt), '') not in ('admin','entwickler') then raise exception 'Kein Recht in diesem Projekt'; end if;
  if p_text is null or char_length(p_text) > 30000 then raise exception 'REGELN.md ist zu lang (höchstens 30.000 Zeichen) – bitte kürzen'; end if;
  if p_sha is null or p_sha is distinct from encode(sha256(convert_to(p_text, 'UTF8')), 'hex') then raise exception 'Prüfsumme passt nicht zum Text'; end if;
  insert into public.ws_regeln_stand (projekt_id, pc_id, sha, text, konflikte, gemeldet)
  values (p_projekt, p_pc, p_sha, p_text, least(greatest(coalesce(p_konflikte, 0), 0), 50), now())
  on conflict (projekt_id, pc_id) do update set sha = excluded.sha, text = excluded.text, konflikte = excluded.konflikte, gemeldet = now()
   where ws_regeln_stand.sha is distinct from excluded.sha or ws_regeln_stand.konflikte is distinct from excluded.konflikte;
end $$;
revoke execute on function public.ws_regeln_melden(uuid, text, text, text, int) from public, anon;
grant execute on function public.ws_regeln_melden(uuid, text, text, text, int) to authenticated;

-- Nur der Admin bestätigt – nur eine Prüfsumme, die ein PC gerade meldet
create or replace function public.ws_regeln_bestaetigen(p_projekt text, p_sha text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Projektregeln bestätigt nur der Admin'; end if;
  if not exists (select 1 from public.ws_regeln_stand where projekt_id = p_projekt and sha = p_sha) then raise exception 'Diese Fassung meldet gerade kein PC – bitte neu laden'; end if;
  insert into public.ws_regeln_freigaben (projekt_id, sha, von, am) values (p_projekt, p_sha, auth.uid(), now())
  on conflict (projekt_id, sha) do update set von = excluded.von, am = now();
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'regeln_bestaetigt', jsonb_build_object('projekt', p_projekt, 'sha', p_sha));
end $$;
revoke execute on function public.ws_regeln_bestaetigen(text, text) from public, anon;
grant execute on function public.ws_regeln_bestaetigen(text, text) to authenticated;

-- ---------- Ampel: neue Lampen ----------
create or replace function public.ws_anbindungen_ok(w jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(w) = 'object' and not exists (
    select 1 from jsonb_each(w) e
     where e.key not in ('github','pruefung','testseite','build','signatur','sandbox','datenbank','datenbank_live','testlauf','fehler','projektordner','regeln')
        or jsonb_typeof(e.value) <> 'object'
        or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('stand','text'))
        or coalesce(e.value ->> 'stand', '') not in ('gruen','gelb','rot','grau')
        or jsonb_typeof(e.value -> 'text') is distinct from 'string'
        or char_length(e.value ->> 'text') > 200)
$$;

-- ---------- Testseite (Cloudflare Pages) und Datenbank-Wunsch ----------
alter table public.ws_projekte add column if not exists testseite_stand text;
alter table public.ws_projekte drop constraint if exists ws_projekte_testseite_stand_check;
alter table public.ws_projekte add constraint ws_projekte_testseite_stand_check check (testseite_stand is null or testseite_stand in ('laeuft','lotse','eingerichtet','fehler'));
alter table public.ws_projekte add column if not exists testseite_hinweis text check (testseite_hinweis is null or char_length(testseite_hinweis) <= 400);
alter table public.ws_projekte add column if not exists datenbank_wunsch timestamptz;
alter table public.ws_projekte add column if not exists datenbank_wunsch_von uuid references auth.users(id) on delete set null;

alter table public.ws_projekt_aktionen drop constraint if exists ws_projekt_aktionen_art_check;
alter table public.ws_projekt_aktionen add constraint ws_projekt_aktionen_art_check check (art in ('sandbox','testlauf','pruefen','db_einrichten','testseite'));

create or replace function public.ws_projekt_aktion_anfordern(p_projekt text, p_art text, p_zweig text default null, p_pc uuid default null, p_netz boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; n bigint;
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  if p_art not in ('sandbox','testlauf','pruefen','db_einrichten','testseite') then raise exception 'Unbekannte Aktion'; end if;
  select * into p from public.ws_projekte where id = p_projekt and not coalesce(archiviert, false);
  if p.id is null then raise exception 'Projekt nicht gefunden'; end if;
  if p_art = 'sandbox' and p.technik_art <> 'programm' then raise exception 'Die Sandbox gibt es nur für Programme'; end if;
  if p_art = 'testlauf' and p.technik_art <> 'werkzeug' then raise exception 'Testläufe gibt es nur für Werkzeuge'; end if;
  if p_art in ('sandbox','testlauf','db_einrichten','testseite') and p.repo is null then raise exception 'Das Projekt hat noch kein Repository'; end if;
  if p_art = 'db_einrichten' and p.db_test_ref is null and p.db_live_ref is null then raise exception 'Zuerst die Datenbanken eintragen'; end if;
  if p_art = 'testseite' and coalesce(p.technik_art, 'web') not in ('web','handy') then raise exception 'Eine Testseite gibt es nur für Web- und Handy-Apps'; end if;
  if p_art = 'testseite' and p.vorschau_domain is not null and p.testseite_stand is distinct from 'fehler' and p.testseite_stand is distinct from 'lotse' then
    raise exception 'Die Testseite ist schon eingerichtet';
  end if;
  if p_art = 'sandbox' and (p_pc is null or not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid())) then
    raise exception 'Für die Sandbox braucht es deinen Werkstatt-PC';
  end if;
  if exists (select 1 from public.ws_projekt_aktionen a where a.projekt_id = p_projekt and a.art = p_art and a.stand in ('angefragt','laeuft')
              and a.geaendert > now() - interval '15 minutes') then raise exception 'Läuft schon – bitte kurz warten'; end if;
  insert into public.ws_projekt_aktionen (projekt_id, art, zweig, ziel_pc, netz) values (p_projekt, p_art, nullif(p_zweig, ''), case when p_art = 'sandbox' then p_pc end, p_art = 'sandbox' and coalesce(p_netz, false))
  returning id into n;
  if p_art = 'testseite' then update public.ws_projekte set testseite_stand = 'laeuft', testseite_hinweis = 'Wartet auf die Werkstatt des Admins' where id = p_projekt; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'projekt_aktion', jsonb_build_object('projekt', p_projekt, 'art', p_art, 'zweig', p_zweig, 'netz', coalesce(p_netz, false)));
  return n;
end $$;

-- Ergebnis der Testseite: eingerichtet (mit Adresse), Lotse (Git-Anbindung von Hand) oder Fehler. live_url wird NIE automatisch gesetzt (N3). Mit p_aktion schließt es die Aktion ab;
-- ohne Aktion (Lotse erledigt, Adresse erreichbar) nur aus dem Stand „lotse“ heraus.
create or replace function public.ws_testseite_melden(p_pc uuid, p_projekt text, p_stand text, p_domain text default null, p_hinweis text default null, p_aktion bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if p_stand not in ('lotse','eingerichtet','fehler') then raise exception 'Unbekannter Stand'; end if;
  if p_stand = 'eingerichtet' and (p_domain is null or p_domain !~ '^[a-z0-9-]+\.pages\.dev$') then raise exception 'Ungültige Adresse der Testseite'; end if;
  select * into p from public.ws_projekte where id = p_projekt for update;
  if p.id is null then raise exception 'Projekt nicht gefunden'; end if;
  if p_aktion is not null then
    if not exists (select 1 from public.ws_projekt_aktionen a where a.id = p_aktion and a.projekt_id = p_projekt and a.art = 'testseite' and a.stand = 'laeuft' and a.pc = p_pc) then
      raise exception 'Keine laufende Testseiten-Aktion dieser Werkstatt';
    end if;
    update public.ws_projekt_aktionen set stand = case when p_stand = 'fehler' then 'fehler' else 'fertig' end, hinweis = left(coalesce(p_hinweis, ''), 500), geaendert = now() where id = p_aktion;
  elsif p.testseite_stand is distinct from 'lotse' then
    raise exception 'Die Testseite wartet nicht auf den Lotsen';
  end if;
  update public.ws_projekte set testseite_stand = p_stand, testseite_hinweis = left(p_hinweis, 400),
         vorschau_domain = case when p_stand = 'eingerichtet' then p_domain else vorschau_domain end,
         test_url = case when p_stand = 'eingerichtet' then coalesce(test_url, 'https://' || p_domain) else test_url end
   where id = p_projekt;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'testseite', jsonb_build_object('projekt', p_projekt, 'stand', p_stand, 'domain', p_domain));
end $$;
revoke execute on function public.ws_testseite_melden(uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.ws_testseite_melden(uuid, text, text, text, text, bigint) to authenticated;

-- Datenbank wünschen (Supabase Pro ca. 25 $/Monat): nur Admin, nur mit bestätigten Kosten. Angelegt wird NOCH NICHTS (kommt später).
create or replace function public.ws_datenbank_wuenschen(p_projekt text, p_kosten_bestaetigt boolean, p_an boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  if coalesce(p_an, true) and not coalesce(p_kosten_bestaetigt, false) then raise exception 'Bitte zuerst die Kosten bestätigen'; end if;
  update public.ws_projekte set datenbank_wunsch = case when coalesce(p_an, true) then now() end, datenbank_wunsch_von = case when coalesce(p_an, true) then auth.uid() end
   where id = p_projekt and not coalesce(archiviert, false);
  if not found then raise exception 'Projekt nicht gefunden'; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'datenbank_wunsch', jsonb_build_object('projekt', p_projekt, 'an', coalesce(p_an, true)));
end $$;
revoke execute on function public.ws_datenbank_wuenschen(text, boolean, boolean) from public, anon;
grant execute on function public.ws_datenbank_wuenschen(text, boolean, boolean) to authenticated;

commit;
