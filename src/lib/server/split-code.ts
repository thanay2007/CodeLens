import "server-only";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export async function splitCode(path: string, content: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const language =
    extension === "py"
      ? "python"
      : ["js", "jsx", "ts", "tsx"].includes(extension || "")
        ? "js"
        : extension === "md"
          ? "markdown"
          : null;
  const options = { chunkSize: 1800, chunkOverlap: 200 };
  const splitter = language
    ? RecursiveCharacterTextSplitter.fromLanguage(language, options)
    : new RecursiveCharacterTextSplitter(options);
  // Separators prefer language boundaries; long functions may still span chunks.
  return splitter.createDocuments([content], [{ path }]);
}
