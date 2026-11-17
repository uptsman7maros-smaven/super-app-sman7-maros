alter table if exists public.kb_prestasi
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint;

alter table if exists public.kb_catatan_bk
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint,
  add column if not exists bidang_bimbingan text,
  add column if not exists jenis_layanan text,
  add column if not exists prioritas text not null default 'Normal',
  add column if not exists status_kasus text not null default 'Terbuka',
  add column if not exists tanggal_kontrol_ulang date,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.kb_jadwal_bk
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint;

alter table if exists public.kb_perizinan
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint;

alter table if exists public.kb_ekstrakurikuler
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint;

alter table if exists public.kb_osis_kegiatan
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null,
  add column if not exists semester smallint;

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['kb_prestasi', 'kb_catatan_bk', 'kb_perizinan'] loop
    if to_regclass(format('public.%I', v_table_name)) is not null
      and exists (
        select 1
        from information_schema.columns columns
        where columns.table_schema = 'public'
          and columns.table_name = v_table_name
          and columns.column_name = 'nama_siswa'
      )
    then
      execute format(
        'update public.%I record
         set student_id = student.id
         from public.students student
         where record.student_id is null
           and lower(btrim(record.nama_siswa)) = lower(btrim(student.full_name))
           and (
             select count(*)
             from public.students candidate
             where lower(btrim(candidate.full_name)) = lower(btrim(record.nama_siswa))
           ) = 1',
        v_table_name
      );
    end if;
  end loop;
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
begin
  if new.student_id is not null then
    select student.full_name, class.name
    into v_student_name, v_class_name
    from public.students student
    left join public.classes class on class.id = student.class_id
    where student.id = new.student_id;

    if v_student_name is null then
      raise exception 'Siswa yang dipilih tidak ditemukan.';
    end if;

    new := jsonb_populate_record(
      new,
      jsonb_build_object('nama_siswa', v_student_name, 'kelas', v_class_name)
    );
  end if;
  return new;
end;
$function$;

do $migration$
declare
  v_table_name text;
begin
  foreach v_table_name in array array['kb_prestasi', 'kb_catatan_bk', 'kb_jadwal_bk', 'kb_perizinan'] loop
    if to_regclass(format('public.%I', v_table_name)) is not null then
      execute format('drop trigger if exists %I on public.%I', v_table_name || '_student_snapshot', v_table_name);
      execute format(
        'create trigger %I before insert or update of student_id on public.%I
         for each row execute function public.kb_sync_student_snapshot()',
        v_table_name || '_student_snapshot',
        v_table_name
      );
    end if;
  end loop;
end
$migration$;

do $migration$
begin
  if to_regclass('public.kb_prestasi') is not null then
    alter table public.kb_prestasi
      drop constraint if exists kb_prestasi_semester_check;
    alter table public.kb_prestasi
      add constraint kb_prestasi_semester_check check (semester is null or semester in (1, 2));
  end if;

  if to_regclass('public.kb_catatan_bk') is not null then
    alter table public.kb_catatan_bk
      drop constraint if exists kb_catatan_bk_semester_check;
    alter table public.kb_catatan_bk
      add constraint kb_catatan_bk_semester_check check (semester is null or semester in (1, 2));
  end if;

  if to_regclass('public.kb_jadwal_bk') is not null then
    alter table public.kb_jadwal_bk
      drop constraint if exists kb_jadwal_bk_semester_check;
    alter table public.kb_jadwal_bk
      add constraint kb_jadwal_bk_semester_check check (semester is null or semester in (1, 2));
  end if;

  if to_regclass('public.kb_perizinan') is not null then
    alter table public.kb_perizinan
      drop constraint if exists kb_perizinan_semester_check;
    alter table public.kb_perizinan
      add constraint kb_perizinan_semester_check check (semester is null or semester in (1, 2));
  end if;

  if to_regclass('public.kb_ekstrakurikuler') is not null then
    alter table public.kb_ekstrakurikuler
      drop constraint if exists kb_ekstrakurikuler_semester_check;
    alter table public.kb_ekstrakurikuler
      add constraint kb_ekstrakurikuler_semester_check check (semester is null or semester in (1, 2));
  end if;

  if to_regclass('public.kb_osis_kegiatan') is not null then
    alter table public.kb_osis_kegiatan
      drop constraint if exists kb_osis_kegiatan_semester_check;
    alter table public.kb_osis_kegiatan
      add constraint kb_osis_kegiatan_semester_check check (semester is null or semester in (1, 2));
  end if;
end
$migration$;

create or replace function public.kb_catatan_bk_audit()
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
begin
  if to_regclass('public.kb_catatan_bk') is not null then
    drop trigger if exists kb_catatan_bk_audit_trigger on public.kb_catatan_bk;
    create trigger kb_catatan_bk_audit_trigger
      before insert or update on public.kb_catatan_bk
      for each row execute function public.kb_catatan_bk_audit();
  end if;
end
$migration$;

do $migration$
declare
  existing_policy record;
begin
  if to_regclass('public.kb_catatan_bk') is null then
    return;
  end if;

  alter table public.kb_catatan_bk enable row level security;
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'kb_catatan_bk'
  loop
    execute format('drop policy %I on public.kb_catatan_bk', existing_policy.policyname);
  end loop;

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
            select 1
            from public.attendance_bk_assignments assignment
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
            select 1
            from public.attendance_bk_assignments assignment
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
            select 1
            from public.attendance_bk_assignments assignment
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
            select 1
            from public.attendance_bk_assignments assignment
            where assignment.student_id = kb_catatan_bk.student_id
              and assignment.counselor_profile_id = auth.uid()
          )
        )
      )
    );
end
$migration$;
