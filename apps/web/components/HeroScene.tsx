/** Decorative hero illustration: a globe of connected markets with floating marketplace cards.
 *  Purely illustrative, hidden from assistive technology. */
export function HeroScene() {
  const nodes = [
    [120, 150], [215, 95], [300, 140], [385, 110], [160, 250], [260, 230], [360, 255], [200, 330], [310, 335], [420, 200],
  ];
  const arcs = [
    [0, 2], [1, 3], [2, 5], [4, 5], [5, 6], [3, 9], [6, 9], [4, 7], [7, 8], [8, 6], [1, 5],
  ];
  return (
    <div className="scene" aria-hidden="true">
      <svg className="globe" viewBox="0 0 540 480" fill="none">
        <defs>
          <radialGradient id="hs-glow" cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="#7C5CFF" stopOpacity=".22" />
            <stop offset="1" stopColor="#7C5CFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hs-arc" x1="0" x2="1">
            <stop offset="0" stopColor="#2463EB" />
            <stop offset=".6" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#F28A00" />
          </linearGradient>
        </defs>
        <circle cx="270" cy="235" r="215" fill="url(#hs-glow)" />
        <circle cx="270" cy="235" r="175" stroke="currentColor" strokeOpacity=".22" strokeWidth="1.5" />
        <ellipse cx="270" cy="235" rx="175" ry="62" stroke="currentColor" strokeOpacity=".16" />
        <ellipse cx="270" cy="235" rx="175" ry="122" stroke="currentColor" strokeOpacity=".12" />
        <ellipse cx="270" cy="235" rx="62" ry="175" stroke="currentColor" strokeOpacity=".16" />
        <ellipse cx="270" cy="235" rx="122" ry="175" stroke="currentColor" strokeOpacity=".12" />
        {arcs.map(([a, b], i) => {
          const [x1, y1] = nodes[a];
          const [x2, y2] = nodes[b];
          const mx = (x1 + x2) / 2 + 20;
          const my = Math.min(y1, y2) - 40;
          return <path key={i} d={`M${x1 + 30} ${y1} Q${mx + 30} ${my} ${x2 + 30} ${y2}`} stroke="url(#hs-arc)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 6" opacity=".8" />;
        })}
        {nodes.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x + 30} cy={y} r="11" fill={i % 3 === 0 ? "#F28A00" : "#2463EB"} opacity=".15" />
            <circle cx={x + 30} cy={y} r="5" fill={i % 3 === 0 ? "#F28A00" : "#2463EB"} />
          </g>
        ))}
      </svg>

      <div className="float f1">
        <small>New campaign</small>
        <strong>Software &amp; SaaS</strong>
        <div className="big">30%<span style={{ fontSize: ".9rem", color: "var(--muted)", fontFamily: "var(--font-sans)" }}> per sale</span></div>
      </div>
      <div className="float f2">
        <small>Conversion</small>
        <strong><span className="dotline" />Sale confirmed</strong>
        <span className="muted">Commission locked from escrow</span>
      </div>
      <div className="float f3">
        <small>Withdrawal</small>
        <strong>M-Pesa · UPI · PIX · SEPA</strong>
        <span className="muted">Paid the local way</span>
      </div>
    </div>
  );
}
