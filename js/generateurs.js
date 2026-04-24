/* ================================================================
   THE WOODER - generateurs.js
   ================================================================
   Generateurs d'archetypes : fonctions qui produisent un objet
   meuble compatible avec le pipeline existant (window._meubles).

   Chaque generateur prend (L, H, P, opts) et retourne un objet
   meuble pret a etre push dans window._meubles. Les designations
   des pieces sont choisies pour etre classifiees correctement
   par detectType(designation).

   Usage console :
     ajouterMeubleGenere(generateCB_2P(800, 720, 580));
     // Declenche automatiquement tout le pipeline de calcul
     // (chant, percages, rainures, connecteurs, charnieres, fonds,
     //  tiroirs, cutlist, optimisation, prix).

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html et pdf-import.js)
   ----------------------------------------------------------------
     window._meubles          - tableau des meubles
     afficherListeMeubles()   - de pdf-import.js
     afficherToutesPieces()   - de pdf-import.js (declenche lancerCalcul)
     _miseAJourCompteur()     - de pdf-import.js

   ----------------------------------------------------------------
   A ajouter a calcul.html dans la liste des <script> a la fin :
     <script src="js/generateurs.js"></script>
   ================================================================ */

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
// ARCHETYPE : Caisson bas 2 portes (CB_2P)
// ══════════════════════════════════════════════════════════════════
// Composition :
//   - 2 lateraux (cotes G + D) de H x P x ep
//   - 1 panneau superieur et 1 panneau inferieur
//   - 1 etagere (retrait 20mm par rapport au bord avant, 1mm par cote)
//   - 1 plinthe
//   - 2 portes (1 paire)
// Les fonds 8mm sont recalcules automatiquement par calculerFonds
// (on ne les genere pas ici).
//
// Parametres :
//   L    - largeur hors-tout (mm)
//   H    - hauteur hors-tout (mm)
//   P    - profondeur hors-tout (mm)
//   opts - objet optionnel avec :
//     ep           : epaisseur panneaux (defaut 19)
//     hPlinthe     : hauteur plinthe (defaut 100)
//     typePlinthe  : 'encastree' | 'applique' | 'aucune' (defaut 'encastree')
//     typePortes   : 'applique' | 'encastree' (defaut 'applique')
//     jeuPortes    : jeu portes en mm (defaut : 3 pour applique, 3 pour encastree)
//     retraitEtag  : retrait etagere en profondeur depuis bord avant (defaut 20)
function generateCB_2P(L, H, P, opts) {
  opts = opts || {};
  var ep          = opts.ep          || 19;
  var hPl         = opts.hPlinthe    || 100;
  var typePlinthe = opts.typePlinthe || 'encastree';
  var typePortes  = opts.typePortes  || 'applique';
  var jP          = (opts.jeuPortes != null) ? opts.jeuPortes : 3;
  var retraitEtag = (opts.retraitEtag != null) ? opts.retraitEtag : 20;

  // ── Dimensions derivees ─────────────────────────────────────────
  // Largeur interieure entre les 2 lateraux
  var Lint = L - 2 * ep;

  // Hauteur interieure (entre panneau sup et panneau inf, au-dessus plinthe)
  // À VALIDER : le pipeline utilise typePlinthe dans classifierMontants
  // avec les formules ci-dessous (voir calculs.js ligne 79-81)
  var hInt;
  if (typePlinthe === 'encastree')      hInt = H - 2 * ep - hPl;
  else if (typePlinthe === 'applique')  hInt = H -     ep - hPl;
  else                                  hInt = H - 2 * ep;            // 'aucune'

  // ── Dimensions des portes ───────────────────────────────────────
  // À VALIDER avec Pierre : conventions de jeu autour des portes.
  // - Applique : la porte recouvre la face du caisson (sauf plinthe encastree
  //   qui reste visible). Jeu de ~1,5mm haut + 1,5mm bas = 3mm total.
  //   Largeur : 2 portes cote a cote avec 3mm de jeu total horizontal.
  // - Encastree : la porte s'inscrit dans le passage interieur
  //   (hInt x Lint) avec 3mm de jeu par cote.
  var hPorte, larPorte;
  if (typePortes === 'applique') {
    // Hauteur : du haut de la plinthe (visible) jusqu'en haut du caisson,
    // moins 2 x jeu/2. Si plinthe encastree, la porte cache le panneau inf
    // mais pas la plinthe.
    hPorte  = H - hPl - jP;
    larPorte = (L - jP) / 2;           // 2 portes jointives avec jeu central
  } else {
    // Encastree : inscrite entre lateraux + entre panneau inf et sup
    hPorte  = hInt - jP;               // 1.5mm haut + 1.5mm bas
    larPorte = (Lint - jP) / 2;        // 1.5mm gauche + 1.5mm centre par porte
  }

  // ── Dimensions de l'etagere ─────────────────────────────────────
  // 1mm de jeu lateral par cote, retrait en profondeur (pour rainure fond
  // + respiration)
  // NB : calculerCutlist recalcule la profondeur etagere via profEtag
  // = profLat - RAIN_DIST_BORD - RAIN_LARGEUR (cutlist.js ligne 79).
  // Ici on donne une valeur coherente pour la designation, mais le
  // pipeline corrigera automatiquement.
  var lonEtag = Lint - 2;              // 1mm de jeu par cote (A VALIDER)
  var larEtag = P - retraitEtag;       // sera re-corrige par profEtag

  // ── Construction de l'objet meuble ──────────────────────────────
  // Les designations DOIVENT contenir les mots-cles reconnus par detectType :
  //   'cote' ou 'lateral' -> lateral
  //   'superieur' ou 'inferieur' -> panneau
  //   'etagere' -> etagere
  //   'plinthe' -> plinthe
  //   'porte' -> porte
  return {
    nom: 'Caisson bas 2 portes ' + L + 'x' + H + 'x' + P,
    pieces: [
      { designation: 'Cote',              longueur: H,       largeur: P,       epaisseur: ep, nombre: 2 },
      { designation: 'Panneau superieur', longueur: Lint,    largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Panneau inferieur', longueur: Lint,    largeur: P,       epaisseur: ep, nombre: 1 },
      { designation: 'Etagere',           longueur: lonEtag, largeur: larEtag, epaisseur: ep, nombre: 1 },
      { designation: 'Plinthe',           longueur: L,       largeur: hPl,     epaisseur: ep, nombre: 1 },
      { designation: 'Porte',             longueur: hPorte,  largeur: larPorte, epaisseur: ep, nombre: 2 }
    ],
    profondeur:  P,
    epaisseur:   ep,
    typePortes:  typePortes,
    typePlinthe: typePlinthe,
    debutPerc:   96,
    margeBas:    100,
    image3D:     null
    // nombre:2 sur les portes => sens='paire' dans lancerCalcul,
    // ce qui declenche le calcul de charnieres gauche + droite dans
    // calculerCharnieres (1 paire = 2 portes opposees).
  };
}

// ══════════════════════════════════════════════════════════════════
// TEST / USAGE
// ══════════════════════════════════════════════════════════════════
//
// 1. Validation rapide du JSON produit (console du navigateur) :
//      console.log(JSON.stringify(generateCB_2P(800, 720, 580), null, 2));
//
// 2. Test complet dans calcul.html (console du navigateur) :
//      ajouterMeubleGenere(generateCB_2P(800, 720, 580));
//    -> le pipeline complet (debit, perçages, rainures, connecteurs,
//       charnieres, fonds, cutlist, optimisation, prix) se lance seul.
//
// 3. Test avec options :
//      ajouterMeubleGenere(generateCB_2P(800, 720, 580, {
//        typePlinthe: 'applique',
//        typePortes:  'encastree',
//        hPlinthe:    150
//      }));
//
// POINTS A VALIDER avec Pierre :
//   [ ] Jeu des portes applique (3mm total haut+bas ? centre ?)
//   [ ] Jeu des portes encastree (3mm total autour ?)
//   [ ] Retrait etagere en profondeur (20mm est la valeur par defaut)
//   [ ] Retrait etagere en largeur (1mm par cote suffit ?)
//   [ ] Une seule etagere par defaut, ou plusieurs ?
//   [ ] Faut-il ajouter les pieds reglables / fixations dans l'objet ?
