export type Document = {
  id: string;
  fileId: string | null;
  filename: string | null;
  hasFile: boolean;
  title: string;
  merchant: string;
  category: string;
  date: string;
  amount: number;
  notes: string;
  reimbursed: boolean;
  reimbursedDate: string | null;
  createdAt: string;
  ocrConfidence: number | null;
};

export type DocumentsFile = {
  version: number;
  documents: Document[];
};
