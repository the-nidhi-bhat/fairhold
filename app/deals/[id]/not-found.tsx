import Link from "next/link";

export default function DealNotFound() {
  return (
    <div className="page-frame flex min-h-[60vh] items-center justify-center py-16">
      <div className="surface max-w-lg p-8 text-center sm:p-10">
        <p className="eyebrow">404 · Deal unavailable</p>
        <h1 className="headline mt-4 text-3xl">Deal not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This deal does not exist or has been removed.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          If you followed a link, the deal may belong to another participant or
          may have been deleted in this demo workspace.
        </p>
        <Link href="/dashboard" className="primary-button mt-7">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
