import type { Metadata } from "next";

export const metadata: Metadata = { title: "Accessibility statement", alternates: { canonical: "/accessibility" } };

export default function Accessibility() {
  return (
    <div className="container section prose">
      <h1>Accessibility</h1>
      <p>We aim to meet WCAG 2.2 level AA across NetAffil, including the dashboard.</p>
      <ul>
        <li>Every page works with a keyboard alone, with a visible focus outline and a skip link.</li>
        <li>Text and controls meet AA contrast in both light and dark themes.</li>
        <li>Forms have visible labels, hints tied to their fields, and errors announced to screen readers.</li>
        <li>Animations are switched off when your device asks for reduced motion.</li>
        <li>Pages are light enough for slow mobile connections.</li>
      </ul>
      <p>If something gets in your way, email accessibility@netaffil.com and we will fix it or help you directly.</p>
    </div>
  );
}
