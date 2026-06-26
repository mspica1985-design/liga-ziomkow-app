
-- Liga Ziomków v3 — kontrola przed Auto Drabinką
-- Ten plik niczego nie kasuje. Pokazuje, czy macie komplet fazy grupowej i drabinki.
select count(*) as group_matches_total from public.matches where stage = 'group';
select count(*) as group_matches_with_result from public.matches where stage = 'group' and home_score is not null and away_score is not null;
select count(*) as knockout_matches_total from public.matches where stage <> 'group';
select match_no, stage, home_team, away_team, home_seed, away_seed from public.matches where match_no between 73 and 88 order by match_no;
