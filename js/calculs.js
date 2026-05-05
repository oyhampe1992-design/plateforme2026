/* ================================================================
   THE WOODER - calculs.js
   ================================================================
   Fonctions metier de calcul d'un meuble :
     - classifierMontants(items)  - distingue montants pleins
                                     vs petits montants etagere
     - calculerChant(items)       - ml de chant total
     - calculerPercages(items)    - systeme 32 + tourillons adjacents
     - calculerRainures(items)    - rainures fond
     - calculerConnecteurs(items) - excentriques, goujons, Clamex,
                                     Cabineo, biscuits
     - calculerCharnieres(items)  - cuvettes Ø35 + fixations Ø5
     - calculerFonds(items)       - dimensions fonds 8mm par colonne

   Plus helpers : nbCharn, posCharn, posPercBout.

   Alimente les globales window._* qui sont consommees ensuite par
   cutlist, prix, gcode, dxf.

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     esc(s)                       - escape HTML
     ouvrirSection(id)            - ouvre une section repliable
     getTD(type)                  - retourne la config d'affichage
                                     d'un type de piece
     bC(type)                     - classe CSS pour badge couleur

   Constantes globales :
     RAIN_DIST_BORD, RAIN_LARGEUR,
     RAIN_PROF_MONTANT, RAIN_PROF_LATERAL,
     EXC_AVANT, TOU_AVANT,
     DIAM, DIAM_EXC, DIAM_TOU, PROF_TOU, PROF_TOU2,
     BORD, PAS,
     TYPE_CONNECTEUR,
     BISCUIT_LARG, BISCUIT_LONG, BISCUIT_SEUIL,
     CLAMEX_*, CAB_*, FOND_EPAISSEUR,
     TRAIT

   Variables globales :
     LECTURES : window._meubles, window._colonnesOrdre
     ECRITURES : window._hMontantPlein, window._percDets,
                 window._tourillonsAdjacents, window._profMeubleRain,
                 window._rainures, window._piecesRain,
                 window._mXPos, window._totalExc, window._totalGou,
                 window._liaisons, window._charnDets, window._fonds

   ----------------------------------------------------------------
   Usage : appele dans l'ordre depuis lancerCalcul :
     classifierMontants -> calculerChant -> calculerPercages ->
     calculerRainures -> calculerConnecteurs -> calculerCharnieres ->
     calculerFonds -> (ensuite calculerTiroirs, calculerCutlist...)
   ================================================================ */

// ════════════════════════════════════════════════════════════════
// CHANT
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// CLASSIFICATION DES MONTANTS INTERMÉDIAIRES
// ════════════════════════════════════════════════════════════════
// Un montant "plein" (avec rainure fond + excentriques 32mm) est celui dont
// la longueur correspond à la hauteur intérieure du meuble selon la plinthe :
//   - Plinthe encastrée : hLat - ep_sup - ep_inf - hPlinthe
//   - Plinthe en applique: hLat - ep_sup - hPlinthe (le fond de la plinthe est libre)
//   - Sans plinthe      : hLat - ep_sup - ep_inf
// Tout autre montant est un "petit montant étagère" :
//   profondeur = profEtag, percages = tourillons (pas d'excentriques, pas de rainure)
function classifierMontants(items) {
  var ep0  = parseFloat(document.getElementById('epaisseur').value) || 19;
  var tp   = document.getElementById('typePlinthe').value;
  var hLat = 0, hPl = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type === 'lateral') hLat = Math.max(items[i].p.longueur, items[i].p.largeur);
    if (items[i].type === 'plinthe') hPl  = Math.min(items[i].p.longueur, items[i].p.largeur);
  }
  // Hauteur attendue d'un montant plein (tolérance ±5mm pour arrondi PDF)
  var hPlein;
  if (tp === 'encastree') hPlein = hLat - ep0 - ep0 - hPl;
  else if (tp === 'applique') hPlein = hLat - ep0 - hPl;
  else hPlein = hLat - ep0 - ep0; // sans plinthe
  for (var j = 0; j < items.length; j++) {
    if (items[j].type !== 'montant') continue;
    var hM = Math.max(items[j].p.longueur, items[j].p.largeur);
    items[j]._montantType = (Math.abs(hM - hPlein) <= 5) ? 'plein' : 'etagere';
  }
  window._hMontantPlein = hPlein;
}

