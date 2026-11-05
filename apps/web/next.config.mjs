const API = process.env.API_INTERNAL_URL || "http://127.0.0.1:8100";
const INTEL = process.env.INTEL_INTERNAL_URL || "http://127.0.0.1:8200";

// Google Tag Manager and the Google Analytics endpoints its tags report to. Tags for other
// vendors added in GTM later need their domains added here too, or the browser blocks them.
const GOOGLE = "https://*.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com";

const csp = [
  "default-src 'self'",
  // The dev server's hot reload needs eval; production builds do not, so it stays blocked there.
  `script-src 'self' 'unsafe-inline' https://*.googletagmanager.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  `connect-src 'self' ${GOOGLE}`,
  "frame-src https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // In production nginx sends these paths straight to the services; these rewrites make the
  // same URLs work in local development.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/go/:code", destination: `${API}/go/:code` },
      { source: "/hooks/:path*", destination: `${INTEL}/webhooks/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
