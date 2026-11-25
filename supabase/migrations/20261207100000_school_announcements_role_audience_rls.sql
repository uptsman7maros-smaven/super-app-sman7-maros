create or replace function public.school_announcement_visible_to_current_user(
  p_is_published boolean,
  p_audience text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.superapp_has_active_role(array[
      'super_admin', 'operator', 'kepala_sekolah', 'kepala_tata_usaha',
      'staff_tata_usaha', 'guru', 'guru_bk', 'tendik', 'bendahara', 'siswa'
    ]::text[])
    and (
      (
        p_is_published is true
        and (
          lower(btrim(p_audience)) = 'semua pengguna'
          or (
            lower(btrim(p_audience)) = 'guru'
            and public.superapp_has_active_role(array['guru', 'guru_bk']::text[])
          )
          or (
            lower(btrim(p_audience)) = 'siswa'
            and public.superapp_has_active_role(array['siswa']::text[])
          )
          or (
            lower(btrim(p_audience)) = 'tenaga kependidikan'
            and public.superapp_has_active_role(array[
              'tendik', 'staff_tata_usaha', 'kepala_tata_usaha'
            ]::text[])
          )
          or (
            lower(btrim(p_audience)) = 'operator'
            and public.superapp_has_active_role(array['operator']::text[])
          )
          or (
            lower(btrim(p_audience)) = 'kepala sekolah'
            and public.superapp_has_active_role(array['kepala_sekolah']::text[])
          )
        )
      )
      or public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    );
$function$;

revoke all on function public.school_announcement_visible_to_current_user(boolean, text)
  from public, anon;
grant execute on function public.school_announcement_visible_to_current_user(boolean, text)
  to authenticated;

do $migration$
begin
  if to_regclass('public.school_announcements') is null then
    raise notice 'public.school_announcements belum tersedia; kebijakan baca pengumuman dilewati.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'school_announcements'
      and column_name = 'is_published'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'school_announcements'
      and column_name = 'audience'
  ) then
    raise exception 'Skema public.school_announcements tidak memiliki kolom is_published dan audience.';
  end if;

  execute 'alter table public.school_announcements enable row level security';
  execute 'grant select on public.school_announcements to authenticated';
  execute 'drop policy if exists school_announcements_published_for_audience on public.school_announcements';
  execute $policy$
    create policy school_announcements_published_for_audience
      on public.school_announcements
      for select
      to authenticated
      using (public.school_announcement_visible_to_current_user(is_published, audience))
  $policy$;
  execute 'drop policy if exists school_announcements_audience_read_guard on public.school_announcements';
  execute $policy$
    create policy school_announcements_audience_read_guard
      on public.school_announcements
      as restrictive
      for select
      to authenticated
      using (public.school_announcement_visible_to_current_user(is_published, audience))
  $policy$;
end;
$migration$;
