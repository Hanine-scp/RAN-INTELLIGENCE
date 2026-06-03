"use client";

type KpiCardsProps = {
  items: { label: string; value: string }[];
};

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <article key={item.label} className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">{item.label}</p>
          <p className="mt-2 text-2xl font-extrabold text-red-700">{item.value}</p>
        </article>
      ))}
    </section>
  );
}
