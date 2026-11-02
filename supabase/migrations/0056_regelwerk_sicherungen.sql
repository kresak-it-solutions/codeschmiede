-- Codeschmiede · Datenbank 0056: Regelwerk-Fassung je Projekt und Sicherungen (Rest des Entwurfs 1.0 „Projektordner“, freigegeben von Gerhard
-- 02.11.2026 07:04, docs/KONZEPT-PROJEKTORDNER.md).
--   * Festgelegte Fassung des Regelwerks (gerhardkresak-code/ai-dev-os) je Projekt: ws_projekte.regelwerk_fassung (Commit, 40 Zeichen).
--     Aufträge lesen das Regelwerk nur aus dem Git-Klon genau dieser Fassung – nie aus dem beschreibbaren Ordner regeln\regelwerk.
--     Eine neue Fassung gilt nur nach Gerhards Klick: Vergleich anfordern (Aktion „regelwerk_vergleich“, Werkstatt des Admins meldet festgelegte
--     und neueste Fassung samt geänderten Dateien) → „Übernehmen“ (ws_regelwerk_uebernehmen, nur Admin, nur genau die verglichene Fassung, Protokoll).
--     Ohne festgelegte Fassung (neues Projekt) setzt die Werkstatt des Admins EINMAL die erste (ws_regelwerk_erstfassung) – danach nie wieder.
--   * Ampel: neue Lampen „sicherungen“ (Anzahl und letzte Sicherung im Ordner sicherungen\ des Admin-PCs, ohne Pfade) und „setup“
--     (letzte Version der Installationsdateien in setup\, Entscheidung Gerhard 02.11.2026 10:00).
--   * Globale Regeln der ganzen Codeschmiede (Gerhard 02.11.2026 09:50/09:54/09:55): <basis>\Regeln\CLAUDE.md – gleicher Schutz wie die
--     REGELN.md der Projekte: Werkstatt meldet Prüfsumme und Text je PC (ws_regeln_global_melden), nur der Admin bestätigt bzw. widerruft, es gilt
--     nur die neueste Bestätigung. Projekt-Kennung „regeln“ gesperrt (der Ordner „Regeln“ liegt neben den Projektordnern).
--   * Abo-Limits (Claude „Ultra“, Gerhard 02.11.2026 10:00): fuenf_std_kein (Claude Code meldet kein 5-Stunden-Fenster) und woche_modelle
--     (modell-eigene Wochenfenster wie gemeldet, z. B. Fable) in ws_abo_limits – nur eigene Zeile, Form geprüft.
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0056.
begin;

alter table public.ws_projekte add column if not exists regelwerk_fassung text;
alter table public.ws_projekte drop constraint if exists ws_projekte_regelwerk_fassung_check;
alter table public.ws_projekte add constraint ws_projekte_regelwerk_fassung_check check (regelwerk_fassung is null or regelwerk_fassung ~ '^[0-9a-f]{40}$');
alter table public.ws_projekte add column if not exists regelwerk_fassung_am timestamptz;
alter table public.ws_projekte add column if not exists regelwerk_vergleich jsonb;
alter table public.ws_projekte drop constraint if exists ws_projekte_regelwerk_vergleich_check;
alter table public.ws_projekte add constraint ws_projekte_regelwerk_vergleich_check check (regelwerk_vergleich is null or (jsonb_typeof(regelwerk_vergleich) = 'object' and pg_column_size(regelwerk_vergleich) <= 65536));
-- Die neuen Spalten sind nur über die Funktionen unten änderbar (keine Spalten-Rechte für authenticated).

-- ---------- Aktion „regelwerk_vergleich“ ----------
alter table public.ws_projekt_aktionen drop constraint if exists ws_projekt_aktionen_art_check;
alter table public.ws_projekt_aktionen add constraint ws_projekt_aktionen_art_check check (art in ('sandbox','testlauf','pruefen','db_einrichten','testseite','regelwerk_vergleich'));

