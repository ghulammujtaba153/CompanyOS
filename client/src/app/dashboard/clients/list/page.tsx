"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Plus, Search, X } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Field, KeyedSelect, OptionSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useClients } from "@/components/dashboard/clients-store"
import { useOrganization } from "@/components/dashboard/organization-store"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { clientStatuses, type Client, type ClientStatus } from "@/lib/clients"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate } from "@/lib/work-utils"
import { cn } from "cn"

const ALL = "all"

export default function ClientsListPage() {
  const router = useRouter()
  const { loading, clients, engagements, canManage, saveClient } = useClients()
  const { getEmployee } = useOrganization()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter(
      (client) =>
        (!q ||
          `${client.company} ${client.name} ${client.email} ${client.industry}`
            .toLowerCase()
            .includes(q)) &&
        (status === ALL || client.status === status)
    )
  }, [clients, query, status])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${status}`,
  })

  if (loading) {
    return (
      <>
        <DashboardHeader title="All clients" parent="Clients" />
        <PageLoadingState label="Loading clients…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="All clients" parent="Clients" />
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Company relationships and commercial engagements—before anything
              moves into Work Management.
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Add client
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, contact, industry…"
              className="pl-8"
            />
          </div>
          <KeyedSelect
            value={status}
            onChange={setStatus}
            options={[[ALL, "Any status"], ...clientStatuses.map((item) => [item, item] as const)]}
          />
        </div>

        {notice ? (
          <div
            role="status"
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
              notice.ok
                ? "bg-muted/40"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {notice.message}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border">
          {filtered.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Engagements</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((client) => {
                    const count = engagements.filter((item) => item.clientId === client.id).length
                    return (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                      >
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Link
                              href={`/dashboard/clients/${client.id}`}
                              className="font-medium hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {client.company}
                            </Link>
                            <Link
                              href={`/portal/${client.id}`}
                              className="text-[11px] text-muted-foreground hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Client portal
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.email}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {client.industry || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getEmployee(client.ownerId)?.name ?? "—"}
                        </TableCell>
                        <TableCell>{count}</TableCell>
                        <TableCell>
                          <Badge variant={client.status === "Active" ? "secondary" : "outline"}>
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(client.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
              No clients match these filters.
            </p>
          )}
        </div>
      </div>

      {dialogOpen ? (
        <ClientDialog
          onClose={(message) => {
            setDialogOpen(false)
            if (message) setNotice({ ok: true, message })
          }}
          onSave={saveClient}
        />
      ) : null}
    </>
  )
}

function ClientDialog({
  client,
  onClose,
  onSave,
}: {
  client?: Client
  onClose: (message?: string) => void
  onSave: ReturnType<typeof useClients>["saveClient"]
}) {
  const [form, setForm] = useState({
    name: client?.name ?? "",
    company: client?.company ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    website: client?.website ?? "",
    industry: client?.industry ?? "",
    status: (client?.status ?? "Prospect") as ClientStatus,
    notes: client?.notes ?? "",
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = await onSave({ ...form, id: client?.id })
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
          <DialogTitle>{client ? "Edit client" : "Add client"}</DialogTitle>
        </DialogHeader>
        <form
          id="client-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Company" htmlFor="company">
            <Input
              id="company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Primary contact" htmlFor="name">
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input
              id="website"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Input
              id="industry"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <OptionSelect
              value={form.status}
              options={clientStatuses}
              onChange={(status) => setForm({ ...form, status })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="client-form" loading={saving}>
            {saving ? "Saving…" : client ? "Save" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
