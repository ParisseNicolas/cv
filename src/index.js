// Stockage en mémoire pour le rate limiting
const requestCounts = new Map();

function isRateLimited(ip, origin) {
  // Désactiver le rate limiting pour GitHub Codespaces
  if (origin && origin.includes('.app.github.dev')) {
    return false;
  }
  
  const now = Date.now();
  const limit = 10;
  const windowMs = 60 * 60 * 1000;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, [now]);
    return false;
  }

  const timestamps = requestCounts.get(ip);
  const recentRequests = timestamps.filter(t => now - t < windowMs);
  
  if (recentRequests.length >= limit) {
    return true;
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return false;
}

async function enrichWithGeoData(ip) {
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
      longitude: data.longitude
    };
  } catch (error) {
    console.error('Geo enrichment error:', error);
    return null;
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // Gérer les requêtes OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Seulement accepter les POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // Vérifier l'origine
      const origin = request.headers.get('origin');
      const allowedOriginsRegex = new RegExp('https://ubiquitous-rotary-phone[a-zA-Z0-9-_]+\\.app\\.github\\.dev');
      const strictAllowedOrigins = 'https://parissenicolas.github.io/cv/';
      
      if (origin && !allowedOriginsRegex.test(origin) && origin !== strictAllowedOrigins) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }

      // Rate limiting basé sur l'IP du client
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      if (isRateLimited(clientIp, origin)) {
        return new Response('Too many requests', { status: 429, headers: corsHeaders });
      }

      let message = await request.text();
      
      // Extraire l'IP du message si présente
      const ipMatch = message.match(/IP: ([0-9.]+)/);
      const visitorIp = ipMatch ? ipMatch[1] : clientIp;
      
      // Enrichir avec les données géographiques détaillées
      const geoData = await enrichWithGeoData(visitorIp);
      
      if (geoData) {
        const geoLines = [
          '',
          '🌍 Localisation détaillée:',
          `   IP: ${visitorIp}`
        ];
        
        if (geoData.city) {
          geoLines.push(`   📍 ${geoData.city}, ${geoData.region}, ${geoData.country}`);
        }
        
        if (geoData.isp) {
          geoLines.push(`   🏢 Organisation/ISP: ${geoData.isp}`);
          
          const isLikelyCompany = !/(Orange|Free|SFR|Bouygues|Telecom|Cable|Fiber|DSL|Mobile)/i.test(geoData.isp);
          if (isLikelyCompany) {
            geoLines.push(`   ⚠️ Connexion d'entreprise détectée`);
          }
        }
        
        if (geoData.asn) {
          geoLines.push(`   🔢 ASN: ${geoData.asn}`);
        }
        
        if (geoData.postal) {
          geoLines.push(`   📮 Code postal: ${geoData.postal}`);
        }
        
        if (geoData.timezone) {
          geoLines.push(`   ⏰ Fuseau horaire: ${geoData.timezone}`);
        }
        
        if (geoData.latitude && geoData.longitude) {
          geoLines.push(`   🗺️ Coordonnées: ${geoData.latitude}, ${geoData.longitude}`);
          geoLines.push(`   🔗 Maps: https://www.google.com/maps?q=${geoData.latitude},${geoData.longitude}`);
        }
        
        message += geoLines.join('\n');
      } else {
        // Fallback sur les headers Cloudflare
        const country = request.headers.get('cf-ipcountry') || 'Unknown';
        const city = request.cf?.city || 'Unknown';
        const region = request.cf?.region || 'Unknown';
        
        message += `\n\n🌍 Localisation (Cloudflare):\n   IP: ${clientIp}\n   📍 ${city}, ${region}, ${country}`;
      }

      // Envoyer à Telegram
      const telegramToken = env.TELEGRAM_BOT_TOKEN;
      const chatId = env.TELEGRAM_CHAT_ID;
      
      const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true
        })
      });

      if (!telegramResponse.ok) {
        const errorText = await telegramResponse.text();
        console.error('Telegram error:', telegramResponse.status, errorText);
        return new Response(
          `Failed to send notification: ${telegramResponse.status}`, 
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response('Notification sent successfully', { status: 200, headers: corsHeaders });
      
    } catch (error) {
      console.error('Error:', error);
      // IMPORTANT : Toujours retourner les headers CORS même en cas d'erreur
      return new Response(
        `Error: ${error.message}`, 
        { status: 500, headers: corsHeaders }
      );
    }
  }
};