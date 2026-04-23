/* ================================================================
   THE WOODER - prix.js
   ================================================================
   Calcul du cout de revient et du prix de vente, affichage du
   devis detaille.

   Parcourt toutes les donnees calculees (cutlist, optimisation,
   chants, percages, connecteurs, charnieres, tiroirs) et construit
   un tableau de lignes de facturation avec sous-total, coefficient
   de vente et TVA.

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     getCoulisseConfig()         - config coulisse selectionnee
     ouvrirSection(id)           - ouvre une section repliable
     getChantSelectionne()       - type de chant selectionne
                                    (avec prix placage + fourniture)
     catalogueGet(cat, id)       - recupere un item du catalogue
     afficherStickyBar(texte)    - met a jour la barre sticky

   Variables globales lues :
     window._cutlistPieces       - liste des pieces a facturer
     window._opti                - optimisation pour panneaux 19mm
     window._optisExtra          - optimisation pour autres epaisseurs
     window._liaisons            - liaisons pour count biscuits
     window._totalExc, _totalGou - comptages connecteurs
     window._itemsCache          - items pour count tiroirs/taquets
     window._meubles             - pour le nom en sticky bar

   Constantes globales :
     TYPE_CHARNIERE, TYPE_CONNECTEUR, FOND_EPAISSEUR
     PANN_W, PANN_H, PANN_FOND_W, PANN_FOND_H
     CATALOG, BISCUIT_SEUIL

   Elements DOM (tous les champs prix + affichage resultat)

   ----------------------------------------------------------------
   Usage : calculerPrix() appele par le bouton "Calculer le prix"
   ou automatiquement apres lancerOptimisation().
   ================================================================ */

function afficherSectionPrix() {
  ouvrirSection('secCout');
  setTimeout(calculerPrix, 50);
}

