alter table public.letter_templates
  add column if not exists requires_number boolean not null default true;

alter table public.letter_requests
  add column if not exists approved_at timestamptz,
  add column if not exists downloaded_at timestamptz;

update public.letter_requests
set approved_at = coalesce(reviewed_at, updated_at, created_at)
where status = 'approved'
  and approved_at is null;

create index if not exists idx_letter_requests_expiry
  on public.letter_requests(status, issued_at, approved_at, updated_at)
  where status in ('issued','approved');

alter table public.letter_notifications
  add column if not exists letter_request_id uuid
  references public.letter_requests(id) on delete cascade;

create index if not exists idx_letter_notifications_request
  on public.letter_notifications(letter_request_id)
  where letter_request_id is not null;

update public.letter_notifications notification
set letter_request_id = request.id
from public.letter_requests request
left join public.letter_issued issued on issued.request_id = request.id
where notification.letter_request_id is null
  and notification.user_id = request.requester_id
  and (
    notification.link = '/persuratan/pengajuan/' || request.id::text
    or (
      issued.letter_number is not null
      and notification.title = 'Surat telah diterbitkan'
      and notification.body = 'Nomor surat: ' || issued.letter_number
    )
  );

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
  select candidates.full_name, candidates.nip, candidates.employment_status
  from (
    select candidate.full_name, candidate.nip, candidate.employment_status,
      min(candidate.source_priority) as source_priority
    from (
      select teacher.full_name, teacher.nip, teacher.employment_status, 0 as source_priority
      from public.teachers teacher
      where teacher.employment_status ilike '%kepala%'
        or teacher.employment_status ilike '%pejabat%'
        or teacher.employment_status ilike '%bendahara%'
      union all
      select signer.name, signer.nip, signer.position, 1
      from public.letter_signatories signer
      where signer.is_active
        and (signer.position ilike '%kepala%' or signer.position ilike '%pejabat%')
        and (signer.active_from is null or signer.active_from <= current_date)
        and (signer.active_until is null or signer.active_until >= current_date)
      union all
      select settings.principal_name, settings.principal_nip, 'Kepala Sekolah'::text, 2
      from public.school_settings settings
      where nullif(btrim(settings.principal_name), '') is not null
    ) candidate
    where nullif(btrim(candidate.full_name), '') is not null
    group by candidate.full_name, candidate.nip, candidate.employment_status
  ) candidates
  order by candidates.source_priority, candidates.employment_status, candidates.full_name;
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

  insert into public.letter_notifications(
    user_id, title, body, link, letter_request_id
  )
  select profile.id,
    'Pengajuan surat baru',
    'Ada pengajuan surat yang perlu diperiksa.',
    '/persuratan/persetujuan',
    p_request_id
  from public.profiles profile
  where profile.status = 'active'
    and profile.role::text in ('super_admin','kepala_tata_usaha');

  return v_req;
end;
$$;

revoke all on function public.letter_submit_request(uuid) from public, anon;
grant execute on function public.letter_submit_request(uuid) to authenticated;

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
  v_template public.letter_templates;
  v_role text := public.letter_current_role();
  v_final_approval boolean;
