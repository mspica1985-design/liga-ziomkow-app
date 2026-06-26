-- Liga Ziomków v2 — mecze fazy pucharowej 73–104
-- Ten plik dodaje tylko nowe mecze. Nie kasuje fazy grupowej, typów ani wyników.
-- kickoff_at jest zapisany w UTC; aplikacja pokazuje czas UK.

insert into public.matches (
  match_no, stage, group_code, home_team, away_team, home_seed, away_seed, kickoff_at,
  next_match_no, winner_to_slot, loser_next_match_no, loser_to_slot
) values
  (73, 'round_of_32', 'KO', '2A', '2B', '2A', '2B', '2026-06-28 19:00:00+00', 90, 'home', null, null),
  (74, 'round_of_32', 'KO', '1E', '3A/B/C/D/F', '1E', '3A/B/C/D/F', '2026-06-29 20:30:00+00', 89, 'home', null, null),
  (75, 'round_of_32', 'KO', '1F', '2C', '1F', '2C', '2026-06-30 01:00:00+00', 90, 'away', null, null),
  (76, 'round_of_32', 'KO', '1C', '2F', '1C', '2F', '2026-06-29 17:00:00+00', 91, 'home', null, null),
  (77, 'round_of_32', 'KO', '1I', '3C/D/F/G/H', '1I', '3C/D/F/G/H', '2026-06-30 21:00:00+00', 89, 'away', null, null),
  (78, 'round_of_32', 'KO', '2E', '2I', '2E', '2I', '2026-06-30 17:00:00+00', 91, 'away', null, null),
  (79, 'round_of_32', 'KO', '1A', '3C/E/F/H/I', '1A', '3C/E/F/H/I', '2026-07-01 01:00:00+00', 92, 'home', null, null),
  (80, 'round_of_32', 'KO', '1L', '3E/H/I/J/K', '1L', '3E/H/I/J/K', '2026-07-01 16:00:00+00', 92, 'away', null, null),
  (81, 'round_of_32', 'KO', '1D', '3B/E/F/I/J', '1D', '3B/E/F/I/J', '2026-07-02 00:00:00+00', 94, 'home', null, null),
  (82, 'round_of_32', 'KO', '1G', '3A/E/H/I/J', '1G', '3A/E/H/I/J', '2026-07-01 20:00:00+00', 94, 'away', null, null),
  (83, 'round_of_32', 'KO', '2K', '2L', '2K', '2L', '2026-07-02 23:00:00+00', 93, 'home', null, null),
  (84, 'round_of_32', 'KO', '1H', '2J', '1H', '2J', '2026-07-02 19:00:00+00', 93, 'away', null, null),
  (85, 'round_of_32', 'KO', '1B', '3E/F/G/I/J', '1B', '3E/F/G/I/J', '2026-07-03 03:00:00+00', 96, 'home', null, null),
  (86, 'round_of_32', 'KO', '1J', '2H', '1J', '2H', '2026-07-03 22:00:00+00', 95, 'home', null, null),
  (87, 'round_of_32', 'KO', '1K', '3D/E/I/J/L', '1K', '3D/E/I/J/L', '2026-07-04 01:30:00+00', 96, 'away', null, null),
  (88, 'round_of_32', 'KO', '2D', '2G', '2D', '2G', '2026-07-03 18:00:00+00', 95, 'away', null, null),
  (89, 'round_of_16', 'KO', 'W74', 'W77', 'W74', 'W77', '2026-07-04 21:00:00+00', 97, 'home', null, null),
  (90, 'round_of_16', 'KO', 'W73', 'W75', 'W73', 'W75', '2026-07-04 17:00:00+00', 97, 'away', null, null),
  (91, 'round_of_16', 'KO', 'W76', 'W78', 'W76', 'W78', '2026-07-05 20:00:00+00', 99, 'home', null, null),
  (92, 'round_of_16', 'KO', 'W79', 'W80', 'W79', 'W80', '2026-07-06 00:00:00+00', 99, 'away', null, null),
  (93, 'round_of_16', 'KO', 'W83', 'W84', 'W83', 'W84', '2026-07-06 19:00:00+00', 98, 'home', null, null),
  (94, 'round_of_16', 'KO', 'W81', 'W82', 'W81', 'W82', '2026-07-07 00:00:00+00', 98, 'away', null, null),
  (95, 'round_of_16', 'KO', 'W86', 'W88', 'W86', 'W88', '2026-07-07 16:00:00+00', 100, 'home', null, null),
  (96, 'round_of_16', 'KO', 'W85', 'W87', 'W85', 'W87', '2026-07-07 20:00:00+00', 100, 'away', null, null),
  (97, 'quarterfinal', 'KO', 'W89', 'W90', 'W89', 'W90', '2026-07-09 20:00:00+00', 101, 'home', null, null),
  (98, 'quarterfinal', 'KO', 'W93', 'W94', 'W93', 'W94', '2026-07-10 19:00:00+00', 101, 'away', null, null),
  (99, 'quarterfinal', 'KO', 'W91', 'W92', 'W91', 'W92', '2026-07-11 21:00:00+00', 102, 'home', null, null),
  (100, 'quarterfinal', 'KO', 'W95', 'W96', 'W95', 'W96', '2026-07-12 01:00:00+00', 102, 'away', null, null),
  (101, 'semifinal', 'KO', 'W97', 'W98', 'W97', 'W98', '2026-07-14 19:00:00+00', 104, 'home', 103, 'home'),
  (102, 'semifinal', 'KO', 'W99', 'W100', 'W99', 'W100', '2026-07-15 19:00:00+00', 104, 'away', 103, 'away'),
  (103, 'third_place', 'KO', 'L101', 'L102', 'L101', 'L102', '2026-07-18 21:00:00+00', null, null, null, null),
  (104, 'final', 'KO', 'W101', 'W102', 'W101', 'W102', '2026-07-19 19:00:00+00', null, null, null, null)
on conflict (match_no) do update set
  stage = excluded.stage,
  group_code = excluded.group_code,
  home_team = excluded.home_team,
  away_team = excluded.away_team,
  home_seed = excluded.home_seed,
  away_seed = excluded.away_seed,
  kickoff_at = excluded.kickoff_at,
  next_match_no = excluded.next_match_no,
  winner_to_slot = excluded.winner_to_slot,
  loser_next_match_no = excluded.loser_next_match_no,
  loser_to_slot = excluded.loser_to_slot;
