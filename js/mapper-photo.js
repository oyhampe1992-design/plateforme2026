/* ================================================================
   THE WOODER - mapper-photo.js
   ================================================================
   Pont entre l'outil d'analyse photo (qui produit un JSON
   structure avec type/sous_elements) et generateurs.js
   (qui fournit les archetypes du moteur de calcul).

   Pipeline :
     photo JSON (cm, nomenclature CB/CH/COL/NO/DC)
       -> mapperElement(el)
       -> { generator: 'CB_2P', params: { L, H, P, opts } }
       -> generateCB_2P(L, H, P, opts)
       -> ajouterMeubleGenere(...)
       -> lancerCalcul du moteur de calcul existant

   Usage :
     // pour UN element du photo JSON
     var plan = mapperElement(photoJson.elements[0]);
     if (plan.supported) {
       var meuble = window[plan.generator](plan.L, plan.H, plan.P, plan.opts);
       ajouterMeubleGenere(meuble);
     } else {
       console.warn('Archetype non supporte :', plan.reason);
       // -> Fallback UI : "Ce meuble necessite un menuisier local"
     }

     // ou pour TOUS les elements
     mapperJSON(photoJson).forEach(function(plan) {
       if (plan.supported) {
         ajouterMeubleGenere(window[plan.generator](plan.L, plan.H, plan.P, plan.opts));
       }
     });

   ================================================================ */

// ── Conversion cm -> mm (le JSON photo est en cm, le moteur en mm) ──
function cmToMm(v) { return Math.round((v || 0) * 10); }

// ── Choisit l'archetype a appeler selon type + sous_elements ────────
// Retourne { supported: true, generator: 'CB_2P', ... }
//       ou { supported: false, reason: '...' } si non encore implemente.
function choisirArchetype(el) {
  var t   = (el.type || '').toUpperCase();
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PB  = se.PB  || fac.nb_portes  || 0;
  var TIR = se.TIR || fac.nb_tiroirs || 0;
  var PC  = se.PC  || 0;
  var MI  = se.MI  || 0;
  var fType = fac.type || '';

  // -- Refus rapides : ce qu'on ne sait pas encore faire --
  if (MI > 0) {
    return { supported: false, reason: 'Montants intermediaires (MI>0) : meuble multi-colonnes, non supporte encore' };
  }
  if (PC > 0 || fType === 'porte_coulissante') {
    return { supported: false, reason: 'Portes coulissantes : archetype a creer' };
  }
  if (fType === 'vitree') {
    return { supported: false, reason: 'Portes vitrees : archetype a creer' };
  }

  // -- Niche ouverte --
  if (t === 'NO' || t === 'niche_ouverte') {
    return { supported: false, reason: 'Niche ouverte : archetype NO_base a creer' };
  }

  // -- Demi-colonne --
  if (t === 'DC' || t === 'demi_colonne') {
    return { supported: false, reason: 'Demi-colonne : archetype DC a creer' };
  }

  // -- Colonne pleine --
  if (t === 'COL' || t === 'colonne') {
    // Sans MI, une colonne avec portes battantes = armoire standard
    return { supported: false, reason: 'Colonne : archetype COL_' + PB + 'P a creer' };
  }

  // -- Caisson haut --
  if (t === 'CH' || t === 'caisson_haut') {
    if (fType === 'tiroirs' || (TIR > 0 && PB === 0)) {
      return { supported: false, reason: 'CH_' + TIR + 'T : a creer' };
    }
    if (PB === 1) return { supported: false, reason: 'CH_1P : a creer' };
    if (PB === 2) return { supported: false, reason: 'CH_2P : a creer' };
    return { supported: false, reason: 'CH avec PB=' + PB + ' / TIR=' + TIR + ' : non standard' };
  }

  // -- Caisson bas (seul archetype implemente pour l'instant) --
  if (t === 'CB' || t === 'caisson_bas') {
    if (fType === 'tiroirs' || (TIR > 0 && PB === 0)) {
      return { supported: false, reason: 'CB_' + TIR + 'T : a creer' };
    }
    if (fType === 'mixte' || (PB > 0 && TIR > 0)) {
      return { supported: false, reason: 'CB mixte (PB=' + PB + ' + TIR=' + TIR + ') : a creer' };
    }
    if (PB === 1) return { supported: false, reason: 'CB_1P : a creer' };
    if (PB === 2) {
      return {
        supported:  true,
        generator:  'generateCB_2P',
        archetype:  'CB_2P',
        L:          cmToMm(el.largeur),
        H:          cmToMm(el.hauteur),
        P:          cmToMm(el.profondeur),
        opts:       optsFromElement(el)
      };
    }
    if (PB === 3) return { supported: false, reason: 'CB_3P : a creer' };
    return { supported: false, reason: 'CB avec PB=' + PB + ' : non standard' };
  }

  return { supported: false, reason: 'Type inconnu : ' + t };
}

