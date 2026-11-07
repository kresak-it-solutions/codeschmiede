# Updates & Freigabe · Abgleich mit main (Codeschmiede 0.20.0)

**Anweisung Gerhard 07.11.2026 21:07:** „Die Codeschmiede muss jetzt wieder auf aktuellen Stand gebracht werden. Bei Trainer to go hat sich richtig viel getan. Auch das mit den Updates muss Codeschmiede übernehmen.“
**Antworten 21:12:** Updates – „Gleicher Weg in beiden (Empfohlen)“ · Abgleich – „Automatisch nachziehen (Empfohlen)“ · alte Entwürfe – „Verwerfen (Empfohlen)“.
**Entwurf freigegeben 21:16** („passt so“): klickbarer Entwurf „Codeschmiede Updates & Abgleich“ (Artefakt, drei Reiter).

## 1. Ausgangslage (Abgleich 07.11.2026)
- In Trainer to go kamen seit 03.11. 104 Pull Requests auf main, alle aus Claude-Chats; in der Codeschmiede wurde nichts gebaut, sie stand auf dem 03.11.
- Neu in der App: Menüpunkte Übungsbibliothek (Sport), Social Media (Leitung), Updates & Freigabe (ERP › Produkt) und viele Features (Sprinttest, Wechselspiel, Einwilligungen, Medien, Einladung/App holen, „Was ist neu?“ …).
- **Konflikt:** Trainer to go schaltet neue Funktionen seit 07.11. nur per Klick in Plattform › Produkt › Updates & Freigabe live (Ablauf `freigabe.yml`, sofort oder 22:00, „Was ist neu?“, Verlauf, Zurück). Der Knopf „Live schalten“ der Codeschmiede setzte den Zweig `live` direkt – am Verlauf, an „Was ist neu?“ und an der Datenbank vorbei.

## 2. Updates & Freigabe – ein Weg für Plattform und Codeschmiede
- Hat ein Projekt `.github/workflows/freigabe.yml`, startet die Codeschmiede **genau diesen Ablauf** (über die GitHub-Anmeldung des Admin-PCs, `gh workflow run`) und setzt `live` nie selbst. Ohne Ablauf bleibt alles wie bisher („Weg bis live“).
- „Heute 22:00“ liegt nicht in einer Datenbank, sondern als Zweig `freigabe/geplant` in GitHub (Ablauf art=planen/zuruecknehmen). Ausgelöst wird er vom Zeitplan der App (art=abend) und als Reserve vom Ablauf selbst um 22:05. Beide Seiten sehen denselben Stand.
- Wer was live geschaltet hat, steht im Titel jedes Laufs: `Freigabe <art> <ziel> (<Name> · Plattform|Codeschmiede)`.
- Die Werkstatt des Admins meldet alle 3 Minuten den Stand (`ws_freigabe_stand`): wartende Pull Requests (live…main), Datenbank-Änderungen, „Was ist neu?“ (Einträge in `src/lib/neuigkeiten.json`, die noch nicht live sind), Plan, Verlauf, Versionen zum Zurückgehen (nur frühere Live-Stände).
- Geht live außerhalb der Codeschmiede (Plattform, Fehlerbehebung direkt live), entsteht eine Version „extern“; Feature-Stände folgen der Features-Datei im Live-Stand.
- Sicherheit: nur der Admin fordert an; nur sein eingeschalteter PC (Dienst ab 0.20.0) nimmt den Auftrag; „jetzt“/„22:00“ nur genau für den gesehenen Stand von main; zurück nur auf gemeldete frühere Live-Versionen; der Ablauf prüft alles noch einmal (nur vorwärts, Stand auf main). Ein älterer Dienst bekommt solche Aufträge nicht.

