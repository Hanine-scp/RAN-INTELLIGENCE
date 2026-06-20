function pdfEscape(value: string): string {
  const ascii = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLines(text: string, max = 88): string[] {
  const clean = text.replace(/\*\*/g, "").replace(/```[\s\S]*?```/g, "").trim();
  const lines: string[] = [];
  clean.split("\n").forEach((raw) => {
    let line = raw;
    while (line.length > max) {
      lines.push(line.slice(0, max));
      line = line.slice(max);
    }
    lines.push(line);
  });
  return lines;
}

function buildPageStreams(title: string, lines: string[]): string[] {
  const streams: string[] = [];
  let streamParts = ["BT", "/F1 10 Tf"];
  let y = 760;
  let titleShown = false;

  const startNewPage = () => {
    streamParts.push("ET");
    streams.push(streamParts.join("\n"));
    streamParts = ["BT", "/F1 10 Tf"];
    y = 760;
    titleShown = true;
  };

  if (!titleShown) {
    streamParts.push(`1 0 0 1 50 ${y} Tm (${pdfEscape(title)}) Tj`);
    y -= 18;
    titleShown = true;
  }

  lines.forEach((line) => {
    if (y < 48) startNewPage();
    streamParts.push(`1 0 0 1 50 ${y} Tm (${pdfEscape(line || " ")}) Tj`);
    y -= 13;
  });

  streamParts.push("ET");
  streams.push(streamParts.join("\n"));
  return streams;
}

export function downloadResponsePdf(title: string, body: string, filename = "ran-intelligence-response.pdf") {
  const lines = wrapLines(body);
  const pageStreams = buildPageStreams(title, lines);
  const pageCount = pageStreams.length;

  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < pageCount; i += 1) {
    pageObjectIds.push(nextId);
    contentObjectIds.push(nextId + 1);
    nextId += 2;
  }
  const fontObjectId = nextId;

  const objects: string[] = [];
  objects.push("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj");
  objects.push(`2 0 obj<</Type/Pages/Kids[${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${pageCount}>>endobj`);

  pageStreams.forEach((stream, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    objects.push(
      `${pageId} 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 ${fontObjectId} 0 R>>>>/Contents ${contentId} 0 R>>endobj`,
    );
    objects.push(`${contentId} 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`);
  });

  objects.push(`${fontObjectId} 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text.replace(/\*\*/g, ""));
    return true;
  } catch {
    return false;
  }
}

export function downloadTextFile(body: string, filename: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
