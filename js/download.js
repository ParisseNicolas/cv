// Affiche un mini-toast "Téléchargement lancé…" pendant 2.2s
(function () {
const btn = document.querySelector('.download-button');
const toast = document.getElementById('dl-toast');

if (!btn || !toast) return;

btn.addEventListener('click', function () {
    toast.classList.add('show');
    // Cache le toast après 2.2s
    setTimeout(() => toast.classList.remove('show'), 2200);
});
})();
