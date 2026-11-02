-- Datenbank 0061 – Nacharbeit Stufe 2/3 (Codeschmiede 0.17.1) – Claude, freigegeben von Gerhard 02.11.2026 (Befund der Sicherheitsprüfung zu 0060)
-- Mehrfach ausführbar (create or replace).
--
-- Befund: ws_bildschirmfotos_aufraeumen las die unbestätigten Fotos ohne Sperre (INSERT … SELECT) und trug ihre Pfade in die Lösch-Warteschlange
-- ws_chat_dateien_weg ein. Lief gleichzeitig ws_bildschirmfoto_senden (sperrt die Aktion mit FOR UPDATE und setzt chat_id), sah das Aufräumen noch den
-- alten Stand: das Foto kam in den Chat UND in die Lösch-Warteschlange (die Werkstatt hätte die Datei des Chat-Anhangs gelöscht). Das anschließende
-- UPDATE hat die Zeile zwar richtig ausgelassen, die Warteschlange war aber schon gefüllt.
--
-- Neu: Die Zeilen werden ZUERST gesperrt (FOR UPDATE SKIP LOCKED) und verfallen gesetzt; eingefügt werden nur die Pfade genau dieser Zeilen
-- (UPDATE … RETURNING in derselben Anweisung). Eine Aktion, die ws_bildschirmfoto_senden gerade hält, wird übersprungen (nächster Aufräumlauf).
-- Hat ws_bildschirmfoto_senden schon bestätigt, sieht FOR UPDATE den neuen Stand (chat_id gesetzt) und lässt die Zeile aus.
-- Umgekehrt wartet ws_bildschirmfoto_senden (FOR UPDATE, unverändert aus 0060) auf das Aufräumen und findet danach kein Bild mehr
-- („Kein offenes Bildschirmfoto“). Beide sperren dieselbe Zeile von ws_projekt_aktionen – das passt zusammen, 0060 bleibt dort unverändert.
-- Rechte wie 0060: niemand außer dem Aufräumlauf (ws_code_aufraeumen, SECURITY DEFINER) ruft die Funktion auf; anon und public ohne Rechte.

create or replace function public.ws_bildschirmfotos_aufraeumen() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with faellig as (
    select a.id, a.ergebnis -> 'bild' ->> 'pfad' as pfad
      from public.ws_projekt_aktionen a
     where a.art = 'bildschirmfoto' and a.chat_id is null and a.geaendert < now() - interval '24 hours' and a.ergebnis ? 'bild'
     for update skip locked
  ), verfallen as (
    update public.ws_projekt_aktionen a set ergebnis = jsonb_build_object('verfallen', true), geaendert = now(),
           hinweis = 'Bildschirmfoto nach 24 Stunden gelöscht (nicht in den Chat geschickt)'
      from faellig f
     where a.id = f.id
    returning f.pfad
  ), weg as (
    insert into public.ws_chat_dateien_weg (pfad, benutzer)
      select v.pfad, split_part(v.pfad, '/', 1)::uuid from verfallen v
       where coalesce(v.pfad, '') ~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,60}/[a-f0-9-]{36}\.png$'
    on conflict (pfad) do nothing
    returning 1
  )
  select count(*) into n from verfallen;
  return n;
end $$;
revoke execute on function public.ws_bildschirmfotos_aufraeumen() from public, anon, authenticated;