function calculerChant(items) {
  var totP = 0, totE = 0, dets = [];

  for (var i = 0; i < items.length; i++) {
    var p    = items[i].p;
    var type = items[i].type;
    var prof = items[i].prof || 600;
    var nb   = p.nombre;
    var c = 0, n = '';

    if (type === 'porte' || type === 'tiroir') {
      c = (p.longueur + p.largeur) * 2; n = '4 côtés'; totP += c * nb;
    } else if (type === 'plinthe') {
      c = p.longueur * 2 + p.largeur;   n = '2×long+1×larg'; totE += c * nb;
    } else if (type === 'lateral' || type === 'montant' || type === 'panneau' || type === 'etagere') {
      c = p.longueur <= prof ? p.largeur : p.longueur;
      n = 'Chant ' + (p.longueur <= prof ? 'larg.' : 'long.') + ' (' + c + 'mm)';
      totE += c * nb;
    }
    dets.push({ p: p, type: type, meuble: items[i].meuble, c: c, tot: c * nb, n: n });
  }

  var net = (totP + totE) / 1000;
  document.getElementById('chantNet').textContent    = net.toFixed(2) + ' ml';
  document.getElementById('chantPlus').textContent   = (net * 1.1).toFixed(2) + ' ml';
  document.getElementById('chantPortes').textContent = (totP / 1000).toFixed(2) + ' ml';
  document.getElementById('chantEtag').textContent   = (totE / 1000).toFixed(2) + ' ml';
  document.getElementById('badgeChant').textContent  = net.toFixed(1) + ' ml';

  var tbody = document.getElementById('tbodyChant');
  var dernM = null;
  for (var j = 0; j < dets.length; j++) {
    var d = dets[j];
    if (!d.c) continue;
    if (window._meubles.length > 1 && d.meuble !== dernM) {
      dernM = d.meuble;
      var trS = document.createElement('tr');
      trS.innerHTML = '<td colspan="7" style="background:#f5f2ee;font-size:10px;color:var(--gold);text-transform:uppercase;padding:5px 10px">' + esc(d.meuble) + '</td>';
      tbody.appendChild(trS);
    }
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(d.p.designation) + '</td>' +
      '<td><span class="badge ' + bC(d.type) + '">' + getTD(d.type).lab + '</span></td>' +
      '<td>' + d.c.toFixed(1) + ' mm</td><td>' + d.p.nombre + '</td>' +
      '<td>' + d.tot.toFixed(0) + ' mm</td><td>' + (d.tot / 1000).toFixed(3) + ' ml</td>' +
      '<td style="font-size:10px;color:#888">' + d.n + '</td>';
    tbody.appendChild(tr);
  }
  ouvrirSection('secChant');
}

