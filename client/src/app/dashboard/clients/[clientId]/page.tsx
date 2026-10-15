"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Plus } from "lucide-react"

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
  formatEngagementMoney,
  type EngagementStatus,
} from "@/lib/clients"
import { formatDate } from "@/lib/work-utils"
import { projectHref } from "@/lib/work-utils"

export default function ClientDetailPage() {
  const params = useParams<{ clientId: string }>()
  const router = useRouter()
  const { loading, getClient, engagementsForClient, canManage, saveEngagement } = useClients()
  const { getEmployee } = useOrganization()
  const client = getClient(params.clientId)
  const engagements = client ? engagementsForClient(client.id) : []
  const [createOpen, setCreateOpen] = useState(false)

  if (loading) {
    return (
      <>
        <DashboardHeader title="Client" parent="Clients" />
        <PageLoadingState label="Loading client…" variant="detail" />
      </>
    )
  }

  if (!client) {
    return (
      <>
        <DashboardHeader title="Client not found" parent="Clients" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground">This client does not exist.</p>
          <Button render={<Link href="/dashboard/clients/list" />}>Back to clients</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <DashboardHeader title={client.company} parent="Clients" />
      <div className="border-b px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href="/dashboard/clients/list" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to clients
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-xl border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{client.company}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {client.name} · {client.email}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary">{client.status}</Badge>
                {client.industry ? <Badge variant="outline">{client.industry}</Badge> : null}
              </div>
            </div>
            {canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus data-icon="inline-start" />
                New engagement
              </Button>
            ) : null}
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Phone" value={client.phone || "—"} />
            <Info label="Website" value={client.website || "—"} />
            <Info label="Owner" value={getEmployee(client.ownerId)?.name ?? "—"} />
            <Info label="Added" value={formatDate(client.createdAt)} />
          </dl>
          {client.notes ? (
            <p className="mt-4 text-sm text-muted-foreground">{client.notes}</p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Engagements</h2>
          {engagements.length ? (
            <ul className="grid gap-3">
              {engagements.map((engagement) => (
                <li key={engagement.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                    onClick={() =>
                      router.push(`/dashboard/clients/engagements/${engagement.id}`)
                    }
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{engagement.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {engagement.description || "No description"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatEngagementMoney(engagement.price)} · Due{" "}
                        {formatDate(engagement.dueDate)} · {engagementProgress(engagement)}%
                        phases done
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          engagement.status === "Promoted" ? "secondary" : "outline"
                        }
                      >
                        {engagement.status}
                      </Badge>
                      {engagement.workProjectId ? (
                        <Link
                          href={projectHref(engagement.workProjectId)}
                          className="text-xs font-medium underline-offset-2 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Open {engagement.workProjectKey}
                        </Link>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No engagements yet. Create one to track price, client files, and phases
              before promoting into Work Management.
            </p>
          )}
        </section>
      </div>

      {createOpen ? (
        <EngagementDialog
          clientId={client.id}
          onClose={() => setCreateOpen(false)}
          onSave={saveEngagement}
          onCreated={(id) => router.push(`/dashboard/clients/engagements/${id}`)}
        />
      ) : null}
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

function EngagementDialog({
  clientId,
  onClose,
  onSave,
  onCreated,
}: {
  clientId: string
  onClose: () => void
  onSave: ReturnType<typeof useClients>["saveEngagement"]
  onCreated: (id: string) => void
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "0",
    status: "Draft" as EngagementStatus,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError("")
    try {
      const result = await onSave({
        clientId,
        title: form.title,
        description: form.description,
        price: Number(form.price),
        status: form.status,
        startDate: form.startDate,
        dueDate: form.dueDate,
      })
      if (!result.ok) return setError(result.message)
      if (result.id) onCreated(result.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New client engagement</DialogTitle>
        </DialogHeader>
        <form
          id="engagement-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Store ops automation"
              autoFocus
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (USD)" htmlFor="price">
              <Input
                id="price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <OptionSelect
                value={form.status}
                options={engagementStatuses.filter((item) => item !== "Promoted")}
                onChange={(status) => setForm({ ...form, status })}
              />
            </Field>
            <Field label="Start date" htmlFor="start">
              <Input
                id="start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field label="Due date" htmlFor="due">
              <Input
                id="due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="engagement-form" loading={saving}>
            {saving ? "Creating…" : "Create engagement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
