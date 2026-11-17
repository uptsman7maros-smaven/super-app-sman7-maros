import type { AcademicYearOption, SummaryStats } from "../types";

type Props = {
  stats: SummaryStats;
  academicYearId: string;
  academicYears: AcademicYearOption[];
  semester: string;
};

export default function StatsHeader({ stats, academicYearId, academicYears, semester }: Props) {
  const yearName = academicYears.find(year => year.id === academicYearId)?.name ?? "Semua tahun";
  return (
    <div className="kb-stats">
      <div className="kb-stat purple"><span>🔔</span><div><small>Alert belum dibaca</small><strong>{stats.unreadAlerts ?? "—"}</strong></div></div>
      <div className="kb-stat blue"><span>🧭</span><div><small>Kasus BK aktif</small><strong>{stats.activeCases ?? "—"}</strong></div></div>
      <div className="kb-stat orange"><span>📅</span><div><small>Izin hari ini · Prestasi periode</small><strong>{stats.permitsToday ?? "—"} · {stats.achievements ?? "—"}</strong><small>{yearName} · Semester {semester || "semua"}</small></div></div>
    </div>
  );
}
