-- Use SUPER APP profiles as the single source of truth for Persuratan roles.
-- Safe to re-run after 001_persuratan.sql; RLS stays enabled.

alter table public.letter_user_roles
  drop constraint if exists letter_user_roles_role_check;
alter table public.letter_user_roles
  add constraint letter_user_roles_role_check
  check (role in ('administrator','operator','guru_staf','pemohon','staf_tu','kepala_tu','kepala_sekolah'));

alter table public.letter_approvals
  drop constraint if exists letter_approvals_approver_role_check;
alter table public.letter_approvals
  add constraint letter_approvals_approver_role_check
  check (approver_role in ('administrator','kepala_tu','kepala_sekolah'));

create or replace function public.letter_current_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case p.role::text
    when 'super_admin' then 'administrator'
    when 'operator' then 'operator'
    when 'kepala_tata_usaha' then 'kepala_tu'
    when 'staff_tata_usaha' then 'staf_tu'
    when 'kepala_sekolah' then 'kepala_sekolah'
    when 'guru' then 'guru_staf'
    when 'guru_bk' then 'guru_staf'
    when 'tendik' then 'guru_staf'
    when 'siswa' then 'pemohon'
    else null
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

create or replace function public.letter_has_role(_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.letter_current_role() = any(_roles), false);
$$;

revoke all on function public.letter_current_role() from public, anon;
revoke all on function public.letter_has_role(text[]) from public, anon;
grant execute on function public.letter_current_role() to authenticated;
grant execute on function public.letter_has_role(text[]) to authenticated;

-- Retire the duplicate role table. Role changes now take effect directly from profiles.
drop policy if exists letter_roles_read_self_or_admin on public.letter_user_roles;
drop policy if exists letter_roles_admin_all on public.letter_user_roles;
revoke all on table public.letter_user_roles from anon, authenticated;

create or replace function public.letter_review_request(
  p_request_id uuid, p_decision text, p_note text default null
) returns public.letter_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_role text := public.letter_current_role();
begin
  if v_role is null or v_role not in ('kepala_tu','kepala_sekolah','administrator') then
    raise exception 'Tidak memiliki kewenangan memproses surat';
  end if;
  if p_decision not in ('approved','revision','rejected') then
    raise exception 'Keputusan tidak valid';
  end if;
  select * into v_req from public.letter_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_role = 'kepala_sekolah' and not exists (
    select 1 from public.letter_templates t
    where t.id = v_req.template_id and t.requires_principal_approval = true
  ) then raise exception 'Surat ini tidak memerlukan persetujuan Kepala Sekolah'; end if;
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
      reviewed_at = now()
  where id = p_request_id
  returning * into v_req;
  insert into public.letter_notifications(user_id,title,body,link)
  values(
    v_req.requester_id,
    case p_decision
      when 'approved' then 'Pengajuan disetujui'
      when 'revision' then 'Pengajuan perlu revisi'
      else 'Pengajuan ditolak'
    end,
    coalesce(p_note,'Status pengajuan surat Anda telah diperbarui.'),
    '/persuratan/pengajuan/'||p_request_id::text
  );
  if v_role = 'kepala_tu' and p_decision = 'approved' and exists (
    select 1 from public.letter_templates t
    where t.id = v_req.template_id and t.requires_principal_approval = true
  ) then
    insert into public.letter_notifications(user_id,title,body,link)
    select p.id,
      'Persetujuan Kepala Sekolah diperlukan',
      'Ada pengajuan surat yang menunggu persetujuan Kepala Sekolah.',
      '/persuratan/persetujuan'
    from public.profiles p
    where p.status = 'active' and p.role = 'kepala_sekolah';
  end if;
  return v_req;
end;
$$;

create or replace function public.letter_submit_request(p_request_id uuid)
returns public.letter_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
begin
  if public.letter_current_role() is null then
    raise exception 'Akun tidak aktif atau tidak memiliki akses Persuratan';
  end if;
  select * into v_req from public.letter_requests where id = p_request_id for update;
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
  select p.id,
    'Pengajuan surat baru',
    'Ada pengajuan surat yang perlu diperiksa.',
    '/persuratan/persetujuan'
  from public.profiles p
  where p.status = 'active'
    and p.role in ('super_admin','kepala_tata_usaha');
  return v_req;
end;
$$;

revoke all on function public.letter_review_request(uuid,text,text) from public, anon;
revoke all on function public.letter_submit_request(uuid) from public, anon;
revoke all on function public.letter_issue_number(uuid,date,text,text,text) from public, anon;
grant execute on function public.letter_review_request(uuid,text,text) to authenticated;
grant execute on function public.letter_submit_request(uuid) to authenticated;
grant execute on function public.letter_issue_number(uuid,date,text,text,text) to authenticated;