// ════════════════════════════════════════════════════════════════
// PERÇAGES 32mm
// ════════════════════════════════════════════════════════════════
function calculerPercages(items) {
  var percDets = [], totalT = 0, nbPerc = 0;

  for (var i = 0; i < items.length; i++) {
    var p    = items[i].p;
    var type = items[i].type;
    var td   = getTD(type);
    if (!td.perc) continue;

    var iEp  = items[i].ep      || 19;
    var iDeb = items[i].debLat  || 96;
    var iMB  = items[i].margeBas || 100;
    var hP   = Math.max(p.longueur, p.largeur);
    // Petit montant étagère → 1 tourillon en haut et 1 en bas (centré, pas de trame 32)
    var estPetitMontant = (type === 'montant' && items[i]._montantType === 'etagere');
    var debut = estPetitMontant ? 0 : Math.max(0, type === 'lateral' ? iDeb : iDeb - iEp);
    var nbR  = estPetitMontant ? 1 : (td.rang || 2);

    var posY = [];
    if (estPetitMontant) {
      // 2 tourillons : 1 en haut à 15mm, 1 en bas à hP-15mm
      posY = [15, Math.max(16, hP - 15)];
    } else {
      var y = debut;
      while (y <= hP - iMB) { posY.push(parseFloat(y.toFixed(1))); y += PAS; }
    }

    var nbT = posY.length * nbR * p.nombre;
    totalT += nbT; nbPerc += p.nombre;
    percDets.push({
      p: p, type: type, rang: nbR,
      _montantType: items[i]._montantType || null,
      nbTR: posY.length, nbTT: nbT,
      premier: debut,
      dernier: posY.length > 0 ? posY[posY.length - 1] : 0,
      ecart:   posY.length > 0 ? Math.round(hP - posY[posY.length - 1]) : 0,
      posY: posY, ep: iEp, debLat: iDeb, margeBas: iMB
    });
  }

  document.getElementById('percTotal').textContent  = totalT;
  document.getElementById('percPieces').textContent = nbPerc;
  document.getElementById('badgeDXF').textContent   = totalT + ' trous';

  var tbody = document.getElementById('tbodyPerc');
  for (var k = 0; k < percDets.length; k++) {
    var d = percDets[k];
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(d.p.designation) + '</td>' +
      '<td><span class="badge ' + bC(d.type) + '">' + getTD(d.type).lab + '</span></td>' +
      '<td>' + d.rang + '</td><td>' + d.nbTR + '</td>' +
      '<td><b>' + d.nbTT + '</b> (×' + d.p.nombre + ')</td>' +
      '<td>' + d.premier + ' mm</td><td>' + d.dernier + ' mm</td><td>' + d.ecart + ' mm</td>' +
      '<td><button class="btn btn-white btn-sm" onclick="telechargerDXF(' + k + ')">DXF</button></td>';
    tbody.appendChild(tr);
  }
  window._percDets = percDets;

  // ── Identifier les pièces adjacentes aux petits montants ─────
  // Un petit montant est connecté en haut et en bas aux étagères ou panneaux
  // On stocke dans window._tourillonsAdjacents la liste des perçages à faire
  // sur les pièces adjacentes (Ø6, prof.12mm)
  var petitsMontants = percDets.filter(function(d) { return d._montantType === 'etagere'; });
  var adjacents = [];
  if (petitsMontants.length > 0) {
    // Pour chaque petit montant, sa largeur = profEtag
    // Les pièces adjacentes sont les étagères et panneaux sup/inf
    // Position X du tourillon sur la pièce adjacente = position du montant dans la largeur du meuble
    // On stocke les infos pour générer les DXF
    for (var pm = 0; pm < petitsMontants.length; pm++) {
      var dPM = petitsMontants[pm];
      var lPM = Math.min(dPM.p.longueur, dPM.p.largeur); // largeur du petit montant = profEtag
      // Pièces adjacentes = étagères de même longueur ou panneaux sup/inf
      for (var ai = 0; ai < items.length; ai++) {
        var itAdj = items[ai];
        var tAdj  = itAdj.type;
        if (tAdj !== 'etagere' && tAdj !== 'panneau') continue;
        var lAdj = Math.min(itAdj.p.longueur, itAdj.p.largeur);
        // Pièce adjacente si sa largeur est ≥ profEtag (elle reçoit le petit montant)
        if (lAdj >= lPM - 5) {
          // X du tourillon sur pièce adjacente = centré sur sa largeur (lAdj)
          // en pratique positionné à mi-profondeur de la pièce adjacente
          var xTou = lAdj / 2;
          var deja = false;
          for (var dx = 0; dx < adjacents.length; dx++) {
            if (adjacents[dx].p === itAdj.p && Math.abs(adjacents[dx].xTou - xTou) < 1) { deja = true; break; }
          }
          if (!deja) adjacents.push({ p: itAdj.p, type: tAdj, xTou: xTou, sourceMontant: dPM.p.designation });
        }
      }
    }
  }
  window._tourillonsAdjacents = adjacents;

  document.getElementById('btnZipPerc').onclick = telechargerTousZip;
  ouvrirSection('secDXF');
}

