import type { DailyReport, DailySignals, UserProfile } from "../domain/types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type ObservationPayload = {
  signalType: string;
  valueJson: Record<string, unknown>;
  source?: string;
  confidence?: number;
  privacyLevel?: "normal" | "sensitive";
};

export type KnowledgeSearchResult = {
  chunks: Array<{
    id: string;
    title: string;
    content: string;
    score?: number;
    metadata?: Record<string, unknown>;
  }>;
};

export type AgentSession = {
  id: string;
  profileId: string;
  sessionType: string;
  status: string;
};

export type AgentMessageResult = {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  toolCalls?: Array<Record<string, unknown>>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getProfiles() {
  return request<UserProfile[]>("/api/profiles");
}

export function getDailySignals(profileId: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<DailySignals>(`/api/profiles/${encodeURIComponent(profileId)}/signals${query}`);
}

export function generateReport(profileId: string, date: string) {
  return request<DailyReport>(`/api/profiles/${encodeURIComponent(profileId)}/reports/${encodeURIComponent(date)}/generate`, {
    method: "POST",
  });
}

export function createObservation(profileId: string, date: string, payload: ObservationPayload) {
  return request<Record<string, unknown>>(
    `/api/profiles/${encodeURIComponent(profileId)}/signals/${encodeURIComponent(date)}/observations`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function listObservations(profileId: string, date: string, signalType?: string) {
  const query = signalType ? `?signalType=${encodeURIComponent(signalType)}` : "";
  return request<{ observations: Array<Record<string, unknown>> }>(
    `/api/profiles/${encodeURIComponent(profileId)}/signals/${encodeURIComponent(date)}/observations${query}`,
  );
}

export function searchKnowledge(query: string, profileType?: UserProfile["profileType"]) {
  return request<KnowledgeSearchResult>("/api/knowledge/search", {
    method: "POST",
    body: JSON.stringify({ query, profileType, topK: 5 }),
  });
}

export function createAgentSession(profileId: string, sessionType = "daily_review") {
  return request<AgentSession>("/api/agent/sessions", {
    method: "POST",
    body: JSON.stringify({ profileId, sessionType, metadata: { source: "frontend" } }),
  });
}

export function sendAgentMessage(sessionId: string, message: string) {
  return request<AgentMessageResult>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, useRag: true, allowedTools: ["knowledge_search", "report_context"] }),
  });
}
