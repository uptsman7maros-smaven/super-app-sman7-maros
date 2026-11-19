import type jsPDF from "jspdf";

type SignatureBlockContent = {
  leftHeading: string[];
  leftName: string;
  rightHeading: string[];
  rightName: string;
};

const SIGNATURE_GAP_MM = 8;
const SIGNATURE_BLOCK_HEIGHT_MM = 38;
const PAGE_BOTTOM_GUARD_MM = 12;

export function drawStandardPdfSignatureBlock(
  doc: jsPDF,
  contentEndY: number,
  content: SignatureBlockContent,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let startY = contentEndY + SIGNATURE_GAP_MM;

  if (startY + SIGNATURE_BLOCK_HEIGHT_MM > pageHeight - PAGE_BOTTOM_GUARD_MM) {
    doc.addPage();
    startY = 22;
  }

  const leftCenter = pageWidth * 0.28;
  const rightCenter = pageWidth * 0.72;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  content.leftHeading.forEach((line, index) => doc.text(line, leftCenter, startY + index * 5, { align: "center" }));
  content.rightHeading.forEach((line, index) => doc.text(line, rightCenter, startY + index * 5, { align: "center" }));

  const lineY = startY + 27;
  doc.setLineWidth(0.25);
  doc.line(pageWidth * 0.13, lineY, pageWidth * 0.43, lineY);
  doc.line(pageWidth * 0.57, lineY, pageWidth * 0.87, lineY);
  doc.setFont("helvetica", "bold");
  doc.text(content.leftName || "(................................)", leftCenter, lineY + 6, { align: "center" });
  doc.text(content.rightName || "(................................)", rightCenter, lineY + 6, { align: "center" });
  return startY + SIGNATURE_BLOCK_HEIGHT_MM;
}
