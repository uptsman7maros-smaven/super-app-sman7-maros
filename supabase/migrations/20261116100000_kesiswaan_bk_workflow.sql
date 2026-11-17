alter table if exists public.kb_prestasi
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_catatan_bk
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists bidang_layanan text,
  add column if not exists tanggal_kontrol date,
  add column if not exists source_alert_id uuid references public.attendance_bk_alerts(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_perizinan
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_jadwal_bk
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_ekstrakurikuler
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_osis_kegiatan
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists counselor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists academic_year text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $migration$
begin
  if to_regclass('public.kb_catatan_bk') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_catatan_bk' and column_name = 'bidang_bimbingan'
    ) then
      execute $sql$
        update public.kb_catatan_bk
        set bidang_layanan = case bidang_bimbingan
          when 'Belajar (Akademik)' then 'Belajar'
          else bidang_bimbingan
        end
        where bidang_layanan is null
      $sql$;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_catatan_bk' and column_name = 'tanggal_kontrol_ulang'
    ) then
      execute 'update public.kb_catatan_bk set tanggal_kontrol = tanggal_kontrol_ulang where tanggal_kontrol is null';
    end if;

    alter table public.kb_catatan_bk
      drop constraint if exists kb_catatan_bk_bidang_layanan_check,
      drop constraint if exists kb_catatan_bk_jenis_layanan_check,
      drop constraint if exists kb_catatan_bk_prioritas_check,
      drop constraint if exists kb_catatan_bk_status_kasus_check;
    alter table public.kb_catatan_bk
      add constraint kb_catatan_bk_bidang_layanan_check
        check (bidang_layanan is null or bidang_layanan in ('Pribadi', 'Sosial', 'Belajar', 'Karir')) not valid,
      add constraint kb_catatan_bk_jenis_layanan_check
        check (jenis_layanan is null or jenis_layanan in ('Konseling Individu', 'Konseling Kelompok', 'Mediasi', 'Home Visit', 'Konferensi Kasus', 'Panggilan Orang Tua', 'Pemanggilan Orang Tua')) not valid,
      add constraint kb_catatan_bk_prioritas_check
        check (prioritas is null or prioritas in ('Normal', 'Pantauan', 'Mendesak')) not valid,
      add constraint kb_catatan_bk_status_kasus_check
        check (status_kasus is null or status_kasus in ('Terbuka', 'Dalam Pendampingan', 'Selesai')) not valid;
  end if;
end
$migration$;

create or replace function public.kb_sync_student_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_student_name text;
  v_class_name text;
  v_class_id uuid;
  v_academic_year_id uuid;
  v_academic_year text;
  v_counselor_profile_id uuid;
begin
  if new.student_id is not null then
    select student.full_name, cl.name, cl.id, cl.academic_year_id, ay.name
    into v_student_name, v_class_name, v_class_id, v_academic_year_id, v_academic_year
    from public.students student
    left join public.classes cl on cl.id = student.class_id
    left join public.academic_years ay on ay.id = cl.academic_year_id
    where student.id = new.student_id;

    if v_student_name is null then
      raise exception 'Siswa yang dipilih tidak ditemukan.';
    end if;

    select assignment.counselor_profile_id
    into v_counselor_profile_id
    from public.attendance_bk_assignments assignment
    where assignment.student_id = new.student_id;

    new := jsonb_populate_record(
      new,
      jsonb_build_object(
        'nama_siswa', v_student_name,
        'kelas', v_class_name,
        'class_id', v_class_id,
        'academic_year_id', v_academic_year_id,
        'academic_year', v_academic_year,
        'counselor_profile_id', v_counselor_profile_id
      )
    );
  end if;
  if tg_table_name = 'kb_catatan_bk' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object(
        'bidang_bimbingan',
        case to_jsonb(new) ->> 'bidang_layanan'
          when 'Belajar' then 'Belajar (Akademik)'
          else to_jsonb(new) ->> 'bidang_layanan'
        end,
        'tanggal_kontrol_ulang', to_jsonb(new) ->> 'tanggal_kontrol'
      )
    );
  end if;
  return new;
