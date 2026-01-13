// Stockage en mémoire pour le rate limiting
const requestCounts = new Map();

function isRateLimited(ip) {
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

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const origin = request.headers.get('origin');
      const allowedOriginsRegex = new RegExp('https://ubiquitous-rotary-phone[a-zA-Z0-9-_]+\\.app\\.github\\.dev');
      const strictAllowedOrigins = 'https://parissenicolas.github.io/cv/';
      
      if (origin && !allowedOriginsRegex.test(origin) && origin !== strictAllowedOrigins) {
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }

      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      if (isRateLimited(clientIp)) {
        return new Response('Too many requests', { status: 429, headers: corsHeaders });
      }

      const message = await request.text();
      
      // ✅ TELEGRAM au lieu de ntfy
      const telegramToken = env.TELEGRAM_BOT_TOKEN;
      const chatId = env.TELEGRAM_CHAT_ID;
      const telegramUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

      const telegramResponse = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message
        })
      });

      if (!telegramResponse.ok) {
        const errorText = await telegramResponse.text();
        console.error('Telegram error:', telegramResponse.status, errorText);
        return new Response(
          `Failed to send notification: ${telegramResponse.status} - ${errorText}`, 
          { status: 500, headers: corsHeaders }
        );
      }

      const telegramResponseText = await telegramResponse.text();
      console.log('Telegram response:', telegramResponseText);

      return new Response(
        `Notification sent successfully via Telegram`, 
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error('Error:', error);
      return new Response(
        `Error sending notification: ${error.message}`, 
        { status: 500, headers: corsHeaders }
      );
    }
  }
};