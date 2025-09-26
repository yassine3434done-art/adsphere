// Netlify Function: /.netlify/functions/fx
// واجهة وسيطة آمنة لأسعار الصرف (تحمي API Key)
// تطلّب إضافة متغيّر بيئي في Netlify باسم: EXCHANGE_API_KEY

exports.handler = async (event) => {
  try {
    const params  = event.queryStringParameters || {};
    const base    = (params.base || 'MAD').toUpperCase();
    const symbols = (params.symbols || 'USD,EUR').toUpperCase();

    const KEY = process.env.EXCHANGE_API_KEY;
    if (!KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'NO_API_KEY' }) };
    }

    const url = `https://v6.exchangerate-api.com/v6/${KEY}/latest/${encodeURIComponent(base)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'FX_HTTP_ERROR' }) };
    }

    const data = await res.json();
    const rates = data?.conversion_rates || {};

    // نرجّع فقط العملات المطلوبة
    const want = symbols.split(',').map(s => s.trim());
    const out = { base, ts: Date.now(), rates: {} };
    for (const s of want) {
      if (rates[s] != null) out.rates[s] = rates[s];
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FX_FUNC_ERROR' }) };
  }
};