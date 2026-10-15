import { CommunicationsProvider } from "@/components/dashboard/communications/store"

export default function CommunicationsLayout({ children }: { children: React.ReactNode }) {
  return <CommunicationsProvider>{children}</CommunicationsProvider>
}
