-- Rechte-Test Datenbank 0055 (Projektordner, Regeln, Testseite, Datenbank-Wunsch) – Claude, Entwurf freigegeben von Gerhard 02.11.2026 07:04
-- Voraussetzung: frische Datenbank mit mock2.sql, dann alle Migrationen bis 0055 eingespielt (läuft auch ohne die übrigen Tests).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set FREMD 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000f'',false) \\g /dev/null'
:ADM
insert into ws_einladungen(email,rolle,eingeladen_von,projekt_id) values ('dev@x.at','entwickler',auth.uid(),'trainer-to-go');
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,admin_pc) values ('00000000-0000-0000-0000-0000000000a1',auth.uid(),'PC-Admin',true,true);
select ws_projekt_anlegen('vereinsheft','Vereinsheft','Test','kresak-it-solutions/vereinsheft','layers') \g /dev/null
select ws_projekt_technik('vereinsheft','web','keine') \g /dev/null
select ws_projekt_anlegen('werkzeug-x','Werkzeug X','Test','kresak-it-solutions/werkzeug-x','layers') \g /dev/null
select ws_projekt_technik('werkzeug-x','werkzeug','keine') \g /dev/null
select ws_projekt_anlegen('ohne-repo','Ohne Repo','Test',null,'layers') \g /dev/null
:DEV
select ws_einladung_annehmen('Dev') \g /dev/null
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000d1',auth.uid(),'PC-Dev',true);

\echo [1] Admin meldet Stand für eigenen PC -> OK (2 Zeilen: trainer-to-go ok, vereinsheft fehlt)
:ADM
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000a1','[{"projekt":"trainer-to-go","stand":"ok","konflikte":1,"hinweis":"Projektregel widerspricht der Sicherheit"},{"projekt":"vereinsheft","stand":"fehlt","hinweis":"Festplatte fehlt"}]') \g /dev/null
select projekt_id, stand, konflikte, hinweis from ws_projektordner_stand order by projekt_id;
\echo [2] Admin mit fremdem PC -> FEHLER
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000d1','[{"projekt":"trainer-to-go","stand":"ok"}]');
\echo [3] Hinweis mit Pfad -> FEHLER
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000a1','[{"projekt":"trainer-to-go","stand":"ok","hinweis":"E:\\Projekte\\trainer-to-go"}]');
\echo [4] Unbekannter Stand -> FEHLER
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000a1','[{"projekt":"trainer-to-go","stand":"irgendwas"}]');
\echo [5] Unbekannter Schlüssel (pfad) -> FEHLER
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000a1','[{"projekt":"trainer-to-go","stand":"ok","pfad":"E:"}]');
\echo [6] Direkt schreiben -> FEHLER
insert into ws_projektordner_stand(pc_id,projekt_id,stand) values ('00000000-0000-0000-0000-0000000000a1','ohne-repo','ok');
\echo [7] Entwickler sieht nur Projekte, in denen er Mitglied ist -> 1 Zeile (trainer-to-go)
:DEV
select projekt_id, stand from ws_projektordner_stand order by projekt_id;
\echo [8] Entwickler meldet für ein fremdes Projekt -> wird übergangen (0 neue Zeilen), für sein Projekt -> OK
select ws_projektordner_melden('00000000-0000-0000-0000-0000000000d1','[{"projekt":"vereinsheft","stand":"ok"},{"projekt":"trainer-to-go","stand":"umzug_wartet","hinweis":"Umzug wartet auf Auftrag #3"}]') \g /dev/null
:ADM
select p.name pc, s.projekt_id, s.stand from ws_projektordner_stand s join ws_werkstatt_pcs p on p.id = s.pc_id order by 1, 2;
\echo [9] Fremder ohne Projekt sieht nichts -> 0 Zeilen
:FREMD
select count(*) from ws_projektordner_stand;

