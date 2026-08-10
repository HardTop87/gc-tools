import { BlobNotFoundError, get, head, put } from '@vercel/blob';

// Ein einziger, stabiler Pfad → jede Speicherung überschreibt denselben Blob.
const BLOB_PATH = 'pricing-config.json';

// Wie lange die Blob-URL am CDN gecacht werden darf. Das SDK-Minimum ist 60 s;
// der Default wäre EIN MONAT — tödlich für einen Blob, der überschrieben wird.
const BLOB_CACHE_SECONDS = 60;

// Zugriffsschutz: Der Client sendet das App-Passwort als Header. Verglichen wird
// serverseitig gegen die (nicht ins Bundle gehörende) Laufzeit-Env. Ist die Env
// nicht gesetzt (Fehlkonfiguration), bleibt der Endpunkt offen statt zu bricken.
function isAuthorized(req) {
  const expected = process.env.VITE_APP_PASSWORD;
  if (!expected) return true; // kein Gate konfiguriert → nicht blockieren
  const provided = req.headers['x-gc-auth'];
  return provided === expected;
}

// Liest den geteilten Stand garantiert FRISCH. get(BLOB_PATH) allein genügt
// nicht: Es lädt über die stabile Blob-URL, die am CDN gemäß cacheControlMaxAge
// gecacht wird — nach einem Publish sah der Server so u. U. minutenlang die alte
// Revision und lehnte jede Folgeänderung fälschlich als fremden Konflikt ab
// (409-Schleife „jemand anderes hat gespeichert", obwohl niemand sonst da war).
// Deshalb: head() fragt die Blob-API (autoritativ, kein CDN) nach der URL, und
// ein eindeutiger Query-Parameter macht jeden Abruf zu einem eigenen Cache-Key.
async function readSharedConfig() {
  let blobUrl;
  try {
    ({ url: blobUrl } = await head(BLOB_PATH));
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
  const freshUrl = `${blobUrl}${blobUrl.includes('?') ? '&' : '?'}fresh=${Date.now()}`;
  const result = await get(freshUrl, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
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
      const nextConfig = { ...config, meta: { ...config.meta, rev: nextRev } };
      await put(BLOB_PATH, JSON.stringify(nextConfig), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: BLOB_CACHE_SECONDS,
      });
      return res.status(200).json({ ok: true, rev: nextRev });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    // Details nur serverseitig loggen, nicht an den Client leaken.
    console.error('api/config error:', error);
    return res.status(500).json({ error: 'Serverfehler.' });
  }
}
