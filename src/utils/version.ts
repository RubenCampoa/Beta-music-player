import pkg from '../../package.json';

// Single source of truth for the app version shown to users.
export const APP_VERSION = `v${pkg.version}`; // e.g. "v1.0.8"

// Numeric semver-style compare: "v1.0.10" > "v1.0.9", "v1.0.8" === "1.0.8".
// Non-numeric segments (e.g. "-beta") are ignored.
export function compareVersions(a: string, b: string): number {
  const pa = (a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export type UpdateCheckOutcome =
  | { status: 'ok'; latestTag: string; htmlUrl: string; isNewer: boolean }
  | { status: 'rate-limited' }
  | { status: 'not-found' }
  | { status: 'unavailable' };

// Query the GitHub latest release. Distinguishes API rate limiting (403/429)
// and missing release from plain network failures, so callers never report
// "already up to date" when the request did not actually succeed.
export async function checkForUpdate(): Promise<UpdateCheckOutcome> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/RubenCampoa/Beta-music-player/releases/latest?t=${Date.now()}`,
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
    if (res.status === 403 || res.status === 429) return { status: 'rate-limited' };
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'unavailable' };
    const data = await res.json();
    const latestTag = (data.tag_name || '').trim();
    if (!latestTag) return { status: 'unavailable' };
    return {
      status: 'ok',
      latestTag,
      htmlUrl: data.html_url || `https://github.com/RubenCampoa/Beta-music-player/releases/latest`,
      isNewer: compareVersions(latestTag, APP_VERSION) > 0,
    };
  } catch {
    return { status: 'unavailable' };
  }
}
