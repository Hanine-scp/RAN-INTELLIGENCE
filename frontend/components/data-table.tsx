"use client";

type DataTableProps = {
  rows: Record<string, unknown>[];
};

export function DataTable({ rows }: DataTableProps) {
  if (!rows.length) {
    return <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">No data.</p>;
  }

  const columns = Object.keys(rows[0] ?? {});

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 font-semibold text-zinc-700">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/40">
              {columns.map((column) => (
                <td key={`${idx}-${column}`} className="whitespace-nowrap px-3 py-2 text-zinc-700">
                  {String(row[column] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
