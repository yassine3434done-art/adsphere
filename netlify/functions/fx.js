// Netlify Function: /.netlify/functions/fx
// وسيط آمن لأسعار الصرف (يحمي EXCHANGE_API_KEY في متغيّرات البيئة)
// يحتاج إضافة ENV باسم: EXCHANGE_API_KEY في Netlify

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',                // عدّلها لدومينك لو بغيتي تشديد
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  try {
    // ردّ على Preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS };
    }

    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };
    }

    const KEY = process.env.EXCHANGE_API_KEY;
    if (!KEY) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'NO_API_KEY' }) };
    }

    // قراءة البارامترات وتنظيفها
    const params = event.queryStringParameters || {};
    const baseRaw = (params.base || 'MAD').toString().trim().toUpperCase();
    const symbolsRaw = (params.symbols || 'USD,EUR').toString();

    // اسمح فقط بحروف وأرقام وفواصل
    const clean = (s) => s.replace(/[^A-Z0-9,]/gi, '');
    const base = clean(baseRaw) || 'MAD';
    const want = Array.from(
      new Set(
        clean(symbolsRaw)
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    // إذا كان الرمز نفس الـ base رجّع 1 تلقائيًا
    const out = { base, ts: Date.now(), rates: {} };
    for (const s of want) if (s === base) out.rates[s] = 1;

    // طلب من Exchangerate-API
    const url = `https://v6.exchangerate-api.com/v6/${KEY}/latest/${encodeURIComponent(base)}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('FX_HTTP_ERROR', res.status, text);
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'FX_HTTP_ERROR', status: res.status }) };
    }

    const data = await res.json();
    const conv = data?.conversion_rates || {};

    for (const s of want) {
      if (out.rates[s] === 1) continue;           // كان نفس الـ base
      if (conv[s] != null) out.rates[s] = conv[s];
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300'     // 5 دقائق كاش للمتصفح
      },
      body: JSON.stringify(out)
    };
  } catch (e) {
    console.error('FX_FUNC_ERROR', e);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'FX_FUNC_ERROR' }) };
  }
};