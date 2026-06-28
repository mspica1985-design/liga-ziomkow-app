# Liga Ziomków v4.5 — typ nie przenosi zwycięzcy dalej

Poprawka bezpieczeństwa:

- typ gracza w fazie pucharowej zapisuje się tylko w tabeli `predictions`;
- wybór zwycięzcy w typie NIE aktualizuje kolejnej rundy;
- zwycięzca przechodzi do następnego meczu dopiero po wejściu admina w `Wyniki` i zapisaniu oficjalnego wyniku;
- auto-drabinka i ręczna korekta par nie propagują zwycięzców do kolejnych rund;
- panel wyników nie pozwala rozliczyć meczu pucharowego przed startem meczu.

Wgraj do GitHuba: `index.html`, `app.js`, `styles.css`, `sw.js`, `README.md`.

Opcjonalnie, jeśli 1/8 została już błędnie uzupełniona przez wcześniejszą wersję, uruchom w Supabase plik:

`sql/04_reset_unplayed_next_rounds.sql`

Ten plik resetuje tylko nierozliczone mecze 89–104 do placeholderów W73/W75 itd. Nie rusza meczów 73–88 ani typów.
