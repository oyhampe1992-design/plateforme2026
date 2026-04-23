/* ================================================================
   THE WOODER - catalogues.js
   ================================================================
   Catalogues editables (materiaux, connecteurs, charnieres,
   coulisses, fixations, usinages, chants) avec persistance
   localStorage et rendu UI en tableaux editables.

   Expose :
     CATALOG                    - objet contenant toutes les listes
     MATERIAUX_DEFAULT,
     CONNECTEURS_DEFAULT,
     CHARNIERES_DEFAULT,
     COULISSES_DEFAULT,
     FIXATIONS_DEFAULT,
     USINAGES_DEFAULT,
     CHANTS_DEFAULT             - catalogues par defaut (built-ins)

     catalogueGet(cat, id)      - lecture d'un item
     catalogueMajChamp(...)     - mise a jour d'un champ
     catalogueAjouter(...)      - ajout d'un item custom
     catalogueSupprimer(...)    - suppression d'un item custom

     renderCatalogueMateriaux,
     renderCatalogueConnecteurs,
     renderCatalogueCharnieres,
     renderCatalogueCoulisses,
     renderCatalogueFixations,
     renderCatalogueUsinages,
     renderCatalogueChants      - rendu des tableaux editables

     renderSelectMateriaux,
     renderSelectCharnieres,
     renderSelectCoulisses,
     populateSelectChant        - re-population des dropdowns

     initCatalogues()           - chargement + rendu initial des 6 cats
     initChants()               - chargement + rendu initial des chants
     chargerChants,
     sauvegarderChants          - persistance chants
     majChant, ajouterChant,
     supprimerChant             - actions sur chants
     getChantSelectionne()      - helper pour prix.js

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     _resyncPrixMateriauxActifs  - synchronise les prix actifs
                                    quand un materiau est modifie

   Elements DOM :
     #catalogueMateriaux, #catalogueConnecteurs,
     #catalogueCharnieres, #catalogueCoulisses,
     #catalogueFixations, #catalogueUsinages, #catalogueChants
     #selMat19, #selMatFacades, #selMatFond, #selChant

   Persistance localStorage :
     wooder_catalog_v1           - catalogues principaux
     calcul_chants_v1            - catalogue chants

   ----------------------------------------------------------------
   Usage : initCatalogues() et initChants() appeles au
   DOMContentLoaded AVANT restaurerPrefs(), car les inputs de prix
   dynamiques doivent exister avant que les valeurs sauvegardees y
   soient injectees.
   ================================================================ */

/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — catalogue.js
   Catalogues éditables (matériaux, connecteurs, charnières, coulisses,
   fixations). Chaque catégorie = liste d'items persistée en localStorage.
   Le bouton « + Ajouter » ajoute un item custom dans le catalogue.
   Les dropdowns de « Choix du projet » sont régénérés depuis les catalogues.
═══════════════════════════════════════════════════════════════════ */

var STORAGE_CATALOG = 'wooder_catalog_v1';

// ── Catalogues par défaut (built-ins) ──────────────────────────────
// Chaque matériau a 3 prix : caisson (panneau 19mm), façades, fond.

// Matériaux : chaque ligne = un panneau spécifique (une épaisseur donnée,
// avec ses dimensions et son prix au m²). Pour un même matériau utilisé
// en plusieurs épaisseurs, créer une entrée par épaisseur.
//   ep       = épaisseur (mm)
//   prix     = prix au m² (€)
//   longueur = plus grande dimension de la planche brute (mm)
//   largeur  = plus petite dimension de la planche brute (mm)
var MATERIAUX_DEFAULT = [
  // ─ 19mm : caisson, façades ─
  { id:'mela_blanc_19',  nom:'Mélaminé blanc',          ep:19, prix:22, longueur:2800, largeur:2070 },
  { id:'mela_std_19',    nom:'Mélaminé couleur std',    ep:19, prix:25, longueur:2800, largeur:2070 },
  { id:'mela_prem_19',   nom:'Mélaminé couleur premium',ep:19, prix:30, longueur:2800, largeur:2070 },
  { id:'mela_bois_19',   nom:'Mélaminé ton bois',       ep:19, prix:28, longueur:2800, largeur:2070 },
  { id:'aggl_brut_19',   nom:'Aggloméré brut',          ep:19, prix:18, longueur:2800, largeur:2070 },
  { id:'mdf_brut_19',    nom:'MDF brut',                ep:19, prix:20, longueur:2800, largeur:2070 },
  { id:'mdf_mat_19',     nom:'MDF laqué mat',           ep:19, prix:45, longueur:2800, largeur:2070 },
  { id:'mdf_bril_19',    nom:'MDF laqué brillant',      ep:19, prix:55, longueur:2800, largeur:2070 },
  { id:'plac_chene_19',  nom:'Placage chêne',           ep:19, prix:65, longueur:2500, largeur:1250 },
  { id:'plac_noyer_19',  nom:'Placage noyer',           ep:19, prix:75, longueur:2500, largeur:1250 },
  { id:'cp_bouleau_19',  nom:'Contreplaqué bouleau',    ep:19, prix:35, longueur:2500, largeur:1220 },
  { id:'cp_okoume_19',   nom:'Contreplaqué okoumé',     ep:19, prix:32, longueur:2500, largeur:1220 },
  { id:'osb_19',         nom:'OSB',                     ep:19, prix:12, longueur:2500, largeur:1250 },
  { id:'massif_chene_19',nom:'Panneau massif chêne',    ep:19, prix:85, longueur:2000, largeur:1000 },
  { id:'massif_pin_19',  nom:'Panneau massif pin',      ep:19, prix:50, longueur:2000, largeur:1000 },
  // ─ 10mm : façades fines, étagères ─
  { id:'mdf_brut_10',    nom:'MDF brut',                ep:10, prix:14, longueur:2800, largeur:2070 },
  { id:'cp_bouleau_10',  nom:'Contreplaqué bouleau',    ep:10, prix:28, longueur:2500, largeur:1220 },
  // ─ 8mm : fond standard ─
  { id:'mela_blanc_8',   nom:'Mélaminé blanc',          ep:8,  prix:16, longueur:2800, largeur:2070 },
  { id:'mdf_brut_8',     nom:'MDF brut',                ep:8,  prix:12, longueur:2800, largeur:2070 },
  { id:'aggl_brut_8',    nom:'Aggloméré brut',          ep:8,  prix:10, longueur:2800, largeur:2070 },
  // ─ 5mm, 3mm : fond léger, tiroirs ─
  { id:'hdf_5',          nom:'HDF / Isorel',            ep:5,  prix:9,  longueur:2800, largeur:2070 },
  { id:'hdf_3',          nom:'HDF / Isorel',            ep:3,  prix:7,  longueur:2800, largeur:2070 },
  { id:'cp_okoume_5',    nom:'Contreplaqué okoumé',     ep:5,  prix:15, longueur:2500, largeur:1220 }
];

