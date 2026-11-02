-- Prüfung Datenbank 0054 (Baustein-Kennungen Design-System 2.0) – Claude, Anweisung Gerhard 01.11.2026 22:18/22:38, gebaut 02.11.2026
-- Voraussetzung: mock2.sql, alle Migrationen bis 0054. Erwartung in der \echo-Zeile.
\set QUIET 1
\pset footer off
\echo [1] neue Kennungen -> t
select public.ws_bausteine_ok('{"knopf-zweit":{"ecken":8},"knopf-text":{"groesse":"klein"},"symbolknopf":{"groesse":"gross"},"status-pill-ok":{"hell":{"bg":"#ecfdf5"}},"status-pill-warn":{},"status-pill-bad":{},"status-pill-info":{},"hauptkarte":{"ecken":16}}');
\echo [2] alte Kennungen weiter erlaubt -> t
select public.ws_bausteine_ok('{"knopf-neben":{"ecken":8},"knopf-leise":{},"knopf-symbol":{}}');
\echo [3] unbekannte Kennung, falsche Form, fremdes Feld -> f, f, f
select public.ws_bausteine_ok('{"knopf-xyz":{"ecken":8}}');
select public.ws_bausteine_ok('{"status-pill-ok":{"hell":{"bg":"red"}}}');
select public.ws_bausteine_ok('{"hauptkarte":{"css":"x"}}');
\echo [4] über ws_design_werte_ok (Design-Chat) -> t
select public.ws_design_werte_ok('{"bausteine":{"status-pill-bad":{"dunkel":{"text":"#fecaca"}}}}');
