# Liga Ziomków — Mundial Typer 2026

Prywatna aplikacja typu typer piłkarski dla czterech osób:

- Marcin
- Fabian
- Hubert
- Kamil

## Funkcje

- logowanie przez Supabase,
- wspólne dane online,
- ranking na żywo,
- typowanie wyników,
- panel admina do wpisywania oficjalnych wyników,
- blokada zmiany typu po rozpoczęciu meczu,
- grupy A–L Mundialu 2026,
- PWA — stronę można dodać na ekran telefonu.

## Pliki SQL

W folderze `sql` są dwa pliki:

1. `supabase_schema.sql` — tworzy tabele, widok rankingu, zasady RLS i Realtime.
2. `seed_matches_worldcup2026.sql` — dodaje mecze fazy grupowej.

Jeżeli schemat bazy został już utworzony wcześniej, wystarczy uruchomić tylko:

```sql
sql/seed_matches_worldcup2026.sql
```

## Deploy

Wgraj wszystkie pliki do repozytorium GitHub i poczekaj na automatyczny deploy w Vercel.

Jeżeli Vercel nie zrobi automatycznego deploya, kliknij w projekcie:

`Deployments → Redeploy`

## Supabase

Konfiguracja publiczna jest w `config.js`.

Użyty klucz to anon/public key, czyli klucz przeznaczony do frontendu. Nie wolno tutaj wpisywać `service_role`, `secret key` ani żadnego klucza administracyjnego.