// Connecteurs : chaque entrée a un prixId (ID DOM legacy) + un baseType
// (algorithme à utiliser). Un modèle custom hérite du baseType d'un parent.
var CONNECTEURS_DEFAULT = [
  { id:'excentrique', nom:'Excentrique',          prixId:'prixExcentrique', prix:0.80, baseType:'excentrique' },
  { id:'tourillon',   nom:'Goujon / Tourillon',   prixId:'prixGoujon',      prix:0.14, baseType:'excentrique' },
  { id:'lamello',     nom:'Biscuit Lamello',      prixId:'prixLamello',     prix:0.25, baseType:'lamello_biscuit' },
  { id:'clamex',      nom:'Clamex P-14',          prixId:'prixClamex',      prix:3.50, baseType:'clamex_p14' },
  { id:'tenso',       nom:'Tenso P-14',           prixId:'prixTenso',       prix:3.80, baseType:'tenso' },
  { id:'domino',      nom:'Domino Festool',       prixId:'prixDomino',      prix:0.40, baseType:'domino' },
  { id:'cabineo_8',   nom:'Cabineo 8',            prixId:'prixCabineo8',    prix:2.60, baseType:'cabineo_8' },
  { id:'cabineo_12',  nom:'Cabineo 12',           prixId:'prixCabineo12',   prix:2.80, baseType:'cabineo_12' },
  { id:'taquet',      nom:'Taquet d\'étagère',    prixId:'prixTaquet',      prix:0.10, baseType:'taquet' }
];

var CHARNIERES_DEFAULT = [
  { id:'blum_inserta', nom:'Blum Inserta',      prixId:'prixCharniere',    prix:6.00, baseType:'blum_inserta' },
  { id:'blum_cliptop', nom:'Blum Clip Top',     prixId:'prixCharnClipTop', prix:4.50, baseType:'blum_cliptop' },
  { id:'simple',       nom:'Charnière simple',  prixId:'prixCharnSimple',  prix:1.50, baseType:'simple' }
];

var FIXATIONS_DEFAULT = [
  { id:'pieds',       nom:'Pieds réglables',    prixId:'prixPieds',            prix:2.50 },
  { id:'fix_murale',  nom:'Fixation murale',    prixId:'prixFixMurale',        prix:4.00 },
  { id:'panier',      nom:'Panier coulissant',  prixId:'prixPanierCoulissant', prix:65   },
  { id:'barre_pend',  nom:'Barre penderie',     prixId:'prixBarrePenderie',    prix:12   }
];

// Usinages : chaque opération a son prix unitaire (avec l'unité adaptée :
// €/trou, €/ml, €/m², €/pce, etc.). Les 3 premiers IDs historiques
// (prixChant, prixDecoupe, prixUsinage) sont conservés pour que prix.js
// continue de fonctionner sans modification.
var USINAGES_DEFAULT = [
  { id:'us_perc_taquet',     nom:'Perçage taquet (Ø5mm)',       prixId:'prixUsPercTaquet',   prix:0.05, unite:'trou' },
  { id:'us_perc_ligne',      nom:'Perçage ligne (système 32)',  prixId:'prixUsPercLigne',    prix:0.05, unite:'trou' },
  { id:'us_perc_exc',        nom:'Perçage excentrique',         prixId:'prixUsPercExc',      prix:0.10, unite:'trou' },
  { id:'us_perc_tou',        nom:'Perçage tourillon',           prixId:'prixUsPercTou',      prix:0.08, unite:'trou' },
  { id:'us_cuvette_charn',   nom:'Cuvette charnière (Ø35mm)',   prixId:'prixUsCuvetteCharn', prix:0.30, unite:'pce' },
  { id:'us_rainure_fond',    nom:'Rainure fond',                prixId:'prixUsRainureFond',  prix:0.30, unite:'ml' },
  { id:'us_poche_cabineo',   nom:'Poche fraisée Cabineo',       prixId:'prixUsPocheCabineo', prix:0.50, unite:'pce' },
  { id:'us_fente_clamex',    nom:'Fente Clamex P-14',           prixId:'prixUsFenteClamex',  prix:0.60, unite:'pce' },
  { id:'us_fente_tenso',     nom:'Fente Tenso P-14',            prixId:'prixUsFenteTenso',   prix:0.60, unite:'pce' },
  { id:'us_mortaise_domino', nom:'Mortaise Domino',             prixId:'prixUsDomino',       prix:0.25, unite:'pce' },
  { id:'us_fente_biscuit',   nom:'Fente biscuit Lamello',       prixId:'prixUsBiscuit',      prix:0.15, unite:'pce' },
  { id:'us_decoupe',         nom:'Découpe droite',              prixId:'prixDecoupe',        prix:0.00, unite:'ml' },
  { id:'us_chant',           nom:'Placage de chant',            prixId:'prixChant',          prix:1.50, unite:'ml' },
  { id:'us_poncage',         nom:'Ponçage',                     prixId:'prixUsPoncage',      prix:2.00, unite:'m²' },
  { id:'us_montage',         nom:'Usinage générique / panneau', prixId:'prixUsinage',        prix:5.00, unite:'pce' }
];

