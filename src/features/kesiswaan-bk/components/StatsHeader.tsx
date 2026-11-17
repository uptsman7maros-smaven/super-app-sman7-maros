import type { AcademicYearOption, SummaryStats } from "../types";

type Props = {
  stats: SummaryStats;
  academicYearId: string;
  academicYears: AcademicYearOption[];
  semester: string;
  module: "kesiswaan" | "bimbingan-konseling";
};

export default function StatsHeader({ stats, academicYearId, academicYears, semester, module }: Props) {
  const yearName = academicYears.find(year => year.id === academicYearId)?.name ?? "Semua tahun";
  if (module === "bimbingan-konseling") {
    return (
      <div className="kb-stats kb-stats-bk">
        <div className="kb-stat purple"><span>🔔</span><div><small>Alert belum dibaca</small><strong>{stats.unreadAlerts ?? "—"}</strong></div></div>
        <div className="kb-stat blue"><span>🧭</span><div><small>Kasus BK aktif</small><strong>{stats.activeCases ?? "—"}</strong><small>{yearName} · Semester {semester || "semua"}</small></div></div>
      </div>
    );
  }

  return (
    <div className="kb-stats kb-stats-kesiswaan">
      <div className="kb-stat orange"><span>📅</span><div><small>Izin hari ini</small><strong>{stats.permitsToday ?? "—"}</strong></div></div>
      <div className="kb-stat blue"><span>🏆</span><div><small>Prestasi periode</small><strong>{stats.achievements ?? "—"}</strong><small>{yearName} · Semester {semester || "semua"}</small></div></div>
    </div>
  );
}
