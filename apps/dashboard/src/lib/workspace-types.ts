/** Mirrors IdeaToSpecDraftResponse from central-plane/src/workspace/generate.ts */

export type WorkspaceQuestion = {
  id: string;
  question: string;
  recommendation: string;
  reason: string;
  options: string[];
  allowCustom: boolean;
  allowLater: boolean;
};

export type WorkspaceProductSpec = {
  productName: string;
  oneLine: string;
  targetUsers: string[];
  problem: string;
  included: string[];
  excluded: string[];
  userFlow: string[];
  decisions: string[];
  openQuestions: string[];
};

export type WorkspaceRequirementItem = {
  id: string;
  title: string;
  status: "not_started";
  criteria: string[];
};

export type IdeaToSpecDraftResponse = {
  ok: true;
  source: "llm" | "mock-fallback";
  understood: {
    summary: string;
    targetUsers: string[];
    mainFlow: string[];
  };
  questions: WorkspaceQuestion[];
  productSpec: WorkspaceProductSpec;
  items: WorkspaceRequirementItem[];
  warnings?: string[];
};