// ── CHANTS — catalogue de types de chants avec placage + fourniture ──
// Chaque type : prix placage (application) + prix fourniture/colle au ml.
// Un seul type est sélectionné par meuble via #selChant.
var CHANTS_DEFAULT = [
  { id:'abs_1mm_blanc',   nom:'ABS 1mm blanc',      prixPlacage:0.80, prixFourniture:0.30 },
  { id:'abs_1mm_couleur', nom:'ABS 1mm couleur',    prixPlacage:1.20, prixFourniture:0.30 },
  { id:'abs_2mm_blanc',   nom:'ABS 2mm blanc',      prixPlacage:1.50, prixFourniture:0.40 },
  { id:'abs_2mm_couleur', nom:'ABS 2mm couleur',    prixPlacage:1.80, prixFourniture:0.40 },
  { id:'chene_massif',    nom:'Chant chêne massif', prixPlacage:3.50, prixFourniture:0.60 },
  { id:'noyer_massif',    nom:'Chant noyer massif', prixPlacage:4.50, prixFourniture:0.60 }
];

// ── Catalogues actifs (built-ins + customs, en mémoire) ───────────
var CATALOG = {
  materiaux:   [],
  connecteurs: [],
  charnieres:  [],
  coulisses:   [],  // dérivé de COULISSES_CONFIG (config.js) + customs
  fixations:   [],
  usinages:    [],
  chants:      []   // types de chants (placage + fourniture au ml)
};

// ── Utilitaires ────────────────────────────────────────────────────
function _clonerAvecBuiltin(src) {
  return src.map(function(o) {
    var c = {};
    for (var k in o) c[k] = o[k];
    c.builtin = true;
    return c;
  });
}

function _fusionnerCustoms(defaut, customs) {
  var out = _clonerAvecBuiltin(defaut);
  if (customs && customs.length) {
    for (var i = 0; i < customs.length; i++) {
      var c = customs[i];
      c.builtin = false;
      out.push(c);
    }
  }
  return out;
}

// ── Chargement / sauvegarde localStorage ──────────────────────────
function catalogueCharger() {
  var data = null;
  try {
    var raw = localStorage.getItem(STORAGE_CATALOG);
    if (raw) data = JSON.parse(raw);
  } catch(e) { data = null; }

  // Matériaux : defaults + prix/dims sauvegardés + customs
  // Formats successifs gérés :
  //   v1 : caisson/facades/fond         → on prend caisson comme prix
  //   v2 : prix + panW/panH             → on recopie tel quel
  //   v3 : ep + prix + longueur/largeur → format courant
  CATALOG.materiaux = _clonerAvecBuiltin(MATERIAUX_DEFAULT);
  if (data && data.materiauxData) {
    for (var i = 0; i < CATALOG.materiaux.length; i++) {
      var m = CATALOG.materiaux[i];
      var saved = data.materiauxData[m.id];
      if (saved) {
        if (typeof saved.ep       === 'number') m.ep       = saved.ep;
        if (typeof saved.prix     === 'number') m.prix     = saved.prix;
        if (typeof saved.longueur === 'number') m.longueur = saved.longueur;
        if (typeof saved.largeur  === 'number') m.largeur  = saved.largeur;
        // Compat v2 : panW/panH
        if (typeof saved.panW === 'number' && m.longueur == null) m.longueur = saved.panW;
        if (typeof saved.panH === 'number' && m.largeur  == null) m.largeur  = saved.panH;
      }
    }
  } else if (data && data.materiauxPrix) {
    // Ancien format v1 : on prend le prix "caisson"
    for (var i2 = 0; i2 < CATALOG.materiaux.length; i2++) {
      var m2 = CATALOG.materiaux[i2];
      var sv = data.materiauxPrix[m2.id];
      if (sv && typeof sv.caisson === 'number') m2.prix = sv.caisson;
    }
  }
  if (data && data.materiauxCustom) {
    for (var j = 0; j < data.materiauxCustom.length; j++) {
      var mc = data.materiauxCustom[j];
      mc.builtin = false;
      // Migration v1 → v3
      if (mc.caisson != null && mc.prix == null) {
        mc.prix = mc.caisson;
        delete mc.caisson; delete mc.facades; delete mc.fond;
      }
      // Migration v2 → v3 (panW/panH → longueur/largeur)
      if (mc.panW != null && mc.longueur == null) { mc.longueur = mc.panW; delete mc.panW; }
      if (mc.panH != null && mc.largeur  == null) { mc.largeur  = mc.panH; delete mc.panH; }
      // Valeurs par défaut pour champs manquants
      if (mc.ep       == null) mc.ep       = 19;
      if (mc.longueur == null) mc.longueur = 2800;
      if (mc.largeur  == null) mc.largeur  = 2070;
      CATALOG.materiaux.push(mc);
    }
  }

  // Connecteurs, charnières, fixations : built-ins + customs
  CATALOG.connecteurs = _fusionnerCustoms(CONNECTEURS_DEFAULT, data && data.connecteursCustom);
  CATALOG.charnieres  = _fusionnerCustoms(CHARNIERES_DEFAULT,  data && data.charnieresCustom);
  CATALOG.fixations   = _fusionnerCustoms(FIXATIONS_DEFAULT,   data && data.fixationsCustom);

  // Usinages : built-ins + prix sauvegardés + customs
  CATALOG.usinages = _clonerAvecBuiltin(USINAGES_DEFAULT);
  if (data && data.usinagesPrix) {
    for (var u = 0; u < CATALOG.usinages.length; u++) {
      var uu = CATALOG.usinages[u];
      if (typeof data.usinagesPrix[uu.id] === 'number') uu.prix = data.usinagesPrix[uu.id];
    }
  }
  if (data && data.usinagesCustom) {
    for (var uc = 0; uc < data.usinagesCustom.length; uc++) {
      var uci = data.usinagesCustom[uc];
      uci.builtin = false;
      CATALOG.usinages.push(uci);
    }
  }

  // Coulisses : dérivé de COULISSES_CONFIG (config.js) + customs
  // Les prix par défaut sont ceux qui étaient codés en dur dans l'HTML v26.
  var COULISSES_PRIX_DEFAULT = {
    'billes_standard':   15,
    'blum_tandem_560h':  45,
    'blum_tandem_19':    55,
    'blum_tandembox':    85,
    'blum_legrabox':    110,
    'blum_movento':      55,
    'hettich_architech': 95,
    'hettich_atira':     65,
    'hettich_quadro':    35,
    'grass_novapro':     80,
    'grass_dynapro':     45
  };
  var coulPrixSauv = (data && data.coulissesPrix) || {};
  CATALOG.coulisses = [];
  if (typeof COULISSES_CONFIG !== 'undefined') {
    for (var k in COULISSES_CONFIG) {
      var c = COULISSES_CONFIG[k];
      CATALOG.coulisses.push({
        id: k,
        nom: c.nom,
        prixId: c.prixId,
        prix: (typeof coulPrixSauv[k] === 'number') ? coulPrixSauv[k] : (COULISSES_PRIX_DEFAULT[k] || 0),
        baseType: k,
        builtin: true
      });
    }
  }
  if (data && data.coulissesCustom) {
    for (var l = 0; l < data.coulissesCustom.length; l++) {
      var cc = data.coulissesCustom[l];
      cc.builtin = false;
      CATALOG.coulisses.push(cc);
    }
  }
}

