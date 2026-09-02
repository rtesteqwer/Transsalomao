module.exports = async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    return res.status(400).json({ error: 'Digite pelo menos 3 letras', results: [] });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  const buildLabel = (p = {}) => {
    const parts = [];
    const name = String(p.name || '').trim();
    const street = String(p.street || '').trim();
    const house = String(p.housenumber || '').trim();
    const city = String(p.city || p.district || p.county || '').trim();
    const state = String(p.state || '').trim();
    const country = String(p.country || '').trim();
    if (name) parts.push(name);
    if (street && street.toLowerCase() !== name.toLowerCase()) parts.push(street + (house ? `, ${house}` : ''));
    if (city && !parts.some(x => x.toLowerCase() === city.toLowerCase())) parts.push(city);
    if (state && !parts.some(x => x.toLowerCase() === state.toLowerCase())) parts.push(state);
    if (country && !parts.some(x => x.toLowerCase() === country.toLowerCase())) parts.push(country);
    return parts.join(' • ');
  };

  async function photonSearch(term, withBias) {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', term);
    url.searchParams.set('limit', '10');
    if (withBias && Number.isFinite(lat) && Number.isFinite(lon)) {
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('location_bias_scale', '0.65');
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TransporteSeguroVix/2.6 (transportesegurovix.vercel.app)',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6500)
    });

    if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);
    const data = await response.json();
    const seen = new Set();
    const results = [];

    for (const f of Array.isArray(data.features) ? data.features : []) {
      const p = f && f.properties ? f.properties : {};
      const coords = f && f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const label = buildLabel(p);
      if (!label) continue;
      const key = `${label.toLowerCase()}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ label, lat, lng });
      if (results.length >= 8) break;
    }
    return results;
  }

  try {
    let results = await photonSearch(q, true);
    if (!results.length) results = await photonSearch(`${q}, Brasil`, false);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ query: q, results });
  } catch (error) {
    console.error('destination-search-error', error && error.message ? error.message : error);
    return res.status(502).json({ error: 'Busca de destinos temporariamente indisponível', results: [] });
  }
};
