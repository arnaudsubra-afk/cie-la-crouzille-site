const ROBOTS = 'noindex, nofollow, noarchive';
const secureHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': ROBOTS,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), autoplay=()',
};

async function notFound(request, env) {
  let body = '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Page introuvable</title><h1>Page introuvable</h1></html>';
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
    if (response.status === 200 || response.status === 404) {
      body = (await response.text()).replace(/(href|src)="(?!https?:|\/|#)/g, '$1="/');
    }
  } catch { /* Keep an ordinary 404 if the asset service is unavailable. */ }
  return new Response(request.method === 'HEAD' ? null : body, { status: 404, headers: secureHeaders });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  // Old preview deployments must not keep a revoked link usable.
  if (url.hostname !== 'compagnielacrouzille.fr') return notFound(request, env);
  const match = url.pathname.match(/^\/ecoute-pro\/([a-f0-9]{64})\/?$/);
  const expected = env.ECOUTE_PRO_TOKEN_SHA256;
  const secret = env.SOUNDCLOUD_SECRET_TOKEN;
  if (!['GET', 'HEAD'].includes(request.method) || !match ||
      !/^[a-f0-9]{64}$/.test(expected || '') || !/^s-[A-Za-z0-9]+$/.test(secret || '')) {
    return notFound(request, env);
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1])));
  const expectedBytes = Uint8Array.from(expected.match(/../g), value => parseInt(value, 16));
  let mismatch = 0;
  for (let index = 0; index < digest.length; index++) mismatch |= digest[index] ^ expectedBytes[index];
  if (mismatch !== 0) return notFound(request, env);

  const nonce = crypto.randomUUID().replaceAll('-', '');
  const playlist = new URL('https://api.soundcloud.com/playlists/soundcloud:playlists:2261602628');
  playlist.searchParams.set('secret_token', secret);
  const player = new URL('https://w.soundcloud.com/player/');
  player.search = new URLSearchParams({
    url: playlist.href, color: '#b78325', auto_play: 'false', hide_related: 'true',
    show_comments: 'false', show_reposts: 'false', show_teaser: 'false', show_user: 'false',
    buying: 'false', sharing: 'false', download: 'false', show_playcount: 'false', visual: 'false',
  }).toString();
  const headers = {
    ...secureHeaders,
    'Content-Security-Policy': `default-src 'none'; frame-src https://w.soundcloud.com; script-src 'nonce-${nonce}' https://w.soundcloud.com; style-src 'nonce-${nonce}' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carnet de notes — Écoute professionnelle</title>
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">
<link rel="icon" href="/assets/web/compagnie-la-crouzille-favicon.png">
<style nonce="${nonce}">
@import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap');
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 25% 0%,rgba(183,131,37,.12),transparent 34rem),#090807;color:#f1e4ce;font-family:'Source Serif 4',Georgia,serif;line-height:1.55}
main{width:min(900px,calc(100% - 32px));margin:clamp(20px,4vh,44px) auto}h1{font:400 clamp(26px,5vw,42px)/1.2 'Special Elite',ui-monospace,monospace;letter-spacing:.025em;margin:0 0 8px}h2{font-size:clamp(18px,3vw,23px);font-weight:400;color:#b78325;margin:0 0 12px}.intro{color:#dfceb2;margin:0 0 20px;max-width:720px}iframe{display:block;width:100%;height:450px;border:0;background:#17130d}.credit{font-size:13px;color:#b9a487;margin-top:14px}.error{font-size:14px;color:#dfceb2;padding:12px;border:1px solid rgba(224,196,151,.24)}[hidden]{display:none}
@media(max-width:420px){main{width:calc(100% - 24px);margin-top:20px}.intro{font-size:15px}iframe{height:450px}}
</style></head><body><main>
<h1>CARNET DE NOTES</h1><h2>Écoute professionnelle</h2>
<p class="intro">Vous trouverez ici en écoute la plupart des morceaux du spectacle Carnet de notes.</p>
<iframe id="playlist" title="Playlist professionnelle de Carnet de notes" src="${player.href.replaceAll('&', '&amp;')}" width="100%" height="450" scrolling="no" allow="encrypted-media" referrerpolicy="no-referrer"></iframe>
<p id="player-error" class="error" role="status" hidden>Le lecteur est momentanément indisponible. Merci de réessayer.</p>
<p class="credit">Arnaud Subra · Carnet de notes</p>
</main>
<script nonce="${nonce}" src="https://w.soundcloud.com/player/api.js"></script>
<script nonce="${nonce}">
(()=>{const message=document.getElementById('player-error');const frame=document.getElementById('playlist');
const unavailable=()=>{message.hidden=false;};frame.addEventListener('error',unavailable);
if(!window.SC){unavailable();return;}const widget=SC.Widget(frame);
const timer=setTimeout(unavailable,20000);
widget.bind(SC.Widget.Events.READY,()=>{clearTimeout(timer);message.hidden=true;});
widget.bind(SC.Widget.Events.ERROR,()=>{clearTimeout(timer);unavailable();});})();
</script></body></html>`;
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}
