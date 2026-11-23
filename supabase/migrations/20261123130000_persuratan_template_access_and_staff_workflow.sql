-- Persuratan template visibility, institutional requests, and TU workflow.
-- Safe to apply more than once; no data is deleted.

alter table public.letter_templates
  add column if not exists available_to_teacher boolean not null default true,
  add column if not exists hide_requester_identity boolean not null default false;

update public.letter_templates
set available_to_teacher = true
where available_to_teacher is null;

alter table public.letter_approvals
  drop constraint if exists letter_approvals_approver_role_check;
alter table public.letter_approvals
  add constraint letter_approvals_approver_role_check
  check (approver_role in ('administrator','kepala_tu','staf_tu','kepala_sekolah'));

drop policy if exists letter_templates_read on public.letter_templates;
create policy letter_templates_read on public.letter_templates
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator'])
    or (
      is_active
      and (
        public.letter_has_role(array['kepala_tu','staf_tu','kepala_sekolah'])
        or available_to_teacher
      )
    )
    or exists (
      select 1
      from public.letter_requests request
      where request.template_id = letter_templates.id
        and request.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_requests_select on public.letter_requests;
create policy letter_requests_select on public.letter_requests
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    requester_id = auth.uid()
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

drop policy if exists letter_requests_insert on public.letter_requests;
create policy letter_requests_insert on public.letter_requests
for insert to authenticated
with check (
  requester_id = auth.uid()
  and public.letter_current_role() is not null
  and public.letter_current_role() <> 'pemohon'
);

drop policy if exists letter_approvals_read on public.letter_approvals;
create policy letter_approvals_read on public.letter_approvals
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
    or exists (
      select 1 from public.letter_requests request
      where request.id = request_id and request.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_issued_read on public.letter_issued;
create policy letter_issued_read on public.letter_issued
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
    or exists (
      select 1
      from public.letter_requests request
      where request.id = request_id and request.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_archive_read on public.letter_archives;
create policy letter_archive_read on public.letter_archives
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu'])
    or exists (
      select 1
      from public.letter_issued issued
      join public.letter_requests request on request.id = issued.request_id
      where issued.id = issued_id and request.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_incoming_admin_tu on public.letter_incoming;
create policy letter_incoming_admin_tu on public.letter_incoming
for all to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']))
with check (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_outgoing_read on public.letter_outgoing;
create policy letter_outgoing_read on public.letter_outgoing
for select to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_outgoing_write on public.letter_outgoing;
create policy letter_outgoing_write on public.letter_outgoing
for insert to authenticated
with check (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_storage_read on storage.objects;
create policy letter_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'letter-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

create or replace function public.letter_submit_request(p_request_id uuid)
returns public.letter_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_template public.letter_templates;
  v_role text := public.letter_current_role();
begin
  if v_role is null or v_role = 'pemohon' then
    raise exception 'Akun ini tidak dapat mengajukan surat';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_req.status not in ('draft','revision') then
    raise exception 'Status tidak dapat dikirim';
  end if;

  select * into v_template
  from public.letter_templates
  where id = v_req.template_id;
  if not found or not v_template.is_active then
    raise exception 'Format surat tidak aktif atau tidak ditemukan';
  end if;
  if v_role = 'guru_staf' and not v_template.available_to_teacher then
    raise exception 'Format surat ini khusus Tata Usaha dan Administrator';
  end if;

  update public.letter_requests
  set status = case when v_req.status = 'revision' then 'resubmitted' else 'submitted' end,
      submitted_at = now()
  where id = p_request_id
  returning * into v_req;

  insert into public.letter_notifications(user_id,title,body,link,letter_request_id)
  select profile.id,
    'Pengajuan surat baru',
    'Ada pengajuan surat yang perlu diperiksa.',
    '/persuratan/persetujuan',
    p_request_id
  from public.profiles profile
  where profile.status = 'active'
    and profile.role::text in ('super_admin','kepala_tata_usaha','staff_tata_usaha');

  return v_req;
end;
$$;

create or replace function public.letter_review_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.letter_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_role text := public.letter_current_role();
begin
  if v_role is null or v_role not in ('kepala_tu','staf_tu','kepala_sekolah','administrator') then
    raise exception 'Tidak memiliki kewenangan memproses surat';
  end if;
  if p_decision not in ('approved','revision','rejected') then
    raise exception 'Keputusan tidak valid';
  end if;

  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_role = 'kepala_sekolah' and not exists (
    select 1 from public.letter_templates template
    where template.id = v_req.template_id and template.requires_principal_approval
  ) then
    raise exception 'Surat ini tidak memerlukan persetujuan Kepala Sekolah';
  end if;
  if v_role = 'kepala_sekolah' and v_req.status <> 'approved' then
    raise exception 'Persetujuan Kepala Sekolah dilakukan setelah persetujuan Kepala TU';
  end if;
  if v_role in ('kepala_tu','staf_tu') and v_req.requester_id = auth.uid() then
    raise exception 'Pemohon tidak dapat memproses pengajuannya sendiri';
  end if;
  if v_req.status not in ('submitted','in_review','resubmitted','approved','awaiting_number') then
    raise exception 'Status pengajuan tidak dapat diproses';
  end if;

  insert into public.letter_approvals(request_id,approver_id,approver_role,decision,note)
  values(p_request_id,auth.uid(),v_role,p_decision,p_note);
  update public.letter_requests
  set status = case p_decision
        when 'approved' then 'approved'
        when 'revision' then 'revision'
        else 'rejected'
      end,
      admin_note = p_note,
      reviewed_at = now(),
      approved_at = case when p_decision = 'approved' then now() else null end
  where id = p_request_id
  returning * into v_req;

  insert into public.letter_notifications(user_id,title,body,link,letter_request_id)
  values(
    v_req.requester_id,
    case p_decision when 'approved' then 'Pengajuan disetujui' when 'revision' then 'Pengajuan perlu revisi' else 'Pengajuan ditolak' end,
    coalesce(p_note,'Status pengajuan surat Anda telah diperbarui.'),
    '/persuratan/pengajuan/'||p_request_id::text,
    p_request_id
  );
  return v_req;
end;
$$;

create or replace function public.letter_issue_number(
  p_request_id uuid,
  p_letter_number text default null,
  p_issue_date date default current_date,
  p_signer_name text default null,
  p_signer_position text default null,
  p_signer_nip text default null
)
returns public.letter_issued
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_template public.letter_templates;
  v_category public.letter_categories;
  v_seq integer;
  v_year integer;
  v_month text;
  v_pattern text;
  v_number text;
  v_result public.letter_issued;
begin
  if not public.letter_has_role(array['kepala_tu','staf_tu','administrator']) then
    raise exception 'Hanya Kepala TU, Staf TU, atau Administrator yang dapat menerbitkan nomor';
  end if;

  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then
    raise exception 'Pengajuan harus disetujui sebelum diberi nomor';
  end if;

  select * into v_template from public.letter_templates where id = v_req.template_id;
  if not found then raise exception 'Template surat tidak ditemukan'; end if;
  if not v_template.requires_number then
    raise exception 'Template ini tidak memerlukan penerbitan nomor surat';
  end if;
  if v_template.requires_principal_approval and not exists (
    select 1 from public.letter_approvals approval
    where approval.request_id = p_request_id
      and approval.approver_role = 'kepala_sekolah'
      and approval.decision = 'approved'
  ) then
    raise exception 'Surat ini memerlukan persetujuan Kepala Sekolah sebelum diterbitkan';
  end if;

  select * into v_category from public.letter_categories where id = v_template.category_id;
  if v_category.id is null then raise exception 'Kategori surat belum diatur'; end if;

  v_number := nullif(btrim(p_letter_number), '');
  if v_number is null then
    v_year := extract(year from p_issue_date)::integer;
    insert into public.letter_number_sequences(category_id,year,last_number)
    values(v_category.id,v_year,0)
    on conflict(category_id,year) do nothing;
    update public.letter_number_sequences
    set last_number = last_number + 1
    where category_id = v_category.id and year = v_year
    returning last_number into v_seq;

    select number_pattern into v_pattern from public.letter_school_settings where id = 1;
    v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_issue_date)::integer];
    v_number := replace(replace(replace(replace(replace(v_pattern,
      '{seq}',lpad(v_seq::text,3,'0')),
      '{code}',v_category.code),
      '{month_roman}',v_month),
      '{year}',v_year::text),
      '{school}','SMAN.7-MRS');
  end if;
  if length(v_number) > 160 then raise exception 'Nomor surat terlalu panjang'; end if;

  insert into public.letter_issued(
    request_id,letter_number,sequence_number,category_code,issue_date,
    signer_name,signer_position,signer_nip,issued_by,html_snapshot
  )
  values(
    p_request_id,v_number,coalesce(v_seq,0),v_category.code,p_issue_date,
    p_signer_name,p_signer_position,p_signer_nip,auth.uid(),
    coalesce(v_template.html_content,'')
  )
  returning * into v_result;

  update public.letter_requests set status = 'issued', issued_at = now()
  where id = p_request_id;
  insert into public.letter_archives(issued_id,title,reference_number,document_date,year,month,created_by)
  values(
    v_result.id,v_req.subject,v_number,p_issue_date,
    extract(year from p_issue_date)::integer,
    extract(month from p_issue_date)::integer,
    auth.uid()
  );
  insert into public.letter_notifications(user_id,title,body,link,letter_request_id)
  values(
    v_req.requester_id,
    'Surat telah diterbitkan - segera unduh',
    'Nomor surat: '||v_number||'. Segera unduh dan simpan PDF; pengajuan dihapus otomatis 48 jam setelah diterbitkan.',
    '/persuratan/surat-terbit',
    p_request_id
  );
  return v_result;
end;
$$;

create or replace function public.letter_issue_number_with_ktu_fields(
  p_request_id uuid,
  p_letter_number text default null,
  p_issue_date date default current_date,
  p_signer_name text default null,
  p_signer_position text default null,
  p_signer_nip text default null,
  p_ktu_fields jsonb default '{}'::jsonb
)
returns public.letter_issued
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_template public.letter_templates;
  v_field jsonb;
  v_key text;
  v_value text;
  v_form_data jsonb;
  v_result public.letter_issued;
begin
  if not public.letter_has_role(array['kepala_tu','staf_tu','administrator']) then
    raise exception 'Hanya Kepala TU, Staf TU, atau Administrator yang dapat melengkapi data penerbitan';
  end if;
  if p_ktu_fields is null or jsonb_typeof(p_ktu_fields) <> 'object' then
    raise exception 'Data pelengkap Kepala TU tidak valid';
  end if;

  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then raise exception 'Pengajuan harus disetujui sebelum diberi nomor'; end if;
  select * into v_template from public.letter_templates where id = v_req.template_id;
  if not found then raise exception 'Template surat tidak ditemukan'; end if;

  v_form_data := coalesce(v_req.form_data,'{}'::jsonb);
  for v_key in select key from jsonb_each(p_ktu_fields)
  loop
    if jsonb_typeof(p_ktu_fields->v_key) <> 'string' then
      raise exception 'Nilai field % harus berupa teks',v_key;
    end if;
    v_value := p_ktu_fields->>v_key;
    if lower(v_key) not in ('hari_tanggal','tanggal_surat','tempat') then
      raise exception 'Field % tidak dapat dilengkapi pada saat penerbitan',v_key;
    end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_template.fields_schema,'[]'::jsonb)) field
      where lower(field->>'name') = lower(v_key)
        and lower(field->>'name') in ('hari_tanggal','tanggal_surat','tempat')
    ) then
      raise exception 'Field % tidak tersedia pada template surat',v_key;
    end if;
    if nullif(btrim(v_value),'') is null then
      raise exception 'Field % wajib dilengkapi sebelum surat diterbitkan',v_key;
    end if;
    if length(v_value) > 1000 then raise exception 'Nilai field % terlalu panjang',v_key; end if;
    v_form_data := jsonb_set(v_form_data,array[lower(v_key)],to_jsonb(btrim(v_value)),true);
  end loop;

  for v_field in
    select field
    from jsonb_array_elements(coalesce(v_template.fields_schema,'[]'::jsonb)) field
    where lower(field->>'name') in ('hari_tanggal','tanggal_surat','tempat')
  loop
    v_key := lower(v_field->>'name');
    if nullif(btrim(coalesce(v_form_data->>v_key,'')),'') is null then
      raise exception 'Field % wajib dilengkapi sebelum surat diterbitkan',coalesce(v_field->>'label',v_key);
    end if;
  end loop;

  update public.letter_requests set form_data = v_form_data where id = p_request_id;
  select * into v_result
  from public.letter_issue_number(
    p_request_id,p_letter_number,p_issue_date,p_signer_name,p_signer_position,p_signer_nip
  );
  return v_result;
end;
$$;

revoke all on function public.letter_submit_request(uuid) from public, anon;
revoke all on function public.letter_review_request(uuid,text,text) from public, anon;
revoke all on function public.letter_issue_number(uuid,text,date,text,text,text) from public, anon;
revoke all on function public.letter_issue_number_with_ktu_fields(uuid,text,date,text,text,text,jsonb) from public, anon;
grant execute on function public.letter_submit_request(uuid) to authenticated;
grant execute on function public.letter_review_request(uuid,text,text) to authenticated;
grant execute on function public.letter_issue_number(uuid,text,date,text,text,text) to authenticated;
grant execute on function public.letter_issue_number_with_ktu_fields(uuid,text,date,text,text,text,jsonb) to authenticated;
