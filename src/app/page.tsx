import { EditorWorkspace } from "@/features/editor/EditorWorkspace";
import { CloudLanding } from "@/features/account/CloudLanding";
import { resolveCurrentAccount } from "@/server/auth/account";

/** Shows the product landing in account mode and the editor in local mode. */
export default async function Home() {
  if (process.env.MIRAI_AUTH_ENABLED !== "true") return <EditorWorkspace />;
  const account = await resolveCurrentAccount();
  return <CloudLanding account={account} />;
}
