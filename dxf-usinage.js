/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — dxf-usinage.js
   ═══════════════════════════════════════════════════════════════════
   Génération des fichiers DXF pour l'usinage :
   - Perçages système 32 (excentriques + tourillons)
   - Rainures de fond
   - Connecteurs (Clamex P-14, Cabineo, excentrique+tourillon)
   - Charnières Blum (cuvettes Ø35 + fixations)

   ─────────────────────────────────────────────────────────────────
   DÉPENDANCES (lues depuis calcul.html)
   ─────────────────────────────────────────────────────────────────
   Constantes globales :
     BORD, PAS, DIAM, DIAM_EXC, DIAM_TOU, PROF_TOU
     RAIN_LARGEUR, RAIN_DIST_BORD, RAIN_PROF_LATERAL, RAIN_PROF_MONTANT
     BISCUIT_LARG, BISCUIT_LONG, BISCUIT_SEUIL
     CLAMEX_AVANT, CLAMEX_LONG, CLAMEX_LARG, CLAMEX_PROF,
       CLAMEX_ACCES, CLAMEX_ACCES_OFF
     CAB_AVANT, CAB_NB_BOUT, CAB_SEUIL, CAB_POCHE_L, CAB_POCHE_W,
       CAB_POCHE_D, CAB_HOLE, CAB_DIAM_FORAGE, CAB_NB_FORAGES

   Variable runtime :
     TYPE_CONNECTEUR

   Fonctions utilitaires :
     telechargerBlob(blob, nomFichier)
     nrm(texte)
     posCabineoX(profondeur, nbCab)

   Variables window._* alimentées par les fonctions de calcul :
     window._charnDets, window._liaisons, window._percDets,
     window._piecesRain, window._profMeubleRain, window._rainures,
     window._meubles

   ─────────────────────────────────────────────────────────────────
   CE FICHIER DOIT ÊTRE CHARGÉ APRÈS LE CODE PRINCIPAL DE calcul.html
   car les DXF sont générés uniquement à la demande (clic sur un bouton
   ou export ZIP), bien après que toutes les constantes et fonctions
   ci-dessus ont été définies.
   ═══════════════════════════════════════════════════════════════════ */

// ── Utilitaires DXF de base ──────────────────────────────────────
function dxfL(code, val) { return code + '\r\n' + val + '\r\n'; }

function dxfH(lP, hP) {
  var L = dxfL, o = '';
  o += L(0,'SECTION') + L(2,'HEADER');
  o += L(9,'$ACADVER') + L(1,'AC1009');
  o += L(9,'$EXTMIN') + L(10,'0.0') + L(20,'0.0') + L(30,'0.0');
  o += L(9,'$EXTMAX') + L(10, lP.toFixed(3)) + L(20, hP.toFixed(3)) + L(30,'0.0');
  o += L(9,'$INSUNITS') + L(70,'4') + L(9,'$MEASUREMENT') + L(70,'1');
  o += L(0,'ENDSEC');
  return o;
}

function dxfTbl(calques) {
  var L = dxfL, o = '';
  o += L(0,'SECTION') + L(2,'TABLES') + L(0,'TABLE') + L(2,'LAYER') + L(70, calques.length.toString());
  calques.forEach(function (c) { o += L(0,'LAYER') + L(2, c.n) + L(70,'0') + L(62, c.col) + L(6,'CONTINUOUS'); });
  o += L(0,'ENDTAB') + L(0,'ENDSEC');
  return o;
}

function dxfCont(o, W, H) {
  var L = dxfL;
  o += L(0,'LINE') + L(8,'CONTOUR') + L(10,'0.0') + L(20,'0.0') + L(30,'0.0') + L(11, W.toFixed(3)) + L(21,'0.0') + L(31,'0.0');
  o += L(0,'LINE') + L(8,'CONTOUR') + L(10, W.toFixed(3)) + L(20,'0.0') + L(30,'0.0') + L(11, W.toFixed(3)) + L(21, H.toFixed(3)) + L(31,'0.0');
  o += L(0,'LINE') + L(8,'CONTOUR') + L(10, W.toFixed(3)) + L(20, H.toFixed(3)) + L(30,'0.0') + L(11,'0.0') + L(21, H.toFixed(3)) + L(31,'0.0');
  o += L(0,'LINE') + L(8,'CONTOUR') + L(10,'0.0') + L(20, H.toFixed(3)) + L(30,'0.0') + L(11,'0.0') + L(21,'0.0') + L(31,'0.0');
  return o;
}

// Nom de fichier sécurisé
function nomF(d) { return nrm(d).replace(/[^a-z0-9_-]/g, '_').substring(0, 40); }

// Rectangle centré sur (cx, cy), dimensions (w, h), sur calque donné
function dxfRect(o, cx, cy, w, h, layer, color) {
  var L = dxfL, x1 = cx - w/2, x2 = cx + w/2, y1 = cy - h/2, y2 = cy + h/2;
  o += L(0,'LINE')+L(8,layer)+L(62,color)+L(10,x1.toFixed(3))+L(20,y1.toFixed(3))+L(30,'0.0')+L(11,x2.toFixed(3))+L(21,y1.toFixed(3))+L(31,'0.0');
  o += L(0,'LINE')+L(8,layer)+L(62,color)+L(10,x2.toFixed(3))+L(20,y1.toFixed(3))+L(30,'0.0')+L(11,x2.toFixed(3))+L(21,y2.toFixed(3))+L(31,'0.0');
  o += L(0,'LINE')+L(8,layer)+L(62,color)+L(10,x2.toFixed(3))+L(20,y2.toFixed(3))+L(30,'0.0')+L(11,x1.toFixed(3))+L(21,y2.toFixed(3))+L(31,'0.0');
  o += L(0,'LINE')+L(8,layer)+L(62,color)+L(10,x1.toFixed(3))+L(20,y2.toFixed(3))+L(30,'0.0')+L(11,x1.toFixed(3))+L(21,y1.toFixed(3))+L(31,'0.0');
  return o;
}

