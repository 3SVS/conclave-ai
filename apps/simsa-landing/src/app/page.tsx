// Stage 93 — minimal Simsa marketing entry surface for trysimsa.com.
// Static, host-agnostic. CTA points at the live app domain. Kept intentionally
// small (separate Vercel project; the dashboard is untouched).
const APP_URL = "https://app.trysimsa.com";

export default function Home() {
  return (
    <main className="wrap">
      <section className="card">
        <p className="wordmark">Simsa</p>
        <h1 className="tagline">The acceptance layer for AI-built software.</h1>
        <p className="lede">
          Review, compare, and accept AI-built software with evidence.
        </p>
        <a className="cta" href={APP_URL}>
          Open Simsa
        </a>
      </section>
      <footer className="foot">Built for AI-built software acceptance.</footer>
    </main>
  );
}
