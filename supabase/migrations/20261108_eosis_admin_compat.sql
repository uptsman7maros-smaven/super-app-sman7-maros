CREATE OR REPLACE FUNCTION public.eosis_admin_call(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pengaturan WHERE admin_username = p_username AND admin_password = p_password);
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total_siswa', (SELECT COUNT(*) FROM public.siswa),
    'sudah_memilih', (SELECT COUNT(*) FROM public.siswa WHERE status_memilih),
    'belum_memilih', (SELECT COUNT(*) FROM public.siswa WHERE NOT status_memilih),
    'total_suara', (SELECT COUNT(*) FROM public.suara)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_voting_results(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(row_to_json(k) ORDER BY no_urut), '[]'::json) FROM public.kandidat k;
$$;

CREATE OR REPLACE FUNCTION public.save_candidate(p_username TEXT, p_password TEXT, p_id BIGINT, p_no_urut INTEGER,
  p_nama_ketua TEXT, p_nama_wakil TEXT, p_visi TEXT, p_misi TEXT, p_slogan TEXT, p_foto_url TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
  IF NOT public.eosis_admin_call(p_username,p_password) THEN RAISE EXCEPTION 'Akun admin salah.'; END IF;
  IF p_id IS NULL OR p_id = 0 THEN
    INSERT INTO public.kandidat(no_urut,nama_ketua,nama_wakil,visi,misi,slogan,foto_url)
    VALUES (p_no_urut,p_nama_ketua,p_nama_wakil,p_visi,p_misi,p_slogan,NULLIF(p_foto_url,''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.kandidat SET no_urut=p_no_urut,nama_ketua=p_nama_ketua,nama_wakil=p_nama_wakil,
      visi=p_visi,misi=p_misi,slogan=p_slogan,foto_url=NULLIF(p_foto_url,'') WHERE id=p_id
      RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_candidate(p_username TEXT, p_password TEXT, p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.eosis_admin_call(p_username,p_password) THEN RAISE EXCEPTION 'Akun admin salah.'; END IF;
  IF EXISTS (SELECT 1 FROM public.kandidat WHERE id=p_id AND total_suara>0) THEN
    RAISE EXCEPTION 'Kandidat yang sudah memiliki suara tidak dapat dihapus.';
  END IF;
  DELETE FROM public.kandidat WHERE id=p_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_classes_v3(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(json_build_object('id',id,'nama_kelas',nama_kelas) ORDER BY nama_kelas),'[]'::json) FROM public.kelas;
$$;

CREATE OR REPLACE FUNCTION public.add_class(p_username TEXT, p_password TEXT, p_nama_kelas TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO public.kelas(nama_kelas) VALUES(TRIM(p_nama_kelas)) ON CONFLICT(nama_kelas) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.kelas WHERE nama_kelas=TRIM(p_nama_kelas); END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_voter_registry_v3(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id',s.id,'nisn',s.nisn,'nama',s.nama,'nama_kelas',k.nama_kelas,'tgl_lahir',s.tgl_lahir,
    'jenis_kelamin',s.jenis_kelamin,'status_memilih',s.status_memilih,'waktu_memilih',s.waktu_memilih
  ) ORDER BY s.nama),'[]'::json)
  FROM public.siswa s LEFT JOIN public.kelas k ON k.id=s.kelas_id;
$$;

CREATE OR REPLACE FUNCTION public.reset_voting_results(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.suara;
  UPDATE public.siswa SET status_memilih=FALSE,waktu_memilih=NULL;
  UPDATE public.kandidat SET total_suara=0;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_system_sync_status_v3(p_username TEXT, p_password TEXT)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'database_connected',TRUE,'pengaturan',(SELECT COUNT(*) FROM public.pengaturan),
    'kelas',(SELECT COUNT(*) FROM public.kelas),'siswa',(SELECT COUNT(*) FROM public.siswa),
    'kandidat',(SELECT COUNT(*) FROM public.kandidat),'suara',(SELECT COUNT(*) FROM public.suara),
    'siswa_sudah_memilih',(SELECT COUNT(*) FROM public.siswa WHERE status_memilih),
    'total_suara_kandidat',(SELECT COALESCE(SUM(total_suara),0) FROM public.kandidat),
    'sinkron_status','TERSINKRON','checked_at',NOW()
  );
$$;
