import { notFound } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";

export default async function FixesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const needsFix = project.requirements.filter(
    (r) => r.status === "failed" || r.status === "inconclusive" || r.status === "needs_decision",
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">고쳐야 할 것</h1>
      <p className="text-sm text-gray-500 mb-8">
        {needsFix.length}개 항목에 조치가 필요합니다.
      </p>

      {needsFix.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p className="text-green-700 font-medium">모든 항목이 통과됐습니다! 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {needsFix.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm font-medium text-gray-800">{req.title}</p>
                <StatusBadge status={req.status} />
              </div>

              {req.suggestedAction && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 mb-3">
                  <p className="text-xs font-medium text-indigo-700 mb-0.5">제안된 조치</p>
                  <p className="text-xs text-indigo-800 leading-relaxed">{req.suggestedAction}</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {(req.status === "failed" || req.status === "inconclusive") && (
                  <ActionButton label="고쳐보기" variant="primary" />
                )}
                {req.status === "needs_decision" && (
                  <ActionButton label="결정하기" variant="violet" />
                )}
                <ActionButton label="제품 설명서 수정" variant="ghost" />
                <ActionButton label="위험 감수" variant="ghost" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-xs text-gray-400 bg-gray-100 rounded-lg px-4 py-3">
        Stage 5에서 고쳐보기 버튼이 실제 autofix 루프와 연결됩니다. 최대 2회 시도 후 사람이 확인합니다.
      </div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "violet" | "ghost";
}) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    violet: "bg-violet-600 text-white hover:bg-violet-700",
    ghost: "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50",
  };
  return (
    <button
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
