"use client"

import { useEffect, useMemo, useState } from "react"

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const
/** Default rows per page for dashboard tables. */
export const DEFAULT_PAGE_SIZE = 10

export function useClientPagination<T>(
  items: T[],
  options?: {
    pageSize?: number
    /** When this changes (e.g. filters), page resets to 1. */
    resetKey?: string | number
  }
) {
  const initialSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)

  useEffect(() => {
    setPage(1)
  }, [options?.resetKey, pageSize])

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), pageCount)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  const from = items.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, items.length)

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
    pageCount,
    pageItems,
    total: items.length,
    from,
    to,
  }
}
