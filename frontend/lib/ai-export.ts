function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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
  return lines.slice(0, 120);
}

export function downloadResponsePdf(title: string, body: string, filename = "ran-intelligence-response.pdf") {
  const lines = wrapLines(body);
  const streamParts = ["BT", "/F1 10 Tf"];
  let y = 760;
  streamParts.push(`1 0 0 1 50 ${y} Tm (${pdfEscape(title)}) Tj`);
  y -= 18;
  lines.forEach((line) => {
    if (y < 48) return;
    streamParts.push(`1 0 0 1 50 ${y} Tm (${pdfEscape(line || " ")}) Tj`);
    y -= 13;
  });
  streamParts.push("ET");
  const stream = streamParts.join("\n");
  const streamLen = stream.length;

  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj",
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    `5 0 obj<</Length ${streamLen}>>stream\n${stream}\nendstream endobj`,
  ];

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
