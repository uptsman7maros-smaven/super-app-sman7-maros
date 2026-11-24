-- Persist selected Kepala Sekolah TTE signature slots through a role-checked RPC.
-- Direct letter_requests UPDATE policies remain unchanged.

alter table public.letter_requests
  add column if not exists tte_kepsek_slots jsonb not null default '[]'::jsonb;

alter table public.letter_issued
  add column if not exists tte_html_snapshot text;

create or replace function public.letter_update_tte_kepsek_slots(
  p_request_id uuid,
  p_slots jsonb
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
  if v_role is null or v_role not in ('kepala_tu','administrator') then
    raise exception 'Hanya Kepala TU atau Administrator yang dapat mengatur kode TTE Kepala Sekolah';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Daftar slot kode TTE tidak valid';
  end if;
  if jsonb_array_length(p_slots) > 11 then
    raise exception 'Maksimal 11 slot dapat diberi kode TTE';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_slots) slot(value)
    where jsonb_typeof(slot.value) <> 'number'
      or slot.value::text !~ '^[1-9][0-9]{0,3}$'
      or (slot.value::text ~ '^[1-9][0-9]{0,3}$' and (slot.value::text)::integer > 1000)
  ) then
    raise exception 'Nomor slot kode TTE tidak valid';
  end if;
  if (
    select count(*) <> count(distinct slot.value::integer)
    from jsonb_array_elements(p_slots) slot(value)
  ) then
    raise exception 'Daftar slot kode TTE tidak boleh berulang';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_req.form_data->'request_tte_kepsek' is distinct from 'true'::jsonb then
    raise exception 'Pengajuan ini tidak meminta TTE Kepala Sekolah';
  end if;
  if v_req.status not in ('submitted','in_review','resubmitted','approved','awaiting_number','issued') then
    raise exception 'Status pengajuan tidak dapat diubah kode TTE-nya';
  end if;

  update public.letter_requests
  set tte_kepsek_slots = p_slots,
      updated_at = now()
  where id = p_request_id
  returning * into v_req;

  return v_req;
end;
$$;

revoke all on function public.letter_update_tte_kepsek_slots(uuid,jsonb) from public, anon;
grant execute on function public.letter_update_tte_kepsek_slots(uuid,jsonb) to authenticated;

create or replace function public.letter_issue_number_with_ktu_fields_and_tte(
  p_request_id uuid,
  p_letter_number text,
  p_issue_date date,
  p_signer_name text,
  p_signer_position text,
  p_signer_nip text,
  p_ktu_fields jsonb,
  p_tte_html_snapshot text
)
returns public.letter_issued
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.letter_requests;
  v_issued public.letter_issued;
  v_role text := public.letter_current_role();
begin
  if v_role is null or v_role not in ('kepala_tu','administrator') then
    raise exception 'Hanya Kepala TU atau Administrator yang dapat menerbitkan surat dengan snapshot TTE';
  end if;
  if p_tte_html_snapshot is null
    or nullif(btrim(p_tte_html_snapshot),'') is null
    or length(p_tte_html_snapshot) > 2000000 then
    raise exception 'Snapshot HTML TTE tidak valid';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_req.form_data->'request_tte_kepsek' is distinct from 'true'::jsonb then
    raise exception 'Pengajuan ini tidak meminta TTE Kepala Sekolah';
  end if;

  select * into v_issued
  from public.letter_issue_number_with_ktu_fields(
    p_request_id,
    p_letter_number,
    p_issue_date,
    p_signer_name,
    p_signer_position,
    p_signer_nip,
    p_ktu_fields
  );

  update public.letter_issued
  set tte_html_snapshot = p_tte_html_snapshot
  where id = v_issued.id
  returning * into v_issued;

  return v_issued;
end;
$$;

revoke all on function public.letter_issue_number_with_ktu_fields_and_tte(uuid,text,date,text,text,text,jsonb,text) from public, anon;
grant execute on function public.letter_issue_number_with_ktu_fields_and_tte(uuid,text,date,text,text,text,jsonb,text) to authenticated;
