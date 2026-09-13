# Canonical Aura on Sites

Live address: https://aura-connectivity-test.hectorcflores.chatgpt.site
GitHub Pages remains available as a backup. The ribbons UX is a separate experiment.

The Sites Worker reads the public `main/app/` files from GitHub server-side. Visitors never fetch GitHub for the app or cartelera. The existing daily Action writes the JSON to main; the next request after a 60-second edge freshness window retrieves it. No laptop, chat, scheduled assistant, or expiring publishing credential is needed for daily updates. Changes pushed to existing app files follow the same path.

Requests have a five-second upstream deadline. On failure the Worker serves a cached copy (retained up to 24 hours), or the packaged snapshot. Aura's generated-date warning remains responsible for indicating old data. Response header X-Aura-Source identifies github, cache, stale-cache or bundled-fallback. CORS permits experimental UX to read /data/cartelera.json at the working origin. No credentials are exposed. Routes are explicitly allowlisted: adding new app assets requires updating worker.mjs and redeploying the Worker. The host remains dependent on GitHub from its own network; cached/snapshot fallback is resilience, not perpetual offline freshness.

Sites project: appgprj_6aa61d0f87b881919f829fcc65f059d4.
Site checkout: /Users/hectorcflores/Documents/projects/aura-connectivity-test.
To update the Worker, copy this directory and app/ into that Site checkout, remove static configuration from .openai/hosting.json, run `node hosting/sites/build.mjs app dist/server`, and follow Sites hosting workflow. Do not commit source write tokens. The GitHub repository is the source of truth for this adapter and app code.

UX work: use a same-origin /data/cartelera.json where available, or the live Sites data URL above. Do not fetch GitHub from the browser: AT&T LTE failed there but worked with this host. Preserve the canonical app unless a design is explicitly approved.
