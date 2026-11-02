-- Rechte-Test Datenbank 0053 (Push aufs Handy, Befund L3) – Claude, Anweisung Gerhard 01.11.2026 22:18/22:38, gebaut 02.11.2026
-- Voraussetzung: wie t39 (mock2.sql, alle Migrationen bis 0053), t38 und t39 vorher gelaufen (Konten E1 mit Recht freigeben, E2 ohne; Auftrag S-T1).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung).
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set E1  'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-0000000000e1'',false) \\g /dev/null'
\set E2  'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-0000000000e2'',false) \\g /dev/null'
\set K1 '''BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'''
\set A1 '''tBHItJI5svbpez7KI4CCXg'''

\echo [1] E2 meldet ein Gerät mit fremdem Dienst an -> FEHLER
:E2
select ws_push_abo_speichern('https://boese.example.com/push/abc', :K1, :A1, 'Android');
\echo [2] E2 mit kaputtem Schlüssel -> FEHLER
select ws_push_abo_speichern('https://fcm.googleapis.com/fcm/send/abc:APA91b-x', 'kurz', :A1, 'Android');
\echo [3] E2 mit http statt https -> FEHLER
select ws_push_abo_speichern('http://fcm.googleapis.com/fcm/send/abc', :K1, :A1, 'Android');
\echo [4] E1 meldet iPhone an -> OK (id), Gerätename bereinigt
:E1
select ws_push_abo_speichern('https://web.push.apple.com/QGxq-Abc_123', :K1, :A1, 'iPhone <script>') > 0 as ok;
select geraet from ws_push_abos;
\echo [5] E2 sieht das Abo von E1 nicht -> 0
:E2
select count(*) from ws_push_abos;
\echo [6] E2 schreibt direkt in ws_push_abos -> FEHLER
insert into ws_push_abos(benutzer_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000e1','https://fcm.googleapis.com/x','x','y');
\echo [7] E2 liest die Warteschlange -> FEHLER
select * from ws_push_warteschlange;
\echo [8] E2 ruft ws_push_abholen / ws_push_eintragen -> FEHLER, FEHLER
select * from ws_push_abholen(10);
select ws_push_eintragen('00000000-0000-0000-0000-0000000000e2','test','x','y','/','t');
\echo [9] E2 löscht fremdes Abo über die Funktion -> bleibt (1 Abo bei E1)
select ws_push_abo_loeschen('https://web.push.apple.com/QGxq-Abc_123');
reset role; select count(*) abos_e1 from ws_push_abos where benutzer_id = '00000000-0000-0000-0000-0000000000e1'; set role authenticated;

\echo [10] Neue Erlaubnis-Anfrage zu S-T1 -> 1 Eintrag für E1 (Recht freigeben, hat Gerät), keiner für E2 (kein Recht), Admin ohne Gerät -> nichts
reset role;
insert into ws_erlaubnisse(auftrag_id, werkzeug, eingabe, grund) values ((select id from ws_auftraege where titel='S-T1'), 'Bash', 'npm install geheim', 'Max Muster');
select b.name, w.art, w.titel, w.text, w.url from ws_push_warteschlange w join ws_benutzer b on b.id = w.benutzer_id order by w.id;
\echo [11] Text enthält keinen Befehl und keinen Namen -> f
select bool_or(text ~* 'npm|geheim|Muster' or titel ~* 'npm|geheim|Muster') from ws_push_warteschlange;
\echo [12] Zweite Erlaubnis gleich danach -> keine weitere Zeile (2 Minuten) -> 1
insert into ws_erlaubnisse(auftrag_id, werkzeug, eingabe) values ((select id from ws_auftraege where titel='S-T1'), 'Bash', 'ls');
select count(*) from ws_push_warteschlange;
\echo [13] Rückfrage: Auftrag von E1 geht auf „frage“ -> Eintrag rueckfrage für E1
update ws_auftraege set stand='laeuft', pruefung='{}' where titel='S-T1';
update ws_auftraege set stand='frage' where titel='S-T1';
select art, text from ws_push_warteschlange where art='rueckfrage';
\echo [14] Freigabe bereit -> Eintrag freigabe für E1
update ws_auftraege set stand='freigabe' where titel='S-T1';
select art, text from ws_push_warteschlange where art='freigabe';
\echo [15] Station angehalten -> Eintrag station; nochmal gleich -> kein zweiter
update ws_auftraege set stand='feature', pruefung='{"feature":{"ergebnis":"fehler","versuche":3}}' where titel='S-T1';
update ws_auftraege set pruefung='{"feature":{"ergebnis":"angehalten","versuche":4}}' where titel='S-T1';
update ws_auftraege set pruefung='{"feature":{"ergebnis":"angehalten","versuche":4,"befund":"x"}}' where titel='S-T1';
select art, text, url from ws_push_warteschlange where art='station';
\echo [16] Abholen (Dienst) -> 4 Zeilen mit je 1 Gerät; zweites Abholen -> 0
select count(*), min(jsonb_array_length(abos)) from ws_push_abholen(50);
select count(*) from ws_push_abholen(50);
\echo [17] Ergebnis: Gerät weg (410) -> Abo gelöscht
select ws_push_ergebnis((select min(id) from ws_push_warteschlange), 0, '410', '{}', array['https://web.push.apple.com/QGxq-Abc_123'], '{}');
select count(*) abos from ws_push_abos;
\echo [18] Ohne Gerät: neue Erlaubnis -> keine neue Zeile
select count(*) vorher from ws_push_warteschlange;
insert into ws_erlaubnisse(auftrag_id, werkzeug, eingabe) values ((select id from ws_auftraege where titel='S-T1'), 'Bash', 'pwd');
select count(*) nachher from ws_push_warteschlange;
set role authenticated;
\echo [19] Test-Nachricht ohne Gerät -> FEHLER; mit Gerät -> OK; gleich nochmal -> FEHLER
:E1
select ws_push_test();
select ws_push_abo_speichern('https://fcm.googleapis.com/fcm/send/dX1:APA91bH-abc_DEF', :K1, :A1, 'Android') > 0 as ok;
select ws_push_test();
select ws_push_test();
\echo [20] Gerät an eine andere Person weitergegeben (gleiche Adresse, E2) -> gehört jetzt E2, E1 hat keins
:E2
select ws_push_abo_speichern('https://fcm.googleapis.com/fcm/send/dX1:APA91bH-abc_DEF', :K1, :A1, 'Android') > 0 as ok;
reset role; select b.name, count(*) from ws_push_abos a join ws_benutzer b on b.id = a.benutzer_id group by b.name; set role authenticated;
\echo [20b] E1 will dasselbe Gerät mit anderen Schlüsseln übernehmen -> FEHLER (Review #60)
:E1
select ws_push_abo_speichern('https://fcm.googleapis.com/fcm/send/dX1:APA91bH-abc_DEF', :K1, 'AAAAAAAAAAAAAAAAAAAAAA', 'Android');
:E2
\echo [21] E2 entfernt das eigene Gerät -> 0
select ws_push_abo_loeschen('https://fcm.googleapis.com/fcm/send/dX1:APA91bH-abc_DEF');
select count(*) from ws_push_abos;
reset role;
\echo [22] Rolle im Projekt (Review #60): E1 hat Recht „freigeben“, ist im Projekt aber nur Texter -> keine Meldung (0 neue Zeilen)
set role authenticated;
:E1
select ws_push_abo_speichern('https://web.push.apple.com/E1-neu_1', :K1, :A1, 'iPhone') > 0 as ok;
reset role;
update ws_projekt_mitglieder set rolle = 'texter' where benutzer_id = '00000000-0000-0000-0000-0000000000e1' and projekt_id = 'trainer-to-go';
select count(*) into temp vorher22 from ws_push_warteschlange;
insert into ws_erlaubnisse(auftrag_id, werkzeug, eingabe) values ((select id from ws_auftraege where titel='S-T1'), 'Bash', 'whoami');
select (select count(*) from ws_push_warteschlange) - (select count from vorher22) as neu;
\echo [23] wieder Entwickler im Projekt -> 1 neue Zeile
update ws_projekt_mitglieder set rolle = 'entwickler' where benutzer_id = '00000000-0000-0000-0000-0000000000e1' and projekt_id = 'trainer-to-go';
delete from ws_push_warteschlange where tag like 'erlaubnis-%';
insert into ws_erlaubnisse(auftrag_id, werkzeug, eingabe) values ((select id from ws_auftraege where titel='S-T1'), 'Bash', 'id');
select count(*) neu from ws_push_warteschlange where tag like 'erlaubnis-%';
\echo [24] E1 deaktiviert: Abholen liefert die Zeile ohne Geräte -> 0
update ws_benutzer set aktiv = false where id = '00000000-0000-0000-0000-0000000000e1';
select jsonb_array_length(abos) geraete from ws_push_abholen(50);
update ws_benutzer set aktiv = true where id = '00000000-0000-0000-0000-0000000000e1';
\echo [25] Bremse: erster Lauf 0, sofort danach > 0
update ws_push_lauf set zuletzt = 'epoch';
select ws_push_bremse() = 0 as erster, ws_push_bremse() > 0 as zweiter_wartet;
\echo [26] E2 ruft die Bremse -> FEHLER
set role authenticated;
:E2
select ws_push_bremse();
reset role;

