import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RplEditorContent, SchoolHeader } from "../types";
import { drawStandardPdfSignatureBlock } from "../../../lib/pdfDocumentLayout";

export type RplPdfData = RplEditorContent & {
  komponen_layanan: string;
  bidang_layanan: string;
  jenis_layanan: string;
  sasaran_kelas: string;
  durasi: string;
  fungsi_layanan: string;
  semester: string;
};

type PdfSettings = SchoolHeader & {
  academicYear: string;
  counselorName: string;
  principalName?: string;
};

async function imageAsPng(url: string): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const width = bitmap.width;
    const height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { data: canvas.toDataURL("image/png"), width, height };
  } catch {
    return null;
  }
}

async function schoolLogoDataUrls(settings: PdfSettings) {
  const imageWithFallback = async (url: string, fallback: string) =>
    await imageAsPng(url) ?? (url === fallback ? null : imageAsPng(fallback));
  const provinceUrl = settings.province_logo_url || "/logo-provinsi-sulsel.svg";
  const schoolUrl = settings.school_logo_url || "/logo-sekolah.png";
  const [provinceLogo, schoolLogo] = await Promise.all([
    imageWithFallback(provinceUrl, "/logo-provinsi-sulsel.svg"),
    settings.layout === "2"
      ? imageWithFallback(schoolUrl, "/logo-sekolah.png")
      : Promise.resolve(null),
  ]);
  return { provinceLogo, schoolLogo };
}

function drawLogo(
  doc: jsPDF,
  logo: { data: string; width: number; height: number } | null,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (!logo) return;
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  doc.addImage(logo.data, "PNG", x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height, undefined, "FAST");
}

function addParagraph(doc: jsPDF, label: string, value: string, startY: number) {
  const left = 16;
  const width = 178;
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(label, left, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(value.trim() || "-", width);
  doc.text(lines, left, y);
  return y + lines.length * 4.5 + 4;
}

function stageRows(value: string) {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const match = line.match(/^(.*?)\s*[(-]\s*(\d+)\s*menit\)?$/i);
    return match ? [match[1].trim(), `${match[2]} menit`] : [line, "—"];
  });
}

