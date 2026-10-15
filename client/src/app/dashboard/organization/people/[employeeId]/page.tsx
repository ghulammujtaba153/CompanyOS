"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { EmployeeProfile } from "@/components/dashboard/employee-profile"
import { PageLoadingState } from "@/components/dashboard/page-skeletons"
import { useOrganization } from "@/components/dashboard/organization-store"
import { Button } from "@/components/ui/button"

export default function EmployeeDetailPage() {
  const params = useParams<{ employeeId: string }>()
  const { loading, getEmployee } = useOrganization()
  const employee = getEmployee(params.employeeId)

  if (loading) {
    return (
      <>
        <DashboardHeader title="People" parent="Organization" />
        <PageLoadingState label="Loading person…" variant="detail" />
      </>
    )
  }

  if (!employee) {
    return (
      <>
        <DashboardHeader title="Person not found" parent="Organization" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            This person is not in the directory, or they were removed.
          </p>
          <Button render={<Link href="/dashboard/organization/people" />}>
            Back to People
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <DashboardHeader title={employee.name} parent="People" />
      <div className="border-b px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href="/dashboard/organization/people" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to People
        </Button>
      </div>
      <EmployeeProfile employee={employee} />
    </>
  )
}
