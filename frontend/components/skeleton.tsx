export function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-gradient-to-r from-red-50 via-white to-red-50 ${className}`}
      style={style}
    />
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} className="h-24 border border-red-100" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-red-100 bg-white p-3 shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
      <SkeletonBlock className="mb-3 h-8 w-full" />
      <div className="space-y-2">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, index) => (
            <SkeletonBlock key={`head-${index}`} className="h-5" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <SkeletonBlock key={`${rowIndex}-${colIndex}`} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <SkeletonBlock className="w-full border border-red-100" style={{ height }} />;
}

export function PageLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-20 w-full border border-red-100" />
      <KpiSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}
