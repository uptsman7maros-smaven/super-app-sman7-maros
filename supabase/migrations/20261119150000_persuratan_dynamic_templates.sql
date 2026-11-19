-- Dynamic Persuratan templates, identity lookup, and server-side role guards.
-- Apply after 001_persuratan.sql and 003_superapp_role_access.sql.

create or replace function public.letter_requester_identity()
returns table(full_name text, nip text, position text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(nullif(btrim(t.full_name), ''), nullif(btrim(p.full_name), ''), p.username),
    coalesce(nullif(btrim(t.nip), ''), p.username),
    coalesce(
      nullif(btrim(t.employment_status), ''),
      case p.role::text
        when 'super_admin' then 'Administrator Super App'
        when 'operator' then 'Operator Persuratan'
        when 'kepala_tata_usaha' then 'Kepala Tata Usaha'
        when 'staff_tata_usaha' then 'Staf Tata Usaha'
        when 'kepala_sekolah' then 'Kepala Sekolah'
        when 'guru' then 'Guru'
        when 'guru_bk' then 'Guru Bimbingan dan Konseling'
        when 'tendik' then 'Tenaga Kependidikan'
        else null
      end
    )
  from public.profiles p
  left join lateral (
    select teacher.full_name, teacher.nip, teacher.employment_status
    from public.teachers teacher
    where teacher.profile_id = p.id
      or (
        teacher.profile_id is null
        and btrim(coalesce(teacher.nip, '')) = btrim(coalesce(p.username, ''))
      )
    order by (teacher.profile_id = p.id) desc
    limit 1
  ) t on true
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role::text <> 'siswa'
  limit 1;
$$;

revoke all on function public.letter_requester_identity() from public, anon;
grant execute on function public.letter_requester_identity() to authenticated;

create or replace function public.letter_get_signatories()
returns table(full_name text, nip text, employment_status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.letter_current_role() is null then
    raise exception 'Tidak memiliki kewenangan melihat daftar penandatangan';
  end if;

  return query
  select distinct candidates.full_name, candidates.nip, candidates.employment_status
  from (
    select
      teacher.full_name,
      teacher.nip,
      teacher.employment_status
    from public.teachers teacher
    where teacher.employment_status ilike '%kepala%'
      or teacher.employment_status ilike '%pejabat%'
    union
    select signer.name, signer.nip, signer.position
    from public.letter_signatories signer
    where signer.is_active
      and (signer.position ilike '%kepala%' or signer.position ilike '%pejabat%')
      and (signer.active_from is null or signer.active_from <= current_date)
      and (signer.active_until is null or signer.active_until >= current_date)
    union
    select settings.principal_name, settings.principal_nip, 'Kepala Sekolah'::text
    from public.school_settings settings
    where nullif(btrim(settings.principal_name), '') is not null
  ) candidates
  where nullif(btrim(candidates.full_name), '') is not null
  order by candidates.employment_status, candidates.full_name;
end;
$$;

revoke all on function public.letter_get_signatories() from public, anon;
grant execute on function public.letter_get_signatories() to authenticated;

create or replace function public.letter_submit_request(p_request_id uuid)
returns public.letter_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_role text := public.letter_current_role();
begin
  if v_role is null or v_role = 'pemohon' then
    raise exception 'Akun siswa tidak dapat mengajukan surat';
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

  update public.letter_requests
  set status = case when v_req.status = 'revision' then 'resubmitted' else 'submitted' end,
      submitted_at = now()
  where id = p_request_id
  returning * into v_req;

  insert into public.letter_notifications(user_id,title,body,link)
  select profile.id,
    'Pengajuan surat baru',
    'Ada pengajuan surat yang perlu diperiksa.',
    '/persuratan/persetujuan'
  from public.profiles profile
  where profile.status = 'active'
    and profile.role::text in ('super_admin','kepala_tata_usaha');

  return v_req;
end;
$$;

revoke all on function public.letter_submit_request(uuid) from public, anon;
grant execute on function public.letter_submit_request(uuid) to authenticated;

drop policy if exists letter_requests_insert on public.letter_requests;
create policy letter_requests_insert on public.letter_requests
for insert to authenticated
with check (
  requester_id = auth.uid()
  and public.letter_current_role() is not null
  and public.letter_current_role() <> 'pemohon'
);

drop policy if exists letter_templates_admin on public.letter_templates;
drop policy if exists letter_templates_manage on public.letter_templates;
drop policy if exists letter_templates_read on public.letter_templates;
create policy letter_templates_read on public.letter_templates
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    is_active
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
    or exists (
      select 1
      from public.letter_requests request
      where request.template_id = letter_templates.id
        and request.requester_id = auth.uid()
    )
  )
);
create policy letter_templates_manage on public.letter_templates
for all to authenticated
using (public.letter_has_role(array['administrator','operator']))
with check (public.letter_has_role(array['administrator','operator']));