begin
  if v_role is null or v_role not in ('kepala_tu','kepala_sekolah','administrator') then
    raise exception 'Tidak memiliki kewenangan memproses surat';
  end if;
  if p_decision not in ('approved','revision','rejected') then
    raise exception 'Keputusan tidak valid';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;

  select * into v_template
  from public.letter_templates
  where id = v_req.template_id;
  if not found then
    raise exception 'Format surat tidak ditemukan';
  end if;
  if v_role = 'kepala_sekolah' and not v_template.requires_principal_approval then
    raise exception 'Surat ini tidak memerlukan persetujuan Kepala Sekolah';
  end if;
  if v_role = 'kepala_sekolah' and v_req.status <> 'approved' then
    raise exception 'Persetujuan Kepala Sekolah dilakukan setelah persetujuan Kepala TU';
  end if;
  if v_role = 'kepala_tu' and v_req.requester_id = auth.uid() then
    raise exception 'Pemohon tidak dapat memproses pengajuannya sendiri';
  end if;
  if v_req.status not in ('submitted','in_review','resubmitted','approved','awaiting_number') then
    raise exception 'Status pengajuan tidak dapat diproses';
  end if;

  insert into public.letter_approvals(request_id, approver_id, approver_role, decision, note)
  values(p_request_id, auth.uid(), v_role, p_decision, p_note);

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

  v_final_approval := p_decision = 'approved'
    and not v_template.requires_number
    and (
      not v_template.requires_principal_approval
      or exists (
        select 1
        from public.letter_approvals approval
        where approval.request_id = p_request_id
          and approval.approver_role = 'kepala_sekolah'
          and approval.decision = 'approved'
      )
    );

  insert into public.letter_notifications(
    user_id, title, body, link, letter_request_id
  )
  values (
    v_req.requester_id,
    case when v_final_approval then 'Surat disetujui - segera unduh' else
      case p_decision
        when 'approved' then 'Pengajuan disetujui'
        when 'revision' then 'Pengajuan perlu revisi'
        else 'Pengajuan ditolak'
      end
    end,
    case when v_final_approval
      then 'Surat telah disetujui final. Segera unduh dan simpan PDF; pengajuan dihapus otomatis 48 jam setelah persetujuan final.'
      else coalesce(p_note, 'Status pengajuan surat Anda telah diperbarui.')
    end,
    '/persuratan/pengajuan/' || p_request_id::text,
    p_request_id
  );

  if v_role = 'kepala_tu'
    and p_decision = 'approved'
    and v_template.requires_principal_approval
  then
    insert into public.letter_notifications(user_id, title, body, link, letter_request_id)
    select profile.id,
      'Persetujuan Kepala Sekolah diperlukan',
      'Ada pengajuan surat yang menunggu persetujuan Kepala Sekolah.',
      '/persuratan/persetujuan',
      p_request_id
    from public.profiles profile
    where profile.status = 'active'
      and profile.role::text = 'kepala_sekolah';
  end if;

  return v_req;
end;
$$;

