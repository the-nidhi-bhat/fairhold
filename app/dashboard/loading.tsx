export default function DashboardLoading() {
  return (
    <div className="page-frame py-10">
      <div className="h-8 w-40 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-8 space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}
