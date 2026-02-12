export default function CoursesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-10 w-36 bg-muted rounded" />
      </div>

      {/* Course cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-6 space-y-4">
            <div className="h-5 w-3/4 bg-muted rounded" />
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="h-4 w-20 bg-muted rounded" />
              <div className="h-4 w-16 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
