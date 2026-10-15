export type DocumentCategory = "HR" | "Contract" | "Policy" | "Personal" | "Offer" | "Project"

export type VaultDocument = {
  id: string
  name: string
  category: DocumentCategory
  ownerName: string
  sizeLabel: string
  uploadedAt: string
  sharedWith: string
  status: "Active" | "Archived" | "Pending review"
  /** Searchable text for Company Brain RAG (demo corpus). */
  body: string
  /** Optional Cloudinary / storage URL when a real file was uploaded. */
  fileUrl?: string
  /** Optional Work Management project this document belongs to. */
  projectId?: string | null
}

export const documentCategories: DocumentCategory[] = [
  "HR",
  "Contract",
  "Policy",
  "Personal",
  "Offer",
  "Project",
]

export const seedDocuments: VaultDocument[] = [
  {
    id: "doc-1",
    name: "Employee Handbook 2026.pdf",
    category: "Policy",
    ownerName: "People Ops",
    sizeLabel: "2.4 MB",
    uploadedAt: "2026-01-12",
    sharedWith: "Everyone",
    status: "Active",
    body: `Acme Labs Employee Handbook 2026. Full-time employees receive 20 days of paid annual leave (PTO) per calendar year, accruing monthly. Sick leave is 10 days per year. Parental leave is 12 weeks. Remote work is allowed up to 3 days per week with manager approval. Probation lasts 90 days. Performance reviews run twice yearly (H1/H2). Code of conduct requires respectful collaboration and client confidentiality.`,
  },
  {
    id: "doc-2",
    name: "NDA Template.docx",
    category: "Contract",
    ownerName: "Legal",
    sizeLabel: "180 KB",
    uploadedAt: "2026-03-02",
    sharedWith: "Managers+",
    status: "Active",
    body: `Mutual non-disclosure agreement template. Confidential information includes client data, source code, pricing, and roadmaps. Obligations survive 3 years after termination. Standard exceptions for public information and independently developed IP.`,
  },
  {
    id: "doc-3",
    name: "Ghulam Ahmed — Offer Letter.pdf",
    category: "Offer",
    ownerName: "People Ops",
    sizeLabel: "220 KB",
    uploadedAt: "2024-06-01",
    sharedWith: "Ghulam Ahmed",
    status: "Active",
    body: `Offer of employment to Ghulam Ahmed as Founder / Owner. Equity and compensation terms confidential. Start date June 2024.`,
  },
  {
    id: "doc-4",
    name: "PTO Policy.pdf",
    category: "Policy",
    ownerName: "People Ops",
    sizeLabel: "410 KB",
    uploadedAt: "2025-11-20",
    sharedWith: "Everyone",
    status: "Active",
    body: `Paid Time Off (PTO) policy. New hires start with 20 PTO days. After 3 years of service, PTO increases to 25 days. Leave requests require manager approval at least 5 business days in advance for trips over 3 days. Unused PTO may carry over up to 5 days into the next year. Company holidays are separate and do not deduct from PTO.`,
  },
  {
    id: "doc-5",
    name: "Northwind MSA.pdf",
    category: "Contract",
    ownerName: "Revenue",
    sizeLabel: "890 KB",
    uploadedAt: "2026-09-15",
    sharedWith: "Leadership",
    status: "Active",
    body: `Master services agreement with Northwind Retail for store ops automation. Fixed fee $48,000. Payment net-30. Includes discovery and two delivery sprints. Change orders billed time and materials. Renewal anniversary September 2027. Data processing addendum covers inventory exception data.`,
  },
  {
    id: "doc-6",
    name: "Passport scan — Ghulam.pdf",
    category: "Personal",
    ownerName: "Ghulam Ahmed",
    sizeLabel: "1.1 MB",
    uploadedAt: "2024-06-03",
    sharedWith: "People Ops",
    status: "Active",
    body: `Personal identity document on file for employment verification. Restricted to People Ops.`,
  },
  {
    id: "doc-7",
    name: "Benefits enrollment guide.pdf",
    category: "HR",
    ownerName: "People Ops",
    sizeLabel: "640 KB",
    uploadedAt: "2026-01-05",
    sharedWith: "Everyone",
    status: "Pending review",
    body: `Benefits enrollment guide. Medical, dental, and vision plans open each January. Company contributes 80% of employee medical premiums. 401(k) match up to 4%. Enrollment closes the last Friday of January. Contact People Ops for mid-year qualifying life events.`,
  },
]
