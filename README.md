# Liga Ziomków v2 — drabinka Mundialu 2026

Ta paczka dodaje fazę pucharową do istniejącej strony `ligaziomkow.pl` bez kasowania obecnych danych.

## Najważniejsze

Nie uruchamiaj żadnych komend `drop table`, `truncate` ani `delete`. Ta aktualizacja dodaje tylko kolumny i mecze 73–104.

## Kolejność wdrożenia

1. W Supabase zrób kontrolny backup/liczniki.
2. W SQL Editor odpal `sql/01_knockout_schema_update.sql`.
3. W SQL Editor odpal `sql/02_seed_knockout_matches.sql`.
4. Wrzuć pliki strony z tej paczki do GitHuba i nadpisz stare.
5. Poczekaj na deploy Vercel.
6. Otwórz `https://ligaziomkow.pl` i sprawdź zakładkę `Drabinka`.

## Co dodaje wersja v2

- zakładkę `Drabinka`,
- mecze 73–104,
- typowanie awansu w fazie pucharowej,
- wpisywanie awansu przez admina,
- opcjonalne karne,
- ranking v2: 3 pkt za dokładny wynik, 1 pkt za trafione rozstrzygnięcie lub awans,
- zachowanie blokady typów po rozpoczęciu meczu.

## Uwaga o trzecich miejscach

W meczach 1/32 z trzecimi miejscami użyte są seed-y typu `3A/B/C/D/F`. Konkretna drużyna zależy od tego, które osiem trzecich miejsc awansuje. Możesz później ręcznie podmienić `home_team`/`away_team` w Supabase, zostawiając `home_seed`/`away_seed` jako informację o źródle miejsca.
