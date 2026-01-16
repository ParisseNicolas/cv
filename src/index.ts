
// --- Rate limiting en mémoire (inchangé) ---
const requestCounts = new Map<string, number[]>();
function isRateLimited(ip: string, origin?: string | null) {
  // Désactiver le rate limiting pour GitHub Codespaces
  if (origin && origin.includes('.app.github.dev')) return false;

  const now = Date.now();
  const limit = 10;              // 10 req / heure
  const windowMs = 60 * 60 * 1000;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, [now]);
    return false;
  }
  const timestamps = requestCounts.get(ip)!;
  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= limit) return true;
  recent.push(now);
  requestCounts.set(ip, recent);
  return false;
}

// --- Enrichissement géo (inchangé) ---
async function enrichWithGeoData(ip: string) {
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      city: data.city,
      region: data.region,
      country: data.country_name,
      isp: data.org,
      asn: data.asn,
      timezone: data.timezone,
      postal: data.postal,
      latitude: data.latitude,
      longitude: data.longitude,
    };
  } catch (err) {
    console.error('Geo enrichment error:', err);
    return null;
  }
}


// --- CACHE GLOBAL (persiste tant que l'isolate vit) ---
let cachedAccessToken: { token: string; exp: number } | null = null;

// Helper: délai
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function createJwtAndAccessToken(env: Env) {
  // 1) Si on a un token non expiré (5 min de marge), on le réutilise
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp - 300 > nowSec) {
    return cachedAccessToken.token;
  }

  // 2) Construire le JWT signé (RS256) depuis la clé service account (inchangé)
  const svc = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const header = { alg: "RS256", typ: "JWT" };
  const iat = nowSec;
  const exp = iat + 3600; // 1h

  const claim = {
    iss: svc.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const enc = (ab: ArrayBuffer | string) => {
    const bytes = typeof ab === 'string' ? new TextEncoder().encode(ab) : new Uint8Array(ab);
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const headerB64 = enc(JSON.stringify(header));
  const claimB64  = enc(JSON.stringify(claim));
  const unsigned  = `${headerB64}.${claimB64}`;

  const pem = (svc.private_key as string)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const raw = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    raw.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${enc(signature)}`;

  // 3) Échanger JWT -> access token avec petit retry sur 429
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  let lastErrTxt = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    console.log(`🔄 OAuth attempt ${attempt + 1}/3`);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });

    console.log(`📡 OAuth response status: ${res.status}`);

    if (res.ok) {
      const { access_token, expires_in } = await res.json();
      // Note: expires_in ~ 3600s
      cachedAccessToken = { token: access_token, exp: Math.floor(Date.now() / 1000) + (expires_in ?? 3600) };
      return access_token;
    }

    // Si rate‑limit 429, backoff exponentiel
    if (res.status === 429) {
      console.log('⚠️ Rate limited (429), retrying...');
      const backoffMs = 500 * Math.pow(2, attempt); // 0.5s, 1s, 2s
      await sleep(backoffMs);
      continue;
    }

    lastErrTxt = await res.text();
    console.log('❌ OAuth error:', res.status, lastErrTxt);
    break; // autre erreur => sortir
  }

  throw new Error(`OAuth token error: 429/other. Details: ${lastErrTxt}`);
}

// --- Types d'environnement ---
export interface Env {
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FCM_PROJECT_ID: string;
  FCM_DEFAULT_DEVICE_TOKEN?: string;
}

// --- Type simplifié du message FCM ---
type FcmInput = {
  token?: string;
  notification?: { title?: string; body?: string; };
  data?: Record<string, string>;
  android?: {
    notification?: {
      channel_id?: string;
      sound?: string;
    }
  };
};

type Response = {
  svc: string
  projectId: string,
  fcmInput: FcmInput
}
// --- Worker entrypoint ---
export default {
  async fetch(request: Request, env: Env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // --- Origine autorisée (inchangé, regex de ton code) ---
      const origin = request.headers.get('origin');
      const allowedOriginsRegex = new RegExp('https://ubiquitous-rotary-phone[a-zA-Z0-9-_]+\\.app\\.github\\.dev');
      const strictAllowedOrigins = 'https://parissenicolas.github.io';
      if (origin && !allowedOriginsRegex.test(origin) && origin !== strictAllowedOrigins) {
        return new Response(`Forbidden : ${origin}`, { status: 403, headers: corsHeaders });
      }

      // --- Rate limit sur IP (inchangé) ---
      const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
      if (isRateLimited(clientIp, origin)) {
        return new Response('Too many requests', { status: 429, headers: corsHeaders });
      }

      // --- Lecture du body ---
      // Tu peux poster du texte simple (comme avant) OU du JSON contenant le token/canal/etc.
      // Ex JSON:
      // {
      //   "token":"<FCM_TOKEN>",
      //   "title":"Hello",
      //   "body":"Message ...",
      //   "channel_id":"alerts_channel_2",
      //   "sound":"alert_sound",
      //   "data": { "k1":"v1" }
      // }
      const contentType = request.headers.get('content-type') || '';
      let rawMessage = '';
      let userJson: any = {};
      if (contentType.includes('application/json')) {
        userJson = await request.json().catch(() => ({}));
        rawMessage = JSON.stringify(userJson, null, 2);
      } else {
        rawMessage = await request.text();
      }

      // --- Extraction IP visiteur depuis le message texte (inchangé) ---
      const ipMatch = rawMessage.match(/IP:\s*([0-9.]+)/);
      const visitorIp = ipMatch ? ipMatch[1] : clientIp;

      // --- Enrichissement géo (inchangé) ---
      let messageBody = (typeof rawMessage === 'string') ? rawMessage : rawMessage.toString();
      const geoData = await enrichWithGeoData(visitorIp);
      if (geoData) {
        const geoLines: string[] = [
          '',
          '🌍 Localisation détaillée:',
          ` IP: ${visitorIp}`,
        ];
        if (geoData.city)   geoLines.push(` 📍 ${geoData.city}, ${geoData.region}, ${geoData.country}`);
        if (geoData.isp) {
          geoLines.push(` 🏢 Organisation/ISP: ${geoData.isp}`);
          const isLikelyCompany = !/(Orange|Free|SFR|Bouygues|Telecom|Cable|Fiber|DSL|Mobile)/i.test(geoData.isp);
          if (isLikelyCompany) geoLines.push(` ⚠️ Connexion d'entreprise détectée`);
        }
        if (geoData.asn)    geoLines.push(` 🔢 ASN: ${geoData.asn}`);
        if (geoData.postal) geoLines.push(` 📮 Code postal: ${geoData.postal}`);
        if (geoData.timezone) geoLines.push(` ⏰ Fuseau horaire: ${geoData.timezone}`);
        if (geoData.latitude && geoData.longitude) {
          geoLines.push(` 🗺️ Coordonnées: ${geoData.latitude}, ${geoData.longitude}`);
          geoLines.push(` 🔗 Maps: https://www.google.com/maps?q=${geoData.latitude},${geoData.longitude}`);
        }
        messageBody += '\n' + geoLines.join('\n');
      } else {
        const country = request.headers.get('cf-ipcountry') ?? 'Unknown';
        // @ts-ignore
        const city = (request as any).cf?.city ?? 'Unknown';
        // @ts-ignore
        const region = (request as any).cf?.region ?? 'Unknown';
        messageBody += `\n\n🌍 Localisation (Cloudflare):\n IP: ${clientIp}\n 📍 ${city}, ${region}, ${country}`;
      }

      // --- Construire le payload FCM ---
      const deviceToken =
        userJson.token || env.FCM_DEFAULT_DEVICE_TOKEN;
      if (!deviceToken) {
        return new Response("FCM device token manquant (body.token ou FCM_DEFAULT_DEVICE_TOKEN)", { status: 400, headers: corsHeaders });
      }

      const title = userJson.title || "Nouvelle alerte";
      const body  = userJson.body  || messageBody;

      const channelId = userJson.channel_id || "alerts_channel_2";
      const sound     = userJson.sound || "alert_sound";

      const dataObj = (userJson.data && typeof userJson.data === 'object')
        ? userJson.data
        : {};

      const fcmMessage: FcmInput = {
        token: env.FCM_DEFAULT_DEVICE_TOKEN,
        notification: { title, body },
        // Si tu préfères un "data-only", commente la ligne "notification" et mets ces valeurs dans data.
        data: {
          ...dataObj,
          // On glisse aussi canal/son dans data si ton app les lit
          channel_id: channelId,
          sound: sound,
        },
        android: {
          notification: {
            channel_id: channelId,
            sound: sound,
          }
        }
      };

      const response: Response = {
        svc: env.GOOGLE_SERVICE_ACCOUNT_JSON,
        projectId: env.FCM_PROJECT_ID,
        fcmInput: fcmMessage
      }
      return new Response(JSON.stringify(response), { status: 200, headers: corsHeaders });

    } catch (err: any) {
      console.error('Error:', err);
      return new Response(`Error: ${err?.message || err}`, { status: 500, headers: corsHeaders });
    }
  }
};