end;
$function$;

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['kb_prestasi', 'kb_catatan_bk', 'kb_perizinan', 'kb_jadwal_bk', 'kb_ekstrakurikuler', 'kb_osis_kegiatan'] loop
    if to_regclass(format('public.%I', v_table_name)) is not null then
      execute format('drop trigger if exists %I on public.%I', v_table_name || '_student_snapshot', v_table_name);
      execute format(
        'create trigger %I before insert or update on public.%I
         for each row execute function public.kb_sync_student_snapshot()',
        v_table_name || '_student_snapshot',
        v_table_name
      );
    end if;
  end loop;
end
$migration$;

create table if not exists public.kb_referrals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_year text,
  semester smallint check (semester is null or semester in (1, 2)),
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  counselor_profile_id uuid references public.profiles(id) on delete set null,
  referral_type text not null check (referral_type in ('Akademik', 'Kehadiran', 'Perilaku', 'Lainnya')),
  subject_name text,
  summary text not null,
  details text,
  status text not null default 'Perlu Asesmen'
    check (status in ('Perlu Asesmen', 'Dalam Pendampingan', 'Selesai')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_career_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  counselor_profile_id uuid references public.profiles(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_year text,
  semester smallint check (semester is null or semester in (1, 2)),
  interests text,
  strengths text,
  learning_style text,
  subject_preferences text,
  study_major text,
  post_graduation_plan text check (
    post_graduation_plan is null or post_graduation_plan in ('SNBP', 'SNBT', 'Kedinasan', 'Vokasi', 'Bekerja')
  ),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_referrals_student_created_idx
  on public.kb_referrals (student_id, created_at desc);
create index if not exists kb_referrals_counselor_status_idx
  on public.kb_referrals (counselor_profile_id, status, created_at desc);
create index if not exists kb_career_plans_student_year_idx
  on public.kb_career_plans (student_id, academic_year_id, semester);
create index if not exists kb_prestasi_year_semester_date_idx
  on public.kb_prestasi (academic_year_id, semester, tanggal desc);
create index if not exists kb_catatan_bk_student_date_idx
  on public.kb_catatan_bk (student_id, tanggal desc);
create index if not exists kb_perizinan_student_date_idx
  on public.kb_perizinan (student_id, tanggal desc);
create index if not exists kb_jadwal_bk_student_date_idx
  on public.kb_jadwal_bk (student_id, hari_tanggal desc);
create index if not exists kb_ekstrakurikuler_student_year_idx
  on public.kb_ekstrakurikuler (student_id, academic_year_id, semester);
create index if not exists kb_osis_kegiatan_student_year_idx
  on public.kb_osis_kegiatan (student_id, academic_year_id, semester);
create index if not exists attendance_qr_records_person_date_idx
  on public.attendance_qr_records (person_identifier, attendance_date desc);

create or replace function public.kb_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['kb_prestasi', 'kb_perizinan', 'kb_jadwal_bk', 'kb_ekstrakurikuler', 'kb_osis_kegiatan', 'kb_referrals', 'kb_career_plans'] loop
    if to_regclass(format('public.%I', v_table_name)) is not null then
      execute format('drop trigger if exists %I on public.%I', v_table_name || '_audit_trigger', v_table_name);
      execute format(
        'create trigger %I before insert or update on public.%I
         for each row execute function public.kb_audit_mutation()',
        v_table_name || '_audit_trigger',
        v_table_name
      );
    end if;
  end loop;
end
$migration$;

alter table public.kb_referrals enable row level security;
alter table public.kb_career_plans enable row level security;
revoke all on public.kb_referrals, public.kb_career_plans from public, anon;
grant select, insert, update, delete on public.kb_referrals, public.kb_career_plans to authenticated;

alter table public.kb_catatan_bk enable row level security;
do $migration$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kb_catatan_bk'
  loop
    execute format('drop policy %I on public.kb_catatan_bk', existing_policy.policyname);
  end loop;
end
$migration$;

create policy kb_catatan_bk_read_scope
  on public.kb_catatan_bk
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        created_by = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_catatan_bk.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );
create policy kb_catatan_bk_insert_scope
  on public.kb_catatan_bk
  for insert to authenticated
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and created_by = auth.uid()
    )
  );
