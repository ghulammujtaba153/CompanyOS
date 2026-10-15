import type { Me } from "@/lib/auth-api"

/** Default landing route after auth for this account. */
export function homePathForMe(me: Pick<Me, "primary_role" | "account_type"> | null | undefined) {
  if (!me) return "/dashboard"
  if (me.primary_role === "platform_admin" || me.account_type === "platform_admin") {
    return "/admin"
  }
  return "/dashboard"
}