function createPdf(data: RplPdfData, settings: PdfSettings) {
  const doc = new jsPDF({ format: "a4", unit: "mm", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: `RPL BK ${data.judul_topik}`, subject: "Rencana Pelaksanaan Layanan Bimbingan dan Konseling" });

  const render = async () => {
    const logos = await schoolLogoDataUrls(settings);
    const alternative = settings.layout === "2";
    const headingFont = alternative ? "times" : "helvetica";
    if (alternative) {
      drawLogo(doc, logos.provinceLogo, 16, 11, 23, 27);
      drawLogo(doc, logos.schoolLogo, pageWidth - 39, 11, 23, 27);
    } else {
      drawLogo(doc, logos.provinceLogo, (pageWidth - 20) / 2, 7, 20, 23);
    }

    doc.setFont(headingFont, "normal");
    doc.setFontSize(14);
    doc.text("PEMERINTAH PROVINSI SULAWESI SELATAN", pageWidth / 2, alternative ? 20 : 35, { align: "center" });
    doc.setFont(headingFont, "bold");
    doc.setFontSize(16);
    doc.text("DINAS PENDIDIKAN", pageWidth / 2, alternative ? 27 : 42, { align: "center" });
    doc.setFontSize(18);
    doc.text(settings.school_name || "UPT SMA NEGERI 7 MAROS", pageWidth / 2, alternative ? 34 : 50, { align: "center" });
    doc.setFont(headingFont, "italic");
    doc.setFontSize(alternative ? 6 : 7);
    doc.text(settings.letterhead || "", pageWidth / 2, alternative ? 40 : 55, { align: "center", maxWidth: pageWidth - (alternative ? 66 : 30) });
    const lineY = alternative ? 43 : 59;
    doc.setLineWidth(1.1);
    doc.line(15, lineY, pageWidth - 15, lineY);
    doc.setLineWidth(0.35);
    doc.line(15, lineY + 1.4, pageWidth - 15, lineY + 1.4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("RENCANA PELAKSANAAN LAYANAN (RPL)", pageWidth / 2, lineY + 9, { align: "center" });
    doc.setFontSize(10);
    doc.text("BIMBINGAN DAN KONSELING", pageWidth / 2, lineY + 14, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Tahun Ajaran ${settings.academicYear || "-"}  |  Semester ${data.semester || "-"}`, pageWidth / 2, lineY + 19, { align: "center" });

    autoTable(doc, {
      startY: lineY + 23,
      margin: { left: 16, right: 16 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, overflow: "linebreak" },
      headStyles: { fillColor: [81, 65, 202], textColor: 255 },
      head: [["Identitas layanan", "Keterangan", "Identitas layanan", "Keterangan"]],
      body: [
        ["Komponen layanan", data.komponen_layanan, "Bidang layanan", data.bidang_layanan],
        ["Topik layanan", data.judul_topik, "Sasaran / kelas", data.sasaran_kelas],
        ["Jenis layanan", data.jenis_layanan, "Alokasi waktu", data.durasi],
        ["Fungsi layanan", data.fungsi_layanan, "Tahun / semester", `${settings.academicYear || "-"} / ${data.semester || "-"}`],
      ],
      columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 1: { cellWidth: 57 }, 2: { cellWidth: 34, fontStyle: "bold" }, 3: { cellWidth: 57 } },
    });

    let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? lineY + 25;
    const ensureSpace = (height: number) => {
      if (y + height > pageHeight - 22) {
        doc.addPage();
        y = 18;
      }
    };
    const heading = (text: string) => {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(text, 16, y + 5);
      y += 9;
    };

    heading("A. Tujuan Layanan");
    y = addParagraph(doc, "Tujuan umum", data.tujuan_umum, y);
    y = addParagraph(doc, "Tujuan khusus", data.tujuan_khusus, y);
    heading("B. Metode, Teknik, dan Media / Alat");
    y = addParagraph(doc, "Metode dan teknik", data.metode_teknik, y);
    y = addParagraph(doc, "Media / alat", data.media_alat, y);
    heading("C. Materi Pokok Layanan");
    y = addParagraph(doc, "Materi pokok", data.materi_pokok, y);

    heading("D. Langkah-Langkah Kegiatan Layanan");
    autoTable(doc, {
      startY: y,
      margin: { left: 16, right: 16 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.3, overflow: "linebreak" },
      headStyles: { fillColor: [81, 65, 202], textColor: 255 },
      head: [["Tahap", "Kegiatan layanan", "Estimasi"]],
      body: [
        ...stageRows(data.tahap_awal).map(row => ["Tahap awal / pendahuluan", ...row]),
        ...stageRows(data.tahap_inti).map(row => ["Tahap inti", ...row]),
        ...stageRows(data.tahap_penutup).map(row => ["Tahap penutup", ...row]),
      ],
      columnStyles: { 0: { cellWidth: 39, fontStyle: "bold" }, 1: { cellWidth: 126 }, 2: { cellWidth: 17, halign: "center" } },
    });
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 10;

    heading("E. Rencana Evaluasi");
    y = addParagraph(doc, "Evaluasi proses", data.evaluasi_proses, y);
    y = addParagraph(doc, "Evaluasi hasil", data.evaluasi_hasil, y);

    drawStandardPdfSignatureBlock(doc, y, {
      leftHeading: ["Mengetahui,", "Kepala Sekolah"],
      leftName: settings.principalName || "",
      rightHeading: ["Guru BK / Konselor"],
      rightName: settings.counselorName || "",
    });
  };
  return { doc, render };
}

function safeFilenamePart(value: string) {
  return value.normalize("NFKD").replace(/[^\p{L}\p{N}-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "RPL";
}

export async function generateRplPdfBlobUrl(data: RplPdfData, settings: PdfSettings) {
  const { doc, render } = createPdf(data, settings);
  await render();
  const blob = doc.output("blob");
  return { blob, url: URL.createObjectURL(blob) };
}

export async function downloadRplPdf(data: RplPdfData, settings: PdfSettings) {
  const { doc, render } = createPdf(data, settings);
  await render();
  const filename = `RPL_BK_${safeFilenamePart(data.judul_topik)}_${safeFilenamePart(data.sasaran_kelas)}.pdf`;
  doc.save(filename);
}
