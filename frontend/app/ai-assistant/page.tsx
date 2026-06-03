"use client";

import { FormEvent, useState } from "react";
import { DataTable } from "@/components/data-table";
import { PageShell } from "@/components/page-shell";
import { askAssistant } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { t } from "@/lib/i18n";

export default function AiAssistantPage() {
  const { filters } = useAppContext();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }
    const result = await askAssistant(question);
    setAnswer(result.message);
    setRows(result.rows);
  };

  return (
    <PageShell title={t(filters.language, "page_ai_title")} subtitle="Assistant intelligent pour le reseau RAN">
      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2"
          placeholder={t(filters.language, "ask_placeholder")}
        />
        <button className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700" type="submit">
          Ask
        </button>
      </form>
      {answer ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900">{answer}</p> : null}
      <DataTable rows={rows} />
    </PageShell>
  );
}
