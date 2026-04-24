/* ================================================================
   THE WOODER - mapper-photo.js (v5)
   ================================================================
   CHANGELOG v5 :
   - Lit le champ facade.composition produit par l'IA
   - Route les colonnes mixtes (portes haut + tiroirs bas) vers
     generateCOL_mixte_PT avec ratioZonePorte extrait de la composition
   - Garde refus propre pour les cas non encore supportes
     (portes empilees, MI, tiroirs multi-colonnes)
   ================================================================ */

function cmToMm(v) { return Math.round((v || 0) * 10); }

function optsFromElement(el) {
  var fac = el.facade || {};
  var se  = el.sous_elements || {};
  var ens = el._ensemble || {};

  var typePortes = (fac.pose === 'encastree') ? 'encastree' : 'applique';

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

  var nbEtageres = null;
  if (se.ETG != null && se.ETG > 0)             nbEtageres = se.ETG;
  else if (fac.nb_etg != null && fac.nb_etg > 0) nbEtageres = fac.nb_etg;

  return {
    typePortes:  typePortes,
    typePlinthe: typePlinthe,
    hPlinthe:    hPlinthe,
    nbEtageres:  nbEtageres
  };
}

// ── Analyse de la composition d'une facade ─────────────────────────
// Retourne { structure: 'simple' | 'mixte_PT' | 'empilees' | 'inconnu', ratioP, ... }
function analyserComposition(fac) {
  var compo = fac && fac.composition;
  if (!compo || !Array.isArray(compo) || compo.length === 0) {
    return { structure: 'inconnu' };
  }

  // Une seule ligne : structure simple (toutes portes cote a cote, ou toutes tiroirs, ou ouvert)
  if (compo.length === 1) {
    var l = compo[0];
    var types = (l.elements || []).map(function(e) { return e.type; });
    var uniq = {};
    for (var i = 0; i < types.length; i++) uniq[types[i]] = true;
    var keys = Object.keys(uniq);
    if (keys.length === 1 && keys[0] === 'porte')  return { structure: 'simple_portes',  nbPortes: types.length };
    if (keys.length === 1 && keys[0] === 'tiroir') return { structure: 'simple_tiroirs', nbTiroirs: types.length };
    if (keys.length === 1 && keys[0] === 'ouvert') return { structure: 'simple_ouvert' };
    return { structure: 'simple_mixte_horizontal', types: types };
  }

  // 2 lignes : portes au-dessus tiroirs (PT) ou tiroirs au-dessus portes (TP) ou portes empilees (PP)
  if (compo.length === 2) {
    var ligne1 = compo[0], ligne2 = compo[1];
    var t1 = (ligne1.elements || []).map(function(e) { return e.type; });
    var t2 = (ligne2.elements || []).map(function(e) { return e.type; });
    var seulP1 = t1.every(function(t) { return t === 'porte'; });
    var seulT1 = t1.every(function(t) { return t === 'tiroir'; });
    var seulP2 = t2.every(function(t) { return t === 'porte'; });
    var seulT2 = t2.every(function(t) { return t === 'tiroir'; });

    // Ratio de la zone portes. hauteur_ratio peut etre null.
    var r1 = (ligne1.hauteur_ratio != null) ? ligne1.hauteur_ratio : null;

    // Cas le plus frequent : portes en haut + tiroirs en bas (PT)
    if (seulP1 && seulT2) {
      return {
        structure: 'mixte_PT',
        nbPortes:  t1.length,
        nbTiroirs: t2.length,
        ratioP:    r1  // peut etre null, l'archetype gerera
      };
    }

    // Inverse (rare) : tiroirs en haut + portes en bas
    if (seulT1 && seulP2) {
      return {
        structure: 'mixte_TP',
        nbTiroirs: t1.length,
        nbPortes:  t2.length
      };
    }

    // 2 lignes de portes : portes empilees
    if (seulP1 && seulP2) {
      return { structure: 'portes_empilees', nbPortesHaut: t1.length, nbPortesBas: t2.length };
    }

    return { structure: 'inconnu' };
  }

  // 3+ lignes : cas complexe (tiroirs progressifs, multiple empilements, etc.)
  return { structure: 'complexe', nbLignes: compo.length };
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

  // MI = multi-colonnes, non supporte encore
  if (MI > 0) {
    return { supported: false, reason: 'Colonne avec montant intermediaire : non supporte' };
  }

  // Si on a des tiroirs, on passe par la composition pour decider
  if (TIR > 0) {
    var analyse = analyserComposition(fac);
    if (analyse.structure === 'mixte_PT') {
      var opts = optsFromElement(el);
      opts.nbPortesHaut   = analyse.nbPortes;
      opts.nbTiroirs      = analyse.nbTiroirs;
      opts.ratioZonePorte = analyse.ratioP;  // peut etre null, l'archetype a un defaut 0.7
      return { supported: true, generator: 'generateCOL_mixte_PT', archetype: 'COL_mixte_PT',
               L: L, H: H, P: P, opts: opts };
    }
    if (analyse.structure === 'mixte_TP') {
      return { supported: false, reason: 'COL tiroirs au-dessus portes : non supporte (inverser)' };
    }
    return { supported: false, reason: 'COL avec tiroirs structure ' + analyse.structure + ' : non supporte' };
  }

  // Pas de tiroirs : colonne avec portes uniquement
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
    return { supported: false, reason: 'Niche avec montant intermediaire : non supporte' };
  }

  return { supported: true, generator: 'generateNO_base', archetype: 'NO_base', L: L, H: H, P: P, opts: optsFromElement(el) };
}

// ── Choix d'archetype ──────────────────────────────────────────────
function choisirArchetype(el) {
  var t   = (el.type || '').toUpperCase();
  var se  = el.sous_elements || {};
  var fac = el.facade || {};
  var PC  = se.PC || 0;
  var fType = fac.type || '';

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
