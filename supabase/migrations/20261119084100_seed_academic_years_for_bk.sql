with generated_years as (
  select
    year_start,
    year_start::text || '/' || (year_start + 1)::text as name,
    make_date(year_start, 7, 1) as start_date,
    make_date(year_start + 1, 6, 30) as end_date
  from generate_series(2025, 2035) as years(year_start)
)
insert into public.academic_years (name, start_date, end_date, is_active)
select generated.name, generated.start_date, generated.end_date, false
from generated_years generated
where not exists (
  select 1
  from public.academic_years existing
  where lower(trim(existing.name)) = lower(generated.name)
);