revoke all on function public.letter_review_request(uuid, text, text) from public, anon;
grant execute on function public.letter_review_request(uuid, text, text) to authenticated;

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
  if not public.letter_has_role(array['kepala_tu','administrator']) then
    raise exception 'Hanya Kepala TU/administrator yang dapat menerbitkan nomor';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then
    raise exception 'Pengajuan harus disetujui sebelum diberi nomor';
  end if;

  select * into v_template
  from public.letter_templates
  where id = v_req.template_id;
  if not found then raise exception 'Template surat tidak ditemukan'; end if;
  if not v_template.requires_number then
    raise exception 'Template ini tidak memerlukan penerbitan nomor surat';
  end if;
  if v_template.requires_principal_approval and not exists (
    select 1
    from public.letter_approvals approval
    where approval.request_id = p_request_id
      and approval.approver_role = 'kepala_sekolah'
      and approval.decision = 'approved'
  ) then
    raise exception 'Surat ini memerlukan persetujuan Kepala Sekolah sebelum diterbitkan';
  end if;

  select * into v_category
  from public.letter_categories
  where id = v_template.category_id;
  if v_category.id is null then raise exception 'Kategori surat belum diatur'; end if;

  v_number := nullif(btrim(p_letter_number), '');
  if v_number is null then
    v_year := extract(year from p_issue_date)::integer;
    insert into public.letter_number_sequences(category_id, year, last_number)
    values (v_category.id, v_year, 0)
    on conflict(category_id, year) do nothing;
    update public.letter_number_sequences
    set last_number = last_number + 1
    where category_id = v_category.id and year = v_year
    returning last_number into v_seq;

    select number_pattern into v_pattern
    from public.letter_school_settings
    where id = 1;
    v_month := (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_issue_date)::integer];
    v_number := replace(replace(replace(replace(replace(v_pattern,
      '{seq}', lpad(v_seq::text, 3, '0')),
      '{code}', v_category.code),
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
    p_request_id, v_number, coalesce(v_seq, 0), v_category.code, p_issue_date,
    p_signer_name, p_signer_position, p_signer_nip, auth.uid(),
    coalesce(v_template.html_content, '')
  )
  returning * into v_result;

  update public.letter_requests
  set status = 'issued', issued_at = now()
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

  insert into public.letter_notifications(
    user_id, title, body, link, letter_request_id
  )
  values (
    v_req.requester_id,
    'Surat telah diterbitkan - segera unduh',
    'Nomor surat: ' || v_number || '. Segera unduh dan simpan PDF; pengajuan dihapus otomatis 48 jam setelah diterbitkan.',
    '/persuratan/surat-terbit',
    p_request_id
  );
  return v_result;
end;
$$;

revoke all on function public.letter_issue_number(uuid, text, date, text, text, text) from public, anon;
grant execute on function public.letter_issue_number(uuid, text, date, text, text, text) to authenticated;

create or replace function public.letter_mark_request_downloaded(p_request_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_requires_number boolean;
  v_requires_principal boolean;
  v_downloaded_at timestamptz;
begin
  select request.status, template.requires_number, template.requires_principal_approval
  into v_status, v_requires_number, v_requires_principal
  from public.letter_requests request
  join public.letter_templates template on template.id = request.template_id
  where request.id = p_request_id
    and request.requester_id = auth.uid()
  for update of request;

  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_status <> 'issued'
    and not (
      v_status = 'approved'
      and not v_requires_number
      and (
        not v_requires_principal
        or exists (
          select 1
          from public.letter_approvals approval
          where approval.request_id = p_request_id
            and approval.approver_role = 'kepala_sekolah'
            and approval.decision = 'approved'
        )
      )
    )
  then
    raise exception 'Surat belum diterbitkan atau disetujui final';
  end if;

  update public.letter_requests
  set downloaded_at = coalesce(downloaded_at, now())
  where id = p_request_id
  returning downloaded_at into v_downloaded_at;
  return v_downloaded_at;
end;
$$;

revoke all on function public.letter_mark_request_downloaded(uuid) from public, anon;
grant execute on function public.letter_mark_request_downloaded(uuid) to authenticated;

create or replace function public.cleanup_expired_letter_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_ids uuid[];
  v_deleted_count integer;
begin
  select array_agg(request.id)
  into v_expired_ids
  from public.letter_requests request
  join public.letter_templates template on template.id = request.template_id
  where (
    request.status = 'issued'
    or (
      request.status = 'approved'
      and not template.requires_number
      and (
        not template.requires_principal_approval
        or exists (
          select 1
          from public.letter_approvals approval
          where approval.request_id = request.id
            and approval.approver_role = 'kepala_sekolah'
            and approval.decision = 'approved'
        )
      )
    )
  )
    and coalesce(request.issued_at, request.approved_at, request.updated_at, request.created_at)
      <= now() - interval '48 hours';

  if coalesce(cardinality(v_expired_ids), 0) = 0 then
    return 0;
  end if;

  delete from public.letter_notifications notification
  where notification.letter_request_id = any(v_expired_ids)
    or exists (
      select 1
      from public.letter_requests request
      left join public.letter_issued issued on issued.request_id = request.id
      where request.id = any(v_expired_ids)
        and notification.user_id = request.requester_id
        and (
          notification.link = '/persuratan/pengajuan/' || request.id::text
          or (
            issued.letter_number is not null
            and notification.title = 'Surat telah diterbitkan'
            and notification.body = 'Nomor surat: ' || issued.letter_number
          )
        )
    );

  delete from public.letter_archives archive
  using public.letter_issued issued
  where archive.issued_id = issued.id
    and issued.request_id = any(v_expired_ids);

  delete from public.letter_issued issued
  where issued.request_id = any(v_expired_ids);

  delete from public.letter_requests request
  where request.id = any(v_expired_ids);
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_letter_requests() from public, anon;
grant execute on function public.cleanup_expired_letter_requests() to authenticated;

do $$
declare
  v_cron_schema text;
begin
  select schema_row.nspname
  into v_cron_schema
  from pg_catalog.pg_extension extension_row
  join pg_catalog.pg_depend dependency
    on dependency.refclassid = 'pg_catalog.pg_extension'::regclass
    and dependency.refobjid = extension_row.oid
    and dependency.classid = 'pg_catalog.pg_class'::regclass
    and dependency.deptype = 'e'
  join pg_catalog.pg_class cron_relation on cron_relation.oid = dependency.objid
  join pg_catalog.pg_namespace schema_row on schema_row.oid = cron_relation.relnamespace
  where extension_row.extname = 'pg_cron'
    and cron_relation.relname = 'job'
  limit 1;

  if v_cron_schema is null then
    return;
  end if;

  execute format('select %I.schedule($1, $2, $3)', v_cron_schema)
  using
    'cleanup-expired-letter-requests',
    '0 * * * *',
    'select public.cleanup_expired_letter_requests();';
end;
$$;
