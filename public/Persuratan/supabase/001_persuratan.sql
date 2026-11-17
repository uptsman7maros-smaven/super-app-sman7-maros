-- ================================================================
-- MODUL PERSURATAN DIGITAL SMAN 7 MAROS
-- Isolated migration. No DROP statements. Review before production.
-- ================================================================
create extension if not exists pgcrypto;

create table if not exists public.letter_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('administrator','guru_staf','kepala_tu','kepala_sekolah')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.letter_has_role(_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.letter_user_roles r
    where r.user_id = auth.uid()
      and r.is_active = true
      and r.role = any(_roles)
  );
$$;

create table if not exists public.letter_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.letter_categories(id) on delete set null,
  name text not null,
  description text,
  subject text,
  html_content text not null default '',
  page_settings jsonb not null default '{"size":"A4","margin_mm":22}'::jsonb,
  fields_schema jsonb not null default '[]'::jsonb,
  requires_principal_approval boolean not null default false,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  source_file_path text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique default ('REQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  template_id uuid not null references public.letter_templates(id),
  requester_id uuid not null references auth.users(id),
  requester_name text not null,
  requester_nip text,
  requester_position text,
  subject text not null,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in
    ('draft','submitted','in_review','revision','resubmitted','approved','awaiting_number','issued','rejected','archived')),
  admin_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.letter_requests(id) on delete cascade,
  editor_id uuid not null references auth.users(id),
  revision_no integer not null,
  form_data jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique(request_id, revision_no)
);