create or replace function public.ws_projekt_aktion_anfordern(p_projekt text, p_art text, p_zweig text default null, p_pc uuid default null, p_netz boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte; n bigint;
begin
  if not public.ws_ist_admin() then raise exception 'Nur der Admin'; end if;
  if p_art not in ('sandbox','testlauf','pruefen','db_einrichten','testseite','regelwerk_vergleich') then raise exception 'Unbekannte Aktion'; end if;
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

-- Werkstatt des Admins meldet den Vergleich: festgelegte und neueste Fassung, geänderte Dateien [{art: A|M|D, pfad}] (höchstens 300) –
-- nur zu einer laufenden Vergleichs-Aktion dieser Werkstatt; schließt die Aktion ab.
create or replace function public.ws_regelwerk_vergleich_melden(p_pc uuid, p_aktion bigint, p_fest text, p_neu text, p_dateien jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_projekt_aktionen; e jsonb;
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  select * into a from public.ws_projekt_aktionen where id = p_aktion for update;
  if a.id is null or a.art <> 'regelwerk_vergleich' or a.stand <> 'laeuft' or a.pc is distinct from p_pc then raise exception 'Keine laufende Vergleichs-Aktion dieser Werkstatt'; end if;
  if p_neu is null or p_neu !~ '^[0-9a-f]{40}$' or (p_fest is not null and p_fest !~ '^[0-9a-f]{40}$') then raise exception 'Ungültige Fassung'; end if;
  if jsonb_typeof(p_dateien) is distinct from 'array' or jsonb_array_length(p_dateien) > 300 then raise exception 'Ungültige Dateiliste'; end if;
  for e in select * from jsonb_array_elements(p_dateien) loop
    if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('art','pfad'))
       or coalesce(e ->> 'art', '') not in ('A','M','D')
       or coalesce(e ->> 'pfad', '') !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,6}$' or char_length(e ->> 'pfad') > 200 then
      raise exception 'Ungültige Dateiliste';
    end if;
  end loop;
  update public.ws_projekte set regelwerk_vergleich = jsonb_build_object('fest', p_fest, 'neu', p_neu, 'dateien', p_dateien, 'zeit', now()) where id = a.projekt_id;
  update public.ws_projekt_aktionen set stand = 'fertig', geaendert = now(),
         hinweis = case when p_neu = p_fest then 'Regelwerk: die festgelegte Fassung ist schon die neueste'
                        else 'Regelwerk verglichen: ' || jsonb_array_length(p_dateien) || ' Datei(en) geändert – „Übernehmen“ unter Anbindungen' end
   where id = a.id;
end $$;
revoke execute on function public.ws_regelwerk_vergleich_melden(uuid, bigint, text, text, jsonb) from public, anon;
grant execute on function public.ws_regelwerk_vergleich_melden(uuid, bigint, text, text, jsonb) to authenticated;

-- Gerhards Entscheidung: genau die zuletzt verglichene neueste Fassung festlegen (nur Admin, mit Protokoll). Die Werkstätten legen danach die
-- Kopie im Ordner regeln\regelwerk neu an (alte nach regeln\regelwerk-alt-<datum>).
create or replace function public.ws_regelwerk_uebernehmen(p_projekt text, p_sha text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.ws_projekte;
begin
  if not public.ws_ist_admin() then raise exception 'Eine neue Fassung des Regelwerks übernimmt nur der Admin'; end if;
  select * into p from public.ws_projekte where id = p_projekt and not coalesce(archiviert, false) for update;
  if p.id is null then raise exception 'Projekt nicht gefunden'; end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{40}$' then raise exception 'Ungültige Fassung'; end if;
  if p.regelwerk_vergleich is null or p.regelwerk_vergleich ->> 'neu' is distinct from p_sha then raise exception 'Diese Fassung wurde nicht verglichen – bitte zuerst neu vergleichen'; end if;
  if (p.regelwerk_vergleich ->> 'zeit')::timestamptz < now() - interval '1 day' then raise exception 'Der Vergleich ist älter als einen Tag – bitte neu vergleichen'; end if;
  if p.regelwerk_fassung = p_sha then raise exception 'Diese Fassung ist schon festgelegt'; end if;
  update public.ws_projekte set regelwerk_fassung = p_sha, regelwerk_fassung_am = now(), regelwerk_vergleich = null where id = p_projekt;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'regelwerk_uebernommen', jsonb_build_object('projekt', p_projekt, 'von', p.regelwerk_fassung, 'nach', p_sha));
end $$;
revoke execute on function public.ws_regelwerk_uebernehmen(text, text) from public, anon;
grant execute on function public.ws_regelwerk_uebernehmen(text, text) to authenticated;