// ── Options (typePortes, typePlinthe) depuis les champs photo ───────
function optsFromElement(el) {
  var fac = el.facade || {};
  var se  = el.sous_elements || {};
  var ens = el._ensemble || {};          // injecte par mapperJSON ci-dessous
  var particularites = ens.particularites || [];

  // Type portes : lit facade.pose (defaut applique)
  var typePortes = (fac.pose === 'encastree') ? 'encastree' : 'applique';

  // Type plinthe : sous_elements.PLI si present, sinon deduction
  var typePlinthe;
  if (se.PLI === 'encastree' || se.PLI === 'applique' || se.PLI === 'aucune') {
    typePlinthe = se.PLI;
  } else if (particularites.indexOf('plinthe rapportée') > -1) {
    typePlinthe = 'encastree';           // plinthe rapportee = encastree chez Pierre
  } else {
    typePlinthe = 'encastree';           // defaut securitaire
  }

  return {
    typePortes:  typePortes,
    typePlinthe: typePlinthe
  };
}

// ── API publique : un seul element ──────────────────────────────────
function mapperElement(el, ensemble) {
  // Injecte l'ensemble pour que optsFromElement puisse lire particularites
  if (ensemble) el._ensemble = ensemble;
  return choisirArchetype(el);
}

// ── API publique : tout le JSON photo ───────────────────────────────
// Retourne un tableau de plans (avec { supported, reason, ... })
// dans le meme ordre que les elements du JSON.
function mapperJSON(photoJson) {
  var ensemble = photoJson.ensemble || {};
  var elements = photoJson.elements || [];
  var out = [];
  for (var i = 0; i < elements.length; i++) {
    out.push(mapperElement(elements[i], ensemble));
  }
  return out;
}

// ── Helper : compte des elements supportes / non supportes ──────────
function resumerMappage(plans) {
  var ok = 0, ko = 0, raisons = {};
  for (var i = 0; i < plans.length; i++) {
    if (plans[i].supported) {
      ok++;
    } else {
      ko++;
      raisons[plans[i].reason] = (raisons[plans[i].reason] || 0) + 1;
    }
  }
  return { total: plans.length, supportes: ok, nonSupportes: ko, raisons: raisons };
}

// ══════════════════════════════════════════════════════════════════
// USAGE / TEST
// ══════════════════════════════════════════════════════════════════
//
// Exemple de JSON photo (ce que retourne ton outil d'analyse) :
//
//   var photoJson = {
//     ensemble: {
//       nom_client: 'Buffet salon',
//       materiau_apparent: 'chene massif',
//       dimensions_totales: { largeur: 160, hauteur: 90, profondeur: 45 },
//       particularites: ['pieds reglables', 'plinthe rapportée']
//     },
//     elements: [{
//       id: 'CB_01', type: 'CB',
//       largeur: 160, hauteur: 90, profondeur: 45,
//       facade: { type: 'portes_battantes', nb_portes: 2, pose: 'applique' },
//       sous_elements: { PB: 2, TIR: 0, MI: 0, PLI: 'applique' }
//     }]
//   };
//
// Console :
//   var plans = mapperJSON(photoJson);
//   console.log(resumerMappage(plans));
//   // { total: 1, supportes: 1, nonSupportes: 0, raisons: {} }
//
//   plans.forEach(function(p) {
//     if (p.supported) {
//       ajouterMeubleGenere(window[p.generator](p.L, p.H, p.P, p.opts));
//     } else {
//       console.warn(p.reason);
//     }
//   });
//
// RAISONS DE NON-SUPPORT ACTUELLES (= roadmap des archetypes a ecrire) :
//   - CB_1P, CB_3P, CB_3T, CB mixte
//   - CH_1P, CH_2P, CH_xT
//   - COL, NO, DC
//   - MI > 0 (multi-colonnes)
//   - PC > 0 (coulissantes)
//   - vitree
