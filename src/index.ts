
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

// --- Helpers JWT/OAuth2 pour FCM HTTP v1 ---
async function createJwtAndAccessToken(env: Env) {
  // 1) Parse service account JSON
  const svc = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: svc.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (ab: ArrayBuffer | string) => {
    const bytes = typeof ab === 'string' ? new TextEncoder().encode(ab) : new Uint8Array(ab);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const headerB64 = enc(JSON.stringify(header));
  const claimB64  = enc(JSON.stringify(claim));
  const unsigned  = `${headerB64}.${claimB64}`;

  // 2) Importer la clé privée PKCS8 et signer RS256
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

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${enc(signature)}`;

  // 3) Échanger le JWT contre un access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`OAuth token error: ${tokenRes.status} ${txt}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token as string;
}

// --- Envoi FCM HTTP v1 ---
async function sendFcm(env: Env, accessToken: string, payload: FcmInput) {
  const projectId = env.FCM_PROJECT_ID;
  if (!projectId) throw new Error("FCM_PROJECT_ID manquant");

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ message: payload }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`FCM error: ${res.status} ${text}`);
  }
  return text;
}

// --- Types d'environnement ---
export interface Env {
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  FCM_PROJECT_ID: string;
  FCM_DEFAULT_DEVICE_TOKEN?: string;
}

// --- Type simplifié du message FCM ---
type FcmInput = {
  token: string;
  notification?: { title?: string; body?: string; };
  data?: Record<string, string>;
  android?: {
    notification?: {
      channel_id?: string;
      sound?: string;
    }
  };
};

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
      const strictAllowedOrigins = 'https://parissenicolas.github.io/cv/';
      if (origin && !allowedOriginsRegex.test(origin) && origin !== strictAllowedOrigins) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
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
        token: deviceToken,
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

      // --- OAuth2 + envoi vers FCM ---
      const accessToken = await createJwtAndAccessToken(env);
      const result = await sendFcm(env, accessToken, fcmMessage);

      return new Response(result, { status: 200, headers: corsHeaders });

    } catch (err: any) {
      console.error('Error:', err);
      return new Response(`Error: ${err?.message || err}`, { status: 500, headers: corsHeaders });
    }
  }
};