// ════════════════════════════════════════════════════════════════
// DXF PERÇAGES
// ════════════════════════════════════════════════════════════════
function genDXF(piece, type, rang, posY, ep, isTourillon, isFaceB) {
  var hP = Math.max(piece.longueur, piece.largeur);
  var lP = Math.min(piece.longueur, piece.largeur);
  var r  = DIAM / 2;
  var L  = dxfL;
  var o  = dxfH(lP, hP) + dxfTbl([{n:'CONTOUR',col:'7'},{n:'PERCAGES',col:'1'},{n:'RAINURE',col:'4'},{n:'INFOS',col:'3'}]);
  o += L(0,'SECTION') + L(2,'ENTITIES');
  o  = dxfCont(o, lP, hP);

  // Trous de perçage (excentriques pour latéraux/montants pleins)
  // Face B = miroir horizontal : rangées inversées
  var diamUse = isTourillon ? DIAM_TOU : DIAM;
  var r = diamUse / 2;
  var xR = isFaceB ? [lP - BORD, BORD] : [BORD, lP - BORD];
  for (var ri = 0; ri < (isTourillon ? 1 : 2); ri++) {
    for (var ti = 0; ti < posY.length; ti++) {
      o += L(0,'CIRCLE') + L(8,'PERCAGES') + L(62,'1');
      o += L(10, xR[ri].toFixed(3)) + L(20, (hP - posY[ti]).toFixed(3)) + L(30,'0.0') + L(40, r.toFixed(3));
    }
  }

  // Rainure fond — exclue pour les petits montants étagère (isTourillon)
  // Face B = miroir de la rainure
  if (!isTourillon && (type === 'lateral' || type === 'montant' || type === 'panneau')) {
    var pM  = window._rainures ? window._rainures.profMeuble : lP;
    var nom = nrm(piece.designation);
    var eD  = (type === 'lateral') && nom.indexOf('droit') > -1;
    var xR1 = eD ? (RAIN_DIST_BORD + RAIN_LARGEUR) : pM - RAIN_DIST_BORD;
    var xR2 = eD ? RAIN_DIST_BORD : pM - (RAIN_DIST_BORD + RAIN_LARGEUR);
    if (isFaceB) { xR1 = lP - xR1; xR2 = lP - xR2; }
    o += L(0,'LINE') + L(8,'RAINURE') + L(62,'4') + L(10, xR1.toFixed(3)) + L(20,'0.0') + L(30,'0.0') + L(11, xR1.toFixed(3)) + L(21, hP.toFixed(3)) + L(31,'0.0');
    o += L(0,'LINE') + L(8,'RAINURE') + L(62,'4') + L(10, xR2.toFixed(3)) + L(20,'0.0') + L(30,'0.0') + L(11, xR2.toFixed(3)) + L(21, hP.toFixed(3)) + L(31,'0.0');
  }

  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20, (hP + 15).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, piece.designation + ' ' + hP + 'x' + lP + 'x' + piece.epaisseur + 'mm');
  o += L(0,'ENDSEC') + L(0,'EOF');
  return o;
}

// ── DXF Tourillon pour petit montant intermédiaire ───────────────
// piece      : la pièce (petit montant)
// posYTop    : position Y du tourillon haut (13mm du haut)
// posYBot    : position Y du tourillon bas (13mm du bas)
// isMiroir   : si true, symétrie horizontale (face B)
function genDXFTourillonMontant(piece) {
  // Le petit montant est dessiné en DXF : largeur = lP (profondeur), hauteur = hP (longueur)
  // X = axe de la profondeur : 80mm depuis bord avant, lP-80mm depuis bord arrière
  // Y = axe de la longueur   : PROF_TOU (13mm) depuis chaque bord haut/bas
  // Centrage sur l'épaisseur : le DXF est en 2D vue de face, l'épaisseur n'apparaît pas
  // → on place les 2 tourillons sur l'axe médian en X n'est pas applicable ici,
  //   X représente la PROFONDEUR, pas l'épaisseur.
  // Convention DXF pièce : lP = profondeur (petite dim), hP = longueur (grande dim)
  // Centrage sur épaisseur = dans la 3e dimension, noté en annotation uniquement.
  var hP  = Math.max(piece.longueur, piece.largeur);
  var lP  = Math.min(piece.longueur, piece.largeur);
  var ep  = piece.epaisseur || 19;
  var L   = dxfL;
  var r   = DIAM_TOU / 2;
  // 2 tourillons par bord (haut et bas) × 2 positions en profondeur = 4 trous au total
  var xAvant  = 80;           // 80mm depuis le bord avant
  var xArriere = lP - 80;    // 80mm depuis le bord arrière
  var yHaut   = hP - PROF_TOU; // 13mm depuis bord haut
  var yBas    = PROF_TOU;      // 13mm depuis bord bas
  var o = dxfH(lP, hP) + dxfTbl([
    {n:'CONTOUR',col:'7'},
    {n:'TOURILLONS',col:'2'},
    {n:'INFOS',col:'3'}
  ]);
  o += L(0,'SECTION') + L(2,'ENTITIES');
  o  = dxfCont(o, lP, hP);
  // 2 tourillons en haut (avant + arrière)
  o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
  o += L(10, xAvant.toFixed(3))   + L(20, yHaut.toFixed(3)) + L(30,'0.0') + L(40, r.toFixed(3));
  o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
  o += L(10, xArriere.toFixed(3)) + L(20, yHaut.toFixed(3)) + L(30,'0.0') + L(40, r.toFixed(3));
  // 2 tourillons en bas (avant + arrière)
  o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
  o += L(10, xAvant.toFixed(3))   + L(20, yBas.toFixed(3))  + L(30,'0.0') + L(40, r.toFixed(3));
  o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
  o += L(10, xArriere.toFixed(3)) + L(20, yBas.toFixed(3))  + L(30,'0.0') + L(40, r.toFixed(3));
  // Annotation : centré sur épaisseur ep/2
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(hP+15).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, piece.designation + ' — 4x Tourillon Ø' + DIAM_TOU + 'mm prof.' + PROF_TOU + 'mm — centré ep. (Y=' + (ep/2).toFixed(1) + 'mm)');
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(hP+25).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, 'X avant=' + xAvant + 'mm | X arrière=' + xArriere + 'mm | Y haut=' + PROF_TOU + 'mm | Y bas=' + PROF_TOU + 'mm');
  o += L(0,'ENDSEC') + L(0,'EOF');
  return o;
}

