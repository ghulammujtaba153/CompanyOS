"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PAGE_SIZE_OPTIONS } from "@/lib/use-client-pagination"
import { cn } from "@/lib/utils"

export function TablePagination({
  page,
  pageCount,
  total,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number
  pageCount: number
  total: number
  from: number
  to: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  className?: string
}) {
  if (total === 0) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm",
        className
      )}
    >
      <p className="text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{from}</span>
        {"–"}
        <span className="font-medium text-foreground tabular-nums">{to}</span>
        {" of "}
        <span className="font-medium text-foreground tabular-nums">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-muted-foreground">
            <span className="hidden sm:inline">Rows</span>
            <select
              className="h-7 rounded-md border bg-background px-2 text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={page <= 1}
            aria-label="First page"
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={page <= 1}
            aria-label="Previous page"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-20 px-2 text-center tabular-nums text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={page >= pageCount}
            aria-label="Next page"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={page >= pageCount}
            aria-label="Last page"
            onClick={() => onPageChange(pageCount)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
