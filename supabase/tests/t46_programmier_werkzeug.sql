-- Rechte-Test Datenbank 0057 (Programmier-Werkzeug je Projekt, 0.14.0) – Claude, Entwurf freigegeben von Gerhard 02.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0057 (0057 gern zweimal). Läuft für sich allein (eigene Konten/PCs).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set FREMD 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000f'',false) \\g /dev/null'
\set OK17 '''[{"id":"erlaubt","ok":true},{"id":"regeln","ok":true},{"id":"setup","ok":true},{"id":"nachbar","ok":true},{"id":"projektregeln","ok":true},{"id":"git","ok":true},{"id":"link","ok":true},{"id":"daten","ok":true},{"id":"hart","ok":true},{"id":"start_env","ok":true},{"id":"start_git","ok":true},{"id":"start_python","ok":true},{"id":"start_osascript","ok":true},{"id":"start_skript","ok":true},{"id":"lesen_ssh","ok":true},{"id":"lesen_zugang","ok":true},{"id":"lesen_projekte","ok":true}]'''
:ADM
insert into ws_einladungen(email,rolle,eingeladen_von,projekt_id) values ('dev@x.at','entwickler',auth.uid(),'trainer-to-go');
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,admin_pc) values ('00000000-0000-0000-0000-0000000000a1',auth.uid(),'PC-Admin',true,true);
select ws_projekt_anlegen('vereinsheft','Vereinsheft','Test','kresak-it-solutions/vereinsheft','layers') \g /dev/null
:DEV
select ws_einladung_annehmen('Dev') \g /dev/null
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000d1',auth.uid(),'PC-Dev-Mac',true);
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000d2',auth.uid(),'PC-Dev-ohne-Meldung',true);
\echo [0] PC ohne gemeldetes Betriebssystem: Codex „sperrbar“ -> FEHLER (Erlaubnisliste: nur darwin)
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d2','codex','{"installiert":true,"sperrbar":true}');
update ws_werkstatt_pcs set faehigkeiten = '{"plattform":"darwin"}' where id = '00000000-0000-0000-0000-0000000000d1';

\echo [1] Bestehende und neue Projekte programmieren mit Claude Code -> 0 Zeilen mit anderem Werkzeug, vereinsheft/bauen = claude-code
reset role;
select count(*) andere from ws_ki_zustaendigkeit where werkzeug <> 'claude-code';
select werkzeug, werkzeug_modell from ws_ki_zustaendigkeit where projekt_id = 'vereinsheft' and aufgabe = 'bauen';
set role authenticated;

\echo [2] Entwickler stellt das Werkzeug ein -> FEHLER (nur Admin)
:DEV
select ws_werkzeug_setzen('trainer-to-go','codex',null);
\echo [3] Admin wählt Codex ohne bestandenen Sperren-Test -> FEHLER
:ADM
select ws_werkzeug_setzen('trainer-to-go','codex',null);
\echo [4] Admin: unbekanntes Werkzeug -> FEHLER; Claude Code mit Modell -> FEHLER; OpenCode-Modell ohne Anbieter -> FEHLER
select ws_werkzeug_setzen('trainer-to-go','cursor',null);
select ws_werkzeug_setzen('trainer-to-go','claude-code','opus');
select ws_werkzeug_setzen('trainer-to-go','opencode','gpt-5');

