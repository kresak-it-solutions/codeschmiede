-- Rechte-Test Datenbank 0058 (Bestehendes Projekt einlesen) – Claude, Entwurf „Projekt einlesen“ freigegeben von Gerhard 02.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0058 (0057 nicht nötig), danach t42_projektordner.sql (Konten, PCs, Projekte).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set APC '''00000000-0000-0000-0000-0000000000a1'''
\set DPC '''00000000-0000-0000-0000-0000000000d1'''
\set Q1 '''0123456789abcdef0123456789abcdef'''
\set Q2 '''fedcba9876543210fedcba9876543210'''

\echo [1] Entwickler fordert Einlesen an -> FEHLER
:DEV
select ws_einlesen_anfordern(:Q1,'zip','thermax.zip');
\echo [2] Admin mit Pfad als Name -> FEHLER
:ADM
select ws_einlesen_anfordern(:Q1,'zip','D:\Downloads\thermax.zip');
\echo [3] Admin mit ungültiger Quelle -> FEHLER
select ws_einlesen_anfordern('../x','zip','thermax.zip');
\echo [4] Admin fordert an -> OK, gleiche Quelle nochmal -> FEHLER
select ws_einlesen_anfordern(:Q1,'zip','thermax.zip') \g /dev/null
select ws_einlesen_anfordern(:Q1,'zip','thermax.zip');
\echo [5] Direkt schreiben -> FEHLER
update ws_einlesen set stand = 'geprueft';
insert into ws_einlesen(quelle,quelle_art,quelle_name) values (:Q2,'zip','x.zip');
\echo [6] Entwickler sieht nichts -> 0
:DEV
select count(*) from ws_einlesen;
\echo [7] Werkstatt ohne passende Quelle nimmt nichts -> 0 Zeilen; mit Quelle -> pruefung
:ADM
select count(*) from ws_einlesen_nehmen(:APC, array[:Q2]);
select stand from ws_einlesen_nehmen(:APC, array[:Q1]);
\echo [8] Entwickler-Werkstatt nimmt -> 0 Zeilen (nur Admin)
:DEV
select count(*) from ws_einlesen_nehmen(:DPC, array[:Q1]);
\echo [9] Bericht mit Inhalt -> FEHLER; mit Pfad im Hinweis -> FEHLER
:ADM
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'geprueft','{"einheiten":[],"geheim":[{"pfad":".env","inhalt":"sk-xyz"}]}');
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'fehler',null,null,'Fehler in C:\Users\gerhard\x');
\echo [10] Falscher Übergang (vorschlag aus pruefung) -> FEHLER
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'vorschlag',null,'{"gruppen":[]}');
\echo [11] Gültiger Bericht -> geprueft
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'geprueft','{"dateien":3,"einheiten":[{"name":"src","ordner":true,"ziel":"code"}],"geheim":[{"pfad":".env","anzahl":2}]}') \g /dev/null
select stand, bericht->'geheim'->0->>'anzahl' anzahl from ws_einlesen where quelle=:Q1;
\echo [12] Starten mit Projekt, das schon ein Repository hat -> FEHLER
select ws_einlesen_starten((select id from ws_einlesen where quelle=:Q1),'vereinsheft','{}');
\echo [13] Starten mit unbekanntem Ziel -> FEHLER
select ws_projekt_anlegen('thermax','Thermax Planer','',null,'layers') \g /dev/null
select ws_einlesen_starten((select id from ws_einlesen where quelle=:Q1),'thermax','{"zuordnung":{"src":"irgendwo"}}');
\echo [14] Entwickler startet -> FEHLER
:DEV
select ws_einlesen_starten((select id from ws_einlesen where quelle=:Q1),'thermax','{}');
\echo [15] Admin startet -> einlesen, Werkstatt nimmt -> einlesen_laeuft
:ADM
select ws_einlesen_starten((select id from ws_einlesen where quelle=:Q1),'thermax','{"zuordnung":{"src":"code"},"personen":[],"wissen":true}') \g /dev/null
select stand from ws_einlesen_nehmen(:APC, array[:Q1]);
\echo [15b] Repository-Kennung merken: fremder PC -> FEHLER; gültig -> gemerkt; andere Kennung -> FEHLER; ungültige node_id -> FEHLER
select ws_einlesen_repo_merken(:DPC,(select id from ws_einlesen where quelle=:Q1),4711,'R_kgDOAbc');
select ws_einlesen_repo_merken(:APC,(select id from ws_einlesen where quelle=:Q1),4711,'R_kgDOAbc') \g /dev/null
select repo_id, repo_node_id from ws_einlesen where quelle=:Q1;
select ws_einlesen_repo_merken(:APC,(select id from ws_einlesen where quelle=:Q1),4712,'R_kgDOXyz');
select ws_einlesen_repo_merken(:APC,(select id from ws_einlesen where quelle=:Q1),4711,'R_kg/../x');
\echo [16] Fremder Repository-Name -> FEHLER
select ws_einlesen_repo(:APC,(select id from ws_einlesen where quelle=:Q1),'kresak-it-solutions/anderes');
\echo [17] Repository vom fremden PC -> FEHLER
select ws_einlesen_repo(:DPC,(select id from ws_einlesen where quelle=:Q1),'kresak-it-solutions/thermax');
\echo [18] Repository melden -> privat eingetragen, Aufgabe offen (nicht gestartet), Test & Live einrichten angefordert, kein Auftrag
select ws_einlesen_repo(:APC,(select id from ws_einlesen where quelle=:Q1),'kresak-it-solutions/thermax') \g /dev/null
select repo, repo_privat from ws_projekte where id = 'thermax';
select titel, status, prioritaet from ws_aufgaben where projekt_id = 'thermax';
select art, stand from ws_live_auftraege where projekt_id = 'thermax';
select count(*) auftraege from ws_auftraege a join ws_gruppen g on g.id = a.gruppe_id join ws_bereiche b on b.id = g.bereich_id where b.projekt_id = 'thermax';
\echo [19] Nochmal melden -> FEHLER (hat schon ein Repository)
select ws_einlesen_repo(:APC,(select id from ws_einlesen where quelle=:Q1),'kresak-it-solutions/thermax');
\echo [20] Vorschlag mit Gruppe „Konzept“ -> FEHLER; mit Steuerzeichen -> FEHLER
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'vorschlag',null,'{"gruppen":[{"name":"Konzept","features":[]}]}');
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'vorschlag',null,'{"gruppen":[{"name":"<script>","features":[]}]}');
\echo [21] Gültiger Vorschlag -> vorschlag
select ws_einlesen_melden(:APC,(select id from ws_einlesen where quelle=:Q1),'vorschlag',null,'{"gruppen":[{"name":"Planung","features":[{"name":"Wochenplan","beschreibung":"Plan je Woche"},{"name":"Auftragsliste"}]},{"name":"Kunden","features":[{"name":"Kundenkarte"}]}]}') \g /dev/null
select stand from ws_einlesen where quelle=:Q1;
\echo [22] Entwickler übernimmt -> FEHLER
:DEV
select ws_einlesen_uebernehmen((select id from ws_einlesen where quelle=:Q1),'{"gruppen":[]}');
\echo [23] Admin übernimmt nur „Planung“ mit einem Feature -> 1, fertig, Gruppe im Bereich App, Feature Stand test, Konzept-Gruppe bleibt
:ADM
select ws_einlesen_uebernehmen((select id from ws_einlesen where quelle=:Q1),'{"gruppen":[{"name":"Planung","features":[{"name":"Wochenplan"}]}]}');
select stand from ws_einlesen where quelle=:Q1;
select g.name, g.bereich_id, f.name feature, f.stand from ws_gruppen g left join ws_features f on f.gruppe_id = g.id where g.id like 'thermax-planung%';
select count(*) konzept from ws_gruppen where id = 'thermax-konzept';
\echo [24] Zweites Übernehmen -> FEHLER
select ws_einlesen_uebernehmen((select id from ws_einlesen where quelle=:Q1),'{"gruppen":[]}');
\echo [25] Abbrechen nach dem Einlesen -> FEHLER; vor dem Einlesen -> abgebrochen
select ws_einlesen_abbrechen((select id from ws_einlesen where quelle=:Q1));
select ws_einlesen_anfordern(:Q2,'ordner','thermax-planer') \g /dev/null
select ws_einlesen_abbrechen((select id from ws_einlesen where quelle=:Q2)) \g /dev/null
select stand from ws_einlesen where quelle=:Q2;
\echo [26] Protokoll -> angefordert, geprueft, gestartet, repo, vorschlag, fertig, abgebrochen
select was from ws_protokoll where was like 'einlesen_%' order by id;
\echo [27] anon darf nichts -> FEHLER
reset role; set role anon;
select ws_einlesen_anfordern(:Q2,'zip','x.zip');
