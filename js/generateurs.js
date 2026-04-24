/* ================================================================
   THE WOODER - generateurs.js (v6)
   ================================================================
   CHANGELOG v6 :
   - Ajout de l'archetype COL_MI (colonne avec montants intermediaires)
   - Prend en entree une liste de sous-colonnes avec largeur_ratio
     et nombre de portes dans chaque
   - Fabrique : cotes exterieurs + pan sup/inf continus + montants
     intermediaires + plinthe + etageres par sous-colonne + portes
   ================================================================ */

// ══════════════════════════════════════════════════════════════════
// CONSTANTES DE JEUX
// ══════════════════════════════════════════════════════════════════
var JEU_APPLIQUE_BORD = 1.5;
var JEU_ENTRE_PORTES  = 3;
var JEU_ENTRE_TIROIRS = 3;
var JEU_ENCASTREE     = 3;

// ══════════════════════════════════════════════════════════════════
// HELPERS communs
// ══════════════════════════════════════════════════════════════════

function ajouterMeubleGenere(meuble) {
  if (!window._meubles) window._meubles = [];
  window._meubles.push(meuble);
  afficherListeMeubles();
  afficherToutesPieces();
  _miseAJourCompteur();
}

function dimsPorte(H, L, hPl, ep, Lint, hInt, nbPortes, typePortes) {
  if (typePortes === 'encastree') {
    return {
      hPorte:   hInt - 2 * JEU_ENCASTREE,
      larPorte: (Lint - JEU_ENCASTREE * (nbPortes + 1)) / nbPortes
    };
  }
  return {
    hPorte:   H - hPl - 2 * JEU_APPLIQUE_BORD,
    larPorte: (L - 2 * JEU_APPLIQUE_BORD - JEU_ENTRE_PORTES * (nbPortes - 1)) / nbPortes
  };
}

function etageres(nb, Lint, P, ep, retraitEtag) {
  if (nb <= 0) return [];
  return [{
    designation: 'Etagere',
    longueur:    Lint - 2,
    largeur:     P - retraitEtag,
    epaisseur:   ep,
    nombre:      nb
  }];
}

function resoudrePlinthe(opts) {
  var typePl = opts.typePlinthe || 'encastree';
  var hPl    = (opts.hPlinthe != null) ? opts.hPlinthe : 100;
  if (typePl === 'aucune') {
    return { typePlinthe: 'aucune', hPl: 0, hPl_eff: 0 };
  }
  return { typePlinthe: typePl, hPl: hPl, hPl_eff: hPl };
}

function hauteurInterieure(H, ep, typePlinthe, hPl) {
  if (typePlinthe === 'encastree')      return H - 2 * ep - hPl;
  else if (typePlinthe === 'applique')  return H -     ep - hPl;
  else                                  return H - 2 * ep;
}

// ══════════════════════════════════════════════════════════════════
// CAISSONS BAS (CB)
// ══════════════════════════════════════════════════════════════════

function generateCB_2P(L, H, P, opts) { return _genererCB(L, H, P, opts, 2); }
function generateCB_1P(L, H, P, opts) { return _genererCB(L, H, P, opts, 1); }

function _genererCB(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 1;

  var pl = resoudrePlinthe(opts);
  var Lint = L - 2 * ep;
  var hInt = hauteurInterieure(H, ep, pl.typePlinthe, pl.hPl);
  var dp   = dimsPorte(H, L, pl.hPl_eff, ep, Lint, hInt, nbPortes, typePortes);

  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }
  pieces.push({ designation: 'Porte', longueur: dp.hPorte, largeur: dp.larPorte, epaisseur: ep, nombre: nbPortes });

  return {
    nom: 'Caisson bas ' + nbPortes + ' porte' + (nbPortes > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: typePortes, typePlinthe: pl.typePlinthe,
    debutPerc: 96, margeBas: 100, image3D: null
  };
}

// ══════════════════════════════════════════════════════════════════
// CAISSONS HAUTS (CH)
// ══════════════════════════════════════════════════════════════════

function generateCH_2P(L, H, P, opts) { return _genererCH(L, H, P, opts, 2); }
function generateCH_1P(L, H, P, opts) { return _genererCH(L, H, P, opts, 1); }

