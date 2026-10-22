export interface SteamTrailer {
  hls: string;
  poster: string;
}

export const STEAM_PLAYER_PAGE = "steam/player.html";

export async function fetchSteamTrailer(appId: string): Promise<SteamTrailer | null> {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=movies`);
  if (!res.ok) return null;
  const json = await res.json();
  const movie = json?.[appId]?.data?.movies?.[0];
  if (!movie?.hls_h264) return null;
  return { hls: movie.hls_h264, poster: movie.thumbnail ?? "" };
}
