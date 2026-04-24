/* ================================================================
   THE WOODER - calculs-multi.js
   ================================================================
   Patch qui remplace calculerConnecteurs pour la rendre
   compatible multi-meuble.

   Bug original (calculs.js): la fonction initialise UN seul panSup
   et UN seul panInf pour toutes les pieces de tous les meubles
   melangees. Resultat : avec 3 meubles, on ne voit que 8 excentriques
   (1 meuble) au lieu de 24.

   Correction : on groupe items[] par meubleIdx, on appelle la
   fonction originale une fois par meuble, et on accumule les
   resultats dans le tableau DOM au lieu de les ecraser.

   DOIT etre charge APRES calculs.js dans calcul.html :
     <script src="js/calculs.js"></script>
     <script src="js/calculs-multi.js"></script>
   ================================================================ */

(function() {

  // ── Attend que calculerConnecteurs soit definie ────────────────
  function patcher() {
    if (typeof calculerConnecteurs !== 'function') {
      setTimeout(patcher, 50);
      return;
    }

    var originale = calculerConnecteurs;

    window.calculerConnecteurs = function(items) {
      // Si pas de meubleIdx (fallback pour tests sans _meubles)
      // on retombe sur le comportement original
      var hasMeubleIdx = items.some(function(it) { return it.meubleIdx != null; });
      if (!hasMeubleIdx) {
        return originale(items);
      }

      // Grouper items par meubleIdx
      var groupes = {};
      for (var i = 0; i < items.length; i++) {
        var idx = items[i].meubleIdx;
        if (!groupes[idx]) groupes[idx] = [];
        groupes[idx].push(items[i]);
      }

      var indices = Object.keys(groupes).map(Number).sort(function(a, b) { return a - b; });

      // Accumulateurs globaux pour totaux finaux
      var totalLiaisons = [];
      var totalExcGlobal = 0, totalGouGlobal = 0;

      // On va intercepter les ecritures dans connTotal et connLiaisons
      // pour qu'elles soient cumulees au lieu d'ecrasees
      var elConnTotal    = document.getElementById('connTotal');
      var elConnLiaisons = document.getElementById('connLiaisons');

      for (var g = 0; g < indices.length; g++) {
        var itemsMeuble = groupes[indices[g]];

        // Snapshot des valeurs avant l'appel
        var excAvant = window._totalExc || 0;
        var gouAvant = window._totalGou || 0;
        var liaisonsAvantLen = (window._liaisons || []).length;

        // Reset des globals pour ce meuble (l'originale va les re-ecrire)
        window._totalExc = 0;
        window._totalGou = 0;
        window._liaisons = [];

        // Appel de l'originale avec les items de ce meuble uniquement
        // L'originale va :
        //  - trouver panSup, panInf, lats, monts, etag
        //  - calculer les liaisons
        //  - AJOUTER (appendChild) les lignes dans tbodyConn
        //  - ECRASER connTotal et connLiaisons avec les valeurs de CE meuble
        //  - Ecraser window._liaisons avec les liaisons de CE meuble
        originale(itemsMeuble);

        // Cumuler les resultats de ce meuble dans les totaux globaux
        totalExcGlobal += window._totalExc || 0;
        totalGouGlobal += window._totalGou || 0;
        if (window._liaisons) {
          for (var li = 0; li < window._liaisons.length; li++) {
            totalLiaisons.push(window._liaisons[li]);
          }
        }
      }

      // Ecrire les totaux cumules dans le DOM
      // Total affichage = excentriques + goujons comme dans l'original
      var totalConnGlobal = totalExcGlobal + totalGouGlobal;
      if (elConnTotal)    elConnTotal.textContent    = totalConnGlobal;
      if (elConnLiaisons) elConnLiaisons.textContent = totalLiaisons.length;

      // Stocker les totaux pour usage en aval (cutlist, prix, etc.)
      window._totalExc  = totalExcGlobal;
      window._totalGou  = totalGouGlobal;
      window._liaisons  = totalLiaisons;

      console.log('[calculs-multi] ' + indices.length + ' meubles traites. ' +
                  totalExcGlobal + ' excentriques, ' + totalGouGlobal + ' goujons, ' +
                  totalLiaisons.length + ' liaisons.');
    };

    console.log('[calculs-multi] calculerConnecteurs patche pour multi-meuble');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patcher);
  } else {
    patcher();
  }
})();
