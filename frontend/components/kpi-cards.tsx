"use client";

type KpiCardsProps = {
  items: { label: string; value: string }[];
};

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.label}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{item.value}</p>
        </article>
      ))}
    </section>
  );
}