drop function if exists public.letter_issue_number(uuid, date, text, text, text);
create function public.letter_issue_number(
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
  v_tpl public.letter_templates;
  v_cat public.letter_categories;
  v_seq integer;
  v_year integer;
  v_month text;
  v_pattern text;
  v_number text;
  v_result public.letter_issued;
begin
  if not public.letter_has_role(array['kepala_tu','administrator']) then
    raise exception 'Hanya Kepala TU/administrator yang dapat menerbitkan nomor';
  end if;

  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then raise exception 'Pengajuan harus disetujui sebelum diberi nomor'; end if;

  select * into v_tpl from public.letter_templates where id = v_req.template_id;
  if v_tpl.requires_principal_approval and not exists (
    select 1 from public.letter_approvals approval
    where approval.request_id = p_request_id
      and approval.approver_role = 'kepala_sekolah'
      and approval.decision = 'approved'
  ) then
    raise exception 'Surat ini memerlukan persetujuan Kepala Sekolah sebelum diterbitkan';
  end if;

  select * into v_cat from public.letter_categories where id = v_tpl.category_id;
  if v_cat.id is null then raise exception 'Kategori surat belum diatur'; end if;

  v_number := nullif(btrim(p_letter_number), '');
  if v_number is null then
    v_year := extract(year from p_issue_date)::integer;
    insert into public.letter_number_sequences(category_id, year, last_number)
    values (v_cat.id, v_year, 0)
    on conflict (category_id, year) do nothing;
    update public.letter_number_sequences
    set last_number = last_number + 1
    where category_id = v_cat.id and year = v_year
    returning last_number into v_seq;

    select number_pattern into v_pattern from public.letter_school_settings where id = 1;
    v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_issue_date)::integer];
    v_number := replace(replace(replace(replace(replace(v_pattern,
      '{seq}', lpad(v_seq::text, 3, '0')),
      '{code}', v_cat.code),
      '{month_roman}', v_month),
      '{year}', v_year::text),
      '{school}', 'SMAN.7-MRS');
  end if;
  if length(v_number) > 160 then raise exception 'Nomor surat terlalu panjang'; end if;

  insert into public.letter_issued(
    request_id, letter_number, sequence_number, category_code, issue_date,
    signer_name, signer_position, signer_nip, issued_by, html_snapshot
  )
  values (
    p_request_id, v_number, coalesce(v_seq, 0), v_cat.code, p_issue_date,
    p_signer_name, p_signer_position, p_signer_nip, auth.uid(),
    coalesce(v_tpl.html_content, '')
  )
  returning * into v_result;

  update public.letter_requests set status = 'issued', issued_at = now()
  where id = p_request_id;
  insert into public.letter_archives(
    issued_id, title, reference_number, document_date, year, month, created_by
  )
  values (
    v_result.id, v_req.subject, v_number, p_issue_date,
    extract(year from p_issue_date)::integer,
    extract(month from p_issue_date)::integer,
    auth.uid()
  );
  insert into public.letter_notifications(user_id, title, body, link)
  values (
    v_req.requester_id,
    'Surat telah diterbitkan',
    'Nomor surat: ' || v_number,
    '/persuratan/surat-terbit'
  );
  return v_result;
end;
$$;

revoke all on function public.letter_issue_number(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.letter_issue_number(uuid, text, date, text, text, text) to authenticated;

insert into public.letter_templates(
  category_id, name, description, subject, html_content, fields_schema,
  requires_principal_approval, is_active
)
select
  category.id,
  'Surat Undangan (Contoh Format SMAN 7 Maros)',
  'Contoh surat undangan sekolah dengan identitas pengaju dan detail kegiatan dinamis.',
  'Undangan {perihal}',
  '<p style="text-align:right">Maros, {tanggal_terbit}</p>
   <p>Nomor: {nomor_surat}<br>Lampiran: {lampiran}<br>Hal: {perihal}</p>
   <p>Kepada Yth.<br>{tujuan}<br>di Tempat</p>
   <p>Dengan hormat,</p>
   <p>Dengan ini kami mengundang Bapak/Ibu/Saudara untuk menghadiri kegiatan {agenda} yang akan dilaksanakan pada:</p>
   <table><tbody><tr><th>Hari / Tanggal</th><td>{hari_tanggal}</td></tr>
   <tr><th>Waktu</th><td>{jam}</td></tr><tr><th>Tempat</th><td>{tempat}</td></tr></tbody></table>
   <p>Demikian undangan ini kami sampaikan. Atas perhatian dan kehadirannya kami ucapkan terima kasih.</p>
   <p style="text-align:right">Kepala Sekolah,<br><br><br><strong>{penandatangan}</strong><br>NIP. {nip_penandatangan}</p>
   <p>Tembusan:<br>1. Arsip</p>
   <p class="requester-identity">Pengaju: {nama} · NIP: {NIP} · {jabatan}</p>',
  '[
    {"name":"nama","label":"Nama Pengaju","type":"auto_user","required":true},
    {"name":"NIP","label":"NIP Pengaju","type":"auto_user","required":false},
    {"name":"jabatan","label":"Jabatan Pengaju","type":"auto_user","required":true},
    {"name":"nomor_surat","label":"Nomor Surat","type":"kepala_tu_only","required":false},
    {"name":"tanggal_terbit","label":"Tanggal Terbit","type":"kepala_tu_only","required":false},
    {"name":"penandatangan","label":"Penandatangan","type":"kepala_tu_only","required":false},
    {"name":"nip_penandatangan","label":"NIP Penandatangan","type":"kepala_tu_only","required":false},
    {"name":"lampiran","label":"Lampiran","type":"text","required":false},
    {"name":"perihal","label":"Perihal","type":"text","required":true},
    {"name":"tujuan","label":"Kepada Yth.","type":"textarea","required":true},
    {"name":"hari_tanggal","label":"Hari / Tanggal","type":"text","required":true},
    {"name":"jam","label":"Jam","type":"time","required":true},
    {"name":"tempat","label":"Tempat","type":"text","required":true},
    {"name":"agenda","label":"Agenda","type":"textarea","required":true}
  ]'::jsonb,
  false,
  true
from public.letter_categories category
where category.code = 'UND'
  and not exists (
    select 1 from public.letter_templates template
    where template.name = 'Surat Undangan (Contoh Format SMAN 7 Maros)'
  );
