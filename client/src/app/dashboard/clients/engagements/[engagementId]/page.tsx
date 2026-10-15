"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  FilePlus2,
  ListPlus,
  Trash2,
} from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { useClients } from "@/components/dashboard/clients-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  engagementProgress,
  engagementStatuses,
  fileKinds,
  formatEngagementMoney,
  phaseStatuses,
  suggestProjectKey,
  type ClientFile,
  type PhaseStatus,
} from "@/lib/clients"
import { formatContractMoney } from "@/lib/contracts"
import { formatDate, projectHref } from "@/lib/work-utils"
import { cn } from "cn"

export default function EngagementDetailPage() {
  const params = useParams<{ engagementId: string }>()
  const router = useRouter()
  const {
    loading,
    getEngagement,
    getClient,
    canManage,
    updateEngagementStatus,
    addFile,
    removeFile,
    addPhase,
    updatePhase,
    removePhase,
    promoteToWorkManagement,
  } = useClients()
  const { getEmployee } = useOrganization()

  const engagement = getEngagement(params.engagementId)
  const client = engagement ? getClient(engagement.clientId) : undefined
  const [fileOpen, setFileOpen] = useState(false)
  const [phaseOpen, setPhaseOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const [keyDraft, setKeyDraft] = useState("")

  if (loading) {
    return (
      <>
        <DashboardHeader title="Engagement" parent="Clients" />
        <PageLoadingState label="Loading engagement…" variant="detail" />
      </>
    )
  }

  if (!engagement || !client) {
    return (
      <>
        <DashboardHeader title="Engagement not found" parent="Clients" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground">This engagement does not exist.</p>
          <Button render={<Link href="/dashboard/clients/pipeline" />}>
            Back to pipeline
          </Button>
        </div>
      </>
    )
  }

  const promoted = engagement.status === "Promoted" && Boolean(engagement.workProjectId)

  async function report(
    result: Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string }
  ) {
    const resolved = await result
    setNotice({
      ok: resolved.ok,
      message: resolved.message ?? (resolved.ok ? "Done." : "Failed."),
    })
    return resolved
  }

  return (
    <>
      <DashboardHeader title={engagement.title} parent="Clients" />
      <div className="border-b px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href={`/dashboard/clients/${client.id}`} />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to {client.company}
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-xl border p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{client.company}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{engagement.title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {engagement.description || "No description"}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge variant={promoted ? "secondary" : "outline"}>{engagement.status}</Badge>
                <Badge variant="outline">{formatEngagementMoney(engagement.price)}</Badge>
                <Badge variant="outline">{engagementProgress(engagement)}% phases</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              {canManage && !promoted ? (
                <>
                  <OptionSelect
                    value={engagement.status}
                    options={engagementStatuses.filter((item) => item !== "Promoted")}
                    onChange={(status) => void report(updateEngagementStatus(engagement.id, status))}
                  />
                  <Button
                    onClick={() => {
                      setKeyDraft(suggestProjectKey(engagement.title))
                      setPromoteOpen(true)
                    }}
                  >
                    Promote to Work Management
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </>
              ) : null}
              {promoted && engagement.workProjectId ? (
                <Button render={<Link href={projectHref(engagement.workProjectId, "board")} />}>
                  Open {engagement.workProjectKey} board
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : null}
            </div>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Owner" value={getEmployee(engagement.ownerId)?.name ?? "—"} />
            <Info label="Start" value={formatDate(engagement.startDate)} />
            <Info label="Due" value={formatDate(engagement.dueDate)} />
            <Info label="Updated" value={formatDate(engagement.updatedAt)} />
          </dl>

          {notice ? (
            <p
              className={cn(
                "mt-4 rounded-lg border px-3 py-2 text-sm",
                notice.ok
                  ? "bg-muted/40"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              {notice.message}
            </p>
          ) : null}
        </section>

        <EngagementContracts engagementId={engagement.id} />

        <section className="rounded-xl border p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Client files</h2>
            {canManage && !promoted ? (
              <Button size="sm" variant="outline" onClick={() => setFileOpen(true)}>
                <FilePlus2 data-icon="inline-start" />
                Add file record
              </Button>
            ) : null}
          </div>
          {engagement.files.length ? (
            <ul className="space-y-2">
              {engagement.files.map((file) => (
                <li
                  key={file.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.kind} · {file.sharedBy} · {file.sizeLabel} ·{" "}
                      {formatDate(file.uploadedAt)}
                    </p>
                    {file.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{file.note}</p>
                    ) : null}
                  </div>
                  {canManage && !promoted ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove file"
                      onClick={() => report(removeFile(engagement.id, file.id))}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No client files recorded yet.</Empty>
          )}
        </section>

        <section className="rounded-xl border p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Phases</h2>
            {canManage && !promoted ? (
              <Button size="sm" variant="outline" onClick={() => setPhaseOpen(true)}>
                <ListPlus data-icon="inline-start" />
                Add phase
              </Button>
            ) : null}
          </div>
          {engagement.phases.length ? (
            <ul className="space-y-2">
              {engagement.phases.map((phase, index) => (
                <li key={phase.id} className="rounded-lg border px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="text-muted-foreground">{index + 1}.</span> {phase.name}
                      </p>
                      {phase.notes ? (
                        <p className="mt-1 text-sm text-muted-foreground">{phase.notes}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due {formatDate(phase.dueDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && !promoted ? (
                        <>
                          <OptionSelect
                            value={phase.status}
                            options={phaseStatuses}
                            onChange={(status) =>
                              report(updatePhase(engagement.id, phase.id, { status }))
                            }
                          />
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Remove phase"
                            onClick={() => report(removePhase(engagement.id, phase.id))}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline">{phase.status}</Badge>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No phases defined.</Empty>
          )}
        </section>
      </div>

      {fileOpen ? (
        <FileDialog
          onClose={() => setFileOpen(false)}
          onSave={async (input) => {
            const result = await report(addFile(engagement.id, input))
            if (result.ok) setFileOpen(false)
          }}
        />
      ) : null}

      {phaseOpen ? (
        <PhaseDialog
          onClose={() => setPhaseOpen(false)}
          onSave={async (input) => {
            const result = await report(addPhase(engagement.id, input))
            if (result.ok) setPhaseOpen(false)
          }}
        />
      ) : null}

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Promote to Work Management</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Creates a Work Management project for {client.company}, seeds tickets from
            open phases, and locks this engagement as Promoted. Employees then deliver
            inside Work Management—not from the People directory.
          </p>
          <Field label="Project key" htmlFor="key">
            <Input
              id="key"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value.toUpperCase())}
              maxLength={5}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={promoting}
              onClick={async () => {
                setPromoting(true)
                try {
                  const result = await promoteToWorkManagement(engagement.id, keyDraft)
                  await report(result)
                  if (result.ok && result.projectId) {
                    setPromoteOpen(false)
                    router.push(projectHref(result.projectId, "board"))
                  }
                } finally {
                  setPromoting(false)
                }
              }}
            >
              {promoting ? "Promoting…" : "Promote & open board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function FileDialog({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (input: Omit<ClientFile, "id" | "uploadedAt">) => void | Promise<void>
}) {
  const [form, setForm] = useState({
    name: "",
    sizeLabel: "120 KB",
    kind: "Brief" as ClientFile["kind"],
    sharedBy: "Client" as ClientFile["sharedBy"],
    note: "",
  })
  const [saving, setSaving] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add file record</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Demo records file metadata only—no external storage connection.
        </p>
        <div className="grid gap-3">
          <Field label="File name" htmlFor="fname">
            <Input
              id="fname"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="client-brief.pdf"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <OptionSelect
                value={form.kind}
                options={fileKinds}
                onChange={(kind) => setForm({ ...form, kind })}
              />
            </Field>
            <Field label="Shared by">
              <OptionSelect
                value={form.sharedBy}
                options={["Client", "Internal"] as const}
                onChange={(sharedBy) => setForm({ ...form, sharedBy })}
              />
            </Field>
          </div>
          <Field label="Size label" htmlFor="size">
            <Input
              id="size"
              value={form.sizeLabel}
              onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })}
            />
          </Field>
          <Field label="Note" htmlFor="fnote">
            <Textarea
              id="fnote"
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(form)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Saving…" : "Save file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PhaseDialog({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (input: {
    name: string
    status: PhaseStatus
    dueDate: string
    notes: string
  }) => void | Promise<void>
}) {
  const [form, setForm] = useState({
    name: "",
    status: "Not started" as PhaseStatus,
    dueDate: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add phase</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name" htmlFor="pname">
            <Input
              id="pname"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <OptionSelect
              value={form.status}
              options={phaseStatuses}
              onChange={(status) => setForm({ ...form, status })}
            />
          </Field>
          <Field label="Due date" htmlFor="pdue">
            <Input
              id="pdue"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
          <Field label="Notes" htmlFor="pnotes">
            <Textarea
              id="pnotes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(form)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? "Adding…" : "Add phase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EngagementContracts({ engagementId }: { engagementId: string }) {
  const { contractsForEngagement } = useClients()
  const contracts = contractsForEngagement(engagementId)
  return (
    <section className="rounded-xl border p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Contracts</h2>
        <Button size="sm" variant="ghost" render={<Link href="/dashboard/clients/contracts" />}>
          All contracts
        </Button>
      </div>
      {contracts.length ? (
        <ul className="space-y-2">
          {contracts.map((contract) => (
            <li
              key={contract.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm"
            >
              <div>
                <p className="font-medium">{contract.title}</p>
                <p className="text-xs text-muted-foreground">
                  {contract.model} · renews {contract.renewalDate}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium">
                  {formatContractMoney(contract.value, contract.currency)}
                </span>
                <Badge variant="outline">{contract.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No contracts linked to this engagement yet.</p>
      )}
    </section>
  )
}