// ════════════════════════════════════════════════════════════════
// RAINURES FOND
// ════════════════════════════════════════════════════════════════
function calculerRainures(items) {
  // Profondeur depuis les latéraux
  var profMeuble = 600;
  for (var k = 0; k < items.length; k++) {
    if (items[k].type === 'lateral') {
      profMeuble = Math.min(items[k].p.longueur, items[k].p.largeur);
      break;
    }
  }
  window._profMeubleRain = profMeuble;
  window._rainures = { profMeuble: profMeuble, distBord: RAIN_DIST_BORD };

  var pR = [], totalL = 0;
  for (var i = 0; i < items.length; i++) {
    var p = items[i].p, type = items[i].type;
    if (type !== 'lateral' && type !== 'montant' && type !== 'panneau') continue;
    // Petits montants étagère → pas de rainure fond
    if (type === 'montant' && items[i]._montantType === 'etagere') continue;
    var hP = Math.max(p.longueur, p.largeur);
    totalL += hP * p.nombre;
    pR.push({ p: p, type: type, hPiece: hP, lPiece: profMeuble, lOrigine: Math.min(p.longueur, p.largeur) });
  }

  document.getElementById('rainNb').textContent    = pR.length;
  document.getElementById('rainTotal').textContent = (totalL / 1000).toFixed(2) + ' ml';

  var tbody = document.getElementById('tbodyRain');
  for (var j = 0; j < pR.length; j++) {
    var d = pR[j];
    var corr = d.lOrigine !== d.lPiece ? ' (corrigé ' + d.lOrigine + '→' + d.lPiece + 'mm)' : '';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(d.p.designation) + '</td>' +
      '<td>' + d.lPiece + ' mm' + corr + '</td><td>' + d.hPiece + ' mm</td>' +
      '<td>' + (d.lPiece - RAIN_DIST_BORD) + ' mm depuis bord avant</td><td>' + RAIN_LARGEUR + ' mm</td><td>' + (d.type === 'montant' ? RAIN_PROF_MONTANT : RAIN_PROF_LATERAL) + ' mm</td>' +
      '<td><button class="btn btn-white btn-sm" onclick="telechargerDXFRain(' + j + ')">DXF</button></td>';
    tbody.appendChild(tr);
  }
  window._piecesRain = pR;
  document.getElementById('btnZipRain').onclick = telechargerZipRain;
  document.getElementById('resRainCard').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════════════
// CONNECTEURS — positions de perçage
// ════════════════════════════════════════════════════════════════
// Règle universelle : 4 trous par bout de connexion, dans la profondeur (axe X) :
//   Excentrique Ø15mm : X = 100mm et X = lP-100mm
//   Goujon M6 (Ø5mm)  : X = 140mm et X = lP-140mm
var EXC_AVANT  = 100;  // excentrique Ø15, 100mm depuis bord avant
var TOU_AVANT  = 140;  // tourillon M6, 140mm depuis bord avant
var DIAM_EXC   = 15;   // diamètre excentrique
// DIAM_TOU = 6 et DIAM = 5 déjà définis

// Retourne les positions X des 4 trous dans la profondeur lP
// { exc: [100, lP-100], tou: [140, lP-140] }
function posPercBout(lP) {
  return {
    exc: [EXC_AVANT, lP - EXC_AVANT],
    tou: [TOU_AVANT, lP - TOU_AVANT]
  };
}

function calculerConnecteurs(items) {
  var tp  = document.getElementById('typePlinthe').value;
  var ep0 = parseFloat(document.getElementById('epaisseur').value) || 19;

  var lPl = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type === 'plinthe') { lPl = Math.min(items[i].p.longueur, items[i].p.largeur); break; }
  }
  // yBas = hauteur depuis le bas du latéral où se trouve le centre du panneau inf
  var yBas = tp === 'encastree' ? lPl + ep0/2 : tp === 'applique' ? lPl - ep0 + ep0/2 : ep0/2;

  // Collecter les pièces
  // Récupérer la profondeur du meuble depuis les latéraux
  var profMeubleConn = 600;
  for (var i0 = 0; i0 < items.length; i0++) {
    if (items[i0].type === 'lateral') {
      profMeubleConn = Math.min(items[i0].p.longueur, items[i0].p.largeur);
      break;
    }
  }
  var etag = [], panSup = null, panInf = null, monts = [], lats = [];
  for (var j = 0; j < items.length; j++) {
    var p = items[j].p, type = items[j].type;
    if (type === 'etagere') {
      // La largeur de colonne = la dimension qui N'est PAS la profondeur du meuble
      var dL = Math.abs(p.longueur - profMeubleConn);
      var dW = Math.abs(p.largeur  - profMeubleConn);
      var le = (dL < dW) ? p.largeur : p.longueur; // colonne = dim la plus éloignée de profMeuble
      var deja = false;
      for (var kk = 0; kk < etag.length; kk++) { if (etag[kk] === le) { deja = true; break; } }
      if (!deja) etag.push(le);
    }
    if (type === 'panneau') {
      if (!panSup) panSup = { p: p, lon: Math.max(p.longueur, p.largeur), lar: Math.min(p.longueur, p.largeur) };
      else         panInf = { p: p, lon: Math.max(p.longueur, p.largeur), lar: Math.min(p.longueur, p.largeur) };
    }
    if (type === 'montant') monts.push({ p: p, lon: Math.max(p.longueur, p.largeur), lar: Math.min(p.longueur, p.largeur) });
    if (type === 'lateral') lats.push({ p: p, lon: Math.max(p.longueur, p.largeur), lar: Math.min(p.longueur, p.largeur) });
  }

  // Positions des montants sur la longueur du panneau
  // Si l'utilisateur a défini un ordre de colonnes → l'utiliser
  // Sinon → ordre auto depuis le tableau etag[]
  var colOrdre = window._colonnesOrdre;
  var mXPos = [], xC = 0;
  for (var m = 0; m < monts.length; m++) {
    // Largeur de la colonne à gauche du montant m
    var larCol;
    if (colOrdre && colOrdre.length > m && colOrdre[m] !== null) {
      larCol = colOrdre[m];
    } else if (etag[m]) {
      larCol = etag[m];
    } else {
      // Colonne vide : largeur par déduction
      var lonPanDeduct = 0;
      for (var ki=0; ki<items.length; ki++) {
        if (items[ki].type==='panneau') { lonPanDeduct=Math.max(items[ki].p.longueur,items[ki].p.largeur); break; }
      }
      var sommeCols = monts.length * ep0; // montants intermédiaires seulement
      for (var ci2=0; ci2<(colOrdre||etag).length; ci2++) {
        var v = colOrdre ? colOrdre[ci2] : etag[ci2];
        if (v) sommeCols += v;
      }
      larCol = Math.max(0, lonPanDeduct - sommeCols);
    }
    xC += larCol + ep0;
    mXPos.push(xC - Math.round(ep0 / 2));
  }
  window._mXPos = mXPos;

  var liais = [];

  // ── LATÉRAUX ──────────────────────────────────────────────────
  // 1 entrée par latéral couvrant les 2 bouts (haut + bas) → 1 seul DXF par pièce
  // Seulement goujons (pas d'excentriques Ø15)
  // Y haut = ep/2 depuis le haut | Y bas = hPlinthe + ep/2 depuis le bas
  for (var li0 = 0; li0 < lats.length; li0++) {
    var lat = lats[li0];
    var lP_lat = lat.lar;
    var pos_lat = posPercBout(lP_lat);
    liais.push({ designation: lat.p.designation, type_piece: 'lateral',
      liaison: 'Latéral — goujons haut + bas',
      yDepuisHaut: ep0/2, yDepuisBas: yBas,
      profondeur: lP_lat, largeur: lat.lon,
      tou: pos_lat.tou });
  }

  // ── PANNEAUX SUP / INF ─────────────────────────────────────────
  // Bouts : excentriques Ø15 + goujons (connexion latéraux)
  // Montants : goujons seulement (excentriques sont dans le montant)
  if (panSup) {
    var lP_sup = panSup.lar;
    var pos_sup = posPercBout(lP_sup);
    liais.push({ designation: panSup.p.designation, type_piece: 'panneau_sup',
      liaison: 'Panneau sup — bouts (exc.Ø15 + goujons) + montants (goujons)',
      profondeur: lP_sup, largeur: panSup.lon,
      exc: pos_sup.exc, tou: pos_sup.tou,
      xMonts: mXPos });
  }
  if (panInf) {
    var lP_inf = panInf.lar;
    var pos_inf = posPercBout(lP_inf);
    liais.push({ designation: panInf.p.designation, type_piece: 'panneau_inf',
      liaison: 'Panneau inf — bouts (exc.Ø15 + goujons) + montants (goujons)',
      profondeur: lP_inf, largeur: panInf.lon,
      exc: pos_inf.exc, tou: pos_inf.tou,
      xMonts: mXPos });
  }

  // ── MONTANTS INTERMÉDIAIRES ────────────────────────────────────
  // 1 entrée par montant couvrant les 2 bouts (haut + bas) → 1 seul DXF par pièce
  // Excentriques Ø15 + goujons aux bouts haut et bas
  // Y = ep + ep/2 depuis chaque bout
  for (var mi2 = 0; mi2 < monts.length; mi2++) {
    var mt = monts[mi2];
    var lP_mt = mt.lar;
    var pos_mt = posPercBout(lP_mt);
    var xM = mXPos[mi2] || 0;
    liais.push({ designation: mt.p.designation, type_piece: 'montant',
      liaison: 'Montant — exc.Ø15 + goujons haut + bas',
      yDepuisHaut: ep0 + ep0/2, yDepuisBas: ep0 + ep0/2,
      profondeur: lP_mt, largeur: mt.lon,
      exc: pos_mt.exc, tou: pos_mt.tou, xMont: xM });
  }


  var totalConn = 0;
  var isCab = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
  // Latéraux et montants ont désormais 1 seule liaison couvrant haut + bas
  // → multiplicateur 2 pour rétablir les totaux corrects
  function nbSides(l) {
    return (l.type_piece === 'lateral' || l.type_piece === 'montant') ? 2 : 1;
  }
  if (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14') {
    // En mode Clamex : 2 Clamex par bout. Latéral/montant = 2 bouts par liaison.
    liais.forEach(function (l) { totalConn += 2 * nbSides(l); });
  } else if (isCab) {
    // En mode Cabineo : logique identique aux excentriques (sans tourillon).
    // Pièce MÂLE (reçoit la poche multi-cercle) = panneau_sup, panneau_inf, montant
    // Pièce FEMELLE (reçoit trou Ø5)            = lateral
    // Panneau : mâle aux 2 bouts                       → nbCab × 2
    // Montant : mâle aux 2 bouts (haut + bas mergés)   → nbCab × 2
    // Latéral : femelle                                → 0
    liais.forEach(function (l) {
      var nbHere;
      if (CAB_NB_BOUT === 'auto') nbHere = ((l.profondeur || 0) > CAB_SEUIL) ? 3 : 2;
      else nbHere = parseInt(CAB_NB_BOUT, 10) || 2;
      if (l.type_piece === 'panneau_sup' || l.type_piece === 'panneau_inf') {
        l.nbCab = nbHere * 2;
        totalConn += nbHere * 2;
      } else if (l.type_piece === 'montant') {
        l.nbCab = nbHere * 2;
        totalConn += nbHere * 2;
      } else {
        l.nbCab = 0;
      }
    });
  } else {
    // Excentrique + tourillon — comptage précis des pièces physiques à acheter.
    //
    // EXCENTRIQUES (2 positions par bout : EXC_AVANT et lP - EXC_AVANT)
    //   - Panneau sup/inf : 2 bouts (gauche/droite) × 2 positions = 4 par panneau
    //   - Montant         : 2 bouts (haut/bas)     × 2 positions = 4 par montant
    //   - Latéral         : 0 (côté latéral, pas d'excentrique — seulement goujons)
    //
    // GOUJONS (2 positions par bout : TOU_AVANT et lP - TOU_AVANT)
    //   Chaque goujon traverse 2 pièces, donc chaque goujon correspond à 2 trous
    //   (1 dans chaque pièce jointe). On compte les trous puis on divise par 2.
    //   - Panneau : bouts (4 trous) + chaque position de montant (2 trous par montant)
    //   - Latéral : bouts (4 trous)
    //   - Montant : bouts (4 trous)
    var totalExc = 0, totalGouHoles = 0;
    liais.forEach(function (l) {
      if (l.type_piece === 'panneau_sup' || l.type_piece === 'panneau_inf') {
        totalExc      += 4;
        totalGouHoles += 4 + 2 * (l.xMonts ? l.xMonts.length : 0);
      } else if (l.type_piece === 'montant') {
        totalExc      += 4;
        totalGouHoles += 4;
      } else if (l.type_piece === 'lateral') {
        totalGouHoles += 4;
      }
    });
    var totalGou = totalGouHoles / 2;
    totalConn = totalExc + totalGou;
    window._totalExc = totalExc;
    window._totalGou = totalGou;
  }
  document.getElementById('connTotal').textContent    = totalConn;
  document.getElementById('connLiaisons').textContent = liais.length;

  // Debug : avertir si aucune liaison détectée
  if (liais.length === 0) {
    var tbodyDbg = document.getElementById('tbodyConn');
    tbodyDbg.innerHTML = '<tr><td colspan="6" style="padding:12px;text-align:center;color:#888;font-size:11px">⚠ Aucune liaison détectée. Vérifiez qu\'il y a bien des latéraux ET des panneaux sup/inf dans votre projet.</td></tr>';
  }

  var tbody = document.getElementById('tbodyConn');
  var isClamex = (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14');
  var isCabRender = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
  var cabLabel = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';
  for (var li = 0; li < liais.length; li++) {
    var l = liais[li];
    var yI;
    if (l.yDepuisHaut !== undefined && l.yDepuisBas !== undefined) {
      yI = 'H:' + l.yDepuisHaut.toFixed(1) + ' / B:' + l.yDepuisBas.toFixed(1) + 'mm';
    } else if (l.yDepuisHaut !== undefined) {
      yI = l.yDepuisHaut.toFixed(1) + 'mm depuis haut';
    } else if (l.yDepuisBas !== undefined) {
      yI = l.yDepuisBas.toFixed(1) + 'mm depuis bas';
    } else {
      yI = '—';
    }
    var detailsCol;
    var nbAff;
    if (isClamex) {
      var profL = l.profondeur || 0, lonL = l.largeur || 0;
      var hasBiscuit = (TYPE_CONNECTEUR === 'clamex_biscuit' && lonL > BISCUIT_SEUIL && profL > BISCUIT_SEUIL);
      detailsCol = 'Clamex: ' + CLAMEX_AVANT + ', ' + (profL - CLAMEX_AVANT) + 'mm' + (hasBiscuit ? ' | Biscuit #20 centre' : '');
      nbAff = hasBiscuit ? '2 Clamex + 1 biscuit' : '2 Clamex';
    } else if (isCabRender) {
      var isMaleR = (l.type_piece === 'panneau_sup' || l.type_piece === 'panneau_inf' || l.type_piece === 'montant');
      var profC = l.profondeur || 0;
      if (isMaleR) {
        detailsCol = CAB_NB_FORAGES + '×Ø' + CAB_DIAM_FORAGE + ' sur ' + CAB_POCHE_L + 'mm prof.' + CAB_POCHE_D + ' | ' + (l.nbCab || 2) + ' poches à ' + CAB_AVANT + 'mm bord';
        nbAff = (l.nbCab || 0) + ' × ' + cabLabel;
      } else {
        detailsCol = 'Trous Ø' + CAB_HOLE + ' sur chant | pos ' + CAB_AVANT + ', ' + (profC - CAB_AVANT) + 'mm';
        nbAff = '— (trous chant)';
      }
    } else {
      detailsCol = (l.exc ? 'Exc: '+l.exc.join(', ')+'mm | Gou: '+l.tou.join(', ')+'mm' : l.tou ? 'Gou: '+l.tou.join(', ')+'mm' : '—');
      nbAff = l.nbConn || (l.exc ? 4 : 2);
    }
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(l.designation) + '</td>' +
      '<td style="font-size:11px">' + l.liaison + (l.xMont ? ' — X:' + l.xMont + 'mm' : '') + '</td>' +
      '<td>' + nbAff + '</td>' +
      '<td style="font-size:11px">' + detailsCol + '</td>' +
      '<td style="font-size:11px">' + yI + '</td>' +
      '<td><button class="btn btn-white btn-sm" onclick="telechargerDXFConn(' + li + ')">DXF</button></td>';
    tbody.appendChild(tr);
  }
  window._liaisons = liais;
  document.getElementById('resConnCard').classList.remove('hidden');
  document.getElementById('btnZipConn').onclick = telechargerZipConn;
}

