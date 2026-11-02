# Rechte-Tests Codeschmiede (ws_*)

Unabhängige Prüfung 2026-10-22: Datenbank v1 GEPRÜFT (df1c7b2), v2 mit Projekten GEPRÜFT (e85816d).
Ablauf in einem lokalen Postgres 16: `mock2.sql` (stellt Supabase nach) → `../migrations/0001_grundlage.sql` → `../migrations/0002_projekte_verbrauch.sql`
→ Tests `t3v2.sql` (Rollen, Angriffe), `t4.sql` (Stände der Admin-Stationen), `t5.sql` (Trennung der Projekte), `t6.sql` (Mitglieder sichtbar nur bei gemeinsamem Projekt, Verbrauch, Einladungen).
Nur erfundene Test-Konten.

Ab Datenbank v11: `t12_abgleich.sql` (Projekt-Abgleich: nur eigener PC, nur Admin/Entwickler, nur erlaubte Pfade, nur lesen für Mitglieder).
Ab Datenbank v12: `t13_ki.sql` (KI-Anbieter: nur Admin stellt ein, Bauen nur Claude, Kopplung nur eigener PC, Konzept im Vorschlag).
Ab Datenbank v13: `t14_projekt_loeschen.sql` (Projekte archivieren/löschen: nur Admin, Name als Bestätigung, gesperrt bei laufendem Auftrag, anderes Projekt unberührt).
Ab Datenbank v15: `t15_bezuege.sql` (Feature-Bezüge: gleiches Projekt, Auftragsrecht, Nachziehen-Hinweis, Vorschläge feature_neu/bezug). v14/v16/v17 ändern nur Prüffunktionen (Schema), getestet über t13 und ws_design_werte_ok.
Ab Datenbank v18: `t16_ki_frei.sql` (eigene KI-Anbieter: nur Admin, nur Programmname ohne Pfad/Shell-Zeichen, Zulassung je PC wird bei Änderung zurückgesetzt).
Ab Datenbank v36: `t30_design_auftrag.sql` (Aufträge aus dem App-Designer: Auftrag + Nachricht in einem Schritt, nur mit Design-Recht, Eingaben begrenzt, nichts halb angelegt).
Ab Datenbank 0041: `t35_kachel_chat.sql` (Chat zur Kachel: strenges Kachel-Schema, KI-Wunsch nur im erlaubten Format, Werkstatt bekommt den Wunsch mit, ungültiger Vorschlag wird verworfen).
Ab Datenbank 0050: `t37_unterhaltungen.sql` (Unterhaltungen nur eigene, Fragen nur in eigener Unterhaltung, Antwort trägt die Unterhaltung, Anhänge nur eigener Ordner/Typ/≤ 5, Speicher `ws-chat` nur eigene Person, Limits-Knopf höchstens alle 15 s, Löschen entfernt Nachrichten).
Ab Datenbank v42: `t36_aufgaben.sql` (Aufgaben: sehen alle Mitglieder des Projekts, bearbeiten Admin/Entwickler/Texter, Zuständig nur Projekt-Mitglieder, Bezug nur im eigenen Projekt, Links nur https ohne Zugangsdaten, Anhänge nur reserviert/typ- und größengeprüft/≤ 20, privater Speicher nach Projekt, In den Chat schicken, Als Auftrag mit Auftragsrecht, Löschen nur Ersteller/Admin). `mock2.sql` bildet dafür den Speicher (storage.buckets/objects) nach.
Ab Datenbank 0051: `t38_sicherheit.sql` (Sicherheitspaket 01.11.2026: Werkstatt-Nachrichten nur über `ws_werkstatt_nachricht` vom eigenen PC, „Immer erlauben“ nur für die kurze Liste, PC-Name begrenzt, `baustein.text` wird verworfen). Hinweis: Die alten Tests `t3v2.sql`/`t5.sql` schreiben Werkstatt-Zeilen noch direkt – ab 0051 ist das bewusst ein FEHLER.
Ab Datenbank 0052: `t39_station_neu.sql` (Station „Erneut versuchen“ nur mit Recht „freigeben“, nur aus einer angehaltenen bzw. fehlerhaften Station, gemerkte Prüfung bleibt; läuft nach `t38_sicherheit.sql`).
Ab Datenbank 0053: `t40_push.sql` (Push aufs Handy: Geräte nur eigene und nur bekannte Push-Dienste, Warteschlange und Abholen nur mit Dienst-Schlüssel, Auslöser Erlaubnis/Rückfrage/Freigabe/Station an die Richtigen, Texte ohne Befehl und Namen, höchstens alle 2 Minuten, Gerät weg nach 410, Test-Knopf höchstens 1/Minute; läuft nach `t38` und `t39`).
Ab Datenbank 0055: `t42_projektordner.sql` (Projektordner-Stand nur eigener PC, nur sichtbare Projekte, Hinweise ohne Pfad, keine fremden Schlüssel; Ampel-Lampen projektordner/regeln; Testseite nur Admin, nur Web/Handy mit Repository, Ergebnis nur von der Werkstatt des Admins mit gültiger pages.dev-Adresse, Lotse ohne Aktion nur aus „lotse“; Datenbank-Wunsch nur Admin mit bestätigten Kosten; läuft auf frischer Datenbank).
Ab Datenbank 0054: `t41_design_kennungen.sql` (Baustein-Kennungen Design-System 2.0: neue und alte Kennungen erlaubt, Unbekanntes und falsche Formen abgelehnt, auch über `ws_design_werte_ok`).
Ab Datenbank 0056: `t43_regelwerk_sicherungen.sql` (Regelwerk-Fassung: erste Fassung nur Werkstatt des Admins und nur einmal, Vergleich nur Admin und nur von der Werkstatt, die die Aktion hält, Dateiliste nur sichere Pfade, Übernehmen nur Admin und nur die verglichene Fassung, Protokoll; keine direkten Schreibrechte; Lampe „sicherungen“; läuft nach `t42_projektordner.sql`).
