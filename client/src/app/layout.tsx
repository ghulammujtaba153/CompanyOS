import type { Metadata, Viewport } from "next";
import { Figtree, Syne } from "next/font/google";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { OrganizationJsonLd } from "@/components/marketing/json-ld";
import "./globals.css";

const themeInitScript = `(function(){try{var t=localStorage.getItem('companyos-theme');if(t!=='light'&&t!=='dark'){t='light'}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t}catch(e){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light'}})();`

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CompanyOS — AI Operating System for Business",
    template: "%s · CompanyOS",
  },
  description:
    "CompanyOS is a self-contained AI operating system for business. Coordinate people, processes, and AI agents with controlled autonomy—no third-party connections required.",
  applicationName: "CompanyOS",
  keywords: [
    "CompanyOS",
    "AI operating system",
    "business automation",
    "AI workforce",
    "process intelligence",
    "decision firewall",
    "work management",
    "enterprise AI",
    "governed automation",
    "company brain",
    "self-contained",
  ],
  authors: [{ name: "CompanyOS" }],
  creator: "CompanyOS",
  publisher: "CompanyOS",
  category: "business",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "CompanyOS",
    title: "CompanyOS — AI Operating System for Business",
    description:
      "Self-contained operating layer for organization, work, governance, and AI agents—no external SaaS wiring required.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CompanyOS — AI Operating System for Business",
    description:
      "Self-contained AI operating system for business with controlled autonomy.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
    apple: [{ url: "/apple-icon" }],
  },
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#07090c",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090c" },
    { media: "(prefers-color-scheme: light)", color: "#f3f5f1" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${syne.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider>
          <AuthProvider>
            <OrganizationJsonLd />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
