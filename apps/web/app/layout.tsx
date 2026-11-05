import type { Metadata, Viewport } from "next";
import { Ibarra_Real_Nova, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Analytics, AnalyticsNoScript } from "@/components/Analytics";
import { CookieConsent } from "@/components/CookieConsent";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/JsonLd";
import { DESCRIPTION, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-jakarta", display: "swap" });
const ibarra = Ibarra_Real_Nova({ subsets: ["latin"], weight: ["600"], variable: "--font-ibarra", display: "swap" });

// No canonical or Open Graph URL here: those are per page (lib/seo.ts), otherwise every page
// that forgets to set them would claim to be the home page.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8faff" },
    { media: "(prefers-color-scheme: dark)", color: "#12132a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('aff-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${ibarra.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AnalyticsNoScript />
        <a className="skip-link" href="#main">Skip to main content</a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>{children}</main>
        <SiteFooter />
        <CookieConsent />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/logo.png`, description: DESCRIPTION },
              {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                name: SITE_NAME,
                url: SITE_URL,
                publisher: { "@id": `${SITE_URL}/#org` },
                potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/offers?q={search_term_string}`, "query-input": "required name=search_term_string" },
              },
            ],
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
