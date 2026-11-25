create or replace function public.create_attendance_qr_session(
  p_session_type text,
  p_subject text default null,
  p_class_id uuid default null
)
returns table (
  session_id uuid,
  token text,
  session_type text,
  subject text,
  class_name text,
  teacher_name text,
  attendance_date date,
  expires_at timestamptz,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_class_id uuid;
  v_class_name text;
  v_subject text;
  v_token text;
  v_expires_at timestamptz;
  v_session_id uuid;
  v_now timestamptz := now();
  v_now_local timestamp without time zone;
  v_session_date date;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  if p_session_type is distinct from 'subject' then
    raise exception 'Jenis sesi QR tidak valid.';
  end if;

  v_now_local := v_now at time zone 'Asia/Makassar';
  if not public.superapp_has_active_role(array['guru']::text[]) then
    raise exception 'QR mata pelajaran hanya dapat dibuat oleh akun guru aktif.';
  end if;
  if not public.attendance_is_school_day(v_now_local::date) then
    raise exception 'QR mata pelajaran hanya dapat dibuat pada hari sekolah.';
  end if;

  v_session_date := v_now_local::date;
  v_subject := nullif(btrim(p_subject), '');
  if v_subject is null or length(v_subject) > 120 then
    raise exception 'Nama mata pelajaran wajib diisi (maksimal 120 karakter).';
  end if;

  select class.id, class.name
    into v_class_id, v_class_name
  from public.classes class
  where class.id = p_class_id
  limit 1;
  if v_class_id is null then
    raise exception 'Kelas tidak ditemukan. Gunakan kelas yang ditugaskan kepada Anda.';
  end if;

  select teacher.id, teacher.full_name
    into v_teacher_id, v_teacher_name
  from public.profiles profile
  join public.teachers teacher
    on teacher.profile_id = profile.id
    or (
      teacher.profile_id is null
      and btrim(teacher.nip) = btrim(profile.username)
    )
  where profile.id = auth.uid()
    and profile.status = 'active'::public.account_status
    and profile.role::text = 'guru'
  order by (teacher.profile_id = profile.id) desc nulls last
  limit 1;
  if v_teacher_id is null then
    raise exception 'Akun guru belum tertaut ke Data Induk.';
  end if;

  if not exists (
    select 1
    from public.attendance_teacher_subject_assignments assignment
    where assignment.teacher_id = v_teacher_id
      and assignment.class_id = v_class_id
      and lower(btrim(assignment.subject)) = lower(v_subject)
  ) then
    raise exception 'Mata pelajaran dan kelas tersebut belum ditugaskan kepada Anda. Hubungi admin/operator Data Induk.';
  end if;

  v_expires_at := v_now + interval '90 minutes';
  v_token := gen_random_uuid()::text;

  insert into public.attendance_qr_sessions (
    token,
    session_type,
    subject,
    class_name,
    teacher_name,
    created_by,
    expires_at,
    token_expires_at,
    attendance_date
  )
  values (
    v_token,
    p_session_type,
    v_subject,
    v_class_name,
    v_teacher_name,
    auth.uid(),
    v_expires_at,
    v_expires_at,
    v_session_date
  )
  returning id into v_session_id;

  return query
    select v_session_id, v_token, p_session_type, v_subject, v_class_name,
      v_teacher_name, v_session_date, v_expires_at, v_expires_at;
end;
$function$;

revoke all on function public.create_attendance_qr_session(text, text, uuid)
  from public, anon;
grant execute on function public.create_attendance_qr_session(text, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
