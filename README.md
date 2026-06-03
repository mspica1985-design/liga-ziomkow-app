# Liga Ziomków

Prywatna strona typu **typer piłkarski** dla czterech graczy:

- Marcin
- Fabian
- Hubert
- Kamil

## Co jest w tej wersji

- ranking graczy,
- wpisywanie typów,
- wpisywanie oficjalnych wyników,
- automatyczne liczenie punktów,
- podział na grupy A–L,
- eksport/import danych,
- tryb PWA — można dodać stronę do ekranu głównego telefonu.

## Punktacja

- 3 punkty — dokładny wynik,
- 1 punkt — trafione rozstrzygnięcie,
- 0 punktów — nietrafiony typ.

## Ważne

Ta pierwsza wersja zapisuje dane lokalnie w przeglądarce. Żeby czterech graczy widziało te same typy i punkty na żywo na różnych telefonach, kolejnym etapem będzie podpięcie bazy online, np. Supabase.

## Deploy na Vercel

1. Wejdź na Vercel.
2. Kliknij **Add New → Project**.
3. Wybierz repozytorium `liga-ziomkow-app`.
4. Kliknij **Deploy**.
5. Po publikacji dodaj domenę `ligaziomkow.pl` w ustawieniach projektu.
