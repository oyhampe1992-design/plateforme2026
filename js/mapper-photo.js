/* ================================================================
   THE WOODER - mapper-photo.js (v4)
   ================================================================
   CHANGELOG v4 :
   - Ajout support NO (niche ouverte) -> generateNO_base
   - Ajout support COL_1P et COL_2P (colonnes pleine hauteur)
   - Lecture de ensemble.plinthe (venu du formulaire utilisateur)
     et injection dans opts.typePlinthe et opts.hPlinthe
   ================================================================ */

function cmToMm(v) { return Math.round((v || 0) * 10); }

// ── Options deduites du JSON photo ─────────────────────────────────
// opts contient : typePortes, typePlinthe, hPlinthe, nbEtageres
function optsFromElement(el) {
  var fac = el.facade || {};
  var se  = el.sous_elements || {};
  var ens = el._ensemble || {};

  // Type portes (applique par defaut)
  var typePortes = (fac.pose === 'encastree') ? 'encastree' : 'applique';

  // Plinthe : priorite au choix global ensemble.plinthe
  // Sinon retombe sur sous_elements.PLI, sinon encastree par defaut
  var typePlinthe, hPlinthe;
  if (ens.plinthe && ens.plinthe.type) {
    typePlinthe = ens.plinthe.type;
    hPlinthe    = ens.plinthe.hauteur || 100;
  } else if (se.PLI === 'aucune' || se.PLI === 'encastree' || se.PLI === 'applique') {
    typePlinthe = se.PLI;
    hPlinthe    = 100;
  } else {
    typePlinthe = 'encastree';
    hPlinthe    = 100;
  }

  // Nombre d'etageres : 0 sauf si l'IA en a vu (interieur visible)
  // Les archetypes ont leur propre defaut (1 pour CB/CH, 3 pour COL/NO)
  var nbEtageres = null;
  if (se.ETG != null && se.ETG > 0)             nbEtageres = se.ETG;
  else if (fac.nb_etg != null && fac.nb_etg > 0) nbEtageres = fac.nb_etg;

  return {
    typePortes:  typePortes,
    typePlinthe: typePlinthe,
    hPlinthe:    hPlinthe,
    nbEtageres:  nbEtageres  // null => defaut de l'archetype
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
  if (PB === 1) return { supported: true, generator: 'generateCB_1P', archetype: 'CB_1P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB === 2) return { supported: true, generator: 'generateCB_2P', archetype: 'CB_2P', L: L, H: H, P: P, opts: optsFromElement(el) };
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
  if (PB === 1) return { supported: true, generator: 'generateCH_1P', archetype: 'CH_1P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB === 2) return { supported: true, generator: 'generateCH_2P', archetype: 'CH_2P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB >= 3) return { supported: false, reason: 'CH_' + PB + 'P : a creer' };
  return { supported: false, reason: 'CH avec PB=' + PB + ' : non standard' };
}

// ── Router colonnes ────────────────────────────────────────────────
function mapCOL(el, L, H, P) {
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PB  = se.PB  || fac.nb_portes  || 0;
  var TIR = se.TIR || fac.nb_tiroirs || 0;
  var MI  = se.MI  || 0;

  // Cas complexes : renvoie vers "a creer" (necessite composition)
  if (MI > 0) {
    return { supported: false, reason: 'Colonne avec montant intermediaire : necessite composition' };
  }
  if (TIR > 0) {
    return { supported: false, reason: 'Colonne avec tiroirs : necessite composition (portes + tiroirs)' };
  }

  if (PB === 1) return { supported: true, generator: 'generateCOL_1P', archetype: 'COL_1P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB === 2) return { supported: true, generator: 'generateCOL_2P', archetype: 'COL_2P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB >= 3) return { supported: false, reason: 'COL_' + PB + 'P : a creer' };
  return { supported: false, reason: 'COL avec PB=' + PB + ' : non standard' };
}

// ── Router niches ouvertes ─────────────────────────────────────────
function mapNO(el, L, H, P) {
  var se = el.sous_elements || {};
  var MI = se.MI || 0;

  if (MI > 0) {
    return { supported: false, reason: 'Niche avec montant intermediaire : necessite composition' };
  }

  return { supported: true, generator: 'generateNO_base', archetype: 'NO_base', L: L, H: H, P: P, opts: optsFromElement(el) };
}

// ── Choix d'archetype ──────────────────────────────────────────────
function choisirArchetype(el) {
  var t   = (el.type || '').toUpperCase();
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PC  = se.PC || 0;
  var MI  = se.MI || 0;
  var fType = fac.type || '';

  // Refus rapides tous types confondus
  if (PC > 0 || fType === 'porte_coulissante') {
    return { supported: false, reason: 'Portes coulissantes : archetype a creer' };
  }
  if (fType === 'vitree') {
    return { supported: false, reason: 'Portes vitrees : archetype a creer' };
  }

  var L = cmToMm(el.largeur);
  var H = cmToMm(el.hauteur);
  var P = cmToMm(el.profondeur);

  if (t === 'CB'  || t === 'caisson_bas')   return mapCB(el, L, H, P);
  if (t === 'CH'  || t === 'caisson_haut')  return mapCH(el, L, H, P);
  if (t === 'COL' || t === 'colonne')       return mapCOL(el, L, H, P);
  if (t === 'NO'  || t === 'niche_ouverte') return mapNO(el, L, H, P);
  if (t === 'DC'  || t === 'demi_colonne') {
    return { supported: false, reason: 'Demi-colonne : archetype DC a creer' };
  }

  // MI non gere pour CB/CH (multi-colonnes complexe)
  if (MI > 0) {
    return { supported: false, reason: 'Montants intermediaires (MI>0) sur ' + t + ' : multi-colonnes non supporte' };
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
