-- eOSIS V3 - Update fitur lanjutan
-- Jalankan SETELAH 01_management_migration.sql berhasil.
-- Tidak menghapus tabel/fungsi lama. Fungsi baru memakai nama yang berbeda bila signature lama tidak boleh diubah.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- 1. KOLOM SISWA
-- =========================================================
ALTER TABLE public.siswa
  ADD COLUMN IF NOT EXISTS nama TEXT,
  ADD COLUMN IF NOT EXISTS jenis_kelamin TEXT,
  ADD COLUMN IF NOT EXISTS waktu_memilih TIMESTAMPTZ;

-- =========================================================
-- 2. KOLOM PENGATURAN SEKOLAH / PERIODE / PENANDATANGAN
-- =========================================================
ALTER TABLE public.pengaturan
  ADD COLUMN IF NOT EXISTS masa_bakti_mulai DATE,
  ADD COLUMN IF NOT EXISTS masa_bakti_selesai DATE,
  ADD COLUMN IF NOT EXISTS ditetapkan_di TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tanggal_ditetapkan DATE,
  ADD COLUMN IF NOT EXISTS pembina_osis_nama TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pembina_osis_nip TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ketua_panitia_nama TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ketua_panitia_nisn TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS kepala_sekolah_nama TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS kepala_sekolah_nip TEXT DEFAULT '';

UPDATE public.pengaturan
SET
  ditetapkan_di = COALESCE(ditetapkan_di, ''),
  pembina_osis_nama = COALESCE(pembina_osis_nama, ''),
  pembina_osis_nip = COALESCE(pembina_osis_nip, ''),
  ketua_panitia_nama = COALESCE(ketua_panitia_nama, ''),
  ketua_panitia_nisn = COALESCE(ketua_panitia_nisn, ''),
  kepala_sekolah_nama = COALESCE(kepala_sekolah_nama, ''),
  kepala_sekolah_nip = COALESCE(kepala_sekolah_nip, '');

-- =========================================================
-- 3. PENGATURAN PUBLIK V3
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_build_object(
        'nama_sekolah', nama_sekolah,
        'logo_url', logo_url,
        'pemilihan_aktif', COALESCE(pemilihan_aktif, TRUE),
        'kop_nama_sekolah', kop_nama_sekolah,
        'kop_subjudul', kop_subjudul,
        'kop_alamat', kop_alamat,
        'kop_kontak', kop_kontak,
        'masa_bakti_mulai', masa_bakti_mulai,
        'masa_bakti_selesai', masa_bakti_selesai,
        'ditetapkan_di', ditetapkan_di,
        'tanggal_ditetapkan', tanggal_ditetapkan,
        'pembina_osis_nama', pembina_osis_nama,
        'pembina_osis_nip', pembina_osis_nip,
        'ketua_panitia_nama', ketua_panitia_nama,
        'ketua_panitia_nisn', ketua_panitia_nisn,
        'kepala_sekolah_nama', kepala_sekolah_nama,
        'kepala_sekolah_nip', kepala_sekolah_nip
      )
      FROM public.pengaturan
      ORDER BY id
      LIMIT 1
    ),
    json_build_object(
      'nama_sekolah','SMAN 7 MAROS',
      'logo_url',NULL,
      'pemilihan_aktif',TRUE,
      'kop_nama_sekolah','SMAN 7 MAROS',
      'kop_subjudul','PEMILIHAN KETUA DAN WAKIL KETUA OSIS',
      'kop_alamat','',
      'kop_kontak','',
      'masa_bakti_mulai',NULL,
      'masa_bakti_selesai',NULL,
      'ditetapkan_di','',
      'tanggal_ditetapkan',NULL,
      'pembina_osis_nama','',
      'pembina_osis_nip','',
      'ketua_panitia_nama','',
      'ketua_panitia_nisn','',
      'kepala_sekolah_nama','',
      'kepala_sekolah_nip',''
    )
  );
END;
$$;

