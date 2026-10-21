export interface FollowingChannel {
  channelId: string;
  channelName: string;
  notification: boolean;
}

interface RawFollowing {
  channelId: string;
  channel?: {
    channelName?: string;
    personalData?: { following?: { notification?: boolean } };
  };
}

interface RawResponse {
  code: number;
  message: string | null;
  content?: { totalPage?: number; followingList?: RawFollowing[] };
}

const BASE = "https://api.chzzk.naver.com/service/v1/channels/followings";
export const FOLLOWINGS_MESSAGE = "chzzk-tools:followings";
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

export function parseFollowings(body: unknown): { list: FollowingChannel[]; complete: boolean } | null {
  const res = (typeof body === "string" ? JSON.parse(body) : body) as RawResponse | null;
  if (res?.code !== 200 || !res.content?.followingList) return null;
  return { list: res.content.followingList.map(toChannel), complete: (res.content.totalPage ?? 1) <= 1 };
}

function toChannel(raw: RawFollowing): FollowingChannel {
  return {
    channelId: raw.channelId,
    channelName: raw.channel?.channelName ?? raw.channelId,
    notification: raw.channel?.personalData?.following?.notification ?? false,
  };
}

export async function setNotification(channelId: string, on: boolean): Promise<void> {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/notification`;
  const res = await fetch(url, { method: on ? "PUT" : "DELETE", credentials: "include" });
  const body = (await res.json()) as RawResponse;
  if (body.code !== 200) throw new Error(body.message ?? `code ${body.code}`);
}
