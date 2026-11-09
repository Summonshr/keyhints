// Runs in netflix.com's own page context, not the extension's: Netflix's player has to be driven
// through its own API, because setting video.currentTime makes Netflix stop with error M7375.
// content/video.ts sends { op, value } as a JSON string (plain strings cross between the contexts).

declare global {
  interface Window { netflix: any }
}

export default defineContentScript({
  matches: ['*://*.netflix.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    document.addEventListener('keyhints-netflix', (e) => {
      const { op, value } = JSON.parse((e as CustomEvent<string>).detail) as { op: string; value: number };
      const api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids: string[] = api.getAllPlayerSessionIds();
      const player = api.getVideoPlayerBySessionId(ids.find((id) => id.startsWith('watch')) || ids[0]);
      const duration: number = player.getDuration();
      const clamp = (ms: number) => Math.max(0, Math.min(ms, duration - 1000));
      if (op === 'seekBy') player.seek(clamp(player.getCurrentTime() + value));
      else if (op === 'seekToFraction') player.seek(clamp(duration * value));
      else throw new Error(`KeyHints: unknown Netflix op ${op}`);
    });
  },
});
