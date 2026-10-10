/** Reads the server-only launch gate; startup separately validates its configuration. */
export function invitationModeEnabled(): boolean {
  return process.env.MIRAI_INVITATION_MODE === "true";
}
