export default function NewDealLoading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-6 py-10">
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-6 h-8 w-64 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-12 rounded bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    </div>
  );
}
