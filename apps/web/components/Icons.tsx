// Small stroke icons used across marketing pages. Decorative: always paired with visible text.
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Svg({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...base}>{children}</svg>;
}

export const Icon = {
  globe: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></Svg>,
  wallet: () => <Svg><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7z" /><path d="M4 7l11-3v3" /><circle cx="16" cy="13.5" r="1.2" /></Svg>,
  shield: () => <Svg><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Svg>,
  chart: () => <Svg><path d="M4 20V4M4 20h16" /><path d="M8 15l3-4 3 2 5-6" /></Svg>,
  badge: () => <Svg><circle cx="12" cy="9" r="5" /><path d="M9 13.5L8 21l4-2 4 2-1-7.5" /></Svg>,
  receipt: () => <Svg><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></Svg>,
  megaphone: () => <Svg><path d="M3 10v4h4l7 4V6L7 10H3z" /><path d="M17 9a4 4 0 0 1 0 6" /></Svg>,
  users: () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.2 2.6 3.5 5.2" /></Svg>,
  link: () => <Svg><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>,
  arrow: () => <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  spark: () => <Svg><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></Svg>,
  bag: () => <Svg><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>,
  code: () => <Svg><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></Svg>,
  cap: () => <Svg><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></Svg>,
  sun: () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  heart: () => <Svg><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Svg>,
  plane: () => <Svg><path d="M10 14L3 11l1.5-1.5L12 11l5-5a2 2 0 0 1 3 3l-5 5 1.5 7.5L15 23l-3-7" /></Svg>,
};

/** An icon for an offer category, falling back to a generic bag. */
export function categoryIcon(category: string) {
  const c = category.toLowerCase();
  if (/(soft|saas|tech|app|hosting|ai)/.test(c)) return Icon.code;
  if (/(edu|course|learn)/.test(c)) return Icon.cap;
  if (/(solar|energy|power)/.test(c)) return Icon.sun;
  if (/(beauty|health|skin|well)/.test(c)) return Icon.heart;
  if (/(travel|flight|hotel)/.test(c)) return Icon.plane;
  if (/(finance|fintech|bank|pay)/.test(c)) return Icon.wallet;
  return Icon.bag;
}
