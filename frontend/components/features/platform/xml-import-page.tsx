"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ImportAiReportSection } from "@/components/reports/import-ai-report-section";
import { ImportResultsSection } from "@/components/features/platform/import-results-section";
import { useAppContext } from "@/components/providers/app-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { uploadXmlSnapshot } from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { t } from "@/lib/i18n";

const PIPELINE_STEP_KEYS = [
  "import_pipeline_validation",
  "import_pipeline_parsing",
  "import_pipeline_normalization",
  "import_pipeline_tables",
  "import_pipeline_quality",
] as const;

type PipelineStatus = "idle" | "processing" | "done" | "error";

type ProcessingSummary = {
  snapshot_date: string;
  sites_count: number;
  equipment_count: number;
  processing_seconds: number;
  xml_count: number;
};

function defaultSnapshotDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function isXmlFile(file: File) {
  if (file.name.toLowerCase().endsWith(".xml")) return true;
  const type = file.type.toLowerCase();
  return type === "text/xml" || type === "application/xml";
}

function filterXmlFiles(files: File[]) {
  return files.filter(isXmlFile);
}

export function XmlImportPage() {
  const { filters, setFilters } = useAppContext();
  const { user } = useAuth();
  const fr = filters.language === "Français";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [message, setMessage] = useState("");
  const [processingSummary, setProcessingSummary] = useState<ProcessingSummary | null>(null);

  const canImport = isAdmin(user);

  useEffect(() => {
    if (pipelineStatus !== "processing") return;
    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => (current < PIPELINE_STEP_KEYS.length - 1 ? current + 1 : current));
    }, 900);
    return () => window.clearInterval(timer);
  }, [pipelineStatus]);

  const runUpload = useCallback(
    async (files: File[]) => {
      if (!files.length || !canImport) return;
      const xmlFiles = filterXmlFiles(files);
      if (!xmlFiles.length) {
        setMessage(fr ? "Seuls les fichiers .xml sont acceptés." : "Only .xml files are accepted.");
        return;
      }

      const date = defaultSnapshotDate();

      setUploading(true);
      setPipelineStatus("processing");
      setActiveStep(0);
      setMessage("");
      setProcessingSummary(null);

      try {
        const data = await uploadXmlSnapshot(date, xmlFiles);
        const activeDate = data.processing?.snapshot_date ?? date.replace(/\./g, "-");

        if (data.processing) {
          setPipelineStatus("done");
          setActiveStep(PIPELINE_STEP_KEYS.length - 1);
          setProcessingSummary({
            snapshot_date: activeDate,
            sites_count: data.processing.sites_count,
            equipment_count: data.processing.equipment_count,
            processing_seconds: data.processing.processing_seconds,
            xml_count: data.processing.xml_count,
          });
          setFilters({
            ...filters,
            selected_dates: [activeDate],
            selected_files: [],
            selected_sites: [],
            selected_file_dates: [],
            effective_dates: [activeDate],
          });
          setMessage(
            fr
              ? `${data.uploaded_count} XML importé(s) · ${data.processing.sites_count} sites · ${data.processing.equipment_count} équipements · ${data.processing.processing_seconds}s`
              : `${data.uploaded_count} XML uploaded · ${data.processing.sites_count} sites · ${data.processing.equipment_count} equipment · ${data.processing.processing_seconds}s`,
          );
        } else if (data.processing_error) {
          setPipelineStatus("error");
          setMessage(
            fr
              ? `Import OK mais traitement échoué : ${data.processing_error}`
              : `Upload OK but processing failed: ${data.processing_error}`,
          );
        } else {
          setPipelineStatus("done");
          setActiveStep(PIPELINE_STEP_KEYS.length - 1);
          setMessage(
            fr
              ? `${data.uploaded_count} fichier(s) importé(s) pour ${data.snapshot_date}`
              : `${data.uploaded_count} file(s) uploaded for ${data.snapshot_date}`,
          );
        }
      } catch (error) {
        setPipelineStatus("error");
        setMessage(error instanceof Error ? error.message : "XML upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [canImport, filters, fr, setFilters],
  );

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = filterXmlFiles(Array.from(event.target.files ?? []));
    if (event.target.files?.length && !files.length) {
      setMessage(fr ? "Seuls les fichiers .xml sont acceptés." : "Only .xml files are accepted.");
    }
    void runUpload(files);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const files = filterXmlFiles(Array.from(event.dataTransfer.files ?? []));
    if (!files.length) {
      setMessage(fr ? "Seuls les fichiers .xml sont acceptés." : "Only .xml files are accepted.");
      return;
    }
    void runUpload(files);
  };

  if (!canImport) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        {fr
          ? "L'import XML est réservé aux administrateurs. Contactez un admin pour importer des snapshots."
          : "XML import is restricted to administrators. Contact an admin to import snapshots."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-red-100 bg-white p-5 shadow-[0_14px_40px_rgba(220,38,38,0.08)]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          multiple
          className="hidden"
          onChange={onFileInput}
        />

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragOver
              ? "border-teal-400 bg-teal-50/80"
              : "border-slate-200 bg-gradient-to-b from-slate-50/80 to-white hover:border-teal-300 hover:bg-teal-50/40"
          } ${uploading ? "pointer-events-none opacity-70" : ""}`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-100 bg-white text-slate-500 shadow-sm">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-lg font-bold text-slate-900">{t(filters.language, "import_drop_title")}</p>
          <p className="mt-2 text-sm text-slate-500">{t(filters.language, "import_drop_hint")}</p>
          <button
            type="button"
            disabled={uploading}
            className="mt-6 inline-flex h-10 items-center rounded-full bg-teal-500 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-teal-600 disabled:opacity-60"
            onClick={(event) => {
              event.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            {uploading ? t(filters.language, "import_processing") : t(filters.language, "import_select_file")}
          </button>
        </div>

        <article className="mt-5 rounded-2xl border border-red-100 bg-gradient-to-r from-red-50/40 to-white p-4">
          <p className="mb-4 text-sm font-bold text-slate-900">{t(filters.language, "import_pipeline_title")}</p>
          <ol className="space-y-3">
            {PIPELINE_STEP_KEYS.map((key, index) => {
              const done = pipelineStatus === "done" || activeStep > index;
              const active = pipelineStatus === "processing" && activeStep === index;
              const failed = pipelineStatus === "error" && activeStep >= index;
              return (
                <li key={key} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      failed
                        ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                        : done
                          ? "bg-teal-100 text-teal-800 ring-1 ring-teal-200"
                          : active
                            ? "bg-white text-teal-700 ring-2 ring-teal-400 animate-pulse shadow-sm"
                            : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                    }`}
                  >
                    {done && !failed ? "✓" : index + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      failed ? "text-red-700" : done ? "text-teal-800 font-medium" : active ? "text-slate-900 font-semibold" : "text-slate-500"
                    }`}
                  >
                    {t(filters.language, key)}
                  </span>
                  {active ? (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-teal-600">
                      {fr ? "En cours…" : "Running…"}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </article>

        {message ? (
          <p
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              pipelineStatus === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-teal-200 bg-teal-50 text-teal-900"
            }`}
          >
            {message}
          </p>
        ) : null}
      </section>

      <ImportAiReportSection
        snapshotDate={processingSummary?.snapshot_date ?? null}
        importStats={
          processingSummary
            ? {
                sites_count: processingSummary.sites_count,
                equipment_count: processingSummary.equipment_count,
                xml_count: processingSummary.xml_count,
                processing_seconds: processingSummary.processing_seconds,
              }
            : undefined
        }
      />

      {processingSummary ? (
        <ImportResultsSection snapshotDate={processingSummary.snapshot_date} processingSummary={processingSummary} />
      ) : null}
    </div>
  );
}
