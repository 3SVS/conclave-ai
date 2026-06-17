"use client";

import { useParams } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import { getLocalProject } from "@/lib/workflow-store";

export default function IdeaPage() {
  const { id } = useParams<{ id: string }>();
  // Read on the client so locally-created (localStorage) projects resolve,
  // not just the bundled mock demos.
  const project = getLocalProject(id) ?? getProject(id);
  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">아이디어</h1>
      <p className="text-sm text-gray-500 mb-8">Conclave가 이해한 내용을 확인하세요.</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          입력한 아이디어
        </h2>
        <p className="text-gray-800 text-sm leading-relaxed">{project.description}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Conclave가 이해한 내용
        </h2>
        <p className="text-sm font-medium text-gray-800 mb-3">{project.spec.goal}</p>
        <ul className="space-y-2">
          {project.spec.included.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
        <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
          포함하지 않는 것
        </h2>
        <ul className="space-y-2">
          {project.spec.excluded.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-amber-800">
              <span className="mt-0.5">×</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 text-xs text-gray-400 bg-gray-100 rounded-lg px-4 py-3">
        Stage 2에서 실제 아이디어 입력 UI와 LLM 요약 기능이 추가됩니다.
      </div>
    </div>
  );
}
