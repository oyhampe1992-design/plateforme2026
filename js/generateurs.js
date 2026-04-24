/* ================================================================
   THE WOODER - generateurs.js (v4)
   ================================================================
   CHANGELOG v4 :
   - Ajout des archetypes NO_base (niche ouverte), COL_1P, COL_2P
   - Lecture du choix plinthe global depuis opts.plinthe (venu du
     mapper qui le lit dans ensemble.plinthe du JSON photo)
   - opts.hPlinthe est maintenant la hauteur venant de l'utilisateur
     (au lieu du defaut 100mm)
   - opts.typePlinthe peut etre 'aucune' | 'encastree' | 'applique'
   ================================================================ */

// ══════════════════════════════════════════════════════════════════
// CONSTANTES DE JEUX
// ══════════════════════════════════════════════════════════════════
var JEU_APPLIQUE_BORD = 1.5;
var JEU_ENTRE_PORTES  = 3;
var JEU_ENCASTREE     = 3;

// ══════════════════════════════════════════════════════════════════
// HELPER : ajoute un meuble genere et declenche le pipeline
// ══════════════════════════════════════════════════════════════════
function ajouterMeubleGenere(meuble) {
  if (!window._meubles) window._meubles = [];
  window._meubles.push(meuble);
  afficherListeMeubles();
  afficherToutesPieces();
  _miseAJourCompteur();
}

// ══════════════════════════════════════════════════════════════════
// HELPER : dimensions d'une porte selon type et nombre
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// HELPER : construit N etageres identiques
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
// HELPER : resout le type et la hauteur de plinthe effective
// ══════════════════════════════════════════════════════════════════
// Lit opts.typePlinthe et opts.hPlinthe. Si 'aucune', hPl_eff = 0.
function resoudrePlinthe(opts) {
  var typePl = opts.typePlinthe || 'encastree';
  var hPl    = (opts.hPlinthe != null) ? opts.hPlinthe : 100;
  if (typePl === 'aucune') {
    return { typePlinthe: 'aucune', hPl: 0, hPl_eff: 0 };
  }
  return { typePlinthe: typePl, hPl: hPl, hPl_eff: hPl };
}

// ══════════════════════════════════════════════════════════════════
// HELPER : hauteur interieure selon type de plinthe
// ══════════════════════════════════════════════════════════════════
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
// COLONNES PLEINE HAUTEUR (COL)
// ══════════════════════════════════════════════════════════════════
// Clone structurel de CB mais typique en H 2000-2400, plusieurs
// etageres, plinthe selon choix utilisateur.

function generateCOL_2P(L, H, P, opts) { return _genererCOL(L, H, P, opts, 2); }
function generateCOL_1P(L, H, P, opts) { return _genererCOL(L, H, P, opts, 1); }

function _genererCOL(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  // Par defaut 3 etageres pour une colonne (reparties sur la hauteur)
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
// NICHE OUVERTE (NO) - pas de portes
// ══════════════════════════════════════════════════════════════════
// Structure : 2 cotes + panneau sup + panneau inf + plinthe (optionnelle)
// + N etageres.
// Fond toujours present (gere automatiquement par calculerFonds).

function generateNO_base(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  // Par defaut 3 etageres pour une niche (on voit l'interieur donc
  // c'est rare que nbEtageres soit null, l'IA devrait compter)
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
