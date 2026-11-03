-- t51: 0063 auf einer Datenbank MIT Altbestand einspielen (Fehler beim ersten Einspielen am 03.11.2026:
-- „function public.ws_freigabe_gueltig(bigint) does not exist“ – der Altbestand-Block lief vor der Funktion).
-- Ablauf: frische Datenbank bis 0062 (ohne 0063), dann diese Datei mit psql -v ON_ERROR_STOP=1 -f, dann 0063 zweimal, dann Teil 2 (unten, ab „-- TEIL 2“).
-- Teil 2 wird von Hand ausgeführt: die Prüfabfrage am Dateiende (ohne „-- “) muss genau „t51 ok“ liefern.
-- Nur erfundene Test-Konten.
do $$ declare g text; u uuid; s text; begin
  select gr.id into g from ws_gruppen gr join ws_bereiche b on b.id = gr.bereich_id
   where b.projekt_id = 'trainer-to-go' and gr.name <> 'Konzept' limit 1;
  if g is null then raise exception 't51: keine Gruppe'; end if;
  select id into u from auth.users limit 1;
  if u is null then u := gen_random_uuid(); insert into auth.users(id) values (u); end if;
  foreach s in array array['wartet','frage','nacharbeit','freigabe','laeuft','erledigt'] loop
    insert into ws_auftraege(gruppe_id, titel, stand, erstellt_von) values (g, 't51 Alt ' || s, s, u);
  end loop;
end $$;

-- TEIL 2 (nach 0063, zweimal eingespielt): erwartet
--   wartet/frage/nacharbeit/freigabe → entwurf mit Kritik „Altbestand vor 0.19.0“ und ohne Werkstatt-PC,
--   laeuft bleibt laeuft mit Merker neu_nach_lauf, erledigt unverändert ohne Kritik.
-- select titel, stand, werkstatt_pc, kritik ->> 'grund', kritik ->> 'neu_nach_lauf' from ws_auftraege where titel like 't51 %' order by id;
-- Prüfung als Abfrage (muss genau eine Zeile „t51 ok“ liefern):
-- select case when count(*) filter (where titel in ('t51 Alt wartet','t51 Alt frage','t51 Alt nacharbeit','t51 Alt freigabe') and stand = 'entwurf' and werkstatt_pc is null and kritik ->> 'grund' = 'Altbestand vor 0.19.0') = 4
--              and count(*) filter (where titel = 't51 Alt laeuft' and stand = 'laeuft' and (kritik ->> 'neu_nach_lauf')::boolean) = 1
--              and count(*) filter (where titel = 't51 Alt erledigt' and stand = 'erledigt' and kritik is null) = 1
--             then 't51 ok' else 't51 FEHLER' end from ws_auftraege where titel like 't51 %';
