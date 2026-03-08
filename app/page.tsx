import { UploadPanel } from "@/components/upload-panel";
import { getConfigStatus } from "@/lib/env";
import { listRecentDrafts } from "@/lib/storage";

export default async function HomePage() {
  const [recentDrafts, configStatus] = await Promise.all([
    listRecentDrafts(),
    Promise.resolve(getConfigStatus()),
  ]);

  return (
    <main>
      <UploadPanel configStatus={configStatus} recentDrafts={recentDrafts} />
    </main>
  );
}
