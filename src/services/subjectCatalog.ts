export const subjectSuggestions = [
  "Matematika",
  "Matematika Tingkat Lanjut",
  "Bahasa Indonesia",
  "Bahasa Indonesia Tingkat Lanjut",
  "Bahasa Inggris",
  "Fisika",
  "Kimia",
  "Biologi",
  "Ekonomi",
  "Sosiologi",
  "Geografi",
  "Sejarah",
  "Sejarah Tingkat Lanjut",
  "PPKn",
  "PAI",
  "PJOK",
  "Seni Budaya",
  "Informatika",
  "Prakarya",
  "Bahasa Daerah",
];

export function normalizeSubjectName(subject: string) {
  const trimmedSubject = subject.trim();
  return trimmedSubject.toLocaleLowerCase("id-ID") === "pendidikan agama islam"
    ? "PAI"
    : trimmedSubject;
}
