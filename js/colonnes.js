/* ================================================================
   THE WOODER - colonnes.js
   ================================================================
   UI "Ordre des colonnes" : permet a l'utilisateur de choisir
   l'ordre des colonnes d'un meuble avec montants intermediaires
   (de gauche a droite) avant de relancer les calculs.

   Fonctions exposees :
     afficherSectionColonnes(items)    - construit les selecteurs UI
     lancerCalculDepuisColonnes(items) - relance tous les calculs
                                         une fois l'ordre valide

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html ou autres modules)
   ----------------------------------------------------------------
   Fonctions externes :
     Depuis calcul.html :
       lireParams(), updateResultMetrics(), afficherBoutonTout()
     Depuis calculs.js :
       calculerChant, calculerPercages, calculerRainures,
       calculerConnecteurs, calculerCharnieres, calculerFonds
     Depuis tiroirs.js :
       calculerTiroirs
     Depuis plan2d.js :
       dessinerPlan
     Depuis cutlist.js :
       calculerCutlist

   Variables globales :
     LECTURES   : window._meubles, window._itemsCache
     ECRITURES  : window._colonnesOrdre

   Elements DOM :
     #colonnesImage, #colonnesSelectors, #badgeColonnes,
     #secColonnes, #btnValiderColonnes, #btnResetColonnes,
     #cardChant (pour scroll apres validation)

   ----------------------------------------------------------------
   Usage : afficherSectionColonnes appele depuis lancerCalcul si
   montants intermediaires detectes. Le bouton "Valider l'ordre"
   declenche lancerCalculDepuisColonnes.
   ================================================================ */

