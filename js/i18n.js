(function () {
  const SUPPORTED = ['fr-FR', 'en-US'];
  const FALLBACK = 'fr-FR';

  // Map 'fr' -> 'fr-FR', 'en' -> 'en-US'
  const CANON = new Map([
    ['fr', 'fr-FR'],
    ['en', 'en-US']
  ]);

  let currentLang = null;
  const cache = new Map(); // cache des JSON

  // Détermine la langue cible à partir du navigateur + localStorage
  function detectLanguage() {
    const saved = localStorage.getItem('lang');
    if (saved && SUPPORTED.includes(saved)) return saved;

    const langs = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language || ''];
    for (const l of langs) {
      if (!l) continue;
      const norm = l.trim();
      if (SUPPORTED.includes(norm)) return norm;
      const base = norm.split('-')[0];
      if (CANON.has(base)) return CANON.get(base);
    }
    return FALLBACK;
  }

  async function loadDict(lang) {
    if (cache.has(lang)) return cache.get(lang);
    const res = await fetch(`./cv/assets/i18n/${lang}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`i18n load failed for ${lang}`);
    const dict = await res.json();
    cache.set(lang, dict);
    return dict;
  }

  // Applique une valeur à un noeud : textContent par défaut, innerHTML si demandé
  function setNodeValue(el, value) {
    if (el.dataset.i18nHtml === 'true') el.innerHTML = value;
    else el.textContent = value;
  }

  function applyI18n(dict) {
    // 1) Text nodes
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = get(dict, key);
      if (val != null) setNodeValue(el, val);
    });

    // 2) Attributs : data-i18n-attr="alt:hero.photoAlt, title:hero.photoTitle"
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const pairs = el.dataset.i18nAttr.split(',').map(s => s.trim()).filter(Boolean);
      for (const pair of pairs) {
        const [attr, key] = pair.split(':').map(s => s.trim());
        const val = get(dict, key);
        if (attr && val != null) el.setAttribute(attr, val);
      }
    });

    // 3) Met à jour UNIQUEMENT l'état ARIA du toggle (pas de textContent)
    syncToggleState(currentLang, dict);
  }

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
  }

  // ⚠️ Ne change PAS le contenu du bouton (laisse le CSS faire le visuel)
  function syncToggleState(lang, dict) {
    const btn = document.getElementById('langToggle');
    if (!btn) return;

    const isFr = (lang === 'fr-FR');
    btn.setAttribute('aria-checked', String(isFr));

    // Accessibilité + tooltip (tu peux localiser ces textes si tu veux)
    const nextLabel = isFr
      ? (get(dict, 'ui.accessibility.switchToEn') || 'Switch to English')
      : (get(dict, 'ui.accessibility.switchToFr') || 'Basculer en français');

    btn.setAttribute('title', nextLabel);
    btn.setAttribute('aria-label', nextLabel);
  }

  async function setLanguage(lang) {
    try {
      const target = SUPPORTED.includes(lang) ? lang : FALLBACK;
      const dict = await loadDict(target);
      currentLang = target;
      localStorage.setItem('lang', currentLang);
      applyI18n(dict);
    } catch (e) {
      console.error('i18n error:', e);
      if (lang !== FALLBACK) return setLanguage(FALLBACK);
    }
  }

  // Toggle handler
  function attachToggle() {
    const btn = document.getElementById('langToggle');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const next = currentLang === 'fr-FR' ? 'en-US' : 'fr-FR';
      await setLanguage(next);
    });

    // Optionnel : support clavier Espace/Entrée si ton bouton n'est pas <button>
    btn.addEventListener('keydown', async (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const next = currentLang === 'fr-FR' ? 'en-US' : 'fr-FR';
        await setLanguage(next);
      }
    });
  }

  // Expose (utile si tu veux changer via console)
  window.setLanguage = setLanguage;

  // Boot
  document.addEventListener('DOMContentLoaded', async () => {
    attachToggle();
    await setLanguage(detectLanguage());
  });
})();
