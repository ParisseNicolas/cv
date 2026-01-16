async function trackVisitor() {
  try {
    // Récupérer les informations du visiteur
    const visitorInfo = {
      // Informations de base
      timestamp: new Date().toISOString(),
      url: window.location.href,
      referrer: document.referrer || 'Direct access',
      
      // Informations du navigateur
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      
      // Informations de connexion (approximatives)
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
    };

    // Détection du type d'appareil
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isTablet = /iPad|Android.*Tablet/i.test(navigator.userAgent);
    visitorInfo.deviceType = isTablet ? 'Tablet' : (isMobile ? 'Mobile' : 'Desktop');

    // Détection du navigateur
    let browser = 'Unknown';
    if (navigator.userAgent.includes('Firefox')) browser = 'Firefox';
    else if (navigator.userAgent.includes('Chrome')) browser = 'Chrome';
    else if (navigator.userAgent.includes('Safari')) browser = 'Safari';
    else if (navigator.userAgent.includes('Edge')) browser = 'Edge';
    visitorInfo.browser = browser;

    // Récupérer l'IP via ipify (CORS-friendly)
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      visitorInfo.ip = ipData.ip;
    } catch (ipError) {
    }

    // Formater le message pour Telegram
    const message = formatTelegramMessage(visitorInfo);
    sendNotification(message);
  } catch (error) {
    console.error('Tracking error:', error);
    // Ne pas bloquer le chargement de la page en cas d'erreur
  }
}

function formatTelegramMessage(info) {
  const lines = [
    '🔔 Nouvelle visite sur votre CV !',
    '',
    `📅 Date: ${new Date(info.timestamp).toLocaleString('fr-FR')}`,
    `🌐 URL: ${info.url}`,
    `🔗 Référence: ${info.referrer}`,
    '',
    `💻 Appareil: ${info.deviceType}`,
    `🌍 Navigateur: ${info.browser}`,
    `📱 OS: ${info.platform}`,
    `🖥️ Écran: ${info.screenResolution}`,
    `📐 Viewport: ${info.viewport}`,
    `🗣️ Langue: ${info.language}`,
    '',
  ];

  // Ajouter les infos de géolocalisation si disponibles
  if (info.ip) {
    lines.push(`🌍 Localisation:`);
    lines.push(`   IP: ${info.ip}`);
    if (info.city) lines.push(`   📍 ${info.city}, ${info.region}, ${info.country}`);
    if (info.isp) lines.push(`   🏢 ISP: ${info.isp}`);
    lines.push(`   ⏰ Fuseau: ${info.timezone}`);
  }

  return lines.join('\n');
}

// Déclencher le tracking au chargement de la page
// Avec un petit délai pour ne pas impacter les performances
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(trackVisitor, 1000);
  });
} else {
  setTimeout(trackVisitor, 1000);
}