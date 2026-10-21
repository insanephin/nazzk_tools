export interface FollowingChannel {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  openLive: boolean;
  liveTitle: string | null;
  liveCategory: string | null;
  viewers: number;
  notification: boolean;
}

interface RawFollowing {
  channelId: string;
  channel?: {
    channelName?: string;
    channelImageUrl?: string | null;
    personalData?: { following?: { notification?: boolean } };
  };
  streamer?: { openLive?: boolean };
  liveInfo?: { liveTitle?: string | null; liveCategoryValue?: string | null; concurrentUserCount?: number };
}

interface RawResponse {
  code: number;
  message: string | null;
  content?: { totalPage?: number; followingList?: RawFollowing[] };
}

const BASE = "https://api.chzzk.naver.com/service/v1/channels/followings";
const PAGE_SIZE = 100;

export async function fetchFollowings(): Promise<FollowingChannel[]> {
  const result: FollowingChannel[] = [];
  for (let page = 0; ; page++) {
    const url = `${BASE}?page=${page}&size=${PAGE_SIZE}&sortType=FOLLOW`;
    const res = await fetch(url, { credentials: "include" });
    const body = (await res.json()) as RawResponse;
    if (body.code !== 200) throw new Error(body.message ?? `code ${body.code}`);

    const list = body.content?.followingList ?? [];
    result.push(...list.map(toChannel));

    const totalPage = body.content?.totalPage ?? 1;
    if (page + 1 >= totalPage || list.length === 0) return result;
  }
}

function toChannel(raw: RawFollowing): FollowingChannel {
  return {
    channelId: raw.channelId,
    channelName: raw.channel?.channelName ?? raw.channelId,
    channelImageUrl: raw.channel?.channelImageUrl ?? null,
    openLive: raw.streamer?.openLive ?? false,
    liveTitle: raw.liveInfo?.liveTitle ?? null,
    liveCategory: raw.liveInfo?.liveCategoryValue ?? null,
    viewers: raw.liveInfo?.concurrentUserCount ?? 0,
    notification: raw.channel?.personalData?.following?.notification ?? false,
  };
}

interface RawLiveStatus {
  code: number;
  message: string | null;
  content?: { status?: string; liveTitle?: string | null; liveCategoryValue?: string | null; concurrentUserCount?: number } | null;
}

export async function withLiveStatus(c: FollowingChannel): Promise<FollowingChannel> {
  const url = `https://api.chzzk.naver.com/polling/v2/channels/${c.channelId}/live-status`;
  const res = await fetch(url, { credentials: "include" });
  const body = (await res.json()) as RawLiveStatus;
  if (body.code !== 200) throw new Error(body.message ?? `code ${body.code}`);
  const live = body.content;
  if (live?.status !== "OPEN") return c;
  return {
    ...c,
    openLive: true,
    liveTitle: live.liveTitle ?? null,
    liveCategory: live.liveCategoryValue ?? null,
    viewers: live.concurrentUserCount ?? 0,
  };
}

export async function setNotification(channelId: string, on: boolean): Promise<void> {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/notification`;
  const res = await fetch(url, { method: on ? "PUT" : "DELETE", credentials: "include" });
  const body = (await res.json()) as RawResponse;
  if (body.code !== 200) throw new Error(body.message ?? `code ${body.code}`);
}
