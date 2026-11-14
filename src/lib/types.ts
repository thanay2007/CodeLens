export type RepositoryPreview = {
  fullName: string;
  description: string;
  url: string;
  branch: string;
  language: string | null;
  stars: number;
  fileCount: number;
  truncated: boolean;
  paths: string[];
  entries?: RepositoryEntry[];
};

export type RepositoryEntry = {
  path: string;
  kind: "file" | "symlink" | "submodule";
  preview?: "text" | "binary" | "protected";
};

export type SourceFile = {
  path: string;
  content: string;
  language: string;
  lines: number;
};
export type CodeChunk = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
};
export type CoreFile = {
  path: string;
  label: string;
  description: string;
  language: string;
  code: string;
};
export type Finding = {
  path: string;
  line: number;
  severity: "high" | "medium" | "low";
  message: string;
};
export type ArchitectureNode = {
  id: string;
  title: string;
  description: string;
  paths: string[];
  children: ArchitectureNode[];
};
export type ArchitectureFlow = {
  from: string;
  to: string;
  description: string;
};
export type AnalysisAssets = {
  readme: string;
  architecture: string;
  architectureTree?: ArchitectureNode[];
  flows?: ArchitectureFlow[];
  coreFiles: CoreFile[];
  generatedBy: string | null;
  reviewFindings: Finding[];
};
export type RepositoryData = {
  repository: RepositoryPreview;
  commitSha: string;
  files: SourceFile[];
  chunks: CodeChunk[];
  coreFiles: CoreFile[];
  techStack: string[];
  languages: Record<string, number>;
  findings: Finding[];
  healthScore: number;
  assets: AnalysisAssets | null;
  namespace: string | null;
  embeddingModel: string | null;
  warnings: string[];
  indexedFiles: number;
  skippedFiles: number;
};
export type RepositoryStatus =
  "queued" | "processing" | "ready" | "failed" | "cancelled";
export type RepositoryRecord = {
  id: string;
  ownerId: string;
  url: string;
  name: string;
  status: RepositoryStatus;
  stage: string;
  progress: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: number;
  data: RepositoryData | null;
};
export type RepositorySummary = Omit<
  RepositoryRecord,
  "data" | "ownerId" | "leaseToken" | "leaseUntil"
>;
export type ChatSource = {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  url: string;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};
export type ServiceConfiguration = {
  clerk: boolean;
  gemini: boolean;
  groq: boolean;
  pinecone: boolean;
  database: "supabase" | "postgresql" | "sqlite";
  local: boolean;
};
