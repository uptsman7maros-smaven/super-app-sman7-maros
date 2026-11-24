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

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_role = 'kepala_sekolah' and not exists (
    select 1 from public.letter_templates template
    where template.id = v_req.template_id and template.requires_principal_approval
  ) then
    raise exception 'Surat ini tidak memerlukan persetujuan Kepala Sekolah';
  end if;
  if v_role = 'kepala_sekolah' and v_req.status <> 'approved' then
    raise exception 'Persetujuan Kepala Sekolah dilakukan setelah persetujuan Kepala TU';
  end if;
  if v_role = 'staf_tu' and v_req.requester_id = auth.uid() then
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

revoke all on function public.letter_review_request(uuid, text, text) from public, anon;
grant execute on function public.letter_review_request(uuid, text, text) to authenticated;
