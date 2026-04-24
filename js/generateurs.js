/* ================================================================
   THE WOODER - generateurs.js (v5)
   ================================================================
   CHANGELOG v5 :
   - Ajout de l'archetype COL_mixte_PT (colonne portes haut + tiroirs bas)
     avec traverse structurelle entre les 2 zones
   - Lecture du ratio de repartition depuis opts.ratioZonePorte (venu
     de la composition detectee par l'IA)

   Les facades tiroirs ont "tiroir" dans leur designation pour que
   calculerTiroirs de tiroirs.js les detecte et produise les caissons
   Tandem (joues, fond, dos).
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
// CAISSONS HAUTS (CH) - sans plinthe
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
// COLONNES SIMPLES (COL)
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
// COLONNE MIXTE : PORTES EN HAUT + TIROIRS EN BAS (COL_mixte_PT)
// ══════════════════════════════════════════════════════════════════
// Structure :
//   - 2 cotes pleine hauteur
//   - panneau superieur (en haut)
//   - panneau inferieur (en bas, sur la plinthe)
//   - TRAVERSE horizontale (separe zone portes et zone tiroirs)
//   - plinthe (selon choix utilisateur)
//   - N etageres dans la zone portes
//   - K portes couvrant la zone haute
//   - M facades tiroirs couvrant la zone basse
//
// Ratios :
//   - ratioZonePorte : proportion de la hauteur utile occupee par la
//     zone porte (par defaut 0.7 si null). La zone tiroir prend le
//     reste (1 - ratioZonePorte).

function generateCOL_mixte_PT(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres    != null) ? opts.nbEtageres    : 1;
  var nbPortes    = (opts.nbPortesHaut  != null) ? opts.nbPortesHaut  : 2;
  var nbTiroirs   = (opts.nbTiroirs     != null) ? opts.nbTiroirs     : 2;
  var ratioP      = (opts.ratioZonePorte != null) ? opts.ratioZonePorte : 0.7;
  // Garde-fou sur le ratio
  if (ratioP < 0.2) ratioP = 0.2;
  if (ratioP > 0.9) ratioP = 0.9;

  var pl = resoudrePlinthe(opts);
  var Lint = L - 2 * ep;
  var hUtile = hauteurInterieure(H, ep, pl.typePlinthe, pl.hPl);

  // Hauteurs des 2 zones. La traverse prend ep au milieu.
  // hZoneP = hauteur interieure de la zone porte (entre pan sup et traverse)
  // hZoneT = hauteur interieure de la zone tiroir (entre traverse et pan inf)
  var hZoneP = Math.round(hUtile * ratioP - ep / 2);
  var hZoneT = Math.round(hUtile * (1 - ratioP) - ep / 2);

  // ── Hauteur des facades visibles ─────────────────────────────────
  // En applique, les facades couvrent les chants du caisson
  //
  // Porte haute (en applique) : couvre du haut du caisson jusqu'a mi-traverse
  // Facade tiroir basse : couvre de mi-traverse jusqu'au haut de plinthe
  var hPorte, larPorte, hFacadeTir, larFacadeTir;

  if (typePortes === 'encastree') {
    hPorte   = hZoneP - 2 * JEU_ENCASTREE;
    larPorte = (Lint - JEU_ENCASTREE * (nbPortes + 1)) / nbPortes;
    // Facade tiroir totale sur toute la zone tiroir moins jeux
    // On divise en nbTiroirs facades de hauteur egale
    var hFacadesTotal = hZoneT - 2 * JEU_ENCASTREE - (nbTiroirs - 1) * JEU_ENTRE_TIROIRS;
    hFacadeTir   = Math.round(hFacadesTotal / nbTiroirs);
    larFacadeTir = Lint - 2 * JEU_ENCASTREE;
  } else {
    // Applique
    // La porte haute couvre : pan sup (ep) + hZoneP + ep/2 de la traverse
    //   = ep + hZoneP + ep/2 = ep + hUtile*ratioP - ep/2 + ep/2 = ep + hUtile*ratioP - ep/2
    //   Approx : ep + hZoneP + ep/2
    //   Avec jeu 1.5mm en haut + 1.5mm en bas : - 3mm
    hPorte = Math.round(ep + hZoneP + ep / 2 - 2 * JEU_APPLIQUE_BORD);
    larPorte = (L - 2 * JEU_APPLIQUE_BORD - JEU_ENTRE_PORTES * (nbPortes - 1)) / nbPortes;
    // Facade tiroir couvre ep/2 traverse + hZoneT + ep pan inf + hPl
    // Mais en fait la facade tiroir du bas peut descendre jusqu'au sol
    // Pour simplicite on fait : les N facades remplissent la zone (ep/2 + hZoneT + ep)
    // Hauteur totale facades = ep/2 + hZoneT + ep - jeux (haut 1.5mm + bas 1.5mm + 3mm entre)
    var hFacadesTotalApp = Math.round(ep / 2 + hZoneT + ep - 2 * JEU_APPLIQUE_BORD - (nbTiroirs - 1) * JEU_ENTRE_TIROIRS);
    hFacadeTir = Math.round(hFacadesTotalApp / nbTiroirs);
    larFacadeTir = Math.round(L - 2 * JEU_APPLIQUE_BORD);
  }

  // ── Construction des pieces ──────────────────────────────────────
  var pieces = [
    { designation: 'Cote',              longueur: H,    largeur: P, epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1 },
    // Traverse : meme dimensions qu'un panneau. On lui met _typeForce='panneau'
    // pour qu'elle soit traitee comme un panneau par calculerConnecteurs
    { designation: 'Traverse intermediaire', longueur: Lint, largeur: P, epaisseur: ep, nombre: 1, _typeForce: 'panneau' }
  ];

  // Etagere(s) dans la zone portes
  if (nbEtag > 0) {
    pieces.push({ designation: 'Etagere', longueur: Lint - 2, largeur: P - retraitEtag, epaisseur: ep, nombre: nbEtag });
  }

  // Plinthe
  if (pl.typePlinthe !== 'aucune') {
    pieces.push({ designation: 'Plinthe', longueur: L, largeur: pl.hPl, epaisseur: ep, nombre: 1 });
  }

  // Portes (zone haute)
  pieces.push({ designation: 'Porte', longueur: hPorte, largeur: larPorte, epaisseur: ep, nombre: nbPortes });

  // Facades tiroirs (zone basse). "tiroir" dans la designation pour que
  // calculerTiroirs produise les caissons Tandem.
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
