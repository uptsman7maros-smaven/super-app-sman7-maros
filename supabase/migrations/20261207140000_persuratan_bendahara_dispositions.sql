create or replace function public.letter_current_role()
returns text
language sql
stable
security definer
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
    when 'bendahara' then 'bendahara'
    else null
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

revoke all on function public.letter_current_role() from public, anon;
grant execute on function public.letter_current_role() to authenticated;

drop policy if exists letter_incoming_headteacher_read on public.letter_incoming;
create policy letter_incoming_headteacher_read on public.letter_incoming
for select to authenticated
using (public.letter_has_role(array['kepala_sekolah']));

drop policy if exists letter_dispositions_read on public.letter_dispositions;
create policy letter_dispositions_read on public.letter_dispositions
for select to authenticated
using (
  public.letter_current_role() is not null
  and (
    assigned_to = auth.uid()
    or public.letter_has_role(array['administrator','operator','kepala_tu','staf_tu','kepala_sekolah'])
  )
);

drop policy if exists letter_dispositions_write on public.letter_dispositions;
drop policy if exists letter_dispositions_insert on public.letter_dispositions;
create policy letter_dispositions_insert on public.letter_dispositions
for insert to authenticated
with check (public.letter_has_role(array['administrator','operator','kepala_tu','kepala_sekolah']));

drop policy if exists letter_dispositions_manager_update on public.letter_dispositions;
create policy letter_dispositions_manager_update on public.letter_dispositions
for update to authenticated
using (public.letter_has_role(array['administrator','operator','kepala_tu','kepala_sekolah']))
with check (public.letter_has_role(array['administrator','operator','kepala_tu','kepala_sekolah']));

drop policy if exists letter_dispositions_assignee_update on public.letter_dispositions;
create policy letter_dispositions_assignee_update on public.letter_dispositions
for update to authenticated
using (assigned_to = auth.uid() and public.letter_has_role(array['staf_tu']))
with check (assigned_to = auth.uid() and public.letter_has_role(array['staf_tu']));

create or replace function public.letter_disposition_assignees()
returns table(user_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(teacher.full_name), ''),
      profile.username
    )::text
  from public.profiles profile
  left join lateral (
    select teacher.full_name
    from public.teachers teacher
    where teacher.profile_id = profile.id
    order by teacher.id
    limit 1
  ) teacher on true
  where profile.status = 'active'
    and profile.role::text = 'staff_tata_usaha'
    and public.letter_current_role() in ('administrator','operator','kepala_tu','kepala_sekolah')
  order by 2;
$$;

revoke all on function public.letter_disposition_assignees() from public, anon;
grant execute on function public.letter_disposition_assignees() to authenticated;

create or replace function public.letter_create_disposition(
  p_incoming_id uuid,
  p_assigned_to uuid,
  p_instruction text,
  p_due_date date default null
)
returns public.letter_dispositions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.letter_current_role();
  v_disposition public.letter_dispositions;
begin
  if v_role is null or v_role not in ('administrator','operator','kepala_tu','kepala_sekolah') then
    raise exception 'Tidak memiliki kewenangan mengirim disposisi';
  end if;
  if nullif(btrim(p_instruction), '') is null then
    raise exception 'Instruksi disposisi wajib diisi';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_assigned_to
      and profile.status = 'active'
      and profile.role::text = 'staff_tata_usaha'
  ) then
    raise exception 'Penerima harus merupakan akun Staf Tata Usaha aktif';
  end if;
  perform 1
  from public.letter_incoming incoming
  where incoming.id = p_incoming_id
  for update;
  if not found then
    raise exception 'Surat masuk tidak ditemukan';
  end if;

  insert into public.letter_dispositions(
    incoming_id, assigned_to, instruction, due_date, created_by
  )
  values (
    p_incoming_id, p_assigned_to, btrim(p_instruction), p_due_date, auth.uid()
  )
  returning * into v_disposition;

  update public.letter_incoming
  set follow_up_status = 'pending'
  where id = p_incoming_id;

  return v_disposition;
end;
$$;

revoke all on function public.letter_create_disposition(uuid,uuid,text,date) from public, anon;
grant execute on function public.letter_create_disposition(uuid,uuid,text,date) to authenticated;

create or replace function public.letter_update_disposition(
  p_disposition_id uuid,
  p_status text,
  p_follow_up_note text default null
)
returns public.letter_dispositions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.letter_current_role();
  v_disposition public.letter_dispositions;
begin
  if v_role is null then
    raise exception 'Sesi Persuratan tidak aktif';
  end if;
  if p_status is null or p_status not in ('assigned','in_progress','completed') then
    raise exception 'Status disposisi tidak valid';
  end if;
  if p_status = 'completed' and nullif(btrim(p_follow_up_note), '') is null then
    raise exception 'Catatan tindak lanjut wajib diisi untuk menyelesaikan disposisi';
  end if;

  select * into v_disposition
  from public.letter_dispositions
  where id = p_disposition_id
  for update;
  if not found then
    raise exception 'Disposisi tidak ditemukan';
  end if;
  if v_role not in ('administrator','operator','kepala_tu','kepala_sekolah')
    and not (v_role = 'staf_tu' and v_disposition.assigned_to = auth.uid()) then
    raise exception 'Tidak memiliki kewenangan memperbarui disposisi ini';
  end if;

  update public.letter_dispositions
  set status = p_status,
      follow_up_note = nullif(btrim(p_follow_up_note), ''),
      completed_at = case
        when p_status = 'completed' then coalesce(v_disposition.completed_at, now())
        else null
      end
  where id = p_disposition_id
  returning * into v_disposition;

  update public.letter_incoming incoming
  set follow_up_status = case
    when exists (
      select 1 from public.letter_dispositions disposition
      where disposition.incoming_id = v_disposition.incoming_id
        and disposition.status = 'in_progress'
    ) then 'in_progress'
    when exists (
      select 1 from public.letter_dispositions disposition
      where disposition.incoming_id = v_disposition.incoming_id
        and disposition.status = 'assigned'
    ) then 'pending'
    else 'completed'
  end
  where incoming.id = v_disposition.incoming_id;

  return v_disposition;
end;
$$;

revoke all on function public.letter_update_disposition(uuid,text,text) from public, anon;
grant execute on function public.letter_update_disposition(uuid,text,text) to authenticated;
