-- Alte Entwürfe von Trainer to go verwerfen (Gerhard 2026-11-07 21:12, Antwort „Verwerfen (Empfohlen)“):
--   #21, #26 „Aufbau übernehmen“ – überholt durch den automatischen Abgleich mit main (0064)
--   #28, #29, #30 Excel-Spielerimport – läuft in der App über den Link-Sync
-- „Doku-Gerüst anlegen“ bleibt offen. Mehrfach ausführbar: nur Aufträge, die noch Entwurf sind.
begin;
with weg as (
  update public.ws_auftraege a set stand = 'abgebrochen', geaendert = now()
   where a.id in (21, 26, 28, 29, 30) and a.stand = 'entwurf'
     and public.ws_projekt_von_gruppe(a.gruppe_id) = 'trainer-to-go'
  returning a.id, a.titel)
insert into public.ws_entscheidungen (projekt_id, auftrag_id, art, text, begruendung, wer)
select 'trainer-to-go', w.id, 'verwerfen', left('Entwurf verworfen: ' || w.titel, 2000),
       case when w.id in (21, 26) then 'Überholt durch den automatischen Abgleich mit main (Codeschmiede 0.20.0)'
            else 'Spielerimport läuft in der App über den Link-Sync' end || ' – Anweisung Gerhard 07.11.2026 21:12',
       (select id from auth.users where lower(email) = 'gerhard.kresak@gmail.com' limit 1)
  from weg w;
commit;
