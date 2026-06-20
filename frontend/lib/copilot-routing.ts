const DATA_OPS =
  /\b(sites?\s+critiques?|anomal|delta|remplacement|qualit|rapport|kpi|rca|noc|inventaire|compteur|spares?|snapshot|équipement|equipement|equipment|top\s+\d+|liste\s+des|critical\s+sites?|generate\s+a\s+report|weekly|hebdom)\b/i;

const KNOWLEDGE =
  /\b(c'est\s+quoi|qu'est[\-\s]?ce|what\s+is|what\s+are|explain|explique|défin|define|comment\s+(fonctionne|marche)|how\s+does|radio\s+access|\bran\b|lte|4g|5g|nokia|huawei|telecom|télécom|network|reseau|réseau|bbmod|rmod|vswr|antenne|antenna)\b/i;

export function shouldAutoWebSearch(question: string): boolean {
  const q = question.trim();
  if (q.length < 8) return false;
  if (DATA_OPS.test(q)) return false;
  return KNOWLEDGE.test(q);
}

export function shouldUseEnrichedInsight(question: string, fileCount: number, webSearch: boolean): boolean {
  return fileCount > 0 || webSearch || shouldAutoWebSearch(question);
}
