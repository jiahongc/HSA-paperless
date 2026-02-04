import AuthButton from "../components/AuthButton";

export default function Home() {
  return (
    <div className="min-h-screen bg-base">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-coral/30 blur-2xl" />
        <div className="pointer-events-none absolute top-40 left-10 h-72 w-72 rounded-full bg-sage/25 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-20 h-64 w-64 rounded-full bg-sky/25 blur-2xl" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8">
          <div className="text-lg font-semibold tracking-tight">HSA Receipts Tracker</div>
          <nav className="flex items-center gap-6 text-sm text-muted">
            <span>Dashboard</span>
            <span>Education</span>
            <AuthButton />
          </nav>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-16">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-[0.2em] text-muted">Paperless HSA receipts</p>
              <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                Effortless HSA receipt tracking without storing your files.
              </h1>
              <p className="max-w-xl text-lg text-muted">
                Upload receipts, auto-fill details with OCR, and keep everything safely inside your
                own Google Drive. The dashboard stays fast by loading a single metadata file.
              </p>
              <div className="flex flex-wrap gap-4">
                <button className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white shadow-soft">
                  Get started
                </button>
                <button className="rounded-full border border-ink/10 bg-white px-6 py-3 text-sm font-semibold text-ink">
                  View education tab
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>Reimbursements</span>
                  <span>2024 - 2026</span>
                </div>
                <div className="mt-6 h-40 rounded-2xl bg-surface p-4">
                  <div className="flex h-full items-end gap-3">
                    <div className="h-12 w-6 rounded-full bg-sage/60" />
                    <div className="h-20 w-6 rounded-full bg-sage/60" />
                    <div className="h-28 w-6 rounded-full bg-sage/60" />
                    <div className="h-10 w-6 rounded-full bg-coral/60" />
                    <div className="h-16 w-6 rounded-full bg-coral/60" />
                    <div className="h-24 w-6 rounded-full bg-coral/60" />
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-base p-3">
                    <p className="text-muted">Total</p>
                    <p className="text-lg font-semibold">$4,820</p>
                  </div>
                  <div className="rounded-2xl bg-base p-3">
                    <p className="text-muted">Reimbursed</p>
                    <p className="text-lg font-semibold">$2,940</p>
                  </div>
                  <div className="rounded-2xl bg-base p-3">
                    <p className="text-muted">Pending</p>
                    <p className="text-lg font-semibold">$1,880</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-ink/10 bg-white p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted">Recent receipts</p>
                    <p className="text-lg font-semibold">CVS Prescription</p>
                  </div>
                  <span className="rounded-full bg-sage/20 px-3 py-1 text-xs font-semibold text-ink">
                    Reimbursed
                  </span>
                </div>
                <div className="mt-4 h-28 rounded-2xl bg-surface" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
