"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useClients } from "@/components/dashboard/clients-store"
import { TablePagination } from "@/components/dashboard/table-pagination"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  contractModels,
  contractStatuses,
  formatContractMoney,
  type ClientContract,
  type ContractModel,
  type ContractStatus,
} from "@/lib/contracts"
import { useClientPagination } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"

export default function ContractsPage() {
  const { loading, contracts, canManage, saveContract, removeContract } = useClients()
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; contract: ClientContract } | null>(
    null
  )
  const [removing, setRemoving] = useState<ClientContract | null>(null)
  const [removingBusy, setRemovingBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  const pagination = useClientPagination(contracts, { pageSize: 10, resetKey: contracts.length })

  const stats = useMemo(
    () => [
      { label: "Active", value: contracts.filter((c) => c.status === "Active").length },
      { label: "Renewal due", value: contracts.filter((c) => c.status === "Renewal due").length },
      { label: "Draft", value: contracts.filter((c) => c.status === "Draft").length },
    ],
    [contracts]
  )

  if (loading) {
    return (
      <>
        <DashboardHeader title="Contracts" parent="Clients" />
        <PageLoadingState label="Loading contracts…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Contracts" parent="Clients" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Retainer and fee terms tied to client engagements.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" render={<Link href="/dashboard/clients/pipeline" />}>
              Open pipeline
            </Button>
            {canManage ? (
              <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
                <Plus data-icon="inline-start" />
                New contract
              </Button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <p className={cn("text-sm", notice.ok ? "text-muted-foreground" : "text-destructive")}>
            {notice.message}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {pagination.total ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="w-24" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/clients/engagements/${contract.engagementId}`}
                          className="font-medium hover:underline"
                        >
                          {contract.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{contract.id.slice(0, 8)}</p>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/clients/${contract.clientId}`}
                          className="hover:underline"
                        >
                          {contract.clientName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{contract.model}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatContractMoney(contract.value, contract.currency)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {contract.renewalDate || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            contract.status === "Renewal due" &&
                              "border-amber-500/30 text-amber-700 dark:text-amber-400",
                            contract.status === "Active" &&
                              "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {contract.status}
                        </Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Edit ${contract.title}`}
                              onClick={() => setDialog({ mode: "edit", contract })}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Delete ${contract.title}`}
                              onClick={() => setRemoving(contract)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
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
              No contracts yet.{canManage ? " Create one to track retainer and fee terms." : ""}
            </p>
          )}
        </div>
      </div>

      {dialog ? (
        <ContractDialog
          contract={dialog.mode === "edit" ? dialog.contract : undefined}
          onClose={(message) => {
            setDialog(null)
            if (message) setNotice({ ok: true, message })
          }}
          onSave={saveContract}
        />
      ) : null}

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delete {removing?.title}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the contract record permanently.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removingBusy}
              onClick={async () => {
                if (!removing) return
                setRemovingBusy(true)
                try {
                  const result = await removeContract(removing.id)
                  setNotice({ ok: result.ok, message: result.message ?? (result.ok ? "Removed." : "Failed.") })
                  setRemoving(null)
                } finally {
                  setRemovingBusy(false)
                }
              }}
            >
              {removingBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContractDialog({
  contract,
  onClose,
  onSave,
}: {
  contract?: ClientContract
  onClose: (message?: string) => void
  onSave: ReturnType<typeof useClients>["saveContract"]
}) {
  const { clients, engagements } = useClients()
  const [clientId, setClientId] = useState(contract?.clientId ?? clients[0]?.id ?? "")
  const clientEngagements = engagements.filter((item) => item.clientId === clientId)
  const [form, setForm] = useState({
    engagementId: contract?.engagementId ?? clientEngagements[0]?.id ?? "",
    title: contract?.title ?? "",
    model: (contract?.model ?? "Fixed fee") as ContractModel,
    value: String(contract?.value ?? 0),
    startDate: contract?.startDate ?? new Date().toISOString().slice(0, 10),
    renewalDate: contract?.renewalDate ?? "",
    status: (contract?.status ?? "Draft") as ContractStatus,
    notes: contract?.notes ?? "",
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const engagementOptions = engagements.filter((item) => item.clientId === clientId)

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = await onSave({
        id: contract?.id,
        clientId,
        engagementId: form.engagementId,
        title: form.title,
        model: form.model,
        value: Number(form.value),
        startDate: form.startDate,
        renewalDate: form.renewalDate,
        status: form.status,
        notes: form.notes,
      })
      if (!result.ok) return setError(result.message)
      onClose(result.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contract ? "Edit contract" : "New contract"}</DialogTitle>
        </DialogHeader>
        <form
          id="contract-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Client">
            <KeyedSelect
              className="w-full"
              value={clientId}
              onChange={(value) => {
                setClientId(value)
                const nextEngagements = engagements.filter((item) => item.clientId === value)
                setForm((current) => ({
                  ...current,
                  engagementId: nextEngagements[0]?.id ?? "",
                }))
              }}
              options={clients.map((item) => [item.id, item.company] as const)}
              disabled={Boolean(contract)}
            />
          </Field>
          <Field label="Engagement">
            <KeyedSelect
              className="w-full"
              value={form.engagementId}
              onChange={(value) => setForm({ ...form, engagementId: value })}
              options={
                engagementOptions.length
                  ? engagementOptions.map((item) => [item.id, item.title] as const)
                  : ([["", "No engagements"]] as const)
              }
            />
          </Field>
          <Field label="Title" htmlFor="ctr-title">
            <Input
              id="ctr-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Model">
            <OptionSelect
              value={form.model}
              options={contractModels}
              onChange={(value) => setForm({ ...form, model: value })}
            />
          </Field>
          <Field label="Value (USD)" htmlFor="ctr-value">
            <Input
              id="ctr-value"
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <OptionSelect
              value={form.status}
              options={contractStatuses}
              onChange={(value) => setForm({ ...form, status: value })}
            />
          </Field>
          <Field label="Start date" htmlFor="ctr-start">
            <Input
              id="ctr-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="Renewal date" htmlFor="ctr-renewal">
            <Input
              id="ctr-renewal"
              type="date"
              value={form.renewalDate}
              onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="ctr-notes">
              <Textarea
                id="ctr-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </Field>
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="contract-form" loading={saving} disabled={!clientId || !form.engagementId}>
            {saving ? "Saving…" : contract ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
