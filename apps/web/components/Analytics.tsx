import Script from "next/script";
import { GTM_ID } from "@/lib/site";

// Also read by CookieConsent.tsx.
const CONSENT_KEY = "aff-consent";

// Google Tag Manager with Consent Mode v2. Production only, so local development never sends
// test traffic. Analytics and ad storage start denied; a saved "granted" choice is applied before
// the container loads, and CookieConsent updates it when the visitor chooses. gtm.js is injected
// from this same script so the consent default is always set first. The gtm.start event is what
// fires the container's "All Pages" triggers.
const bootstrap = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});
try{if(localStorage.getItem('${CONSENT_KEY}')==='granted')gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}catch(e){}
gtag('js',new Date());dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id=${GTM_ID}';document.head.appendChild(s);`;

export function Analytics() {
  if (process.env.NODE_ENV !== "production") return null;
  return <Script id="gtm" strategy="afterInteractive">{bootstrap}</Script>;
}

export function AnalyticsNoScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <noscript>
      <iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
    </noscript>
  );
}