function calculerPrix() {
  var pp19   = parseFloat(document.getElementById('prixPan19').value)     || 0;
  var pp8    = parseFloat(document.getElementById('prixPan8').value)      || 0;
  var pDec   = parseFloat(document.getElementById('prixDecoupe').value)   || 0;
  var pUs    = parseFloat(document.getElementById('prixUsinage').value)   || 0;
  // Prix charnière selon le type sélectionné dans « Choix du projet »
  var pCharnId, pCharnNom;
  if (TYPE_CHARNIERE === 'blum_cliptop') { pCharnId = 'prixCharnClipTop'; pCharnNom = 'Charnières Blum Clip Top'; }
  else if (TYPE_CHARNIERE === 'simple')   { pCharnId = 'prixCharnSimple';  pCharnNom = 'Charnières simples'; }
  else                                    { pCharnId = 'prixCharniere';    pCharnNom = 'Charnières Blum Inserta'; }
  var pCharn = parseFloat(document.getElementById(pCharnId).value) || 0;
  var pExc   = parseFloat(document.getElementById('prixExcentrique').value)|| 0;
  var pGou   = parseFloat(document.getElementById('prixGoujon').value)    || 0;
  // Prix tiroir selon le type de coulisse sélectionné
  var cfgCoul = getCoulisseConfig();
  var pTir   = parseFloat(document.getElementById(cfgCoul.prixId).value) || 0;
  var pTaq   = parseFloat(document.getElementById('prixTaquet').value)    || 0;
  var coeff  = parseFloat(document.getElementById('prixCoeff').value)     || 1;
  var tva    = parseFloat(document.getElementById('prixTVA').value)       || 20;

  var lignes = [], st = 0;
  function ajout(poste, detail, qte, pu) {
    var tot = Math.round(qte * pu * 100) / 100;
    st += tot;
    lignes.push({ poste: poste, detail: detail, qte: qte, pu: pu, tot: tot });
  }

  // ── Surfaces matière ─────────────────────────────────────────
  var modeMat = document.getElementById('selModeMat').value;
  var surfCaisson = 0, surfFacades = 0, surf8 = 0;
  var pieces = window._cutlistPieces || [];
  for (var i = 0; i < pieces.length; i++) {
    var s = (pieces[i].longueur / 1000) * (pieces[i].largeur / 1000) * pieces[i].nombre;
    if (pieces[i].epaisseur === FOND_EPAISSEUR && pieces[i].type === 'fond_calc') { surf8 += s; }
    else if (pieces[i].epaisseur === 19) {
      if (modeMat === 'separe' && (pieces[i].type === 'porte' || pieces[i].type === 'tiroir')) {
        surfFacades += s;
      } else {
        surfCaisson += s;
      }
    }
  }
  var surf19 = surfCaisson + surfFacades;
  var ppFac  = modeMat === 'separe' ? (parseFloat(document.getElementById('prixFacades').value) || 0) : pp19;

  // Utiliser les résultats d'optimisation si disponibles (nb panneaux entiers nécessaires)
  var nb19 = window._opti19 ? window._opti19.nbPanneaux : Math.ceil(surf19 / ((PANN_W / 1000) * (PANN_H / 1000) * 0.9));
  var nb8  = window._opti8  ? window._opti8.nbPanneaux  : Math.ceil(surf8  / ((PANN_FOND_W / 1000) * (PANN_FOND_H / 1000) * 0.9));

  // Surfaces d'un panneau entier (la chute est comprise dans le panneau acheté)
  var surfPann19 = (PANN_W / 1000) * (PANN_H / 1000);
  var surfPann8  = (PANN_FOND_W / 1000) * (PANN_FOND_H / 1000);

  if (modeMat === 'separe') {
    // Ventilation proportionnelle du coût des panneaux entre caisson et façades
    var totPanneauxFact = nb19 * surfPann19;
    if (surfCaisson > 0 && surf19 > 0) {
      var partCaisson = surfCaisson / surf19;
      ajout('Panneaux 19mm — caisson',
            (nb19 * partCaisson).toFixed(2) + ' pann. équiv. · ' + surfCaisson.toFixed(2) + ' m² utiles',
            totPanneauxFact * partCaisson, pp19);
    }
    if (surfFacades > 0 && surf19 > 0) {
      var partFacades = surfFacades / surf19;
      ajout('Panneaux 19mm — façades',
            (nb19 * partFacades).toFixed(2) + ' pann. équiv. · ' + surfFacades.toFixed(2) + ' m² utiles',
            totPanneauxFact * partFacades, ppFac);
    }
  } else {
    if (surf19 > 0) ajout('Panneaux 19mm',
                          nb19 + ' panneaux entiers · ' + surf19.toFixed(2) + ' m² utiles / ' + (nb19 * surfPann19).toFixed(2) + ' m² achetés',
                          nb19 * surfPann19, pp19);
  }
  if (surf8 > 0) ajout('Panneaux ' + FOND_EPAISSEUR + 'mm (fond)',
                       nb8 + ' panneaux entiers · ' + surf8.toFixed(2) + ' m² utiles / ' + (nb8 * surfPann8).toFixed(2) + ' m² achetés',
                       nb8 * surfPann8, pp8);

  // ── Panneaux pour les autres épaisseurs (pièces de tiroir : 5, 15, 16mm…) ──
  // Facturation : nb_panneaux_entiers × surface_panneau × prix_€/m².
  // Prix lu dans le catalogue : même matériau (nom) que le caisson + épaisseur cible.
  var optisExtra = window._optisExtra || {};
  var matCaissonPrix = null;
  var selCx = document.getElementById('selMat19');
  if (selCx && selCx.selectedIndex >= 0) matCaissonPrix = catalogueGet('materiaux', selCx.value);
  for (var epKey2 in optisExtra) {
    if (!optisExtra.hasOwnProperty(epKey2)) continue;
    var oEx = optisExtra[epKey2];
    var epEx = oEx.ep;
    // Surface utile (somme des pièces de cette épaisseur)
    var surfUtileEx = 0;
    for (var pie = 0; pie < pieces.length; pie++) {
      if (pieces[pie].epaisseur === epEx) {
        surfUtileEx += (pieces[pie].longueur / 1000) * (pieces[pie].largeur / 1000) * pieces[pie].nombre;
      }
    }
    if (surfUtileEx === 0 || oEx.nbPanneaux === 0) continue;
    // Rechercher le prix du matériau de même nom que le caisson dans l'épaisseur cible
    var prixEx = 0, nomEx = null;
    if (matCaissonPrix) {
      for (var mj = 0; mj < CATALOG.materiaux.length; mj++) {
        if (CATALOG.materiaux[mj].nom === matCaissonPrix.nom && CATALOG.materiaux[mj].ep === epEx) {
          prixEx = CATALOG.materiaux[mj].prix || 0;
          nomEx  = CATALOG.materiaux[mj].nom;
          break;
        }
      }
    }
    var surfFactEx = oEx.nbPanneaux * oEx.surfPanneau;
    if (nomEx === null || prixEx === 0) {
      // Matériau manquant : ligne d'alerte sans coût
      lignes.push({
        poste: '⚠ Panneaux ' + epEx + 'mm — tiroirs',
        detail: 'Aucun matériau ' + epEx + 'mm en « ' + (matCaissonPrix ? matCaissonPrix.nom : 'caisson') + ' » dans le catalogue — ajoutez-le pour chiffrer',
        qte: oEx.nbPanneaux,
        pu: 0,
        tot: 0
      });
    } else {
      ajout('Panneaux ' + epEx + 'mm — tiroirs (' + nomEx + ')',
            oEx.nbPanneaux + ' panneaux entiers · ' + surfUtileEx.toFixed(2) + ' m² utiles / ' + surfFactEx.toFixed(2) + ' m² achetés',
            surfFactEx, prixEx);
    }
  }

  // ── Découpe ───────────────────────────────────────────────────
  var mlDec = (window._opti19 ? window._opti19.mlDecoupe : 0) + (window._opti8 ? window._opti8.mlDecoupe : 0);
  // + ml de découpe des autres épaisseurs (tiroirs)
  var optisExtraMl = window._optisExtra || {};
  for (var epKml in optisExtraMl) {
    if (optisExtraMl.hasOwnProperty(epKml) && optisExtraMl[epKml].mlDecoupe) {
      mlDec += optisExtraMl[epKml].mlDecoupe;
    }
  }
  if (!mlDec) { for (var j = 0; j < pieces.length; j++) mlDec += ((pieces[j].longueur + pieces[j].largeur) * 2 / 1000) * pieces[j].nombre; }
  if (pDec > 0) ajout('Découpe scie', mlDec.toFixed(2) + ' ml réels', mlDec, pDec);

  // ── Chant : placage + fourniture selon type sélectionné (+10% chutes) ──
  var mlCh = parseFloat((document.getElementById('chantNet').textContent || '').replace(' ml', '')) || 0;
  if (mlCh > 0) {
    var chant = getChantSelectionne();
    if (chant) {
      var mlFact = mlCh * 1.1;
      var pPlac  = parseFloat(chant.prixPlacage)    || 0;
      var pFour  = parseFloat(chant.prixFourniture) || 0;
      if (pPlac > 0) ajout('Chant — placage (' + chant.nom + ')',
                           mlFact.toFixed(2) + ' ml (+10%)', mlFact, pPlac);
      if (pFour > 0) ajout('Chant — fourniture/colle (' + chant.nom + ')',
                           mlFact.toFixed(2) + ' ml (+10%)', mlFact, pFour);
    }
  }

  // ── Usinage ───────────────────────────────────────────────────
  var nbP = parseInt(document.getElementById('percPieces').textContent) || 0;
  if (pUs > 0 && nbP > 0) ajout('Usinage perçages', nbP + ' pièces', nbP, pUs);

  // ── Quincaillerie ─────────────────────────────────────────────
  var nbC = parseInt(document.getElementById('charnTotal').textContent) || 0;
  if (nbC > 0 && pCharn > 0) ajout(pCharnNom, nbC + ' unités', nbC, pCharn);

  var nbConn = parseInt(document.getElementById('connTotal').textContent) || 0;
  if (nbConn > 0) {
    if (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14') {
      var pClamex  = parseFloat(document.getElementById('prixClamex').value) || 0;
      var pLamello = parseFloat(document.getElementById('prixLamello').value) || 0;
      // nbConn = nb de positions × 2 (2 côtés) dans l'ancien système ; ici 1 Clamex = 1 unité
      // Comptage : pour chaque liaison on met 2 Clamex aux bouts, soit nbConn Clamex
      var nbClamex = nbConn;
      if (pClamex > 0) ajout('Clamex P-14', nbClamex + ' unités', nbClamex, pClamex);
      // Biscuits centraux : 1 par liaison dépassant le seuil
      if (TYPE_CONNECTEUR === 'clamex_biscuit') {
        var nbBiscuit = 0;
        var liaisC = window._liaisons || [];
        for (var lc = 0; lc < liaisC.length; lc++) {
          var lcL = liaisC[lc];
          var lonL = lcL.largeur || 0, profL = lcL.profondeur || 0;
          if (lonL > BISCUIT_SEUIL && profL > BISCUIT_SEUIL) nbBiscuit++;
        }
        if (nbBiscuit > 0 && pLamello > 0) ajout('Biscuits Lamello #20', nbBiscuit + ' unités', nbBiscuit, pLamello);
      }
    } else if (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12') {
      // Cabineo : 1 pièce par poche, prix selon variante
      var pCabId = (TYPE_CONNECTEUR === 'cabineo_12') ? 'prixCabineo12' : 'prixCabineo8';
      var cabNom = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';
      var pCab = parseFloat(document.getElementById(pCabId).value) || 0;
      if (pCab > 0) ajout(cabNom, nbConn + ' unités', nbConn, pCab);
    } else {
      // Excentriques et goujons facturés avec leurs compteurs séparés
      // (window._totalExc / _totalGou alimentés par calculerConnecteurs)
      var nbExc = parseInt(window._totalExc || 0, 10);
      var nbGou = parseInt(window._totalGou || 0, 10);
      if (pExc > 0 && nbExc > 0) ajout('Excentriques EC03', nbExc + ' unités', nbExc, pExc);
      if (pGou > 0 && nbGou > 0) ajout('Goujons',           nbGou + ' unités', nbGou, pGou);
    }
  }

  // ── Tiroirs & taquets ─────────────────────────────────────────
  var nbTir = 0, nbEtag = 0;
  var items = window._itemsCache || [];
  for (var t = 0; t < items.length; t++) {
    if (items[t].type === 'tiroir')  nbTir  += items[t].p.nombre;
    if (items[t].type === 'etagere') nbEtag += items[t].p.nombre;
  }
  if (nbTir  > 0 && pTir > 0) ajout(cfgCoul.nom + ' (tiroirs)',  nbTir + ' × ' + cfgCoul.nom, nbTir, pTir);
  if (nbEtag > 0 && pTaq > 0) ajout('Taquets étagères', nbEtag * 4 + ' taquets (4×' + nbEtag + ')', nbEtag * 4, pTaq);

  // ── Livraison (frais fixe) ────────────────────────────────────
  var pLivr = parseFloat((document.getElementById('prixLivraison')||{}).value) || 0;
  if (pLivr > 0) ajout('Livraison', 'forfait', 1, pLivr);

  // ── Totaux ────────────────────────────────────────────────────
  var pV   = Math.round(st * coeff * 100) / 100;
  var pTTC = Math.round(pV * (1 + tva / 100) * 100) / 100;
  var marge = Math.round((pV - st) * 100) / 100;

  document.getElementById('prixSousTotal').textContent = st.toFixed(2)   + ' €';
  document.getElementById('prixVente').textContent     = pV.toFixed(2)   + ' €';
  document.getElementById('prixTTC').textContent       = pTTC.toFixed(2) + ' €';
  document.getElementById('prixMarge').textContent     = marge.toFixed(2)+ ' €';
  document.getElementById('badgeCout').textContent     = pV.toFixed(0)   + ' € HT';

  // ── Tableau détail ────────────────────────────────────────────
  var tbody = document.getElementById('tbodyPrix');
  tbody.innerHTML = '';
  for (var jj = 0; jj < lignes.length; jj++) {
    var l = lignes[jj];
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px"><b>' + l.poste + '</b></td>' +
      '<td style="font-size:10px;color:#666">' + l.detail + '</td>' +
      '<td>' + (typeof l.qte === 'number' ? l.qte.toFixed(2) : l.qte) + '</td>' +
      '<td>' + l.pu.toFixed(2) + ' €</td><td><b>' + l.tot.toFixed(2) + ' €</b></td>';
    tbody.appendChild(tr);
  }
  var trST = document.createElement('tr'); trST.style.background = '#f5f2ee';
  trST.innerHTML = '<td colspan="4" style="font-weight:bold;text-align:right">Sous-total</td><td><b>' + st.toFixed(2) + ' €</b></td>';
  tbody.appendChild(trST);
  var trCV = document.createElement('tr'); trCV.style.background = '#f0e8d8';
  trCV.innerHTML = '<td colspan="4" style="font-weight:bold;text-align:right">× Coefficient ' + coeff + '</td><td><b>' + pV.toFixed(2) + ' € HT</b></td>';
  tbody.appendChild(trCV);
  var trTTC = document.createElement('tr'); trTTC.style.background = '#e8f0e0';
  trTTC.innerHTML = '<td colspan="4" style="font-weight:bold;text-align:right">TVA ' + tva + '%</td><td><b>' + pTTC.toFixed(2) + ' € TTC</b></td>';
  tbody.appendChild(trTTC);

  document.getElementById('prixResultat').classList.remove('hidden');
  afficherStickyBar(window._meubles.map(function (m) { return m.nom; }).join(' + ') + ' — ' + pV.toFixed(0) + ' € HT');
}
