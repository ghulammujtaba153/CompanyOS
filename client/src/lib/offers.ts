export type OfferStatus = "Draft" | "Sent" | "Viewed" | "Signed" | "Declined" | "Expired"

export type JobOffer = {
  id: string
  candidateId: string
  candidateName: string
  candidateEmail: string
  jobId: string
  jobTitle: string
  salary: number
  currency: string
  equityNote: string
  startDate: string
  expiresOn: string
  status: OfferStatus
  signToken: string
  signedAt?: string
  signedName?: string
  createdAt: string
}

export const offerStatuses: OfferStatus[] = ["Draft", "Sent", "Viewed", "Signed", "Declined", "Expired"]

export const seedOffers: JobOffer[] = [
  {
    id: "off-1042",
    candidateId: "cand-elena",
    candidateName: "Elena Rossi",
    candidateEmail: "elena.rossi@example.com",
    jobId: "job-backend",
    jobTitle: "Senior Backend Engineer",
    salary: 145000,
    currency: "USD",
    equityNote: "0.15% options over 4 years",
    startDate: "2026-11-03",
    expiresOn: "2026-10-21",
    status: "Sent",
    signToken: "demo-offer-elena",
    createdAt: "2026-10-05",
  },
  {
    id: "off-1038",
    candidateId: "cand-priya",
    candidateName: "Priya Sharma",
    candidateEmail: "priya.s@example.com",
    jobId: "job-designer",
    jobTitle: "Product Designer",
    salary: 128000,
    currency: "USD",
    equityNote: "0.10% options over 4 years",
    startDate: "2026-10-20",
    expiresOn: "2026-10-12",
    status: "Signed",
    signToken: "demo-offer-priya",
    signedAt: "2026-10-08T14:22:00",
    signedName: "Priya Sharma",
    createdAt: "2026-10-01",
  },
  {
    id: "off-1021",
    candidateId: "cand-noah",
    candidateName: "Noah Williams",
    candidateEmail: "noah.w@example.com",
    jobId: "job-backend",
    jobTitle: "Senior Backend Engineer",
    salary: 140000,
    currency: "USD",
    equityNote: "Standard new-hire package",
    startDate: "2026-11-17",
    expiresOn: "2026-10-28",
    status: "Draft",
    signToken: "demo-offer-noah",
    createdAt: "2026-10-07",
  },
]

export function formatOfferMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}

export function findOfferByToken(token: string, offers: JobOffer[] = seedOffers) {
  return offers.find((offer) => offer.signToken === token)
}
