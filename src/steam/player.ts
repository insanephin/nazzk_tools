import Hls from "hls.js";

const params = new URLSearchParams(location.search);
const video = document.querySelector("video")!;
const src = params.get("src");
video.poster = params.get("poster") ?? "";

if (src && new URL(src).hostname.endsWith(".steamstatic.com")) {
  if (Hls.isSupported()) {
    const hls = new Hls({ enableWorker: false });
    hls.loadSource(src);
    hls.attachMedia(video);
  } else {
    video.src = src;
  }
}