## 3. Abgleich mit main (automatisch)
- Für Projekte mit Aufbau-Datei (`ws_projekte.aufbau_datei`, bei Trainer to go `src/lib/appStruktur.js` + `appStruktur.features.json`) liest die Werkstatt des Admins nach jedem neuen Stand von main Aufbau und Features. Die Aufbau-Datei wird **nie ausgeführt**: `lib/aufbau.mjs` liest nur ein Objekt-Literal (Zeichenketten, Zahlen, Listen, Objekte, Kommentare) und bricht bei allem anderen ab.
- `ws_aufbau_abgleichen` gleicht Obergruppen, Menüpunkte (Gruppen) und Features an – die App ist die Quelle: neue werden angelegt, verschobene/umbenannte nachgezogen, Feature-Stand „live“, wenn die Nummer im Live-Stand steht, sonst „test“.
- Was in der App fehlt, wird **nur markiert** (`ws_gruppen.app_fehlt`, `ws_features.fehlt_im_verzeichnis`); ausbauen bzw. entfernen bestätigt der Admin im Reiter „Abgleich“.
- Offene Aufbau-Änderungen der Codeschmiede (noch nicht per „In die App übernehmen“ in der App) halten den Abgleich an – nichts wird überschrieben.
- Pull Requests der letzten 30 Tage, die nicht aus der Codeschmiede kommen (Zweig nicht `feature/cs-…`), stehen in `ws_chat_arbeit`, mit den Feature-Nummern, die sie in der Features-Datei neu eingetragen haben. Sie sind **keine** Aufträge (die Auftrags-Abläufe und Prüfungen der Codeschmiede gelten für sie nicht) – sie zeigen nur, was gebaut wurde.
- Konzepte und Dokumentation aus main kommen wie bisher automatisch in die Wissensdatenbank (Abgleich alle 10 Minuten, `ws_dokumente`).

## 4. Aufgeräumt
Entwürfe #21, #26 („Aufbau übernehmen“, überholt) und #28–#30 (Excel-Spielerimport, läuft über den Link-Sync) verworfen – `supabase/admin/0002_alte_entwuerfe_verwerfen.sql`, je mit Eintrag im Entscheidungsprotokoll. „Doku-Gerüst anlegen“ bleibt offen.

## 5. Technik
- Datenbank `0064_updates_abgleich.sql` (Test `supabase/tests/t52_updates_abgleich.sql`), Dienst `lib/freigabe.mjs`, `lib/aufbau.mjs`, `index.mjs` (`liveUeberAblauf`, `freigabeStandArbeit`, `aufbauAbgleich`), Tests `test/updates.test.mjs`.
- Oberfläche `web/src/seiten/Updates.jsx` (Menü „Ablauf“ › Updates & Freigabe); „Zu erledigen › Weg bis live“ verweist bei Projekten mit Ablauf dorthin.
- In Trainer to go (Zweig `feature/freigabe-gemeinsam`): `freigabe.yml` mit art=planen/zuruecknehmen/abend und Reserve-Zeitplan, Plattform-Funktion `updateFreigabe` auf den Merker umgestellt (`docs/FREIGABE.md`).

## Handbuch
**Updates & Freigabe** (Menü „Ablauf“)
1. *Warten auf Freigabe*: Liste der Änderungen, die auf der Testseite sind, aber noch nicht live – mit Art (Neu/Fix), Herkunft (Codeschmiede-Auftrag oder Claude-Chat) und Hinweis auf Datenbank-Änderungen. Darunter die „Was ist neu?“-Texte je Rolle.
2. **Alle freigeben – jetzt live**: fragt einmal nach, dann startet die Werkstatt den Ablauf „Freigabe live“ des Projekts. Nach 1–3 Minuten ist die Seite gebaut.
3. **Heute um 22:00 live**: merkt genau den gesehenen Stand; um 22:00 geht er live. Bis dahin „Zurücknehmen“. Nach 22:00 geplant heißt: morgen 22:00.
4. *Verlauf*: jede Freigabe aus Codeschmiede und Plattform. *Notfall*: Version wählen → „Zurück auf diese Version …“ → bestätigen. Nur Versionen, die schon einmal live waren; die Datenbank bleibt.
5. *Abgleich mit main*: zeigt, was zuletzt aus der App nachgezogen wurde, was in der App entfernt wurde (ausbauen per Knopf) und was in Claude-Chats gebaut wurde.
Voraussetzung: Die Codeschmiede läuft auf dem Admin-PC (ab Version 0.20.0) und ist bei GitHub angemeldet.