// ── DXF Tourillon pour la pièce adjacente (étagère ou panneau) ───
// xPos : position X du centre du tourillon sur la pièce adjacente
// La profondeur est PROF_TOU2 = 12mm
function genDXFTourillonAdjacent(piece, xMontant, label) {
  // Pièce adjacente (étagère ou panneau sup/inf) vue de dessus (ou de face pour panneau)
  // Le DXF est en 2D vue de dessus : lP = longueur pièce, hP = profondeur pièce
  // xMontant = position X du montant sur la longueur de la pièce (bord du montant)
  // Tourillons : 2 par montant, à 80mm bord avant et profondeur-80mm bord arrière
  // Y (profondeur) = 80mm depuis avant, lP-80 depuis arrière → non, ici X est la longueur
  // Convention : on dessine la pièce adjacente en vue de dessus
  //   axe X = longueur de la pièce, axe Y = profondeur de la pièce
  //   tourillons positionnés à Y=80mm (bord avant) et Y=profAdj-80mm (bord arrière)
  //   centré sur épaisseur = 3e dim, noté en annotation
  var lonP = Math.max(piece.longueur, piece.largeur); // longueur
  var profAdj = Math.min(piece.longueur, piece.largeur); // profondeur
  var ep  = piece.epaisseur || 19;
  var L   = dxfL;
  var r   = DIAM_TOU / 2;
  var yAvant   = 80;              // 80mm depuis bord avant
  var yArriere = profAdj - 80;   // 80mm depuis bord arrière
  // yTou sur la pièce adjacente = PROF_TOU2 = 12mm depuis son bord de connexion
  // Le bord de connexion correspond au bord Y dans la vue de dessus
  // On positionne le tourillon à yTou depuis le bord de la pièce
  var yTou = PROF_TOU2; // 12mm depuis le bord (dans la longueur de la pièce = axe X ici)
  // Recadrage : vue de face de la pièce adjacente
  // axe X = longueur, axe Y = profondeur
  var o = dxfH(lonP, profAdj) + dxfTbl([
    {n:'CONTOUR',col:'7'},
    {n:'TOURILLONS',col:'2'},
    {n:'INFOS',col:'3'}
  ]);
  o += L(0,'SECTION') + L(2,'ENTITIES');
  o  = dxfCont(o, lonP, profAdj);
  // Pour chaque position X du montant sur la pièce :
  // 2 tourillons : à yAvant=80mm et yArriere=profAdj-80mm
  var xTouilles = Array.isArray(xMontant) ? xMontant : [xMontant];
  for (var xi = 0; xi < xTouilles.length; xi++) {
    var xM = xTouilles[xi];
    // Tourillon bord avant (80mm)
    o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
    o += L(10, xM.toFixed(3)) + L(20, yAvant.toFixed(3)) + L(30,'0.0') + L(40, r.toFixed(3));
    // Tourillon bord arrière (profAdj-80mm)
    o += L(0,'CIRCLE') + L(8,'TOURILLONS') + L(62,'2');
    o += L(10, xM.toFixed(3)) + L(20, yArriere.toFixed(3)) + L(30,'0.0') + L(40, r.toFixed(3));
  }
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(profAdj+15).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, (label || piece.designation) + ' — 2x Tourillon Ø' + DIAM_TOU + 'mm prof.' + PROF_TOU2 + 'mm — centré ep. (Z=' + (ep/2).toFixed(1) + 'mm)');
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(profAdj+25).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, 'Y avant=' + yAvant + 'mm | Y arrière=' + yArriere + 'mm — perçage prof.' + PROF_TOU2 + 'mm');
  o += L(0,'ENDSEC') + L(0,'EOF');
  return o;
}

function telechargerDXF(idx) {
  var d  = window._percDets[idx];
  var ep = d.ep || 19;
  var hP = Math.max(d.p.longueur, d.p.largeur);
  var estPM = d._montantType === 'etagere';

  if (estPM) {
    // Petit montant : DXF tourillon (Ø6, prof.13mm, centré)
    telechargerBlob(new Blob([genDXFTourillonMontant(d.p)], { type: 'application/dxf' }), nomF(d.p.designation) + '_tourillons.dxf');
  } else if (d.type === 'montant') {
    // Montant plein : 2 faces avec excentriques + rainure
    var debut = Math.max(0, d.debLat - ep);
    var posY = [], y = debut;
    while (y <= hP - d.margeBas) { posY.push(parseFloat(y.toFixed(1))); y += PAS; }
    var zip = new JSZip();
    zip.file(nomF(d.p.designation) + '_face_A.dxf', genDXF(d.p, d.type, d.rang, posY, ep, false, false));
    zip.file(nomF(d.p.designation) + '_face_B.dxf', genDXF(d.p, d.type, d.rang, posY, ep, false, true));
    zip.generateAsync({ type: 'blob' }).then(function (blob) { telechargerBlob(blob, nomF(d.p.designation) + '_AB.zip'); });
  } else {
    var debut = Math.max(0, d.type === 'lateral' ? d.debLat : d.debLat - ep);
    var posY = [], y = debut;
    while (y <= hP - d.margeBas) { posY.push(parseFloat(y.toFixed(1))); y += PAS; }
    telechargerBlob(new Blob([genDXF(d.p, d.type, d.rang, posY, ep, false)], { type: 'application/dxf' }), nomF(d.p.designation) + '.dxf');
  }
}

function telechargerTousZip() {
  if (!window._percDets || !window._percDets.length) { alert('Calculez d\'abord.'); return; }
  var zip = new JSZip();
  var f01 = zip.folder('01-Lateraux'), f02 = zip.folder('02-Panneaux'), f03 = zip.folder('03-Montants');
  for (var i = 0; i < window._percDets.length; i++) {
    var d = window._percDets[i], ep = d.ep || 19;
    var debut = Math.max(0, d.type === 'lateral' ? d.debLat : d.debLat - ep);
    var hP = Math.max(d.p.longueur, d.p.largeur), posY = [], y = debut;
    while (y <= hP - d.margeBas) { posY.push(parseFloat(y.toFixed(1))); y += PAS; }
    var folder = d.type === 'lateral' ? f01 : d.type === 'montant' ? f03 : f02;
    var estPM2 = d._montantType === 'etagere';
    if (estPM2) {
      // Petit montant : tourillon Ø6 prof.13mm
      folder.file(nomF(d.p.designation) + '_tourillons.dxf', genDXFTourillonMontant(d.p));
    } else if (d.type === 'montant') {
      folder.file(nomF(d.p.designation) + '_A.dxf', genDXF(d.p, d.type, d.rang, posY, ep, false, false));
      folder.file(nomF(d.p.designation) + '_B.dxf', genDXF(d.p, d.type, d.rang, posY, ep, false, true));
    } else {
      folder.file(nomF(d.p.designation) + '.dxf', genDXF(d.p, d.type, d.rang, posY, ep, false));
    }
  }
  zip.generateAsync({ type: 'blob' }).then(function (blob) { telechargerBlob(blob, 'wooder-percages-DXF.zip'); });
}

// ════════════════════════════════════════════════════════════════
// DXF RAINURES
// ════════════════════════════════════════════════════════════════
function genDXFRain(piece, profM, pieceType) {
  var hP  = Math.max(piece.longueur, piece.largeur);
  var nom = nrm(piece.designation);
  var eD  = nom.indexOf('droit') > -1;
  var xR  = eD ? (RAIN_DIST_BORD + RAIN_LARGEUR) : profM - RAIN_DIST_BORD;
  var xR2 = eD ? RAIN_DIST_BORD : profM - (RAIN_DIST_BORD + RAIN_LARGEUR);
  var profRain = (pieceType === 'montant') ? RAIN_PROF_MONTANT : RAIN_PROF_LATERAL;
  var L = dxfL;
  var o = dxfH(profM, hP) + dxfTbl([{n:'CONTOUR',col:'7'},{n:'RAINURE',col:'4'},{n:'INFOS',col:'3'}]);
  o += L(0,'SECTION') + L(2,'ENTITIES'); o = dxfCont(o, profM, hP);
  o += L(0,'LINE') + L(8,'RAINURE') + L(62,'4') + L(10, xR.toFixed(3))  + L(20,'0.0') + L(30,'0.0') + L(11, xR.toFixed(3))  + L(21, hP.toFixed(3)) + L(31,'0.0');
  o += L(0,'LINE') + L(8,'RAINURE') + L(62,'4') + L(10, xR2.toFixed(3)) + L(20,'0.0') + L(30,'0.0') + L(11, xR2.toFixed(3)) + L(21, hP.toFixed(3)) + L(31,'0.0');
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(hP+15).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, piece.designation + ' — Rainure ' + RAIN_LARGEUR + '×' + profRain + 'mm à ' + RAIN_DIST_BORD + 'mm bord arrière');
  o += L(0,'ENDSEC') + L(0,'EOF');
  return o;
}

