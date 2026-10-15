"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, Download, FileUp, Search, Trash2 } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { documentsApi, type ApiVaultDocument } from "@/lib/auth-api"
import {
  documentCategories,
  seedDocuments,
  type DocumentCategory,
  type VaultDocument,
} from "@/lib/documents"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"

function mapDoc(row: ApiVaultDocument): VaultDocument {
  return {
    id: row.id,
    name: row.name,
    category: row.category as DocumentCategory,
    ownerName: row.ownerName,
    sizeLabel: row.sizeLabel,
    uploadedAt: row.uploadedAt,
    sharedWith: row.sharedWith,
    status: row.status as VaultDocument["status"],
    body: row.body,
    fileUrl: row.fileUrl || undefined,
    projectId: row.projectId ?? null,
  }
}

export default function DocumentsPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [docs, setDocs] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<DocumentCategory | "All">("All")
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setDocs(seedDocuments)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await documentsApi.list(activeOrgId)
      setDocs(rows.map(mapDoc))
    } catch {
      setDocs([])
      setNotice("Could not load documents.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return docs.filter((doc) => {
      if (category !== "All" && doc.category !== category) return false
      if (!q) return true
      return (
        doc.name.toLowerCase().includes(q) ||
        doc.ownerName.toLowerCase().includes(q) ||
        doc.sharedWith.toLowerCase().includes(q) ||
        doc.body.toLowerCase().includes(q)
      )
    })
  }, [docs, query, category])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${category}|${docs.length}`,
  })

  function downloadDoc(doc: VaultDocument) {
    if (doc.fileUrl) {
      const link = document.createElement("a")
      link.href = doc.fileUrl
      link.download = doc.name || "document"
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      link.remove()
      return
    }
    // Metadata-only (Cloudinary unavailable): offer body text as a downloadable file.
    const blob = new Blob([doc.body || `${doc.name}\n`], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = doc.name.replace(/\.[^.]+$/, "") + ".txt"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice("Original file wasn’t stored in Cloudinary — downloaded text record instead.")
  }

  async function handleUpload(input: {
    file?: File | null
    name: string
    category: DocumentCategory
    sharedWith: string
    body: string
  }) {
    if (useApi && activeOrgId) {
      try {
        if (input.file) {
          const form = new FormData()
          form.append("file", input.file)
          form.append("name", input.name || input.file.name)
          form.append("category", input.category)
          form.append("sharedWith", input.sharedWith)
          form.append("body", input.body)
          form.append("status", "Pending review")
          const row = await documentsApi.upload(activeOrgId, form)
          setDocs((current) => [mapDoc(row), ...current])
          setNotice(row.fileUrl ? "Document uploaded." : "Document saved (file storage unavailable).")
        } else {
          const row = await documentsApi.create(activeOrgId, {
            name: input.name,
            category: input.category,
            sharedWith: input.sharedWith,
            body: input.body,
            status: "Pending review",
            sizeLabel: "—",
          })
          setDocs((current) => [mapDoc(row), ...current])
          setNotice("Document added.")
        }
        return { ok: true as const }
      } catch (err) {
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : "Upload failed.",
        }
      }
    }

    const id = `doc-${Date.now()}`
    setDocs((current) => [
      {
        id,
        name: input.name || input.file?.name || `Upload-${new Date().toISOString().slice(0, 10)}.pdf`,
        category: input.category,
        ownerName: "You",
        sizeLabel: input.file ? `${Math.max(1, Math.round(input.file.size / 1024))} KB` : "—",
        uploadedAt: new Date().toISOString().slice(0, 10),
        sharedWith: input.sharedWith,
        status: "Pending review",
        body: input.body || "Uploaded demo document.",
      },
      ...current,
    ])
    setNotice("Document added locally (sign in to persist).")
    return { ok: true as const }
  }

  async function setStatus(id: string, status: VaultDocument["status"]) {
    setDocs((current) => current.map((doc) => (doc.id === id ? { ...doc, status } : doc)))
    if (useApi) {
      try {
        const row = await documentsApi.update(id, { status })
        setDocs((current) => current.map((doc) => (doc.id === id ? mapDoc(row) : doc)))
      } catch {
        setNotice("Could not update document.")
        void load()
      }
    }
  }

  async function removeDoc(id: string) {
    setDocs((current) => current.filter((doc) => doc.id !== id))
    if (useApi) {
      try {
        await documentsApi.remove(id)
        setNotice("Document removed.")
      } catch {
        setNotice("Could not delete document.")
        void load()
      }
    }
  }

  return (
    <>
      <DashboardHeader title="Documents" parent="Documents" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Document vault</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Policies, contracts, offers, and personal HR files in one place.
            </p>
          </div>
          <Button size="sm" onClick={() => setUploading(true)}>
            <FileUp data-icon="inline-start" />
            Upload
          </Button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
            {notice}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search documents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["All", ...documentCategories] as const).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={category === item ? "default" : "outline"}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <TablePageSkeleton rows={7} columns={6} className="border-0" />
          ) : filtered.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Shared with</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.sizeLabel}
                          {doc.projectId ? " · Project" : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.category}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.ownerName}</TableCell>
                      <TableCell className="text-muted-foreground">{doc.sharedWith}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{doc.uploadedAt}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            doc.status === "Pending review" && "text-amber-700 dark:text-amber-400",
                            doc.status === "Archived" && "text-muted-foreground"
                          )}
                        >
                          {doc.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Download"
                            title={
                              doc.fileUrl
                                ? "Download file"
                                : "File not in Cloudinary — download text record"
                            }
                            onClick={() => downloadDoc(doc)}
                          >
                            <Download />
                          </Button>
                          {doc.status !== "Archived" ? (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Archive"
                              onClick={() => void setStatus(doc.id, "Archived")}
                            >
                              <Archive />
                            </Button>
                          ) : (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Restore"
                              onClick={() => void setStatus(doc.id, "Active")}
                            >
                              Restore
                            </Button>
                          )}
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Delete"
                            onClick={() => void removeDoc(doc.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                total={pagination.total}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">No documents match.</p>
          )}
        </div>
      </div>

      {uploading ? (
        <UploadDialog
          onClose={() => setUploading(false)}
          onUpload={async (input) => {
            const result = await handleUpload(input)
            if (result.ok) setUploading(false)
            return result
          }}
        />
      ) : null}
    </>
  )
}

function UploadDialog({
  onClose,
  onUpload,
}: {
  onClose: () => void
  onUpload: (input: {
    file?: File | null
    name: string
    category: DocumentCategory
    sharedWith: string
    body: string
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<DocumentCategory>("HR")
  const [sharedWith, setSharedWith] = useState("People Ops")
  const [body, setBody] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!file && !name.trim()) return setError("Choose a file or enter a name.")
    setSaving(true)
    setError("")
    const result = await onUpload({
      file,
      name: name.trim() || file?.name || "",
      category,
      sharedWith: sharedWith.trim() || "People Ops",
      body: body.trim(),
    })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add a file to the vault. Text and tables (CSV, Excel, PDF, Word) are extracted for Company Brain; binaries use Cloudinary when configured.
          </DialogDescription>
        </DialogHeader>
        <form
          id="document-upload-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="File">
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.tsv,.xlsx,.xlsm,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null
                setFile(next)
                if (next && !name) setName(next.name)
              }}
            />
          </Field>
          <Field label="Name" htmlFor="doc-name">
            <Input id="doc-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Category">
            <OptionSelect value={category} options={documentCategories} onChange={setCategory} />
          </Field>
          <Field label="Shared with" htmlFor="doc-shared">
            <Input
              id="doc-shared"
              value={sharedWith}
              onChange={(event) => setSharedWith(event.target.value)}
              placeholder="Everyone, People Ops, …"
            />
          </Field>
          <Field label="Notes / searchable text" htmlFor="doc-body">
            <Textarea
              id="doc-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-20"
              placeholder="Optional summary for Company Brain search"
            />
          </Field>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="document-upload-form" loading={saving}>
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
