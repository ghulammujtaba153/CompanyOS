const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")) ||
  "http://127.0.0.1:8000"

const TOKEN_KEY = "companyos_access_token"

export function getApiBase() {
  return API_BASE
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string | null
  auth?: boolean
}

async function parseError(res: Response): Promise<string> {
  let detail = res.statusText
  try {
    const data = (await res.json()) as { detail?: string | { msg?: string }[] }
    if (typeof data.detail === "string") detail = data.detail
    else if (Array.isArray(data.detail) && data.detail[0]?.msg) detail = data.detail[0].msg
  } catch {
    /* ignore */
  }
  return detail
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  const auth = options.auth !== false
  const token = options.token === undefined ? getAccessToken() : options.token
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) throw new ApiError(res.status, await parseError(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Multipart upload (e.g. Cloudinary logo via API). Do not set Content-Type — browser sets boundary. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  })

  if (!res.ok) throw new ApiError(res.status, await parseError(res))
  return (await res.json()) as T
}
