import { PeopleOpsProvider } from "@/components/dashboard/people-ops-store"

export default function PeopleOperationsLayout({ children }: { children: React.ReactNode }) {
  return <PeopleOpsProvider>{children}</PeopleOpsProvider>
}
