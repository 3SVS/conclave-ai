"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getProject, getProjectStats } from "@/lib/mock-data";
import { getLocalProject } from "@/lib/workflow-store";
import { StatCard } from "@/components/StatCard";
import { SpecCompleteness } from "@/components/SpecCompleteness";

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  // Locally-created projects live in localStorage (client-only); mock demos are
  // bundled. A server component couldn't read localStorage → newly-created
  // projects 404'd. Read on the client so real projects resolve.
  const project = getLocalProject(id) ?? getProject(id);
  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;
  const stats = getProjectStats(project);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{project.name}</h1>
      <p className="text-gray-500 text-sm mb-8">{project.description}</p>

      <section className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-gray-700">제품 설명서 완성도</h2>
          <Link href={`/projects/${id}/spec`} className="text-xs text-indigo-600 hover:underline">
            보기 →
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SpecCompleteness value={project.spec.completeness} />
          {project.spec.openDecisions.length > 0 && (
            <div className="mt-4 space-y-2">
              {project.spec.openDecisions.map((d, i) => (
                <div key={i} className="flex gap-2 text-sm text-violet-700">
                  <span className="text-violet-400 mt-0.5">•</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-gray-700">확인 결과 요약</h2>
          <Link href={`/projects/${id}/checks`} className="text-xs text-indigo-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="통과" value={stats.passed} colorClass="text-green-600" />
          <StatCard label="안 맞음" value={stats.failed} colorClass="text-red-600" />
          <StatCard label="확인 부족" value={stats.inconclusive} colorClass="text-amber-600" />
          <StatCard label="결정 필요" value={stats.needsDecision} colorClass="text-violet-600" />
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-gray-700">꼭 들어가야 할 것</h2>
          <Link href={`/projects/${id}/items`} className="text-xs text-indigo-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {project.requirements.slice(0, 4).map((req) => (
            <div key={req.id} className="px-5 py-3.5 flex items-center gap-3">
              <StatusDot status={req.status} />
              <span className="text-sm text-gray-700 flex-1">{req.title}</span>
            </div>
          ))}
          {project.requirements.length > 4 && (
            <div className="px-5 py-3 text-xs text-gray-400 text-center">
              + {project.requirements.length - 4}개 더 있음
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    passed: "bg-green-500",
    failed: "bg-red-500",
    inconclusive: "bg-amber-400",
    needs_decision: "bg-violet-500",
    not_started: "bg-gray-300",
    building: "bg-blue-400",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-gray-300"}`} />
  );
}
