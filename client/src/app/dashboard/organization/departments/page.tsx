import { redirect } from "next/navigation"

/** Departments are managed together with their sidebar access. */
export default function OrganizationDepartmentsPage() {
  redirect("/dashboard/organization/access")
}
