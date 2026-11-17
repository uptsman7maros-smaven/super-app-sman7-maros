create or replace function public.library_create_loan(
  p_book_id text,
  p_member_id text,
  p_loan_code text,
  p_borrowed_at date,
  p_due_at date,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_book public.library_books%rowtype;
  v_member public.library_members%rowtype;
begin
  if auth.uid() is null or not public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]) then
    raise exception 'Akses perpustakaan tidak diizinkan.';
  end if;

  if p_book_id is null or p_member_id is null
    or p_loan_code is null or p_borrowed_at is null or p_due_at is null
    or p_due_at < p_borrowed_at then
    raise exception 'Data peminjaman tidak valid.';
  end if;

  select b.*
  into v_book
  from public.library_books b
  where b.id::text = p_book_id
  for update;

  if not found then
    raise exception 'Buku tidak ditemukan.';
  end if;

  if v_book.stock_available < 1 then
    raise exception 'Stok buku tidak tersedia.';
  end if;

  select m.*
  into v_member
  from public.library_members m
  where m.id::text = p_member_id
    and m.active
  for share;

  if not found then
    raise exception 'Anggota tidak ditemukan atau tidak aktif.';
  end if;

  insert into public.library_loans(
    loan_code, book_id, member_id, borrowed_at, due_at, note, created_by
  )
  values (
    p_loan_code, v_book.id, v_member.id, p_borrowed_at, p_due_at, p_note, auth.uid()
  );

  update public.library_books
  set stock_available = stock_available - 1
  where id = v_book.id;

  return true;
end;
$function$;

create or replace function public.library_return_loan(
  p_loan_id text,
  p_returned_at date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_loan public.library_loans%rowtype;
  v_book public.library_books%rowtype;
begin
  if auth.uid() is null or not public.has_active_role(ARRAY[
    'super_admin'::public.app_role,
    'kepala_sekolah'::public.app_role,
    'operator'::public.app_role,
    'guru'::public.app_role
  ]) then
    raise exception 'Akses perpustakaan tidak diizinkan.';
  end if;

  if p_loan_id is null or p_returned_at is null then
    raise exception 'Data pengembalian tidak valid.';
  end if;

  select l.*
  into v_loan
  from public.library_loans l
  where l.id::text = p_loan_id
  for update;

  if not found then
    raise exception 'Transaksi peminjaman tidak ditemukan.';
  end if;

  if v_loan.returned_at is not null then
    raise exception 'Transaksi ini sudah dikembalikan.';
  end if;

  select b.*
  into v_book
  from public.library_books b
  where b.id = v_loan.book_id
  for update;

  if not found then
    raise exception 'Data buku untuk transaksi ini tidak ditemukan.';
  end if;

  update public.library_loans
  set returned_at = p_returned_at,
      status = 'returned'
  where id = v_loan.id;

  update public.library_books
  set stock_available = least(stock_total, stock_available + 1)
  where id = v_book.id;

  return true;
end;
$function$;

revoke all on function public.library_create_loan(text, text, text, date, date, text) from public, anon, authenticated;
revoke all on function public.library_return_loan(text, date) from public, anon, authenticated;
grant execute on function public.library_create_loan(text, text, text, date, date, text) to authenticated;
grant execute on function public.library_return_loan(text, date) to authenticated;
