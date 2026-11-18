# Supabase role access

The application checks the active SUPER APP role in the UI, while row-level
security (RLS) and database functions enforce write permissions at the database.
Both layers must be kept in sync.

## Applying role migrations

After confirming the target Supabase project and reviewing the SQL, apply pending
migrations in timestamp order with the Supabase CLI:

```powershell
npx.cmd supabase db push
```

The current module access migrations are:

- `migrations/20261115090000_module_role_access.sql` — access rules for
  finance, inventory, reports, and finance evidence.
- `migrations/20261115100000_module_role_actions.sql` — write restrictions for
  academic records and library catalog, member, circulation, and visit actions.
- `migrations/20261115130000_library_student_services.sql` — librarian
  assignments, student loan and visit records, private digital books, and
  configurable service durations.
- `migrations/20261115140000_library_realtime_requests.sql` — publishes physical
  and digital library requests to Realtime for live approvals and notifications.
- `migrations/20261115150000_sync_teacher_profiles.sql` — links teacher records
  and staff profiles by a unique matching NIP, and synchronizes existing records.
- `migrations/20261115160000_teacher_subject_assignments.sql` — stores teacher
  subject/class assignments, exposes them to the assigned teacher, and validates
  QR sessions against the assigned subject and class.
- `migrations/20261117100000_attendance_qr_session_date.sql` — restores the
  attendance date in QR session creation and stores it on every new session.
- `migrations/20261117110000_attendance_qr_session_token_lifetime.sql` — keeps QR
  tokens valid until their attendance session ends, without requiring the
  creator's page to stay open.
- `migrations/20261117120000_attendance_qr_submit_ambiguity.sql` — resolves
  attendance column names against table columns inside the QR submission
  function.

The application does not apply these database migrations automatically. Confirm
that each referenced table and the `storage` schema exist in the target project
before deploying.

After applying the migration, deploy the user-management function and the
signed-link function:

```powershell
npx.cmd supabase functions deploy manage-users
npx.cmd supabase functions deploy library-digital-book-url
```

## Asisten penulisan BK dengan Gemini

Fitur draf RPL dan pertanyaan AKPD memanggil fungsi `bk-writing-assistant`.
Fungsi hanya menerima topik/bidang/durasi RPL atau tingkat sasaran AKPD; jangan
pernah memasukkan identitas atau catatan pribadi siswa ke prompt AI. Hasilnya
adalah draf yang harus ditinjau sebelum disimpan.

1. Buat API key di Google AI Studio.
2. Simpan key sebagai secret `GEMINI_API_KEY` pada proyek Supabase yang sama
   dengan aplikasi (Project Settings → Edge Functions → Secrets). Jangan
   menyimpannya di source code, `.env` frontend, atau variabel `VITE_*`.
3. Deploy fungsi:

   ```powershell
   npx.cmd supabase functions deploy bk-writing-assistant --project-ref <project-ref>
   ```

Fungsi memverifikasi sesi dan membatasi akses ke Guru BK, Super Admin, serta
Operator aktif. API key hanya dibaca di sisi server.

The function uses the standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` environment values provided by Supabase. Keep the
digital-books bucket private; the function only issues links that expire no
later than the approved access period.

Teacher and staff accounts use the NIP as both username and initial password.
For numeric NIP passwords, the hosted Auth password policy must allow a
minimum length of 6 and must not require letters.
If account creation finds an existing account with the exact NIP-derived Auth
email but no profile, `manage-users` creates the missing profile if any stored
NIP metadata is compatible, without changing that account's password. Apply
the migration and deploy the function for this synchronization to take effect.
Deleting a managed account removes both its Auth user and `profiles` row.
Student and teacher master-data rows are intentionally retained.

To configure subject QR attendance, open Data Induk > Guru, select
“Mapel & Kelas” for each teacher, and add every subject/class pair they teach.
The teacher's QR form then offers only those assignments.

## Action roles

- Finance: Super Admin and Head of TU can manage; the Principal can view.
- Inventory: Super Admin, Operator, and Head of TU can manage; the Principal
  can view.
- Academic records: Super Admin, Operator, and teachers can add or update;
  deletion is limited to Super Admin and Operator. Students can read only
  schedules, class materials, class assignments, announcements, and e-learning
  links.
- Library: Super Admin controls the module and assigns an active teacher as the
  additional Head Librarian without changing the teacher's primary role. The
  Head Librarian manages books, members, circulation, visits, approvals, and
  service settings. Students can request physical loans, request timed access
  to private PDF books, record their own visits, and view only their own
  histories. Initial settings are 7 days for physical loans and 30 minutes for
  digital access.
- Reports and school information: Super Admin and Operator can manage; the
  Principal and Head of TU can view.

The role-based UI is not a substitute for RLS. Changes to database access only
take effect after the migrations are applied to the intended Supabase project.
