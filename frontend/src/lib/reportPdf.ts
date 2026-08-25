import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportPayload = {
  summary: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  chartSvg?: SVGSVGElement | null;
};

/* App theme colors (matches tailwind config) */
const NAVY: [number, number, number] = [22, 50, 79];
const NAVY_SOFT: [number, number, number] = [65, 88, 110];
const TEAL: [number, number, number] = [47, 158, 151];
const TEAL_SOFT: [number, number, number] = [227, 242, 240];
const INK: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [148, 163, 184];
const LINE: [number, number, number] = [226, 232, 240];
const SURFACE: [number, number, number] = [244, 246, 250];

const PAGE_W = 595.28; // A4 width in pt
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_TABLE_ROWS = 60;

async function svgToPng(svg: SVGSVGElement): Promise<{ dataUrl: string; aspect: number } | null> {
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("font-family", "Inter, Helvetica, Arial, sans-serif");
    const width = svg.viewBox?.baseVal?.width || 640;
    const height = svg.viewBox?.baseVal?.height || 300;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const serialized = new XMLSerializer().serializeToString(clone);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    await image.decode();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), aspect: height / width };
  } catch {
    return null;
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function downloadQueryReport(payload: ReportPayload): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageH = doc.internal.pageSize.getHeight();

  /* header band */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 86, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 86, PAGE_W, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("QueryMind · Query Report", MARGIN, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(168, 200, 212);
  doc.text(new Date().toLocaleString(), MARGIN, 60);

  let y = 122;
  const sectionTitle = (label: string) => {
    if (y > pageH - 90) {
      doc.addPage();
      y = 64;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEAL);
    const heading = label.toUpperCase();
    doc.text(heading, MARGIN, y, { charSpace: 1.2 });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.7);
    doc.line(MARGIN + doc.getTextWidth(heading) + 20, y - 3.2, PAGE_W - MARGIN, y - 3.2);
    y += 18;
  };

  /* explanation */
  sectionTitle("Explanation");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  const summaryLines = doc.splitTextToSize(payload.summary || "—", CONTENT_W) as string[];
  doc.text(summaryLines, MARGIN, y + 4);
  y += summaryLines.length * 15 + 16;

  /* sql block — same navy panel with light mint mono text as the chat code block */
  sectionTitle("SQL query");
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  const sqlLines = doc.splitTextToSize(payload.sql || "—", CONTENT_W - 32) as string[];
  const blockH = sqlLines.length * 15 + 26;
  doc.setFillColor(...NAVY);
  doc.setDrawColor(...NAVY_SOFT);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, y - 6, CONTENT_W, blockH, 8, 8, "FD");
  doc.setTextColor(...TEAL_SOFT);
  doc.text(sqlLines, MARGIN + 16, y + 14);
  y += blockH + 20;

  /* results table */
  if (payload.rows.length > 0) {
    sectionTitle(`Results · ${payload.rows.length} row${payload.rows.length === 1 ? "" : "s"}`);
    autoTable(doc, {
      alternateRowStyles: { fillColor: SURFACE },
      body: payload.rows.slice(0, MAX_TABLE_ROWS).map((row) => payload.columns.map((column) => cellText(row[column]))),
      head: [payload.columns],
      headStyles: { fillColor: TEAL, fontStyle: "bold", textColor: [255, 255, 255] },
      margin: { left: MARGIN, right: MARGIN },
      styles: { cellPadding: 5, fontSize: 8.5, lineColor: LINE, lineWidth: 0.5, textColor: INK },
      theme: "grid",
      startY: y
    });
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y = finalY + 22;
    if (payload.rows.length > MAX_TABLE_ROWS) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(`Showing first ${MAX_TABLE_ROWS} of ${payload.rows.length} rows.`, MARGIN, y - 8);
      y += 12;
    }
  }

  /* chart snapshot */
  if (payload.chartSvg) {
    const png = await svgToPng(payload.chartSvg);
    if (png) {
      const imgH = CONTENT_W * png.aspect;
      if (y + imgH > pageH - 70) {
        doc.addPage();
        y = 64;
      }
      sectionTitle("Chart");
      doc.addImage(png.dataUrl, "PNG", MARGIN, y, CONTENT_W, imgH, undefined, "FAST");
      y += imgH + 16;
    }
  }

  /* footers */
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, pageH - 44, PAGE_W - MARGIN, pageH - 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Generated by QueryMind", MARGIN, pageH - 30);
    doc.text(`${page} / ${total}`, PAGE_W - MARGIN, pageH - 30, { align: "right" });
  }

  doc.save(`querymind-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
