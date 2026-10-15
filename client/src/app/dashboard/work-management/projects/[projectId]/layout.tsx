import { ProjectShell } from "@/components/dashboard/project-shell"

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectShell>{children}</ProjectShell>
}
