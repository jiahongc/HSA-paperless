"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import AuthButton from "../components/AuthButton";
import type { Document, DocumentsFile } from "../types/documents";

const ABOUT_HSA_TOC = [
  { id: "what-is-an-hsa", label: "What is an HSA" },
  { id: "triple-tax-advantage", label: "Triple tax advantage" },
  { id: "investing", label: "Investing your HSA" },
  { id: "reimburse-later", label: "Reimburse later" },
  { id: "qualified-expenses", label: "Qualified expenses" },
  { id: "documents", label: "Documents" },
  { id: "best-practices", label: "Best practices" }
];

const CATEGORIES = [
  "Medical",
  "Dental",
  "Vision",
  "Pharmacy",
  "Lab/Test",
  "Mental Health",
  "Physical Therapy",
  "Other"
];

function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) return "$0.00";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

function sortDocuments(items: Document[]) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "";
}

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

export default function Home() {
  const { data: session, status } = useSession();
  const authError = (session as { error?: string } | null)?.error;
  const [activeTab, setActiveTab] = useState<"dashboard" | "about" | "qa">(
    "dashboard"
  );
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
  const [uploadTotal, setUploadTotal] = useState(0);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isUpdatingDocument, setIsUpdatingDocument] = useState(false);
  const [editForm, setEditForm] = useState({
    user: "",
    title: "",
    category: "",
    date: "",
    amount: "",
    notes: "",
    reimbursed: false,
    reimbursedDate: ""
  });
  const [manualForm, setManualForm] = useState({
    user: "",
    title: "",
    category: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
    reimbursed: false,
    reimbursedDate: ""
  });
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [previewZoom, setPreviewZoom] = useState(1);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    setQueuedFiles((prev) => [...prev, ...incoming]);
  };

  const loadDocuments = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/documents");
      if (response.status === 401) {
        setLoadError("Google authorization expired. Please sign out and sign in again.");
        setDocuments([]);
        return;
      }
      if (!response.ok) {
        throw new Error("No documents found.");
      }
      const data = (await response.json()) as DocumentsFile;
      setDocuments(sortDocuments(data.documents ?? []));
    } catch {
      setLoadError("No documents found.");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const handleUpload = async () => {
    if (!queuedFiles.length) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadTotal(queuedFiles.length);

    try {
      const formData = new FormData();
      queuedFiles.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      if (response.status === 401) {
        setUploadError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      const result = (await response.json()) as { entries: Document[] };
      setQueuedFiles([]);
      await loadDocuments();

      if (result.entries.length > 0) {
        openDocumentModal(result.entries[0]);
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const openManualEntry = () => {
    setManualError(null);
    setManualForm({
      user: getFirstName(session?.user?.name),
      title: "",
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
        user: manualForm.user.trim(),
        title: manualForm.title.trim() || "Untitled document",
        category: manualForm.category.trim(),
        date: manualForm.date,
        amount: parseFloat(manualForm.amount) || 0,
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
      if (response.status === 401) {
        setManualError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
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

  const openDocumentModal = (document: Document) => {
    setActionError(null);
    setPreviewZoom(1);
    setSelectedDocument(document);
    setEditForm({
      user: document.user ?? "",
      title: document.title,
      category: document.category,
      date: document.date,
      amount: String(document.amount),
      notes: document.notes,
      reimbursed: document.reimbursed,
      reimbursedDate: document.reimbursedDate ?? ""
    });
    setIsModalOpen(true);
  };

  const handleUpdateDocument = async () => {
    if (!selectedDocument) return;
    setIsUpdatingDocument(true);
    setActionError(null);

    try {
      const resolvedReimbursedDate = editForm.reimbursed
        ? editForm.reimbursedDate || new Date().toISOString().slice(0, 10)
        : null;
      const payload = {
        user: editForm.user.trim(),
        title: editForm.title.trim() || "Untitled document",
        category: editForm.category.trim(),
        date: editForm.date,
        amount: parseFloat(editForm.amount) || 0,
        notes: editForm.notes.trim(),
        reimbursed: editForm.reimbursed,
        reimbursedDate: resolvedReimbursedDate
      };

      const response = await fetch(`/api/documents/${selectedDocument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        setActionError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
      if (!response.ok) {
        throw new Error("Update failed");
      }

      const updated = (await response.json()) as Document;
      setDocuments((prev) =>
        sortDocuments(prev.map((doc) => (doc.id === updated.id ? updated : doc)))
      );
      setIsModalOpen(false);
      setSelectedDocument(null);
    } catch {
      setActionError("Update failed. Please try again.");
    } finally {
      setIsUpdatingDocument(false);
    }
  };

  const handleToggleReimbursed = async (doc: Document) => {
    setActionError(null);
    const nextReimbursed = !doc.reimbursed;
    const nextReimbursedDate = nextReimbursed
      ? doc.reimbursedDate ?? new Date().toISOString().slice(0, 10)
      : null;

    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reimbursed: nextReimbursed,
          reimbursedDate: nextReimbursedDate
        })
      });

      if (response.status === 401) {
        setActionError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
      if (!response.ok) {
        throw new Error("Update failed");
      }

      const updated = (await response.json()) as Document;
      setDocuments((prev) =>
        sortDocuments(prev.map((doc) => (doc.id === updated.id ? updated : doc)))
      );
      if (selectedDocument?.id === updated.id) {
        setSelectedDocument(updated);
        setEditForm({
          user: updated.user ?? "",
          title: updated.title,
          category: updated.category,
          date: updated.date,
          amount: String(updated.amount),
          notes: updated.notes,
          reimbursed: updated.reimbursed,
          reimbursedDate: updated.reimbursedDate ?? ""
        });
      }
    } catch {
      setActionError("Update failed. Please try again.");
    }
  };

  const handleDeleteDocument = async (doc: Document) => {
    const confirmed = window.confirm(
      `Delete "${doc.title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setActionError(null);
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: "DELETE"
      });
      if (response.status === 401) {
        setActionError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      setDocuments((prev) => prev.filter((entry) => entry.id !== doc.id));
      if (selectedDocument?.id === doc.id) {
        setIsModalOpen(false);
        setSelectedDocument(null);
      }
    } catch {
      setActionError("Delete failed. Please try again.");
    }
  };

  const handleDownloadDocument = (doc: Document) => {
    if (!doc.hasFile) return;
    const link = window.document.createElement("a");
    link.href = `/api/documents/download/${doc.id}`;
    link.download = doc.filename ?? "document";
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleExportCsv = () => {
    if (!filteredDocuments.length) return;
    const headers = [
      "User",
      "Title",
      "Category",
      "Date",
      "Amount",
      "Reimbursed",
      "Reimbursed Date",
      "Notes",
      "Has File",
      "Filename"
    ];

    const rows = filteredDocuments.map((doc) => [
      escapeCsvValue(doc.user ?? ""),
      escapeCsvValue(doc.title),
      escapeCsvValue(doc.category),
      escapeCsvValue(doc.date),
      escapeCsvValue(doc.amount),
      escapeCsvValue(doc.reimbursed ? "Yes" : "No"),
      escapeCsvValue(doc.reimbursedDate ?? ""),
      escapeCsvValue(doc.notes),
      escapeCsvValue(doc.hasFile ? "Yes" : "No"),
      escapeCsvValue(doc.filename ?? "")
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hsa-documents-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportDocuments = async () => {
    try {
      const response = await fetch("/api/documents/export");
      if (response.status === 401) {
        setActionError("Google authorization expired. Please sign out and sign in again.");
        return;
      }
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "HSA_Documents.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export documents", error);
      setActionError("Failed to export documents. Please try again.");
    }
  };

  const handleClearAllDocuments = async () => {
    const confirmed = window.confirm(
      `Delete all ${documents.length} documents? This cannot be undone.`
    );
    if (!confirmed) return;

    setActionError(null);
    try {
      // Best-effort delete Drive files first (before clearing metadata)
      const docsWithFiles = documents.filter((d) => d.hasFile && d.fileId);
      await Promise.allSettled(
        docsWithFiles.map((doc) =>
          fetch(`/api/documents/${doc.id}`, { method: "DELETE" })
        )
      );

      // Single bulk write to clear metadata
      const response = await fetch("/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, documents: [] })
      });
      if (!response.ok) {
        throw new Error("Failed to clear documents");
      }

      setDocuments([]);
      setIsModalOpen(false);
      setSelectedDocument(null);
    } catch (error) {
      console.error("Failed to clear documents", error);
      setActionError("Failed to clear all documents. Please try again.");
    }
  };

  useEffect(() => {
    if (!session) {
      setDocuments([]);
      return;
    }
    void loadDocuments();
  }, [session, loadDocuments]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModalOpen) setIsModalOpen(false);
        if (isManualOpen) setIsManualOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isManualOpen]);

  const filteredDocuments = useMemo(() => {
    let result = documents;

    if (filterYear !== "all") {
      result = result.filter((doc) => doc.date.startsWith(filterYear));
    }
    if (filterUser !== "all") {
      result = result.filter((doc) => doc.user === filterUser);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((document) => {
        return [
          document.user ?? "",
          document.title,
          document.category,
          document.notes,
          document.filename ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
    }

    return result;
  }, [documents, search, filterYear, filterUser]);

  const totals = useMemo(() => {
    const filtered = documents.filter((doc) => {
      if (filterYear !== "all" && !doc.date.startsWith(filterYear)) {
        return false;
      }
      if (filterUser !== "all" && doc.user !== filterUser) {
        return false;
      }
      return true;
    });
    const total = filtered.reduce((sum, r) => sum + r.amount, 0);
    const reimbursed = filtered
      .filter((r) => r.reimbursed)
      .reduce((sum, r) => sum + r.amount, 0);
    return {
      total,
      reimbursed,
      pending: total - reimbursed
    };
  }, [documents, filterYear, filterUser]);

  const availableUsers = useMemo(() => {
    const users = new Set<string>();
    const firstName = getFirstName(session?.user?.name);
    if (firstName) users.add(firstName);
    documents.forEach((doc) => {
      if (doc.user?.trim()) users.add(doc.user.trim());
    });
    return Array.from(users).sort();
  }, [documents, session?.user?.name]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    documents.forEach((doc) => {
      if (doc.date) {
        const year = doc.date.slice(0, 4);
        if (year) years.add(year);
      }
    });
    return Array.from(years).sort().reverse();
  }, [documents]);

  const previewUrl = useMemo(
    () => selectedDocument?.hasFile ? `/api/documents/file/${selectedDocument.id}` : "",
    [selectedDocument?.hasFile, selectedDocument?.id]
  );
  const isPreviewPdf = useMemo(
    () => selectedDocument?.filename?.toLowerCase().endsWith(".pdf") ?? false,
    [selectedDocument?.filename]
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
                activeTab === "about"
                  ? "bg-ink text-white"
                  : "text-muted"
              }`}
              onClick={() => setActiveTab("about")}
            >
              About HSA
            </button>
            <button
              className={`rounded-full px-4 py-2 ${
                activeTab === "qa"
                  ? "bg-ink text-white"
                  : "text-muted"
              }`}
              onClick={() => setActiveTab("qa")}
            >
              Q&A
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
          {authError ? (
            <div className="mb-6 rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-xs text-ink">
              Google authorization expired. Please sign out and sign in again.
            </div>
          ) : null}
          {activeTab === "dashboard" ? (
            <div className="space-y-8">
              <section className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    Spending summary
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm"
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                    >
                      <option value="all">All years</option>
                      {availableYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <select
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm"
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                    >
                      <option value="all">All users</option>
                      {availableUsers.map((user) => (
                        <option key={user} value={user}>{user}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-base p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      Total spend
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatCurrency(totals.total)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-base p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      Not reimbursed
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatCurrency(totals.pending)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-base p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      Reimbursed
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatCurrency(totals.reimbursed)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
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
                      {isUploading
                        ? `Uploading ${uploadTotal} file${uploadTotal === 1 ? "" : "s"}...`
                        : "Upload"}
                    </button>
                    <button
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                      disabled={queuedFiles.length === 0}
                      onClick={() => {
                        setQueuedFiles([]);
                        setUploadError(null);
                      }}
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
                    <div>
                      <p>Drag and drop documents here. Text recognition (OCR) will auto-fill the details.</p>
                      <p className="mt-1 text-xs text-muted/70">Accepted formats: JPG, JPEG, PNG, PDF</p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-ink">
                      <p className="text-sm font-semibold">
                        {queuedFiles.length} document{queuedFiles.length === 1 ? "" : "s"} selected
                      </p>
                      <ul className="text-xs text-muted">
                        {queuedFiles.map((file, index) => (
                          <li key={`${index}-${file.name}-${file.size}`}>{file.name}</li>
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
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </section>

              <section className="rounded-3xl bg-white/80 p-6 shadow-soft backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-2xl">Documents</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="search"
                      placeholder="Search documents"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm"
                    />
                    <button
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                      onClick={handleExportCsv}
                      disabled={filteredDocuments.length === 0}
                    >
                      Export CSV
                    </button>
                    <button
                      className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
                      onClick={handleExportDocuments}
                      disabled={documents.filter((d) => d.hasFile).length === 0}
                    >
                      Export Files
                    </button>
                    <button
                      className="rounded-full border border-coral/30 bg-white px-4 py-2 text-sm font-semibold text-coral disabled:opacity-40"
                      onClick={handleClearAllDocuments}
                      disabled={documents.length === 0}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
                  <table className="min-w-[850px] w-full text-sm">
                    <thead className="bg-base text-left text-xs uppercase tracking-[0.2em] text-muted">
                      <tr>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Reimbursed</th>
                        <th className="px-4 py-3">Actions</th>
                        <th className="px-4 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5 bg-white">
                      {isLoading ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-muted">
                            Loading documents...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-center text-muted">
                            {loadError}
                          </td>
                        </tr>
                      ) : filteredDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center">
                            <p className="text-muted">
                              {search
                                ? "No documents match your search."
                                : "No documents yet. Upload a receipt or add a manual entry to get started."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredDocuments.map((document) => (
                          <tr key={document.id} className="hover:bg-base/70">
                            <td className="px-4 py-3 font-medium">{document.title}</td>
                            <td className="px-4 py-3 text-muted">{document.user}</td>
                            <td className="px-4 py-3 text-muted">{document.category}</td>
                            <td className="px-4 py-3 text-muted">{document.date}</td>
                            <td className="px-4 py-3">
                              {formatCurrency(document.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  document.reimbursed
                                    ? "bg-sage/20 text-ink"
                                    : "bg-coral/20 text-ink"
                                }`}
                                title="Toggle reimbursed status"
                                onClick={() => handleToggleReimbursed(document)}
                                aria-pressed={document.reimbursed}
                              >
                                {document.reimbursed ? "REIMBURSED" : "NOT REIMBURSED"}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                                  onClick={() => openDocumentModal(document)}
                                >
                                  View
                                </button>
                                <button
                                  className="rounded-full border border-ink/10 px-3 py-1 text-xs disabled:opacity-40"
                                  disabled={!document.hasFile}
                                  onClick={() => handleDownloadDocument(document)}
                                >
                                  Download
                                </button>
                                <button
                                  className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                                  onClick={() => handleDeleteDocument(document)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted max-w-[200px] truncate" title={document.notes}>
                              {document.notes || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {actionError ? (
                  <p className="mt-3 text-xs text-coral">{actionError}</p>
                ) : null}
              </section>
            </div>
          ) : activeTab === "about" ? (
            <section className="rounded-3xl bg-white/80 p-8 shadow-soft backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">About HSA</p>
              <h2 className="mt-3 font-serif text-3xl">How to use your HSA confidently</h2>
              <p className="mt-4 text-muted">
                A Health Savings Account is one of the most powerful financial tools available.
                This guide explains how HSAs work, what qualifies, how reimbursements work, and why
                many people choose to reimburse later.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-base p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">2026 Individual limit</p>
                  <p className="mt-1 text-lg font-semibold text-ink">$4,400</p>
                </div>
                <div className="rounded-2xl bg-base p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">2026 Family limit</p>
                  <p className="mt-1 text-lg font-semibold text-ink">$8,750</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {ABOUT_HSA_TOC.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="rounded-full bg-base px-3 py-1 text-xs text-ink"
                  >
                    {item.label}
                  </a>
                ))}
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
                  <div className="rounded-2xl bg-base p-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink">
                      Example timeline
                    </p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
                      <li>Year 0. You pay a $1,000 medical bill out of pocket.</li>
                      <li>Year 15. Your HSA grows to $4,000.</li>
                      <li>You reimburse $1,000 tax free.</li>
                      <li>$3,000 remains invested.</li>
                    </ul>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">How reimbursements work</h3>
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>Pay a qualified expense out of pocket</li>
                    <li>Save the document</li>
                    <li>Upload and track it in your dashboard</li>
                    <li>When ready, withdraw the same amount from your HSA</li>
                    <li>Mark the document as reimbursed</li>
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
              </div>
            </section>
          ) : (
            <section className="rounded-3xl bg-white/80 p-8 shadow-soft backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Q&A</p>
              <h2 className="mt-3 font-serif text-3xl">Dashboard and common questions</h2>
              <p className="mt-4 text-muted">
                Learn about how this dashboard works, where your data is stored, and answers to
                frequently asked questions.
              </p>

              <div className="mt-8 space-y-10 text-sm text-muted">
                <section className="space-y-3">
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
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-ink">Privacy and data storage</h3>
                  <div className="rounded-2xl bg-base p-4 text-ink">
                    <p className="text-xs uppercase tracking-[0.2em]">Privacy first design</p>
                    <p className="mt-2">
                      Your documents and files stay in your own Google Drive. You retain full
                      ownership of your data.
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.2em]">Where files are stored</p>
                    <p className="mt-2 text-sm text-muted">
                      Files are stored in a hidden app data folder in your Google Drive that only
                      this app can access. The metadata file (documents.json) and uploaded files
                      are organized by month in a &quot;documents&quot; folder within this app data space.
                      This folder is not visible in your regular Drive interface but is included
                      in your Google account storage quota.
                    </p>
                  </div>
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

                <section className="flex items-center justify-center gap-2 pt-4 text-sm text-muted">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="currentColor"
                  >
                    <path d="M12 1.5C6.48 1.5 2 5.98 2 11.5c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48 0-.24-.01-.88-.01-1.73-2.78.6-3.37-1.34-3.37-1.34-.46-1.17-1.12-1.48-1.12-1.48-.91-.62.07-.6.07-.6 1.01.07 1.54 1.04 1.54 1.04.9 1.55 2.36 1.1 2.94.84.09-.65.35-1.1.64-1.35-2.22-.25-4.56-1.11-4.56-4.96 0-1.1.39-2 1.03-2.71-.1-.25-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.41.1 2.66.64.71 1.03 1.61 1.03 2.71 0 3.86-2.34 4.7-4.57 4.95.36.31.69.93.69 1.88 0 1.36-.01 2.45-.01 2.78 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 11.5C22 5.98 17.52 1.5 12 1.5z" />
                  </svg>
                  <a
                    href="https://github.com/jiahongc/HSA-paperless"
                    className="underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on GitHub
                  </a>
                </section>
              </div>
            </section>
          )}
        </main>
      </div>

      {isManualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" role="dialog" aria-modal="true">
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
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">User</p>
                <select
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-3 py-2"
                  value={
                    manualForm.user === ""
                      ? getFirstName(session?.user?.name)
                      : availableUsers.includes(manualForm.user)
                        ? manualForm.user
                        : "_custom"
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setManualForm((prev) => ({
                      ...prev,
                      user: value === "_custom" ? " " : value
                    }));
                  }}
                >
                  {availableUsers.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  <option value="_custom">Custom...</option>
                </select>
                {!availableUsers.includes(manualForm.user) && manualForm.user !== "" ? (
                  <input
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    placeholder="Enter custom user name"
                    value={manualForm.user === " " ? "" : manualForm.user}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, user: event.target.value || " " }))
                    }
                    autoFocus
                  />
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Category</p>
                <select
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-3 py-2"
                  value={
                    manualForm.category === ""
                      ? ""
                      : CATEGORIES.includes(manualForm.category)
                        ? manualForm.category
                        : "_custom"
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setManualForm((prev) => ({
                      ...prev,
                      category: value === "_custom" ? " " : value
                    }));
                  }}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="_custom">Custom...</option>
                </select>
                {!CATEGORIES.includes(manualForm.category) && manualForm.category !== "" ? (
                  <input
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    placeholder="Enter custom category"
                    value={manualForm.category === " " ? "" : manualForm.category}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, category: event.target.value || " " }))
                    }
                    autoFocus
                  />
                ) : null}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl">Document preview</h3>
              <button
                className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-6 overflow-y-auto lg:grid-cols-[1.3fr_0.7fr]">
              <div className="space-y-2">
                <div className="relative h-[36rem] overflow-auto rounded-2xl bg-surface">
                  {selectedDocument.hasFile ? (
                    isPreviewPdf ? (
                      <object
                        data={previewUrl}
                        type="application/pdf"
                        className="h-full w-full rounded-2xl"
                      >
                        <iframe
                          src={previewUrl}
                          title={selectedDocument.title}
                          className="h-full w-full rounded-2xl"
                        />
                      </object>
                    ) : (
                      <img
                        src={previewUrl}
                        alt={selectedDocument.title}
                        className="rounded-2xl"
                        style={{
                          transform: `scale(${previewZoom})`,
                          transformOrigin: "top left",
                          maxWidth: previewZoom <= 1 ? "100%" : "none"
                        }}
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">No document file attached.</div>
                  )}
                </div>
                {selectedDocument.hasFile && !isPreviewPdf ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      className="rounded-full border border-ink/10 px-3 py-1 text-xs disabled:opacity-40"
                      onClick={() => setPreviewZoom((z) => Math.max(0.25, z - 0.25))}
                      disabled={previewZoom <= 0.25}
                    >
                      −
                    </button>
                    <span className="min-w-[3rem] text-center text-xs text-muted">
                      {Math.round(previewZoom * 100)}%
                    </span>
                    <button
                      className="rounded-full border border-ink/10 px-3 py-1 text-xs disabled:opacity-40"
                      onClick={() => setPreviewZoom((z) => Math.min(4, z + 0.25))}
                      disabled={previewZoom >= 4}
                    >
                      +
                    </button>
                    <button
                      className="rounded-full border border-ink/10 px-3 py-1 text-xs"
                      onClick={() => setPreviewZoom(1)}
                    >
                      Reset
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-4 text-sm">
                {actionError ? (
                  <div className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-xs text-ink">
                    {actionError}
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">
                    Document details
                  </p>
                  {selectedDocument.ocrConfidence !== null ? (
                    <span className="rounded-full bg-sage/20 px-2 py-0.5 text-[10px] font-semibold text-ink">
                      OCR {Math.round(selectedDocument.ocrConfidence * 100)}%
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Title</p>
                  <input
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">User</p>
                  <select
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-3 py-2"
                    value={
                      editForm.user === ""
                        ? getFirstName(session?.user?.name)
                        : availableUsers.includes(editForm.user)
                          ? editForm.user
                          : "_custom"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setEditForm((prev) => ({
                        ...prev,
                        user: value === "_custom" ? " " : value
                      }));
                    }}
                  >
                    {availableUsers.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="_custom">Custom...</option>
                  </select>
                  {!availableUsers.includes(editForm.user) && editForm.user !== "" ? (
                    <input
                      className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                      placeholder="Enter custom user name"
                      value={editForm.user === " " ? "" : editForm.user}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, user: event.target.value || " " }))
                      }
                      autoFocus
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Category</p>
                  <select
                    className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-3 py-2"
                    value={
                      editForm.category === ""
                        ? ""
                        : CATEGORIES.includes(editForm.category)
                          ? editForm.category
                          : "_custom"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setEditForm((prev) => ({
                        ...prev,
                        category: value === "_custom" ? " " : value
                      }));
                    }}
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="_custom">Custom...</option>
                  </select>
                  {!CATEGORIES.includes(editForm.category) && editForm.category !== "" ? (
                    <input
                      className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                      placeholder="Enter custom category"
                      value={editForm.category === " " ? "" : editForm.category}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, category: event.target.value || " " }))
                      }
                      autoFocus
                    />
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Date</p>
                    <input
                      type="date"
                      className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                      value={editForm.date}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, date: event.target.value }))
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
                      value={editForm.amount}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, amount: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Notes</p>
                  <textarea
                    className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                    rows={3}
                    value={editForm.notes}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={editForm.reimbursed}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reimbursed: event.target.checked
                        }))
                      }
                    />
                    Reimbursed
                  </label>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">
                      Reimbursed date
                    </p>
                    <input
                      type="date"
                      className="mt-2 w-full rounded-2xl border border-ink/10 px-3 py-2"
                      value={editForm.reimbursedDate}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reimbursedDate: event.target.value
                        }))
                      }
                      disabled={!editForm.reimbursed}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    className="rounded-full border border-ink/10 px-4 py-2 text-sm"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={handleUpdateDocument}
                    disabled={isUpdatingDocument}
                  >
                    {isUpdatingDocument ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
