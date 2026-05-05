/* ================================================================
   THE WOODER - mapper-photo.js (v8)
   ================================================================
   CHANGELOG v8 :
   - Lit le champ facade.composition[].sous_colonnes pour les colonnes
     avec MI > 0, et route vers generateCOL_MI
   - Si MI > 0 sans sous_colonnes fournies, on repartit equitablement
     les portes entre les sous-colonnes
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

// ── Groupe les lignes consecutives de meme type ────────────────────
function regrouperZones(compo) {
  if (!Array.isArray(compo) || compo.length === 0) return [];
  var zones = [];
  var courante = null;
  for (var i = 0; i < compo.length; i++) {
    var ligne = compo[i];
    var types = (ligne.elements || []).map(function(e) { return e.type; });
    var uniq = {};
    for (var j = 0; j < types.length; j++) uniq[types[j]] = true;
    var keys = Object.keys(uniq);
    var typeDominant = (keys.length === 1) ? keys[0] : 'mixte';
    var ratio = (ligne.hauteur_ratio != null) ? ligne.hauteur_ratio : null;

    if (courante && courante.typeDominant === typeDominant) {
      if (ratio != null && courante.ratio != null) courante.ratio += ratio;
      else courante.ratio = null;
      courante.nbLignes += 1;
    } else {
      if (courante) zones.push(courante);
      courante = { typeDominant: typeDominant, ratio: ratio, nbLignes: 1 };
    }
  }
  if (courante) zones.push(courante);
  return zones;
}

function analyserComposition(fac, se) {
  var compo = fac && fac.composition;
  if (!compo || !Array.isArray(compo) || compo.length === 0) {
    return { structure: 'inconnu' };
  }
  var zones = regrouperZones(compo);

  if (zones.length === 1) {
    var z = zones[0];
    if (z.typeDominant === 'porte')  return { structure: 'simple_portes' };
    if (z.typeDominant === 'tiroir') return { structure: 'simple_tiroirs' };
    if (z.typeDominant === 'ouvert') return { structure: 'simple_ouvert' };
    return { structure: 'simple_' + z.typeDominant };
  }

  if (zones.length === 2) {
    var z1 = zones[0], z2 = zones[1];
    if (z1.typeDominant === 'porte' && z2.typeDominant === 'tiroir') {
      return {
        structure: 'mixte_PT',
        nbPortes:  (se && se.PB)  || 0,
        nbTiroirs: (se && se.TIR) || 0,
        ratioP:    z1.ratio
      };
    }
    if (z1.typeDominant === 'tiroir' && z2.typeDominant === 'porte') return { structure: 'mixte_TP' };
    if (z1.typeDominant === 'porte'  && z2.typeDominant === 'porte')  return { structure: 'portes_empilees' };
    return { structure: 'inconnu_2zones' };
  }

  return { structure: 'complexe_' + zones.length + 'zones' };
}

// ── Extrait les sous_colonnes depuis la composition pour MI ────────
// Cherche la premiere ligne qui contient un champ sous_colonnes
// et le retourne tel quel (apres normalisation).
function extraireSousColonnes(fac, nbMI, totalPortes) {
  var compo = fac && fac.composition;
  var nbSC  = nbMI + 1;

  if (compo && Array.isArray(compo)) {
    for (var i = 0; i < compo.length; i++) {
      if (compo[i].sous_colonnes && compo[i].sous_colonnes.length === nbSC) {
        return compo[i].sous_colonnes.map(function(sc) {
          var nbP = 0;
          if (sc.elements) {
            for (var j = 0; j < sc.elements.length; j++) {
              if (sc.elements[j].type === 'porte') nbP++;
            }
          }
          return {
            largeur_ratio: (sc.largeur_ratio != null) ? sc.largeur_ratio : (1 / nbSC),
            nbPortes:      nbP
          };
        });
      }
    }
  }

  // Fallback : repartition equitable
  var portesParSC = Math.floor(totalPortes / nbSC);
  var reste = totalPortes - portesParSC * nbSC;
  var out = [];
  for (var k = 0; k < nbSC; k++) {
    out.push({
      largeur_ratio: 1 / nbSC,
      nbPortes:      portesParSC + (k < reste ? 1 : 0)
    });
  }
  return out;
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

  // REGLE METIER : tiroirs + MI impossible, on ignore MI
  if (TIR > 0 && MI > 0) {
    console.log('[mapper] MI ignore car tiroirs presents (regle metier)');
    MI = 0;
  }

  // ── Colonne avec MI et portes uniquement ────────────────────────
  if (MI > 0 && TIR === 0) {
    var opts = optsFromElement(el);
    opts.nbMI       = MI;
    opts.nbPortes   = PB;
    opts.sousColonnes = extraireSousColonnes(fac, MI, PB);
    // Etageres par sous-colonne : si ETG specifie, on le garde ; sinon 3 par defaut
    opts.nbEtageresParSousColonne = opts.nbEtageres || 3;
    return { supported: true, generator: 'generateCOL_MI', archetype: 'COL_MI',
             L: L, H: H, P: P, opts: opts };
  }

  // ── Colonne avec tiroirs : composition mixte ────────────────────
  if (TIR > 0) {
    var analyse = analyserComposition(fac, se);
    if (analyse.structure === 'mixte_PT') {
      var opts2 = optsFromElement(el);
      opts2.nbPortesHaut   = analyse.nbPortes || PB;
      opts2.nbTiroirs      = analyse.nbTiroirs || TIR;
      opts2.ratioZonePorte = analyse.ratioP;
      return { supported: true, generator: 'generateCOL_mixte_PT', archetype: 'COL_mixte_PT',
               L: L, H: H, P: P, opts: opts2 };
    }
    if (analyse.structure === 'mixte_TP') {
      return { supported: false, reason: 'COL tiroirs au-dessus portes : non supporte' };
    }
    return { supported: false, reason: 'COL avec tiroirs structure ' + analyse.structure + ' : non supporte' };
  }

  // ── Colonne simple portes uniquement (pas de MI, pas de tiroirs) ─
  if (PB === 1) return { supported: true, generator: 'generateCOL_1P', archetype: 'COL_1P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB === 2) return { supported: true, generator: 'generateCOL_2P', archetype: 'COL_2P', L: L, H: H, P: P, opts: optsFromElement(el) };
  if (PB >= 3) return { supported: false, reason: 'COL_' + PB + 'P sans MI : a creer' };
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

  if (PC > 0 || fType === 'porte_coulissante') return { supported: false, reason: 'Portes coulissantes : archetype a creer' };
  if (fType === 'vitree') return { supported: false, reason: 'Portes vitrees : archetype a creer' };

  var L = cmToMm(el.largeur);
  var H = cmToMm(el.hauteur);
  var P = cmToMm(el.profondeur);

  if (t === 'CB'  || t === 'caisson_bas')   return mapCB(el, L, H, P);
  if (t === 'CH'  || t === 'caisson_haut')  return mapCH(el, L, H, P);
  if (t === 'COL' || t === 'colonne')       return mapCOL(el, L, H, P);
  if (t === 'NO'  || t === 'niche_ouverte') return mapNO(el, L, H, P);
  if (t === 'DC'  || t === 'demi_colonne') return { supported: false, reason: 'Demi-colonne : archetype DC a creer' };

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
    else { ko++; raisons[plans[i].reason] = (raisons[plans[i].reason] || 0) + 1; }
  }
  return { total: plans.length, supportes: ok, nonSupportes: ko, raisons: raisons };
}
