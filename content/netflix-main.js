// Runs in netflix.com's own page context, not the extension's: Netflix's player has to be driven
// through its own API, because setting video.currentTime makes Netflix stop with error M7375.
// video.js sends { op, value } as a JSON string (plain strings cross between the two contexts).
document.addEventListener('keyhints-netflix', (e) => {
  const { op, value } = JSON.parse(e.detail);
  const api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
  const ids = api.getAllPlayerSessionIds();
  const player = api.getVideoPlayerBySessionId(ids.find((id) => id.startsWith('watch')) || ids[0]);
  const duration = player.getDuration();
  const clamp = (ms) => Math.max(0, Math.min(ms, duration - 1000));
  if (op === 'seekBy') player.seek(clamp(player.getCurrentTime() + value));
  else if (op === 'seekToFraction') player.seek(clamp(duration * value));
  else throw new Error(`KeyHints: unknown Netflix op ${op}`);
});
