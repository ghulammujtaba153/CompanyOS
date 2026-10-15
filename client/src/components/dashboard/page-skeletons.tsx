import { Loader2 } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Centered spinner used while a page waits on its API. */
export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground",
        className
      )}
      aria-busy
      aria-live="polite"
      aria-label={label}
    >
      <Loader2 className="size-6 animate-spin text-primary" />
      <p>{label}</p>
    </div>
  )
}

/** Full page body: spinner + soft skeleton so layout doesn’t jump. */
export function PageLoadingState({
  label = "Loading…",
  variant = "table",
  className,
}: {
  label?: string
  variant?: "table" | "cards" | "detail" | "list"
  className?: string
}) {
  return (
    <div className={cn("relative flex flex-1 flex-col gap-4 p-4 md:p-6", className)} aria-busy>
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
        <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="text-muted-foreground">{label}</span>
        </div>
      </div>
      {variant === "cards" ? (
        <CardsPageSkeleton count={6} />
      ) : variant === "detail" ? (
        <DetailPageSkeleton className="p-0" />
      ) : variant === "list" ? (
        <InlineListSkeleton rows={6} />
      ) : (
        <TablePageSkeleton rows={6} columns={5} />
      )}
    </div>
  )
}

export function AuthPageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-16",
        className,
      )}
      aria-busy
      aria-label="Loading"
    >
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-4 w-56" />
      <div className="mt-2 w-full space-y-3 rounded-3xl border p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="mt-2 h-11 w-full rounded-2xl" />
      </div>
    </div>
  )
}

export function DashboardBootSkeleton() {
  return (
    <div
      className="flex min-h-svh w-full bg-background"
      aria-busy
      aria-label="Loading dashboard"
    >
      <aside className="hidden w-64 shrink-0 border-r p-4 md:block">
        <div className="mb-8 flex items-center gap-2">
          <Skeleton className="size-8 rounded-xl" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
        </div>
        <div className="space-y-4 p-4 md:p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-2 h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function TablePageSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border bg-card", className)}
      aria-busy
      aria-label="Loading table"
    >
      <div className="flex gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn("h-4 flex-1", col === 0 && "max-w-[40%]")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardsPageSkeleton({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      aria-busy
      aria-label="Loading cards"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-2 h-8 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function DetailPageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6 p-4 md:p-6", className)} aria-busy aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}

export function InlineListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