function telechargerDXFRain(idx) {
  var d = window._piecesRain[idx];
  telechargerBlob(new Blob([genDXFRain(d.p, window._profMeubleRain, d.type)], { type: 'application/dxf' }), nomF(d.p.designation) + '_rainure.dxf');
}

function telechargerZipRain() {
  if (!window._piecesRain || !window._piecesRain.length) return;
  var zip = new JSZip();
  for (var i = 0; i < window._piecesRain.length; i++) {
    var d = window._piecesRain[i];
    zip.file(nomF(d.p.designation) + '_rainure.dxf', genDXFRain(d.p, window._profMeubleRain, d.type));
  }
  zip.generateAsync({ type: 'blob' }).then(function (blob) { telechargerBlob(blob, 'wooder-rainures.zip'); });
}

// ════════════════════════════════════════════════════════════════
// DXF CONNECTEURS
// ════════════════════════════════════════════════════════════════
function telechargerDXFConn(idx) {
  var l = window._liaisons[idx]; if (!l) return;
  var sfx;
  if (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14') {
    sfx = '_clamex.dxf';
  } else if (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12') {
    sfx = '_cabineo.dxf';
  } else {
    sfx = '_goujons.dxf';
  }
  genDXFConnBlob(l, function(blob) {
    telechargerBlob(blob, nomF(l.designation + '_' + idx) + sfx);
  });
}

// DXF connecteur — vue d'usinage de la face qui reçoit les perçages
// PANNEAU (pas de xMont) : pièce à plat, face intérieure vers le haut
//   → axe X = longueur (grande dim), axe Y = profondeur (petite dim)
//   → goujons à X = posConnX(longueur), Y = ep/2 depuis le bord usiné
// MONTANT (xMont défini) : face intérieure (même face que rainure + EC03)
//   → axe X = profondeur, axe Y = longueur
//   → goujons à X = posConnX(profondeur), Y = yExc (sup) ou hP-yBas (inf)
// ════════════════════════════════════════════════════════════════
// DXF CONNECTEURS — CLAMEX P-14 + BISCUIT
// ════════════════════════════════════════════════════════════════
// Génère le DXF d'une pièce avec rainures Zeta P2 (Clamex) et/ou fentes biscuit
// Logique : 2 Clamex aux positions CLAMEX_AVANT et lP-CLAMEX_AVANT (comme l'exc.)
//           + 1 biscuit au milieu si lP > BISCUIT_SEUIL
// Les rainures sont représentées comme des rectangles (vue de dessus)
// Les trous d'accès Ø6 sont dessinés comme des cercles SUR UNE DES 2 PIÈCES
//   → convention : pièce panneau_sup/inf et montant ont les trous d'accès
//                  (pièce lateral n'a que les rainures, pas de trous)
function genDXFConnBlobClamex(l, cb) {
  var L    = dxfL;
  var prof = l.profondeur || 580;
  var lon  = l.largeur    || 2000;
  var tp   = l.type_piece || '';
  // Positions Clamex dans la profondeur : xCl1 et xCl2
  var xCl  = [CLAMEX_AVANT, prof - CLAMEX_AVANT];
  var ajouteBiscuit = (lon > BISCUIT_SEUIL && prof > BISCUIT_SEUIL); // biscuit central si pièce + profondeur > seuil
  var o, lDXF, hDXF;

  if (tp === 'panneau_sup' || tp === 'panneau_inf') {
    // Vue paysage : X=longueur, Y=profondeur
    // Usinage P-System officiel Lamello : rainure 52×7mm prof.14mm + 1 trou d'accès Ø6
    lDXF = lon; hDXF = prof;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'CLAMEX',col:'1'},{n:'ACCES',col:'5'},
      {n:'BISCUIT',col:'2'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);

    // Rainures Clamex aux 2 bouts (connexion latéraux)
    // Rectangle 52×7mm orienté le long de X (parallèle à la longueur)
    // + 1 trou d'accès Ø6 centré sur la rainure (décalable via CLAMEX_ACCES_OFF)
    [9.5, lon-9.5].forEach(function(xB) {
      xCl.forEach(function(y) {
        o = dxfRect(o, xB, y, CLAMEX_LONG, CLAMEX_LARG, 'CLAMEX', '1');
        // 1 seul trou d'accès Ø6 centré (conforme norme Lamello)
        o+=L(0,'CIRCLE')+L(8,'ACCES')+L(62,'5')
         +L(10,(xB+CLAMEX_ACCES_OFF).toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(CLAMEX_ACCES/2).toFixed(3));
      });
    });

    // Liaison panneau ↔ montants : 2 Clamex par liaison (si xMonts défini)
    (l.xMonts||[]).forEach(function(xM) {
      xCl.forEach(function(y) {
        o = dxfRect(o, xM, y, CLAMEX_LARG, CLAMEX_LONG, 'CLAMEX', '1'); // orientée perpendiculairement (le long de Y)
        // 1 trou d'accès Ø6 centré
        o+=L(0,'CIRCLE')+L(8,'ACCES')+L(62,'5')
         +L(10,xM.toFixed(3))+L(20,(y+CLAMEX_ACCES_OFF).toFixed(3))+L(30,'0.0')+L(40,(CLAMEX_ACCES/2).toFixed(3));
      });
      // Biscuit central entre les 2 Clamex si profondeur suffisante
      if (ajouteBiscuit) {
        o = dxfRect(o, xM, prof/2, BISCUIT_LARG, BISCUIT_LONG, 'BISCUIT', '2');
      }
    });

  } else if (tp === 'lateral') {
    // Vue portrait : X=profondeur, Y=longueur
    // Latéral fusionné : haut ET bas dans le même DXF
    lDXF = prof; hDXF = lon;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'CLAMEX',col:'1'},{n:'BISCUIT',col:'2'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    var yLines = [];
    if (l.yDepuisHaut !== undefined) yLines.push(hDXF - l.yDepuisHaut);
    if (l.yDepuisBas  !== undefined) yLines.push(l.yDepuisBas);
    if (yLines.length === 0) yLines.push(hDXF - 9.5);
    yLines.forEach(function(yThis) {
      xCl.forEach(function(x) {
        o = dxfRect(o, x, yThis, CLAMEX_LONG, CLAMEX_LARG, 'CLAMEX', '1');
      });
      if (ajouteBiscuit) {
        o = dxfRect(o, prof/2, yThis, BISCUIT_LONG, BISCUIT_LARG, 'BISCUIT', '2');
      }
    });

  } else {
    // MONTANT : vue portrait — haut ET bas dans le même DXF
    lDXF = prof; hDXF = lon;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'CLAMEX',col:'1'},{n:'ACCES',col:'5'},
      {n:'BISCUIT',col:'2'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    var yLinesM = [];
    if (l.yDepuisHaut !== undefined) yLinesM.push(hDXF - l.yDepuisHaut);
    if (l.yDepuisBas  !== undefined) yLinesM.push(l.yDepuisBas);
    if (yLinesM.length === 0) yLinesM.push(hDXF - 28.5);
    yLinesM.forEach(function(yThisM) {
      xCl.forEach(function(x) {
        o = dxfRect(o, x, yThisM, CLAMEX_LONG, CLAMEX_LARG, 'CLAMEX', '1');
        // 1 trou d'accès Ø6 centré (conforme norme Lamello)
        o+=L(0,'CIRCLE')+L(8,'ACCES')+L(62,'5')
         +L(10,(x+CLAMEX_ACCES_OFF).toFixed(3))+L(20,yThisM.toFixed(3))+L(30,'0.0')+L(40,(CLAMEX_ACCES/2).toFixed(3));
      });
      if (ajouteBiscuit) {
        o = dxfRect(o, prof/2, yThisM, BISCUIT_LONG, BISCUIT_LARG, 'BISCUIT', '2');
      }
    });
  }

  o += L(0,'TEXT')+L(8,'INFOS')+L(62,'3')+L(10,'5.0')+L(20,(hDXF+15).toFixed(3))+L(30,'0.0')+L(40,'5.0');
  o += L(1, l.designation + ' — Clamex P-14 (rainure ' + CLAMEX_LONG + 'x' + CLAMEX_LARG + 'mm prof.' + CLAMEX_PROF + ', trou Ø' + CLAMEX_ACCES + ')' + (ajouteBiscuit ? ' + biscuit #20 central' : ''));
  o += L(0,'ENDSEC')+L(0,'EOF');
  cb(new Blob([o], { type: 'application/dxf' }));
}

