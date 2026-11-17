-- Apply this once in Supabase SQL Editor if 001_persuratan.sql was run before
-- the table grants were added. Existing RLS policies remain enabled and unchanged.
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