\echo [5] Entwickler meldet für den eigenen PC: Codex installiert, angemeldet, Test bestanden -> OK
:DEV
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','codex',('{"installiert":true,"angemeldet":true,"version":"0.166.0","sperrbar":true,"test":"bestanden","test_version":"0.166.0","test_zeit":"2026-11-02T12:00:00Z","test_punkte":'||:OK17||',"hinweis":"Sperren-Test bestanden"}')::jsonb) \g /dev/null
select werkzeug, installiert, angemeldet, version, test from ws_werkzeug_stand;
\echo [6] Meldung für einen fremden PC -> FEHLER
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000a1','codex','{"installiert":false}');
\echo [7] „bestanden“ mit anderer Version -> FEHLER; mit einem roten Punkt -> FEHLER; mit doppelter Kennung -> FEHLER; unbekannter Schlüssel -> FEHLER; Hinweis mit Pfad -> FEHLER; Soll-Version vom PC -> FEHLER
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','opencode',('{"installiert":true,"version":"2.2.5","sperrbar":true,"test":"bestanden","test_version":"2.2.4","test_punkte":'||:OK17||'}')::jsonb);
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','opencode','{"installiert":true,"version":"2.2.5","sperrbar":true,"test":"bestanden","test_version":"2.2.5","test_punkte":[{"id":"erlaubt","ok":true},{"id":"regeln","ok":false},{"id":"setup","ok":true},{"id":"nachbar","ok":true},{"id":"projektregeln","ok":true},{"id":"git","ok":true},{"id":"link","ok":true},{"id":"daten","ok":true},{"id":"hart","ok":true},{"id":"start_env","ok":true},{"id":"start_git","ok":true},{"id":"start_python","ok":true},{"id":"start_osascript","ok":true},{"id":"start_skript","ok":true},{"id":"lesen_ssh","ok":true},{"id":"lesen_zugang","ok":true},{"id":"lesen_projekte","ok":true}]}');
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','opencode','{"installiert":true,"version":"2.2.5","sperrbar":true,"test":"bestanden","test_version":"2.2.5","test_punkte":[{"id":"erlaubt","ok":true},{"id":"regeln","ok":true},{"id":"setup","ok":true},{"id":"nachbar","ok":true},{"id":"projektregeln","ok":true},{"id":"git","ok":true},{"id":"link","ok":true},{"id":"daten","ok":true},{"id":"hart","ok":true},{"id":"start_env","ok":true},{"id":"start_git","ok":true},{"id":"start_python","ok":true},{"id":"start_osascript","ok":true},{"id":"start_skript","ok":true},{"id":"lesen_ssh","ok":true},{"id":"lesen_zugang","ok":true},{"id":"regeln","ok":true}]}');
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli','{"auth_datei":"…"}');
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli','{"hinweis":"Fehler in /Users/gerhard/x"}');
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli','{"installiert":true,"version":"9.9.9","soll_version":"9.9.9"}');
\echo [7b] „bestanden“ für eine Version, die nicht die Soll-Version des Servers ist -> FEHLER; Soll-Version steht vom Server in der Zeile -> codex | 0.166.0
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','opencode',('{"installiert":true,"version":"9.9.9","sperrbar":true,"test":"bestanden","test_version":"9.9.9","test_punkte":'||:OK17||'}')::jsonb);
select werkzeug, soll_version from ws_werkzeug_stand where werkzeug = 'codex';
\echo [8] Admin-PC meldet ein installiertes Werkzeug -> FEHLER
:ADM
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000a1','codex','{"installiert":true,"version":"0.166.0"}');
\echo [9] Admin-PC: Installieren anfordern -> FEHLER; Prüfen -> OK
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000a1','codex','installieren');
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000a1','codex','pruefen') \g /dev/null
\echo [10] Admin fordert eine Aktion auf dem PC des Entwicklers an -> FEHLER (nur eigener PC); unbekannte Aktion -> FEHLER
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000d1','codex','test');
:DEV
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000d1','codex','loeschen');
\echo [11] Entwickler fordert den Sperren-Test an -> OK, zweite Anforderung gleich danach -> FEHLER (läuft schon)
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000d1','opencode','test') \g /dev/null
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000d1','opencode','test');
\echo [12] Werkstatt meldet „erledigt“ -> Aktion leer, Hinweis bleibt, wenn keiner mitkommt -> opencode | (leer) | Wartet …
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','opencode','{"aktion_erledigt":true}') \g /dev/null
select werkzeug, aktion, left(hinweis, 12) hinweis from ws_werkzeug_stand where werkzeug = 'opencode';
\echo [13] Direkt schreiben -> FEHLER (kein Schreibrecht)
update ws_werkzeug_stand set test = 'bestanden' where werkzeug = 'opencode';
insert into ws_werkzeug_stand(pc_id, werkzeug, test) values ('00000000-0000-0000-0000-0000000000d1','gemini-cli','bestanden');
\echo [14] Sichtbarkeit: Fremder sieht 0 Zeilen, Entwickler nur die eigenen (2: codex, opencode), Admin alle (3)
:FREMD
select count(*) from ws_werkzeug_stand;
:DEV
select count(*) from ws_werkzeug_stand;
:ADM
select count(*) from ws_werkzeug_stand;

\echo [15] Admin wählt Codex (Test auf dem Entwickler-PC bestanden) mit Modell -> OK, trainer-to-go/bauen = codex/gpt-5.5-codex
select ws_werkzeug_setzen('trainer-to-go','codex','gpt-5.5-codex') \g /dev/null
select werkzeug, werkzeug_modell from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';
\echo [16] Gemini ohne bestandenen Test -> FEHLER; Zurück auf Claude Code geht immer -> (unten wieder Codex)
select ws_werkzeug_setzen('trainer-to-go','gemini-cli',null);
\echo [17] Andere Aufgaben können kein fremdes Werkzeug haben -> FEHLER (Prüfregel der Tabelle)
reset role;
update ws_ki_zustaendigkeit set werkzeug = 'codex' where projekt_id = 'trainer-to-go' and aufgabe = 'chat';
set role authenticated;
\echo [18] Die Zuständigkeit „bauen“ über die alte Funktion speichern lässt das Werkzeug stehen -> codex
:ADM
select ws_ki_zustaendigkeit_setzen('trainer-to-go','bauen','[{"anbieter":"claude"}]'::jsonb, 90) \g /dev/null
select werkzeug from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';
\echo [19] Protokoll: werkzeug_gewaehlt und werkzeug_aktion vermerkt -> 1 | 2
reset role;
select (select count(*) from ws_protokoll where was = 'werkzeug_gewaehlt') gewaehlt, (select count(*) from ws_protokoll where was = 'werkzeug_aktion') aktionen;
set role authenticated;

