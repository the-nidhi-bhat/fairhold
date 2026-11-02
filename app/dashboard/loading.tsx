export default function DashboardLoading() {
  return (
    <div className="page-frame py-10">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-8 space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
