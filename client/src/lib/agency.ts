export type AgencyProfile = {
  /** Display name shown in the product chrome */
  name: string
  /** Optional legal / registered name */
  legalName: string
  tagline: string
  website: string
  industry: string
  companySize: string
  headquarters: string
  about: string
  contactEmail: string
  contactPhone: string
  /** Logo URL (Cloudinary) or legacy local data URL. */
  logoDataUrl: string
  /** Accent label under the product name, e.g. "Software agency" */
  workspaceLabel: string
}

export const companySizes = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "500+",
] as const

export const industries = [
  "Software agency",
  "Product studio",
  "SaaS",
  "Consulting",
  "Other",
] as const

export const seedAgency: AgencyProfile = {
  name: "Acme Labs",
  legalName: "Acme Labs Pvt. Ltd.",
  tagline: "We design and ship software for ambitious teams.",
  website: "https://acmelabs.io",
  industry: "Software agency",
  companySize: "11–50",
  headquarters: "Remote · Karachi / Dubai",
  about:
    "Acme Labs is a software agency building products, platforms, and internal tools for startups and mid-market companies. We combine product craft with delivery discipline.",
  contactEmail: "hello@acmelabs.io",
  contactPhone: "+92 300 0000000",
  logoDataUrl: "",
  workspaceLabel: "Software agency",
}

export function agencyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
