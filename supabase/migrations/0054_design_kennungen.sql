-- Codeschmiede · Datenbank 0054: Design-Chat auf die Baustein-Kennungen des Design-Systems 2.0 (Trainer to go, App-Designer 3.0).
-- Claude, Anweisung Gerhard 01.11.2026 22:18/22:38 („alles freigegeben, keine Rückfragen“), gebaut 02.11.2026.
-- ws_bausteine_ok (Stand 0037) kannte nur die 20 Kennungen des App-Designers 2.0. Jetzt: die 25 Kennungen wie Trainer to go
-- src/lib/design/bausteine.js (BAUSTEINE) – umbenannt knopf-neben → knopf-zweit, knopf-leise → knopf-text, knopf-symbol → symbolknopf;
-- neu status-pill-ok/-warn/-bad/-info und hauptkarte. Die drei alten Kennungen bleiben ERLAUBT (nur erweitert, nichts verboten):
-- Programme bis 0.12.0 und ältere Gespräche funktionieren weiter; die Weboberfläche ab 0.12.1 schickt nur noch neue Kennungen.
-- Höchstzahl Bausteine je Vorschlag 30 → 40. Sonst unverändert (Felder, Formen, Grenzen wie 0037).
-- NICHT automatisch eingespielt (supabase/einspielen.txt bleibt unverändert) – Gerhard spielt es ein, siehe docs/KONZEPT.md › Design-Chat.
-- Ohne 0054 lehnt die Datenbank Fragen und Vorschläge des Baustein-Chats zu den neuen Kennungen ab (Meldung im Chat), alles andere läuft.
-- Mehrfach ausführbar. Reihenfolge 0001 → … → 0054.

begin;

create or replace function public.ws_bausteine_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare id text; w jsonb; k text; x jsonb; m text; f jsonb;
  -- Design-System 2.0 (gleich wie Trainer to go src/lib/design/bausteine.js, web/src/bausteinKatalog.js, desktop/dienst/lib/design.mjs) …
  ids constant text[] := array['knopf-haupt','knopf-zweit','knopf-umriss','knopf-text','knopf-gefahr','symbolknopf','eingabe','schalter',
    'abzeichen-haupt','abzeichen-neben','abzeichen-umriss','abzeichen-gefahr','status-zugesagt','status-offen',
    'status-pill-ok','status-pill-warn','status-pill-bad','status-pill-info','karte','hauptkarte','kachel-kennzahl',
    'tabelle','liste','symbol-kachel','datei',
  -- … und die alten Kennungen aus App-Designer 2.0 (Programm bis 0.12.0 und ältere Gespräche) – die App bildet sie auf die neuen ab
    'knopf-neben','knopf-leise','knopf-symbol'];
begin
  if p is null or jsonb_typeof(p) <> 'object' or (select count(*) from jsonb_object_keys(p)) > 40 then return false; end if;
  for id, w in select * from jsonb_each(p) loop
    if not (id = any(ids)) or jsonb_typeof(w) <> 'object' then return false; end if;
    for k, x in select * from jsonb_each(w) loop
      if k in ('hell', 'dunkel') then
        if jsonb_typeof(x) <> 'object' then return false; end if;
        if exists (select 1 from jsonb_each(x) e where e.key not in ('bg', 'text', 'rand') or jsonb_typeof(e.value) <> 'string'
                     or (e.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$') then return false; end if;
      elsif k = 'ecken' then
        if jsonb_typeof(x) <> 'number' or (x)::numeric not between 0 and 32 then return false; end if;
      elsif k = 'groesse' then
        if jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('klein', 'mittel', 'gross') then return false; end if;
      elsif k = 'symbol' then
        if jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[A-Z][A-Za-z0-9]{1,40}$' then return false; end if;
      else
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;
revoke execute on function public.ws_bausteine_ok(jsonb) from public, anon;
grant execute on function public.ws_bausteine_ok(jsonb) to authenticated;

commit;
