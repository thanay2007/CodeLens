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
};
