import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RplEditorContent, SchoolHeader } from "../types";

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

async function imageAsPng(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function schoolLogoDataUrl(settings: PdfSettings) {
  for (const candidate of [settings.logo_url, "/logo-sekolah.png"].filter(Boolean)) {
    const image = await imageAsPng(candidate);
    if (image) return image;
  }
  return null;
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
    const logoData = await schoolLogoDataUrl(settings);
    let headerY = 17;
    if (logoData) {
      doc.addImage(logoData, "PNG", 16, 12, 24, 24, undefined, "FAST");
      headerY = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(settings.school_name || "SMAN 7 Maros", pageWidth / 2, headerY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const letterhead = settings.letterhead ? doc.splitTextToSize(settings.letterhead, pageWidth - 66) : [];
    if (letterhead.length) doc.text(letterhead, pageWidth / 2, headerY + 5, { align: "center" });
    const npsn = settings.npsn ? `NPSN ${settings.npsn}` : "";
    if (npsn) doc.text(npsn, pageWidth / 2, headerY + 5 + letterhead.length * 3.5, { align: "center" });
    const lineY = Math.max(39, headerY + 10 + letterhead.length * 3.5);
    doc.setLineWidth(0.7);
    doc.line(15, lineY, pageWidth - 15, lineY);
    doc.setLineWidth(0.2);
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

    const signatureHeight = 42;
    if (y + signatureHeight > pageHeight - 12) {
      doc.addPage();
      y = 22;
    } else {
      y = Math.max(y + 5, pageHeight - signatureHeight - 10);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Mengetahui,", pageWidth * 0.28, y, { align: "center" });
    doc.text("Guru BK / Konselor", pageWidth * 0.72, y, { align: "center" });
    doc.text("Kepala Sekolah", pageWidth * 0.28, y + 5, { align: "center" });
    doc.line(pageWidth * 0.13, y + 28, pageWidth * 0.43, y + 28);
    doc.line(pageWidth * 0.57, y + 28, pageWidth * 0.87, y + 28);
    doc.setFont("helvetica", "bold");
    doc.text(settings.principalName || "(................................)", pageWidth * 0.28, y + 34, { align: "center" });
    doc.text(settings.counselorName || "(................................)", pageWidth * 0.72, y + 34, { align: "center" });
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