-- Erste Fassung (Projekt ohne festgelegte Fassung): nur die Werkstatt des Admins, nur EINMAL (danach nur noch über „Übernehmen“).
create or replace function public.ws_regelwerk_erstfassung(p_pc uuid, p_projekt text, p_sha text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Nur die Werkstatt des Admins'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if p_sha is null or p_sha !~ '^[0-9a-f]{40}$' then raise exception 'Ungültige Fassung'; end if;
  update public.ws_projekte set regelwerk_fassung = p_sha, regelwerk_fassung_am = now() where id = p_projekt and regelwerk_fassung is null;
  if not found then return false; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'regelwerk_erstfassung', jsonb_build_object('projekt', p_projekt, 'nach', p_sha));
  return true;
end $$;
revoke execute on function public.ws_regelwerk_erstfassung(uuid, text, text) from public, anon;
grant execute on function public.ws_regelwerk_erstfassung(uuid, text, text) to authenticated;

-- ---------- Ampel: Lampe „sicherungen“ ----------
create or replace function public.ws_anbindungen_ok(w jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(w) = 'object' and not exists (
    select 1 from jsonb_each(w) e
     where e.key not in ('github','pruefung','testseite','build','signatur','sandbox','datenbank','datenbank_live','testlauf','fehler','projektordner','regeln','sicherungen','setup')
        or jsonb_typeof(e.value) <> 'object'
        or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('stand','text'))
        or coalesce(e.value ->> 'stand', '') not in ('gruen','gelb','rot','grau')
        or jsonb_typeof(e.value -> 'text') is distinct from 'string'
        or char_length(e.value ->> 'text') > 200)
$$;

-- ---------- Globale Regeln (<basis>\Regeln\CLAUDE.md) ----------
alter table public.ws_projekte drop constraint if exists ws_projekte_id_regeln_check;
alter table public.ws_projekte add constraint ws_projekte_id_regeln_check check (lower(id) <> 'regeln');

-- Wer die globalen Regeln sieht und meldet: Admin und Entwickler (in mindestens einem Projekt)
create or replace function public.ws_sieht_global() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ws_ist_admin() or exists (select 1 from public.ws_projekt_mitglieder m where m.benutzer_id = auth.uid() and m.rolle = 'entwickler')
$$;
revoke execute on function public.ws_sieht_global() from public, anon;
grant execute on function public.ws_sieht_global() to authenticated;

create table if not exists public.ws_regeln_global_stand (
  pc_id uuid primary key references public.ws_werkstatt_pcs(id) on delete cascade,
  sha text not null check (sha ~ '^[0-9a-f]{64}$'),
  text text not null check (char_length(text) <= 30000),
  konflikte smallint not null default 0 check (konflikte between 0 and 50),
  neben boolean not null default false,          -- zusätzlich eine REGELN.md im Ordner (gilt nicht – Hinweis „Nur CLAUDE.md gilt“)
  gemeldet timestamptz not null default now()
);
alter table public.ws_regeln_global_stand enable row level security;
revoke all on public.ws_regeln_global_stand from anon, authenticated;
grant select on public.ws_regeln_global_stand to authenticated;
drop policy if exists ws_regeln_global_stand_lesen on public.ws_regeln_global_stand;
create policy ws_regeln_global_stand_lesen on public.ws_regeln_global_stand for select to authenticated using (public.ws_sieht_global());
do $$ begin alter publication supabase_realtime add table public.ws_regeln_global_stand; exception when others then null; end $$;

create table if not exists public.ws_regeln_global_freigaben (
  sha text primary key check (sha ~ '^[0-9a-f]{64}$'),
  von uuid references auth.users(id) on delete set null,
  am timestamptz not null default now()
);
alter table public.ws_regeln_global_freigaben enable row level security;
revoke all on public.ws_regeln_global_freigaben from anon, authenticated;
grant select on public.ws_regeln_global_freigaben to authenticated;
drop policy if exists ws_regeln_global_freigaben_lesen on public.ws_regeln_global_freigaben;
create policy ws_regeln_global_freigaben_lesen on public.ws_regeln_global_freigaben for select to authenticated using (public.ws_sieht_global());
do $$ begin alter publication supabase_realtime add table public.ws_regeln_global_freigaben; exception when others then null; end $$;

