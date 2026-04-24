/* ================================================================
   THE WOODER - generateurs.js (v2)
   ================================================================
   Generateurs d'archetypes : fonctions qui produisent un objet
   meuble compatible avec le pipeline existant (window._meubles).

   CHANGELOG v2 :
   - Constantes globales JEU_APPLIQUE_BORD, JEU_ENTRE_PORTES, JEU_ENCASTREE
   - Regle demi-jeu pour portes applique :
       * 1.5mm entre tout bord exterieur du caisson et la porte
       * 3mm directement entre 2 portes dans un meme caisson
       * Resultat entre 2 caissons voisins : 1.5 + 1.5 = 3mm automatique
   - Regle 3mm tout autour pour portes encastree
   - Nouvel archetype generateCB_1P (caisson bas 1 porte)

   ================================================================ */

// ══════════════════════════════════════════════════════════════════
// CONSTANTES DE JEUX (regles de Pierre, valables pour tous archetypes)
// ══════════════════════════════════════════════════════════════════
var JEU_APPLIQUE_BORD   = 1.5;  // entre bord ext. caisson et porte applique
var JEU_ENTRE_PORTES    = 3;    // entre 2 portes dans le meme caisson
var JEU_ENCASTREE       = 3;    // tout autour des portes encastrees

// ══════════════════════════════════════════════════════════════════
// HELPER : ajoute un meuble genere et declenche le pipeline
// ══════════════════════════════════════════════════════════════════
function ajouterMeubleGenere(meuble) {
  if (!window._meubles) window._meubles = [];
  window._meubles.push(meuble);
  afficherListeMeubles();
  afficherToutesPieces();   // declenche lancerCalcul() automatiquement
  _miseAJourCompteur();
}

// ══════════════════════════════════════════════════════════════════
// HELPER : calcule les dimensions de N portes dans un caisson
// ══════════════════════════════════════════════════════════════════
// Retourne { hPorte, larPorte } en appliquant la bonne regle de jeux.
function dimsPorte(H, L, hPl, ep, Lint, hInt, nbPortes, typePortes) {
  if (typePortes === 'encastree') {
    return {
      hPorte:   hInt - 2 * JEU_ENCASTREE,
      larPorte: (Lint - JEU_ENCASTREE * (nbPortes + 1)) / nbPortes
    };
  }
  // applique
  return {
    hPorte:   H - hPl - 2 * JEU_APPLIQUE_BORD,
    larPorte: (L - 2 * JEU_APPLIQUE_BORD - JEU_ENTRE_PORTES * (nbPortes - 1)) / nbPortes
  };
}

// ══════════════════════════════════════════════════════════════════
// ARCHETYPE : Caisson bas 2 portes (CB_2P)
// ══════════════════════════════════════════════════════════════════
function generateCB_2P(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var hPl         = opts.hPlinthe    || 100;
  var typePlinthe = opts.typePlinthe || 'encastree';
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;

  var Lint = L - 2 * ep;
  var hPl_eff = (typePlinthe === 'aucune') ? 0 : hPl;
  var hInt;
  if (typePlinthe === 'encastree')      hInt = H - 2 * ep - hPl;
  else if (typePlinthe === 'applique')  hInt = H -     ep - hPl;
  else                                  hInt = H - 2 * ep;

  var dp = dimsPorte(H, L, hPl_eff, ep, Lint, hInt, 2, typePortes);

  var lonEtag = Lint - 2;
  var larEtag = P - retraitEtag;

  return {
    nom: 'Caisson bas 2 portes ' + L + 'x' + H + 'x' + P,
    pieces: [
      { designation: 'Cote',              longueur: H,          largeur: P,       epaisseur: ep, nombre: 2 },
      { designation: 'Panneau superieur', longueur: Lint,       largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Panneau inferieur', longueur: Lint,       largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Etagere',           longueur: lonEtag,    largeur: larEtag, epaisseur: ep, nombre: 1 },
      { designation: 'Plinthe',           longueur: L,          largeur: hPl,     epaisseur: ep, nombre: 1 },
      { designation: 'Porte',             longueur: dp.hPorte,  largeur: dp.larPorte, epaisseur: ep, nombre: 2 }
    ],
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
// ARCHETYPE : Caisson bas 1 porte (CB_1P)
// ══════════════════════════════════════════════════════════════════
// Meme structure que CB_2P mais avec une seule porte.
// Utile pour les caissons etroits (300-500mm) ou les tampons en bout.
function generateCB_1P(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var hPl         = opts.hPlinthe    || 100;
  var typePlinthe = opts.typePlinthe || 'encastree';
  var typePortes  = opts.typePortes  || 'applique';
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;

  var Lint = L - 2 * ep;
  var hPl_eff = (typePlinthe === 'aucune') ? 0 : hPl;
  var hInt;
  if (typePlinthe === 'encastree')      hInt = H - 2 * ep - hPl;
  else if (typePlinthe === 'applique')  hInt = H -     ep - hPl;
  else                                  hInt = H - 2 * ep;

  var dp = dimsPorte(H, L, hPl_eff, ep, Lint, hInt, 1, typePortes);

  var lonEtag = Lint - 2;
  var larEtag = P - retraitEtag;

  return {
    nom: 'Caisson bas 1 porte ' + L + 'x' + H + 'x' + P,
    pieces: [
      { designation: 'Cote',              longueur: H,          largeur: P,       epaisseur: ep, nombre: 2 },
      { designation: 'Panneau superieur', longueur: Lint,       largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Panneau inferieur', longueur: Lint,       largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Etagere',           longueur: lonEtag,    largeur: larEtag, epaisseur: ep, nombre: 1 },
      { designation: 'Plinthe',           longueur: L,          largeur: hPl,     epaisseur: ep, nombre: 1 },
      { designation: 'Porte',             longueur: dp.hPorte,  largeur: dp.larPorte, epaisseur: ep, nombre: 1 }
    ],
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
// VERIFICATION DES FORMULES
// ══════════════════════════════════════════════════════════════════
// CB_2P 800x740x400, plinthe 100 applique, portes applique :
//   hPorte   = 740 - 100 - 1.5 - 1.5 = 637 mm
//   larPorte = (800 - 3 - 3) / 2     = 397 mm
//
// CB_1P 400x740x400, plinthe 100 applique, porte applique :
//   hPorte   = 740 - 100 - 1.5 - 1.5 = 637 mm
//   larPorte = (400 - 3) / 1         = 397 mm
