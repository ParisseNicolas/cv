// Stockage en mémoire pour le rate limiting (simple mais efficace)
const requestCounts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const limit = 10; // 10 requêtes par heure
  const windowMs = 60 * 60 * 1000; // 1 heure

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, [now]);
    return false;
  }

  const timestamps = requestCounts.get(ip);
  
  // Supprimer les requêtes hors de la fenêtre de temps
  const recentRequests = timestamps.filter(t => now - t < windowMs);
  
  if (recentRequests.length >= limit) {
    return true; // Rate limited
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return false;
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
      const allowedOriginsRegex = 'https://ubiquitous-rotary-phone[a-zA-Z0-9-_]+\.app\.github\.dev';
      const strictAllowedOrigins = 'https://parissenicolas.github.io/cv/'
      if (origin && !origin.match(allowedOriginsRegex) && origin !== strictAllowedOrigins) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }

      // Rate limiting basé sur l'IP du client
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      if (isRateLimited(clientIp)) {
        return new Response('Too many requests', { status: 429, headers: corsHeaders });
      }

      const message = await request.text();
      
      // Utiliser la variable d'environnement
      const ntfyTopic = env.NTFY_TOPIC;
      const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;

      await fetch(ntfyUrl, {
        method: 'POST',
        body: message,
        headers: {
          'Content-Type': 'text/plain'
        }
      });

      return new Response('Notification sent', { status: 200, headers: corsHeaders });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Error sending notification', { status: 500, headers: corsHeaders });
    }
  }
};
