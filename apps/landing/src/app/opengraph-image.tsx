/**
 * Dynamic OG image — rendered to PNG at request time by Next.js's
 * file-based metadata convention. Visible to crawlers + social
 * scrapers as `<og:image>` for the root route.
 *
 * Spec: 1200×630 (Facebook + LinkedIn standard, also satisfies
 * Twitter summary_large_image). Brand-on: parchment + oxblood +
 * gold + Bodoni-style display serif (system fallback — Next's
 * ImageResponse can't fetch Google Fonts at build, so we use a
 * conservative serif stack that's available on the rendering env).
 */
import { ImageResponse } from "next/og";

export const alt = "Conclave AI — a council of AI agents convenes for every PR";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          // Parchment cream — matches globals.css body background.
          background: "#F4ECDC",
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 80% 20%, rgba(155, 122, 48, 0.10), transparent 65%), radial-gradient(ellipse 50% 50% at 20% 80%, rgba(92, 17, 28, 0.06), transparent 65%)",
          color: "#1A1310",
          fontFamily: '"Bodoni Moda", Bodoni, Didot, Georgia, serif',
        }}
      >
        {/* Top marker: mono uppercase rule like the on-page section markers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "40px",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: "16px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#7A685A",
          }}
        >
          <span>v0.16 · MMXXVI</span>
          <span
            style={{
              flex: 1,
              height: "1px",
              background:
                "linear-gradient(90deg, transparent, #9B7A30 30%, #C7A554 50%, #9B7A30 70%, transparent)",
            }}
          />
          <span>code council</span>
        </div>

        {/* Hero headline — three-line composition matching the on-page hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "76px",
            lineHeight: 1.05,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          <div>A council of AI agents</div>
          <div>convenes for every PR</div>
          <div style={{ display: "flex", fontStyle: "italic", color: "#5C111C" }}>
            against your PRD.
          </div>
        </div>

        {/* Bottom strip: Latin tagline left, wax seal mark right */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: '"Bodoni Moda", Bodoni, Didot, Georgia, serif',
              fontStyle: "italic",
              color: "#5C463A",
              fontSize: "26px",
            }}
          >
            <div>Ex pluribus, iudicium.</div>
            <div
              style={{
                display: "flex",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontStyle: "normal",
                fontSize: "14px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#7A685A",
                marginTop: "8px",
              }}
            >
              conclave-ai.dev
            </div>
          </div>

          {/* Wax seal — built from gradients, matches the on-page hero seal */}
          <div
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(circle at 35% 30%, #8E2C39, #5C111C 60%, #4B0E17)",
              boxShadow:
                "inset 0 0 0 3px rgba(199, 165, 84, 0.40), inset 6px 12px 24px rgba(0, 0, 0, 0.40), 0 6px 12px rgba(40, 10, 15, 0.30)",
              color: "#F4ECDC",
              fontFamily: '"Bodoni Moda", Bodoni, Didot, Georgia, serif',
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "30px",
              letterSpacing: "0.04em",
            }}
          >
            C·AI
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
