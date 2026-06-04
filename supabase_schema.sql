-- Liga Ziomków — schemat Supabase
-- Uruchom w SQL Editor, jeżeli tabele nie zostały jeszcze utworzone.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  short_name text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_no integer not null unique,
  stage text not null default 'group',
  group_code text,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint score_non_negative check (
    (home_score is null or home_score >= 0)
    and (away_score is null or away_score >= 0)
  )
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  home_goals integer not null,
  away_goals integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id),
  constraint prediction_non_negative check (home_goals >= 0 and away_goals >= 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists set_predictions_updated_at on public.predictions;
create trigger set_predictions_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

create or replace function public.prediction_points(
  predicted_home integer,
  predicted_away integer,
  actual_home integer,
  actual_away integer
)
returns integer
language sql
immutable
as $$
  select case
    when actual_home is null or actual_away is null then 0
    when predicted_home = actual_home and predicted_away = actual_away then 3
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
  coalesce(sum(public.prediction_points(pr.home_goals, pr.away_goals, m.home_score, m.away_score)), 0)::integer as points,
  coalesce(sum(case when m.home_score is not null and m.away_score is not null and pr.home_goals = m.home_score and pr.away_goals = m.away_score then 1 else 0 end), 0)::integer as exact_scores,
  coalesce(sum(case when m.home_score is not null and m.away_score is not null and sign(pr.home_goals - pr.away_goals) = sign(m.home_score - m.away_score) then 1 else 0 end), 0)::integer as correct_outcomes,
  coalesce(count(pr.id) filter (where m.home_score is not null and m.away_score is not null), 0)::integer as settled_predictions
from public.profiles p
left join public.predictions pr on pr.player_id = p.id
left join public.matches m on m.id = pr.match_id
group by p.id, p.display_name, p.short_name
order by points desc, exact_scores desc, correct_outcomes desc, display_name asc;

grant select on public.ranking to authenticated;

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select to authenticated using (true);

drop policy if exists "matches_select_authenticated" on public.matches;
create policy "matches_select_authenticated"
on public.matches for select to authenticated using (true);

drop policy if exists "matches_admin_insert" on public.matches;
create policy "matches_admin_insert"
on public.matches for insert to authenticated
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "matches_admin_update" on public.matches;
create policy "matches_admin_update"
on public.matches for update to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "predictions_select_own_or_after_kickoff" on public.predictions;
create policy "predictions_select_own_or_after_kickoff"
on public.predictions for select to authenticated
using (
  player_id = auth.uid()
  or exists (select 1 from public.matches m where m.id = predictions.match_id and now() >= m.kickoff_at)
);

drop policy if exists "predictions_insert_own_before_kickoff" on public.predictions;
create policy "predictions_insert_own_before_kickoff"
on public.predictions for insert to authenticated
with check (
  player_id = auth.uid()
  and exists (select 1 from public.matches m where m.id = predictions.match_id and now() < m.kickoff_at)
);

drop policy if exists "predictions_update_own_before_kickoff" on public.predictions;
create policy "predictions_update_own_before_kickoff"
on public.predictions for update to authenticated
using (
  player_id = auth.uid()
  and exists (select 1 from public.matches m where m.id = predictions.match_id and now() < m.kickoff_at)
)
with check (
  player_id = auth.uid()
  and exists (select 1 from public.matches m where m.id = predictions.match_id and now() < m.kickoff_at)
);

-- Realtime. Jeżeli tabela jest już dodana do publikacji, Supabase może zwrócić komunikat o duplikacie — można go zignorować.
do $$
begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.predictions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
