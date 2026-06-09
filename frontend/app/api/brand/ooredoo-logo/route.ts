import { access, readFile } from "node:fs/promises";
import path from "node:path";

function candidatePaths() {
  const cwd = process.cwd();
  return [
    path.join(cwd, "public", "brand", "ooredoo-logo.png"),
    path.join(cwd, "..", "app", "assets", "ooredoo_logo.png"),
    path.join(cwd, "app", "assets", "ooredoo_logo.png"),
    path.join(cwd, "public", "assets", "ooredoo_logo.png"),
  ];
}

async function resolveLogoPath() {
  for (const filePath of candidatePaths()) {
    try {
      await access(filePath);
      return filePath;
    } catch {
      // try next candidate path
    }
  }
  return null;
}

export async function GET() {
  const logoPath = await resolveLogoPath();
  if (!logoPath) {
    return new Response("Logo not found", { status: 404 });
  }

  const content = await readFile(logoPath);
  return new Response(content, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