-- Werkstatt (Admin oder Entwickler, eigener PC) meldet die globale CLAUDE.md, die sie sieht – Prüfsumme muss zum Text passen, ≤ 30.000 Zeichen
create or replace function public.ws_regeln_global_melden(p_pc uuid, p_sha text, p_text text, p_konflikte int default 0, p_neben boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs w where w.id = p_pc and w.benutzer_id = auth.uid()) then raise exception 'Unbekannter Werkstatt-PC'; end if;
  if not public.ws_sieht_global() then raise exception 'Kein Recht für die globalen Regeln'; end if;
  if p_text is null or char_length(p_text) > 30000 then raise exception 'Die globale CLAUDE.md ist zu lang (höchstens 30.000 Zeichen) – bitte kürzen'; end if;
  if p_sha is null or p_sha is distinct from encode(sha256(convert_to(p_text, 'UTF8')), 'hex') then raise exception 'Prüfsumme passt nicht zum Text'; end if;
  insert into public.ws_regeln_global_stand (pc_id, sha, text, konflikte, neben, gemeldet)
  values (p_pc, p_sha, p_text, least(greatest(coalesce(p_konflikte, 0), 0), 50), coalesce(p_neben, false), now())
  on conflict (pc_id) do update set sha = excluded.sha, text = excluded.text, konflikte = excluded.konflikte, neben = excluded.neben, gemeldet = now()
   where ws_regeln_global_stand.sha is distinct from excluded.sha or ws_regeln_global_stand.konflikte is distinct from excluded.konflikte
      or ws_regeln_global_stand.neben is distinct from excluded.neben;
end $$;
revoke execute on function public.ws_regeln_global_melden(uuid, text, text, int, boolean) from public, anon;
grant execute on function public.ws_regeln_global_melden(uuid, text, text, int, boolean) to authenticated;

-- Nur der Admin bestätigt – nur eine Prüfsumme, die ein PC gerade meldet
create or replace function public.ws_regeln_global_bestaetigen(p_sha text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Globale Regeln bestätigt nur der Admin'; end if;
  if not exists (select 1 from public.ws_regeln_global_stand where sha = p_sha) then raise exception 'Diese Fassung meldet gerade kein PC – bitte neu laden'; end if;
  insert into public.ws_regeln_global_freigaben (sha, von, am) values (p_sha, auth.uid(), now())
  on conflict (sha) do update set von = excluded.von, am = now();
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'regeln_global_bestaetigt', jsonb_build_object('sha', p_sha));
end $$;
revoke execute on function public.ws_regeln_global_bestaetigen(text) from public, anon;
grant execute on function public.ws_regeln_global_bestaetigen(text) to authenticated;

create or replace function public.ws_regeln_global_widerrufen(p_sha text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ws_ist_admin() then raise exception 'Widerrufen kann nur der Admin'; end if;
  delete from public.ws_regeln_global_freigaben where sha = p_sha;
  if not found then raise exception 'Diese Fassung ist nicht bestätigt'; end if;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'regeln_global_widerrufen', jsonb_build_object('sha', p_sha));
end $$;
revoke execute on function public.ws_regeln_global_widerrufen(text) from public, anon;
grant execute on function public.ws_regeln_global_widerrufen(text) to authenticated;

-- ---------- Abo-Limits: kein 5-Stunden-Fenster, modell-eigene Wochenfenster ----------
alter table public.ws_abo_limits add column if not exists fuenf_std_kein boolean;
alter table public.ws_abo_limits add column if not exists woche_modelle jsonb;
create or replace function public.ws_woche_modelle_ok(w jsonb) returns boolean
language sql immutable set search_path = public as $$
  select w is null or (jsonb_typeof(w) = 'array' and jsonb_array_length(w) <= 5 and not exists (
    select 1 from jsonb_array_elements(w) e
     where jsonb_typeof(e) <> 'object'
        or exists (select 1 from jsonb_object_keys(e) k where k not in ('modell','prozent','reset'))
        or coalesce(e ->> 'modell', '') !~ '^[a-z][a-z0-9]{1,29}$'
        or (case when jsonb_typeof(e -> 'prozent') = 'number' then (e ->> 'prozent')::numeric not between 0 and 100 else true end)
        or (e ? 'reset' and jsonb_typeof(e -> 'reset') not in ('string','null'))
        or (jsonb_typeof(e -> 'reset') = 'string' and char_length(e ->> 'reset') > 40)))
$$;
alter table public.ws_abo_limits drop constraint if exists ws_abo_limits_woche_modelle_check;
alter table public.ws_abo_limits add constraint ws_abo_limits_woche_modelle_check check (public.ws_woche_modelle_ok(woche_modelle));
grant insert (fuenf_std_kein, woche_modelle), update (fuenf_std_kein, woche_modelle) on public.ws_abo_limits to authenticated;

commit;
