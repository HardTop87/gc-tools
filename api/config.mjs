import { BlobNotFoundError, del, get, head, list, put } from '@vercel/blob';

// GESCHICHTE DIESES ENDPUNKTS (B10, 10.08.2026): Ursprünglich lag der Preisstand
// in EINEM Blob (pricing-config.json), das bei jedem Publish überschrieben wurde.
// Vercel Blob liefert überschriebene Inhalte aber minutenlang veraltet aus
// (CDN-Cache + Propagation) — der Server verglich baseRev gegen eine alte
// Revision und meldete in einer Endlosschleife „jemand anderes hat gespeichert",
// obwohl niemand sonst da war.
//
// Deshalb jetzt: JEDE Revision ist eine EIGENE, nie überschriebene Datei
// (pricing-config/rev-000000042.json). Unveränderliche Dateien können nicht
// veraltet ausgeliefert werden, und das Anlegen mit allowOverwrite:false ist
// ein atomarer Konfliktschutz: Wer dieselbe Revision als Zweiter schreibt,
// scheitert am Storage selbst — kein Read-after-Write-Fenster mehr.
const REV_PREFIX = 'pricing-config/rev-';
const REV_PATTERN = /rev-(\d+)\.json$/;
// Alter Einzel-Blob — wird nur noch gelesen, solange keine Revisionsdatei existiert.
const LEGACY_PATH = 'pricing-config.json';
// So viele Revisionsdateien bleiben als Historie stehen; ältere werden nach
// einem erfolgreichen Publish aufgeräumt (best effort).
const KEEP_REVISIONS = 10;

// Zugriffsschutz: Der Client sendet das App-Passwort als Header. Verglichen wird
// serverseitig gegen die (nicht ins Bundle gehörende) Laufzeit-Env. Ist die Env
// nicht gesetzt (Fehlkonfiguration), bleibt der Endpunkt offen statt zu bricken.
function isAuthorized(req) {
  const expected = process.env.VITE_APP_PASSWORD;
  if (!expected) return true; // kein Gate konfiguriert → nicht blockieren
  const provided = req.headers['x-gc-auth'];
  return provided === expected;
}

function revPathname(rev) {
  return `${REV_PREFIX}${String(rev).padStart(9, '0')}.json`;
}

async function readBlobJson(url) {
  const result = await get(url, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

// Jüngste Revisionsdatei laut Blob-Index (API-Abfrage, kein CDN).
async function findLatestRevision() {
  const { blobs } = await list({ prefix: REV_PREFIX, limit: 1000 });
  let latest = null;
  for (const blob of blobs) {
    const match = REV_PATTERN.exec(blob.pathname);
    if (!match) continue;
    const rev = parseInt(match[1], 10);
    if (!latest || rev > latest.rev) latest = { rev, url: blob.url };
  }
  return latest;
}

async function readSharedConfig() {
  const latest = await findLatestRevision();
  if (latest) {
    const config = await readBlobJson(latest.url);
    if (config) return config;
  }

  // Migration: Bestand aus der Einzel-Blob-Zeit lesen. Cache-Buster, weil dieser
  // Pfad überschrieben wurde und daher veraltet gecacht sein kann.
  try {
    const { url } = await head(LEGACY_PATH);
    const freshUrl = `${url}${url.includes('?') ? '&' : '?'}fresh=${Date.now()}`;
    return await readBlobJson(freshUrl);
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

// Alte Revisionsdateien löschen, die jüngsten KEEP_REVISIONS behalten.
// Fehler hier sind egal — Aufräumen darf ein Publish nie scheitern lassen.
async function cleanupOldRevisions() {
  try {
    const { blobs } = await list({ prefix: REV_PREFIX, limit: 1000 });
    const revs = blobs
      .map((blob) => ({ blob, rev: parseInt(REV_PATTERN.exec(blob.pathname)?.[1] ?? '0', 10) }))
      .sort((a, b) => b.rev - a.rev);
    const stale = revs.slice(KEEP_REVISIONS).map((entry) => entry.blob.pathname);
    if (stale.length) await del(stale);
  } catch (error) {
    console.error('api/config cleanup:', error);
  }
}

// Leichte serverseitige Plausibilitätsprüfung. Die Vollvalidierung
// (validatePricingConfig) läuft im Client vor dem Absenden UND beim Laden.
function looksLikeConfig(config) {
  return (
    config &&
    typeof config === 'object' &&
    config.meta &&
    config.meta.version &&
    config.settings &&
    typeof config.settings === 'object' &&
    Array.isArray(config.papiere) &&
    config.papiere.length > 0 &&
    Array.isArray(config.formate) &&
    config.formate.length > 0 &&
    Array.isArray(config.routen) &&
    config.routen.length > 0 &&
    config.wvTabellen &&
    typeof config.wvTabellen === 'object'
  );
}

export default async function handler(req, res) {
  // Nie cachen — ein Upload muss sofort für alle wirksam sein.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Nicht autorisiert.' });
  }

  try {
    if (req.method === 'GET') {
      const config = await readSharedConfig();
      if (!config) {
        // Noch kein geteilter Preisstand veröffentlicht.
        return res.status(204).end();
      }
      return res.status(200).json(config);
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const config = payload?.config;
      const baseRev = Number.isFinite(payload?.baseRev) ? payload.baseRev : 0;

      if (!looksLikeConfig(config)) {
        return res.status(400).json({ error: 'Ungültige Konfiguration abgelehnt.' });
      }

      // Optimistic Concurrency: nur schreiben, wenn seit dem Laden niemand
      // anderes veröffentlicht hat. Sonst 409 → Client lädt neu und warnt.
      const current = await readSharedConfig();
      const currentRev = Number.isFinite(current?.meta?.rev) ? current.meta.rev : 0;
      if (current && baseRev !== currentRev) {
        return res.status(409).json({ error: 'Zwischenzeitlich geändert.', currentRev });
      }

      const nextRev = currentRev + 1;
      const nextConfig = {
        ...config,
        meta: { ...config.meta, rev: nextRev, publishedAt: new Date().toISOString() },
      };

      try {
        await put(revPathname(nextRev), JSON.stringify(nextConfig), {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: false, // atomarer Konfliktschutz: Revision existiert = verloren
          contentType: 'application/json',
        });
      } catch (error) {
        // Jemand anderes hat dieselbe Revision zeitgleich angelegt.
        console.error('api/config claim failed:', error);
        return res.status(409).json({ error: 'Zwischenzeitlich geändert.', currentRev: nextRev });
      }

      await cleanupOldRevisions();
      return res.status(200).json({ ok: true, rev: nextRev, publishedAt: nextConfig.meta.publishedAt });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Details nur serverseitig loggen, nicht an den Client leaken.
    console.error('api/config error:', error);
    return res.status(500).json({ error: 'Serverfehler.' });
  }
}
