import Workspace from "@/components/dashboard/workspace";

export default function Page() {
  const clerkEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
  return <Workspace clerkEnabled={clerkEnabled} />;
}
