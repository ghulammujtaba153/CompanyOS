"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowRight, Plus, Search, Users } from "lucide-react"

import { JobDialog, NoticeBar, type HiringNotice } from "@/components/dashboard/hiring-job-workspace"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { KeyedSelect } from "@/components/dashboard/form-controls"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { todayIso } from "@/lib/people-ops"
import { useClientPagination } from "@/lib/use-client-pagination"
import { formatDate } from "@/lib/work-utils"
import { cn } from "@/lib/utils"

const ALL = "all"

export default function PeopleHiringListPage() {
  const router = useRouter()
  const { loading, jobs, candidates, hiredCount, isPeopleTeam } = usePeopleOps()
  const { getDepartment, getEmployee } = useOrganization()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [jobDialog, setJobDialog] = useState(false)
  const [notice, setNotice] = useState<HiringNotice>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter((job) => {
      const dept = getDepartment(job.departmentId)?.name ?? ""
      const matchQuery =
        !q || `${job.title} ${dept} ${job.location} ${job.employmentType}`.toLowerCase().includes(q)
      const matchStatus = status === ALL || job.status === status
      return matchQuery && matchStatus
    })
  }, [jobs, query, status, getDepartment])

  const pagination = useClientPagination(filtered, {
    pageSize: 10,
    resetKey: `${query}|${status}`,
  })

  if (loading) {
    return (
      <>
        <DashboardHeader title="Hiring" parent="People Operations" />
        <PageLoadingState label="Loading hiring…" />
      </>
    )
  }

  return (
    <>
      <DashboardHeader title="Hiring" parent="People Operations" />
      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Open roles and apply forms. Open a job to manage candidates through screening, AI
              interview, and technical stages.
            </p>
          </div>
          {isPeopleTeam ? (
            <Button onClick={() => setJobDialog(true)}>
              <Plus data-icon="inline-start" />
              New job
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, department, location…"
              className="pl-8"
            />
          </div>
          <KeyedSelect
            value={status}
            onChange={setStatus}
            options={[
              [ALL, "Any status"],
              ["Open", "Open"],
              ["On hold", "On hold"],
              ["Closed", "Closed"],
            ]}
          />
        </div>

        {notice ? <NoticeBar notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <div className="overflow-hidden rounded-lg border">
          {filtered.length ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Hiring manager</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead className="hidden sm:table-cell">Form</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((job) => {
                  const active = candidates.filter(
                    (c) => c.jobId === job.id && c.stage !== "Rejected" && c.stage !== "Hired"
                  ).length
                  const total = candidates.filter(
                    (c) => c.jobId === job.id && c.stage !== "Rejected"
                  ).length
                  const expired = job.hiring.applyForm.expiresAt < todayIso()
                  const href = `/dashboard/people-operations/hiring/${job.id}`

                  return (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => router.push(href)}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{job.title}</p>
                            {job.status !== "Open" ? (
                              <Badge variant="outline" className="text-[10px]">
                                {job.status}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {job.location} · {job.employmentType}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {getDepartment(job.departmentId)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {getEmployee(job.hiringManagerId)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                            <Users className="size-3" />
                            {active} active
                          </span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">
                            {hiredCount(job.id)}/{job.openings} hired
                          </span>
                          <span className="hidden text-muted-foreground sm:inline">{total} total</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs",
                            expired
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {expired
                            ? "Closed"
                            : `Closes ${formatDate(job.hiring.applyForm.expiresAt)}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open ${job.title}`}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ArrowRight className="size-3.5" />
                        </Link>
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
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              {jobs.length ? "No jobs match your filters." : "No jobs yet. Create a role to start hiring."}
            </div>
          )}
        </div>
      </div>

      {jobDialog ? (
        <JobDialog
          job={null}
          onClose={() => setJobDialog(false)}
          onSaved={(id) => {
            setJobDialog(false)
            setNotice({ ok: true, message: "Job created with apply form." })
            router.push(`/dashboard/people-operations/hiring/${id}`)
          }}
        />
      ) : null}
    </>
  )
}
