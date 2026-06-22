// Simsa marketing entry for trysimsa.com.
// Stage 93 hero · Stage 95 trust/contact · Stage 96 staged-acceptance positioning.
// Static, host-agnostic, no new dependencies. Tone: clear, serious, non-hype.
const APP_URL = "https://app.trysimsa.com";
// Real contact mailbox (operator-provided). No trysimsa.com mailbox is wired
// yet — do not invent hi@trysimsa.com until it exists.
const CONTACT_EMAIL = "seunghunbae@b2w.kr";

const INPUTS = [
  "Idea",
  "PRD / spec",
  "Product URL",
  "GitHub repo",
  "Pull request",
  "AI-built app",
];

const OUTPUTS = [
  "Product understanding",
  "Acceptance items",
  "Stage plan",
  "Review evidence",
  "Accept / fix / rerun decisions",
  "Release readiness",
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <p className="wordmark">Simsa</p>
          <h1 className="tagline">The acceptance layer for AI-built software.</h1>
          <p className="subline">From fast AI-built drafts to accepted product work.</p>
          <p className="lede">
            AI coding agents can create a first draft fast. Simsa helps teams
            review, compare, and decide what to accept, fix, or rerun — with
            evidence.
          </p>
          <a className="cta" href={APP_URL}>
            Open Simsa
          </a>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Start from anything</h2>
          <p>
            Bring an idea, a PRD, a product URL, a GitHub repo, a pull request,
            or an AI-built app. Simsa turns it into a staged acceptance workflow.
          </p>
          <div className="chips">
            {INPUTS.map((input) => (
              <span className="chip" key={input}>
                {input}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>What Simsa creates</h2>
          <p>
            Raw AI-built output becomes reviewable, comparable, acceptance-ready
            product work.
          </p>
          <ul className="outputs">
            {OUTPUTS.map((output) => (
              <li key={output}>{output}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>How the workflow runs</h2>
          <ol className="steps">
            <li>
              Understand what exists.{" "}
              <span>Idea, spec, repo, or AI-built draft.</span>
            </li>
            <li>
              Turn it into acceptance items.{" "}
              <span>The criteria a change has to meet.</span>
            </li>
            <li>
              Review builds and agent outputs.{" "}
              <span>Against those criteria, with evidence.</span>
            </li>
            <li>
              Decide what to accept, fix, or rerun.{" "}
              <span>Compare runs and choose.</span>
            </li>
            <li>
              Keep evidence and release history.{" "}
              <span>So decisions stay reviewable.</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>For teams building with AI coding agents</h2>
          <p className="note">
            Built for founders, product teams, and agencies. Simsa runs the
            acceptance process on top of fast AI-built drafts — staged review,
            evidence, and release decisions — so you can tell what is actually
            ready to accept, fix, or rerun.
          </p>
          <p>For early access or partnership inquiries, contact the team.</p>
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
