import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Request a CompanyOS demo. Tell us where work gets stuck and we’ll show how a governed AI workforce can help.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact CompanyOS",
    description:
      "Book a walkthrough of CompanyOS—the AI operating system for business.",
    url: "/contact",
  },
  twitter: {
    title: "Contact CompanyOS",
    description:
      "Book a walkthrough of CompanyOS—the AI operating system for business.",
  },
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
