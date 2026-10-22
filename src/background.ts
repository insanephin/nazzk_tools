import { fetchSteamTrailer } from "./shared/steam";

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.statusCode !== 200 || (details.method !== "POST" && details.method !== "DELETE")) return;
    const channelId = new URL(details.url).pathname.split("/").at(-2);
    const tabs = await chrome.tabs.query({ url: "https://chzzk.naver.com/*" });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const message = {
        type: "followingsChanged",
        channelId,
        followed: details.method === "POST",
        fromThisTab: tab.id === details.tabId,
      };
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  },
  { urls: ["https://api.chzzk.naver.com/service/v1/channels/*/follow"] },
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "steamTrailer") return;
  fetchSteamTrailer(message.appId).then(sendResponse, () => sendResponse(null));
  return true;
});
