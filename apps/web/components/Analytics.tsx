import Script from "next/script";
import { GTM_ID } from "@/lib/site";

// Google Tag Manager. Production only, so local development never sends test traffic.
// The gtm.start event is what fires the container's "All Pages" triggers.
const bootstrap = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`;

export function Analytics() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive">{bootstrap}</Script>
      <Script id="gtm" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`} />
    </>
  );
}

export function AnalyticsNoScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <noscript>
      <iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
    </noscript>
  );
}