function catalogueSauvegarder() {
  try {
    // Matériaux : sauvegarder (ep, prix, longueur, largeur) pour built-ins + customs
    var matData = {};
    var matCustoms = [];
    for (var i = 0; i < CATALOG.materiaux.length; i++) {
      var m = CATALOG.materiaux[i];
      if (m.builtin) {
        matData[m.id] = { ep:m.ep, prix:m.prix, longueur:m.longueur, largeur:m.largeur };
      } else {
        matCustoms.push(m);
      }
    }

    // Pour les coulisses built-in : sauvegarder le prix si modifié
    var coulPrix = {};
    for (var n = 0; n < CATALOG.coulisses.length; n++) {
      var cc = CATALOG.coulisses[n];
      if (cc.builtin) coulPrix[cc.id] = cc.prix;
    }

    // Pour les usinages built-in : sauvegarder le prix modifié
    var usPrix = {};
    for (var uu = 0; uu < CATALOG.usinages.length; uu++) {
      var uv = CATALOG.usinages[uu];
      if (uv.builtin) usPrix[uv.id] = uv.prix;
    }

    var payload = {
      materiauxData:     matData,
      materiauxCustom:   matCustoms,
      connecteursCustom: CATALOG.connecteurs.filter(function(o){ return !o.builtin; }),
      charnieresCustom:  CATALOG.charnieres.filter(function(o){ return !o.builtin; }),
      coulissesCustom:   CATALOG.coulisses.filter(function(o){ return !o.builtin; }),
      coulissesPrix:     coulPrix,
      fixationsCustom:   CATALOG.fixations.filter(function(o){ return !o.builtin; }),
      usinagesCustom:    CATALOG.usinages.filter(function(o){ return !o.builtin; }),
      usinagesPrix:      usPrix
    };
    localStorage.setItem(STORAGE_CATALOG, JSON.stringify(payload));
  } catch(e) { console.warn('Catalogue: sauvegarde échouée', e); }
}

// ── CRUD ───────────────────────────────────────────────────────────
function catalogueAjouter(categorie, item) {
  if (!CATALOG[categorie]) return null;
  item.id = item.id || ('cust_' + categorie.slice(0,3) + '_' + Date.now());
  item.builtin = false;
  // Assigner un prixId dynamique pour les customs qui n'en ont pas
  if (!item.prixId) item.prixId = 'prix_' + item.id;
  CATALOG[categorie].push(item);
  catalogueSauvegarder();
  return item;
}

function catalogueSupprimer(categorie, id) {
  if (!CATALOG[categorie]) return;
  CATALOG[categorie] = CATALOG[categorie].filter(function(it) {
    return it.id !== id || it.builtin;  // builtins protégés
  });
  catalogueSauvegarder();
}

function catalogueMajChamp(categorie, id, champ, valeur) {
  if (!CATALOG[categorie]) return;
  for (var i = 0; i < CATALOG[categorie].length; i++) {
    if (CATALOG[categorie][i].id === id) {
      CATALOG[categorie][i][champ] = valeur;
      break;
    }
  }
  catalogueSauvegarder();
}

function catalogueGet(categorie, id) {
  if (!CATALOG[categorie]) return null;
  for (var i = 0; i < CATALOG[categorie].length; i++) {
    if (CATALOG[categorie][i].id === id) return CATALOG[categorie][i];
  }
  return null;
}


/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — catalogue-ui.js
   Rendu des tableaux de catalogues dans "Paramétrage Matériaux & Prix"
   et régénération des dropdowns de "Choix du projet".
═══════════════════════════════════════════════════════════════════ */

// ── Helper : échappement HTML ──────────────────────────────────────
function _escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════════════════════════
// 1. MATÉRIAUX — tableau éditable
// ══════════════════════════════════════════════════════════════════

function renderCatalogueMateriaux() {
  var host = document.getElementById('catalogueMateriaux');
  if (!host) return;
  host.classList.add('cat-table-mat');

  var lignes = CATALOG.materiaux.map(function(m) {
    var btnSup = m.builtin
      ? ''
      : '<button class="btn-cat-del" title="Supprimer" onclick="supprimerMateriau(\'' + _escAttr(m.id) + '\')">✕</button>';
    var nomCell = m.builtin
      ? '<span class="cat-nom">' + _escAttr(m.nom) + '</span>'
      : '<input type="text" class="cat-nom-input" value="' + _escAttr(m.nom) + '" onchange="renommerMateriau(\'' + _escAttr(m.id) + '\', this.value)">';

    function num(champ, v, mn, mx, stp) {
      return '<input type="number" min="' + mn + '" max="' + mx + '" step="' + stp + '" value="' + v + '" data-matid="' + _escAttr(m.id) + '" data-champ="' + champ + '" onchange="majPrixMateriau(this)">';
    }

    return (
      '<div class="cat-row' + (m.builtin ? '' : ' cat-row-custom') + '">' +
        '<div class="cat-cell cat-cell-nom">' + nomCell + '</div>' +
        '<div class="cat-cell">' + num('ep',       m.ep,       1,   50,   1)   + '</div>' +
        '<div class="cat-cell">' + num('prix',     m.prix,     0,    500, 0.5) + '</div>' +
        '<div class="cat-cell">' + num('longueur', m.longueur, 500, 4000, 10)  + '</div>' +
        '<div class="cat-cell">' + num('largeur',  m.largeur,  500, 3500, 10)  + '</div>' +
        '<div class="cat-cell cat-cell-act">' + btnSup + '</div>' +
      '</div>'
    );
  }).join('');

  host.innerHTML =
    '<div class="cat-head">' +
      '<div class="cat-cell cat-cell-nom">Matériau</div>' +
      '<div class="cat-cell">Ép. mm</div>' +
      '<div class="cat-cell">Prix €/m²</div>' +
      '<div class="cat-cell">Longueur mm</div>' +
      '<div class="cat-cell">Largeur mm</div>' +
      '<div class="cat-cell cat-cell-act"></div>' +
    '</div>' +
    lignes +
    '<button class="btn btn-add-cat" onclick="ajouterMateriau()">+ Ajouter un matériau</button>';

  _resyncPrixMateriauxActifs();
}