// ════════════════════════════════════════════════════════════════
// CHARNIÈRES BLUM INSERTA
// ════════════════════════════════════════════════════════════════
function nbCharn(h) {
  return h <= 900 ? 2 : h <= 1400 ? 3 : h <= 1900 ? 4 : 5;
}

function posCharn(hPorte, nb, yPD) {
  var demi = PAS / 2;
  var nP   = Math.max(0, Math.ceil((yPD + 100 - 96 - demi) / PAS));
  var premTrame = 96 + nP * PAS;
  var premY = (premTrame + demi) - yPD;

  var yFin = yPD + hPorte;
  var nD   = Math.floor((yFin - 100 - 96 - demi) / PAS);
  nD = Math.max(0, nD);
  while ((96 + nD * PAS + demi) - yPD > hPorte - 100 && nD > 0) nD--;
  var dernTrame = 96 + nD * PAS;
  var dernY = (dernTrame + demi) - yPD;

  // Garantir des positions valides
  premY = Math.max(premY, 80);
  dernY = Math.min(dernY, hPorte - 80);
  if (dernY <= premY + 20) dernY = premY + Math.round((hPorte - premY) * 0.85);

  var pos = [];
  if (nb === 1) {
    pos = [Math.round((premY + dernY) / 2)];
  } else if (nb === 2) {
    pos = [Math.round(premY), Math.round(dernY)];
  } else {
    pos = [Math.round(premY)];
    var ec = (dernTrame - premTrame) / (nb - 1);
    for (var i = 1; i < nb - 1; i++) {
      var yA = 96 + Math.round((premTrame + ec * i - 96) / PAS) * PAS;
      pos.push(Math.round((yA + demi) - yPD));
    }
    pos.push(Math.round(dernY));
  }
  return pos.filter(function (y) { return y > 0 && y < hPorte; });
}

