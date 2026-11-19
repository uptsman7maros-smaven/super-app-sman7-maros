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
  v_tpl public.letter_templates;
  v_field jsonb;
  v_key text;
  v_value text;
  v_form_data jsonb;
  v_result public.letter_issued;
begin
  if not public.letter_has_role(array['kepala_tu','administrator']) then
    raise exception 'Hanya Kepala TU/administrator yang dapat melengkapi data penerbitan';
  end if;
  if p_ktu_fields is null or jsonb_typeof(p_ktu_fields) <> 'object' then
    raise exception 'Data pelengkap Kepala TU tidak valid';
  end if;

  select * into v_req
  from public.letter_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if v_req.status <> 'approved' then raise exception 'Pengajuan harus disetujui sebelum diberi nomor'; end if;

  select * into v_tpl from public.letter_templates where id = v_req.template_id;
  if not found then raise exception 'Template surat tidak ditemukan'; end if;

  v_form_data := coalesce(v_req.form_data, '{}'::jsonb);
  for v_key in
    select key from jsonb_each(p_ktu_fields)
  loop
    if jsonb_typeof(p_ktu_fields->v_key) <> 'string' then
      raise exception 'Nilai field % harus berupa teks', v_key;
    end if;
    v_value := p_ktu_fields->>v_key;
    if lower(v_key) not in ('hari_tanggal','tanggal_surat','tempat') then
      raise exception 'Field % tidak dapat dilengkapi pada saat penerbitan', v_key;
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_tpl.fields_schema, '[]'::jsonb)) as field
      where lower(field->>'name') = lower(v_key)
        and lower(field->>'name') in ('hari_tanggal','tanggal_surat','tempat')
    ) then
      raise exception 'Field % tidak tersedia pada template surat', v_key;
    end if;
    if nullif(btrim(v_value), '') is null then
      raise exception 'Field % wajib dilengkapi sebelum surat diterbitkan', v_key;
    end if;
    if length(v_value) > 1000 then
      raise exception 'Nilai field % terlalu panjang', v_key;
    end if;
    v_form_data := jsonb_set(v_form_data, array[lower(v_key)], to_jsonb(btrim(v_value)), true);
  end loop;

  for v_field in
    select field
    from jsonb_array_elements(coalesce(v_tpl.fields_schema, '[]'::jsonb)) as field
    where lower(field->>'name') in ('hari_tanggal','tanggal_surat','tempat')
  loop
    v_key := lower(v_field->>'name');
    if nullif(btrim(coalesce(v_form_data->>v_key, '')), '') is null then
      raise exception 'Field % wajib dilengkapi sebelum surat diterbitkan', coalesce(v_field->>'label', v_key);
    end if;
  end loop;

  update public.letter_requests
  set form_data = v_form_data
  where id = p_request_id;

  select * into v_result
  from public.letter_issue_number(
    p_request_id,
    p_letter_number,
    p_issue_date,
    p_signer_name,
    p_signer_position,
    p_signer_nip
  );
  return v_result;
end;
$$;

revoke all on function public.letter_issue_number_with_ktu_fields(uuid, text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.letter_issue_number_with_ktu_fields(uuid, text, date, text, text, text, jsonb) to authenticated;