function renderSelectMateriaux() {
  // Trois dropdowns utilisent les matériaux : selMat19, selMatFacades, selMatFond
  var cibles = [
    { id:'selMat19',       champ:'caisson', prixId:'prixPan19'   },
    { id:'selMatFacades',  champ:'facades', prixId:'prixFacades' },
    { id:'selMatFond',     champ:'fond',    prixId:'prixPan8'    }
  ];
  cibles.forEach(function(cib) {
    var sel = document.getElementById(cib.id);
    if (!sel) return;
    var prev = sel.value;
    var html = '';
    for (var i = 0; i < CATALOG.materiaux.length; i++) {
      var m = CATALOG.materiaux[i];
      html += '<option value="' + _escAttr(m.id) + '">' + _escAttr(m.nom) + '</option>';
    }
    sel.innerHTML = html;
    // Re-sélectionner si l'option existe encore
    if (prev && catalogueGet('materiaux', prev)) sel.value = prev;
  });
}

// Au changement d'un input prix matériau, on met à jour le catalogue
// et si ce matériau est actuellement sélectionné, on synchronise le
// prix actif legacy.
function majPrixMateriau(input) {
  var id = input.getAttribute('data-matid');
  var champ = input.getAttribute('data-champ');
  var val = parseFloat(input.value) || 0;
  catalogueMajChamp('materiaux', id, champ, val);
  _resyncPrixMateriauxActifs();
}

function renommerMateriau(id, nouveauNom) {
  catalogueMajChamp('materiaux', id, 'nom', nouveauNom);
  renderSelectMateriaux();
}

function ajouterMateriau() {
  var nom = prompt('Nom du matériau :', '');
  if (!nom) return;
  var ep   = parseFloat(prompt('Épaisseur (mm) :', '19'))        || 19;
  var prix = parseFloat(prompt('Prix (€/m²) :', '30'))          || 0;
  var lon  = parseFloat(prompt('Longueur du panneau (mm) :', '2800')) || 2800;
  var lar  = parseFloat(prompt('Largeur du panneau (mm) :',  '2070')) || 2070;
  catalogueAjouter('materiaux', { nom:nom, ep:ep, prix:prix, longueur:lon, largeur:lar });
  renderCatalogueMateriaux();
  renderSelectMateriaux();
}

function supprimerMateriau(id) {
  var m = catalogueGet('materiaux', id);
  if (!m || m.builtin) return;
  if (!confirm('Supprimer « ' + m.nom + ' » ?')) return;
  catalogueSupprimer('materiaux', id);
  renderCatalogueMateriaux();
  renderSelectMateriaux();
}

// Synchronise les champs ACTIFS utilisés par les calculs. Les dimensions
// de planche brute ne sont PLUS recopiées dans des inputs du DOM — le
// code de calcul (config.js::lireParams) les lit directement sur le
// matériau sélectionné via le catalogue.
//   selMat19      → prixPan19  + epaisseur
//   selMatFacades → prixFacades
//   selMatFond    → prixPan8   + paramFondEpaisseur
function _resyncPrixMateriauxActifs() {
  function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
  function syncOne(selId, prixId, epId) {
    var sel = document.getElementById(selId);
    if (!sel) return;
    var m = catalogueGet('materiaux', sel.value);
    if (!m) return;
    if (prixId) setVal(prixId, m.prix);
    if (epId)   setVal(epId, m.ep);
  }
  syncOne('selMat19',      'prixPan19',   'epaisseur');
  syncOne('selMatFacades', 'prixFacades', null);
  syncOne('selMatFond',    'prixPan8',    'paramFondEpaisseur');
}

// Remplace l'ancienne majPrixMat de config.js. Les 3 onchange HTML
// (selMat19/Facades/Fond) appellent cette fonction — qui délègue à
// _resyncPrixMateriauxActifs pour tout synchroniser d'un coup.
function majPrixMat(selId, inputId) {
  _resyncPrixMateriauxActifs();
}

// ══════════════════════════════════════════════════════════════════
// 2. CATÉGORIES GÉNÉRIQUES (connecteurs, charnières, coulisses, fixations)
//    Tableau avec une ligne par item, un input prix, bouton supprimer,
//    bouton "+ Ajouter" à la fin.
// ══════════════════════════════════════════════════════════════════