// ════════════════════════════════════════════════════════════════
// DXF CONNECTEURS — CABINEO 8 / CABINEO 12
// ════════════════════════════════════════════════════════════════
// Cabineo = connecteur une-pièce Lamello :
//   → POCHE fraisée 33.8 × 16.5 × 10.8mm sur la face intérieure de la pièce
//     MÂLE (latéral ou montant), avec fraise droite Ø12mm ou moins
//   → TROU Ø5 sur chant de la pièce FEMELLE (panneau), prof. 8mm (Cab 8) ou 12mm (Cab 12)
//
// Convention DXF :
//   - Latéral/Montant (mâle) : poches rectangulaires sur la face, axe long selon Y
//     (le long de la pièce) — la vis pointe vers le bord le plus proche
//   - Panneau (femelle) : cercles Ø5 représentant les trous (à percer sur chant)
//     + annotation TEXT signalant que les trous sont sur CHANT
// ════════════════════════════════════════════════════════════════
function posCabineoX(lP, nb) {
  if (nb <= 2) return [CAB_AVANT, lP - CAB_AVANT];
  if (nb === 3) return [CAB_AVANT, lP/2, lP - CAB_AVANT];
  if (nb === 4) return [CAB_AVANT, lP/3, 2*lP/3, lP - CAB_AVANT];
  var arr = [CAB_AVANT], step = (lP - 2*CAB_AVANT) / (nb - 1);
  for (var k = 1; k < nb - 1; k++) arr.push(CAB_AVANT + k*step);
  arr.push(lP - CAB_AVANT);
  return arr;
}

function genDXFConnBlobCabineo(l, cb) {
  var L    = dxfL;
  var prof = l.profondeur || 580;
  var lon  = l.largeur    || 2000;
  var tp   = l.type_piece || '';
  var ep0  = parseFloat(document.getElementById('epaisseur').value) || 19;
  var isMale = (tp === 'panneau_sup' || tp === 'panneau_inf' || tp === 'montant');
  var cabName = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';
  var holeDepth = (TYPE_CONNECTEUR === 'cabineo_12') ? 12 : 8;

  // Nombre de Cabineo par bout (= positions dans la profondeur, axe perpendiculaire au bout)
  var nbCab;
  if (CAB_NB_BOUT === 'auto') nbCab = (prof > CAB_SEUIL) ? 3 : 2;
  else nbCab = parseInt(CAB_NB_BOUT, 10) || 2;
  var posDepth = posCabineoX(prof, nbCab); // ex: [100, prof-100]

  var nbF   = Math.max(2, CAB_NB_FORAGES);
  var diamF = CAB_DIAM_FORAGE;
  var rF    = diamF / 2;

  // Helper : dessine une poche = N cercles Ø diamF chevauchants alignés,
  // sur longueur totale CAB_POCHE_L, depuis un point central (cx, cy).
  // axisAlongX=true  → cercles alignés le long de X (poche horizontale, cas panneau)
  // axisAlongX=false → cercles alignés le long de Y (poche verticale, cas montant)
  function drawPocket(o, cx, cy, axisAlongX) {
    var start = -CAB_POCHE_L/2 + rF;
    var end   =  CAB_POCHE_L/2 - rF;
    var step  = (nbF > 1) ? (end - start) / (nbF - 1) : 0;
    for (var k = 0; k < nbF; k++) {
      var off = start + k * step;
      var cxk = cx + (axisAlongX ? off : 0);
      var cyk = cy + (axisAlongX ? 0 : off);
      o += L(0,'CIRCLE')+L(8,'POCHE_CABINEO')+L(62,'1')
        +L(10,cxk.toFixed(3))+L(20,cyk.toFixed(3))+L(30,'0.0')+L(40,rF.toFixed(3));
    }
    return o;
  }

  var o, lDXF, hDXF;

  if (tp === 'panneau_sup' || tp === 'panneau_inf') {
    // ── PIÈCE MÂLE : panneau sup/inf (face intérieure) ──────────
    // Vue paysage : X = longueur, Y = profondeur
    //   · Aux 2 bouts (connexion latéraux) : POCHES, axe long poche // X
    //     Centres X = CAB_POCHE_L/2 (gauche, à fleur du bord)
    //             X = lon - CAB_POCHE_L/2 (droite, à fleur du bord)
    //     Centres Y = posDepth (100, prof-100, etc.)
    //   · Au droit des montants : TROUS Ø5 femelle (pour vis Cabineo du montant)
    //     X = xMonts, Y = posDepth
    lDXF = lon; hDXF = prof;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'POCHE_CABINEO',col:'1'},{n:'TROUS_CHANT',col:'2'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);

    // Poches aux 2 bouts
    var xBoutG = CAB_POCHE_L/2;
    var xBoutD = lon - CAB_POCHE_L/2;
    [xBoutG, xBoutD].forEach(function(xB) {
      posDepth.forEach(function(yP) {
        o = drawPocket(o, xB, yP, true); // axe long poche // X
      });
    });
    // Trous Ø5 (femelle) au droit des montants
    (l.xMonts||[]).forEach(function(xM) {
      posDepth.forEach(function(yP) {
        o += L(0,'CIRCLE')+L(8,'TROUS_CHANT')+L(62,'2')
          +L(10,xM.toFixed(3))+L(20,yP.toFixed(3))+L(30,'0.0')+L(40,(CAB_HOLE/2).toFixed(3));
      });
    });

  } else if (tp === 'montant') {
    // ── PIÈCE MÂLE : montant (face intérieure) ──────────────────
    // Vue portrait : X = profondeur, Y = longueur
    // Poches aux positions X = posDepth (100, prof-100), aux 2 bouts (haut ET bas)
    // dans le même DXF. Axe long poche // Y, à fleur du plan de liaison.
    // Pour un montant, les 2 bouts (haut et bas) sont joints direct au panneau sup/inf :
    // le chant haut et le chant bas du montant SONT les plans de liaison → poches à fleur.
    lDXF = prof; hDXF = lon;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'POCHE_CABINEO',col:'1'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);

    var yCenters = [];
    if (l.yDepuisHaut !== undefined) yCenters.push(hDXF - CAB_POCHE_L/2); // poche à fleur du bord haut
    if (l.yDepuisBas  !== undefined) yCenters.push(CAB_POCHE_L/2);        // poche à fleur du bord bas
    if (yCenters.length === 0) yCenters.push(hDXF - CAB_POCHE_L/2);

    yCenters.forEach(function(yC) {
      posDepth.forEach(function(x) {
        o = drawPocket(o, x, yC, false); // axe long poche // Y
      });
    });

  } else if (tp === 'lateral') {
    // ── PIÈCE FEMELLE : latéral ─────────────────────────────────
    // Vue portrait : X = profondeur, Y = longueur
    // Trous Ø5 uniquement, aux positions posDepth (100, prof-100)
    // aux 2 extrémités (haut + bas) dans le même DXF
    lDXF = prof; hDXF = lon;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'TROUS_CHANT',col:'2'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    var yHoles = [];
    if (l.yDepuisHaut !== undefined) yHoles.push(hDXF - l.yDepuisHaut);
    if (l.yDepuisBas  !== undefined) yHoles.push(l.yDepuisBas);
    if (yHoles.length === 0) yHoles.push(hDXF - ep0/2);
    yHoles.forEach(function(yH) {
      posDepth.forEach(function(x) {
        o += L(0,'CIRCLE')+L(8,'TROUS_CHANT')+L(62,'2')
          +L(10,x.toFixed(3))+L(20,yH.toFixed(3))+L(30,'0.0')+L(40,(CAB_HOLE/2).toFixed(3));
      });
    });

  } else {
    // Type inconnu : contour seul
    lDXF = prof; hDXF = lon;
    o = dxfH(lDXF,hDXF)+dxfTbl([{n:'CONTOUR',col:'7'},{n:'INFOS',col:'3'}]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
  }

  // Titre / infos
  o += L(0,'TEXT')+L(8,'INFOS')+L(62,'3')+L(10,'5.0')+L(20,(hDXF+15).toFixed(3))+L(30,'0.0')+L(40,'5.0');
  var infoTxt;
  if (isMale) {
    infoTxt = l.designation + ' — ' + cabName + ' (mâle) : poches ' +
              nbF + '×Ø' + diamF + ' sur ' + CAB_POCHE_L + 'mm, prof.' + CAB_POCHE_D + 'mm';
  } else {
    infoTxt = l.designation + ' — ' + cabName + ' (femelle) : trous Ø' + CAB_HOLE +
              ' prof.' + holeDepth + 'mm sur chant';
  }
  o += L(1, infoTxt);
  o += L(0,'ENDSEC')+L(0,'EOF');
  cb(new Blob([o], { type: 'application/dxf' }));
}