create policy kb_catatan_bk_update_scope
  on public.kb_catatan_bk
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        created_by = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_catatan_bk.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        created_by = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_catatan_bk.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );
create policy kb_catatan_bk_delete_scope
  on public.kb_catatan_bk
  for delete to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        created_by = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_catatan_bk.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists kb_referrals_read_scope on public.kb_referrals;
create policy kb_referrals_read_scope on public.kb_referrals
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator', 'kepala_sekolah']::text[])
    or (
      public.superapp_has_active_role(array['guru']::text[])
      and reporter_profile_id = auth.uid()
    )
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_referrals.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );
drop policy if exists kb_referrals_insert_scope on public.kb_referrals;
create policy kb_referrals_insert_scope on public.kb_referrals
  for insert to authenticated
  with check (
    public.superapp_has_active_role(array['super_admin', 'operator', 'guru']::text[])
    and reporter_profile_id = auth.uid()
  );
drop policy if exists kb_referrals_update_scope on public.kb_referrals;
create policy kb_referrals_update_scope on public.kb_referrals
  for update to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_referrals.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin', 'operator']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_referrals.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );
drop policy if exists kb_referrals_delete_scope on public.kb_referrals;
create policy kb_referrals_delete_scope on public.kb_referrals
  for delete to authenticated
  using (public.superapp_has_active_role(array['super_admin', 'operator']::text[]));

drop policy if exists kb_career_plans_read_scope on public.kb_career_plans;
create policy kb_career_plans_read_scope on public.kb_career_plans
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_career_plans.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );
drop policy if exists kb_career_plans_write_scope on public.kb_career_plans;
create policy kb_career_plans_write_scope on public.kb_career_plans
  for all to authenticated
  using (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_career_plans.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  )
  with check (
    public.superapp_has_active_role(array['super_admin']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and (
        counselor_profile_id = auth.uid()
        or exists (
          select 1 from public.attendance_bk_assignments assignment
          where assignment.student_id = kb_career_plans.student_id
            and assignment.counselor_profile_id = auth.uid()
        )
      )
    )
  );

create or replace function public.kb_case_summary()
returns table (status_kasus text, jumlah bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.superapp_has_active_role(array['super_admin', 'kepala_sekolah']::text[]) then
    raise exception 'Akses ringkasan kasus tidak diizinkan.'
      using errcode = '42501';
  end if;
  return query
    select note.status_kasus, count(*)
    from public.kb_catatan_bk note
    group by note.status_kasus;
end;
$function$;
revoke all on function public.kb_case_summary() from public, anon;
grant execute on function public.kb_case_summary() to authenticated;

create or replace function public.kb_student_attendance_history(p_student_id uuid)
returns table (
  id uuid,
  attendance_date date,
  session_type text,
  subject text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_nisn text;
begin
  if not (
    public.superapp_has_active_role(array['super_admin', 'operator', 'kepala_sekolah']::text[])
    or (
      public.superapp_has_active_role(array['guru_bk']::text[])
      and exists (
        select 1
        from public.attendance_bk_assignments assignment
        where assignment.student_id = p_student_id
          and assignment.counselor_profile_id = auth.uid()
      )
    )
  ) then
    raise exception 'Akses riwayat absensi siswa tidak diizinkan.'
      using errcode = '42501';
  end if;

  select btrim(student.nisn)
  into v_student_nisn
  from public.students student
  where student.id = p_student_id;

  if v_student_nisn is null then
    raise exception 'Siswa tidak ditemukan.';
  end if;

  return query
    select record.id, record.attendance_date, record.session_type, record.subject, record.status, record.created_at
    from public.attendance_qr_records record
    where btrim(record.person_identifier) = v_student_nisn
    order by record.attendance_date desc, record.created_at desc
    limit 100;
end;
$function$;
revoke all on function public.kb_student_attendance_history(uuid) from public, anon;
grant execute on function public.kb_student_attendance_history(uuid) to authenticated;

drop policy if exists attendance_bk_assignments_read_scope on public.attendance_bk_assignments;
create policy attendance_bk_assignments_read_scope
  on public.attendance_bk_assignments
  for select to authenticated
  using (
    public.superapp_has_active_role(array['super_admin', 'operator', 'kepala_sekolah']::text[])
    or (
      counselor_profile_id = auth.uid()
      and public.superapp_has_active_role(array['guru_bk']::text[])
    )
  );
