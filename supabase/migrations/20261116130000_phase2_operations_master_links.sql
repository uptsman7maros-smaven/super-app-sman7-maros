create table if not exists public.app_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_label text,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  module_key text not null,
  details text
);

alter table public.app_activity_logs enable row level security;
drop policy if exists app_activity_logs_finance_insert on public.app_activity_logs;
create policy app_activity_logs_finance_insert on public.app_activity_logs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.superapp_has_active_role(array['super_admin','kepala_tata_usaha']::text[])
  );
drop policy if exists app_activity_logs_admin_read on public.app_activity_logs;
create policy app_activity_logs_admin_read on public.app_activity_logs
  for select to authenticated
  using (
    public.superapp_has_active_role(
      array['super_admin','kepala_sekolah','kepala_tata_usaha','staff_tata_usaha','operator']::text[]
    )
  );
grant select, insert on public.app_activity_logs to authenticated;

alter table public.library_members
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null;

alter table public.library_loans
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null;

alter table public.library_visits
  add column if not exists student_id uuid references public.students(id) on delete set null,
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists class_name text;

alter table public.library_loan_requests
  add column if not exists master_student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists class_name text;
alter table public.library_digital_access
  add column if not exists master_student_id uuid references public.students(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists class_name text;

create unique index if not exists library_members_student_id_unique
  on public.library_members(student_id) where student_id is not null;
create unique index if not exists library_members_teacher_id_unique
  on public.library_members(teacher_id) where teacher_id is not null;
create index if not exists library_loans_student_date_idx
  on public.library_loans(student_id, borrowed_at desc);
create index if not exists library_loans_teacher_date_idx
  on public.library_loans(teacher_id, borrowed_at desc);
create index if not exists library_visits_student_date_idx
  on public.library_visits(student_id, visit_date desc);

create or replace function public.library_sync_member_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_teacher public.teachers%rowtype;
  v_member public.library_members%rowtype;
begin
  if tg_table_name = 'library_members' then
    if new.student_id is not null then
      select * into v_student from public.students where id = new.student_id;
      if found then
        new.full_name := v_student.full_name;
        new.identifier := v_student.nisn;
        new.profile_id := v_student.profile_id;
        new.class_id := v_student.class_id;
        select c.name into new.class_name from public.classes c where c.id = v_student.class_id;
        new.member_type := 'siswa';
      end if;
    elsif new.teacher_id is not null then
      select * into v_teacher from public.teachers where id = new.teacher_id;
      if found then
        new.full_name := v_teacher.full_name;
        new.identifier := v_teacher.nip;
        new.profile_id := v_teacher.profile_id;
        new.class_id := null;
        new.class_name := null;
        new.member_type := case
          when exists (
            select 1 from public.profiles p
            where p.id = v_teacher.profile_id and p.role::text = 'tendik'
          ) then 'tendik'
          else 'guru'
        end;
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'library_loans' then
    select * into v_member
    from public.library_members
    where id::text = new.member_id::text;
    if found then
      new.profile_id := v_member.profile_id;
      new.student_id := v_member.student_id;
      new.teacher_id := v_member.teacher_id;
    end if;
    return new;
  end if;

  if new.profile_id is not null then
    select * into v_student from public.students where profile_id = new.profile_id;
    if found then
      new.student_id := v_student.id;
      new.class_id := v_student.class_id;
      select c.name into new.class_name from public.classes c where c.id = v_student.class_id;
      new.visitor_name := v_student.full_name;
      new.visitor_type := 'siswa';
      return new;
    end if;

    select * into v_teacher from public.teachers where profile_id = new.profile_id;
    if found then
      new.teacher_id := v_teacher.id;
      new.visitor_name := v_teacher.full_name;
      new.visitor_type := case
        when exists (
          select 1 from public.profiles p
          where p.id = v_teacher.profile_id and p.role::text = 'tendik'
        ) then 'tendik'
        else 'guru'
      end;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists library_members_sync_identity on public.library_members;
create trigger library_members_sync_identity
  before insert or update of student_id, teacher_id on public.library_members
  for each row execute function public.library_sync_member_identity();
drop trigger if exists library_loans_sync_identity on public.library_loans;
create trigger library_loans_sync_identity
  before insert or update of member_id on public.library_loans
  for each row execute function public.library_sync_member_identity();
drop trigger if exists library_visits_sync_identity on public.library_visits;
create trigger library_visits_sync_identity
  before insert or update of profile_id on public.library_visits
  for each row execute function public.library_sync_member_identity();

create or replace function public.library_sync_student_request_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student public.students%rowtype;
  v_class_name text;
begin
  select * into v_student
  from public.students
  where profile_id = new.student_id
  order by id
  limit 1;
  if not found then
    return new;
  end if;

  select c.name into v_class_name
  from public.classes c
  where c.id = v_student.class_id;

  new.master_student_id := v_student.id;
  new.class_id := v_student.class_id;
  new.class_name := v_class_name;
  new.student_name := v_student.full_name;
  return new;
end;
$function$;

drop trigger if exists library_loan_requests_sync_identity on public.library_loan_requests;
create trigger library_loan_requests_sync_identity
  before insert or update of student_id on public.library_loan_requests
  for each row execute function public.library_sync_student_request_identity();
drop trigger if exists library_digital_access_sync_identity on public.library_digital_access;
create trigger library_digital_access_sync_identity
  before insert or update of student_id on public.library_digital_access
  for each row execute function public.library_sync_student_request_identity();

with matches as (
  select member.id as member_id, student.id as student_id,
    count(*) over (partition by member.id) as member_matches,
    count(*) over (partition by student.id) as student_matches
  from public.library_members member
  join public.students student
    on nullif(btrim(coalesce(member.identifier, '')), '') = nullif(btrim(coalesce(student.nisn, '')), '')
    or nullif(btrim(coalesce(member.member_no, '')), '') = nullif(btrim(coalesce(student.nisn, '')), '')
  where member.student_id is null
    and nullif(btrim(coalesce(student.nisn, '')), '') is not null
)
update public.library_members member
set student_id = matches.student_id
from matches
where member.id = matches.member_id
  and matches.member_matches = 1
  and matches.student_matches = 1;

with matches as (
  select member.id as member_id, teacher.id as teacher_id,
    count(*) over (partition by member.id) as member_matches,
    count(*) over (partition by teacher.id) as teacher_matches
  from public.library_members member
  join public.teachers teacher
    on nullif(btrim(coalesce(member.identifier, '')), '') = nullif(btrim(coalesce(teacher.nip, '')), '')
    or nullif(btrim(coalesce(member.member_no, '')), '') = nullif(btrim(coalesce(teacher.nip, '')), '')
  where member.student_id is null
    and member.teacher_id is null
    and nullif(btrim(coalesce(teacher.nip, '')), '') is not null
)
update public.library_members member
set teacher_id = matches.teacher_id
from matches
where member.id = matches.member_id
  and matches.member_matches = 1
  and matches.teacher_matches = 1;

update public.library_loans loan
set member_id = member.id
from public.library_members member
where loan.member_id::text = member.id::text
  and (
    loan.profile_id is distinct from member.profile_id
    or loan.student_id is distinct from member.student_id
    or loan.teacher_id is distinct from member.teacher_id
  );

update public.library_visits
set profile_id = profile_id
where profile_id is not null;

update public.library_loan_requests
set student_id = student_id
where student_id is not null;

update public.library_digital_access
set student_id = student_id
where student_id is not null;

create or replace function public.library_student_display_name()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select nullif(btrim(student.full_name), '')
     from public.students student
     where student.profile_id = auth.uid()
     order by student.id
     limit 1),
    (select nullif(btrim(profile.full_name), '')
     from public.profiles profile
     where profile.id = auth.uid()
       and profile.status::text = 'active'
       and profile.role::text = 'siswa'),
    (select profile.username
     from public.profiles profile
     where profile.id = auth.uid()
       and profile.status::text = 'active'
       and profile.role::text = 'siswa')
  );