function genDXFConnBlob(l, cb) {
  // Routeur selon le type de connecteur choisi
  if (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14') {
    return genDXFConnBlobClamex(l, cb);
  }
  if (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12') {
    return genDXFConnBlobCabineo(l, cb);
  }
  // Par défaut : Excentrique + Tourillon (code historique ci-dessous)
  // Diamètres : DIAM_EXC=15mm (excentrique), DIAM=5mm (goujon M6), DIAM_TOU=6mm (tourillon)
  var L    = dxfL;
  var prof = l.profondeur || 580;
  var lon  = l.largeur    || 2000;
  var pos  = posPercBout(prof); // {exc:[100,lP-100], tou:[140,lP-140]}
  var tp   = l.type_piece || '';
  var o, lDXF, hDXF;

  if (tp === 'panneau_sup' || tp === 'panneau_inf') {
    // Vue paysage : X=longueur, Y=profondeur
    // Bouts (connexion latéraux) : excentriques Ø15 SEULEMENT (tourillons dans chant, non visibles)
    // Montants : goujons Ø5 (à pos.exc) + tourillons Ø6 (à pos.tou)
    lDXF = lon; hDXF = prof;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'EXCENTRIQUES',col:'1'},
      {n:'GOUJONS',col:'2'},{n:'TOURILLONS',col:'3'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    // Bouts : excentriques Ø15 seulement
    [9.5, lon-9.5].forEach(function(xB) {
      pos.exc.forEach(function(y) {
        o+=L(0,'CIRCLE')+L(8,'EXCENTRIQUES')+L(62,'1')
         +L(10,xB.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM_EXC/2).toFixed(3));
      });
    });
    // Montants : goujons Ø5 + tourillons Ø6
    (l.xMonts||[]).forEach(function(xM) {
      pos.exc.forEach(function(y) {
        o+=L(0,'CIRCLE')+L(8,'GOUJONS')+L(62,'2')
         +L(10,xM.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM/2).toFixed(3));
      });
      pos.tou.forEach(function(y) {
        o+=L(0,'CIRCLE')+L(8,'TOURILLONS')+L(62,'3')
         +L(10,xM.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM_TOU/2).toFixed(3));
      });
    });

  } else if (tp === 'lateral') {
    // Vue portrait : X=profondeur, Y=longueur
    // Goujons Ø5 à pos.exc (100mm et lP-100mm)
    // Tourillons Ø6 à pos.tou (140mm et lP-140mm)
    lDXF = prof; hDXF = lon;
    var yH = hDXF - 9.5;  // ep/2 depuis le haut
    var yB = (l.yDepuisBas !== undefined) ? l.yDepuisBas : 9.5;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'GOUJONS',col:'2'},{n:'TOURILLONS',col:'3'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    // Goujons Ø5 aux positions exc (100mm et lP-100mm)
    pos.exc.forEach(function(x) {
      o+=L(0,'CIRCLE')+L(8,'GOUJONS')+L(62,'2')
       +L(10,x.toFixed(3))+L(20,yH.toFixed(3))+L(30,'0.0')+L(40,(DIAM/2).toFixed(3));
      o+=L(0,'CIRCLE')+L(8,'GOUJONS')+L(62,'2')
       +L(10,x.toFixed(3))+L(20,yB.toFixed(3))+L(30,'0.0')+L(40,(DIAM/2).toFixed(3));
    });
    // Tourillons Ø6 aux positions tou (140mm et lP-140mm)
    pos.tou.forEach(function(x) {
      o+=L(0,'CIRCLE')+L(8,'TOURILLONS')+L(62,'3')
       +L(10,x.toFixed(3))+L(20,yH.toFixed(3))+L(30,'0.0')+L(40,(DIAM_TOU/2).toFixed(3));
      o+=L(0,'CIRCLE')+L(8,'TOURILLONS')+L(62,'3')
       +L(10,x.toFixed(3))+L(20,yB.toFixed(3))+L(30,'0.0')+L(40,(DIAM_TOU/2).toFixed(3));
    });

  } else {
    // MONTANT : excentriques Ø15 + goujons Ø5 + tourillons Ø6 aux 2 bouts
    lDXF = prof; hDXF = lon;
    var ep19 = 19;
    var yHm = hDXF - (ep19 + ep19/2);
    var yBm = ep19 + ep19/2;
    o = dxfH(lDXF,hDXF)+dxfTbl([
      {n:'CONTOUR',col:'7'},{n:'EXCENTRIQUES',col:'1'},
      {n:'GOUJONS',col:'2'},{n:'TOURILLONS',col:'3'},{n:'INFOS',col:'3'}
    ]);
    o += L(0,'SECTION')+L(2,'ENTITIES'); o = dxfCont(o,lDXF,hDXF);
    [yHm, yBm].forEach(function(y) {
      // Excentriques Ø15
      pos.exc.forEach(function(x) {
        o+=L(0,'CIRCLE')+L(8,'EXCENTRIQUES')+L(62,'1')
         +L(10,x.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM_EXC/2).toFixed(3));
      });
      // Goujons Ø5 aux mêmes positions que exc (100mm et lP-100mm)
      pos.exc.forEach(function(x) {
        o+=L(0,'CIRCLE')+L(8,'GOUJONS')+L(62,'2')
         +L(10,x.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM/2).toFixed(3));
      });
      // Tourillons Ø6 aux positions tou (140mm et lP-140mm)
      pos.tou.forEach(function(x) {
        o+=L(0,'CIRCLE')+L(8,'TOURILLONS')+L(62,'3')
         +L(10,x.toFixed(3))+L(20,y.toFixed(3))+L(30,'0.0')+L(40,(DIAM_TOU/2).toFixed(3));
      });
    });
  }
  o += L(0,'TEXT')+L(8,'INFOS')+L(62,'3')+L(10,'5.0')+L(20,(hDXF+15).toFixed(3))+L(30,'0.0')+L(40,'5.0');
  o += L(1, l.designation + ' — ' + l.liaison);
  o += L(0,'ENDSEC')+L(0,'EOF');
  cb(new Blob([o], { type: 'application/dxf' }));
}

