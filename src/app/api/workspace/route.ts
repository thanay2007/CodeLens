import { configuration, errorResponse } from "@/lib/server/access";

export async function GET() {
  try {
    return Response.json(configuration(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