\echo [10] Ampel mit Lampen projektordner und regeln -> OK
:ADM
select ws_anbindungen_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','{"projektordner":{"stand":"gruen","text":"verknüpft"},"regeln":{"stand":"rot","text":"Projektregel widerspricht"}}') \g /dev/null
select anbindungen -> 'regeln' ->> 'stand' regeln from ws_projekte where id = 'vereinsheft';
\echo [11] Ampel mit unbekannter Lampe -> FEHLER
select ws_anbindungen_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','{"pfad":{"stand":"gruen","text":"E:"}}');

\echo [12] Testseite für ein Werkzeug -> FEHLER
select ws_projekt_aktion_anfordern('werkzeug-x','testseite');
\echo [13] Testseite ohne Repository -> FEHLER
select ws_projekt_aktion_anfordern('ohne-repo','testseite');
\echo [14] Entwickler fordert Testseite an -> FEHLER
:DEV
select ws_projekt_aktion_anfordern('trainer-to-go','testseite');
\echo [15] Admin fordert Testseite an -> OK, Stand laeuft
:ADM
select ws_projekt_aktion_anfordern('vereinsheft','testseite') > 0 angefordert;
select testseite_stand from ws_projekte where id = 'vereinsheft';
\echo [16] Nochmal sofort -> FEHLER (läuft schon)
select ws_projekt_aktion_anfordern('vereinsheft','testseite');
\echo [17] Werkstatt nimmt die Aktion -> art testseite
select art from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a1');
\echo [18] Melden mit falscher Adresse -> FEHLER
select ws_testseite_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','eingerichtet','vereinsheft.boese.example',null,(select id from ws_projekt_aktionen where projekt_id='vereinsheft' and art='testseite'));
\echo [19] Entwickler meldet -> FEHLER
:DEV
select ws_testseite_melden('00000000-0000-0000-0000-0000000000d1','vereinsheft','eingerichtet','vereinsheft.pages.dev');
\echo [20] Admin meldet Lotse -> OK, Aktion fertig, Stand lotse
:ADM
select ws_testseite_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','lotse',null,'Git-Anbindung fehlt',(select id from ws_projekt_aktionen where projekt_id='vereinsheft' and art='testseite')) \g /dev/null
select p.testseite_stand, a.stand aktion from ws_projekte p join ws_projekt_aktionen a on a.projekt_id = p.id and a.art = 'testseite' where p.id = 'vereinsheft';
\echo [21] Lotse erledigt: ohne Aktion eingerichtet -> OK, Adressen eingetragen
select ws_testseite_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','eingerichtet','vereinsheft-abc.pages.dev','Automatisch eingetragen') \g /dev/null
select testseite_stand, vorschau_domain, test_url, live_url from ws_projekte where id = 'vereinsheft';
\echo [22] Ohne Aktion, Stand nicht lotse -> FEHLER
select ws_testseite_melden('00000000-0000-0000-0000-0000000000a1','vereinsheft','eingerichtet','andere.pages.dev');
\echo [23] Testseite nochmal anfordern, obwohl eingerichtet -> FEHLER
reset role; update ws_projekt_aktionen set geaendert = now() - interval '1 hour'; set role authenticated;
:ADM
select ws_projekt_aktion_anfordern('vereinsheft','testseite');

\echo [24] Datenbank wünschen ohne Kosten-Bestätigung -> FEHLER
select ws_datenbank_wuenschen('vereinsheft', false);
\echo [25] Entwickler wünscht -> FEHLER
:DEV
select ws_datenbank_wuenschen('trainer-to-go', true);
\echo [26] Admin mit Bestätigung -> OK (gewünscht = t), zurückziehen -> f
:ADM
select ws_datenbank_wuenschen('vereinsheft', true) \g /dev/null
select datenbank_wunsch is not null gewuenscht, datenbank from ws_projekte where id = 'vereinsheft';
select ws_datenbank_wuenschen('vereinsheft', false, false) \g /dev/null
select datenbank_wunsch is not null gewuenscht from ws_projekte where id = 'vereinsheft';
\echo [27] Protokoll hat Testseite und Datenbank-Wunsch -> testseite 2, datenbank_wunsch 2
select was, count(*) from ws_protokoll where was in ('testseite','datenbank_wunsch') group by was order by was;
