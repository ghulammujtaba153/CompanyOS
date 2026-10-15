"use client"

import { useEffect, useRef, useState } from "react"
import { Building2, ImagePlus, Loader2, Trash2, X } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { Field, OptionSelect } from "@/components/dashboard/form-controls"
import { useAgency } from "@/components/dashboard/agency-store"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { agencyInitials, companySizes, industries, seedAgency, type AgencyProfile } from "@/lib/agency"
import { cn } from "@/lib/utils"

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024

export default function SettingsPage() {
  const { isAuthenticated, activeOrgId } = useAuth()
  const { agency, canEdit, saveAgency, uploadLogo, removeLogo, resetAgency } = useAgency()
  const apiReady = isAuthenticated && Boolean(activeOrgId)
  const [draft, setDraft] = useState<AgencyProfile>(agency)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dirty) setDraft(agency)
  }, [agency, dirty])

  function patch<K extends keyof AgencyProfile>(key: K, value: AgencyProfile[K]) {
    setDirty(true)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function onLogo(file: File | undefined | null) {
    if (!file || !canEdit) return
    if (!file.type.startsWith("image/")) {
      setNotice({ ok: false, message: "Upload an image file (PNG, JPG, SVG, or WebP)." })
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setNotice({ ok: false, message: "Logo must be 1.5 MB or smaller." })
      return
    }
    setUploading(true)
    setNotice(null)
    const result = await uploadLogo(file)
    setUploading(false)
    if (result.ok) {
      setDirty(false)
      setNotice({ ok: true, message: result.message ?? "Logo uploaded." })
    } else {
      setNotice({ ok: false, message: result.message })
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await saveAgency(draft)
    setSaving(false)
    setNotice(result.ok ? { ok: true, message: result.message ?? "Saved." } : result)
    if (result.ok) {
      setDirty(false)
      setDraft({ ...draft, name: draft.name.trim() })
    }
  }

  return (
    <>
      <DashboardHeader title="Settings" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight">Agency settings</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Set your software agency identity — logo (Cloudinary), name, and company details used in
              the sidebar, careers apply form, and interview experience.
            </p>
          </div>
          {canEdit ? (
            <Badge variant="outline">Owner / Admin can edit</Badge>
          ) : (
            <Badge variant="secondary">View only</Badge>
          )}
        </div>

        {notice ? (
          <div
            role="status"
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm",
              notice.ok
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {notice.message}
            <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X />
            </Button>
          </div>
        ) : null}

        <form onSubmit={save} className="grid gap-5 xl:grid-cols-[18rem_1fr]">
          <aside className="h-fit space-y-4 rounded-2xl border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Brand</p>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
                {draft.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.logoDataUrl} alt={`${draft.name} logo`} className="size-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-semibold text-muted-foreground">
                    {agencyInitials(draft.name || "AG")}
                  </span>
                )}
              </div>
              <div>
                <p className="font-medium">{draft.name || "Organization name"}</p>
                <p className="text-xs text-muted-foreground">{draft.workspaceLabel || draft.industry}</p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              disabled={!canEdit || uploading}
              onChange={(e) => void onLogo(e.target.files?.[0])}
            />
            {canEdit ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading || !apiReady}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <ImagePlus data-icon="inline-start" />
                  )}
                  {uploading ? "Uploading…" : "Upload logo"}
                </Button>
                {draft.logoDataUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={async () => {
                      setUploading(true)
                      const result = await removeLogo()
                      setUploading(false)
                      setNotice(
                        result.ok
                          ? { ok: true, message: result.message ?? "Logo removed." }
                          : { ok: false, message: result.message }
                      )
                      if (fileRef.current) fileRef.current.value = ""
                    }}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove logo
                  </Button>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  PNG, JPG, WebP, or SVG · max 1.5 MB · stored on Cloudinary
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border border-dashed px-3 py-3 text-left text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Preview</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                  {draft.logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.logoDataUrl} alt="" className="size-full object-cover" />
                  ) : (
                    agencyInitials(draft.name || "AG")
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">CompanyOS</p>
                  <p className="truncate text-[11px]">{draft.name}</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-5">
            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <h2 className="font-medium">Organization</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Organization name">
                  <Input
                    value={draft.name}
                    onChange={(e) => patch("name", e.target.value)}
                    disabled={!canEdit}
                    required
                    placeholder="Acme Labs"
                  />
                </Field>
                <Field label="Legal name">
                  <Input
                    value={draft.legalName}
                    onChange={(e) => patch("legalName", e.target.value)}
                    disabled={!canEdit}
                    placeholder="Acme Labs Pvt. Ltd."
                  />
                </Field>
                <Field label="Workspace label">
                  <Input
                    value={draft.workspaceLabel}
                    onChange={(e) => patch("workspaceLabel", e.target.value)}
                    disabled={!canEdit}
                    placeholder="Software agency"
                  />
                </Field>
                <Field label="Tagline">
                  <Input
                    value={draft.tagline}
                    onChange={(e) => patch("tagline", e.target.value)}
                    disabled={!canEdit}
                    placeholder="We design and ship software…"
                  />
                </Field>
                <Field label="Industry">
                  <OptionSelect
                    value={
                      (industries as readonly string[]).includes(draft.industry)
                        ? draft.industry
                        : "Other"
                    }
                    onChange={(value) => patch("industry", value)}
                    options={industries}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Company size">
                  <OptionSelect
                    value={
                      (companySizes as readonly string[]).includes(draft.companySize)
                        ? draft.companySize
                        : "11–50"
                    }
                    onChange={(value) => patch("companySize", value)}
                    options={companySizes}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Website">
                  <Input
                    value={draft.website}
                    onChange={(e) => patch("website", e.target.value)}
                    disabled={!canEdit}
                    placeholder="https://"
                  />
                </Field>
                <Field label="Headquarters">
                  <Input
                    value={draft.headquarters}
                    onChange={(e) => patch("headquarters", e.target.value)}
                    disabled={!canEdit}
                    placeholder="City · Country"
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="About the agency">
                  <Textarea
                    value={draft.about}
                    onChange={(e) => patch("about", e.target.value)}
                    disabled={!canEdit}
                    rows={4}
                    placeholder="What you build, who you serve, how you work…"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="mb-4 font-medium">Contact</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact email">
                  <Input
                    type="email"
                    value={draft.contactEmail}
                    onChange={(e) => patch("contactEmail", e.target.value)}
                    disabled={!canEdit}
                    placeholder="hello@agency.com"
                  />
                </Field>
                <Field label="Contact phone">
                  <Input
                    value={draft.contactPhone}
                    onChange={(e) => patch("contactPhone", e.target.value)}
                    disabled={!canEdit}
                    placeholder="+1 …"
                  />
                </Field>
              </div>
            </section>

            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={saving} disabled={!dirty}>
                  {saving ? "Saving…" : "Save agency profile"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDraft(agency)
                    setDirty(false)
                    setNotice(null)
                  }}
                  disabled={!dirty || saving}
                >
                  Discard changes
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={async () => {
                    const result = await resetAgency()
                    setDraft(result.ok ? seedAgency : agency)
                    setDirty(false)
                    setNotice(
                      result.ok
                        ? { ok: true, message: result.message ?? "Reset." }
                        : { ok: false, message: result.message }
                    )
                  }}
                >
                  Reset to defaults
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask an Owner or Admin if you need these details updated.
              </p>
            )}
          </div>
        </form>
      </div>
    </>
  )
}
