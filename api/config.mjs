import { get, put } from '@vercel/blob';

// Ein einziger, stabiler Pfad → jede Speicherung überschreibt denselben Blob.
const BLOB_PATH = 'pricing-config.json';

async function readSharedConfig() {
  const result = await get(BLOB_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

// Leichte serverseitige Plausibilitätsprüfung. Die Vollvalidierung
// (validatePricingConfig) läuft im Client vor dem Absenden UND beim Laden,
// sodass ein defekter Stand nie verwendet würde.
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
      const config = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!looksLikeConfig(config)) {
        return res.status(400).json({ error: 'Ungültige Konfiguration abgelehnt.' });
      }
      const blob = await put(BLOB_PATH, JSON.stringify(config), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      return res.status(200).json({ ok: true, pathname: blob.pathname });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  }
}
