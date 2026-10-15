import { Badge } from "@/components/ui/badge"
import { cn } from "cn"
import type { ProjectIssue } from "@/lib/project-types"

const priorityDot: Record<ProjectIssue["priority"], string> = {
  Critical: "bg-red-600",
  High: "bg-orange-500",
  Medium: "bg-amber-400",
  Low: "bg-slate-400",
}

export function PriorityBadge({ priority }: { priority: ProjectIssue["priority"] }) {
  return (
    <Badge variant={priority === "Critical" ? "destructive" : "outline"}>
      <span className={cn("size-1.5 rounded-full", priorityDot[priority])} />
      {priority}
    </Badge>
  )
}

const statusVariant: Record<
  ProjectIssue["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  Backlog: "outline",
  "To do": "outline",
  "In progress": "default",
  "In review": "default",
  Blocked: "destructive",
  Done: "secondary",
}

export function StatusBadge({ status }: { status: ProjectIssue["status"] }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>
}
