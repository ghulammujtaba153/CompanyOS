"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, Download, FileUp, Search, Trash2 } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { TablePageSkeleton } from "@/components/dashboard/page-skeletons"
import { useCurrentProject, useProjectAccess } from "@/components/dashboard/project-shell"
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

export default function ProjectDocumentsPage() {
  const project = useCurrentProject()
  const { canEdit } = useProjectAccess()
  const { isAuthenticated, activeOrgId } = useAuth()
  const useApi = Boolean(isAuthenticated && activeOrgId)
  const [docs, setDocs] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!useApi || !activeOrgId) {
      setDocs([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await documentsApi.list(activeOrgId, { projectId: project.id })
      setDocs(rows.map(mapDoc))
    } catch {
      setDocs([])
      setNotice("Could not load project documents.")
    } finally {
      setLoading(false)
    }
  }, [useApi, activeOrgId, project.id])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (doc) =>
        doc.name.toLowerCase().includes(q) ||
        doc.ownerName.toLowerCase().includes(q) ||
        doc.sharedWith.toLowerCase().includes(q) ||
        doc.body.toLowerCase().includes(q)
    )
  }, [docs, query])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${docs.length}|${project.id}`,
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
    if (!useApi || !activeOrgId) {
      return { ok: false as const, message: "Sign in to upload project documents." }
    }
    try {
      if (input.file) {
        const form = new FormData()
        form.append("file", input.file)
        form.append("name", input.name || input.file.name)
        form.append("category", input.category)
        form.append("sharedWith", input.sharedWith)
        form.append("body", input.body)
        form.append("status", "Pending review")
        form.append("projectId", project.id)
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
          projectId: project.id,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Project documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Specs, contracts, and files for {project.name}. Indexed for Company Brain when configured.
          </p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setUploading(true)}>
            <FileUp data-icon="inline-start" />
            Upload
          </Button>
        ) : null}
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search project documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading ? (
          <TablePageSkeleton rows={6} columns={5} />
        ) : filtered.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Owner</TableHead>
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
                      <p className="text-xs text-muted-foreground">{doc.sizeLabel}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.category}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.ownerName}</TableCell>
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
                          onClick={() => downloadDoc(doc)}
                        >
                          <Download />
                        </Button>
                        {canEdit ? (
                          doc.status !== "Archived" ? (
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
                          )
                        ) : null}
                        {canEdit ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Delete"
                            onClick={() => void removeDoc(doc.id)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
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
          <p className="p-10 text-center text-sm text-muted-foreground">
            No documents for this project yet.
            {canEdit ? " Upload a file to get started." : ""}
          </p>
        )}
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
  const [category, setCategory] = useState<DocumentCategory>("Project")
  const [sharedWith, setSharedWith] = useState("Project team")
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
      sharedWith: sharedWith.trim() || "Project team",
      body: body.trim(),
    })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload project document</DialogTitle>
          <DialogDescription>
            Attach a file to this project. Text and tables are extracted for Company Brain; the file also appears in the org vault.
          </DialogDescription>
        </DialogHeader>
        <form
          id="project-document-upload-form"
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
          <Field label="Name" htmlFor="proj-doc-name">
            <Input id="proj-doc-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Category">
            <OptionSelect value={category} options={documentCategories} onChange={setCategory} />
          </Field>
          <Field label="Shared with" htmlFor="proj-doc-shared">
            <Input
              id="proj-doc-shared"
              value={sharedWith}
              onChange={(event) => setSharedWith(event.target.value)}
              placeholder="Project team"
            />
          </Field>
          <Field label="Notes / searchable text" htmlFor="proj-doc-body">
            <Textarea
              id="proj-doc-body"
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
          <Button type="submit" form="project-document-upload-form" loading={saving}>
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
