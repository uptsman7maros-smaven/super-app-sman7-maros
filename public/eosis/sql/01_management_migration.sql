-- eOSIS V2 - Migration fitur administrasi
-- Jalankan setelah SQL dasar eOSIS Anda yang saat ini sudah berjalan.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- 1. PENGATURAN SEKOLAH & STATUS PEMILIHAN
-- =========================================================
ALTER TABLE public.pengaturan
  ADD COLUMN IF NOT EXISTS nama_sekolah TEXT DEFAULT 'SMAN 7 MAROS',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS pemilihan_aktif BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS kop_nama_sekolah TEXT DEFAULT 'SMAN 7 MAROS',
  ADD COLUMN IF NOT EXISTS kop_subjudul TEXT DEFAULT 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS',
  ADD COLUMN IF NOT EXISTS kop_alamat TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS kop_kontak TEXT DEFAULT '';

UPDATE public.pengaturan
SET nama_sekolah = COALESCE(NULLIF(nama_sekolah, ''), 'SMAN 7 MAROS'),
    kop_nama_sekolah = COALESCE(NULLIF(kop_nama_sekolah, ''), COALESCE(NULLIF(nama_sekolah, ''), 'SMAN 7 MAROS')),
    kop_subjudul = COALESCE(NULLIF(kop_subjudul, ''), 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS'),
    pemilihan_aktif = COALESCE(pemilihan_aktif, TRUE);

-- =========================================================
-- 2. FUNGSI BANTU VALIDASI ADMIN
-- =========================================================
CREATE OR REPLACE FUNCTION public.eosis_is_admin(
    p_username TEXT,
    p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_valid BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.pengaturan
        WHERE admin_username = p_username
          AND admin_password = crypt(p_password, admin_password)
    ) INTO v_valid;
    RETURN COALESCE(v_valid, FALSE);
END;
$$;

-- =========================================================
-- 3. PENGATURAN PUBLIK
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN COALESCE(
        (SELECT json_build_object(
            'nama_sekolah', nama_sekolah,
            'logo_url', logo_url,
            'pemilihan_aktif', pemilihan_aktif,
            'kop_nama_sekolah', kop_nama_sekolah,
            'kop_subjudul', kop_subjudul,
            'kop_alamat', kop_alamat,
            'kop_kontak', kop_kontak
        ) FROM public.pengaturan LIMIT 1),
        json_build_object(
            'nama_sekolah','SMAN 7 MAROS',
            'logo_url',NULL,
            'pemilihan_aktif',TRUE,
            'kop_nama_sekolah','SMAN 7 MAROS',
            'kop_subjudul','PEMILIHAN KETUA DAN WAKIL KETUA OSIS',
            'kop_alamat','',
            'kop_kontak',''
        )
    );
END;
$$;

-- =========================================================
-- 4. SETTING ADMIN
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_school_settings(
    p_username TEXT,
    p_password TEXT,
    p_nama_sekolah TEXT,
    p_logo_url TEXT,
    p_kop_nama_sekolah TEXT,
    p_kop_subjudul TEXT,
    p_kop_alamat TEXT,
    p_kop_kontak TEXT
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

    UPDATE public.pengaturan
    SET nama_sekolah = COALESCE(NULLIF(TRIM(p_nama_sekolah), ''), 'SMAN 7 MAROS'),
        logo_url = NULLIF(p_logo_url, ''),
        kop_nama_sekolah = COALESCE(NULLIF(TRIM(p_kop_nama_sekolah), ''), COALESCE(NULLIF(TRIM(p_nama_sekolah), ''), 'SMAN 7 MAROS')),
        kop_subjudul = COALESCE(NULLIF(TRIM(p_kop_subjudul), ''), 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS'),
        kop_alamat = COALESCE(p_kop_alamat, ''),
        kop_kontak = COALESCE(p_kop_kontak, '')
    WHERE id = (SELECT id FROM public.pengaturan ORDER BY id LIMIT 1);

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_voting_status(
    p_username TEXT,
    p_password TEXT,
    p_aktif BOOLEAN
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

    UPDATE public.pengaturan
    SET pemilihan_aktif = p_aktif
    WHERE id = (SELECT id FROM public.pengaturan ORDER BY id LIMIT 1);

    RETURN TRUE;
END;
$$;

-- =========================================================
-- 5. KANDIDAT
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_candidates()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(
            json_agg(
                json_build_object(
                    'id', k.id,
                    'no_urut', k.no_urut,
                    'nama_ketua', k.nama_ketua,
                    'nama_wakil', k.nama_wakil,
                    'visi', k.visi,
                    'misi', k.misi,
                    'slogan', k.slogan,
                    'foto_url', k.foto_url,
                    'total_suara', k.total_suara
                ) ORDER BY k.no_urut
            ), '[]'::json
        ) FROM public.kandidat k
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_candidate(
    p_username TEXT,
    p_password TEXT,
    p_id BIGINT,
    p_no_urut INTEGER,
    p_nama_ketua TEXT,
    p_nama_wakil TEXT,
    p_visi TEXT,
    p_misi TEXT,
    p_slogan TEXT,
    p_foto_url TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
    IF NOT public.eosis_is_admin(p_username, p_password) THEN
        RAISE EXCEPTION 'Username atau password admin salah';
    END IF;

    IF p_no_urut IS NULL OR p_no_urut < 1 THEN
        RAISE EXCEPTION 'Nomor urut tidak valid';
    END IF;

    IF p_id IS NULL OR p_id = 0 THEN
        INSERT INTO public.kandidat(no_urut, nama_ketua, nama_wakil, visi, misi, slogan, foto_url, total_suara)
        VALUES (p_no_urut, TRIM(p_nama_ketua), TRIM(p_nama_wakil), COALESCE(p_visi,''), COALESCE(p_misi,''), COALESCE(p_slogan,''), NULLIF(p_foto_url,''), 0)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.kandidat
        SET no_urut = p_no_urut,
            nama_ketua = TRIM(p_nama_ketua),
            nama_wakil = TRIM(p_nama_wakil),
            visi = COALESCE(p_visi,''),
            misi = COALESCE(p_misi,''),
            slogan = COALESCE(p_slogan,''),
            foto_url = NULLIF(p_foto_url,'')
        WHERE id = p_id
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION 'Kandidat tidak ditemukan';
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_candidate(
    p_username TEXT,
    p_password TEXT,
    p_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_votes INTEGER;
BEGIN
    IF NOT public.eosis_is_admin(p_username, p_password) THEN
        RAISE EXCEPTION 'Username atau password admin salah';
    END IF;

    SELECT total_suara INTO v_votes FROM public.kandidat WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kandidat tidak ditemukan'; END IF;
    IF COALESCE(v_votes,0) > 0 THEN
        RAISE EXCEPTION 'Kandidat yang sudah memiliki suara tidak dapat dihapus. Reset hasil terlebih dahulu.';
    END IF;

    DELETE FROM public.kandidat WHERE id = p_id;
    RETURN TRUE;
END;
$$;

-- =========================================================
-- 6. RESET HASIL PEMILIHAN
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

    DELETE FROM public.suara;
    UPDATE public.kandidat SET total_suara = 0;
    UPDATE public.siswa SET status_memilih = FALSE;

    RETURN TRUE;
END;
$$;

-- =========================================================
-- 7. IMPORT PEMILIH DARI EXCEL
-- JSON: [{"nisn":"...","tgl_lahir":"YYYY-MM-DD","kelas":"XII IPA 1"}]
-- Fungsi dibuat adaptif untuk kolom nama jika ada/tidak ada.
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
    v_tgl DATE;
    v_kelas TEXT;
    v_kelas_id BIGINT;
    v_count INTEGER := 0;
    v_has_nama BOOLEAN;
    v_sql TEXT;
BEGIN
    IF NOT public.eosis_is_admin(p_username, p_password) THEN
        RAISE EXCEPTION 'Username atau password admin salah';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='siswa' AND column_name='nama'
    ) INTO v_has_nama;

    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
        v_nisn := NULLIF(TRIM(r->>'nisn'),'');
        v_kelas := NULLIF(TRIM(r->>'kelas'),'');
        v_tgl := NULLIF(r->>'tgl_lahir','')::DATE;

        IF v_nisn IS NULL OR v_tgl IS NULL OR v_kelas IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.kelas(nama_kelas)
        VALUES (v_kelas)
        ON CONFLICT (nama_kelas) DO NOTHING;

        SELECT id INTO v_kelas_id FROM public.kelas WHERE nama_kelas = v_kelas LIMIT 1;

        IF v_has_nama THEN
            v_sql := 'UPDATE public.siswa SET tgl_lahir=$1, kelas_id=$2 WHERE nisn=$3';
            EXECUTE v_sql USING v_tgl, v_kelas_id, v_nisn;
            IF NOT FOUND THEN
                v_sql := 'INSERT INTO public.siswa(nisn, nama, tgl_lahir, kelas_id, status_memilih) VALUES ($1,$2,$3,$4,FALSE)';
                EXECUTE v_sql USING v_nisn, v_nisn, v_tgl, v_kelas_id;
            END IF;
        ELSE
            v_sql := 'UPDATE public.siswa SET tgl_lahir=$1, kelas_id=$2 WHERE nisn=$3';
            EXECUTE v_sql USING v_tgl, v_kelas_id, v_nisn;
            IF NOT FOUND THEN
                v_sql := 'INSERT INTO public.siswa(nisn, tgl_lahir, kelas_id, status_memilih) VALUES ($1,$2,$3,FALSE)';
                EXECUTE v_sql USING v_nisn, v_tgl, v_kelas_id;
            END IF;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN json_build_object('imported', v_count);
END;
$$;

-- =========================================================
-- 8. TAMBAH KELAS
-- =========================================================
CREATE OR REPLACE FUNCTION public.add_class(
    p_username TEXT,
    p_password TEXT,
    p_nama_kelas TEXT
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
    INSERT INTO public.kelas(nama_kelas) VALUES (TRIM(p_nama_kelas)) ON CONFLICT (nama_kelas) DO NOTHING;
    RETURN TRUE;
END;
$$;

-- =========================================================
-- 9. STATISTIK PER KELAS
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_class_stats(
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
            SELECT k.nama_kelas,
                   COUNT(s.id) AS total_siswa,
                   COUNT(s.id) FILTER (WHERE s.status_memilih = TRUE) AS sudah_memilih
            FROM public.kelas k
            LEFT JOIN public.siswa s ON s.kelas_id = k.id
            GROUP BY k.id, k.nama_kelas
        ) x
    );
END;
$$;

-- =========================================================
-- 10. PERBAIKI LOGIN SISWA AGAR PEMILIHAN BISA DITUTUP
-- =========================================================
CREATE OR REPLACE FUNCTION public.student_login(
    p_nisn TEXT,
    p_tgl_lahir DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student JSON; v_aktif BOOLEAN;
BEGIN
    SELECT COALESCE(pemilihan_aktif, TRUE) INTO v_aktif FROM public.pengaturan ORDER BY id LIMIT 1;
    IF COALESCE(v_aktif, TRUE) = FALSE THEN
        RAISE EXCEPTION 'Pemilihan saat ini sudah ditutup oleh admin.';
    END IF;

    SELECT json_build_object(
        'id', s.id,
        'nisn', s.nisn,
        'nama', COALESCE(s.nama, s.nisn),
        'tgl_lahir', s.tgl_lahir,
        'kelas_id', s.kelas_id,
        'nama_kelas', k.nama_kelas,
        'status_memilih', s.status_memilih
    ) INTO v_student
    FROM public.siswa s
    LEFT JOIN public.kelas k ON k.id = s.kelas_id
    WHERE s.nisn = p_nisn AND s.tgl_lahir = p_tgl_lahir;

    IF v_student IS NULL THEN
        RAISE EXCEPTION 'NISN atau tanggal lahir tidak sesuai.';
    END IF;
    RETURN v_student;
END;
$$;

-- =========================================================
-- 11. PERKETAT SUBMIT VOTE DENGAN STATUS PEMILIHAN
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
DECLARE v_aktif BOOLEAN; v_student_id BIGINT; v_status BOOLEAN; v_candidate BIGINT;
BEGIN
    SELECT COALESCE(pemilihan_aktif, TRUE) INTO v_aktif FROM public.pengaturan ORDER BY id LIMIT 1;
    IF COALESCE(v_aktif, TRUE) = FALSE THEN RAISE EXCEPTION 'Pemilihan sudah ditutup.'; END IF;

    SELECT id, status_memilih INTO v_student_id, v_status
    FROM public.siswa
    WHERE nisn=p_nisn AND tgl_lahir=p_tgl_lahir
    FOR UPDATE;

    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Data pemilih tidak ditemukan.'; END IF;
    IF v_status THEN RAISE EXCEPTION 'Pemilih ini sudah menggunakan hak suara.'; END IF;

    SELECT id INTO v_candidate FROM public.kandidat WHERE id=p_kandidat_id;
    IF v_candidate IS NULL THEN RAISE EXCEPTION 'Kandidat tidak ditemukan.'; END IF;

    UPDATE public.siswa SET status_memilih=TRUE WHERE id=v_student_id AND status_memilih=FALSE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Suara tidak dapat diproses. Silakan coba lagi.'; END IF;

    INSERT INTO public.suara(kandidat_id) VALUES (p_kandidat_id);
    UPDATE public.kandidat SET total_suara=COALESCE(total_suara,0)+1 WHERE id=p_kandidat_id;
    RETURN TRUE;
END;
$$;

-- =========================================================
-- 12. HAK EKSEKUSI RPC
-- =========================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_candidates() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_login(TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vote(TEXT, DATE, BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_voting_results(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eosis_is_admin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_school_settings(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_voting_status(TEXT,TEXT,BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_candidate(TEXT,TEXT,BIGINT,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_candidate(TEXT,TEXT,BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_voting_results(TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students(TEXT,TEXT,JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_class(TEXT,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_class_stats(TEXT,TEXT) TO anon, authenticated;