function _renderCatalogueGen(host, categorie, labelAjout, basesPossibles) {
  if (!host) return;
  host.classList.add('cat-table-2col');
  var items = CATALOG[categorie];
  var lignes = items.map(function(it) {
    var btnSup = it.builtin ? '' :
      '<button class="btn-cat-del" title="Supprimer" onclick="supprimerItem(\'' + categorie + '\',\'' + _escAttr(it.id) + '\')">✕</button>';
    var nomCell = it.builtin
      ? '<span class="cat-nom">' + _escAttr(it.nom) + '</span>'
      : '<input type="text" class="cat-nom-input" value="' + _escAttr(it.nom) + '" onchange="renommerItem(\'' + categorie + '\',\'' + _escAttr(it.id) + '\', this.value)">';
    var baseInfo = '';
    if (!it.builtin && it.baseType) {
      var parent = _trouverBaseType(categorie, it.baseType);
      baseInfo = '<div class="cat-base">variante de : ' + _escAttr(parent ? parent.nom : it.baseType) + '</div>';
    }
    return (
      '<div class="cat-row' + (it.builtin ? '' : ' cat-row-custom') + '">' +
        '<div class="cat-cell cat-cell-nom">' + nomCell + baseInfo + '</div>' +
        '<div class="cat-cell cat-cell-prix">' +
          '<input type="number" min="0" step="0.01" id="' + _escAttr(it.prixId) + '" value="' + (it.prix != null ? it.prix : 0) + '" data-catitem="' + categorie + ':' + _escAttr(it.id) + '" onchange="majPrixItem(this)">' +
        '</div>' +
        '<div class="cat-cell cat-cell-act">' + btnSup + '</div>' +
      '</div>'
    );
  }).join('');

  var unite = (categorie === 'fixations' || categorie === 'coulisses' || categorie === 'charnieres') ? '€/pce' : '€/pce';
  host.innerHTML =
    '<div class="cat-head cat-head-2col">' +
      '<div class="cat-cell cat-cell-nom">Modèle</div>' +
      '<div class="cat-cell cat-cell-prix">Prix ' + unite + '</div>' +
      '<div class="cat-cell cat-cell-act"></div>' +
    '</div>' +
    lignes +
    '<button class="btn btn-add-cat" onclick="ajouterItem(\'' + categorie + '\')">' + labelAjout + '</button>';
}

function _trouverBaseType(categorie, baseTypeId) {
  var items = CATALOG[categorie];
  for (var i = 0; i < items.length; i++) {
    if (items[i].builtin && (items[i].baseType === baseTypeId || items[i].id === baseTypeId)) {
      return items[i];
    }
  }
  return null;
}

function renderCatalogueConnecteurs() {
  _renderCatalogueGen(document.getElementById('catalogueConnecteurs'), 'connecteurs', '+ Ajouter un connecteur');
}
function renderCatalogueCharnieres() {
  _renderCatalogueGen(document.getElementById('catalogueCharnieres'), 'charnieres', '+ Ajouter une charnière');
}
function renderCatalogueCoulisses() {
  _renderCatalogueGen(document.getElementById('catalogueCoulisses'), 'coulisses', '+ Ajouter une coulisse');
}
function renderCatalogueFixations() {
  _renderCatalogueGen(document.getElementById('catalogueFixations'), 'fixations', '+ Ajouter une fixation');
}

// Rendu spécifique pour les usinages : 4 colonnes (nom / prix / unité / action)
// parce que l'unité diffère par opération (€/trou, €/ml, €/m², €/pce).
function renderCatalogueUsinages() {
  var host = document.getElementById('catalogueUsinages');
  if (!host) return;
  host.classList.add('cat-table-4col');
  var UNITES = ['trou', 'ml', 'm²', 'pce', 'meuble', 'h'];
  var items = CATALOG.usinages;
  var lignes = items.map(function(it) {
    var btnSup = it.builtin ? '' :
      '<button class="btn-cat-del" title="Supprimer" onclick="supprimerItem(\'usinages\',\'' + _escAttr(it.id) + '\')">✕</button>';
    var nomCell = it.builtin
      ? '<span class="cat-nom">' + _escAttr(it.nom) + '</span>'
      : '<input type="text" class="cat-nom-input" value="' + _escAttr(it.nom) + '" onchange="renommerItem(\'usinages\',\'' + _escAttr(it.id) + '\', this.value)">';
    var unit = it.unite || 'pce';
    var uniteSel = UNITES.map(function(u) {
      return '<option value="' + u + '"' + (u === unit ? ' selected' : '') + '>€/' + u + '</option>';
    }).join('');
    var uniteCell = it.builtin
      ? '<span class="cat-unite">€/' + _escAttr(unit) + '</span>'
      : '<select class="cat-unite-sel" onchange="majUniteUsinage(\'' + _escAttr(it.id) + '\', this.value)">' + uniteSel + '</select>';
    return (
      '<div class="cat-row' + (it.builtin ? '' : ' cat-row-custom') + '">' +
        '<div class="cat-cell cat-cell-nom">' + nomCell + '</div>' +
        '<div class="cat-cell cat-cell-prix">' +
          '<input type="number" min="0" step="0.01" id="' + _escAttr(it.prixId) + '" value="' + (it.prix != null ? it.prix : 0) + '" data-catitem="usinages:' + _escAttr(it.id) + '" onchange="majPrixItem(this)">' +
        '</div>' +
        '<div class="cat-cell cat-cell-unite">' + uniteCell + '</div>' +
        '<div class="cat-cell cat-cell-act">' + btnSup + '</div>' +
      '</div>'
    );
  }).join('');

  host.innerHTML =
    '<div class="cat-head cat-head-4col">' +
      '<div class="cat-cell cat-cell-nom">Opération</div>' +
      '<div class="cat-cell cat-cell-prix">Prix</div>' +
      '<div class="cat-cell cat-cell-unite">Unité</div>' +
      '<div class="cat-cell cat-cell-act"></div>' +
    '</div>' +
    lignes +
    '<button class="btn btn-add-cat" onclick="ajouterUsinage()">+ Ajouter un usinage</button>';
}

// Mise à jour de l'unité d'un usinage custom
function majUniteUsinage(id, unite) {
  catalogueMajChamp('usinages', id, 'unite', unite);
  renderCatalogueUsinages();
}

// Ajout d'un usinage custom (flow dédié pour demander l'unité)
function ajouterUsinage() {
  var nom = prompt('Nom de l\'opération d\'usinage :', '');
  if (!nom) return;
  var unite = prompt('Unité (trou, ml, m², pce, meuble, h) :', 'pce');
  if (!unite) unite = 'pce';
  var prix = parseFloat(prompt('Prix (€/' + unite + ') :', '0')) || 0;
  catalogueAjouter('usinages', { nom:nom, prix:prix, unite:unite });
  renderCatalogueUsinages();
}

