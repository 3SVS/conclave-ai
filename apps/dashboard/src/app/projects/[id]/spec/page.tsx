import { notFound } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import { SpecCompleteness } from "@/components/SpecCompleteness";

export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">제품 설명서</h1>
        <span className="text-sm text-gray-500">완성도</span>
      </div>
      <div className="mb-8">
        <SpecCompleteness value={project.spec.completeness} />
      </div>

      <div className="space-y-5">
        <Section title="목표">
          <p className="text-sm text-gray-700 leading-relaxed">{project.spec.goal}</p>
        </Section>

        <Section title="포함된 기능">
          <ul className="space-y-1.5">
            {project.spec.included.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="포함하지 않는 것">
          <ul className="space-y-1.5">
            {project.spec.excluded.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-500">
                <span className="mt-0.5">×</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>

        {project.spec.openDecisions.length > 0 && (
          <Section title="결정 필요">
            <ul className="space-y-2">
              {project.spec.openDecisions.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-violet-700">
                  <span className="text-violet-400 mt-0.5">!</span>
                  {d}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-400 bg-gray-100 rounded-lg px-4 py-3">
        Stage 3~4에서 맞춤 질문을 통해 이 설명서가 자동으로 완성됩니다.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  );
}
