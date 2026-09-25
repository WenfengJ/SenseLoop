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
  answer?: string;
  model?: string | null;
  citations?: Array<Record<string, unknown>>;
  toolCalls?: Array<Record<string, unknown>>;
  memory?: Record<string, unknown> | null;
  aiEnabled?: boolean;
};

export type GuestIdentity = {
  deviceId: string;
  guestUserId: string;
  accountId?: string | null;
  authMode?: "guest" | "email";
  email?: string | null;
  displayName?: string | null;
  profileId: string | null;
  profiles: UserProfile[];
  sessionToken?: string | null;
};

export type EmailCodeResult = {
  email: string;
  expiresInSeconds: number;
  delivery: "email" | "dev";
  devCode?: string | null;
};

export type ProfileWritePayload = Omit<UserProfile, "id"> & {
  accountId?: string | null;
};

export type AgentContext = {
  profile: Record<string, unknown>;
  signals?: DailySignals | null;
  report?: DailyReport | null;
  memory?: Record<string, unknown> | null;
  recentMessages: Array<Record<string, unknown>>;
  knowledgeCards: Array<Record<string, unknown>>;
};

export type TongueAnalysisPayload = {
  date: string;
  tongue: Record<string, unknown>;
  upload?: {
    name: string;
    size: number;
    type: string;
  } | null;
};

export type TongueAnalysisResult = {
  analysis: string;
  aiEnabled: boolean;
  model?: string | null;
  sessionId?: string | null;
  observation?: Record<string, unknown> | null;
};

export type HealthDocumentSummaryPayload = {
  date?: string | null;
  documentType?: "lab_report" | "checkup_report" | "tongue_image" | "diet_image" | "other_image" | "pdf" | "other";
  fileName: string;
  mimeType: string;
  byteSize: number;
  userDescription?: string | null;
  extractedText?: string | null;
  fileBase64?: string | null;
  metadata?: Record<string, unknown>;
};

export type HealthDocumentSummaryResult = {
  document: Record<string, unknown>;
  summary: string;
  aiEnabled: boolean;
  model?: string | null;
  structuredFindings?: Record<string, unknown>;
  citations: Array<Record<string, unknown>>;
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

export function createProfile(payload: ProfileWritePayload) {
  return request<UserProfile>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProfile(profileId: string, payload: ProfileWritePayload) {
  return request<UserProfile>(`/api/profiles/${encodeURIComponent(profileId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getOrCreateGuestIdentity(deviceId?: string | null) {
  return request<GuestIdentity>("/api/identity/guest", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export function loginWithEmail(email: string, displayName?: string | null, deviceId?: string | null) {
  return request<GuestIdentity>("/api/auth/email", {
    method: "POST",
    body: JSON.stringify({ email, displayName, deviceId }),
  });
}

export function requestEmailCode(email: string, displayName?: string | null, deviceId?: string | null) {
  return request<EmailCodeResult>("/api/auth/email/code", {
    method: "POST",
    body: JSON.stringify({ email, displayName, deviceId }),
  });
}

export function verifyEmailCode(email: string, code: string, displayName?: string | null, deviceId?: string | null) {
  return request<GuestIdentity>("/api/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ email, code, displayName, deviceId }),
  });
}

export function getSessionIdentity(sessionToken: string, deviceId?: string | null) {
  return request<GuestIdentity>("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ sessionToken, deviceId }),
  });
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

export function getAgentContext(profileId: string) {
  return request<AgentContext>(`/api/profiles/${encodeURIComponent(profileId)}/agent/context`);
}

export function chatWithQihuangAgent(profileId: string, message: string, sessionId?: string | null) {
  return request<AgentMessageResult>(`/api/profiles/${encodeURIComponent(profileId)}/agent/chat`, {
    method: "POST",
    body: JSON.stringify({ message, sessionId, useRag: true }),
  });
}

export function sendAgentMessage(sessionId: string, message: string) {
  return request<AgentMessageResult>(`/api/agent/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, useRag: true, allowedTools: ["knowledge_search", "report_context"] }),
  });
}

export function analyzeTongue(profileId: string, payload: TongueAnalysisPayload) {
  return request<TongueAnalysisResult>(`/api/profiles/${encodeURIComponent(profileId)}/tongue-analysis`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function summarizeHealthDocument(profileId: string, payload: HealthDocumentSummaryPayload) {
  return request<HealthDocumentSummaryResult>(`/api/profiles/${encodeURIComponent(profileId)}/documents/summarize`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
