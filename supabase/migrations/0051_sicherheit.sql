-- Codeschmiede · Datenbank 0051: Sicherheitspaket November 2026 (Befunde S4, S9, S10, S11 vom 01.11.2026, docs/BEFUNDE-2026-11-01.md)
-- Anweisung Gerhard 01.11.2026 22:18/22:38 („alles freigegeben“).
--   S9  Werkstatt-Nachrichten (von = null) nur noch über ws_werkstatt_nachricht: eigener PC, Auftrag auf einem PC dieser Person (oder Admin).
--   S10 „Immer erlauben“ prüft die Datenbank selbst (gleiche kurze Liste wie desktop/dienst/lib/ergebnis.mjs › dauerErlaubbar).
--   S11 Name eines Werkstatt-PCs begrenzt (1–80 Zeichen, keine Steuerzeichen).
--   S4  „Zeigen & kommentieren“: sichtbarer Text aus der App (baustein.text) wird nie gespeichert.
-- Mehrfach ausführbar. Verträglich mit älteren Werkstatt-Diensten bis auf S9: Dienste vor 0.10.1 schreiben Werkstatt-Nachrichten direkt –
-- deshalb erst einspielen, wenn alle Werkstatt-PCs das Programm-Update 0.10.1 haben (es kommt automatisch).

begin;

-- ---------- S9: Werkstatt-Nachrichten nur über die Funktion ----------
create or replace function public.ws_werkstatt_nachricht(p_pc uuid, p_auftrag bigint, p_art text, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; n bigint;
begin
  if p_art is null or p_art not in ('text','frage','ergebnis') then raise exception 'Ungültige Art'; end if;
  if p_text is null or char_length(p_text) = 0 or char_length(p_text) > 8000 then raise exception 'Text fehlt oder ist zu lang'; end if;
  if not exists (select 1 from public.ws_werkstatt_pcs where id = p_pc and benutzer_id = auth.uid() and an) then
    raise exception 'Nur vom eigenen, eingeschalteten Werkstatt-PC';
  end if;
  select * into a from public.ws_auftraege where id = p_auftrag;
  if a.id is null or not public.ws_ist_werkstatt_fuer(a.gruppe_id) then raise exception 'Keine Werkstatt für diesen Auftrag'; end if;
  -- Der Auftrag muss auf einem PC dieser Person laufen (bzw. gelaufen sein); Stationen und Aufräumen macht der Admin-PC
  if not public.ws_ist_admin() and (a.werkstatt_pc is null
       or not exists (select 1 from public.ws_werkstatt_pcs where id = a.werkstatt_pc and benutzer_id = auth.uid())) then
    raise exception 'Dieser Auftrag läuft nicht auf einem PC dieser Person';
  end if;
  insert into public.ws_nachrichten (auftrag_id, von, art, text) values (p_auftrag, null, p_art, p_text) returning id into n;
  return n;
end $$;
revoke execute on function public.ws_werkstatt_nachricht(uuid, bigint, text, text) from public, anon;
grant execute on function public.ws_werkstatt_nachricht(uuid, bigint, text, text) to authenticated;

-- Direkt dürfen Mitglieder nur noch eigene Texte schreiben (von = auth.uid()); „von = null“ (Werkstatt) nur über die Funktion oben
drop policy if exists ws_nachrichten_neu on public.ws_nachrichten;
create policy ws_nachrichten_neu on public.ws_nachrichten for insert to authenticated
  with check (kanal <> 'claude-chat'
    and von = auth.uid() and art = 'text'
    and exists (select 1 from public.ws_auftraege a where a.id = auftrag_id and public.ws_darf(public.ws_bereich_von_gruppe(a.gruppe_id), 'auftraege')));

-- ---------- S10: „Immer erlauben“ auch in der Datenbank prüfen ----------
-- Gleich wie dauerErlaubbar() und passtRegel() im Dienst: nur kurze Liste harmloser Lese-Befehle, keine Verkettung/Umleitung.
-- (In Postgres-Regex ist \y die Wortgrenze; \b wäre ein Rückschritt-Zeichen.)
create or replace function public.ws_dauer_erlaubbar(p_befehl text) returns boolean
language sql immutable set search_path = public as $$
  select p_befehl is not null
     and p_befehl !~ '[;&|`<>\r\n]|\$\('
     and regexp_replace(p_befehl, '\s+', ' ', 'g')
         ~ '^\s*(gh (pr (view|checks|list|diff)|run (view|list)|issue view)|git (ls-files|show --stat|branch( -a)?|remote -v)|ls|pwd)\y'
$$;
revoke execute on function public.ws_dauer_erlaubbar(text) from public, anon;
grant execute on function public.ws_dauer_erlaubbar(text) to authenticated;

create or replace function public.ws_erlaubnis_entscheiden(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.ws_erlaubnisse; g text;
begin
  if p_status not in ('einmal','immer','abgelehnt') then raise exception 'Ungültige Entscheidung'; end if;
  select * into e from public.ws_erlaubnisse where id = p_id for update;
  if e.id is null or e.status <> 'offen' then raise exception 'Anfrage nicht offen'; end if;
  select gruppe_id into g from public.ws_auftraege where id = e.auftrag_id;
  if not public.ws_darf(public.ws_bereich_von_gruppe(g), 'freigeben') then
    raise exception 'Keine Berechtigung zum Erlauben in diesem Bereich';
  end if;
  -- Befund S10: „immer“ nur für Befehle der kurzen Liste (Bash) – alles andere höchstens „einmal“
  if p_status = 'immer' and e.werkzeug = 'Bash' and not public.ws_dauer_erlaubbar(e.eingabe) then
    raise exception 'Für diesen Befehl gibt es kein „Immer erlauben“ – bitte „Einmal erlauben“ wählen';
  end if;
  update public.ws_erlaubnisse set status = p_status, entschieden_von = auth.uid(), entschieden = now() where id = p_id;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'erlaubnis', jsonb_build_object('id', p_id, 'status', p_status, 'eingabe', e.eingabe));
end $$;

-- Bestehende „immer“-Regeln für Befehle außerhalb der Liste zurückstufen (der Dienst wendete sie ohnehin nicht an)
update public.ws_erlaubnisse set status = 'einmal'
  where status = 'immer' and werkzeug = 'Bash' and not public.ws_dauer_erlaubbar(eingabe);

-- ---------- S11: Name des Werkstatt-PCs begrenzen ----------
-- Das Programm kürzt den Namen seit 0.10.1 selbst (Buchstaben, Ziffern, Leerzeichen, . _ -; höchstens 63 Zeichen).
alter table public.ws_werkstatt_pcs drop constraint if exists ws_werkstatt_pcs_name_ok;
alter table public.ws_werkstatt_pcs add constraint ws_werkstatt_pcs_name_ok
  check (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]') not valid;

-- ---------- S4: kein sichtbarer Text aus der App im Auftrag ----------
create or replace function public.ws_auftrag_baustein_ohne_text() returns trigger language plpgsql set search_path = public as $$
begin
  if new.baustein is not null and jsonb_typeof(new.baustein) = 'object' then new.baustein := new.baustein - 'text'; end if;
  return new;
end $$;
drop trigger if exists ws_auftrag_baustein_ohne_text on public.ws_auftraege;
create trigger ws_auftrag_baustein_ohne_text before insert on public.ws_auftraege
  for each row execute function public.ws_auftrag_baustein_ohne_text();
-- Altbestand bereinigen
update public.ws_auftraege set baustein = baustein - 'text' where jsonb_typeof(baustein) = 'object' and baustein ? 'text';

commit;
