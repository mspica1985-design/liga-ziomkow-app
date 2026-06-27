# Liga Ziomków v4.4 — ręczna korekta par

Poprawka dodaje panel admina w zakładce **Drabinka**:

- **Aktualizuj znane miejsca** — automat dalej uzupełnia to, co potrafi.
- **Ręczna korekta** — Marcin może wpisać konkretne drużyny w meczach 73–88, w tym drużyny z 3. miejsc.

To jest zabezpieczenie na sytuację, gdy oficjalnie wiadomo już kto gra, ale automatyczna tabela nie może bezpiecznie rozpoznać układu trzecich miejsc albo różni się od oficjalnego komunikatu FIFA.

Nie trzeba ruszać Supabase SQL. Wystarczy wrzucić pliki do GitHuba.
