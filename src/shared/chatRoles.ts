export const CHAT_ROLE_ATTR = "data-nazzk-toolkit-chat-role";
export const CHAT_KEY_ATTR = "data-nazzk-toolkit-chat-key";

export type ChatRole = "streamer" | "manager" | "viewer";

export function chatRoleOf(userRoleCode: string): ChatRole {
  const code = userRoleCode.toLowerCase();
  if (code === "streamer") return "streamer";
  if (code === "streaming_channel_manager" || code === "streaming_chat_manager") return "manager";
  return "viewer";
}
