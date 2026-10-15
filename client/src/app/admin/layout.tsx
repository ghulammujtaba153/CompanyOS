import type { Metadata } from "next"

import { RequireAuth } from "@/components/auth/require-auth"
import { RequirePlatformAdmin } from "@/components/auth/require-platform-admin"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · CompanyOS Admin",
  },
  description: "CompanyOS platform admin console.",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RequirePlatformAdmin>
        <TooltipProvider>
          <SidebarProvider className="min-w-0 overflow-x-hidden">
            <AdminSidebar />
            <SidebarInset className="min-w-0 overflow-x-hidden">{children}</SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </RequirePlatformAdmin>
    </RequireAuth>
  )
}
