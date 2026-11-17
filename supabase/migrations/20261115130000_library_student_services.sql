create table if not exists public.library_librarian_assignments (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create table if not exists public.library_settings (
  singleton boolean primary key default true check (singleton),
  physical_loan_days integer not null default 7 check (physical_loan_days between 1 and 90),
  digital_access_minutes integer not null default 30 check (digital_access_minutes between 1 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.library_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.library_members
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.library_loans
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

alter table public.library_visits
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists library_members_profile_id_idx
  on public.library_members (profile_id);
create index if not exists library_loans_profile_active_idx
  on public.library_loans (profile_id, due_at desc);
create index if not exists library_visits_profile_date_idx
  on public.library_visits (profile_id, visit_date desc);

update public.library_members member
set profile_id = profile.id
from public.profiles profile
where member.profile_id is null
  and profile.status::text = 'active'
  and profile.role::text = 'siswa'
  and (
    btrim(coalesce(member.identifier, '')) = btrim(profile.username)
    or btrim(coalesce(member.member_no, '')) = btrim(profile.username)
  );

update public.library_loans loan
set profile_id = member.profile_id
from public.library_members member
where loan.profile_id is null
  and loan.member_id::text = member.id::text
  and member.profile_id is not null;

create table if not exists public.library_loan_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_username text not null,
  student_name text not null,
  book_id text not null,
  requested_at timestamptz not null default now(),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  due_at date,
  loan_id text
);

create index if not exists library_loan_requests_student_idx
  on public.library_loan_requests (student_id, requested_at desc);
create index if not exists library_loan_requests_pending_idx
  on public.library_loan_requests (status, requested_at)
  where status = 'pending';
create unique index if not exists library_loan_requests_one_pending_per_book
  on public.library_loan_requests (student_id, book_id)
  where status = 'pending';

create table if not exists public.library_digital_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  description text,
  file_path text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.library_digital_access (
  id uuid primary key default gen_random_uuid(),
  digital_book_id uuid not null references public.library_digital_books(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_username text not null,
  student_name text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected', 'expired')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  granted_at timestamptz,
  expires_at timestamptz
);

create index if not exists library_digital_access_student_idx
  on public.library_digital_access (student_id, requested_at desc);
create index if not exists library_digital_access_active_idx
  on public.library_digital_access (student_id, expires_at)
  where status = 'active';
create unique index if not exists library_digital_access_one_pending_per_book
  on public.library_digital_access (student_id, digital_book_id)
  where status = 'pending';

create or replace function public.library_is_head_librarian()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.library_librarian_assignments assignment
    join public.profiles profile on profile.id = assignment.profile_id
    where assignment.profile_id = auth.uid()
      and assignment.active
      and profile.status::text = 'active'
      and profile.role::text = 'guru'
  );
$function$;

create or replace function public.library_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    public.has_active_role(array['super_admin'::public.app_role])
      or public.library_is_head_librarian(),
    false
  );
$function$;

create or replace function public.library_student_display_name()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(nullif(btrim(profile.full_name), ''), profile.username)
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status::text = 'active'
    and profile.role::text = 'siswa';
$function$;

create or replace function public.library_assign_head_librarian(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
    or not public.has_active_role(array['super_admin'::public.app_role]) then
    raise exception 'Hanya Super Admin yang dapat menetapkan Kepala Perpustakaan.';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.status::text = 'active'
      and profile.role::text = 'guru'
  ) then
    raise exception 'Pilih akun guru yang aktif. Role utama akun tidak akan diubah.';
  end if;

  insert into public.library_librarian_assignments (profile_id, active, assigned_by, assigned_at)
  values (p_profile_id, true, auth.uid(), now())
  on conflict (profile_id) do update
    set active = true,
        assigned_by = excluded.assigned_by,
        assigned_at = now();
end;
$function$;

create or replace function public.library_remove_head_librarian(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
    or not public.has_active_role(array['super_admin'::public.app_role]) then
    raise exception 'Hanya Super Admin yang dapat mengubah penugasan Kepala Perpustakaan.';
  end if;

  delete from public.library_librarian_assignments
  where profile_id = p_profile_id;
end;
$function$;

create or replace function public.library_update_settings(
  p_physical_loan_days integer,
  p_digital_access_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya Kepala Perpustakaan yang dapat mengubah pengaturan layanan.';
  end if;

  if p_physical_loan_days not between 1 and 90
    or p_digital_access_minutes not between 1 and 1440 then
    raise exception 'Masa pinjam harus 1–90 hari dan akses digital 1–1440 menit.';
  end if;

  update public.library_settings
  set physical_loan_days = p_physical_loan_days,
      digital_access_minutes = p_digital_access_minutes,
      updated_by = auth.uid(),
      updated_at = now()
  where singleton;
end;
$function$;

create or replace function public.library_request_physical_loan(
  p_book_id text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := auth.uid();
  v_student_username text;
  v_student_name text;
  v_request_id uuid;
begin
  if v_student_id is null
    or not public.has_active_role(array['siswa'::public.app_role]) then
    raise exception 'Hanya siswa aktif yang dapat mengajukan peminjaman.';
  end if;

  if nullif(btrim(p_book_id), '') is null
    or length(coalesce(p_note, '')) > 500 then
    raise exception 'Data permintaan peminjaman tidak valid.';
  end if;

  select profile.username,
         coalesce(nullif(btrim(profile.full_name), ''), profile.username)
  into v_student_username, v_student_name
  from public.profiles profile
  where profile.id = v_student_id
    and profile.status::text = 'active';
  if v_student_username is null then
    raise exception 'Akun siswa tidak aktif atau tidak ditemukan.';
  end if;

  if not exists (
    select 1
    from public.library_books book
    where book.id::text = btrim(p_book_id)
      and book.stock_available > 0
  ) then
    raise exception 'Buku tidak tersedia untuk dipinjam.';
  end if;

  insert into public.library_loan_requests (
    student_id, student_username, student_name, book_id, note
  )
  values (
    v_student_id, v_student_username, v_student_name, btrim(p_book_id), nullif(btrim(p_note), '')
  )
  on conflict (student_id, book_id) where status = 'pending' do nothing
  returning id into v_request_id;

  if v_request_id is null then
    raise exception 'Permintaan untuk buku ini masih menunggu persetujuan.';
  end if;
  return v_request_id;
end;
$function$;

create or replace function public.library_review_physical_loan(
  p_request_id uuid,
  p_decision text,
  p_due_at date default null,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.library_loan_requests%rowtype;
  v_book public.library_books%rowtype;
  v_member public.library_members%rowtype;
  v_username text;
  v_student_name text;
  v_due_at date;
  v_loan_days integer;
  v_loan_code text;
  v_loan_id text;
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya Kepala Perpustakaan yang dapat memproses permintaan.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan permintaan tidak valid.';
  end if;

  select request.*
  into v_request
  from public.library_loan_requests request
  where request.id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' then
    raise exception 'Permintaan tidak ditemukan atau sudah diproses.';
  end if;

  if p_decision = 'rejected' then
    update public.library_loan_requests
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = nullif(btrim(p_review_note), '')
    where id = p_request_id;
    return;
  end if;

  select book.*
  into v_book
  from public.library_books book
  where book.id::text = v_request.book_id
  for update;

  if not found or v_book.stock_available < 1 then
    raise exception 'Stok buku tidak lagi tersedia.';
  end if;

  select setting.physical_loan_days
  into v_loan_days
  from public.library_settings setting
  where setting.singleton;
  v_loan_days := coalesce(v_loan_days, 7);
  v_due_at := coalesce(p_due_at, (now() at time zone 'Asia/Makassar')::date + v_loan_days);
  if v_due_at < (now() at time zone 'Asia/Makassar')::date then
    raise exception 'Tanggal jatuh tempo tidak boleh sebelum hari ini.';
  end if;

  select profile.username,
         coalesce(nullif(btrim(student.full_name), ''), nullif(btrim(profile.full_name), ''), profile.username)
  into v_username, v_student_name
  from public.profiles profile
  left join public.students student
    on btrim(student.nisn) = btrim(profile.username)
  where profile.id = v_request.student_id
    and profile.status::text = 'active'
    and profile.role::text = 'siswa';

  if v_username is null then
    raise exception 'Akun siswa tidak aktif atau tidak ditemukan.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_request.student_id::text));
  select member.*
  into v_member
  from public.library_members member
  where member.profile_id = v_request.student_id
     or member.identifier = v_username
     or member.member_no = v_username
  order by (member.profile_id = v_request.student_id) desc nulls last
  limit 1
  for update;

  if not found then
    insert into public.library_members (
      member_no, full_name, member_type, identifier, active, profile_id
    )
    values (
      'S-' || v_username, v_student_name, 'siswa', v_username, true, v_request.student_id
    )
    returning * into v_member;
  elsif v_member.profile_id is null then
    update public.library_members
    set profile_id = v_request.student_id
    where id::text = v_member.id::text
    returning * into v_member;
  end if;

  v_loan_code := 'PJM-' ||
    to_char((now() at time zone 'Asia/Makassar')::date, 'YYYYMMDD') || '-' ||
    upper(substr(gen_random_uuid()::text, 1, 6));

  insert into public.library_loans (
    loan_code, book_id, member_id, borrowed_at, due_at, note, created_by, profile_id
  )
  values (
    v_loan_code,
    v_book.id,
    v_member.id,
    (now() at time zone 'Asia/Makassar')::date,
    v_due_at,
    coalesce(v_request.note, nullif(btrim(p_review_note), '')),
    auth.uid(),
    v_request.student_id
  )
  returning id::text into v_loan_id;

  update public.library_books
  set stock_available = stock_available - 1
  where id::text = v_book.id::text;

  update public.library_loan_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), ''),
      due_at = v_due_at,
      loan_id = v_loan_id
  where id = p_request_id;
end;
$function$;

create or replace function public.library_request_digital_access(p_book_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access_id uuid;
  v_student_username text;
  v_student_name text;
begin
  if auth.uid() is null
    or not public.has_active_role(array['siswa'::public.app_role]) then
    raise exception 'Hanya siswa aktif yang dapat mengajukan akses buku digital.';
  end if;

  if not exists (
    select 1
    from public.library_digital_books book
    where book.id = p_book_id and book.active
  ) then
    raise exception 'Buku digital tidak tersedia.';
  end if;

  select profile.username,
         coalesce(nullif(btrim(profile.full_name), ''), profile.username)
  into v_student_username, v_student_name
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.status::text = 'active';
  if v_student_username is null then
    raise exception 'Akun siswa tidak aktif atau tidak ditemukan.';
  end if;

  select access.id
  into v_access_id
  from public.library_digital_access access
  where access.student_id = auth.uid()
    and access.digital_book_id = p_book_id
    and (
      access.status = 'pending'
      or (access.status = 'active' and access.expires_at > now())
    )
  order by access.requested_at desc
  limit 1;

  if v_access_id is not null then
    return v_access_id;
  end if;

  insert into public.library_digital_access (
    digital_book_id, student_id, student_username, student_name
  )
  values (p_book_id, auth.uid(), v_student_username, v_student_name)
  on conflict (student_id, digital_book_id) where status = 'pending' do nothing
  returning id into v_access_id;

  if v_access_id is null then
    select access.id
    into v_access_id
    from public.library_digital_access access
    where access.student_id = auth.uid()
      and access.digital_book_id = p_book_id
      and access.status = 'pending'
    order by access.requested_at desc
    limit 1;
  end if;
  return v_access_id;
end;
$function$;

create or replace function public.library_review_digital_access(
  p_access_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access public.library_digital_access%rowtype;
  v_minutes integer;
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya Kepala Perpustakaan yang dapat memproses akses digital.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan akses digital tidak valid.';
  end if;

  select access.*
  into v_access
  from public.library_digital_access access
  where access.id = p_access_id
  for update;

  if not found or v_access.status <> 'pending' then
    raise exception 'Permintaan akses tidak ditemukan atau sudah diproses.';
  end if;

  if p_decision = 'rejected' then
    update public.library_digital_access
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_access_id;
    return;
  end if;

  select setting.digital_access_minutes
  into v_minutes
  from public.library_settings setting
  where setting.singleton;
  v_minutes := coalesce(v_minutes, 30);

  update public.library_digital_access
  set status = 'active',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      granted_at = now(),
      expires_at = now() + make_interval(mins => v_minutes)
  where id = p_access_id;
end;
$function$;

create or replace function public.library_create_loan(
  p_book_id text,
  p_member_id text,
  p_loan_code text,
  p_borrowed_at date,
  p_due_at date,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_book public.library_books%rowtype;
  v_member public.library_members%rowtype;
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya Kepala Perpustakaan yang dapat mencatat peminjaman.';
  end if;

  if p_book_id is null or p_member_id is null or p_loan_code is null
    or p_borrowed_at is null or p_due_at is null or p_due_at < p_borrowed_at then
    raise exception 'Data peminjaman tidak valid.';
  end if;

  select book.*
  into v_book
  from public.library_books book
  where book.id::text = p_book_id
  for update;
  if not found then raise exception 'Buku tidak ditemukan.'; end if;
  if v_book.stock_available < 1 then raise exception 'Stok buku tidak tersedia.'; end if;

  select member.*
  into v_member
  from public.library_members member
  where member.id::text = p_member_id and member.active
  for share;
  if not found then raise exception 'Anggota tidak ditemukan atau tidak aktif.'; end if;

  insert into public.library_loans (
    loan_code, book_id, member_id, borrowed_at, due_at, note, created_by, profile_id
  )
  values (
    p_loan_code, v_book.id, v_member.id, p_borrowed_at, p_due_at, p_note, auth.uid(), v_member.profile_id
  );

  update public.library_books
  set stock_available = stock_available - 1
  where id::text = v_book.id::text;
  return true;
end;
$function$;

create or replace function public.library_return_loan(
  p_loan_id text,
  p_returned_at date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_loan public.library_loans%rowtype;
  v_book public.library_books%rowtype;
begin
  if auth.uid() is null or not public.library_can_manage() then
    raise exception 'Hanya Kepala Perpustakaan yang dapat mencatat pengembalian.';
  end if;
  if p_loan_id is null or p_returned_at is null then
    raise exception 'Data pengembalian tidak valid.';
  end if;

  select loan.*
  into v_loan
  from public.library_loans loan
  where loan.id::text = p_loan_id
  for update;
  if not found then raise exception 'Transaksi peminjaman tidak ditemukan.'; end if;
  if v_loan.returned_at is not null then raise exception 'Transaksi ini sudah dikembalikan.'; end if;

  select book.*
  into v_book
  from public.library_books book
  where book.id = v_loan.book_id
  for update;
  if not found then raise exception 'Data buku untuk transaksi ini tidak ditemukan.'; end if;

  update public.library_loans
  set returned_at = p_returned_at, status = 'returned'
  where id::text = v_loan.id::text;

  update public.library_books
  set stock_available = least(stock_total, stock_available + 1)
  where id::text = v_book.id::text;
  return true;
end;
$function$;

create or replace function public.library_record_student_visit(
  p_visitor_name text,
  p_visit_date date default null,
  p_purpose text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_visit_id text;
  v_student_name text;
begin
  if auth.uid() is null
    or not public.has_active_role(array['siswa'::public.app_role]) then
    raise exception 'Hanya siswa aktif yang dapat mencatat kunjungan sendiri.';
  end if;
  if nullif(btrim(p_visitor_name), '') is null
    or length(p_visitor_name) > 150
    or length(coalesce(p_purpose, '')) > 300 then
    raise exception 'Nama dan tujuan kunjungan tidak valid.';
  end if;

  v_student_name := public.library_student_display_name();
  if v_student_name is null then
    raise exception 'Profil siswa tidak aktif atau tidak ditemukan.';
  end if;

  insert into public.library_visits (
    visit_date, visitor_name, visitor_type, purpose, profile_id
  )
  values (
    coalesce(p_visit_date, (now() at time zone 'Asia/Makassar')::date),
    v_student_name,
    'siswa',
    nullif(btrim(p_purpose), ''),
    auth.uid()
  )
  returning id::text into v_visit_id;

  return v_visit_id;
end;
$function$;

alter table public.library_librarian_assignments enable row level security;
alter table public.library_settings enable row level security;
alter table public.library_loan_requests enable row level security;
alter table public.library_digital_books enable row level security;
alter table public.library_digital_access enable row level security;

drop policy if exists library_librarian_assignments_read on public.library_librarian_assignments;
create policy library_librarian_assignments_read on public.library_librarian_assignments
  for select to authenticated
  using (profile_id = auth.uid() or public.has_active_role(array['super_admin'::public.app_role]));
drop policy if exists library_librarian_assignments_admin_write on public.library_librarian_assignments;
create policy library_librarian_assignments_admin_write on public.library_librarian_assignments
  for all to authenticated
  using (public.has_active_role(array['super_admin'::public.app_role]))
  with check (
    public.has_active_role(array['super_admin'::public.app_role])
    and exists (
      select 1
      from public.profiles profile
      where profile.id = library_librarian_assignments.profile_id
        and profile.status::text = 'active'
        and profile.role::text = 'guru'
    )
  );

drop policy if exists library_settings_read on public.library_settings;
create policy library_settings_read on public.library_settings
  for select to authenticated
  using (public.library_can_manage());
drop policy if exists library_settings_update on public.library_settings;
create policy library_settings_update on public.library_settings
  for update to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());

drop policy if exists library_loan_requests_read on public.library_loan_requests;
create policy library_loan_requests_read on public.library_loan_requests
  for select to authenticated
  using (
    public.library_can_manage()
    or (student_id = auth.uid() and public.has_active_role(array['siswa'::public.app_role]))
  );

drop policy if exists library_digital_books_read on public.library_digital_books;
create policy library_digital_books_read on public.library_digital_books
  for select to authenticated
  using (
    (active and public.has_active_role(array[
      'super_admin'::public.app_role,
      'kepala_sekolah'::public.app_role,
      'operator'::public.app_role,
      'guru'::public.app_role,
      'siswa'::public.app_role
    ]))
    or public.library_can_manage()
  );
drop policy if exists library_digital_books_manager_write on public.library_digital_books;
create policy library_digital_books_manager_write on public.library_digital_books
  for all to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());

drop policy if exists library_digital_access_read on public.library_digital_access;
create policy library_digital_access_read on public.library_digital_access
  for select to authenticated
  using (
    public.library_can_manage()
    or (student_id = auth.uid() and public.has_active_role(array['siswa'::public.app_role]))
  );

grant select on public.library_librarian_assignments to authenticated;
grant select on public.library_settings to authenticated;
grant select on public.library_loan_requests to authenticated;
grant select on public.library_digital_books to authenticated;
grant select on public.library_digital_access to authenticated;
grant insert, update, delete on public.library_digital_books to authenticated;
grant update on public.library_settings to authenticated;

drop policy if exists library_books_insert_role_scope on public.library_books;
create policy library_books_insert_role_scope on public.library_books
  as restrictive for insert to authenticated
  with check (public.library_can_manage());
drop policy if exists library_books_update_role_scope on public.library_books;
create policy library_books_update_role_scope on public.library_books
  as restrictive for update to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());
drop policy if exists library_books_delete_role_scope on public.library_books;
create policy library_books_delete_role_scope on public.library_books
  as restrictive for delete to authenticated
  using (public.has_active_role(array['super_admin'::public.app_role]));

drop policy if exists library_members_active_role_restriction on public.library_members;
create policy library_members_active_role_restriction on public.library_members
  as restrictive for all to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());
drop policy if exists library_members_insert_role_scope on public.library_members;
create policy library_members_insert_role_scope on public.library_members
  as restrictive for insert to authenticated
  with check (public.library_can_manage());
drop policy if exists library_members_update_role_scope on public.library_members;
create policy library_members_update_role_scope on public.library_members
  as restrictive for update to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());
drop policy if exists library_members_delete_role_scope on public.library_members;
create policy library_members_delete_role_scope on public.library_members
  as restrictive for delete to authenticated
  using (public.has_active_role(array['super_admin'::public.app_role]));

drop policy if exists library_loans_active_role_restriction on public.library_loans;
create policy library_loans_active_role_restriction on public.library_loans
  as restrictive for all to authenticated
  using (
    public.library_can_manage()
    or (
      profile_id = auth.uid()
      and public.has_active_role(array['siswa'::public.app_role])
    )
  )
  with check (public.library_can_manage());
drop policy if exists library_loans_student_read on public.library_loans;
create policy library_loans_student_read on public.library_loans
  for select to authenticated
  using (
    public.library_can_manage()
    or (profile_id = auth.uid() and public.has_active_role(array['siswa'::public.app_role]))
  );
drop policy if exists library_loans_insert_role_scope on public.library_loans;
create policy library_loans_insert_role_scope on public.library_loans
  as restrictive for insert to authenticated
  with check (public.library_can_manage());
drop policy if exists library_loans_update_role_scope on public.library_loans;
create policy library_loans_update_role_scope on public.library_loans
  as restrictive for update to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());
drop policy if exists library_loans_delete_role_scope on public.library_loans;
create policy library_loans_delete_role_scope on public.library_loans
  as restrictive for delete to authenticated
  using (public.has_active_role(array['super_admin'::public.app_role]));

drop policy if exists library_visits_active_role_restriction on public.library_visits;
create policy library_visits_active_role_restriction on public.library_visits
  as restrictive for all to authenticated
  using (
    public.library_can_manage()
    or (
      profile_id = auth.uid()
      and public.has_active_role(array['siswa'::public.app_role])
    )
  )
  with check (
    public.library_can_manage()
    or (
      profile_id = auth.uid()
      and public.has_active_role(array['siswa'::public.app_role])
    )
  );
drop policy if exists library_visits_student_read on public.library_visits;
create policy library_visits_student_read on public.library_visits
  for select to authenticated
  using (
    public.library_can_manage()
    or (
      profile_id = auth.uid()
      and public.has_active_role(array['siswa'::public.app_role])
    )
  );
drop policy if exists library_visits_insert_role_scope on public.library_visits;
create policy library_visits_insert_role_scope on public.library_visits
  as restrictive for insert to authenticated
  with check (
    public.library_can_manage()
    or (
      profile_id = auth.uid()
      and public.has_active_role(array['siswa'::public.app_role])
      and visitor_type = 'siswa'
      and visitor_name = public.library_student_display_name()
      and visit_date = (now() at time zone 'Asia/Makassar')::date
    )
  );
drop policy if exists library_visits_update_role_scope on public.library_visits;
create policy library_visits_update_role_scope on public.library_visits
  as restrictive for update to authenticated
  using (public.library_can_manage())
  with check (public.library_can_manage());
drop policy if exists library_visits_delete_role_scope on public.library_visits;
create policy library_visits_delete_role_scope on public.library_visits
  as restrictive for delete to authenticated
  using (public.has_active_role(array['super_admin'::public.app_role]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-digital-books', 'library-digital-books', false, 31457280, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 31457280,
    allowed_mime_types = array['application/pdf'];

drop policy if exists library_digital_objects_manager_read on storage.objects;
create policy library_digital_objects_manager_read on storage.objects
  for select to authenticated
  using (bucket_id = 'library-digital-books' and public.library_can_manage());
drop policy if exists library_digital_objects_manager_insert on storage.objects;
create policy library_digital_objects_manager_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library-digital-books' and public.library_can_manage());
drop policy if exists library_digital_objects_manager_update on storage.objects;
create policy library_digital_objects_manager_update on storage.objects
  for update to authenticated
  using (bucket_id = 'library-digital-books' and public.library_can_manage())
  with check (bucket_id = 'library-digital-books' and public.library_can_manage());
drop policy if exists library_digital_objects_manager_delete on storage.objects;
create policy library_digital_objects_manager_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'library-digital-books' and public.library_can_manage());

revoke all on function public.library_is_head_librarian() from public, anon;
revoke all on function public.library_can_manage() from public, anon;
revoke all on function public.library_student_display_name() from public, anon;
revoke all on function public.library_assign_head_librarian(uuid) from public, anon;
revoke all on function public.library_remove_head_librarian(uuid) from public, anon;
revoke all on function public.library_update_settings(integer, integer) from public, anon;
revoke all on function public.library_request_physical_loan(text, text) from public, anon;
revoke all on function public.library_review_physical_loan(uuid, text, date, text) from public, anon;
revoke all on function public.library_request_digital_access(uuid) from public, anon;
revoke all on function public.library_review_digital_access(uuid, text, text) from public, anon;
revoke all on function public.library_record_student_visit(text, date, text) from public, anon;
grant execute on function public.library_is_head_librarian() to authenticated;
grant execute on function public.library_can_manage() to authenticated;
grant execute on function public.library_student_display_name() to authenticated;
grant execute on function public.library_assign_head_librarian(uuid) to authenticated;
grant execute on function public.library_remove_head_librarian(uuid) to authenticated;
grant execute on function public.library_update_settings(integer, integer) to authenticated;
grant execute on function public.library_request_physical_loan(text, text) to authenticated;
grant execute on function public.library_review_physical_loan(uuid, text, date, text) to authenticated;
grant execute on function public.library_request_digital_access(uuid) to authenticated;
grant execute on function public.library_review_digital_access(uuid, text, text) to authenticated;
grant execute on function public.library_record_student_visit(text, date, text) to authenticated;