function _genererCH(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 1;

  var Lint = L - 2 * ep;
  var hInt = H - 2 * ep;
  var dp   = dimsPorte(H, L, 0, ep, Lint, hInt, nbPortes, typePortes);

  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  pieces.push({ designation: 'Porte', longueur: dp.hPorte, largeur: dp.larPorte, epaisseur: ep, nombre: nbPortes });

  return {
    nom: 'Caisson haut ' + nbPortes + ' porte' + (nbPortes > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: typePortes, typePlinthe: 'aucune',
    debutPerc: 96, margeBas: 100, image3D: null
  };
}

// ══════════════════════════════════════════════════════════════════
// COLONNES SIMPLES (COL) - sans MI
// ══════════════════════════════════════════════════════════════════

function generateCOL_2P(L, H, P, opts) { return _genererCOL(L, H, P, opts, 2); }
function generateCOL_1P(L, H, P, opts) { return _genererCOL(L, H, P, opts, 1); }

function _genererCOL(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 3;

  var pl = resoudrePlinthe(opts);
  var Lint = L - 2 * ep;
  var hInt = hauteurInterieure(H, ep, pl.typePlinthe, pl.hPl);
  var dp   = dimsPorte(H, L, pl.hPl_eff, ep, Lint, hInt, nbPortes, typePortes);

  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }
  pieces.push({ designation: 'Porte', longueur: dp.hPorte, largeur: dp.larPorte, epaisseur: ep, nombre: nbPortes });

  return {
    nom: 'Colonne ' + nbPortes + ' porte' + (nbPortes > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: typePortes, typePlinthe: pl.typePlinthe,
    debutPerc: 96, margeBas: 100, image3D: null
  };
}

// ══════════════════════════════════════════════════════════════════
// COLONNE MIXTE : PORTES HAUT + TIROIRS BAS (COL_mixte_PT)
// ══════════════════════════════════════════════════════════════════

function generateCOL_mixte_PT(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres    != null) ? opts.nbEtageres    : 1;
  var nbPortes    = (opts.nbPortesHaut  != null) ? opts.nbPortesHaut  : 2;
  var nbTiroirs   = (opts.nbTiroirs     != null) ? opts.nbTiroirs     : 2;
  var ratioP      = (opts.ratioZonePorte != null) ? opts.ratioZonePorte : 0.7;
  if (ratioP < 0.2) ratioP = 0.2;
  if (ratioP > 0.9) ratioP = 0.9;

  var pl = resoudrePlinthe(opts);
  var Lint = L - 2 * ep;
  var hUtile = hauteurInterieure(H, ep, pl.typePlinthe, pl.hPl);

  var hZoneP = Math.round(hUtile * ratioP - ep / 2);
  var hZoneT = Math.round(hUtile * (1 - ratioP) - ep / 2);

  var hPorte, larPorte, hFacadeTir, larFacadeTir;

  if (typePortes === 'encastree') {
    hPorte   = hZoneP - 2 * JEU_ENCASTREE;
    larPorte = (Lint - JEU_ENCASTREE * (nbPortes + 1)) / nbPortes;
    var hFacadesTotal = hZoneT - 2 * JEU_ENCASTREE - (nbTiroirs - 1) * JEU_ENTRE_TIROIRS;
    hFacadeTir   = Math.round(hFacadesTotal / nbTiroirs);
    larFacadeTir = Lint - 2 * JEU_ENCASTREE;
  } else {
    hPorte = Math.round(ep + hZoneP + ep / 2 - 2 * JEU_APPLIQUE_BORD);
    larPorte = (L - 2 * JEU_APPLIQUE_BORD - JEU_ENTRE_PORTES * (nbPortes - 1)) / nbPortes;
    var hFacadesTotalApp = Math.round(ep / 2 + hZoneT + ep - 2 * JEU_APPLIQUE_BORD - (nbTiroirs - 1) * JEU_ENTRE_TIROIRS);
    hFacadeTir = Math.round(hFacadesTotalApp / nbTiroirs);
    larFacadeTir = Math.round(L - 2 * JEU_APPLIQUE_BORD);
  }

  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Traverse intermediaire', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1, _typeForce: 'panneau' }
  ];

  if (nbEtag > 0) {
    pieces.push({ designation: 'Etagere', longueur: Lint - 2, largeur: P - retraitEtag, epaisseur: ep, nombre: nbEtag });
  }

  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }

  pieces.push({ designation: 'Porte', longueur: hPorte, largeur: larPorte, epaisseur: ep, nombre: nbPortes });
  pieces.push({ designation: 'Facade tiroir', longueur: hFacadeTir, largeur: larFacadeTir, epaisseur: ep, nombre: nbTiroirs });

  return {
    nom: 'Colonne mixte ' + nbPortes + 'P haut + ' + nbTiroirs + 'T bas ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: typePortes, typePlinthe: pl.typePlinthe,
    debutPerc: 96, margeBas: 100, image3D: null
  };
}

// ══════════════════════════════════════════════════════════════════
// COLONNE AVEC MONTANTS INTERMEDIAIRES (COL_MI) - portes uniquement
// ══════════════════════════════════════════════════════════════════
// Structure :
//   - 2 cotes exterieurs pleine hauteur
//   - panneau superieur CONTINU sur toute la largeur L
//   - panneau inferieur CONTINU sur toute la largeur L
//   - N montants intermediaires (panneaux verticaux interieurs)
//   - plinthe sur toute la largeur L
//   - etageres dans chaque sous-colonne
//   - portes reparties selon opts.sousColonnes (nombre par sous-colonne)
//
// opts.sousColonnes : tableau decrivant chaque sous-colonne
//   [ { largeur_ratio: 0.6, nbPortes: 2 },
//     { largeur_ratio: 0.4, nbPortes: 1 } ]
//
// Si opts.sousColonnes absent, on repartit equitablement.

