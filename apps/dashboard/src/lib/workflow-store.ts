"use client";

import type { Project, RequirementItem } from "./mock-data";

export type WorkflowDraft = {
  ideaText: string;
  understanding: Understanding | null;
  answers: Record<string, string>;
  spec: GeneratedSpec | null;
  requirements: RequirementItem[];
};

export type Understanding = {
  summary: string;
  targetUsers: string[];
  mainFlow: string[];
};

export type GeneratedSpec = {
  productName: string;
  tagline: string;
  targetUser: string;
  problem: string;
  included: string[];
  excluded: string[];
  userFlows: string[];
  decisions: string[];
  openDecisions: string[];
};

const DRAFT_KEY = "conclave_wf_draft";
const PROJECTS_KEY = "conclave_wf_projects";

export function saveDraft(draft: WorkflowDraft): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): WorkflowDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as WorkflowDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}

export function saveProject(project: Project): void {
  if (typeof window === "undefined") return;
  const projects = loadLocalProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.unshift(project);
  }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadLocalProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

export function getLocalProject(id: string): Project | undefined {
  return loadLocalProjects().find((p) => p.id === id);
}

export function generateProjectId(): string {
  const ts = Date.now().toString(36).slice(-5);
  const rand = Math.random().toString(36).slice(2, 5);
  return `proj_${ts}${rand}`;
}
