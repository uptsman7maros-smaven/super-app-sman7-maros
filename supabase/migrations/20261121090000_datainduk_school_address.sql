begin;

alter table public.school_settings
  add column if not exists school_address text not null default '';

notify pgrst, 'reload schema';

commit;
