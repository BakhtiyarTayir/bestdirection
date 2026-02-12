export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title skeleton */}
      <div className="h-8 w-48 bg-muted rounded" />

      {/* Cards grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded" style={{ width: `${80 - i * 15}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
