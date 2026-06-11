import { notFound } from "next/navigation";
import { getProject, getProjectStats } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";

export default async function ChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  const stats = getProjectStats(project);

  const checked = project.requirements.filter((r) => r.status !== "not_started");

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">확인 결과</h1>
      <p className="text-sm text-gray-500 mb-8">
        {checked.length}/{project.requirements.length}개 항목 확인 완료
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="통과" value={stats.passed} colorClass="text-green-600" />
        <StatCard label="안 맞음" value={stats.failed} colorClass="text-red-600" />
        <StatCard label="확인 부족" value={stats.inconclusive} colorClass="text-amber-600" />
        <StatCard label="결정 필요" value={stats.needsDecision} colorClass="text-violet-600" />
      </div>

      <div className="space-y-3">
        {project.requirements.map((req) => (
          <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-medium text-gray-800">{req.title}</p>
              <StatusBadge status={req.status} />
            </div>
            {req.evidence && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-medium text-gray-600">확인 근거:</span> {req.evidence}
              </p>
            )}
            {req.status === "not_started" && (
              <p className="text-xs text-gray-400 italic">아직 확인되지 않았습니다.</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 text-xs text-gray-400 bg-gray-100 rounded-lg px-4 py-3">
        Stage 5에서 Conclave review job과 연결되어 자동으로 각 항목이 확인됩니다.
      </div>
    </div>
  );
}
