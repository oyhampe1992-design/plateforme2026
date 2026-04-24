/* ================================================================
   THE WOODER - calculs-multi.js (v2)
   ================================================================
   Patch multi-meubles pour :
   - calculerConnecteurs (panSup/panInf uniques -> boucle par meuble)
   - calculerPercages    (pieces uniquement du 1er meuble -> boucle par meuble)

   Les autres fonctions (calculerChant, calculerCharnieres,
   calculerRainures, calculerFonds) n'ont pas besoin du patch.

   DOIT etre charge APRES calculs.js dans calcul.html :
     <script src="js/calculs.js"></script>
     <script src="js/calculs-multi.js"></script>
   ================================================================ */

(function() {

  // ── Helper : groupe items par meubleIdx ─────────────────────────
  function grouperParMeuble(items) {
    var groupes = {};
    for (var i = 0; i < items.length; i++) {
      var idx = items[i].meubleIdx;
      if (!groupes[idx]) groupes[idx] = [];
      groupes[idx].push(items[i]);
    }
    var indices = Object.keys(groupes).map(Number).sort(function(a, b) { return a - b; });
    return { groupes: groupes, indices: indices };
  }

  // ── Patch calculerConnecteurs ───────────────────────────────────
  function patcherConnecteurs() {
    if (typeof calculerConnecteurs !== 'function') {
      setTimeout(patcherConnecteurs, 50);
      return;
    }

    var originale = calculerConnecteurs;

    window.calculerConnecteurs = function(items) {
      var hasMeubleIdx = items.some(function(it) { return it.meubleIdx != null; });
      if (!hasMeubleIdx) return originale(items);

      var grp = grouperParMeuble(items);

      var totalLiaisons = [];
      var totalExcGlobal = 0, totalGouGlobal = 0;

      var elConnTotal    = document.getElementById('connTotal');
      var elConnLiaisons = document.getElementById('connLiaisons');

      for (var g = 0; g < grp.indices.length; g++) {
        var itemsMeuble = grp.groupes[grp.indices[g]];
        window._totalExc = 0;
        window._totalGou = 0;
        window._liaisons = [];

        originale(itemsMeuble);

        totalExcGlobal += window._totalExc || 0;
        totalGouGlobal += window._totalGou || 0;
        if (window._liaisons) {
          for (var li = 0; li < window._liaisons.length; li++) {
            totalLiaisons.push(window._liaisons[li]);
          }
        }
      }

      var totalConnGlobal = totalExcGlobal + totalGouGlobal;
      if (elConnTotal)    elConnTotal.textContent    = totalConnGlobal;
      if (elConnLiaisons) elConnLiaisons.textContent = totalLiaisons.length;

      window._totalExc = totalExcGlobal;
      window._totalGou = totalGouGlobal;
      window._liaisons = totalLiaisons;

      console.log('[calculs-multi] Connecteurs: ' + grp.indices.length + ' meubles, ' +
                  totalExcGlobal + ' exc, ' + totalGouGlobal + ' gou, ' +
                  totalLiaisons.length + ' liaisons');
    };

    console.log('[calculs-multi] calculerConnecteurs patche');
  }

  // ── Patch calculerPercages ──────────────────────────────────────
  function patcherPercages() {
    if (typeof calculerPercages !== 'function') {
      setTimeout(patcherPercages, 50);
      return;
    }

    var originale = calculerPercages;

    window.calculerPercages = function(items) {
      var hasMeubleIdx = items.some(function(it) { return it.meubleIdx != null; });
      if (!hasMeubleIdx) return originale(items);

      var grp = grouperParMeuble(items);

      // Accumulateurs globaux
      var totalTGlobal = 0, nbPercGlobal = 0;
      var percDetsGlobal = [];
      var tourillonsAdjGlobal = [];

      var elPercTotal  = document.getElementById('percTotal');
      var elPercPieces = document.getElementById('percPieces');
      var elBadgeDXF   = document.getElementById('badgeDXF');

      for (var g = 0; g < grp.indices.length; g++) {
        var itemsMeuble = grp.groupes[grp.indices[g]];

        // Reset des globales avant appel
        window._percDets = [];
        window._tourillonsAdjacents = [];

        originale(itemsMeuble);

        // Lire les totaux ecrits par l'originale et les cumuler
        var totalT  = parseInt(elPercTotal  && elPercTotal.textContent  || '0', 10) || 0;
        var nbPerc  = parseInt(elPercPieces && elPercPieces.textContent || '0', 10) || 0;
        totalTGlobal += totalT;
        nbPercGlobal += nbPerc;

        if (window._percDets) {
          for (var pd = 0; pd < window._percDets.length; pd++) {
            percDetsGlobal.push(window._percDets[pd]);
          }
        }
        if (window._tourillonsAdjacents) {
          for (var ta = 0; ta < window._tourillonsAdjacents.length; ta++) {
            tourillonsAdjGlobal.push(window._tourillonsAdjacents[ta]);
          }
        }
      }

      // Ecrire les totaux cumules
      if (elPercTotal)  elPercTotal.textContent  = totalTGlobal;
      if (elPercPieces) elPercPieces.textContent = nbPercGlobal;
      if (elBadgeDXF)   elBadgeDXF.textContent   = totalTGlobal + ' trous';

      window._percDets = percDetsGlobal;
      window._tourillonsAdjacents = tourillonsAdjGlobal;

      console.log('[calculs-multi] Percages: ' + grp.indices.length + ' meubles, ' +
                  totalTGlobal + ' trous, ' + nbPercGlobal + ' pieces');
    };

    console.log('[calculs-multi] calculerPercages patche');
  }

  // ── Lancement des patches ───────────────────────────────────────
  function lancer() {
    patcherConnecteurs();
    patcherPercages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lancer);
  } else {
    lancer();
  }
})();
