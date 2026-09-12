/* One active player; callbacks from closed cards cannot affect a new selection. */
(() => {
  let api;
  function loadApi() {
    if (window.YT?.Player) return Promise.resolve();
    if (!api) api = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = resolve;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = reject;
      document.head.append(script);
    });
    return api;
  }
  window.startTrailer = (box, candidates) => {
    const ids = [...new Set(candidates)].filter(id => /^[\w-]{11}$/.test(id || '')).slice(0, 3);
    let player, timer, stopped = false, index = 0, started = false;
    const stop = () => { stopped = true; clearTimeout(timer); player?.destroy(); };
    const hide = () => { stop(); box.hidden = true; button.remove(); };
    const button = document.createElement('button');
    button.className = 'btn'; button.textContent = 'Reproducir tráiler'; button.hidden = true;
    box.after(button);
    const wait = () => { clearTimeout(timer); timer = setTimeout(() => { if (!started) hide(); }, 15000); };
    const attempt = () => {
      if (stopped) return;
      started = false; button.hidden = true;
      player.mute(); player.loadVideoById(ids[index]); wait();
    };
    button.onclick = () => { if (!stopped) { player.mute(); player.playVideo(); wait(); } };
    const cleanup = () => { stop(); button.remove(); };
    if (!ids.length) { hide(); return cleanup; }
    wait();
    loadApi().then(() => {
      if (stopped || !box.isConnected) return;
      box.replaceChildren(); const mount = document.createElement('div'); box.append(mount);
      player = new YT.Player(mount, {
        host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: { playsinline: 1, origin: location.origin, rel: 0 },
        events: {
          onReady: attempt,
          onStateChange: e => {
            if (stopped) return;
            if (e.data === 1) { started = true; clearTimeout(timer); button.hidden = true; }
          },
          onAutoplayBlocked: () => { if (!stopped) { clearTimeout(timer); button.hidden = false; } },
          onError: e => {
            if (stopped) return;
            clearTimeout(timer);
            if ([100, 101, 150].includes(e.data) && index + 1 < ids.length) { index++; attempt(); }
            else hide();
          }
        }
      });
    }).catch(() => { if (!stopped) hide(); });
    return cleanup;
  };
})();
