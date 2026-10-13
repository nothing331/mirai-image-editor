const notices: Record<string, string> = {
  sent: "Email sent. Inbox delivery depends on the recipient’s mail provider.",
  disabled: "Access is saved, but automatic email is disabled. Contact the recipient yourself or retry after email is configured.",
  failed: "Access is saved, but the email could not be sent. Retry the email without approving again or replacing the invitation.",
  unknown: "Access is saved, but email delivery is unconfirmed. Retry the same email. If it remains unconfirmed, check the email provider’s delivery records before sending another invitation.",
  busy: "Access is saved. An email send is already in progress; wait a moment before retrying.",
};

export function AccessEmailNotice({ status }: { status: string }) {
  if (!Object.hasOwn(notices, status)) return null;
  return <p role={status === "sent" || status === "busy" ? "status" : "alert"}
    className={`mt-3 border-l-2 p-3 text-sm leading-5 ${status === "sent" ? "border-acid bg-[#edf5c4]" : status === "busy" ? "border-line bg-surface" : "border-accent bg-[#ffd5cc]"}`}>
    {notices[status]}
  </p>;
}
