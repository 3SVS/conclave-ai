export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  // Navigation lives in the app-wide slim sidebar (AppSidebar). Here we just give the
  // page content generous, centered breathing room — AI-platform style.
  return <div className="mx-auto max-w-3xl px-8 py-10">{children}</div>;
}