// Regénérer les dropdowns de "Choix du projet"
function renderSelectConnecteurs() {
  var sel = document.getElementById('paramTypeConnecteur');
  if (!sel) return;
  var prev = sel.value;
  // On garde les "combinaisons" multi-items existantes (excentrique_tourillon,
  // clamex_biscuit) + les items custom.
  var combos = [
    { val:'excentrique_tourillon', lab:'Excentrique + Tourillon' },
    { val:'clamex_biscuit',        lab:'Clamex P-14 + Biscuit (centre)' },
    { val:'lamello_biscuit',       lab:'Biscuit Lamello seul' },
    { val:'clamex_p14',            lab:'Clamex P-14 seul' },
    { val:'tenso',                 lab:'Lamello Tenso P-14' },
    { val:'domino',                lab:'Festool Domino' },
    { val:'cabineo_8',             lab:'Cabineo 8 (panneau central, ép. ≥ 16mm)' },
    { val:'cabineo_12',            lab:'Cabineo 12' }
  ];
  var html = combos.map(function(c) { return '<option value="' + c.val + '">' + c.lab + '</option>'; }).join('');
  // Customs (variantes de types existants)
  var customs = CATALOG.connecteurs.filter(function(o){ return !o.builtin; });
  if (customs.length) {
    html += '<optgroup label="Modèles personnalisés">';
    html += customs.map(function(c) {
      return '<option value="' + _escAttr(c.baseType || 'excentrique_tourillon') + '" data-custid="' + _escAttr(c.id) + '">' + _escAttr(c.nom) + '</option>';
    }).join('');
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  if (prev) sel.value = prev;
}

function renderSelectCharnieres() {
  var sel = document.getElementById('paramTypeCharniere');
  if (!sel) return;
  var prev = sel.value;
  var html = CATALOG.charnieres.map(function(c) {
    var tag = c.builtin ? c.baseType : (c.baseType || 'simple');
    return '<option value="' + _escAttr(tag) + '" data-custid="' + _escAttr(c.id) + '">' + _escAttr(c.nom) + '</option>';
  }).join('');
  sel.innerHTML = html;
  if (prev) sel.value = prev;
}

function renderSelectCoulisses() {
  var sel = document.getElementById('paramTypeCoulisse');
  if (!sel) return;
  var prev = sel.value;
  // On recrée la structure avec optgroups (Blum / Hettich / Grass / autre)
  function groupOf(id) {
    if (id.indexOf('blum')    === 0) return 'Blum';
    if (id.indexOf('hettich') === 0) return 'Hettich';
    if (id.indexOf('grass')   === 0) return 'Grass';
    return 'Autre';
  }
  var groups = { 'Autre':[], 'Blum':[], 'Hettich':[], 'Grass':[], 'Personnalisé':[] };
  CATALOG.coulisses.forEach(function(c) {
    if (!c.builtin) groups['Personnalisé'].push(c);
    else groups[groupOf(c.id)].push(c);
  });
  var html = '';
  ['Autre','Blum','Hettich','Grass','Personnalisé'].forEach(function(g) {
    if (!groups[g].length) return;
    if (g === 'Autre') {
      html += groups[g].map(function(c) { return '<option value="' + _escAttr(c.baseType || c.id) + '" data-custid="' + _escAttr(c.id) + '">' + _escAttr(c.nom) + '</option>'; }).join('');
    } else {
      html += '<optgroup label="' + g + '">';
      html += groups[g].map(function(c) { return '<option value="' + _escAttr(c.baseType || c.id) + '" data-custid="' + _escAttr(c.id) + '">' + _escAttr(c.nom) + '</option>'; }).join('');
      html += '</optgroup>';
    }
  });
  sel.innerHTML = html;
  if (prev) sel.value = prev;
}

// ── Ajout / suppression / renommage / édition prix ──────────────────
function ajouterItem(categorie) {
  var nom = prompt('Nom du nouveau modèle :', '');
  if (!nom) return;
  var prix = parseFloat(prompt('Prix (€/pce) :', '0')) || 0;
  var baseType = null;

  // Pour connecteurs et coulisses, demander le type parent (pour la géométrie)
  if (categorie === 'connecteurs') {
    baseType = prompt(
      'Algorithme d\'assemblage à utiliser (laissez vide pour excentrique) :\n' +
      'excentrique | clamex_p14 | clamex_biscuit | lamello_biscuit | tenso | domino | cabineo_8 | cabineo_12',
      'excentrique'
    ) || 'excentrique';
  } else if (categorie === 'coulisses') {
    baseType = prompt(
      'Type de coulisse à imiter pour la géométrie :\n' +
      'billes_standard | blum_tandem_560h | blum_tandem_19 | blum_tandembox | blum_legrabox | blum_movento |\n' +
      'hettich_architech | hettich_atira | hettich_quadro | grass_novapro | grass_dynapro',
      'billes_standard'
    ) || 'billes_standard';
  } else if (categorie === 'charnieres') {
    baseType = prompt('Type de charnière à imiter (blum_inserta | blum_cliptop | simple) :', 'simple') || 'simple';
  }

  var item = { nom:nom, prix:prix };
  if (baseType) item.baseType = baseType;
  catalogueAjouter(categorie, item);
  _renderTout(categorie);
}

function supprimerItem(categorie, id) {
  var it = catalogueGet(categorie, id);
  if (!it || it.builtin) return;
  if (!confirm('Supprimer « ' + it.nom + ' » ?')) return;
  catalogueSupprimer(categorie, id);
  _renderTout(categorie);
}

function renommerItem(categorie, id, nouveauNom) {
  catalogueMajChamp(categorie, id, 'nom', nouveauNom);
  _renderTout(categorie);
}

function majPrixItem(input) {
  var ref = input.getAttribute('data-catitem');  // "categorie:id"
  if (!ref) return;
  var parts = ref.split(':');
  var val = parseFloat(input.value) || 0;
  catalogueMajChamp(parts[0], parts[1], 'prix', val);
}

function _renderTout(categorie) {
  if (categorie === 'connecteurs') { renderCatalogueConnecteurs(); renderSelectConnecteurs(); }
  else if (categorie === 'charnieres') { renderCatalogueCharnieres(); renderSelectCharnieres(); }
  else if (categorie === 'coulisses')  { renderCatalogueCoulisses();  renderSelectCoulisses();  }
  else if (categorie === 'fixations')  { renderCatalogueFixations(); }
  else if (categorie === 'materiaux')  { renderCatalogueMateriaux(); renderSelectMateriaux(); }
}

// ══════════════════════════════════════════════════════════════════
// 3. POINT D'ENTRÉE : rendu initial de tous les catalogues
// ══════════════════════════════════════════════════════════════════
function initCatalogues() {
  catalogueCharger();
  renderCatalogueMateriaux();
  renderCatalogueConnecteurs();
  renderCatalogueCharnieres();
  renderCatalogueCoulisses();
  renderCatalogueFixations();
  renderCatalogueUsinages();
  renderSelectMateriaux();
  renderSelectConnecteurs();
  renderSelectCharnieres();
  renderSelectCoulisses();
}

// ================================================================
// CATALOGUE CHANTS (gestion separee car ajout posterieur)
// ================================================================

// ═══════════════════════════════════════════════════════════════════
// CHANTS — gestion du catalogue, rendu UI, persistance, sélecteur
// ═══════════════════════════════════════════════════════════════════
var CHANTS_STORAGE_KEY = 'calcul_chants_v1';

function chargerChants() {
  try {
    var raw = localStorage.getItem(CHANTS_STORAGE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        CATALOG.chants = data;
        return;
      }
    }
  } catch (e) { /* silencieux */ }
  // Par défaut : copie de CHANTS_DEFAULT
  CATALOG.chants = CHANTS_DEFAULT.map(function (c) {
    return { id: c.id, nom: c.nom, prixPlacage: c.prixPlacage, prixFourniture: c.prixFourniture };
  });
}