\echo [20] Auftrag mit Werkzeug anlegen -> FEHLER (setzt nur die Werkstatt)
:ADM
insert into ws_auftraege(gruppe_id,titel,erstellt_von,werkzeug) values ('kader','W-1',auth.uid(),'codex');
insert into ws_auftraege(id,gruppe_id,titel,erstellt_von) values (9001,'kader','W-2',auth.uid()), (9002,'kader','W-3',auth.uid());
\echo [21] Werkstatt übernimmt mit falschem Werkzeug (Projekt sagt Codex) -> FEHLER
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'claude-code' where id = 9001;
\echo [22] Admin-PC übernimmt mit Codex -> FEHLER
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000a1', werkzeug = 'codex' where id = 9001;
\echo [23] Werkstatt übernimmt mit Codex -> OK; danach Werkzeug ändern -> FEHLER (auch der Admin)
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'codex' where id = 9001;
select id, werkzeug from ws_auftraege where id = 9001;
update ws_auftraege set werkzeug = 'claude-code' where id = 9001;
\echo [24] Projekt wechselt auf Claude Code: laufender Auftrag behält Codex, neuer bekommt Claude Code -> 9001 codex | 9002 claude-code
select ws_werkzeug_setzen('trainer-to-go','claude-code',null) \g /dev/null
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000a1', werkzeug = 'claude-code' where id = 9002;
update ws_auftraege set wartet_auf = 'wartet auf OpenAI Codex CLI: nicht angemeldet' where id = 9001;
select id, werkzeug from ws_auftraege where id in (9001, 9002) order by id;
\echo [25] Warte-Hinweis über 200 Zeichen -> FEHLER
update ws_auftraege set wartet_auf = repeat('x', 201) where id = 9001;

\echo [26] Für anon nicht aufrufbar -> FEHLER (4x)
reset role;
set role anon;
select ws_werkzeug_setzen('trainer-to-go','codex',null);
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','codex','{}');
select ws_werkzeug_aktion('00000000-0000-0000-0000-0000000000d1','codex','pruefen');
select count(*) from ws_werkzeug_stand;
reset role;
\echo [27] Hilfsfunktion des Auftrags-Schutzes nicht direkt aufrufbar, alle neuen Funktionen SECURITY DEFINER mit search_path -> 0 ohne
select count(*) ohne from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ws_werkzeug_melden','ws_werkzeug_aktion','ws_werkzeug_setzen','ws_auftraege_werkzeug_schutz')
   and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'));
set role authenticated;
:ADM
select ws_auftraege_werkzeug_schutz();
reset role;
\echo [30] Gemini CLI: „bestanden“ mit richtiger Version und allen Punkten -> FEHLER; „sperrbar“ -> FEHLER; nur „installiert“ melden -> OK
set role authenticated;
:DEV
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli',('{"installiert":true,"angemeldet":true,"version":"0.64.0","sperrbar":true,"test":"bestanden","test_version":"0.64.0","test_punkte":'||:OK17||'}')::jsonb);
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli','{"installiert":true,"sperrbar":true}');
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','gemini-cli','{"installiert":true,"sperrbar":false,"sperre_grund":"Gemini CLI gesperrt"}') \g /dev/null
\echo [31] Admin speichert Gemini CLI -> FEHLER (gesperrt)
:ADM
select ws_werkzeug_setzen('vereinsheft','gemini-cli',null);
\echo [32] PC meldet Linux: Codex „bestanden“ -> FEHLER; danach Speichern von Codex für trainer-to-go -> FEHLER (kein erlaubter Entwickler-PC mehr)
:DEV
update ws_werkstatt_pcs set faehigkeiten = '{"plattform":"linux"}' where id = '00000000-0000-0000-0000-0000000000d1';
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','codex',('{"installiert":true,"angemeldet":true,"version":"0.166.0","sperrbar":true,"test":"bestanden","test_version":"0.166.0","test_punkte":'||:OK17||'}')::jsonb);
:ADM
select ws_werkzeug_setzen('trainer-to-go','codex',null);
\echo [33] Wieder macOS: Codex „bestanden“ -> OK, Speichern für trainer-to-go -> OK (codex)
:DEV
update ws_werkstatt_pcs set faehigkeiten = '{"plattform":"darwin"}' where id = '00000000-0000-0000-0000-0000000000d1';
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','codex',('{"installiert":true,"angemeldet":true,"version":"0.166.0","sperrbar":true,"test":"bestanden","test_version":"0.166.0","test_punkte":'||:OK17||'}')::jsonb) \g /dev/null
:ADM
select ws_werkzeug_setzen('trainer-to-go','codex',null) \g /dev/null
select werkzeug from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';
reset role;
\echo [28] Erneutes Einspielen von 0057 ändert nichts an der Wahl -> (Werte wie vorher, siehe [29])
\ir ../migrations/0057_programmier_werkzeug.sql
\set QUIET 1
\echo [29] Nach dem Einspielen: trainer-to-go/bauen = codex (aus [33]), Auftrag 9001 = codex, Stand-Zeilen 4
select (select werkzeug from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'bauen') projekt,
       (select werkzeug from ws_auftraege where id = 9001) auftrag, (select count(*) from ws_werkzeug_stand) staende;
