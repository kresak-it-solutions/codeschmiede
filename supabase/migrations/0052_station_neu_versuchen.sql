-- Codeschmiede · Datenbank 0052: Station nach Fehlern „Erneut versuchen“ (Befund L1 vom 01.11.2026, docs/BEFUNDE-2026-11-01.md)
-- Anweisung Gerhard 01.11.2026 22:18/22:38. Der Werkstatt-Dienst (0.10.2) startet eine Station nach einem Fehler höchstens dreimal neu
-- (Pause 1 → 5 → 30 Minuten) und setzt sie dann auf „angehalten“. Neu anstoßen darf, wer im Bereich freigeben darf (oder der Admin).
-- Eine schon grün geprüfte Fassung (gepr_sha) bleibt gemerkt – es gibt keine neue, teure Prüfung desselben Stands.
-- Mehrfach ausführbar.

begin;

create or replace function public.ws_station_neu_versuchen(p_auftrag bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a public.ws_auftraege; p jsonb;
begin
  select * into a from public.ws_auftraege where id = p_auftrag for update;
  if a.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  if not public.ws_darf(public.ws_bereich_von_gruppe(a.gruppe_id), 'freigeben') then
    raise exception 'Keine Berechtigung in diesem Bereich';
  end if;
  if a.stand not in ('sicherheit','feature') then raise exception 'Der Auftrag steht in keiner Prüf-Station'; end if;
  p := coalesce(a.pruefung -> a.stand, '{}'::jsonb);
  if coalesce(p ->> 'ergebnis', '') not in ('angehalten','fehler','wartet') then raise exception 'Die Station ist nicht angehalten'; end if;
  update public.ws_auftraege
     set pruefung = jsonb_set(a.pruefung, array[a.stand],
           jsonb_strip_nulls(jsonb_build_object('ergebnis', 'wartet', 'befund', 'Von Hand neu angestoßen', 'zeit', now(), 'versuche', 0,
             'gepr_sha', p -> 'gepr_sha', 'gepr_main', p -> 'gepr_main', 'gepr_ki', p -> 'gepr_ki', 'gepr_befund', p -> 'gepr_befund',
             'test_sha', p -> 'test_sha'))),
         geaendert = now()
   where id = p_auftrag;
  insert into public.ws_protokoll (wer, was, details) values (auth.uid(), 'station_neu', jsonb_build_object('auftrag', p_auftrag, 'station', a.stand));
end $$;
revoke execute on function public.ws_station_neu_versuchen(bigint) from public, anon;
grant execute on function public.ws_station_neu_versuchen(bigint) to authenticated;

commit;