function sauvegarderChants() {
  try {
    localStorage.setItem(CHANTS_STORAGE_KEY, JSON.stringify(CATALOG.chants));
  } catch (e) { /* silencieux */ }
}

function renderCatalogueChants() {
  var host = document.getElementById('catalogueChants');
  if (!host) return;
  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="background:#f5f2ee">';
  html += '<th style="padding:6px;text-align:left">Nom</th>';
  html += '<th style="padding:6px;text-align:right;width:110px">Placage (€/ml)</th>';
  html += '<th style="padding:6px;text-align:right;width:110px">Fourniture (€/ml)</th>';
  html += '<th style="padding:6px;text-align:right;width:90px">Total (€/ml)</th>';
  html += '<th style="padding:6px;width:40px"></th>';
  html += '</tr></thead><tbody>';
  for (var i = 0; i < CATALOG.chants.length; i++) {
    var c = CATALOG.chants[i];
    var total = (parseFloat(c.prixPlacage) || 0) + (parseFloat(c.prixFourniture) || 0);
    html += '<tr style="border-bottom:1px solid #eee">';
    html += '<td style="padding:4px"><input type="text" value="' + (c.nom || '').replace(/"/g, '&quot;') + '" oninput="majChant(\'' + c.id + '\',\'nom\',this.value)" style="width:100%;border:1px solid #ddd;border-radius:4px;padding:4px;font-size:12px"></td>';
    html += '<td style="padding:4px"><input type="number" min="0" step="0.05" value="' + c.prixPlacage + '" oninput="majChant(\'' + c.id + '\',\'prixPlacage\',parseFloat(this.value)||0)" style="width:100%;border:1px solid #ddd;border-radius:4px;padding:4px;font-size:12px;text-align:right"></td>';
    html += '<td style="padding:4px"><input type="number" min="0" step="0.05" value="' + c.prixFourniture + '" oninput="majChant(\'' + c.id + '\',\'prixFourniture\',parseFloat(this.value)||0)" style="width:100%;border:1px solid #ddd;border-radius:4px;padding:4px;font-size:12px;text-align:right"></td>';
    html += '<td style="padding:4px;text-align:right;color:#666;font-variant-numeric:tabular-nums">' + total.toFixed(2) + '</td>';
    html += '<td style="padding:4px;text-align:center"><button type="button" onclick="supprimerChant(\'' + c.id + '\')" title="Supprimer" style="background:none;border:none;cursor:pointer;color:#c33;font-size:14px">✕</button></td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  host.innerHTML = html;
}

function majChant(id, champ, valeur) {
  for (var i = 0; i < CATALOG.chants.length; i++) {
    if (CATALOG.chants[i].id === id) {
      CATALOG.chants[i][champ] = valeur;
      sauvegarderChants();
      // Re-render pour mettre à jour le total affiché, et rafraîchir le select
      renderCatalogueChants();
      populateSelectChant();
      return;
    }
  }
}

function ajouterChant() {
  var newId = 'chant_' + Date.now();
  CATALOG.chants.push({
    id: newId,
    nom: 'Nouveau chant',
    prixPlacage: 1.00,
    prixFourniture: 0.30
  });
  sauvegarderChants();
  renderCatalogueChants();
  populateSelectChant();
}

function supprimerChant(id) {
  if (CATALOG.chants.length <= 1) {
    alert('Il doit rester au moins un type de chant.');
    return;
  }
  if (!confirm('Supprimer ce type de chant ?')) return;
  CATALOG.chants = CATALOG.chants.filter(function (c) { return c.id !== id; });
  sauvegarderChants();
  renderCatalogueChants();
  populateSelectChant();
}

function populateSelectChant() {
  var sel = document.getElementById('selChant');
  if (!sel) return;
  var valActuelle = sel.value;
  sel.innerHTML = '';
  for (var i = 0; i < CATALOG.chants.length; i++) {
    var c = CATALOG.chants[i];
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nom;
    sel.appendChild(opt);
  }
  // Restaurer la sélection si possible
  if (valActuelle && CATALOG.chants.some(function (c) { return c.id === valActuelle; })) {
    sel.value = valActuelle;
  }
}

function getChantSelectionne() {
  var sel = document.getElementById('selChant');
  if (!sel || !sel.value) return CATALOG.chants[0] || null;
  for (var i = 0; i < CATALOG.chants.length; i++) {
    if (CATALOG.chants[i].id === sel.value) return CATALOG.chants[i];
  }
  return CATALOG.chants[0] || null;
}

function initChants() {
  chargerChants();
  renderCatalogueChants();
  populateSelectChant();
}
