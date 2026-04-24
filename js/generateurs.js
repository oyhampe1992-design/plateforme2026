/* ================================================================
   THE WOODER - generateurs.js (v3)
   ================================================================
   CHANGELOG v3 :
   - Ajout des archetypes CH_1P et CH_2P (caissons hauts)
   - Un CH n'a pas de plinthe : structure cote/panneau sup/inf/etagere/porte
   - Nombre d'etageres lu depuis opts.nbEtageres (1 par defaut si non fourni)
   - CB_1P et CB_2P acceptent aussi opts.nbEtageres
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
// hPl = 0 pour un caisson haut (pas de plinthe)
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
// CAISSONS BAS (CB) - avec plinthe
// ══════════════════════════════════════════════════════════════════

function generateCB_2P(L, H, P, opts) {
  return _genererCB(L, H, P, opts, 2);
}

function generateCB_1P(L, H, P, opts) {
  return _genererCB(L, H, P, opts, 1);
}

function _genererCB(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var hPl         = opts.hPlinthe    || 100;
  var typePlinthe = opts.typePlinthe || 'encastree';
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 1;

  var Lint = L - 2 * ep;
  var hInt;
  if (typePlinthe === 'encastree')      hInt = H - 2 * ep - hPl;
  else if (typePlinthe === 'applique')  hInt = H -     ep - hPl;
  else                                  hInt = H - 2 * ep;

  var hPl_eff = (typePlinthe === 'aucune') ? 0 : hPl;
  var dp = dimsPorte(H, L, hPl_eff, ep, Lint, hInt, nbPortes, typePortes);

  var pieces = [
    { designation: 'Cote',              longueur: H,         largeur: P,           epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint,      largeur: P,           epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint,      largeur: P,           epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  pieces.push({ designation: 'Plinthe', longueur: L,         largeur: hPl,         epaisseur: ep, nombre: 1 });
  pieces.push({ designation: 'Porte',   longueur: dp.hPorte, largeur: dp.larPorte, epaisseur: ep, nombre: nbPortes });

  return {
    nom: 'Caisson bas ' + nbPortes + ' porte' + (nbPortes > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur:  P,
    epaisseur:   ep,
    typePortes:  typePortes,
    typePlinthe: typePlinthe,
    debutPerc:   96,
    margeBas:    100,
    image3D:     null
  };
}

// ══════════════════════════════════════════════════════════════════
// CAISSONS HAUTS (CH) - sans plinthe
// ══════════════════════════════════════════════════════════════════

function generateCH_2P(L, H, P, opts) {
  return _genererCH(L, H, P, opts, 2);
}

function generateCH_1P(L, H, P, opts) {
  return _genererCH(L, H, P, opts, 1);
}

function _genererCH(L, H, P, opts, nbPortes) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;
  var nbEtag      = (opts.nbEtageres != null) ? opts.nbEtageres : 1;

  var Lint = L - 2 * ep;
  var hInt = H - 2 * ep;

  // Pas de plinthe => hPl = 0. typePlinthe 'aucune' pour le pipeline.
  var dp = dimsPorte(H, L, 0, ep, Lint, hInt, nbPortes, typePortes);

  var pieces = [
    { designation: 'Cote',              longueur: H,         largeur: P,           epaisseur: ep, nombre: 2 },
    { designation: 'Panneau superieur', longueur: Lint,      largeur: P,           epaisseur: ep, nombre: 1 },
    { designation: 'Panneau inferieur', longueur: Lint,      largeur: P,           epaisseur: ep, nombre: 1 }
  ];
  pieces = pieces.concat(etageres(nbEtag, Lint, P, ep, retraitEtag));
  pieces.push({ designation: 'Porte', longueur: dp.hPorte, largeur: dp.larPorte, epaisseur: ep, nombre: nbPortes });

  return {
    nom: 'Caisson haut ' + nbPortes + ' porte' + (nbPortes > 1 ? 's' : '') + ' ' + L + 'x' + H + 'x' + P,
    pieces: pieces,
    profondeur:  P,
    epaisseur:   ep,
    typePortes:  typePortes,
    typePlinthe: 'aucune',
    debutPerc:   96,
    margeBas:    100,
    image3D:     null
  };
}

// ══════════════════════════════════════════════════════════════════
// VERIFICATION DES FORMULES
// ══════════════════════════════════════════════════════════════════
// CB_2P 800x740x400 plinthe 100 applique, portes applique :
//   hPorte=637, larPorte=397
//
// CH_2P 800x720x330 portes applique :
//   hPorte = 720 - 0 - 1.5 - 1.5 = 717
//   larPorte = (800 - 3 - 3) / 2 = 397
//
// CH_1P 400x720x330 porte applique :
//   hPorte = 720 - 3 = 717
//   larPorte = (400 - 3) / 1 = 397
