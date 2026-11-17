create or replace function public.letter_current_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case p.role::text
    when 'super_admin' then 'administrator'
    when 'operator' then 'operator'
    when 'kepala_tata_usaha' then 'kepala_tu'
    when 'staff_tata_usaha' then 'staf_tu'
    when 'kepala_sekolah' then 'kepala_sekolah'
    when 'guru' then 'guru_staf'
    when 'guru_bk' then 'guru_staf'
    when 'tendik' then 'guru_staf'
    when 'siswa' then 'pemohon'
    else null
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

revoke all on function public.letter_current_role() from public, anon;
grant execute on function public.letter_current_role() to authenticated;

create or replace function public.get_my_attendance_identity()
returns table (
  person_type text,
  person_identifier text,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    'siswa'::text,
    btrim(s.nisn)::text,
    s.full_name::text
  from public.profiles p
  join public.students s on btrim(s.nisn) = btrim(p.username)
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text = 'siswa'

  union all

  select
    'guru_tendik'::text,
    btrim(t.nip)::text,
    t.full_name::text
  from public.profiles p
  join public.teachers t
    on t.profile_id = p.id
    or (
      t.profile_id is null
      and btrim(p.username) = btrim(t.nip)
      and p.role::text in ('guru', 'guru_bk', 'tendik')
    )
  where p.id = auth.uid()
    and p.status = 'active'::public.account_status
    and p.role::text in ('guru', 'guru_bk', 'tendik');
$function$;

revoke all on function public.get_my_attendance_identity() from public, anon, authenticated;
grant execute on function public.get_my_attendance_identity() to authenticated;

create or replace function public.attendance_self_identity_matches(
  p_person_type text,
  p_person_identifier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and (
        (
          p.role::text = 'siswa'
          and p_person_type = 'siswa'
          and p.username = p_person_identifier
        )
        or (
          p_person_type = 'guru_tendik'
          and exists (
            select 1
            from public.teachers t
            where t.nip = p_person_identifier
              and (
                t.profile_id = p.id
                or (
                  t.profile_id is null
                  and p.username = t.nip
                  and p.role::text in (
                    'guru',
                    'guru_bk',
                    'tendik',
                    'staff_tata_usaha',
                    'kepala_tata_usaha'
                  )
                )
              )
          )
        )
      )
  );
$function$;

revoke all on function public.attendance_self_identity_matches(text, text) from public;
grant execute on function public.attendance_self_identity_matches(text, text) to authenticated;

create or replace function public.attendance_self_identity_matches_v2(
  p_person_type text,
  p_person_identifier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and (
        (
          p.role::text = 'siswa'
          and p_person_type = 'siswa'
          and p.username = p_person_identifier
        )
        or (
          p_person_type = 'guru_tendik'
          and exists (
            select 1
            from public.teachers t
            where t.nip = p_person_identifier
              and (
                t.profile_id = p.id
                or (
                  t.profile_id is null
                  and p.username = t.nip
                  and p.role::text in (
                    'guru',
                    'guru_bk',
                    'tendik',
                    'staff_tata_usaha',
                    'kepala_tata_usaha'
                  )
                )
              )
          )
        )
      )
  );
$function$;

revoke all on function public.attendance_self_identity_matches_v2(text, text)
  from public, anon, authenticated;
grant execute on function public.attendance_self_identity_matches_v2(text, text)
  to authenticated;
