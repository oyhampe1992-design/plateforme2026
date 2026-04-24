/* ================================================================
   THE WOODER - patch-ui.js
   ================================================================
   Rend afficherBoutonTout tolerant a l'absence des elements DOM
   #btnsPDFMeubles et #badgePDF (supprimes de l'UI actuelle mais
   encore references dans le code source).

   A charger APRES les autres modules dans calcul.html :
     <script src="js/patch-ui.js"></script>

   Pourquoi ce patch : sans lui, lancerCalcul plante en cours de
   route quand il appelle afficherBoutonTout (qui ne trouve pas
   son conteneur DOM), ce qui laisse les tableaux de synthese
   incomplets.
   ================================================================ */

(function() {
  function patcher() {
    if (typeof afficherBoutonTout !== 'function') {
      // Pas encore defini, on reessaie dans 50ms
      setTimeout(patcher, 50);
      return;
    }

    var original = afficherBoutonTout;
    window.afficherBoutonTout = function() {
      try {
        original.apply(this, arguments);
      } catch (e) {
        // On log mais on laisse la pipeline continuer
        console.warn('[patch-ui] afficherBoutonTout ignore :', e.message);
      }
    };

    console.log('[patch-ui] afficherBoutonTout enrobe avec succes');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patcher);
  } else {
    patcher();
  }
})();
