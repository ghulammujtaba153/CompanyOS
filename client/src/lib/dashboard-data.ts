export const projects = [
  { name: "CompanyOS MVP", team: "Product", progress: 68, due: "May 28" },
  { name: "Hiring automation", team: "People Operations", progress: 82, due: "May 17" },
  { name: "Revenue intelligence", team: "Revenue", progress: 41, due: "Jun 12" },
  { name: "Security baseline", team: "Operations", progress: 56, due: "Jun 28" },
  { name: "Customer portal", team: "Product", progress: 23, due: "Jul 09" },
  { name: "Finance close", team: "Finance", progress: 91, due: "May 08" },
]

export const tasks = [
  { title: "Finalize CompanyOS dashboard", project: "CompanyOS MVP", due: "Today", status: "In progress" },
  { title: "Review candidate hiring plan", project: "Hiring automation", due: "Today", status: "Awaiting review" },
  { title: "Approve vendor access request", project: "Security baseline", due: "Tomorrow", status: "Open" },
  { title: "Create Q2 revenue report", project: "Revenue intelligence", due: "Friday", status: "Open" },
]

export const issues = [
  {
    id: "COS-142",
    title: "Add SSO to employee portal",
    priority: "High",
    status: "In progress",
    type: "Story",
    project: "CompanyOS MVP",
    assignee: "Maya Patel",
    reporter: "Olivia Chen",
  },
  {
    id: "COS-318",
    title: "Fix candidate import validation",
    priority: "Medium",
    status: "To do",
    type: "Bug",
    project: "Hiring automation",
    assignee: "Recruiting Agent",
    reporter: "People Operations",
  },
  {
    id: "COS-089",
    title: "Review March vendor invoice",
    priority: "Low",
    status: "In review",
    type: "Task",
    project: "Finance close",
    assignee: "Finance Agent",
    reporter: "Ghulam Ahmed",
  },
  {
    id: "COS-221",
    title: "Build onboarding checklist template",
    priority: "Medium",
    status: "To do",
    type: "Story",
    project: "Hiring automation",
    assignee: "Olivia Chen",
    reporter: "People Operations",
  },
  {
    id: "COS-204",
    title: "Publish approval policy update",
    priority: "High",
    status: "Done",
    type: "Task",
    project: "Security baseline",
    assignee: "Compliance Agent",
    reporter: "Ghulam Ahmed",
  },
  {
    id: "COS-156",
    title: "Channel notifications for offer approvals",
    priority: "Medium",
    status: "In progress",
    type: "Story",
    project: "CompanyOS MVP",
    assignee: "People Operations",
    reporter: "Maya Patel",
  },
]