function generateCOL_MI(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtagParSC = (opts.nbEtageresParSousColonne != null) ? opts.nbEtageresParSousColonne : 3;
  var nbMI        = (opts.nbMI != null) ? opts.nbMI : 1;
  var nbSC        = nbMI + 1;  // nombre de sous-colonnes = MI + 1

  var pl = resoudrePlinthe(opts);
  var Lint  = L - 2 * ep;                // largeur interieure totale
  var Lutil = Lint - nbMI * ep;          // largeur utile pour les sous-colonnes
  var hUtile = hauteurInterieure(H, ep, pl.typePlinthe, pl.hPl);

  // Repartition des sous-colonnes
  // Si opts.sousColonnes fourni, on l'utilise. Sinon equitable.
  var sousColonnes;
  if (opts.sousColonnes && opts.sousColonnes.length === nbSC) {
    sousColonnes = opts.sousColonnes;
  } else {
    var totalPortes = opts.nbPortes || (2 * nbSC);
    var portesParSC = Math.floor(totalPortes / nbSC);
    sousColonnes = [];
    for (var sc = 0; sc < nbSC; sc++) {
      sousColonnes.push({ largeur_ratio: 1 / nbSC, nbPortes: portesParSC });
    }
  }

  // Calcul des largeurs interieures de chaque sous-colonne
  var largeursSC = [];
  for (var s = 0; s < nbSC; s++) {
    var r = (sousColonnes[s].largeur_ratio != null) ? sousColonnes[s].largeur_ratio : (1 / nbSC);
    largeursSC.push(Math.round(Lutil * r));
  }

  // ── Pieces de base ───────────────────────────────────────────────
  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 }
  ];

  // Montants intermediaires : panneaux verticaux entre pan sup et pan inf
  // Hauteur = hUtile (meme hauteur que l'espace interieur utilisable)
  if (nbMI > 0) {
    pieces.push({
      designation: 'Montant intermediaire',
      longueur:    hUtile,
      largeur:     P,
      epaisseur:   ep,
      nombre:      nbMI,
      _typeForce:  'montant'
    });
  }

  // Plinthe
  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }

  // ── Etageres et portes par sous-colonne ─────────────────────────
  for (var i = 0; i < nbSC; i++) {
    var larInt_sc = largeursSC[i];
    var nbP_sc    = sousColonnes[i].nbPortes || 0;

    // Etageres de cette sous-colonne
    if (nbEtagParSC > 0) {
      pieces.push({
        designation: 'Etagere SC' + (i + 1),
        longueur:    larInt_sc - 2,
        largeur:     P - retraitEtag,
        epaisseur:   ep,
        nombre:      nbEtagParSC,
        _typeForce:  'etagere'
      });
    }

    // Portes de cette sous-colonne
    if (nbP_sc > 0) {
      var hPorte_sc, larPorte_sc;
      if (typePortes === 'encastree') {
        hPorte_sc   = hUtile - 2 * JEU_ENCASTREE;
        larPorte_sc = (larInt_sc - JEU_ENCASTREE * (nbP_sc + 1)) / nbP_sc;
      } else {
        hPorte_sc = H - pl.hPl_eff - 2 * JEU_APPLIQUE_BORD;
        // Largeur exterieure de la sous-colonne (pour applique)
        // = largeur interieure + ep/2 de chaque cote (demi-jeu sur montant)
        // Pour simplicite : on considere la largeur exterieure de la SC
        // comme larInt_sc + ep (demi-montant de chaque cote)
        // Sauf pour les sous-colonnes de bord qui ont un cote exterieur
        var larExt_sc = larInt_sc + ep;
        larPorte_sc = (larExt_sc - 2 * JEU_APPLIQUE_BORD - JEU_ENTRE_PORTES * (nbP_sc - 1)) / nbP_sc;
      }

      pieces.push({
        designation: 'Porte SC' + (i + 1),
        longueur:    hPorte_sc,
        largeur:     larPorte_sc,
        epaisseur:   ep,
        nombre:      nbP_sc,
        _typeForce:  'porte'
      });
    }
  }

  return {
    nom: 'Colonne MI ' + nbMI + ' montant' + (nbMI > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: typePortes, typePlinthe: pl.typePlinthe,
    debutPerc: 96, margeBas: 100, image3D: null
  };
}

// ══════════════════════════════════════════════════════════════════
// NICHE OUVERTE (NO)
// ══════════════════════════════════════════════════════════════════

function generateNO_base(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 3;

  var pl = resoudrePlinthe(opts);
  var Lint = L - 2 * ep;

  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }

  return {
    nom: 'Niche ouverte ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur: P, epaisseur: ep,
    typePortes: 'aucune', typePlinthe: pl.typePlinthe,
    debutPerc: 96, margeBas: 100, image3D: null
  };
}
