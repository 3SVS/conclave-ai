import Link from "next/link";
import { MOCK_PROJECTS, getProjectStats } from "@/lib/mock-data";
import { SpecCompleteness } from "@/components/SpecCompleteness";

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">Conclave</span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">작업공간</span>
        </div>
        <button className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + 새 프로젝트
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">내 프로젝트</h1>
        <p className="text-gray-500 text-sm mb-8">아이디어를 제품으로 만드는 과정을 추적합니다.</p>

        <div className="grid gap-4">
          {MOCK_PROJECTS.map((project) => {
            const stats = getProjectStats(project);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-indigo-300 hover:shadow-sm transition-all block"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{project.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{project.createdAt}</span>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>제품 설명서 완성도</span>
                    <span>{project.spec.completeness}%</span>
                  </div>
                  <SpecCompleteness value={project.spec.completeness} />
                </div>

                <div className="flex gap-4 text-xs">
                  <span className="text-green-600 font-medium">통과 {stats.passed}</span>
                  <span className="text-red-600 font-medium">안 맞음 {stats.failed}</span>
                  <span className="text-amber-600 font-medium">확인 부족 {stats.inconclusive}</span>
                  <span className="text-violet-600 font-medium">결정 필요 {stats.needsDecision}</span>
                  <span className="text-gray-400">시작 전 {stats.notStarted}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