function afficherSectionColonnes(items) {
  // Détecter s'il y a des montants intermédiaires pleins
  var monts = [], etags = [], lats = [];
  var profMeuble = 600;
  for (var i = 0; i < items.length; i++) {
    var type = items[i].type;
    if (type === 'lateral') {
      lats.push(items[i]);
      profMeuble = Math.min(items[i].p.longueur, items[i].p.largeur);
    }
    if (type === 'montant' && items[i]._montantType !== 'etagere') {
      // Répéter selon le nombre de montants physiques
      for (var nm = 0; nm < (items[i].p.nombre || 1); nm++) monts.push(items[i]);
    }
    if (type === 'etagere') etags.push(items[i]);
  }

  // Pas de montant intermédiaire → section inutile
  if (monts.length === 0) {
    window._colonnesOrdre = null;
    return;
  }

  // Collecter les largeurs d'étagères uniques (dimension ≠ profondeur)
  var etagTypes = {};
  for (var j = 0; j < etags.length; j++) {
    var p = etags[j].p;
    var dL = Math.abs(p.longueur - profMeuble);
    var dW = Math.abs(p.largeur  - profMeuble);
    var lar = (dL < dW) ? p.largeur : p.longueur;
    var key = lar.toString();
    if (!etagTypes[key]) etagTypes[key] = { largeur: lar, designation: p.designation, nb: 0 };
    etagTypes[key].nb += p.nombre;
  }
  var etagList = Object.values(etagTypes).sort(function(a,b){ return b.largeur - a.largeur; });

  // Nombre de colonnes = montants + 1
  var nbCols = monts.length + 1;

  // Calcul longueur panneau pour déduire colonne vide
  var lonPan = 0;
  for (var k = 0; k < items.length; k++) {
    if (items[k].type === 'panneau') {
      lonPan = Math.max(items[k].p.longueur, items[k].p.largeur);
      break;
    }
  }
  var ep0 = items[0] ? (items[0].ep || 19) : 19;

  // Récupérer ordre sauvegardé ou initialiser par défaut (ordre détecté automatiquement)
  var ordre = window._colonnesOrdre;
  if (!ordre || ordre.length !== nbCols) {
    // Ordre auto : distribuer les étagères dans l'ordre de leur occurrence
    ordre = [];
    var etagIdx = 0;
    for (var c2 = 0; c2 < nbCols; c2++) {
      if (etagIdx < etagList.length) {
        ordre.push(etagList[etagIdx].largeur);
        etagIdx++;
      } else {
        ordre.push(null); // colonne vide
      }
    }
    window._colonnesOrdre = ordre;
  }

  // Afficher l'image 3D si disponible
  var imgDiv = document.getElementById('colonnesImage');
  imgDiv.innerHTML = '';
  var img3D = null;
  for (var mi = 0; mi < window._meubles.length; mi++) {
    if (window._meubles[mi].image3D) { img3D = window._meubles[mi].image3D; break; }
  }
  if (img3D) {
    imgDiv.innerHTML = '<img src="' + img3D + '" style="width:100%;border-radius:6px;border:1px solid #ddd;" alt="Vue éclatée">';
  } else {
    imgDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:12px;border:1px dashed #ddd;border-radius:6px">Pas de vue éclatée disponible</div>';
  }

  // Construire les sélecteurs
  var sel = document.getElementById('colonnesSelectors');
  sel.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:8px;color:#444">Colonnes de gauche à droite :</div>';

  function calcLarVide() {
    var somme = (nbCols - 1) * ep0; // nbCols-1 = nombre de montants intermédiaires
    for (var ci = 0; ci < ordre.length; ci++) {
      if (ordre[ci]) somme += ordre[ci];
    }
    return Math.max(0, Math.round(lonPan - somme));
  }

  for (var col = 0; col < nbCols; col++) {
    (function(colIdx) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:12px;min-width:70px;color:#555;';
      lbl.textContent = 'Colonne ' + (colIdx + 1);

      var sel2 = document.createElement('select');
      sel2.style.cssText = 'font-size:12px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;';
      // Option vide
      var optVide = document.createElement('option');
      optVide.value = '';
      var larVide = calcLarVide();
      optVide.textContent = 'Vide (~' + larVide + 'mm)';
      if (!ordre[colIdx]) optVide.selected = true;
      sel2.appendChild(optVide);
      // Options étagères
      for (var ei = 0; ei < etagList.length; ei++) {
        var opt = document.createElement('option');
        opt.value = etagList[ei].largeur;
        opt.textContent = etagList[ei].largeur + 'mm (' + etagList[ei].designation.substring(0,12) + '…)';
        if (ordre[colIdx] == etagList[ei].largeur) opt.selected = true;
        sel2.appendChild(opt);
      }
      sel2.onchange = function() {
        ordre[colIdx] = this.value ? parseFloat(this.value) : null;
        window._colonnesOrdre = ordre;
        // Mettre à jour les largeurs vides
        afficherSectionColonnes(window._itemsCache);
      };
      row.appendChild(lbl);
      row.appendChild(sel2);
      if (!ordre[colIdx]) {
        var tag = document.createElement('span');
        tag.style.cssText = 'font-size:11px;color:#999;';
        tag.textContent = '(~' + calcLarVide() + 'mm)';
        row.appendChild(tag);
      }
      sel.appendChild(row);
    })(col);
  }

  document.getElementById('badgeColonnes').textContent = nbCols + ' col.';
  var secC = document.getElementById('secColonnes');
  secC.classList.remove('hidden');
  ouvrirSection('secColonnes');
  secC.scrollIntoView({ behavior: 'smooth' });
}

// Bouton valider colonnes → lancer le calcul
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('btnValiderColonnes').onclick = function() {
    if (window._itemsCache) {
      lancerCalculDepuisColonnes(window._itemsCache);
    }
  };
  document.getElementById('btnResetColonnes').onclick = function() {
    window._colonnesOrdre = null;
    if (window._itemsCache) afficherSectionColonnes(window._itemsCache);
  };
});

function lancerCalculDepuisColonnes(items) {
  // Même que lancerCalcul mais sans reconstruire items ni reclassifier
  lireParams();
  ['tbodyChant','tbodyPerc','tbodyRain','tbodyConn','tbodyCharn','tbodyCutlist','tbodyPrix','tbodyFond','tbodyTiroirs']
    .forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = ''; });
  calculerChant(items);
  calculerPercages(items);
  calculerRainures(items);
  calculerConnecteurs(items);
  calculerCharnieres(items);
  calculerFonds(items);
  calculerTiroirs(items);
  dessinerPlan(items);
  calculerCutlist(items);
  // Mise à jour des métriques dans les en-têtes de carte + scroll vers 1ère carte
  if (typeof updateResultMetrics === 'function') {
    try { updateResultMetrics(); } catch(e) { console.error('updateResultMetrics err:', e); }
  }
  var firstCard = document.getElementById('cardChant');
  if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  afficherBoutonTout();
}
