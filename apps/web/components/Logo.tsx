import Link from "next/link";

// The lockup lives in public/logo-light.svg and public/logo-dark.svg, with the wordmark outlined
// so it renders the same everywhere. Both are in the page; CSS shows the one for the active theme
// (an <img> can't see the site's manual theme toggle, so a single adaptive SVG wouldn't follow it).
export function Logo() {
  return (
    <Link href="/" className="brand" aria-label="NetAffil home">
      <img className="logo-light" src="/logo-light.svg" alt="" width={123} height={36} />
      <img className="logo-dark" src="/logo-dark.svg" alt="" width={123} height={36} />
    </Link>
  );
}
