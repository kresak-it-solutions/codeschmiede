-- Rechte-Test Datenbank 0056 (Regelwerk-Fassung je Projekt, Lampe „sicherungen“) – Claude, Entwurf „Projektordner“ freigegeben von Gerhard 02.11.2026 07:04
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0056, danach t42_projektordner.sql (Konten, PCs, Projekte).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set A1 '1111111111111111111111111111111111111111'
\set A2 '2222222222222222222222222222222222222222'
reset role; update ws_projekt_aktionen set stand = 'fertig'; set role authenticated;

\echo [1] Erste Fassung durch die Werkstatt des Entwicklers -> FEHLER
:DEV
select ws_regelwerk_erstfassung('00000000-0000-0000-0000-0000000000d1','trainer-to-go',:'A1');
\echo [2] Erste Fassung durch die Werkstatt des Admins -> t, zweites Mal -> f (bleibt A1)
:ADM
select ws_regelwerk_erstfassung('00000000-0000-0000-0000-0000000000a1','trainer-to-go',:'A1');
select ws_regelwerk_erstfassung('00000000-0000-0000-0000-0000000000a1','trainer-to-go',:'A2');
select left(regelwerk_fassung, 4) fassung from ws_projekte where id = 'trainer-to-go';
\echo [3] Ungültige Fassung -> FEHLER
select ws_regelwerk_erstfassung('00000000-0000-0000-0000-0000000000a1','vereinsheft','HEAD');
\echo [4] Direkt setzen -> FEHLER (keine Spalten-Rechte)
update ws_projekte set regelwerk_fassung = :'A2' where id = 'trainer-to-go';
\echo [5] Übernehmen ohne Vergleich -> FEHLER
select ws_regelwerk_uebernehmen('trainer-to-go',:'A2');
\echo [6] Entwickler fordert den Vergleich an -> FEHLER
:DEV
select ws_projekt_aktion_anfordern('trainer-to-go','regelwerk_vergleich');
\echo [7] Admin fordert den Vergleich an, Werkstatt nimmt ihn -> regelwerk_vergleich
:ADM
select ws_projekt_aktion_anfordern('trainer-to-go','regelwerk_vergleich') \g /dev/null
select art from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a1');
\echo [8] Vergleich mit Pfad „..“ -> FEHLER
select ws_regelwerk_vergleich_melden('00000000-0000-0000-0000-0000000000a1',(select id from ws_projekt_aktionen where art='regelwerk_vergleich'),:'A1',:'A2','[{"art":"M","pfad":"../x.md"}]');
\echo [9] Vergleich mit fremdem Schlüssel -> FEHLER
select ws_regelwerk_vergleich_melden('00000000-0000-0000-0000-0000000000a1',(select id from ws_projekt_aktionen where art='regelwerk_vergleich'),:'A1',:'A2','[{"art":"M","pfad":"a.md","text":"x"}]');
\echo [10] Vergleich vom fremden PC -> FEHLER
select ws_regelwerk_vergleich_melden('00000000-0000-0000-0000-0000000000d1',(select id from ws_projekt_aktionen where art='regelwerk_vergleich'),:'A1',:'A2','[]');
\echo [11] Gültiger Vergleich -> OK (Aktion fertig, 2 Dateien)
select ws_regelwerk_vergleich_melden('00000000-0000-0000-0000-0000000000a1',(select id from ws_projekt_aktionen where art='regelwerk_vergleich'),:'A1',:'A2','[{"art":"M","pfad":"global/AGENTS.md"},{"art":"A","pfad":"docs/core/neu.md"}]') \g /dev/null
select a.stand, jsonb_array_length(p.regelwerk_vergleich -> 'dateien') dateien from ws_projekte p join ws_projekt_aktionen a on a.projekt_id = p.id and a.art = 'regelwerk_vergleich' where p.id = 'trainer-to-go';
\echo [12] Zweite Meldung zur fertigen Aktion -> FEHLER
select ws_regelwerk_vergleich_melden('00000000-0000-0000-0000-0000000000a1',(select id from ws_projekt_aktionen where art='regelwerk_vergleich'),:'A1',:'A2','[]');
\echo [13] Entwickler übernimmt -> FEHLER
:DEV
select ws_regelwerk_uebernehmen('trainer-to-go',:'A2');
\echo [14] Admin übernimmt eine andere als die verglichene Fassung -> FEHLER
:ADM
select ws_regelwerk_uebernehmen('trainer-to-go','3333333333333333333333333333333333333333');
\echo [15] Admin übernimmt die verglichene Fassung -> OK (2222, Vergleich geleert, Protokoll)
select ws_regelwerk_uebernehmen('trainer-to-go',:'A2') \g /dev/null
select left(regelwerk_fassung, 4) fassung, regelwerk_vergleich is null leer from ws_projekte where id = 'trainer-to-go';
reset role; select was, details ->> 'von' is not null von, left(details ->> 'nach', 4) nach from ws_protokoll where was like 'regelwerk%' order by id; set role authenticated;
\echo [16] Nochmal übernehmen -> FEHLER
:ADM
select ws_regelwerk_uebernehmen('trainer-to-go',:'A2');
\echo [17] Lampe „sicherungen“ -> OK
select ws_anbindungen_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','{"sicherungen":{"stand":"gruen","text":"3 Sicherung(en) · letzte 02.11.26, 14:05 (Repo-Stand)"},"setup":{"stand":"gruen","text":"1 Version(en) · letzte v0.13.1"}}') \g /dev/null
select anbindungen -> 'sicherungen' ->> 'stand' sicherungen from ws_projekte where id = 'vereinsheft';
\echo [18] Entwickler sieht die Fassung (lesen) -> 2222
:DEV
select left(regelwerk_fassung, 4) fassung from ws_projekte where id = 'trainer-to-go';
