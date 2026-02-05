"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import AuthButton from "../components/AuthButton";
import type { Document, DocumentsFile } from "../types/documents";

type ChartPoint = {
  label: string;
  reimbursed: number;
  pending: number;
  total: number;
};


const EDUCATION_TOC = [
  { id: "what-is-an-hsa", label: "What is an HSA" },
  { id: "triple-tax-advantage", label: "Triple tax advantage" },
  { id: "investing", label: "Investing your HSA" },
  { id: "reimburse-later", label: "Reimburse later" },
  { id: "qualified-expenses", label: "Qualified expenses" },
  { id: "documents", label: "Documents" },
  { id: "why-dashboard", label: "Why this dashboard exists" },
  { id: "best-practices", label: "Best practices" }
];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

function getYear(date: string) {
  return date.slice(0, 4);
}

function getMonthIndex(date: string) {
  const month = Number(date.slice(5, 7));
  return Number.isNaN(month) ? 0 : Math.max(1, Math.min(12, month)) - 1;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<"dashboard" | "education">(
    "dashboard"
  );
  const [chartMode, setChartMode] = useState<"yearly" | "monthly">(
    "yearly"
  );
  const [selectedYear, setSelectedYear] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    title: "",
    merchant: "",
    category: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
    reimbursed: false,
    reimbursedDate: ""
  });

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    setQueuedFiles((prev) => [...prev, ...incoming]);
  };

  const loadDocuments = async () => {
    if (!session) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/documents");
      if (!response.ok) {
        throw new Error("No documents found.");
      }
      const data = (await response.json()) as DocumentsFile;
      const sorted = [...(data.documents ?? [])].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      setDocuments(sorted);
    } catch {
      setLoadError("No documents found.");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!queuedFiles.length) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      queuedFiles.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      setQueuedFiles([]);
      await loadDocuments();
    } catch (error) {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const openManualEntry = () => {
    setManualError(null);
    setManualForm({
      title: "",
      merchant: "",
      category: "",
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      notes: "",
      reimbursed: false,
      reimbursedDate: ""
    });
    setIsManualOpen(true);
  };

  const handleManualSave = async () => {
    setIsSavingManual(true);
    setManualError(null);
    try {
      const payload = {
        title: manualForm.title.trim() || "Untitled document",
        merchant: manualForm.merchant.trim(),
        category: manualForm.category.trim(),
        date: manualForm.date,
        amount: Number(manualForm.amount) || 0,
        notes: manualForm.notes.trim(),
        reimbursed: manualForm.reimbursed,
        reimbursedDate: manualForm.reimbursedDate || null,
        hasFile: false,
        fileId: null,
        filename: null
      };
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("Save failed");
      }
      setIsManualOpen(false);
      await loadDocuments();
    } catch {
      setManualError("Manual entry failed. Please try again.");
    } finally {
      setIsSavingManual(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setDocuments([]);
      return;
    }
    void loadDocuments();
  }, [session]);

  const filteredDocuments = useMemo(() => {
    if (!search.trim()) {
      return documents;
    }
    const query = search.toLowerCase();
    return documents.filter((document) => {
      return [
        document.title,
        document.merchant,
        document.category,
        document.notes,
        document.filename ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [documents, search]);

  const totals = useMemo(() => {
    const total = documents.reduce((sum, r) => sum + r.amount, 0);
    const reimbursed = documents
      .filter((r) => r.reimbursed)
      .reduce((sum, r) => sum + r.amount, 0);
    return {
      total,
      reimbursed,
      pending: total - reimbursed
    };
  }, [documents]);

  const years = useMemo(() => {
    const found = new Set(documents.map((document) => getYear(document.date)));
    const currentYear = String(new Date().getFullYear());
    found.add(currentYear);
    return Array.from(found).sort();
  }, [documents]);

  useEffect(() => {
    if (!years.length) return;
    if (!selectedYear || !years.includes(selectedYear)) {
      setSelectedYear(years[years.length - 1]);
    }
  }, [selectedYear, years]);

  const yearlySeries = useMemo<ChartPoint[]>(() => {
    return years.map((year) => {
      const yearDocuments = documents.filter((document) => getYear(document.date) === year);
      const reimbursed = yearDocuments
        .filter((document) => document.reimbursed)
        .reduce((sum, document) => sum + document.amount, 0);
      const total = yearDocuments.reduce((sum, document) => sum + document.amount, 0);
      return {
        label: year,
        reimbursed,
        pending: total - reimbursed,
        total
      };
    });
  }, [documents, years]);

  const monthlySeries = useMemo<ChartPoint[]>(() => {
    if (!selectedYear) return [];
    const base = MONTH_LABELS.map((label) => ({
      label,
      reimbursed: 0,
      pending: 0,
      total: 0
    }));
    documents
      .filter((document) => getYear(document.date) === selectedYear)
      .forEach((document) => {
        const monthIndex = getMonthIndex(document.date);
        const target = base[monthIndex];
        target.total += document.amount;
        if (document.reimbursed) {
          target.reimbursed += document.amount;
        } else {
          target.pending += document.amount;
        }
      });
    return base;
  }, [documents, selectedYear]);

  const activeSeries = chartMode === "yearly" ? yearlySeries : monthlySeries;
  const maxValue = Math.max(
    ...activeSeries.map((point) => point.total),
    1
  );

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-base text-ink">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6">
          <div className="rounded-3xl bg-white/80 px-6 py-4 text-sm text-muted shadow-soft">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className="min-h-screen bg-base text-ink"
        style={{ backgroundColor: "#f8f5ef", color: "#1a1a1a" }}
      >
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-coral/30 blur-2xl" />
          <div className="pointer-events-none absolute top-40 left-10 h-72 w-72 rounded-full bg-sage/25 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 right-20 h-64 w-64 rounded-full bg-sky/25 blur-2xl" />

          <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-6 px-6 pb-24 pt-16 text-center">
            <h1 className="font-serif text-5xl leading-tight tracking-tight sm:text-6xl lg:text-7xl">
              HSA Paperless
            </h1>
            <p className="max-w-xl text-sm sm:text-base" style={{ color: "#4b453f" }}>
              Save documents now and reimburse yourself anytime in the future. Organize everything in
              a clean dashboard with files stored securely in your own Google Drive.
            </p>
            <AuthButton />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-base text-ink"
      style={{ backgroundColor: "#f8f5ef", color: "#1a1a1a" }}
    >
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-0 h-80 w-80 rounded-full bg-coral/30 blur-2xl" />
        <div className="pointer-events-none absolute top-40 left-10 h-72 w-72 rounded-full bg-sage/25 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-20 h-64 w-64 rounded-full bg-sky/25 blur-2xl" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pt-8">
          <div className="text-lg font-semibold tracking-tight">HSA Paperless</div>
          <nav className="flex items-center gap-3 rounded-full bg-white/70 p-1 text-sm text-muted shadow-soft backdrop-blur">
            <button
              className={`rounded-full px-4 py-2 ${
                activeTab === "dashboard"
                  ? "bg-ink text-white"
                  : "text-muted"
              }`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`rounded-full px-4 py-2 ${
                activeTab === "education"
                  ? "bg-ink text-white"
                  : "text-muted"
              }`}
              onClick={() => setActiveTab("education")}
            >
              Education
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/70 px-4 py-2 text-sm text-muted shadow-soft backdrop-blur">
              {session.user?.name ?? "Signed in"}
            </div>
            <AuthButton />
          </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
          {activeTab === "dashboard" ? (
            <div className="space-y-8">
              <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted">
                        Upload documents
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse files
                      </button>
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white text-lg font-semibold text-ink"
                        aria-label="Manual entry"
                        title="Manual entry"
                        onClick={openManualEntry}
                      >
                        +
                      </button>
                      <button
                        className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        disabled={queuedFiles.length === 0 || isUploading}
                        onClick={handleUpload}
                      >
                        {isUploading ? "Uploading..." : "Upload"}
                      </button>
                      <button
                        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                        disabled={queuedFiles.length === 0}
                        onClick={() => setQueuedFiles([])}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div
                    className="mt-6 rounded-2xl border border-dashed border-ink/15 bg-base p-6 text-sm text-muted"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleFiles(event.dataTransfer.files);
                    }}
                  >
                    {queuedFiles.length === 0 ? (
                      "Drag and drop documents or PDFs here. Text recognition (OCR) will auto-fill the details."
                    ) : (
                      <div className="space-y-2 text-ink">
                        <p className="text-sm font-semibold">
                          {queuedFiles.length} document{queuedFiles.length === 1 ? "" : "s"} selected
                        </p>
                        <ul className="text-xs text-muted">
                          {queuedFiles.map((file) => (
                            <li key={`${file.name}-${file.size}`}>{file.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {uploadError ? (
                    <p className="mt-3 text-xs text-coral">{uploadError}</p>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(event) => handleFiles(event.target.files)}
                  />
                </div>

                <div className="grid gap-4">
                  <div className="rounded-3xl bg-white/80 p-5 shadow-soft">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      Total spend
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatCurrency(totals.total)}
                    </p>
                    <p className="mt-2 text-sm text-muted">Across all documents</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-3xl bg-white/80 p-5 shadow-soft">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted">
                        Reimbursed
                      </p>
                      <p className="mt-3 text-2xl font-semibold">
                        {formatCurrency(totals.reimbursed)}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-white/80 p-5 shadow-soft">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted">
                        Paid out of pocket
                      </p>
                      <p className="mt-3 text-2xl font-semibold">
                        {formatCurrency(totals.pending)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-2xl">Spend Dashboard</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex rounded-full bg-base p-1 text-sm">
                      <button
                        className={`rounded-full px-4 py-2 ${
                          chartMode === "yearly" ? "bg-ink text-white" : "text-muted"
                        }`}
                        onClick={() => setChartMode("yearly")}
                      >
                        Yearly
                      </button>
                      <button
                        className={`rounded-full px-4 py-2 ${
                          chartMode === "monthly" ? "bg-ink text-white" : "text-muted"
                        }`}
                        onClick={() => setChartMode("monthly")}
                      >
                        Monthly
                      </button>
                    </div>
                    {chartMode === "monthly" ? (
                      <select
                        className="rounded-full border border-ink/10 bg-white px-3 py-2 text-sm"
                        value={selectedYear}
                        onChange={(event) => setSelectedYear(event.target.value)}
                      >
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
                <div className="mt-6">
                  <div className="h-52 rounded-2xl bg-surface p-4">
                    <div className="flex h-full items-end gap-3">
                      {activeSeries.map((point) => (
                        <div
                          key={point.label}
                          className="flex h-full flex-1 flex-col justify-end gap-2"
                        >
                          <div
                            className="rounded-2xl bg-sage/60"
                            style={{ height: `${(point.reimbursed / maxValue) * 100}%` }}
                          />
                          <div
                            className="rounded-2xl bg-coral/70"
                            style={{ height: `${(point.pending / maxValue) * 100}%` }}
                          />
                          <p className="pt-2 text-center text-xs text-muted">{point.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Documents</p>
                    <h3 className="mt-2 font-serif text-2xl">All documents</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="search"
                      placeholder="Search documents"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm"
                    />
                    <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-2xl border border-ink/10">
                  <table className="min-w-full text-sm">
                    <thead className="bg-base text-left text-xs uppercase tracking-[0.2em] text-muted">
                      <tr>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Merchant</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Reimbursed</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5 bg-white">
                      {isLoading ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-muted">
                            Loading documents...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-muted">
                            {loadError}
                          </td>
                        </tr>
                      ) : filteredDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-muted">
                            No documents found.
                          </td>
                        </tr>
                      ) : (
                        filteredDocuments.map((document) => (
                          <tr key={document.id} className="hover:bg-base/70">
                            <td className="px-4 py-3 font-medium">{document.title}</td>
                            <td className="px-4 py-3 text-muted">{document.merchant}</td>
                            <td className="px-4 py-3 text-muted">{document.category}</td>
                            <td className="px-4 py-3 text-muted">{document.date}</td>
                            <td className="px-4 py-3">
                              {formatCurrency(document.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  document.reimbursed
                                    ? "bg-sage/20 text-ink"
                                    : "bg-coral/20 text-ink"
                                }`}
                              >
                                {document.reimbursed ? "Reimbursed" : "Paid out of pocket"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                                  onClick={() => {
                                    setSelectedDocument(document);
                                    setIsModalOpen(true);
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  className="rounded-full border border-ink/10 px-3 py-1 text-xs disabled:opacity-40"
                                  disabled={!document.hasFile}
                                >
                                  Download
                                </button>
                                <button className="rounded-full border border-ink/10 px-3 py-1 text-xs">
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            <section className="rounded-3xl bg-white/80 p-8 shadow-soft backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">HSA Education</p>
              <h2 className="mt-3 font-serif text-3xl">How to use your HSA confidently</h2>
              <p className="mt-4 text-muted">
                A Health Savings Account is one of the most powerful financial tools available.
                This guide explains how HSAs work, what qualifies, how reimbursements work, and why
                many people choose to reimburse later.
              </p>

              <div className="mt-6 rounded-2xl bg-base p-5 text-sm text-muted">
                <p className="text-xs uppercase tracking-[0.2em] text-ink">At a glance</p>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  <li>
                    Who this is for. HSA power users, people paying out of pocket, and FIRE and tax
                    optimization minded users.
                  </li>
                  <li>
                    Main benefit. Keep HSA funds invested while tracking proof for reimburse later
                    decisions.
                  </li>
                  <li>
                    What this dashboard does. Track documents, show unreimbursed totals, and support
                    the reimburse later strategy with files stored in your own Google Drive.
                  </li>
                </ul>
              </div>

              <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 text-sm text-muted">
                <p className="text-xs uppercase tracking-[0.2em] text-ink">
                  2026 contribution limits
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-base px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Individual</p>
                    <p className="mt-1 text-lg font-semibold text-ink">$4,400</p>
                  </div>
                  <div className="rounded-2xl bg-base px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Couple or family</p>
                    <p className="mt-1 text-lg font-semibold text-ink">$8,750</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl bg-white p-4 text-sm text-muted">
                <p className="text-xs uppercase tracking-[0.2em] text-ink">Jump to</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {EDUCATION_TOC.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="rounded-full border border-ink/10 bg-base px-4 py-1 text-xs text-ink"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-8 space-y-10 text-sm text-muted">
                <section id="what-is-an-hsa" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">What is an HSA</h3>
                  <p>
                    A Health Savings Account lets you save and invest pre tax dollars for qualified
                    medical expenses. Unlike a Flexible Spending Account, your HSA balance rolls
                    over every year and stays with you for life.
                  </p>
                  <p>You own the account, not your employer.</p>
                </section>

                <section id="triple-tax-advantage" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">The triple tax advantage</h3>
                  <p>HSAs are the only account with three tax benefits.</p>
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      Contributions are tax deductible. Money goes in pre tax or is deductible if
                      contributed directly.
                    </li>
                    <li>
                      Growth is tax free. Interest, dividends, and investment gains are never
                      taxed.
                    </li>
                    <li>
                      Withdrawals are tax free as long as they are used for qualified medical
                      expenses.
                    </li>
                  </ol>
                  <div className="rounded-2xl bg-base p-4 text-sm text-ink">
                    Used correctly, an HSA can function like a tax free medical Roth IRA.
                  </div>
                </section>

                <section id="investing" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Investing your HSA</h3>
                  <p>
                    Once your HSA balance reaches your provider minimum, often about $1,000 to
                    $2,000, you can invest it.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Broad market index funds</li>
                    <li>Target date funds</li>
                    <li>Bond funds</li>
                    <li>Cash or money market funds</li>
                  </ul>
                  <p>
                    Example allocation. 80 percent broad market index funds and 20 percent bonds.
                    This is not personal advice.
                  </p>
                  <p>
                    Many long term users invest aggressively and avoid withdrawing for years. Your
                    HSA can remain invested even while you pay medical bills out of pocket.
                  </p>
                </section>

                <section id="reimburse-later" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">
                    Paying out of pocket vs reimbursing
                  </h3>
                  <p>You have two ways to use your HSA.</p>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Option 1. Pay with your HSA now
                      </p>
                      <ul className="mt-2 list-disc space-y-2 pl-5">
                        <li>Immediate tax free withdrawal</li>
                        <li>Slower long term growth</li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Option 2. Pay out of pocket and reimburse later
                      </p>
                      <ul className="mt-2 list-disc space-y-2 pl-5">
                        <li>Your HSA stays invested</li>
                        <li>Money compounds tax free</li>
                        <li>You can reimburse yourself any time in the future</li>
                      </ul>
                    </div>
                  </div>
                  <p>
                    There is no time limit on reimbursements as long as the expense occurred after
                    your HSA was opened and you have proof such as a document.
                  </p>
                  <div className="rounded-2xl bg-base p-4 text-ink">
                    This dashboard is built specifically to make this strategy easy to execute and
                    audit proof.
                  </div>
                  <p>
                    Delaying reimbursement allows your HSA to function as a long term investment
                    account.
                  </p>
                  <div className="rounded-2xl bg-white p-4 text-sm text-muted">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink">
                      Example timeline
                    </p>
                    <ul className="mt-3 list-disc space-y-2 pl-5">
                      <li>Year 0. You pay a $1,000 medical bill out of pocket.</li>
                      <li>Year 15. Your HSA grows to $4,000.</li>
                      <li>You reimburse $1,000 tax free.</li>
                      <li>$3,000 remains invested.</li>
                    </ul>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">How reimbursements work</h3>
                  <ol className="space-y-3 text-sm">
                    <li className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">1. Pay a qualified expense out of pocket</p>
                    </li>
                    <li className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">2. Save the document</p>
                    </li>
                    <li className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">
                        3. Upload and track it in your dashboard
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        This is where HSA Paperless helps. Upload, tag, and store securely in Drive.
                      </p>
                    </li>
                    <li className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">
                        4. When ready, withdraw the same amount from your HSA
                      </p>
                    </li>
                    <li className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">5. Mark the document as reimbursed</p>
                    </li>
                  </ol>
                  <p>You can reimburse next month, next year, or decades later.</p>
                </section>

                <section id="qualified-expenses" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">
                    What counts as a qualified expense
                  </h3>
                  <p>
                    Qualified expenses generally include medical care that diagnoses, treats, or
                    prevents illness.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Doctor visits and copays</li>
                    <li>Prescriptions</li>
                    <li>Dental care</li>
                    <li>Vision exams, glasses, contacts</li>
                    <li>Mental health services</li>
                    <li>Physical therapy</li>
                    <li>Medical equipment</li>
                    <li>Eligible OTC items with current IRS rules</li>
                  </ul>
                  <p>Expenses must be medically necessary and not reimbursed elsewhere.</p>
                  <p className="mt-4 font-semibold text-ink">What does not qualify</p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Cosmetic procedures unless medically necessary</li>
                    <li>Gym memberships with limited exceptions</li>
                    <li>General wellness products</li>
                    <li>Insurance premiums with specific exceptions</li>
                  </ul>
                  <p>
                    Using HSA funds for not qualified expenses may trigger taxes and penalties.
                  </p>
                </section>

                <section id="documents" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Document requirements</h3>
                  <p>
                    The IRS does not require you to submit documents unless audited, but you must
                    keep them.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Merchant name</li>
                    <li>Date of service</li>
                    <li>Amount paid</li>
                    <li>Description of the item or service</li>
                  </ul>
                  <p>Digital copies are acceptable.</p>
                  <div className="rounded-2xl bg-base p-4 text-sm text-muted">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink">
                      Good document example
                    </p>
                    <p className="mt-2">
                      CVS Pharmacy. 02 04 2026. Prescription copay. $24.17.
                    </p>
                    <p className="mt-4 text-xs uppercase tracking-[0.2em] text-ink">
                      Bad document example
                    </p>
                    <p className="mt-2">
                      Card statement with no item description or service date.
                    </p>
                  </div>
                </section>

                <section id="why-dashboard" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Why this dashboard exists</h3>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Track expenses as you spend</li>
                    <li>Store documents digitally</li>
                    <li>Mark reimbursements when they clear</li>
                    <li>Export totals for tax time</li>
                    <li>Stay organized for audits</li>
                    <li>Know exactly how much you can reimburse tax free at any time</li>
                    <li>See your unreimbursed balance in one place</li>
                  </ul>
                  <div className="rounded-2xl bg-base p-4 text-ink">
                    <p className="text-xs uppercase tracking-[0.2em]">Privacy first design</p>
                    <p className="mt-2">
                      Your documents and files stay in your own Google Drive. You retain full
                      ownership of your data.
                    </p>
                  </div>
                </section>

                <section id="best-practices" className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Best practices</h3>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Pay medical expenses out of pocket when possible</li>
                    <li>Upload documents immediately</li>
                    <li>Invest your HSA for long term growth</li>
                    <li>Reimburse strategically, not impulsively</li>
                    <li>Keep records indefinitely</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Common questions</h3>
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">
                        Can I reimburse a bill from years ago
                      </p>
                      <p className="mt-2 text-sm text-muted">
                        Yes, if the expense happened after your HSA was opened and you kept the
                        document. There is no time limit.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">
                        What if I change HSA providers or jobs
                      </p>
                      <p className="mt-2 text-sm text-muted">
                        The HSA is yours, not your employer. Your documents stay in your own Google
                        Drive, so nothing is lost.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-base p-4">
                      <p className="font-semibold text-ink">
                        What if I accidentally use HSA funds on something not qualified
                      </p>
                      <p className="mt-2 text-sm text-muted">
                        That amount can be subject to income tax and an additional penalty. Keep
                        clean records and reimburse correctly.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl bg-ink p-5 text-center text-sm text-white">
                  Connect your Google Drive to start tracking documents in under 2 minutes.
                </section>
              </div>
            </section>
          )}
        </main>
      </div>

      {isManualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl">Manual entry</h3>
              <button
                className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                onClick={() => setIsManualOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 text-sm">
              {manualError ? (
                <div className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-xs text-ink">
                  {manualError}
                </div>
              ) : null}
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Title</p>
                <input
                  className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                  value={manualForm.title}
                  onChange={(event) =>
                    setManualForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Merchant</p>
                  <input
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={manualForm.merchant}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, merchant: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Category</p>
                  <input
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={manualForm.category}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Date</p>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={manualForm.date}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, date: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Amount</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={manualForm.amount}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Notes</p>
                <textarea
                  className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                  rows={3}
                  value={manualForm.notes}
                  onChange={(event) =>
                    setManualForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={manualForm.reimbursed}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, reimbursed: event.target.checked }))
                    }
                  />
                  Reimbursed
                </label>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Reimbursed date</p>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={manualForm.reimbursedDate}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, reimbursedDate: event.target.value }))
                    }
                    disabled={!manualForm.reimbursed}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="rounded-full border border-ink/10 px-4 py-2 text-sm"
                  onClick={() => setIsManualOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  onClick={handleManualSave}
                  disabled={isSavingManual}
                >
                  {isSavingManual ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen && selectedDocument ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl">Document preview</h3>
              <button
                className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="h-64 rounded-2xl bg-surface" />
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Title</p>
                  <p className="mt-1 font-semibold">{selectedDocument.title}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Merchant</p>
                  <p className="mt-1">{selectedDocument.merchant}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Amount</p>
                  <p className="mt-1">{formatCurrency(selectedDocument.amount)}</p>
                </div>
                <button
                  className="mt-4 w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  disabled={!selectedDocument.hasFile}
                >
                  Download document
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink shadow-soft">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 text-ink"
          fill="currentColor"
        >
          <path d="M12 1.5C6.48 1.5 2 5.98 2 11.5c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48 0-.24-.01-.88-.01-1.73-2.78.6-3.37-1.34-3.37-1.34-.46-1.17-1.12-1.48-1.12-1.48-.91-.62.07-.6.07-.6 1.01.07 1.54 1.04 1.54 1.04.9 1.55 2.36 1.1 2.94.84.09-.65.35-1.1.64-1.35-2.22-.25-4.56-1.11-4.56-4.96 0-1.1.39-2 1.03-2.71-.1-.25-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.41.1 2.66.64.71 1.03 1.61 1.03 2.71 0 3.86-2.34 4.7-4.57 4.95.36.31.69.93.69 1.88 0 1.36-.01 2.45-.01 2.78 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 11.5C22 5.98 17.52 1.5 12 1.5z" />
        </svg>
        <a
          href="https://github.com/jiahongc/HSA-paperless"
          className="text-ink underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          jiahongc
        </a>
      </div>
    </div>
  );
}
