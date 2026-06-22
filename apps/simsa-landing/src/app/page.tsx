// Stage 93 — minimal Simsa marketing entry for trysimsa.com.
// Stage 95 — added a minimal trust + how-it-works + contact surface below the
// hero. Static, host-agnostic, no new dependencies. CTA points at the live app.
const APP_URL = "https://app.trysimsa.com";
// Real contact mailbox (operator-provided). No trysimsa.com mailbox is wired
// yet — do not invent hi@trysimsa.com until it exists.
const CONTACT_EMAIL = "seunghunbae@b2w.kr";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <p className="wordmark">Simsa</p>
          <h1 className="tagline">The acceptance layer for AI-built software.</h1>
          <p className="lede">
            Review, compare, and accept AI-built software with evidence.
          </p>
          <a className="cta" href={APP_URL}>
            Open Simsa
          </a>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>For teams building with AI coding agents.</h2>
          <p>
            Built for founders, product teams, and agencies using AI coding
            agents. Simsa turns raw AI-built output into reviewable, comparable,
            acceptance-ready product work — with acceptance criteria, evidence,
            and decision history.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              Define acceptance items.{" "}
              <span>The criteria a change has to meet.</span>
            </li>
            <li>
              Review PRs and agent outputs.{" "}
              <span>Against those criteria, with evidence.</span>
            </li>
            <li>
              Compare runs with evidence.{" "}
              <span>See what each attempt actually changed.</span>
            </li>
            <li>
              Decide what to accept, fix, or rerun.{" "}
              <span>And keep the decision history.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Early access &amp; partnership</h2>
          <p>
            For early access or partnership inquiries, contact the team.
          </p>
          <a className="contact-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      <footer className="foot">
        <div className="container">Built for AI-built software acceptance.</div>
      </footer>
    </main>
  );
}
