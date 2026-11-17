
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

        if (
          callerError ||
          !caller ||
          caller.role !== "super_admin" ||
          caller.status !== "active"
        ) {
          return json(
            { error: "Hanya Super Admin aktif yang boleh mengelola pengguna." },
            403,
          );
        }

        const body = await req.json();
        const action = body?.action;

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
