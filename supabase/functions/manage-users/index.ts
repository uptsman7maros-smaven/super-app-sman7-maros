
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const allowedRoles = [
  "kepala_sekolah",
  "operator",
  "kepala_tata_usaha",
  "staff_tata_usaha",
  "guru",
  "guru_bk",
  "siswa",
  "tendik",
  "bendahara",
] as const;

const validUsername = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9]{5,30}$/.test(value);

const validName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length >= 2 &&
  value.trim().length <= 150;

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      if (req.method !== "POST") {
        return json({ error: "Metode tidak diizinkan." }, 405);
      }

      try {
        const callerId = ctx.userClaims?.id;

        if (!callerId) {
          return json({ error: "Sesi login tidak valid." }, 401);
        }

        // Gunakan klien admin hanya setelah identitas pemanggil
        // terverifikasi, lalu cek role dan status terbaru di database.
        const admin = ctx.supabaseAdmin;

        const { data: caller, error: callerError } = await admin
          .from("profiles")
          .select("id, role, status")
          .eq("id", callerId)
          .maybeSingle();

        if (callerError || !caller || caller.status !== "active") {
          return json(
            { error: "Akun aktif dengan izin pengelolaan diperlukan." },
            403,
          );
        }

        const body = await req.json();
        const action = body?.action;
        const operatorActions = [
          "delete-master-records",
          "sync-student-status",
          "sync-teacher-account",
        ];
        if (
          caller.role !== "super_admin" &&
          !(caller.role === "operator" && operatorActions.includes(action))
        ) {
          return json(
            { error: "Hanya Super Admin yang boleh mengelola pengguna." },
            403,
          );
        }

        if (action === "delete-master-records") {
          const masterType = body.master_type;
          const ids = body.ids;
          if (
            (masterType !== "students" && masterType !== "teachers") ||
            !Array.isArray(ids) ||
            ids.length < 1 ||
            ids.length > 100 ||
            ids.some((id: unknown) => typeof id !== "string" || !id)
          ) {
            return json({ error: "Pilihan data induk tidak valid." }, 400);
          }

          const uniqueIds = [...new Set(ids as string[])];
          const { data: records, error: recordsError } = await admin
            .from(masterType)
            .select(masterType === "students"
              ? "id, profile_id, nisn, full_name"
              : "id, profile_id, nip, full_name")
            .in("id", uniqueIds);

          if (recordsError) {
            console.error("Data induk gagal dimuat untuk penghapusan:", recordsError);
            return json({ error: "Data induk gagal diperiksa sebelum dihapus." }, 500);
          }

          const recordsById = new Map((records ?? []).map((record) => [record.id, record]));
          const results = [];
          for (const id of uniqueIds) {
            const record = recordsById.get(id);
            if (!record) {
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: false,
                accountDeleted: false,
                accountFound: false,
                error: "Data induk tidak ditemukan.",
              });
              continue;
            }

            const identifier = masterType === "students" ? record.nisn : record.nip;
            let linkedProfile = null;
            let profileLookupError = null;
            if (record.profile_id) {
              const profileResult = await admin
                .from("profiles")
                .select("id, username, role")
                .eq("id", record.profile_id)
                .maybeSingle();
              linkedProfile = profileResult.data;
              profileLookupError = profileResult.error;
            }
            if (!linkedProfile && !profileLookupError && identifier) {
              const profileResult = await admin
                .from("profiles")
                .select("id, username, role")
                .eq("username", identifier)
                .maybeSingle();
              linkedProfile = profileResult.data;
              profileLookupError = profileResult.error;
            }
            if (profileLookupError) {
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: false,
                accountDeleted: false,
                error: "Akun terkait gagal diverifikasi; data tidak dihapus.",
              });
              continue;
            }

            const expectedRole = masterType === "students" ? "siswa" : null;
            const hasMatchingAccount = linkedProfile &&
              (expectedRole ? linkedProfile.role === expectedRole : linkedProfile.role !== "siswa");
            if (linkedProfile?.role === "super_admin") {
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: false,
                accountDeleted: false,
                accountFound: Boolean(linkedProfile),
                error: "Akun Super Admin dilindungi; data tidak dihapus.",
              });
              continue;
            }

            const { error: deleteRecordError } = await admin
              .from(masterType)
              .delete()
              .eq("id", id);
            if (deleteRecordError) {
              console.error("Data induk gagal dihapus:", deleteRecordError);
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: false,
                accountDeleted: false,
                error: "Data induk gagal dihapus karena izin atau relasi data.",
              });
              continue;
            }

            if (!hasMatchingAccount || !linkedProfile) {
              results.push({
                id,
                deleted: true,
                masterRecordDeleted: true,
                accountDeleted: false,
                accountFound: Boolean(linkedProfile),
              });
              continue;
            }

            const { error: authDeleteError } =
              await admin.auth.admin.deleteUser(linkedProfile.id);
            if (authDeleteError && authDeleteError.status !== 404) {
              console.error("Akun terkait gagal dihapus:", authDeleteError);
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: true,
                accountDeleted: false,
                accountFound: true,
                error: "Data induk terhapus, tetapi akun Auth gagal dihapus.",
              });
              continue;
            }
            const { error: profileDeleteError } = await admin
              .from("profiles")
              .delete()
              .eq("id", linkedProfile.id);
            if (profileDeleteError) {
              console.error("Profil akun gagal dibersihkan:", profileDeleteError);
              results.push({
                id,
                deleted: false,
                masterRecordDeleted: true,
                accountDeleted: false,
                accountFound: true,
                error: "Data induk dan Auth terhapus, tetapi profil belum bersih.",
              });
              continue;
            }
            results.push({
              id,
              deleted: true,
              masterRecordDeleted: true,
              accountDeleted: true,
              accountFound: true,
            });
          }

          return json({ results });
        }

        if (action === "sync-student-status") {
          const studentIds = Array.isArray(body.student_ids)
            ? body.student_ids
            : [body.student_id];
          if (
            studentIds.length < 1 ||
            studentIds.length > 100 ||
            studentIds.some((id: unknown) => typeof id !== "string" || !id)
          ) {
            return json({ error: "Pilihan siswa tidak valid." }, 400);
          }
          const results = [];
          for (const studentId of [...new Set(studentIds as string[])]) {
            const { data: student, error: studentError } = await admin
              .from("students")
              .select("id, profile_id, nisn, status")
              .eq("id", studentId)
              .maybeSingle();
            if (studentError || !student) {
              results.push({ id: studentId, synced: false, error: "Data siswa tidak ditemukan." });
              continue;
            }
            let profile = null;
            if (student.profile_id) {
              const result = await admin
                .from("profiles")
                .select("id, role, status")
                .eq("id", student.profile_id)
                .maybeSingle();
              if (result.error) {
                results.push({ id: studentId, synced: false, error: "Akun siswa gagal diperiksa." });
                continue;
              }
              profile = result.data;
            }
            if (!profile && student.nisn) {
              const result = await admin
                .from("profiles")
                .select("id, role, status")
                .eq("username", student.nisn)
                .eq("role", "siswa")
                .maybeSingle();
              if (result.error) {
                results.push({ id: studentId, synced: false, error: "Akun siswa gagal diperiksa." });
                continue;
              }
              profile = result.data;
            }
            if (!profile || profile.role !== "siswa") {
              results.push({ id: studentId, synced: false, message: "Akun siswa belum terhubung." });
              continue;
            }
            const accountStatus = String(student.status).toLowerCase() === "active"
              ? "active"
              : "disabled";
            const { error: profileUpdateError } = await admin
              .from("profiles")
              .update({ status: accountStatus, updated_at: new Date().toISOString() })
              .eq("id", profile.id);
            if (profileUpdateError) {
              console.error("Status profil siswa gagal diperbarui:", profileUpdateError);
              results.push({ id: studentId, synced: false, error: "Status profil siswa gagal diperbarui." });
              continue;
            }
            const { error: authStatusError } = await admin.auth.admin.updateUserById(
              profile.id,
              { ban_duration: accountStatus === "disabled" ? "876000h" : "none" },
            );
            if (authStatusError) {
              console.error("Status login siswa gagal diperbarui:", authStatusError);
              results.push({
                id: studentId,
                synced: false,
                error: "Profil diperbarui, tetapi status login gagal disinkronkan.",
              });
              continue;
            }
            results.push({ id: studentId, synced: true, status: accountStatus });
          }
          return json({ results });
        }

        if (action === "sync-teacher-account") {
          const teacherId = body.teacher_id;
          if (typeof teacherId !== "string" || !teacherId) {
            return json({ error: "ID guru tidak valid." }, 400);
          }
          const { data: teacher, error: teacherError } = await admin
            .from("teachers")
            .select("id, profile_id, nip, full_name, primary_role, employment_status")
            .eq("id", teacherId)
            .maybeSingle();
          if (teacherError || !teacher) {
            return json({ error: "Data guru/tendik tidak ditemukan." }, 404);
          }
          let profile = null;
          if (teacher.profile_id) {
            const result = await admin
              .from("profiles")
              .select("id, username, role")
              .eq("id", teacher.profile_id)
              .maybeSingle();
            if (result.error) return json({ error: "Akun guru gagal diperiksa." }, 500);
            profile = result.data;
          }
          if (!profile && teacher.nip) {
            const result = await admin
              .from("profiles")
              .select("id, username, role")
              .eq("username", teacher.nip)
              .maybeSingle();
            if (result.error) return json({ error: "Akun guru gagal diperiksa." }, 500);
            profile = result.data;
          }
          if (!profile) {
            return json({ synced: false, message: "Akun guru/tendik belum terhubung." });
          }
          if (profile.role === "super_admin" || profile.role === "siswa") {
            return json({ error: "Akun ini tidak dapat ditautkan sebagai guru/tendik." }, 409);
          }
          const normalizedPosition = teacher.primary_role || teacher.employment_status || "";
          const roleByPosition: Record<string, string> = {
            "Kepala Sekolah": "kepala_sekolah",
            "Kepala Tata Usaha": "kepala_tata_usaha",
            "Staff Tata Usaha": "staff_tata_usaha",
            "Bendahara Pengeluaran": "bendahara",
            Bendahara: "bendahara",
            "Operator Sekolah": "operator",
            "Tendik Lainnya": "tendik",
            "Guru BK": "guru_bk",
            "Guru BK / Konselor": "guru_bk",
          };
          const role = roleByPosition[normalizedPosition] || "guru";
          if (!teacher.profile_id) {
            const { error: linkError } = await admin
              .from("teachers")
              .update({ profile_id: profile.id })
              .eq("id", teacher.id);
            if (linkError) return json({ error: "Akun ditemukan tetapi gagal ditautkan ke Data Induk." }, 500);
          }
          const { error: profileUpdateError } = await admin
            .from("profiles")
            .update({
              role,
              full_name: teacher.full_name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);
          if (profileUpdateError) {
            console.error("Peran akun guru gagal diperbarui:", profileUpdateError);
            return json({ error: "Peran akun guru/tendik gagal disinkronkan." }, 500);
          }
          return json({ synced: true, role });
        }

        if (action === "list") {
          const { data, error } = await admin
            .from("profiles")
            .select("id, username, full_name, role, status, created_at")
            .order("created_at", { ascending: false });

          if (error) {
            console.error("Gagal mengambil daftar pengguna:", error);
            return json({ error: "Daftar pengguna gagal dimuat." }, 500);
          }

          return json({ users: data ?? [] });
        }

        if (action === "create") {
          const username = body.username;
          const fullName = body.full_name;
          const role = body.role;
          const password = body.password;

          if (!validUsername(username)) {
            return json(
              { error: "NIP harus berupa 5–30 angka." },
              400,
            );
          }

          if (!validName(fullName)) {
            return json({ error: "Nama lengkap tidak valid." }, 400);
          }

          if (!allowedRoles.includes(role)) {
            return json({ error: "Role pengguna tidak diizinkan." }, 400);
          }

          if (
            typeof password !== "string" ||
            password.length < 6 ||
            password.length > 128
          ) {
            return json(
              { error: "Password awal harus 6–128 karakter." },
              400,
            );
          }

          const { data: existingProfile, error: existingProfileError } = await admin
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();

          if (existingProfileError) {
            console.error("Pemeriksaan NIP gagal:", existingProfileError);
            return json({ error: "NIP tidak dapat diperiksa saat ini." }, 500);
          }
          if (existingProfile) {
            return json({ error: "NIP sudah digunakan oleh akun lain." }, 409);
          }

          const email = `nip-${username}@accounts.example.com`;

          const { data: created, error: createError } =
            await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: {
                username,
                full_name: fullName.trim(),
              },
            });

          if (createError || !created.user) {
            console.error("Pembuatan akun Auth gagal:", createError);
            const authMessage = createError?.message.toLowerCase() ?? "";
            if (
              authMessage.includes("already") ||
              authMessage.includes("duplicate")
            ) {
              const perPage = 1000;
              let page = 1;
              let existingAuthUser = null;

              while (!existingAuthUser) {
                const { data: usersPage, error: usersError } =
                  await admin.auth.admin.listUsers({ page, perPage });

                if (usersError) {
                  console.error("Pemeriksaan akun Auth lama gagal:", usersError);
                  return json(
                    { error: "Akun Auth lama tidak dapat diperiksa saat ini." },
                    500,
                  );
                }

                existingAuthUser = usersPage.users.find(
                  (user) => user.email?.toLowerCase() === email.toLowerCase(),
                ) ?? null;

                if (
                  existingAuthUser ||
                  usersPage.users.length < perPage
                ) {
                  break;
                }

                page += 1;
              }

              if (!existingAuthUser) {
                return json(
                  { error: "NIP sudah digunakan oleh akun autentikasi lain." },
                  409,
                );
              }

              const authUsername = existingAuthUser.user_metadata?.username;
              if (
                authUsername !== undefined &&
                authUsername !== null &&
                authUsername !== username
              ) {
                return json(
                  {
                    error:
                      "Email akun Auth untuk NIP ini ditemukan, tetapi identitasnya tidak cocok. Profil tidak ditautkan demi keamanan.",
                  },
                  409,
                );
              }

              const { data: existingAuthProfile, error: authProfileError } =
                await admin
                  .from("profiles")
                  .select("id, username")
                  .eq("id", existingAuthUser.id)
                  .maybeSingle();

              if (authProfileError) {
                console.error(
                  "Pemeriksaan profil akun Auth lama gagal:",
                  authProfileError,
                );
                return json(
                  { error: "Profil akun Auth lama tidak dapat diperiksa." },
                  500,
                );
              }

              if (existingAuthProfile) {
                return json(
                  {
                    error:
                      existingAuthProfile.username === username
                        ? "Akun dengan NIP ini sudah terdaftar."
                        : "Akun Auth ini sudah terhubung ke profil dengan NIP berbeda.",
                  },
                  409,
                );
              }

              const { error: recoveredProfileError } = await admin
                .from("profiles")
                .insert({
                  id: existingAuthUser.id,
                  username,
                  full_name: fullName.trim(),
                  role,
                  status: "active",
                  updated_at: new Date().toISOString(),
                });

              if (recoveredProfileError) {
                console.error(
                  "Sinkronisasi profil akun Auth lama gagal:",
                  recoveredProfileError,
                );
                return json(
                  {
                    error:
                      "Akun Auth ditemukan, tetapi profilnya gagal disinkronkan.",
                  },
                  500,
                );
              }

              return json(
                {
                  message:
                    "Akun Auth yang sudah ada berhasil disinkronkan. Kata sandi tidak diubah.",
                  user: {
                    id: existingAuthUser.id,
                    username,
                    full_name: fullName.trim(),
                    role,
                    status: "active",
                  },
                },
                200,
              );
            }
            if (
              authMessage.includes("password") &&
              (authMessage.includes("weak") ||
                authMessage.includes("requirement") ||
                authMessage.includes("character") ||
                authMessage.includes("length"))
            ) {
              return json(
                {
                  error:
                    "Password ditolak oleh kebijakan Auth. Pastikan minimum 6 karakter dan kebijakan kompleksitas tidak mewajibkan huruf.",
                },
                400,
              );
            }
            return json(
              { error: "Akun Auth gagal dibuat. Periksa log Edge Function." },
              400,
            );
          }

          const { error: profileError } = await admin
            .from("profiles")
            .upsert(
              {
                id: created.user.id,
                username,
                full_name: fullName.trim(),
                role,
                status: "active",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );

          if (profileError) {
            console.error("Pembuatan profil gagal:", profileError);

            // Bersihkan akun Auth jika profil tidak berhasil disimpan.
            const { error: rollbackError } =
              await admin.auth.admin.deleteUser(created.user.id);

            if (rollbackError) {
              console.error("Pembersihan akun gagal:", rollbackError);
            }

            return json(
              { error: "Profil gagal disimpan. Periksa skema database." },
              500,
            );
          }

          return json(
            {
              message: "Akun pengguna berhasil dibuat.",
              user: {
                id: created.user.id,
                username,
                full_name: fullName.trim(),
                role,
                status: "active",
              },
            },
            201,
          );
        }


        if (action === "update") {
          const userId = body.user_id;
          const username = body.username;
          const fullName = body.full_name;
          const role = body.role;
          const status = body.status;

          if (typeof userId !== "string" || !userId) {
            return json({ error: "ID pengguna tidak valid." }, 400);
          }

          const { data: target, error: targetError } = await admin
            .from("profiles")
            .select("id, username, full_name, role, status")
            .eq("id", userId)
            .maybeSingle();

          if (targetError || !target) {
            return json({ error: "Pengguna tidak ditemukan." }, 404);
          }

          if (
            target.id === callerId ||
            target.role === "super_admin"
          ) {
            return json(
              { error: "Akun Super Admin tidak dapat diubah melalui fitur ini." },
              403,
            );
          }

          const changes: Record<string, unknown> = {};

          if (username !== undefined) {
            if (!validUsername(username)) {
              return json({ error: "NIP harus berupa 5–30 angka." }, 400);
            }

            const { data: duplicate, error: duplicateError } = await admin
              .from("profiles")
              .select("id")
              .eq("username", username)
              .neq("id", userId)
              .maybeSingle();

            if (duplicateError) {
              return json(
                { error: "Gagal memeriksa NIP pengguna." },
                500,
              );
            }

            if (duplicate) {
              return json({ error: "NIP sudah digunakan." }, 409);
            }

            changes.username = username;
          }

          if (fullName !== undefined) {
            if (!validName(fullName)) {
              return json({ error: "Nama lengkap tidak valid." }, 400);
            }
            changes.full_name = fullName.trim();
          }

          if (role !== undefined) {
            if (
              typeof role !== "string" ||
              !(allowedRoles as readonly string[]).includes(role)
            ) {
              return json({ error: "Role pengguna tidak diizinkan." }, 400);
            }
            changes.role = role;
          }

          if (status !== undefined) {
            if (status !== "active" && status !== "disabled") {
              return json({ error: "Status pengguna tidak valid." }, 400);
            }
            changes.status = status;
          }

          if (Object.keys(changes).length === 0) {
            return json({ error: "Tidak ada perubahan yang dikirim." }, 400);
          }

          changes.updated_at = new Date().toISOString();

          // Sinkronkan email Auth bila NIP diubah.
          if (typeof changes.username === "string") {
            const newEmail = `nip-${changes.username}@accounts.example.com`;

            const { error: authError } = await admin.auth.admin.updateUserById(
              userId,
              {
                email: newEmail,
                user_metadata: {
                  username: changes.username,
                  full_name:
                    typeof changes.full_name === "string"
                      ? changes.full_name
                      : target.full_name,
                },
              },
            );

            if (authError) {
              console.error("Pembaruan akun Auth gagal:", authError);
              return json(
                { error: "NIP gagal diperbarui pada akun autentikasi." },
                400,
              );
            }
          }

          const { error: updateError } = await admin
            .from("profiles")
            .update(changes)
            .eq("id", userId);

          if (updateError) {
            console.error("Pembaruan profil gagal:", updateError);
            return json(
              { error: "Profil gagal diperbarui. Periksa role dan skema database." },
              500,
            );
          }

          // Nonaktifkan atau aktifkan sesi login akun target.
          if (status !== undefined && status !== target.status) {
            const { error: authStatusError } =
              await admin.auth.admin.updateUserById(userId, {
                ban_duration: status === "disabled" ? "876000h" : "none",
              });

            if (authStatusError) {
              console.error(
                "Pembaruan status autentikasi gagal:",
                authStatusError,
              );
              return json(
                {
                  error:
                    "Profil tersimpan, tetapi status login gagal diperbarui. Periksa log Edge Function.",
                },
                500,
              );
            }
          }

          return json({ message: "Data pengguna berhasil diperbarui." });
        }
        
        if (action === "delete") {
          const userId = body.user_id;

          if (typeof userId !== "string" || !userId) {
            return json({ error: "ID pengguna tidak valid." }, 400);
          }

          const { data: target, error: targetError } = await admin
            .from("profiles")
            .select("id, role")
            .eq("id", userId)
            .maybeSingle();

          if (targetError || !target) {
            return json({ error: "Pengguna tidak ditemukan." }, 404);
          }

          if (target.id === callerId || target.role === "super_admin") {
            return json(
              { error: "Akun Super Admin tidak dapat dihapus melalui fitur ini." },
              403,
            );
          }

          const { error: deleteError } =
            await admin.auth.admin.deleteUser(userId);

          if (deleteError && deleteError.status !== 404) {
            console.error("Penghapusan akun gagal:", deleteError);
            return json(
              { error: "Akun gagal dihapus. Periksa relasi profil dan autentikasi." },
              500,
            );
          }

          const { error: profileDeleteError } = await admin
            .from("profiles")
            .delete()
            .eq("id", userId);

          if (profileDeleteError) {
            console.error(
              "Akun Auth sudah dihapus, tetapi profil gagal dibersihkan:",
              profileDeleteError,
            );
            return json(
              {
                error:
                  "Akun Auth sudah dihapus, tetapi profil pengguna masih tertinggal. Periksa relasi database dan coba hapus kembali.",
              },
              500,
            );
          }

          return json({
            message:
              "Akun Auth dan profil pengguna berhasil dihapus. Data induk tetap dipertahankan.",
          });
        }
        return json({ error: "Aksi tidak dikenal." }, 400);
      } catch (error) {
        console.error("manage-users gagal:", error);
        return json({ error: "Permintaan tidak dapat diproses." }, 400);
      }
    },
  ),
};