function telechargerZipConn() {
  var zip  = new JSZip();
  var lais = window._liaisons || [];
  var isClamexZ = (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14');
  var isCabineoZ = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
  var sfxZ = isClamexZ ? '_clamex.dxf' : isCabineoZ ? '_cabineo.dxf' : '_goujons.dxf';
  var nomZip = isClamexZ ? 'wooder-clamex.zip' : isCabineoZ ? 'wooder-cabineo.zip' : 'wooder-connecteurs.zip';
  var promises = lais.map(function(l, i) {
    return new Promise(function(resolve) {
      genDXFConnBlob(l, function(blob) {
        var reader = new FileReader();
        reader.onload = function() {
          zip.file(nomF(l.designation+'_'+i)+sfxZ, reader.result);
          resolve();
        };
        reader.readAsArrayBuffer(blob);
      });
    });
  });
  Promise.all(promises).then(function() {
    zip.generateAsync({ type:'blob' }).then(function(blob) {
      telechargerBlob(blob, nomZip);
    });
  });
}

// ====================================================================
// ZIP DXF + PDF — TOUS les types de connecteurs
// ====================================================================
function telechargerZipTousConnecteurs() {
  if (!window._liaisons || !window._liaisons.length) {
    alert('Calculez d\'abord le meuble.'); return;
  }
  var zip = new JSZip();
  var lais = window._liaisons;
  var savedType = TYPE_CONNECTEUR;
  var familles = [
    { type: 'excentrique_tourillon', nom: '01-Excentriques',   sfx: '_goujons.dxf' },
    { type: 'clamex_p14',           nom: '02-Clamex-P14',     sfx: '_clamex.dxf' },
    { type: 'clamex_biscuit',       nom: '03-Clamex-Biscuit', sfx: '_clamex.dxf' },
    { type: 'cabineo_8',            nom: '04-Cabineo-8',      sfx: '_cabineo.dxf' },
    { type: 'cabineo_12',           nom: '05-Cabineo-12',     sfx: '_cabineo.dxf' }
  ];
  var idx = 0;
  setPdfStatus('<span class="spinner"></span> Tous connecteurs 0/' + familles.length + '...', 'loading');
  function nextFam() {
    if (idx >= familles.length) {
      TYPE_CONNECTEUR = savedType;
      var sel = document.getElementById('paramTypeConnecteur');
      if (sel) sel.value = savedType;
      lireParams();
      try { toggleParamsConnecteur(); } catch(e){}
      setPdfStatus('', '');
      zip.generateAsync({ type: 'blob' }).then(function(blob) {
        telechargerBlob(blob, 'wooder-tous-connecteurs.zip');
      });
      return;
    }
    var fam = familles[idx];
    var folder = zip.folder(fam.nom);
    setPdfStatus('<span class="spinner"></span> ' + fam.nom + ' (' + (idx+1) + '/' + familles.length + ')...', 'loading');
    TYPE_CONNECTEUR = fam.type;
    var sel = document.getElementById('paramTypeConnecteur');
    if (sel) sel.value = fam.type;
    lireParams();
    // DXF
    var dxfP = lais.map(function(l, i) {
      return new Promise(function(resolve) {
        genDXFConnBlob(l, function(blob) {
          var r = new FileReader();
          r.onload = function() { folder.file(nomF(l.designation+'_'+i)+fam.sfx, r.result); resolve(); };
          r.onerror = function() { resolve(); };
          r.readAsArrayBuffer(blob);
        });
      });
    });
    Promise.all(dxfP).then(function() {
      // PDF
      var nomM = (window._meubles && window._meubles[0]) ? window._meubles[0].nom : 'Meuble';
      try {
        genererPlansPDF(nomM, function(pdfBlob) {
          var r2 = new FileReader();
          r2.onload = function() {
            folder.file('plan-montage-' + fam.nom + '.pdf', r2.result);
            idx++; nextFam();
          };
          r2.readAsArrayBuffer(pdfBlob);
        });
      } catch(e) { idx++; nextFam(); }
    });
  }
  nextFam();
}

// ====================================================================
// ZIP PDF SEULS — Tous les types de connecteurs
// ====================================================================
function telechargerPDFSeulTousConnecteurs() {
  if (!window._liaisons || !window._liaisons.length) {
    alert('Calculez d\'abord le meuble.'); return;
  }
  var zip = new JSZip();
  var savedType = TYPE_CONNECTEUR;
  var familles = [
    { type: 'excentrique_tourillon', nom: '01-Excentriques' },
    { type: 'clamex_p14',           nom: '02-Clamex-P14' },
    { type: 'clamex_biscuit',       nom: '03-Clamex-Biscuit' },
    { type: 'cabineo_8',            nom: '04-Cabineo-8' },
    { type: 'cabineo_12',           nom: '05-Cabineo-12' }
  ];
  var idx = 0;
  setPdfStatus('<span class="spinner"></span> PDF tous connecteurs 0/' + familles.length + '...', 'loading');
  function next() {
    if (idx >= familles.length) {
      TYPE_CONNECTEUR = savedType;
      var sel = document.getElementById('paramTypeConnecteur');
      if (sel) sel.value = savedType;
      lireParams();
      try { toggleParamsConnecteur(); } catch(e){}
      setPdfStatus('', '');
      zip.generateAsync({ type: 'blob' }).then(function(blob) {
        telechargerBlob(blob, 'wooder-plans-PDF-tous-connecteurs.zip');
      });
      return;
    }
    var fam = familles[idx];
    setPdfStatus('<span class="spinner"></span> PDF ' + fam.nom + ' (' + (idx+1) + '/' + familles.length + ')...', 'loading');
    TYPE_CONNECTEUR = fam.type;
    var sel = document.getElementById('paramTypeConnecteur');
    if (sel) sel.value = fam.type;
    lireParams();
    var nomM = (window._meubles && window._meubles[0]) ? window._meubles[0].nom : 'Meuble';
    try {
      genererPlansPDF(nomM, function(pdfBlob) {
        var r = new FileReader();
        r.onload = function() { zip.file('plan-montage-' + fam.nom + '.pdf', r.result); idx++; next(); };
        r.readAsArrayBuffer(pdfBlob);
      });
    } catch(e) { idx++; next(); }
  }
  next();
}

// ====================================================================
// ZIP DXF SEULS — Tous les types de connecteurs
// ====================================================================
function telechargerDXFSeulTousConnecteurs() {
  if (!window._liaisons || !window._liaisons.length) {
    alert('Calculez d\'abord le meuble.'); return;
  }
  var zip = new JSZip();
  var lais = window._liaisons;
  var savedType = TYPE_CONNECTEUR;
  var familles = [
    { type: 'excentrique_tourillon', nom: '01-Excentriques',   sfx: '_goujons.dxf' },
    { type: 'clamex_p14',           nom: '02-Clamex-P14',     sfx: '_clamex.dxf' },
    { type: 'clamex_biscuit',       nom: '03-Clamex-Biscuit', sfx: '_clamex.dxf' },
    { type: 'cabineo_8',            nom: '04-Cabineo-8',      sfx: '_cabineo.dxf' },
    { type: 'cabineo_12',           nom: '05-Cabineo-12',     sfx: '_cabineo.dxf' }
  ];
  var idx = 0;
  setPdfStatus('<span class="spinner"></span> DXF tous connecteurs 0/' + familles.length + '...', 'loading');
  function next() {
    if (idx >= familles.length) {
      TYPE_CONNECTEUR = savedType;
      var sel = document.getElementById('paramTypeConnecteur');
      if (sel) sel.value = savedType;
      lireParams();
      try { toggleParamsConnecteur(); } catch(e){}
      setPdfStatus('', '');
      zip.generateAsync({ type: 'blob' }).then(function(blob) {
        telechargerBlob(blob, 'wooder-DXF-tous-connecteurs.zip');
      });
      return;
    }
    var fam = familles[idx];
    var folder = zip.folder(fam.nom);
    setPdfStatus('<span class="spinner"></span> DXF ' + fam.nom + ' (' + (idx+1) + '/' + familles.length + ')...', 'loading');
    TYPE_CONNECTEUR = fam.type;
    var sel = document.getElementById('paramTypeConnecteur');
    if (sel) sel.value = fam.type;
    lireParams();
    var dxfP = lais.map(function(l, i) {
      return new Promise(function(resolve) {
        genDXFConnBlob(l, function(blob) {
          var r = new FileReader();
          r.onload = function() { folder.file(nomF(l.designation+'_'+i)+fam.sfx, r.result); resolve(); };
          r.onerror = function() { resolve(); };
          r.readAsArrayBuffer(blob);
        });
      });
    });
    Promise.all(dxfP).then(function() { idx++; next(); });
  }
  next();
}

// ════════════════════════════════════════════════════════════════
// DXF PORTES / CHARNIÈRES
// ════════════════════════════════════════════════════════════════
function genDXFPorte(piece, posY, axisCuv) {
  var hP   = Math.max(piece.longueur, piece.largeur);
  var lP   = Math.min(piece.longueur, piece.largeur);
  var rC   = 17.5, rI = 4;
  var xIns = (axisCuv < lP / 2) ? axisCuv + 9.5 : axisCuv - 9.5;
  var L = dxfL;
  var o = dxfH(lP, hP) + dxfTbl([{n:'CONTOUR',col:'7'},{n:'CUVETTE',col:'1'},{n:'INSERTA',col:'3'},{n:'INFOS',col:'3'}]);
  o += L(0,'SECTION') + L(2,'ENTITIES'); o = dxfCont(o, lP, hP);
  for (var i = 0; i < posY.length; i++) {
    var yD = hP - posY[i];
    o += L(0,'CIRCLE') + L(8,'CUVETTE')  + L(62,'1') + L(10, axisCuv.toFixed(3)) + L(20, yD.toFixed(3))        + L(30,'0.0') + L(40, rC.toFixed(3));
    o += L(0,'CIRCLE') + L(8,'INSERTA')  + L(62,'3') + L(10, xIns.toFixed(3))    + L(20, (yD - 22.5).toFixed(3)) + L(30,'0.0') + L(40, rI.toFixed(3));
    o += L(0,'CIRCLE') + L(8,'INSERTA')  + L(62,'3') + L(10, xIns.toFixed(3))    + L(20, (yD + 22.5).toFixed(3)) + L(30,'0.0') + L(40, rI.toFixed(3));
  }
  o += L(0,'TEXT') + L(8,'INFOS') + L(62,'3') + L(10,'5.0') + L(20,(hP+15).toFixed(3)) + L(30,'0.0') + L(40,'5.0');
  o += L(1, piece.designation + ' — ' + posY.length + ' charnières Blum Inserta');
  o += L(0,'ENDSEC') + L(0,'EOF');
  return o;
}

function telechargerDXFPorte(idx) {
  var d = window._charnDets[idx];
  telechargerBlob(new Blob([genDXFPorte(d.p, d.posY, d.axisCuvette)], { type: 'application/dxf' }), nomF(d.label) + '_charniere.dxf');
}

function telechargerZipCharn() {
  if (!window._charnDets || !window._charnDets.length) return;
  var zip = new JSZip();
  for (var i = 0; i < window._charnDets.length; i++) {
    var d = window._charnDets[i];
    zip.file(nomF(d.label) + '_charniere.dxf', genDXFPorte(d.p, d.posY, d.axisCuvette));
  }
  zip.generateAsync({ type: 'blob' }).then(function (blob) { telechargerBlob(blob, 'wooder-charnieres.zip'); });
}
