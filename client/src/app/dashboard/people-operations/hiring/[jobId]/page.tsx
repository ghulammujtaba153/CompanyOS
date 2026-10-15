"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Pencil } from "lucide-react"

import {
  HiringFlowStepper,
  JobDialog,
  JobPipeline,
  NoticeBar,
  type HiringNotice,
} from "@/components/dashboard/hiring-job-workspace"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { usePeopleOps } from "@/components/dashboard/people-ops-store"
import { Button } from "@/components/ui/button"
import { refreshHiringFromApi } from "@/lib/hiring-store"

export default function HiringJobDetailPage() {
  const params = useParams<{ jobId: string }>()
  const { loading, jobs, candidates, isPeopleTeam } = usePeopleOps()
  const job = jobs.find((item) => item.id === params.jobId)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<HiringNotice>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRefreshing(true)
    void refreshHiringFromApi().finally(() => {
      if (!cancelled) setRefreshing(false)
    })
    return () => {
      cancelled = true
    }
  }, [params.jobId])

  if (loading || (refreshing && !job)) {
    return (
      <>
        <DashboardHeader title="Hiring" parent="People Operations" />
        <PageLoadingState label="Loading job…" variant="detail" />
      </>
    )
  }

  if (!job) {
    return (
      <>
        <DashboardHeader title="Job not found" parent="Hiring" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">This job was removed or the link is invalid.</p>
          <Button variant="outline" render={<Link href="/dashboard/people-operations/hiring" />}>
            <ArrowLeft data-icon="inline-start" />
            Back to jobs
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <DashboardHeader title={job.title} parent="Hiring" />
      <div className="flex w-full min-w-0 max-w-full flex-1 flex-col gap-5 overflow-x-hidden p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard/people-operations/hiring"
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All jobs
          </Link>
          {isPeopleTeam ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              Edit job
            </Button>
          ) : null}
        </div>

        <HiringFlowStepper job={job} candidates={candidates} />

        {notice ? <NoticeBar notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <JobPipeline
          job={job}
          onEdit={() => setEditing(true)}
          onNotice={setNotice}
        />
      </div>

      {editing ? (
        <JobDialog
          job={job}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            setNotice({ ok: true, message: "Job updated." })
          }}
        />
      ) : null}
    </>
  )
}
