# Liga Ziomków v4.1 — Auto Drabinka na bieżąco

Ta paczka dodaje automatyczne uzupełnianie drabinki na bieżąco — po zakończeniu każdej grupy można podmienić znane miejsca 1A, 2A itd., bez czekania na koniec całej fazy grupowej.

Co robi:
- liczy tabele grup A–L,
- ustala 1A, 2A i 3A itd.,
- wybiera 8 najlepszych drużyn z trzecich miejsc,
- używa tabeli kombinacji FIFA dla wariantów najlepszych trzecich miejsc,
- podmienia mecze 73–88 z placeholderów na nazwy drużyn,
- po wpisaniu wyniku meczu pucharowego przenosi zwycięzcę dalej,
- po półfinałach przenosi przegranych do meczu o 3. miejsce.

Wrzucasz pliki strony do GitHuba, czekasz na Vercel, logujesz się jako Marcin i po zakończeniu dowolnej grupy klikasz Drabinka → Aktualizuj automatycznie. Najlepsze trzecie miejsca zostaną dodane dopiero po zakończeniu wszystkich grup.

Jeżeli po punktach, bilansie i golach jest idealny remis, aplikacja nie zgaduje fair play/rankingu. Pokaże komunikat i trzeba ręcznie potwierdzić kolejność.


## v4.1
Poprawka komunikatów i logiki przy częściowej aktualizacji drabinki. Przycisk działa po każdej grupie z kompletem wyników i nie straszy wymaganiem zakończenia całego turnieju dla miejsc 1/2. Trzecie miejsca nadal czekają na komplet grup.


## v4.3
Poprawka nazewnictwa po polsku: pierwsza runda pucharowa to 1/16 finału, kolejna to 1/8 finału. Wartości techniczne `round_of_32` i `round_of_16` zostają w bazie tylko jako kody wewnętrzne.


## v4.3
- Auto drabinka nie blokuje już całej grupy przez remis, który nie dotyczy danego slotu.
- Sloty 1A/2A itd. uzupełniają się osobno, jeśli konkretna pozycja jest jasna.
- Komunikat pokazuje dokładnie, które sloty zostały wpisane i co pominięto.