create table if not exists public.letter_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.letter_requests(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  approver_role text not null check (approver_role in ('kepala_tu','kepala_sekolah')),
  decision text not null check (decision in ('approved','revision','rejected')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.letter_number_sequences (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.letter_categories(id) on delete cascade,
  year integer not null,
  last_number integer not null default 0 check (last_number >= 0),
  unique(category_id, year)
);

create table if not exists public.letter_issued (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.letter_requests(id),
  letter_number text not null unique,
  sequence_number integer not null,
  category_code text not null,
  issue_date date not null default current_date,
  signer_name text,
  signer_position text,
  signer_nip text,
  verification_token uuid not null unique default gen_random_uuid(),
  pdf_path text,
  html_snapshot text not null default '',
  issued_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.letter_archives (
  id uuid primary key default gen_random_uuid(),
  issued_id uuid unique references public.letter_issued(id) on delete restrict,
  archive_type text not null default 'outgoing' check (archive_type in ('incoming','outgoing')),
  title text not null,
  reference_number text,
  document_date date,
  year integer not null default extract(year from current_date)::integer,
  month integer not null default extract(month from current_date)::integer,
  file_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.letter_incoming (
  id uuid primary key default gen_random_uuid(),
  external_number text not null,
  sender text not null,
  subject text not null,
  letter_date date,
  received_date date not null default current_date,
  summary text,
  attachment_path text,
  follow_up_status text not null default 'pending' check (follow_up_status in ('pending','in_progress','completed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.letter_outgoing (
  id uuid primary key default gen_random_uuid(),
  issued_id uuid references public.letter_issued(id),
  external_number text,
  recipient text not null,
  subject text not null,
  letter_date date not null default current_date,
  delivery_status text not null default 'prepared' check (delivery_status in ('prepared','sent','received')),
  attachment_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.letter_dispositions (
  id uuid primary key default gen_random_uuid(),
  incoming_id uuid not null references public.letter_incoming(id) on delete cascade,
  assigned_to uuid not null references auth.users(id),
  instruction text not null,
  due_date date,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  follow_up_note text,
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.letter_signatories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nip text,
  position text not null,
  unit text,
  signature_path text,
  active_from date,
  active_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.letter_school_settings (
  id integer primary key default 1 check (id = 1),
  school_name text not null default 'SMA NEGERI 7 MAROS',
  institution_line_1 text default 'PEMERINTAH PROVINSI SULAWESI SELATAN',
  institution_line_2 text default 'DINAS PENDIDIKAN',
  address text,
  phone text,
  email text,
  logo_path text,
  number_pattern text not null default '{seq}/{code}/SMAN.7-MRS/{month_roman}/{year}',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.letter_school_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.letter_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.letter_activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_letter_requests_owner on public.letter_requests(requester_id, created_at desc);
create index if not exists idx_letter_requests_status on public.letter_requests(status, created_at desc);
create index if not exists idx_letter_notifications_user on public.letter_notifications(user_id, is_read, created_at desc);
create index if not exists idx_letter_archive_year_month on public.letter_archives(year, month);

create or replace function public.letter_touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists letter_requests_touch on public.letter_requests;
create trigger letter_requests_touch before update on public.letter_requests
for each row execute function public.letter_touch_updated_at();

drop trigger if exists letter_templates_touch on public.letter_templates;
create trigger letter_templates_touch before update on public.letter_templates
for each row execute function public.letter_touch_updated_at();

create or replace function public.letter_log_request_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.letter_activity_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(),
    case when tg_op = 'INSERT' then 'request_created' else 'request_updated' end,
    'letter_request', coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
drop trigger if exists letter_requests_audit on public.letter_requests;
create trigger letter_requests_audit after insert or update on public.letter_requests
for each row execute function public.letter_log_request_change();

-- Controlled status transitions and atomic numbering. Only Kepala TU issues a number.
create or replace function public.letter_review_request(
  p_request_id uuid, p_decision text, p_note text default null
) returns public.letter_requests
language plpgsql security definer
set search_path = ''
as $$
declare v_req public.letter_requests; v_role text;
begin
  select role into v_role from public.letter_user_roles
  where user_id = auth.uid() and is_active = true;
  if v_role is null or v_role not in ('kepala_tu','kepala_sekolah','administrator') then
    raise exception 'Tidak memiliki kewenangan memproses surat';
  end if;
  if p_decision not in ('approved','revision','rejected') then raise exception 'Keputusan tidak valid'; end if;
  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_role = 'kepala_sekolah' and not exists (
    select 1 from public.letter_templates t where t.id=v_req.template_id and t.requires_principal_approval=true
  ) then raise exception 'Surat ini tidak memerlukan persetujuan Kepala Sekolah'; end if;
  if v_role = 'kepala_tu' and v_req.requester_id = auth.uid() then raise exception 'Pemohon tidak dapat memproses pengajuannya sendiri'; end if;
  if v_req.status not in ('submitted','in_review','resubmitted','approved','awaiting_number') then
    raise exception 'Status pengajuan tidak dapat diproses';
  end if;
  insert into public.letter_approvals(request_id, approver_id, approver_role, decision, note)
  values(p_request_id, auth.uid(), v_role, p_decision, p_note);
  update public.letter_requests
  set status = case p_decision when 'approved' then 'approved' when 'revision' then 'revision' else 'rejected' end,
      admin_note = p_note, reviewed_at = now()
  where id = p_request_id returning * into v_req;
  insert into public.letter_notifications(user_id,title,body,link)
  values(v_req.requester_id,
    case p_decision when 'approved' then 'Pengajuan disetujui' when 'revision' then 'Pengajuan perlu revisi' else 'Pengajuan ditolak' end,
    coalesce(p_note,'Status pengajuan surat Anda telah diperbarui.'),
    '/persuratan/pengajuan/'||p_request_id::text);
  return v_req;
end;
$$;

create or replace function public.letter_issue_number(
  p_request_id uuid, p_issue_date date default current_date,
  p_signer_name text default null, p_signer_position text default null, p_signer_nip text default null
) returns public.letter_issued
language plpgsql security definer
set search_path = ''
as $$
declare v_req public.letter_requests; v_tpl public.letter_templates; v_cat public.letter_categories;
declare v_seq integer; v_year integer; v_month text; v_pattern text; v_number text; v_result public.letter_issued;
begin
  if not public.letter_has_role(array['kepala_tu','administrator']) then raise exception 'Hanya Kepala TU/administrator yang dapat menerbitkan nomor'; end if;
  select * into v_req from public.letter_requests where id=p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then raise exception 'Pengajuan harus disetujui sebelum diberi nomor'; end if;
  select * into v_tpl from public.letter_templates where id=v_req.template_id;
  if v_tpl.requires_principal_approval and not exists (
    select 1 from public.letter_approvals a
    where a.request_id=p_request_id and a.approver_role='kepala_sekolah' and a.decision='approved'
  ) then raise exception 'Surat ini memerlukan persetujuan Kepala Sekolah sebelum diterbitkan'; end if;
  select * into v_cat from public.letter_categories where id=v_tpl.category_id;
  if v_cat.id is null then raise exception 'Kategori surat belum diatur'; end if;
  v_year := extract(year from p_issue_date)::integer;
  insert into public.letter_number_sequences(category_id,year,last_number)
  values(v_cat.id,v_year,0) on conflict(category_id,year) do nothing;
  update public.letter_number_sequences set last_number=last_number+1
  where category_id=v_cat.id and year=v_year returning last_number into v_seq;
  select number_pattern into v_pattern from public.letter_school_settings where id=1;
  v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_issue_date)::integer];
  v_number := replace(replace(replace(replace(replace(v_pattern,
    '{seq}',lpad(v_seq::text,3,'0')),'{code}',v_cat.code),'{month_roman}',v_month),'{year}',v_year::text),'{school}','SMAN.7-MRS');
  insert into public.letter_issued(request_id,letter_number,sequence_number,category_code,issue_date,
    signer_name,signer_position,signer_nip,issued_by,html_snapshot)
  values(p_request_id,v_number,v_seq,v_cat.code,p_issue_date,p_signer_name,p_signer_position,p_signer_nip,auth.uid(),
    coalesce(v_tpl.html_content,''))
  returning * into v_result;
  update public.letter_requests set status='issued', issued_at=now() where id=p_request_id;
  insert into public.letter_archives(issued_id,title,reference_number,document_date,year,month,created_by)
  values(v_result.id,v_req.subject,v_number,p_issue_date,v_year,extract(month from p_issue_date)::integer,auth.uid());
  insert into public.letter_notifications(user_id,title,body,link)
  values(v_req.requester_id,'Surat telah diterbitkan','Nomor surat: '||v_number,'/persuratan/surat-terbit');
  return v_result;
end;
$$;

create or replace function public.letter_submit_request(p_request_id uuid)
returns public.letter_requests language plpgsql security definer set search_path = ''
as $$
declare v_req public.letter_requests;
begin
  select * into v_req from public.letter_requests where id=p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status not in ('draft','revision') then raise exception 'Status tidak dapat dikirim'; end if;
  update public.letter_requests set status=case when v_req.status='revision' then 'resubmitted' else 'submitted' end,
    submitted_at=now() where id=p_request_id returning * into v_req;
  insert into public.letter_notifications(user_id,title,body,link)
  select user_id,'Pengajuan surat baru','Ada pengajuan surat yang perlu diperiksa.','/persuratan/persetujuan'
  from public.letter_user_roles where role='kepala_tu' and is_active=true;
  return v_req;
end;
$$;

create or replace function public.letter_public_verification(p_token uuid)
returns table(letter_number text, subject text, issue_date date, signer_name text, signer_position text, school_name text)
language sql stable security definer set search_path = ''
as $$
  select i.letter_number, r.subject, i.issue_date, i.signer_name, i.signer_position, s.school_name
  from public.letter_issued i
  join public.letter_requests r on r.id=i.request_id
  cross join public.letter_school_settings s
  where i.verification_token=p_token and s.id=1;
$$;

-- RLS
alter table public.letter_user_roles enable row level security;
alter table public.letter_categories enable row level security;
alter table public.letter_templates enable row level security;
alter table public.letter_requests enable row level security;
alter table public.letter_request_revisions enable row level security;
alter table public.letter_approvals enable row level security;
alter table public.letter_number_sequences enable row level security;
alter table public.letter_issued enable row level security;
alter table public.letter_archives enable row level security;
alter table public.letter_incoming enable row level security;
alter table public.letter_outgoing enable row level security;
alter table public.letter_dispositions enable row level security;
alter table public.letter_signatories enable row level security;
alter table public.letter_school_settings enable row level security;
alter table public.letter_notifications enable row level security;
alter table public.letter_activity_logs enable row level security;

-- Remove/recreate only policies with this module's prefix for idempotent re-run.
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies
  where schemaname='public' and policyname like 'letter_%'
 loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

create policy letter_roles_read_self_or_admin on public.letter_user_roles for select to authenticated
using (user_id=auth.uid() or public.letter_has_role(array['administrator']));
create policy letter_roles_admin_all on public.letter_user_roles for all to authenticated
using (public.letter_has_role(array['administrator'])) with check (public.letter_has_role(array['administrator']));

create policy letter_categories_read on public.letter_categories for select to authenticated using (is_active or public.letter_has_role(array['administrator','kepala_tu']));
create policy letter_categories_admin on public.letter_categories for all to authenticated using(public.letter_has_role(array['administrator'])) with check(public.letter_has_role(array['administrator']));

create policy letter_templates_read on public.letter_templates for select to authenticated using (is_active or public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']));
create policy letter_templates_admin on public.letter_templates for all to authenticated using(public.letter_has_role(array['administrator'])) with check(public.letter_has_role(array['administrator']));

create policy letter_requests_select on public.letter_requests for select to authenticated
using (requester_id=auth.uid() or public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']));
create policy letter_requests_insert on public.letter_requests for insert to authenticated
with check (requester_id=auth.uid() and public.letter_has_role(array['guru_staf','administrator']));
create policy letter_requests_update_owner on public.letter_requests for update to authenticated
using (requester_id=auth.uid() and status in ('draft','revision'))
with check (requester_id=auth.uid() and status in ('draft','revision'));
create policy letter_requests_admin_update on public.letter_requests for update to authenticated
using(public.letter_has_role(array['administrator','kepala_tu'])) with check(public.letter_has_role(array['administrator','kepala_tu']));

create policy letter_revisions_read on public.letter_request_revisions for select to authenticated
using (exists(select 1 from public.letter_requests r where r.id=request_id and (r.requester_id=auth.uid() or public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']))));
create policy letter_revisions_insert on public.letter_request_revisions for insert to authenticated
with check (editor_id=auth.uid() and exists(select 1 from public.letter_requests r where r.id=request_id and (r.requester_id=auth.uid() or public.letter_has_role(array['administrator','kepala_tu']))));

create policy letter_approvals_read on public.letter_approvals for select to authenticated
using (public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']) or exists(select 1 from public.letter_requests r where r.id=request_id and r.requester_id=auth.uid()));
create policy letter_issued_read on public.letter_issued for select to authenticated
using (public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']) or exists(select 1 from public.letter_requests r where r.id=request_id and r.requester_id=auth.uid()));
create policy letter_archive_read on public.letter_archives for select to authenticated
using (public.letter_has_role(array['administrator','kepala_tu']) or exists(select 1 from public.letter_issued i join public.letter_requests r on r.id=i.request_id where i.id=issued_id and r.requester_id=auth.uid()));
create policy letter_archive_admin on public.letter_archives for all to authenticated
using(public.letter_has_role(array['administrator'])) with check(public.letter_has_role(array['administrator']));

create policy letter_incoming_admin_tu on public.letter_incoming for all to authenticated
using(public.letter_has_role(array['administrator','kepala_tu'])) with check(public.letter_has_role(array['administrator','kepala_tu']));
create policy letter_outgoing_read on public.letter_outgoing for select to authenticated using(public.letter_has_role(array['administrator','kepala_tu']));
create policy letter_outgoing_write on public.letter_outgoing for insert to authenticated with check(public.letter_has_role(array['administrator','kepala_tu']));
create policy letter_dispositions_read on public.letter_dispositions for select to authenticated
using (assigned_to=auth.uid() or public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah']));
create policy letter_dispositions_write on public.letter_dispositions for all to authenticated
using(public.letter_has_role(array['administrator','kepala_sekolah'])) with check(public.letter_has_role(array['administrator','kepala_sekolah']));
create policy letter_signatories_read on public.letter_signatories for select to authenticated using(true);
create policy letter_signatories_admin on public.letter_signatories for all to authenticated
using(public.letter_has_role(array['administrator'])) with check(public.letter_has_role(array['administrator']));
create policy letter_settings_read on public.letter_school_settings for select to authenticated using(true);
create policy letter_settings_admin on public.letter_school_settings for all to authenticated
using(public.letter_has_role(array['administrator'])) with check(public.letter_has_role(array['administrator']));
create policy letter_notifications_own on public.letter_notifications for select to authenticated using(user_id=auth.uid());
create policy letter_notifications_update_own on public.letter_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy letter_logs_admin_read on public.letter_activity_logs for select to authenticated using(public.letter_has_role(array['administrator']));

-- PostgREST table privileges are required in addition to RLS policies.
-- RLS remains the row-level boundary for every authenticated operation.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.letter_user_roles,
  public.letter_categories,
  public.letter_templates,
  public.letter_requests,
  public.letter_request_revisions,
  public.letter_approvals,
  public.letter_number_sequences,
  public.letter_issued,
  public.letter_archives,
  public.letter_incoming,
  public.letter_outgoing,
  public.letter_dispositions,
  public.letter_signatories,
  public.letter_school_settings,
  public.letter_notifications,
  public.letter_activity_logs
to authenticated;

-- Storage bucket private. File paths should be organized as <auth.uid()>/...
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('letter-files','letter-files',false,15728640,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','image/png','image/jpeg'])
on conflict (id) do nothing;

drop policy if exists letter_storage_read on storage.objects;
create policy letter_storage_read on storage.objects for select to authenticated
using (bucket_id='letter-files' and (
  (storage.foldername(name))[1]=auth.uid()::text
  or public.letter_has_role(array['administrator','kepala_tu','kepala_sekolah'])
));
drop policy if exists letter_storage_insert on storage.objects;
create policy letter_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='letter-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists letter_storage_update on storage.objects;
create policy letter_storage_update on storage.objects for update to authenticated
using (bucket_id='letter-files' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='letter-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists letter_storage_delete on storage.objects;
create policy letter_storage_delete on storage.objects for delete to authenticated
using (bucket_id='letter-files' and (storage.foldername(name))[1]=auth.uid()::text);

grant execute on function public.letter_has_role(text[]) to authenticated;
grant execute on function public.letter_review_request(uuid,text,text) to authenticated;
grant execute on function public.letter_issue_number(uuid,date,text,text,text) to authenticated;
grant execute on function public.letter_submit_request(uuid) to authenticated;
grant execute on function public.letter_public_verification(uuid) to anon, authenticated;

-- Seed category defaults
insert into public.letter_categories(name,code,description) values
('Undangan','UND','Surat undangan'),
('Tugas','TGS','Surat tugas'),
('Keterangan','KET','Surat keterangan'),
('Permohonan','PMH','Surat permohonan'),
('Pengantar','PNG','Surat pengantar')
on conflict do nothing;
