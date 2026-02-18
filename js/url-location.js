(function () {
  // Récupère le premier paramètre de l'URL (ex: ?aix -> "aix")
  function getLocationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    // On récupère les clés (le nom du premier paramètre)
    const keys = Array.from(params.keys());
    return keys.length > 0 ? keys[0] : null;
  }

  // Détecte la langue actuelle via localStorage (utilisé par i18n.js)
  function getCurrentLanguage() {
    const saved = localStorage.getItem('lang');
    if (saved && (saved === 'fr-FR' || saved === 'en-US')) return saved;
    return 'fr-FR'; // fallback
  }

  // Met à jour le contenu du hero-location
  function updateLocationFromUrl() {
    const location = getLocationFromUrl();
    if (!location) return; // Pas de paramètre, on fait rien

    const heroLocation = document.querySelector('.hero-location');
    if (!heroLocation) return;

    const lang = getCurrentLanguage();
    const text = lang === 'en-US' 
      ? `Searching in ${location}`
      : `Recherche à ${location}`;

    // Replace le contenu et supprime l'attribut i18n pour éviter qu'il soit écrasé
    heroLocation.textContent = text;
    heroLocation.removeAttribute('data-i18n');
  }

  // *** IMPORTANT : marquer hero-location IMMÉDIATEMENT pour éviter qu'i18n y touche ***
  // Ça s'exécute avant même le DOMContentLoaded
  const location = getLocationFromUrl();
  if (location) {
    // Observer pour détecter quand hero-location apparaît dans le DOM
    const observer = new MutationObserver(() => {
      const heroLocation = document.querySelector('.hero-location');
      if (heroLocation) {
        observer.disconnect();
        // Immédiatement : supprimer data-i18n et mettre à jour le contenu
        heroLocation.removeAttribute('data-i18n');
        updateLocationFromUrl();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }

  // Attendre que le DOM soit prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    updateLocationFromUrl();
    
    // Hook sur setLanguage si disponible
    const originalSetLanguage = window.setLanguage;
    if (originalSetLanguage) {
      window.setLanguage = async function(lang) {
        const result = await originalSetLanguage(lang);
        // Délai court pour s'assurer que localStorage est mis à jour
        setTimeout(updateLocationFromUrl, 50);
        return result;
      };
    }

    // Écouter aussi les changements du toggle directement (fallback)
    const toggle = document.getElementById('langToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        setTimeout(updateLocationFromUrl, 100);
      });
    }
  }
})();
