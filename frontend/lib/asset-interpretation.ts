export type SignalTone = "success" | "warning" | "critical" | "info" | "neutral";

export type AssetSignal = {
  label: string;
  tone: SignalTone;
  title: string;
  summary: string;
  insights: { icon: string; label: string; value: string }[];
  recommendations: string[];
};

type Lang = "Français" | "English";

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAssetRowKey(row: Record<string, unknown>) {
  return `${String(row.snapshot_date ?? "")}|${String(row.site_id ?? "")}|${String(row.object_type ?? "")}`;
}

export function buildProductRowKey(row: Record<string, unknown>) {
  return `${String(row.object_type ?? "")}|${String(row.product_code ?? "")}|${String(row.product_name ?? "")}`;
}

export function interpretAssetRow(row: Record<string, unknown>, language: Lang): AssetSignal {
  const siteShare = num(row.site_asset_share);
  const objectShare = num(row.object_asset_share);
  const equipmentCount = num(row.equipment_count);
  const siteTotal = num(row.site_total_assets);
  const objectTotal = num(row.object_total_assets);
  const duplicatedSerials = num(row.duplicated_serials);
  const uniqueSerialRate = num(row.unique_serial_rate);
  const sitesWithType = num(row.sites_count);
  const fr = language === "Français";

  if (duplicatedSerials > 0 && uniqueSerialRate < 85) {
    return {
      label: fr ? "Risque" : "Risk",
      tone: "critical",
      title: fr ? "Risque qualité serial" : "Serial quality risk",
      summary: fr
        ? `${duplicatedSerials} doublon(s) serial détecté(s) avec un taux d'unicité de ${uniqueSerialRate}%.`
        : `${duplicatedSerials} duplicated serial(s) detected with a uniqueness rate of ${uniqueSerialRate}%.`,
      insights: [
        { icon: "alert", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
        { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
        { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
        { icon: "shield", label: fr ? "Unicité serial" : "Serial uniqueness", value: `${uniqueSerialRate}%` },
      ],
      recommendations: fr
        ? [
            "Lancer une enquête qualité sur les serial numbers du site.",
            "Vérifier les doublons dans l'inventaire source XML.",
            "Prioriser la correction avant toute décision de spare.",
          ]
        : [
            "Run a quality investigation on site serial numbers.",
            "Check duplicates in the source XML inventory.",
            "Fix data quality before any spare decision.",
          ],
    };
  }

  if (objectShare >= 35) {
    return {
      label: fr ? "Pivot" : "Pivot",
      tone: "critical",
      title: fr ? "Site pivot réseau" : "Network pivot site",
      summary: fr
        ? `Ce site concentre ${objectShare}% du type ${String(row.object_type ?? "")} sur le réseau filtré.`
        : `This site concentrates ${objectShare}% of ${String(row.object_type ?? "")} across the filtered network.`,
      insights: [
        { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
        { icon: "chart", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
        { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
        { icon: "map", label: fr ? "Sites porteurs" : "Carrier sites", value: String(sitesWithType) },
      ],
      recommendations: fr
        ? [
            "Classer ce site en priorité haute pour maintenance et spares.",
            "Surveiller toute dégradation : impact réseau majeur.",
            "Documenter la dépendance opérationnelle sur ce point.",
          ]
        : [
            "Classify this site as high priority for maintenance and spares.",
            "Monitor any degradation: major network impact.",
            "Document operational dependency on this node.",
          ],
    };
  }

  if (siteShare >= 45) {
    return {
      label: fr ? "Dominant" : "Dominant",
      tone: "warning",
      title: fr ? "Type dominant sur site" : "Dominant type on site",
      summary: fr
        ? `${String(row.object_type ?? "")} représente ${siteShare}% des assets du site ${String(row.site_id ?? "")}.`
        : `${String(row.object_type ?? "")} represents ${siteShare}% of assets on site ${String(row.site_id ?? "")}.`,
      insights: [
        { icon: "chart", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
        { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
        { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
        { icon: "database", label: fr ? "Total site" : "Site total", value: String(siteTotal) },
      ],
      recommendations: fr
        ? [
            "Le profil technique du site est fortement dépendant de ce type.",
            "Planifier les upgrades en commençant par ce composant.",
            "Comparer avec la moyenne réseau pour détecter un profil atypique.",
          ]
        : [
            "Site technical profile is strongly dependent on this type.",
            "Plan upgrades starting with this component.",
            "Compare with network average to detect atypical profile.",
          ],
    };
  }

  if (objectShare >= 12) {
    return {
      label: fr ? "Fort" : "Strong",
      tone: "info",
      title: fr ? "Contribution réseau forte" : "Strong network contribution",
      summary: fr
        ? `Le site porte ${objectShare}% du parc réseau pour ce type, avec ${equipmentCount} équipements.`
        : `The site carries ${objectShare}% of network inventory for this type, with ${equipmentCount} units.`,
      insights: [
        { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
        { icon: "chart", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
        { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
        { icon: "database", label: fr ? "Total type" : "Type total", value: String(objectTotal) },
      ],
      recommendations: fr
        ? [
            "Inclure ce site dans le dimensionnement spares régional.",
            "Suivre l'évolution de la concentration lors des prochains snapshots.",
          ]
        : [
            "Include this site in regional spare dimensioning.",
            "Track concentration evolution on upcoming snapshots.",
          ],
    };
  }

  if (siteShare < 5 && objectShare < 2) {
    return {
      label: fr ? "Mineur" : "Minor",
      tone: "neutral",
      title: fr ? "Contribution marginale" : "Marginal contribution",
      summary: fr
        ? `Présence faible sur le site (${siteShare}%) et sur le réseau (${objectShare}%).`
        : `Low presence on site (${siteShare}%) and on network (${objectShare}%).`,
      insights: [
        { icon: "chart", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
        { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
        { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
      ],
      recommendations: fr
        ? ["Impact opérationnel limité.", "Surveillance standard suffisante."]
        : ["Limited operational impact.", "Standard monitoring is sufficient."],
    };
  }

  return {
    label: fr ? "Équilibré" : "Balanced",
    tone: "success",
    title: fr ? "Répartition équilibrée" : "Balanced distribution",
    summary: fr
      ? `Répartition saine entre site (${siteShare}%) et réseau (${objectShare}%).`
      : `Healthy balance between site (${siteShare}%) and network (${objectShare}%).`,
    insights: [
      { icon: "chart", label: fr ? "Part site" : "Site share", value: `${siteShare}%` },
      { icon: "target", label: fr ? "Part réseau" : "Network share", value: `${objectShare}%` },
      { icon: "layers", label: fr ? "Equipements" : "Equipment", value: String(equipmentCount) },
      { icon: "shield", label: fr ? "Unicité serial" : "Serial uniqueness", value: `${uniqueSerialRate || 100}%` },
    ],
    recommendations: fr
      ? ["Aucune action urgente.", "Conserver en surveillance passive."]
      : ["No urgent action required.", "Keep under passive monitoring."],
  };
}

export function interpretProductCodeRow(row: Record<string, unknown>, language: Lang): AssetSignal {
  const count = num(row.product_code_count);
  const fr = language === "Français";

  if (count >= 1000) {
    return {
      label: fr ? "Massif" : "Massive",
      tone: "critical",
      title: fr ? "Code produit massif" : "Massive product code",
      summary: fr
        ? `${count.toLocaleString()} équipements portent le code ${String(row.product_code ?? "")}.`
        : `${count.toLocaleString()} equipment units use code ${String(row.product_code ?? "")}.`,
      insights: [
        { icon: "layers", label: fr ? "Volume" : "Volume", value: count.toLocaleString() },
        { icon: "tag", label: "Product code", value: String(row.product_code ?? "-") },
        { icon: "cpu", label: fr ? "Type objet" : "Object type", value: String(row.object_type ?? "-") },
        { icon: "box", label: fr ? "Produit" : "Product", value: String(row.product_name ?? "-") },
      ],
      recommendations: fr
        ? [
            "Prioriser ce code dans la stratégie de spares.",
            "Analyser le cycle de vie et les risques d'obsolescence.",
            "Vérifier la cohérence d'usage sur tous les sites.",
          ]
        : [
            "Prioritize this code in spare strategy.",
            "Analyze lifecycle and obsolescence risks.",
            "Validate usage consistency across all sites.",
          ],
    };
  }

  if (count >= 100) {
    return {
      label: fr ? "Actif" : "Active",
      tone: "warning",
      title: fr ? "Code produit actif" : "Active product code",
      summary: fr
        ? `Présence significative (${count}) pour ${String(row.product_name ?? "")}.`
        : `Significant presence (${count}) for ${String(row.product_name ?? "")}.`,
      insights: [
        { icon: "layers", label: fr ? "Volume" : "Volume", value: count.toLocaleString() },
        { icon: "tag", label: "Product code", value: String(row.product_code ?? "-") },
        { icon: "cpu", label: fr ? "Type objet" : "Object type", value: String(row.object_type ?? "-") },
      ],
      recommendations: fr
        ? ["Maintenir un stock de secours adapté.", "Suivre les variations entre snapshots."]
        : ["Maintain adequate safety stock.", "Track variations across snapshots."],
    };
  }

  if (count >= 10) {
    return {
      label: fr ? "Modéré" : "Moderate",
      tone: "info",
      title: fr ? "Code produit modéré" : "Moderate product code",
      summary: fr
        ? `Usage modéré (${count}) sur le périmètre filtré.`
        : `Moderate usage (${count}) on the filtered scope.`,
      insights: [
        { icon: "layers", label: fr ? "Volume" : "Volume", value: count.toLocaleString() },
        { icon: "tag", label: "Product code", value: String(row.product_code ?? "-") },
        { icon: "box", label: fr ? "Produit" : "Product", value: String(row.product_name ?? "-") },
      ],
      recommendations: fr
        ? ["Surveillance standard.", "Comparer avec les codes dominants du même type."]
        : ["Standard monitoring.", "Compare with dominant codes in the same type."],
    };
  }

  return {
    label: fr ? "Rare" : "Rare",
    tone: "neutral",
    title: fr ? "Code produit rare" : "Rare product code",
    summary: fr
      ? `Faible volumétrie (${count}) — usage de niche ou legacy.`
      : `Low volume (${count}) — niche or legacy usage.`,
    insights: [
      { icon: "layers", label: fr ? "Volume" : "Volume", value: count.toLocaleString() },
      { icon: "tag", label: "Product code", value: String(row.product_code ?? "-") },
      { icon: "cpu", label: fr ? "Type objet" : "Object type", value: String(row.object_type ?? "-") },
    ],
    recommendations: fr
      ? ["Vérifier si le code est encore supporté.", "Évaluer le risque de fin de support."]
      : ["Check whether the code is still supported.", "Assess end-of-support risk."],
  };
}

export const signalToneClass: Record<SignalTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};