$function$;

create or replace function public.library_sync_master_members()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
  v_rows integer;
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya pengelola perpustakaan yang dapat menyinkronkan anggota Data Induk.';
  end if;

  insert into public.library_members(
    member_no, full_name, member_type, class_name, identifier, active,
    profile_id, student_id, teacher_id
  )
  select 'S-' || s.nisn, s.full_name, 'siswa', c.name, s.nisn, true,
    s.profile_id, s.id, null
  from public.students s
  left join public.classes c on c.id = s.class_id
  where nullif(btrim(coalesce(s.nisn, '')), '') is not null
  on conflict (student_id) where student_id is not null
  do update set
    full_name = excluded.full_name,
    member_type = excluded.member_type,
    class_name = excluded.class_name,
    identifier = excluded.identifier,
    profile_id = excluded.profile_id;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.library_members(
    member_no, full_name, member_type, class_name, identifier, active,
    profile_id, student_id, teacher_id
  )
  select 'G-' || t.nip, t.full_name,
    case when p.role::text = 'tendik' then 'tendik' else 'guru' end,
    null, t.nip, true, t.profile_id, null, t.id
  from public.teachers t
  left join public.profiles p on p.id = t.profile_id
  where nullif(btrim(coalesce(t.nip, '')), '') is not null
  on conflict (teacher_id) where teacher_id is not null
  do update set
    full_name = excluded.full_name,
    member_type = excluded.member_type,
    identifier = excluded.identifier,
    profile_id = excluded.profile_id;
  get diagnostics v_rows = row_count;
  return v_count + v_rows;
