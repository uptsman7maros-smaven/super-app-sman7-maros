begin;

alter table public.school_settings
  add column if not exists province_logo_url text not null default '';

commit;
