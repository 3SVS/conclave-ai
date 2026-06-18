import { getProject } from "@/lib/mock-data";
import { ProjectShell } from "@/components/ProjectShell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // localStorage projects render on the client; here we only need the name for the
  // header, with a locale-aware fallback supplied by ProjectShell.
  const project = getProject(id);

  return (
    <div className="flex min-h-[calc(100vh-49px)] flex-col bg-gray-50">
      <ProjectShell projectId={id} projectName={project?.name}>
        {children}
      </ProjectShell>
    </div>
  );
}
