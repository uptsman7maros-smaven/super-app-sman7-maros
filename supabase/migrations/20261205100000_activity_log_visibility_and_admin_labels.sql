drop policy if exists app_activity_logs_actor_insert on public.app_activity_logs;
create policy app_activity_logs_actor_insert on public.app_activity_logs
  for insert to authenticated
  with check (actor_id = auth.uid());

drop policy if exists app_activity_logs_authenticated_read on public.app_activity_logs;
create policy app_activity_logs_authenticated_read on public.app_activity_logs
  for select to authenticated
  using (auth.uid() is not null);

update public.app_activity_logs activity
set actor_label = 'Administrator'
where lower(btrim(coalesce(activity.actor_label, ''))) like '%fdhlbilaal13@gmail.com%'
  or lower(btrim(coalesce(activity.actor_label, ''))) in ('super_admin', 'super admin')
  or exists (
    select 1
    from public.profiles profile
    where profile.id = activity.actor_id
      and profile.role::text = 'super_admin'
  );