-- =========================================================
-- 4. SIMPAN SETTING SEKOLAH V3
-- =========================================================
CREATE OR REPLACE FUNCTION public.save_school_settings_v3(
  p_username TEXT,
  p_password TEXT,
  p_nama_sekolah TEXT,
  p_logo_url TEXT,
  p_kop_nama_sekolah TEXT,
  p_kop_subjudul TEXT,
  p_kop_alamat TEXT,
  p_kop_kontak TEXT,
  p_masa_bakti_mulai DATE,
  p_masa_bakti_selesai DATE,
  p_ditetapkan_di TEXT,
  p_tanggal_ditetapkan DATE,
  p_pembina_osis_nama TEXT,
  p_pembina_osis_nip TEXT,
  p_ketua_panitia_nama TEXT,
  p_ketua_panitia_nisn TEXT,
  p_kepala_sekolah_nama TEXT,
  p_kepala_sekolah_nip TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  IF p_masa_bakti_mulai IS NOT NULL AND p_masa_bakti_selesai IS NOT NULL
     AND p_masa_bakti_selesai < p_masa_bakti_mulai THEN
    RAISE EXCEPTION 'Tanggal akhir masa bakti tidak boleh sebelum tanggal mulai.';
  END IF;

  UPDATE public.pengaturan
  SET nama_sekolah = COALESCE(NULLIF(TRIM(p_nama_sekolah), ''), 'SMAN 7 MAROS'),
      logo_url = NULLIF(p_logo_url, ''),
      kop_nama_sekolah = COALESCE(NULLIF(TRIM(p_kop_nama_sekolah), ''), COALESCE(NULLIF(TRIM(p_nama_sekolah), ''), 'SMAN 7 MAROS')),
      kop_subjudul = COALESCE(NULLIF(TRIM(p_kop_subjudul), ''), 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS'),
      kop_alamat = COALESCE(p_kop_alamat, ''),
      kop_kontak = COALESCE(p_kop_kontak, ''),
      masa_bakti_mulai = p_masa_bakti_mulai,
      masa_bakti_selesai = p_masa_bakti_selesai,
      ditetapkan_di = COALESCE(p_ditetapkan_di, ''),
      tanggal_ditetapkan = p_tanggal_ditetapkan,
      pembina_osis_nama = COALESCE(p_pembina_osis_nama, ''),
      pembina_osis_nip = COALESCE(p_pembina_osis_nip, ''),
      ketua_panitia_nama = COALESCE(p_ketua_panitia_nama, ''),
      ketua_panitia_nisn = COALESCE(p_ketua_panitia_nisn, ''),
      kepala_sekolah_nama = COALESCE(p_kepala_sekolah_nama, ''),
      kepala_sekolah_nip = COALESCE(p_kepala_sekolah_nip, '')
  WHERE id = (SELECT id FROM public.pengaturan ORDER BY id LIMIT 1);

  RETURN TRUE;
END;
$$;

-- =========================================================
-- 5. GANTI USERNAME/PASSWORD ADMIN
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_admin_credentials_v3(
  p_username TEXT,
  p_password TEXT,
  p_new_username TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin lama salah';
  END IF;

  IF NULLIF(TRIM(p_new_username), '') IS NULL OR LENGTH(p_new_username) < 3 THEN
    RAISE EXCEPTION 'Username baru minimal 3 karakter.';
  END IF;

  IF p_new_password IS NULL OR LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password baru minimal 6 karakter.';
  END IF;

  UPDATE public.pengaturan
  SET admin_username = TRIM(p_new_username),
      admin_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = (SELECT id FROM public.pengaturan ORDER BY id LIMIT 1);

  RETURN TRUE;
END;
$$;

-- =========================================================
-- 6. DAFTAR KELAS + HAPUS KELAS
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_classes_v3(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(x ORDER BY x.nama_kelas), '[]'::json)
    FROM (
      SELECT k.id, k.nama_kelas, COUNT(s.id)::INTEGER AS total_siswa
      FROM public.kelas k
      LEFT JOIN public.siswa s ON s.kelas_id = k.id
      GROUP BY k.id, k.nama_kelas
    ) x
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_class_v3(
  p_username TEXT,
  p_password TEXT,
  p_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.siswa WHERE kelas_id = p_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Kelas tidak dapat dihapus karena masih memiliki % siswa. Pindahkan siswa terlebih dahulu.', v_count;
  END IF;

  DELETE FROM public.kelas WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelas tidak ditemukan.';
  END IF;

  RETURN TRUE;
END;
$$;

-- =========================================================
-- 7. IMPORT SISWA V3
-- Format JSON:
-- nisn, nama, kelas, tgl_lahir, jenis_kelamin
-- Status hak suara dan waktu memilih otomatis berasal dari database.
-- =========================================================
CREATE OR REPLACE FUNCTION public.import_students(
  p_username TEXT,
  p_password TEXT,
  p_rows JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r JSONB;
  v_nisn TEXT;
  v_nama TEXT;
  v_kelas TEXT;
  v_jk TEXT;
  v_tgl DATE;
  v_kelas_id BIGINT;
  v_count INTEGER := 0;
  v_created INTEGER := 0;
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_nisn := NULLIF(TRIM(r->>'nisn'), '');
    v_nama := NULLIF(TRIM(r->>'nama'), '');
    v_kelas := NULLIF(TRIM(r->>'kelas'), '');
    v_jk := NULLIF(TRIM(r->>'jenis_kelamin'), '');
    v_tgl := NULLIF(r->>'tgl_lahir', '')::DATE;

    IF v_nisn IS NULL OR v_nama IS NULL OR v_kelas IS NULL OR v_tgl IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.kelas(nama_kelas)
    VALUES (v_kelas)
    ON CONFLICT (nama_kelas) DO NOTHING;

    SELECT id INTO v_kelas_id
    FROM public.kelas
    WHERE nama_kelas = v_kelas
    LIMIT 1;

    UPDATE public.siswa
    SET nama = v_nama,
        tgl_lahir = v_tgl,
        kelas_id = v_kelas_id,
        jenis_kelamin = v_jk
    WHERE nisn = v_nisn;

    IF NOT FOUND THEN
      INSERT INTO public.siswa(nisn, nama, tgl_lahir, kelas_id, jenis_kelamin, status_memilih, waktu_memilih)
      VALUES (v_nisn, v_nama, v_tgl, v_kelas_id, v_jk, FALSE, NULL);
      v_created := v_created + 1;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object(
    'processed', v_count,
    'created', v_created,
    'updated', v_count - v_created
  );
END;
$$;

-- =========================================================
-- 8. DATA PEMILIH LENGKAP UNTUK TABEL ADMIN
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_voter_registry_v3(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  RETURN (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', s.id,
          'nisn', s.nisn,
          'nama', COALESCE(s.nama, s.nisn),
          'nama_kelas', COALESCE(k.nama_kelas, '-'),
          'tgl_lahir', s.tgl_lahir,
          'jenis_kelamin', COALESCE(s.jenis_kelamin, ''),
          'status_memilih', COALESCE(s.status_memilih, FALSE),
          'waktu_memilih', s.waktu_memilih
        )
        ORDER BY k.nama_kelas NULLS LAST, s.nama, s.nisn
      ),
      '[]'::json
    )
    FROM public.siswa s
    LEFT JOIN public.kelas k ON k.id = s.kelas_id
  );
END;
$$;

-- =========================================================
-- 9. RESET HASIL PEMILIHAN V3
-- =========================================================
CREATE OR REPLACE FUNCTION public.reset_voting_results(
  p_username TEXT,
  p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  -- Kunci dan reset data suara secara eksplisit.
  DELETE FROM public.suara;
  UPDATE public.kandidat SET total_suara = 0;
  UPDATE public.siswa SET status_memilih = FALSE, waktu_memilih = NULL;

  RETURN TRUE;
END;
$$;

-- =========================================================
-- 10. SUBMIT VOTE V3: CATAT WAKTU MEMILIH
-- =========================================================
CREATE OR REPLACE FUNCTION public.submit_vote(
  p_nisn TEXT,
  p_tgl_lahir DATE,
  p_kandidat_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aktif BOOLEAN;
  v_student_id BIGINT;
  v_status BOOLEAN;
  v_candidate BIGINT;
BEGIN
  SELECT COALESCE(pemilihan_aktif, TRUE)
  INTO v_aktif
  FROM public.pengaturan
  ORDER BY id
  LIMIT 1;

  IF COALESCE(v_aktif, TRUE) = FALSE THEN
    RAISE EXCEPTION 'Pemilihan sudah ditutup.';
  END IF;

  SELECT id, COALESCE(status_memilih, FALSE)
  INTO v_student_id, v_status
  FROM public.siswa
  WHERE nisn = p_nisn AND tgl_lahir = p_tgl_lahir
  FOR UPDATE;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Data pemilih tidak ditemukan.';
  END IF;

  IF v_status THEN
    RAISE EXCEPTION 'Pemilih ini sudah menggunakan hak suara.';
  END IF;

  SELECT id INTO v_candidate
  FROM public.kandidat
  WHERE id = p_kandidat_id;

  IF v_candidate IS NULL THEN
    RAISE EXCEPTION 'Kandidat tidak ditemukan.';
  END IF;

  UPDATE public.siswa
  SET status_memilih = TRUE,
      waktu_memilih = NOW()
  WHERE id = v_student_id AND COALESCE(status_memilih, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suara tidak dapat diproses. Silakan coba lagi.';
  END IF;

  INSERT INTO public.suara(kandidat_id) VALUES (p_kandidat_id);
  UPDATE public.kandidat
  SET total_suara = COALESCE(total_suara, 0) + 1
  WHERE id = p_kandidat_id;

  RETURN TRUE;
END;
$$;

-- =========================================================
-- 11. SINKRONISASI / HEALTH CHECK DATABASE
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_system_sync_status_v3(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings INTEGER;
  v_classes INTEGER;
  v_students INTEGER;
  v_candidates INTEGER;
  v_votes INTEGER;
  v_voted_students INTEGER;
BEGIN
  IF NOT public.eosis_is_admin(p_username, p_password) THEN
    RAISE EXCEPTION 'Username atau password admin salah';
  END IF;

  SELECT COUNT(*) INTO v_settings FROM public.pengaturan;
  SELECT COUNT(*) INTO v_classes FROM public.kelas;
  SELECT COUNT(*) INTO v_students FROM public.siswa;
  SELECT COUNT(*) INTO v_candidates FROM public.kandidat;
  SELECT COUNT(*) INTO v_votes FROM public.suara;
  SELECT COUNT(*) INTO v_voted_students FROM public.siswa WHERE COALESCE(status_memilih, FALSE) = TRUE;

  RETURN json_build_object(
    'database_connected', TRUE,
    'pengaturan', v_settings,
    'kelas', v_classes,
    'siswa', v_students,
    'kandidat', v_candidates,
    'suara', v_votes,
    'siswa_sudah_memilih', v_voted_students,
    'sinkron_status', CASE
      WHEN v_votes = v_voted_students THEN 'OK'
      ELSE 'PERLU CEK'
    END,
    'checked_at', NOW()
  );
END;
$$;

-- =========================================================
-- 12. IZIN RPC
-- =========================================================
GRANT EXECUTE ON FUNCTION public.save_school_settings_v3(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,DATE,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_credentials_v3(TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_classes_v3(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class_v3(TEXT,TEXT,BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students(TEXT,TEXT,JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voter_registry_v3(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_voting_results(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vote(TEXT,DATE,BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_sync_status_v3(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_candidates() TO anon, authenticated;

-- Refresh PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
