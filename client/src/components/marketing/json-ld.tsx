export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CompanyOS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "CompanyOS is a self-contained AI operating system for business—coordinate people, processes, and AI agents with controlled autonomy, without requiring third-party tool connections.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Interactive product demo",
    },
    publisher: {
      "@type": "Organization",
      name: "CompanyOS",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
