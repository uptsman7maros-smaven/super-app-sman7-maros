create or replace function public.get_my_attendance_weekly_report(p_week_start date)
returns table(
  class_id uuid,
  class_name text,
  grade_level integer,
  attendance_date date,
  student_id uuid,
  person_identifier text,
  person_name text,
  gender text,
  status text,
  note text,
  recorded_at timestamptz,
  is_effective_day boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Makassar')::date;
  v_local_time time := (now() at time zone 'Asia/Makassar')::time;
  v_settings public.attendance_schedule_settings%rowtype;
begin
  if auth.uid() is null
    or not public.superapp_has_active_role(array['guru', 'guru_bk']::text[]) then
    raise exception 'Rekap mingguan hanya tersedia untuk Guru, Guru BK, dan akun pengajar aktif.';
  end if;
  if p_week_start is null
    or extract(isodow from p_week_start) <> 1
    or p_week_start > v_today then
    raise exception 'Periode rekap harus dimulai pada hari Senin dan bukan tanggal mendatang.';
  end if;

  select * into strict v_settings
  from public.attendance_schedule_settings
  where id = 1;

  return query
  with my_teacher as (
    select teacher.id
    from public.profiles profile
    join public.teachers teacher
      on teacher.profile_id = profile.id
      or (
        teacher.profile_id is null
        and btrim(teacher.nip) = btrim(profile.username)
      )
    where profile.id = auth.uid()
      and profile.status = 'active'::public.account_status
    order by (teacher.profile_id = profile.id) desc nulls last
    limit 1
  ),
  authorized_classes as (
    select class.id
    from public.classes class
    where public.attendance_teacher_owns_class(class.id)
    union
    select assignment.class_id
    from public.attendance_teacher_subject_assignments assignment
    join my_teacher teacher on teacher.id = assignment.teacher_id
    where public.superapp_has_active_role(array['guru']::text[])
    union
    select student.class_id
    from public.attendance_bk_assignments assignment
    join public.students student on student.id = assignment.student_id
    where assignment.counselor_profile_id = auth.uid()
      and student.status = 'Active'
      and student.class_id is not null
      and public.superapp_has_active_role(array['guru_bk']::text[])
  ),
  report_days as (
    select generated.day_value::date as school_date,
      public.attendance_is_school_day(generated.day_value::date) as is_school_day,
      (
        generated.day_value::date <= v_today
        and public.attendance_is_school_day(generated.day_value::date)
      ) as is_effective_day
    from generate_series(p_week_start, p_week_start + 4, interval '1 day') generated(day_value)
  )
  select class.id,
    class.name::text,
    class.grade_level::integer,
    report_days.school_date,
    student.id,
    coalesce(btrim(student.nisn), '')::text,
    student.full_name::text,
    case
      when lower(btrim(coalesce(student.gender::text, ''))) in ('l', 'laki-laki', 'laki laki', 'male') then 'L'
      when lower(btrim(coalesce(student.gender::text, ''))) in ('p', 'perempuan', 'female') then 'P'
      else null
    end,
    case
      when not report_days.is_school_day then 'belum_tercatat'
      else coalesce(
        attendance.status::text,
        case
          when report_days.school_date < v_today
            or (report_days.school_date = v_today and v_local_time >= v_settings.arrival_absent_at)
            then 'alpa'
          else 'belum_tercatat'
        end
      )
    end,
    case when not report_days.is_school_day then 'Libur sekolah' else attendance.note::text end,
    case
      when attendance.status::text in ('hadir', 'terlambat')
        then coalesce(arrival_qr.created_at, attendance.created_at)
      else arrival_qr.created_at
    end,
    report_days.is_effective_day
  from authorized_classes authorized
  join public.classes class on class.id = authorized.id
  join public.students student
    on student.class_id = class.id
   and student.status = 'Active'
  cross join report_days
  left join lateral (
    select record.status, record.note, record.created_at
    from public.attendance_records record
    where record.attendance_date = report_days.school_date
      and record.person_type = 'siswa'
      and record.person_identifier = btrim(student.nisn)
      and (
        record.class_id = class.id
        or (
          record.class_id is null
          and lower(btrim(record.class_name)) = lower(btrim(class.name))
        )
      )
    order by record.created_at desc
    limit 1
  ) attendance on true
  left join lateral (
    select record.created_at
    from public.attendance_qr_records record
    where record.attendance_date = report_days.school_date
      and record.person_type = 'siswa'
      and record.person_identifier = btrim(student.nisn)
      and record.session_type = 'school_arrival'
      and not record.is_voided
      and (
        record.class_id = class.id
        or (
          record.class_id is null
          and lower(btrim(record.class_name)) = lower(btrim(class.name))
        )
      )
    order by record.created_at desc
    limit 1
  ) arrival_qr on true
  order by class.name, student.full_name, report_days.school_date;
end;
$function$;

notify pgrst, 'reload schema';
