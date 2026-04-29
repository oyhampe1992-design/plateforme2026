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

  // ── Patch calculerRainures ──────────────────────────────────────
  // En multi-meubles, l'originale ne calcule la profondeur qu'à partir
  // du PREMIER latéral rencontre, et la stocke dans une globale unique.
  // Resultat : si 2 meubles ont des profondeurs differentes (CB 600 + CH 350),
  // les rainures du 2eme sont positionnees avec la profondeur du 1er.
  // Solution : on appelle l'originale meuble par meuble, on capture sa
  // profondeur et on tagge chaque item avec _profMeubleRain (lu par pdf-plans.js).
  function patcherRainures() {
    if (typeof calculerRainures !== 'function') {
      setTimeout(patcherRainures, 50);
      return;
    }

    var originale = calculerRainures;

    window.calculerRainures = function(items) {
      var hasMeubleIdx = items.some(function(it) { return it.meubleIdx != null; });

      if (!hasMeubleIdx) {
        // Mode mono-meuble : appel direct + tagage uniforme pour cohérence
        originale(items);
        var pmGlobal = window._profMeubleRain;
        for (var i = 0; i < items.length; i++) {
          items[i]._profMeubleRain = pmGlobal;
        }
        return;
      }

      var grp = grouperParMeuble(items);

      var elRainNb    = document.getElementById('rainNb');
      var elRainTotal = document.getElementById('rainTotal');
      var elTbody     = document.getElementById('tbodyRain');

      // Vider le tbody une fois — l'originale fait appendChild sans vider,
      // donc en multi-meubles les lignes vont s'empiler proprement
      if (elTbody) elTbody.innerHTML = '';

      var piecesRainGlobal = [];
      var profsParMeuble = {};

      for (var g = 0; g < grp.indices.length; g++) {
        var idxMeuble  = grp.indices[g];
        var itemsMeuble = grp.groupes[idxMeuble];

        // Reset _piecesRain avant chaque appel
        window._piecesRain = [];

        originale(itemsMeuble);

        // Capturer la profondeur calculee par l'originale pour ce meuble
        var pmMeuble = window._profMeubleRain;
        profsParMeuble[idxMeuble] = pmMeuble;

        // Tagger chaque item de ce meuble avec sa profondeur de rainure
        // (lu plus tard par pdf-plans.js : item._profMeubleRain en priorite)
        for (var i2 = 0; i2 < itemsMeuble.length; i2++) {
          itemsMeuble[i2]._profMeubleRain = pmMeuble;
        }

        // Cumuler _piecesRain
        if (window._piecesRain) {
          for (var pr = 0; pr < window._piecesRain.length; pr++) {
            piecesRainGlobal.push(window._piecesRain[pr]);
          }
        }
      }

      // Recalculer les totaux affiches sur l'ensemble
      var totalNb = piecesRainGlobal.length;
      var totalLm = 0;
      for (var pi = 0; pi < piecesRainGlobal.length; pi++) {
        var hP = piecesRainGlobal[pi].hPiece || 0;
        var nb = (piecesRainGlobal[pi].p && piecesRainGlobal[pi].p.nombre) || 1;
        totalLm += hP * nb;
      }
      if (elRainNb)    elRainNb.textContent    = totalNb;
      if (elRainTotal) elRainTotal.textContent = (totalLm / 1000).toFixed(2) + ' ml';

      window._piecesRain = piecesRainGlobal;

      var profsList = [];
      for (var kp in profsParMeuble) {
        if (Object.prototype.hasOwnProperty.call(profsParMeuble, kp)) {
          profsList.push(profsParMeuble[kp]);
        }
      }
      console.log('[calculs-multi] Rainures: ' + grp.indices.length + ' meubles, profondeurs: ' +
                  profsList.join('/') + ' mm');
    };

    console.log('[calculs-multi] calculerRainures patche');
  }

  // ── Lancement des patches ───────────────────────────────────────
  function lancer() {
    patcherConnecteurs();
    patcherPercages();
    patcherRainures();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lancer);
  } else {
    lancer();
  }
})();
