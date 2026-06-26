-- Liga Ziomków v2 — bezpieczna migracja pod fazę pucharową
-- Nie usuwa żadnych istniejących meczów, typów ani wyników.

alter table public.matches
add column if not exists home_seed text,
add column if not exists away_seed text,
add column if not exists next_match_no integer,
add column if not exists winner_to_slot text,
add column if not exists loser_next_match_no integer,
add column if not exists loser_to_slot text,
add column if not exists winner_side text,
add column if not exists home_penalties integer,
add column if not exists away_penalties integer;

alter table public.predictions
add column if not exists winner_pick text;

-- Ustaw seed dla starych meczów grupowych jako nazwy drużyn, bez zmiany wyników ani typów.
update public.matches
set home_seed = coalesce(home_seed, home_team),
    away_seed = coalesce(away_seed, away_team)
where stage = 'group' or group_code <> 'KO';

-- Bezpieczne check constraints — tylko jeśli jeszcze ich nie ma.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_winner_side_valid') then
    alter table public.matches
    add constraint matches_winner_side_valid check (winner_side is null or winner_side in ('home', 'away'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_penalties_non_negative') then
    alter table public.matches
    add constraint matches_penalties_non_negative check (
      (home_penalties is null or home_penalties >= 0)
      and
      (away_penalties is null or away_penalties >= 0)
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'predictions_winner_pick_valid') then
    alter table public.predictions
    add constraint predictions_winner_pick_valid check (winner_pick is null or winner_pick in ('home', 'away'));
  end if;
end $$;

-- Punktacja v2:
-- 3 pkt za dokładny wynik.
-- 1 pkt za trafione rozstrzygnięcie w grupach albo trafiony awans w pucharowej.
create or replace function public.prediction_points_v2(
  predicted_home integer,
  predicted_away integer,
  predicted_winner text,
  actual_home integer,
  actual_away integer,
  actual_winner text,
  stage_name text
)
returns integer
language sql
immutable
as $$
  select case
    when actual_home is null or actual_away is null then 0
    when predicted_home = actual_home and predicted_away = actual_away then 3
    when coalesce(stage_name, 'group') <> 'group'
      then case when predicted_winner is not null and predicted_winner = actual_winner then 1 else 0 end
    when sign(predicted_home - predicted_away) = sign(actual_home - actual_away) then 1
    else 0
  end;
$$;

create or replace view public.ranking
with (security_invoker = true)
as
select
  p.id as player_id,
  p.display_name,
  p.short_name,
  coalesce(sum(public.prediction_points_v2(
    pr.home_goals,
    pr.away_goals,
    pr.winner_pick,
    m.home_score,
    m.away_score,
    case
      when m.winner_side in ('home', 'away') then m.winner_side
      when m.home_score is not null and m.away_score is not null and m.home_score > m.away_score then 'home'
      when m.home_score is not null and m.away_score is not null and m.home_score < m.away_score then 'away'
      else null
    end,
    m.stage
  )), 0)::integer as points,
  coalesce(sum(case
    when m.home_score is not null and m.away_score is not null and pr.home_goals = m.home_score and pr.away_goals = m.away_score then 1
    else 0
  end), 0)::integer as exact_scores,
  coalesce(sum(case
    when m.home_score is null or m.away_score is null then 0
    when coalesce(m.stage, 'group') <> 'group' then
      case when pr.winner_pick is not null and pr.winner_pick = (
        case
          when m.winner_side in ('home', 'away') then m.winner_side
          when m.home_score > m.away_score then 'home'
          when m.home_score < m.away_score then 'away'
          else null
        end
      ) then 1 else 0 end
    when sign(pr.home_goals - pr.away_goals) = sign(m.home_score - m.away_score) then 1
    else 0
  end), 0)::integer as correct_outcomes,
  coalesce(count(pr.id) filter (where m.home_score is not null and m.away_score is not null), 0)::integer as settled_predictions
from public.profiles p
left join public.predictions pr on pr.player_id = p.id
left join public.matches m on m.id = pr.match_id
group by p.id, p.display_name, p.short_name
order by points desc, exact_scores desc, correct_outcomes desc, display_name asc;