end;
$function$;

revoke all on function public.library_sync_master_members() from public, anon;
grant execute on function public.library_sync_master_members() to authenticated;

do $migration$
begin
  if to_regclass('public.inv_assets') is not null then
    execute 'alter table public.inv_assets
      add column if not exists finance_transaction_id uuid,
      add column if not exists budget_id uuid';
    if to_regclass('public.finance_transactions') is not null then
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.inv_assets'::regclass
          and conname = 'inv_assets_finance_transaction_id_fkey'
      ) then
        execute 'alter table public.inv_assets
          add constraint inv_assets_finance_transaction_id_fkey
          foreign key (finance_transaction_id) references public.finance_transactions(id) on delete set null';
      end if;
    end if;
    if to_regclass('public.finance_budgets') is not null then
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.inv_assets'::regclass
          and conname = 'inv_assets_budget_id_fkey'
      ) then
        execute 'alter table public.inv_assets
          add constraint inv_assets_budget_id_fkey
          foreign key (budget_id) references public.finance_budgets(id) on delete set null';
      end if;
    end if;
  end if;

  if to_regclass('public.inv_issues') is not null then
    execute 'alter table public.inv_issues
      add column if not exists finance_transaction_id uuid,
      add column if not exists budget_id uuid';
    if to_regclass('public.finance_transactions') is not null then
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.inv_issues'::regclass
          and conname = 'inv_issues_finance_transaction_id_fkey'
      ) then
        execute 'alter table public.inv_issues
          add constraint inv_issues_finance_transaction_id_fkey
          foreign key (finance_transaction_id) references public.finance_transactions(id) on delete set null';
      end if;
    end if;
    if to_regclass('public.finance_budgets') is not null then
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.inv_issues'::regclass
          and conname = 'inv_issues_budget_id_fkey'
      ) then
        execute 'alter table public.inv_issues
          add constraint inv_issues_budget_id_fkey
          foreign key (budget_id) references public.finance_budgets(id) on delete set null';
      end if;
    end if;
  end if;

  if to_regclass('public.inv_loans') is not null then
    execute 'alter table public.inv_loans
      add column if not exists borrower_profile_id uuid references public.profiles(id) on delete set null,
      add column if not exists student_id uuid references public.students(id) on delete set null,
      add column if not exists teacher_id uuid references public.teachers(id) on delete set null';
  end if;

  if to_regclass('public.inv_places') is not null then
    execute 'alter table public.inv_places
      add column if not exists class_id uuid references public.classes(id) on delete set null';
  end if;

  if to_regclass('public.finance_transactions') is not null then
    execute 'alter table public.finance_transactions
      add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null';
  end if;
  if to_regclass('public.finance_budgets') is not null then
    execute 'alter table public.finance_budgets
      add column if not exists academic_year_id uuid references public.academic_years(id) on delete set null';
  end if;
end;
$migration$;