function calculerCharnieres(items) {
  var ep0 = parseFloat(document.getElementById('epaisseur').value) || 19;
  var cd = [], totalC = 0;

  // Détecter la plinthe
  var hPl = 0;
  for (var pi = 0; pi < items.length; pi++) {
    if (items[pi].type === 'plinthe') { hPl = Math.min(items[pi].p.longueur, items[pi].p.largeur); break; }
  }
  var tp = document.getElementById('typePlinthe').value;

  for (var i = 0; i < items.length; i++) {
    var p = items[i].p, type = items[i].type, sens = items[i].sens || 'gauche';
    if (type !== 'porte') continue;

    var iTP  = items[i].typePortes || 'applique';
    var iEp  = items[i].ep || ep0;
    var jH   = iTP === 'encastree' ? 3 : 1.5;
    // yPD = position du bas de la porte sur le latéral
    // encastrée : plinthe + panneau inf + jeu
    // applique  : plinthe + jeu (la porte recouvre le panneau inf)
    var yPD;
    if (iTP === 'encastree') {
      yPD = hPl + iEp + jH;
    } else {
      yPD = hPl + jH;
    }
    var hP   = Math.max(p.longueur, p.largeur);
    var lP   = Math.min(p.longueur, p.largeur);
    var nb   = nbCharn(hP);
    var py   = posCharn(hP, nb, yPD);
    var axG  = 22.5, axD = lP - 22.5;

    if (sens === 'paire') {
      totalC += nb * 2;
      cd.push({ p: p, hPorte: hP, lPorte: lP, nb: nb, posY: py, axisCuvette: axG, sens: 'gauche', label: p.designation + ' (gauche)' });
      cd.push({ p: p, hPorte: hP, lPorte: lP, nb: nb, posY: py, axisCuvette: axD, sens: 'droite', label: p.designation + ' (droite)' });
    } else {
      totalC += nb * p.nombre;
      cd.push({ p: p, hPorte: hP, lPorte: lP, nb: nb, posY: py, axisCuvette: sens === 'droite' ? axD : axG, sens: sens, label: p.designation + ' (' + sens + ')' });
    }
  }

  document.getElementById('charnTotal').textContent  = totalC;
  document.getElementById('charnPortes').textContent = cd.length;

  var tbody = document.getElementById('tbodyCharn');
  for (var j = 0; j < cd.length; j++) {
    var d = cd[j], tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(d.label) + '</td>' +
      '<td>' + d.hPorte + ' mm</td><td>' + d.lPorte + ' mm</td>' +
      '<td><b>' + d.nb + '</b></td>' +
      '<td style="font-size:11px">' + d.posY.map(function (y) { return y + 'mm'; }).join(' — ') + '</td>' +
      '<td>' + d.axisCuvette.toFixed(1) + ' mm (' + (d.sens === 'droite' ? 'bord droit' : 'bord gauche') + ')</td>' +
      '<td><button class="btn btn-white btn-sm" onclick="telechargerDXFPorte(' + j + ')">DXF</button></td>';
    tbody.appendChild(tr);
  }
  window._charnDets = cd;
  document.getElementById('btnZipCharn').onclick = telechargerZipCharn;
  document.getElementById('resCharnCard').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════════════
// FONDS DE MEUBLE
// ════════════════════════════════════════════════════════════════
function calculerFonds(items) {
  var ep0       = parseFloat(document.getElementById('epaisseur').value) || 19;
  var profM     = window._profMeubleRain || 600;
  var tp        = document.getElementById('typePlinthe').value;
  var hLat = 0, hPl = 0, etag = [];

  for (var i = 0; i < items.length; i++) {
    var p = items[i].p, type = items[i].type;
    if (type === 'lateral') hLat = Math.max(p.longueur, p.largeur);
    if (type === 'plinthe') hPl  = Math.min(p.longueur, p.largeur);
    if (type === 'etagere') {
      var le = Math.max(p.longueur, p.largeur);
      var deja = false; for (var k = 0; k < etag.length; k++) { if (etag[k] === le) { deja = true; break; } }
      if (!deja) etag.push(le);
    }
  }

  var yBas = tp === 'encastree' ? hPl : tp === 'applique' ? hPl - ep0 : 0;
  var hInt = Math.max(0, hLat - ep0 - ep0 - yBas);
  var cols = etag.length > 0 ? etag : [profM - 2 * ep0];
  var fonds = [], surf = 0;

  for (var c = 0; c < cols.length; c++) {
    // rG/rD = de combien le fond rentre dans la rainure de chaque côté
    // Bords extérieurs (latéraux) → profondeur rainure latéral
    // Bords intérieurs (montants) → profondeur rainure montant
    var rG = c === 0             ? RAIN_PROF_LATERAL : RAIN_PROF_MONTANT;
    var rD = c === cols.length-1 ? RAIN_PROF_LATERAL : RAIN_PROF_MONTANT;
    var lF = Math.max(10, cols[c] + rG + rD - 2);
    // Haut et bas : le fond rentre dans les rainures des panneaux sup/inf
    var rH_haut = RAIN_PROF_LATERAL;
    var rH_bas  = RAIN_PROF_LATERAL;
    var hF = Math.max(10, hInt + rH_haut + rH_bas - 2);
    surf += (lF * hF) / 1e6;
    fonds.push({
      designation: 'Fond colonne ' + (c + 1),
      longueur: hF, largeur: lF, epaisseur: FOND_EPAISSEUR, nombre: 1,
      detail: 'L:' + cols[c] + '+(' + rG + '+' + rD + ')-2=' + lF + 'mm | H:' + hInt + '+(' + rH_haut + '+' + rH_bas + ')-2=' + hF + 'mm'
    });
  }

  document.getElementById('fondNb').textContent   = fonds.length;
  document.getElementById('fondSurf').textContent = surf.toFixed(3) + ' m²';

  var tbody = document.getElementById('tbodyFond');
  for (var j = 0; j < fonds.length; j++) {
    var f = fonds[j], tr = document.createElement('tr');
    tr.innerHTML =
      '<td><b>' + esc(f.designation) + '</b></td>' +
      '<td><b>' + f.longueur + '</b></td><td><b>' + f.largeur + '</b></td>' +
      '<td>' + f.epaisseur + ' mm</td><td>' + f.nombre + '</td>' +
      '<td style="font-size:10px;color:#666">' + f.detail + '</td>';
    tbody.appendChild(tr);
  }
  window._fonds = fonds;
  document.getElementById('resFondCard').classList.remove('hidden');
}