drop policy if exists letter_categories_read on public.letter_categories;
create policy letter_categories_read on public.letter_categories for select to authenticated
using (
  public.letter_current_role() is not null
  and (is_active or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah']))
);

drop policy if exists letter_templates_read on public.letter_templates;
create policy letter_templates_read on public.letter_templates for select to authenticated
using (
  public.letter_current_role() is not null
  and (is_active or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah']))
);

drop policy if exists letter_requests_select on public.letter_requests;
create policy letter_requests_select on public.letter_requests for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    requester_id = auth.uid()
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

drop policy if exists letter_requests_insert on public.letter_requests;
create policy letter_requests_insert on public.letter_requests for insert to authenticated
with check (
  requester_id = auth.uid()
  and public.letter_current_role() is not null
);

drop policy if exists letter_requests_update_owner on public.letter_requests;
create policy letter_requests_update_owner on public.letter_requests for update to authenticated
using (
  requester_id = auth.uid()
  and public.letter_current_role() is not null
  and status in ('draft','revision')
)
with check (
  requester_id = auth.uid()
  and public.letter_current_role() is not null
  and status in ('draft','revision')
);

drop policy if exists letter_requests_admin_update on public.letter_requests;
create policy letter_requests_admin_update on public.letter_requests for update to authenticated
using (public.letter_has_role(array['administrator','kepala_tu']))
with check (public.letter_has_role(array['administrator','kepala_tu']));

drop policy if exists letter_revisions_read on public.letter_request_revisions;
create policy letter_revisions_read on public.letter_request_revisions for select to authenticated
using (
  public.letter_current_role() is not null
  and exists (
    select 1 from public.letter_requests r
    where r.id = request_id
      and (
        r.requester_id = auth.uid()
        or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
      )
  )
);

drop policy if exists letter_revisions_insert on public.letter_request_revisions;
create policy letter_revisions_insert on public.letter_request_revisions for insert to authenticated
with check (
  editor_id = auth.uid()
  and public.letter_current_role() is not null
  and exists (
    select 1 from public.letter_requests r
    where r.id = request_id
      and (
        r.requester_id = auth.uid()
        or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu'])
      )
  )
);

drop policy if exists letter_approvals_read on public.letter_approvals;
create policy letter_approvals_read on public.letter_approvals for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
    or exists (
      select 1 from public.letter_requests r
      where r.id = request_id and r.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_issued_read on public.letter_issued;
create policy letter_issued_read on public.letter_issued for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
    or exists (
      select 1 from public.letter_requests r
      where r.id = request_id and r.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_archive_read on public.letter_archives;
create policy letter_archive_read on public.letter_archives for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu'])
    or exists (
      select 1 from public.letter_issued i
      join public.letter_requests r on r.id = i.request_id
      where i.id = issued_id and r.requester_id = auth.uid()
    )
  )
);

drop policy if exists letter_incoming_admin_tu on public.letter_incoming;
create policy letter_incoming_admin_tu on public.letter_incoming for all to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']))
with check (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_outgoing_read on public.letter_outgoing;
create policy letter_outgoing_read on public.letter_outgoing for select to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_outgoing_write on public.letter_outgoing;
create policy letter_outgoing_write on public.letter_outgoing for insert to authenticated
with check (public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu']));

drop policy if exists letter_dispositions_read on public.letter_dispositions;
create policy letter_dispositions_read on public.letter_dispositions for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    assigned_to = auth.uid()
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

drop policy if exists letter_dispositions_write on public.letter_dispositions;
create policy letter_dispositions_write on public.letter_dispositions for all to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','kepala_sekolah']))
with check (public.letter_has_role(array['administrator','operator','kepala_tu','kepala_sekolah']));

drop policy if exists letter_dispositions_assignee_update on public.letter_dispositions;
create policy letter_dispositions_assignee_update on public.letter_dispositions for update to authenticated
using (assigned_to = auth.uid() and public.letter_has_role(array['staf_tu']))
with check (assigned_to = auth.uid() and public.letter_has_role(array['staf_tu']));

drop policy if exists letter_signatories_read on public.letter_signatories;
create policy letter_signatories_read on public.letter_signatories for select to authenticated
using (public.letter_current_role() is not null);

drop policy if exists letter_settings_read on public.letter_school_settings;
create policy letter_settings_read on public.letter_school_settings for select to authenticated
using (public.letter_current_role() is not null);

drop policy if exists letter_notifications_own on public.letter_notifications;
create policy letter_notifications_own on public.letter_notifications for select to authenticated
using (user_id = auth.uid() and public.letter_current_role() is not null);

drop policy if exists letter_notifications_update_own on public.letter_notifications;
create policy letter_notifications_update_own on public.letter_notifications for update to authenticated
using (user_id = auth.uid() and public.letter_current_role() is not null)
with check (user_id = auth.uid() and public.letter_current_role() is not null);

drop policy if exists letter_logs_admin_read on public.letter_activity_logs;
create policy letter_logs_admin_read on public.letter_activity_logs for select to authenticated
using (public.letter_has_role(array['administrator']));

drop policy if exists letter_storage_read on storage.objects;
create policy letter_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'letter-files'
  and public.letter_current_role() is not null
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

drop policy if exists letter_storage_insert on storage.objects;
create policy letter_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'letter-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.letter_current_role() is not null
);

drop policy if exists letter_storage_update on storage.objects;
create policy letter_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'letter-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.letter_current_role() is not null
)
with check (
  bucket_id = 'letter-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.letter_current_role() is not null
);

drop policy if exists letter_storage_delete on storage.objects;
create policy letter_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'letter-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.letter_current_role() is not null
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
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
