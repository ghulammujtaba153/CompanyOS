import { redirect } from "next/navigation"

/** Old sub-page; integrations now live on one page with tabs. */
export default function IntegrationsTabRedirect() {
  redirect("/dashboard/integrations?tab=available")
}
