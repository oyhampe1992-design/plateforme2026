/* ================================================================
   THE WOODER - mapper-photo.js (v3)
   ================================================================
   CHANGELOG v3 :
   - Ajout du support CH_1P et CH_2P
   - Extraction de nbEtageres depuis sous_elements.ETG pour tous types
   ================================================================ */

function cmToMm(v) { return Math.round((v || 0) * 10); }

function optsFromElement(el) {
  var fac = el.facade || {};
  var se  = el.sous_elements || {};
  var ens = el._ensemble || {};
  var particularites = ens.particularites || [];

  var typePortes = (fac.pose === 'encastree') ? 'encastree' : 'applique';

  var typePlinthe;
  if (se.PLI === 'encastree' || se.PLI === 'applique' || se.PLI === 'aucune') {
    typePlinthe = se.PLI;
  } else if (particularites.indexOf('plinthe rapportée') > -1
          || particularites.indexOf('plinthe rapportee') > -1) {
    typePlinthe = 'encastree';
  } else {
    typePlinthe = 'encastree';
  }

  // Nombre d'etageres : l'analyseur nous dit combien.
  // Si ETG non renseigne, on met 1 par defaut (cas caisson simple).
  var nbEtageres = (se.ETG != null) ? se.ETG : (fac.nb_etg != null ? fac.nb_etg : 1);

  return {
    typePortes:  typePortes,
    typePlinthe: typePlinthe,
    nbEtageres:  nbEtageres
  };
}

// ── Router caissons bas ────────────────────────────────────────────
function mapCB(el, L, H, P) {
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PB  = se.PB  || fac.nb_portes  || 0;
  var TIR = se.TIR || fac.nb_tiroirs || 0;
  var fType = fac.type || '';

  if (fType === 'tiroirs' || (TIR > 0 && PB === 0)) {
    return { supported: false, reason: 'CB_' + TIR + 'T : a creer' };
  }
  if (fType === 'mixte' || (PB > 0 && TIR > 0)) {
    return { supported: false, reason: 'CB mixte (PB=' + PB + ' + TIR=' + TIR + ') : a creer' };
  }
  if (PB === 1) {
    return { supported: true, generator: 'generateCB_1P', archetype: 'CB_1P',
             L: L, H: H, P: P, opts: optsFromElement(el) };
  }
  if (PB === 2) {
    return { supported: true, generator: 'generateCB_2P', archetype: 'CB_2P',
             L: L, H: H, P: P, opts: optsFromElement(el) };
  }
  if (PB === 3) return { supported: false, reason: 'CB_3P : a creer' };
  return { supported: false, reason: 'CB avec PB=' + PB + ' : non standard' };
}

// ── Router caissons hauts ──────────────────────────────────────────
function mapCH(el, L, H, P) {
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PB  = se.PB  || fac.nb_portes  || 0;
  var TIR = se.TIR || fac.nb_tiroirs || 0;
  var fType = fac.type || '';

  if (fType === 'tiroirs' || (TIR > 0 && PB === 0)) {
    return { supported: false, reason: 'CH_' + TIR + 'T : a creer' };
  }
  if (PB === 1) {
    return { supported: true, generator: 'generateCH_1P', archetype: 'CH_1P',
             L: L, H: H, P: P, opts: optsFromElement(el) };
  }
  if (PB === 2) {
    return { supported: true, generator: 'generateCH_2P', archetype: 'CH_2P',
             L: L, H: H, P: P, opts: optsFromElement(el) };
  }
  if (PB >= 3) return { supported: false, reason: 'CH_' + PB + 'P : a creer' };
  return { supported: false, reason: 'CH avec PB=' + PB + ' : non standard' };
}

// ── Choix d'archetype ──────────────────────────────────────────────
function choisirArchetype(el) {
  var t   = (el.type || '').toUpperCase();
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PC  = se.PC || 0;
  var MI  = se.MI || 0;
  var fType = fac.type || '';

  if (MI > 0) {
    return { supported: false, reason: 'Montants intermediaires (MI>0) : meuble multi-colonnes, non supporte' };
  }
  if (PC > 0 || fType === 'porte_coulissante') {
    return { supported: false, reason: 'Portes coulissantes : archetype a creer' };
  }
  if (fType === 'vitree') {
    return { supported: false, reason: 'Portes vitrees : archetype a creer' };
  }

  var L = cmToMm(el.largeur);
  var H = cmToMm(el.hauteur);
  var P = cmToMm(el.profondeur);

  if (t === 'CB' || t === 'caisson_bas')  return mapCB(el, L, H, P);
  if (t === 'CH' || t === 'caisson_haut') return mapCH(el, L, H, P);

  if (t === 'NO' || t === 'niche_ouverte') {
    return { supported: false, reason: 'Niche ouverte : archetype NO_base a creer' };
  }
  if (t === 'DC' || t === 'demi_colonne') {
    return { supported: false, reason: 'Demi-colonne : archetype DC a creer' };
  }
  if (t === 'COL' || t === 'colonne') {
    return { supported: false, reason: 'Colonne : archetype COL a creer (necessite composition facade)' };
  }

  return { supported: false, reason: 'Type inconnu : ' + t };
}

// ── API publique ───────────────────────────────────────────────────
function mapperElement(el, ensemble) {
  if (ensemble) el._ensemble = ensemble;
  return choisirArchetype(el);
}

function mapperJSON(photoJson) {
  var ensemble = photoJson.ensemble || {};
  var elements = photoJson.elements || [];
  var out = [];
  for (var i = 0; i < elements.length; i++) {
    out.push(mapperElement(elements[i], ensemble));
  }
  return out;
}

function resumerMappage(plans) {
  var ok = 0, ko = 0, raisons = {};
  for (var i = 0; i < plans.length; i++) {
    if (plans[i].supported) ok++;
    else {
      ko++;
      raisons[plans[i].reason] = (raisons[plans[i].reason] || 0) + 1;
    }
  }
  return { total: plans.length, supportes: ok, nonSupportes: ko, raisons: raisons };
}
