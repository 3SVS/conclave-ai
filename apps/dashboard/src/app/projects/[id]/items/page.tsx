import { notFound } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { PRIORITY_LABEL } from "@/lib/labels";

export default async function ItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">꼭 들어가야 할 것</h1>
      <p className="text-sm text-gray-500 mb-8">
        제품 설명서에서 도출된 {project.requirements.length}개 항목
      </p>

      <div className="space-y-3">
        {project.requirements.map((req) => (
          <div
            key={req.id}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono text-gray-300 mt-0.5 w-14 flex-shrink-0">
                {req.id}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 mb-2">{req.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={req.status} />
                  <span className="text-xs text-gray-400">
                    {PRIORITY_LABEL[req.priority]}
                  </span>
                </div>
                {req.evidence && (
                  <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                    확인 근거: {req.evidence}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-gray-400 bg-gray-100 rounded-lg px-4 py-3">
        Stage 4에서 질문 답변을 바탕으로 항목이 자동 생성됩니다.
      </div>
    </div>
  );
}
