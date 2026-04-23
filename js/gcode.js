/* ================================================================
   THE WOODER - gcode.js
   ================================================================
   Post-processeur G-code GRBL pour centres d'usinage CNC 3 axes.
   Module autonome.

   Pipeline :
     calcul.html remplit les globales window._cutlistPieces,
     _percDets, _piecesRain, _liaisons, _charnDets,
     _tourillonsAdjacents
     -> buildJobs()            : construit la liste des operations
     -> postprocGrbl(job)       : genere le G-code pour une piece
     -> telechargerZipGcode()  : ZIP complet de tous les .gcode

   Convention repere (identique DXF) :
     - Origine  : coin bas-gauche de la piece vue de face
     - X        : petite dimension (profondeur meuble)
     - Y        : grande dimension (longueur piece)
     - Z=0      : surface piece, Z negatif = dans la piece

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonction externe :
     posCabineoX(profondeur, nbCab)

   Constantes globales :
     DIAM, DIAM_TOU, PROF_TOU, BORD
     RAIN_LARGEUR, RAIN_DIST_BORD,
       RAIN_PROF_LATERAL, RAIN_PROF_MONTANT
     TYPE_CONNECTEUR
     CLAMEX_AVANT, CLAMEX_LONG, CLAMEX_LARG, CLAMEX_PROF,
       CLAMEX_ACCES, CLAMEX_ACCES_OFF
     CAB_DIAM_FORAGE, CAB_NB_BOUT
     (et toutes les autres constantes d'usinage definies dans calcul.html)

   Variables window._* remplies par les fonctions de calcul :
     window._cutlistPieces, window._percDets, window._piecesRain,
     window._liaisons, window._charnDets, window._tourillonsAdjacents

   Librairie externe :
     JSZip (chargee via CDN dans calcul.html)

   ----------------------------------------------------------------
   Pour ajouter un autre post-processeur (ex : LinuxCNC) :
   dupliquer postprocGrbl() et brancher dans telechargerZipGcode().
   ================================================================ */

'use strict';

/* ============================================================
   9. GCODE -- Generation G-code CNC (post-processeur GRBL)
   ============================================================ */

/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — gcode.js
   Génération G-code pour CNC bois 3 axes.

   Pipeline :
     _cutlistPieces + _percDets + _piecesRain + _liaisons
     + _charnDets + _tourillonsAdjacents + _fonds
        → buildJobs()      → jobs[] (format intermédiaire)
        → postprocGrbl()   → string G-code (par job)
        → telechargerZipGcode() → ZIP de tous les fichiers

   Convention repère (comme DXF) :
     - Origine  : coin bas-gauche de la pièce vue de face
     - X        : le long de la petite dimension (= profondeur meuble)
     - Y        : le long de la grande dimension (= longueur pièce)
     - Z        : 0 = surface pièce, Z négatif = dans la pièce

   Post-processeur actuel : GRBL (g-code standard ISO).
   Pour ajouter un autre post-proc : dupliquer postprocGrbl()
   et branchement dans telechargerZipGcode().
═══════════════════════════════════════════════════════════════════ */

// ═════════════════════════════════════════════════════════════════
// TABLE D'OUTILS PAR DÉFAUT (défonceuse 3 axes bois, vitesses conservatrices)
// ═════════════════════════════════════════════════════════════════
// diameter  : Ø outil (mm)
// spindle   : broche (tr/min)
// feed      : avance usinage XY (mm/min)
// plunge    : avance plongée Z (mm/min)
// stepdown  : profondeur max par passe (mm, pour fraises)
// peck      : incrément peck drilling (0 = plongée directe)

var GCODE_TOOLS = {
  D5:  { n: 1, type: 'drill',    diameter: 5,   spindle: 15000, feed: 800,  plunge: 300, peck: 3,  name: 'Mèche Ø5 bois (système 32)' },
  D6:  { n: 2, type: 'drill',    diameter: 6,   spindle: 15000, feed: 800,  plunge: 300, peck: 3,  name: 'Mèche Ø6 tourillon' },
  D8:  { n: 3, type: 'drill',    diameter: 8,   spindle: 15000, feed: 600,  plunge: 300, peck: 4,  name: 'Mèche Ø8 tourillon' },
  D15: { n: 4, type: 'drill',    diameter: 15,  spindle: 12000, feed: 400,  plunge: 200, peck: 4,  name: 'Mèche Ø15 excentrique' },
  D35: { n: 5, type: 'drill',    diameter: 35,  spindle: 8000,  feed: 300,  plunge: 150, peck: 3,  name: 'Forstner Ø35 charnière' },
  F6:  { n: 6, type: 'end_mill', diameter: 6,   spindle: 18000, feed: 2500, plunge: 600, stepdown: 4, name: 'Fraise Ø6 carbure' },
  F7:  { n: 7, type: 'end_mill', diameter: 7,   spindle: 18000, feed: 2200, plunge: 500, stepdown: 4, name: 'Fraise Ø7 (approx. Clamex)' },
  F8:  { n: 8, type: 'end_mill', diameter: 8,   spindle: 18000, feed: 2800, plunge: 600, stepdown: 4, name: 'Fraise Ø8 carbure (rainures)' },
  F12: { n: 9, type: 'end_mill', diameter: 12,  spindle: 16000, feed: 3000, plunge: 700, stepdown: 5, name: 'Fraise Ø12 carbure (Cabineo)' }
};

// Paramètres généraux G-code
var GCODE_PARAMS = {
  safe_z:        5,     // Z de sécurité entre déplacements (mm)
  clearance_z:   50,    // Z de dégagement pour tool change (mm)
  martyr:        1,     // dépassement Z pour découpe traversante (mm)
  stepover:      0.5,   // fraction du Ø outil pour raster pocket (0.4-0.6)
  ramp_len_mm:   20,    // longueur rampe plongée contour (mm)
  decimals:      3      // précision décimale G-code
};

// ═════════════════════════════════════════════════════════════════
// UTILITAIRES
// ═════════════════════════════════════════════════════════════════

function _gcFmt(v) {
  if (v == null || isNaN(v)) return '0';
  return Number(v).toFixed(GCODE_PARAMS.decimals);
}

function _gcSafeName(s) {
  return (s || 'piece').toLowerCase()
    .replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/[îï]/g,'i')
    .replace(/[ôö]/g,'o').replace(/[ûü]/g,'u').replace(/ç/g,'c')
    .replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').substring(0, 40);
}

function _gcPadId(n) { return ('000' + n).slice(-3); }

// Sélectionne un outil de la table selon type + diamètre
function _gcPickTool(type, diameter) {
  var keys = Object.keys(GCODE_TOOLS);
  var best = null, bestDiff = 1e9;
  for (var i = 0; i < keys.length; i++) {
    var t = GCODE_TOOLS[keys[i]];
    if (type === 'drill' && t.type !== 'drill') continue;
    if (type === 'mill'  && t.type !== 'end_mill') continue;
    var d = Math.abs(t.diameter - diameter);
    if (d < bestDiff) { bestDiff = d; best = keys[i]; }
  }
  return best;
}

// ═════════════════════════════════════════════════════════════════
// CONSTRUCTION DES JOBS
// ═════════════════════════════════════════════════════════════════

function buildJobs() {
  var pieces     = window._cutlistPieces       || [];
  var percDets   = window._percDets            || [];
  var piecesRain = window._piecesRain          || [];
  var liaisons   = window._liaisons            || [];
  var charnDets  = window._charnDets           || [];
  var tourAdj    = window._tourillonsAdjacents || [];

  // Index par désignation pour lookup O(1)
  var idxPerc = {}, idxRain = {}, idxCharn = {};
  var idxLiais = {}, idxTourAdj = {};
  percDets.forEach(function(d)   { idxPerc[d.p.designation]  = d; });
  piecesRain.forEach(function(d) { idxRain[d.p.designation]  = d; });
  // Une même porte peut avoir plusieurs entrées charnières (cas porte double :
  // série gauche + série droite avec la même designation). On stocke un tableau.
  charnDets.forEach(function(d) {
    (idxCharn[d.p.designation] = idxCharn[d.p.designation] || []).push(d);
  });
  liaisons.forEach(function(l) {
    (idxLiais[l.designation] = idxLiais[l.designation] || []).push(l);
  });
  tourAdj.forEach(function(t) {
    (idxTourAdj[t.p.designation] = idxTourAdj[t.p.designation] || []).push(t);
  });

  var jobs = [];
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    if (p.type === 'autre') continue;

    // Normalisation dimensions : Y = grande dim (longueur pièce), X = petite (= profondeur)
    var LY = Math.max(p.longueur, p.largeur);
    var LX = Math.min(p.longueur, p.largeur);

    var job = {
      piece_id:    'p' + _gcPadId(i+1) + '_' + _gcSafeName(p.designation),
      designation: p.designation,
      type:        p.type,
      LX:          LX,
      LY:          LY,
      epaisseur:   p.epaisseur,
      materiau:    p.materiau,
      nombre:      p.nombre,
      face:        'A',
      warnings:    [],
      operations:  []
    };

    // Les fonds : juste un contour (découpe)
    if (p.type === 'fond_calc' || p.type === 'fond') {
      job.operations.push(_opContour(LX, LY, p.epaisseur));
      jobs.push(job);
      continue;
    }

    // 1. Perçages système 32 (face A)
    _addPercagesOps(job, idxPerc[p.designation]);

    // 2. Rainure fond
    _addRainureOp(job, idxRain[p.designation], p.type);

    // 3. Connecteurs (Clamex / Cabineo / goujons / excentriques)
    _addConnecteursOps(job, idxLiais[p.designation] || []);

    // 4. Perçages tourillons adjacents (petit montant étagère)
    _addTourillonsAdjOps(job, idxTourAdj[p.designation] || []);

    // 5. Charnières Blum (plusieurs entrées possibles pour une porte en paire)
    var charnsForPiece = idxCharn[p.designation] || [];
    charnsForPiece.forEach(function(cd) { _addCharnieresOps(job, cd); });

    // 6. Contournage — TOUJOURS EN DERNIER (sinon la pièce bouge)
    job.operations.push(_opContour(LX, LY, p.epaisseur));

    jobs.push(job);
  }

  return jobs;
}

// ── Perçages système 32 (excentriques Ø5 ou tourillons Ø6) ─────
function _addPercagesOps(job, pd) {
  if (!pd) return;
  var isTour = (pd._montantType === 'etagere'); // petit montant = tourillons Ø6
  var diamUse = isTour ? DIAM_TOU : DIAM;
  var profUse = isTour ? PROF_TOU : (job.epaisseur / 2 + 1); // excentrique : demi-épaisseur + jeu
  var toolRef = _gcPickTool('drill', diamUse);

  // Rangées X : [BORD, LX - BORD] pour rang=2, [BORD] pour rang=1 (petit montant)
  var xRows = isTour ? [job.LX / 2] : [BORD, job.LX - BORD];
  // Pour petit montant : les tourillons sont centrés dans l'épaisseur → X centre
  // Pour latéral/montant plein : 2 rangées aux bords

  for (var r = 0; r < xRows.length; r++) {
    for (var t = 0; t < pd.posY.length; t++) {
      job.operations.push({
        type:        'drill',
        subtype:     isTour ? 'tourillon_systeme32' : 'excentrique_systeme32',
        x:           xRows[r],
        y:           pd.posY[t],
        diameter:    diamUse,
        depth:       profUse,
        through:     false,
        tool_ref:    toolRef
      });
    }
  }

  // Warning face B si perçages sur 2 rangées (pièce doit être retournée)
  if (xRows.length === 2) {
    job.warnings.push('Ce fichier contient la face A. Pour la face B, retourner la pièce et relancer — les perçages sont symétriques.');
  }
}

// ── Rainure fond (le long de Y, à X = profMeuble - distBord) ───
function _addRainureOp(job, pr, type) {
  if (!pr) return;
  if (type !== 'lateral' && type !== 'montant' && type !== 'panneau') return;
  var profMeuble = pr.lPiece;  // = profondeur du meuble (= LX généralement)
  var xRain = profMeuble - RAIN_DIST_BORD - RAIN_LARGEUR / 2;
  var depthRain = (type === 'montant') ? RAIN_PROF_MONTANT : RAIN_PROF_LATERAL;
  var toolRef = _gcPickTool('mill', RAIN_LARGEUR);

  job.operations.push({
    type:     'groove',
    subtype:  'rainure_fond',
    from:     { x: xRain, y: 0 },
    to:       { x: xRain, y: job.LY },
    width:    RAIN_LARGEUR,
    depth:    depthRain,
    tool_ref: toolRef
  });
}

// ── Connecteurs (Clamex / Cabineo / goujons / excentriques) ────
function _addConnecteursOps(job, liais) {
  var tc = TYPE_CONNECTEUR;
  for (var i = 0; i < liais.length; i++) {
    var l = liais[i];

    if (tc === 'clamex_p14' || tc === 'clamex_biscuit' || tc === 'lamello_biscuit') {
      _addClamexOps(job, l);
    } else if (tc === 'cabineo_8' || tc === 'cabineo_12') {
      _addCabineoOps(job, l);
    } else {
      // Excentrique + tourillon classique
      _addExcentriqueOps(job, l);
    }
  }
}

// ── Clamex P-14 : poches rectangulaires + trous d'accès ────────
function _addClamexOps(job, l) {
  var tp = l.type_piece || '';
  var xCl = [CLAMEX_AVANT, l.profondeur - CLAMEX_AVANT]; // positions dans la profondeur
  var toolRef = _gcPickTool('mill', CLAMEX_LARG);

  // Note : la rainure P-System officielle (Zeta P2) a une forme en D impossible
  // à reproduire sur CNC 3 axes. On approxime par une poche rectangulaire.
  // Pour Clamex authentique → utiliser le DXF + Zeta P2 séparément.
  if (!job._clamexWarned) {
    job.warnings.push('Clamex P-14 : poche rectangulaire approximée (la forme en D officielle nécessite une Zeta P2). Utiliser le DXF + Zeta pour un assemblage strict.');
    job._clamexWarned = true;
  }

  if (tp === 'panneau_sup' || tp === 'panneau_inf') {
    // Sur le panneau : la rainure Zeta P-System est SURFACIQUE, partant du
    // chant du panneau vers l'intérieur. Le DXF officiel Lamello centre la
    // rainure à 9.5mm du chant (débordement Zeta accepté). En CNC 3 axes,
    // on cale la poche pour qu'elle reste entièrement dans la pièce :
    // centre à CLAMEX_LONG/2 du chant.
    var dEdge = CLAMEX_LONG / 2 + 1; // +1mm de sécurité
    var yEnds = [dEdge, job.LY - dEdge];
    if (!job._clamexShiftedWarned && (dEdge !== 9.5)) {
      job.warnings.push('Positions Clamex panneau recalées à ' + dEdge + 'mm du chant (vs 9.5mm en DXF Zeta) — sinon la poche sortirait de la pièce.');
      job._clamexShiftedWarned = true;
    }
    for (var a = 0; a < yEnds.length; a++) {
      for (var b = 0; b < xCl.length; b++) {
        job.operations.push({
          type: 'pocket', subtype: 'clamex_p14',
          shape: 'rect',
          cx: xCl[b], cy: yEnds[a],
          length: CLAMEX_LONG, width: CLAMEX_LARG, depth: CLAMEX_PROF,
          orientation: 'y',
          tool_ref: toolRef
        });
        job.operations.push({
          type: 'drill', subtype: 'clamex_access',
          x: xCl[b] + CLAMEX_ACCES_OFF, y: yEnds[a],
          diameter: CLAMEX_ACCES, depth: 3, through: false,
          tool_ref: _gcPickTool('drill', CLAMEX_ACCES)
        });
      }
    }
    // Liaisons panneau ↔ montants intermédiaires
    (l.xMonts || []).forEach(function(xM) {
      xCl.forEach(function(yCl) {
        job.operations.push({
          type: 'pocket', subtype: 'clamex_p14',
          shape: 'rect',
          cx: xM, cy: yCl,
          length: CLAMEX_LARG, width: CLAMEX_LONG, depth: CLAMEX_PROF,
          orientation: 'x',
          tool_ref: toolRef
        });
        job.operations.push({
          type: 'drill', subtype: 'clamex_access',
          x: xM, y: yCl + CLAMEX_ACCES_OFF,
          diameter: CLAMEX_ACCES, depth: 3, through: false,
          tool_ref: _gcPickTool('drill', CLAMEX_ACCES)
        });
      });
    });
  } else {
    // Latéral / Montant : poches aux 2 bouts Y (haut + bas)
    var yLines = [];
    if (l.yDepuisHaut !== undefined) yLines.push(job.LY - l.yDepuisHaut);
    if (l.yDepuisBas  !== undefined) yLines.push(l.yDepuisBas);
    if (yLines.length === 0) yLines.push(job.LY - 9.5);

    yLines.forEach(function(y) {
      xCl.forEach(function(x) {
        job.operations.push({
          type: 'pocket', subtype: 'clamex_p14',
          shape: 'rect',
          cx: x, cy: y,
          length: CLAMEX_LONG, width: CLAMEX_LARG, depth: CLAMEX_PROF,
          orientation: 'x',
          tool_ref: toolRef
        });
        if (tp === 'montant') {
          job.operations.push({
            type: 'drill', subtype: 'clamex_access',
            x: x + CLAMEX_ACCES_OFF, y: y,
            diameter: CLAMEX_ACCES, depth: 3, through: false,
            tool_ref: _gcPickTool('drill', CLAMEX_ACCES)
          });
        }
      });
    });
  }
}

// ── Cabineo : poches sur la face (mâle) + warning trous chant (femelle) ──
function _addCabineoOps(job, l) {
  var tp = l.type_piece || '';
  var isMale = (tp === 'panneau_sup' || tp === 'panneau_inf' || tp === 'montant');
  var toolRef = _gcPickTool('mill', CAB_DIAM_FORAGE);

  if (isMale) {
    var nbCab = (CAB_NB_BOUT === 'auto') ? ((l.profondeur > CAB_SEUIL) ? 3 : 2) : parseInt(CAB_NB_BOUT, 10) || 2;
    var posDepth = posCabineoX(l.profondeur, nbCab);
    var yEnds = [];
    if (l.yDepuisHaut !== undefined) yEnds.push(job.LY - l.yDepuisHaut);
    if (l.yDepuisBas  !== undefined) yEnds.push(l.yDepuisBas);

    yEnds.forEach(function(y) {
      posDepth.forEach(function(x) {
        job.operations.push({
          type: 'pocket', subtype: 'cabineo_pocket',
          shape: 'rect',
          cx: x, cy: y,
          length: CAB_POCHE_L, width: CAB_POCHE_W, depth: CAB_POCHE_D,
          orientation: 'y',
          tool_ref: toolRef
        });
      });
    });
  } else {
    // Femelle : trous Ø5 sur CHANT — impossible en 3 axes
    job.warnings.push('Cabineo femelle : trous Ø' + CAB_HOLE + ' sur chant — à percer séparément (perceuse de chant ou gabarit Lamello).');
  }
}

// ── Excentrique/tourillon classique ─────────────────────────────
function _addExcentriqueOps(job, l) {
  // En 3 axes, les trous de bout (goujons + excentriques) sont sur CHANT
  // → impossible sans 5 axes. On ajoute uniquement un warning.
  if (l.tou || l.exc) {
    if (!job._excWarned) {
      job.warnings.push('Excentriques/goujons : trous sur chant — à percer séparément (boring machine ou perceuse de chant).');
      job._excWarned = true;
    }
  }
}

// ── Tourillons adjacents (petit montant étagère) ────────────────
function _addTourillonsAdjOps(job, adjs) {
  if (!adjs || adjs.length === 0) return;
  // Limitation actuelle : la structure window._tourillonsAdjacents
  // (construite dans calculerPercages) ne contient que la position xTou
  // (= lAdj/2, soit le centre profondeur de la pièce adjacente). Il manque
  // la position Y (= X horizontal du petit montant dans la colonne) pour
  // pouvoir réellement positionner le trou. À traiter dans un chantier dédié
  // qui suit la géométrie des colonnes. En attendant, on alerte visiblement
  // pour que l'artisan perce manuellement plutôt que de découvrir l'oubli
  // au moment du montage.
  if (!job._tourAdjWarned) {
    var nb = adjs.length * 2; // ~2 tourillons par jonction
    job.warnings.push('⚠ Tourillons d\'étagère : ~' + nb + ' trous Ø' + DIAM_TOU +
                      'mm à percer manuellement (liaison avec petit montant étagère). ' +
                      'Non intégrés dans le G-code — position géolocalisée partiellement uniquement. ' +
                      'Utiliser gabarit ou boring machine.');
    job._tourAdjWarned = true;
  }
}

// ── Charnières Blum (poche Ø35 + 2 trous fixation Ø2.5 ou Ø5) ──
function _addCharnieresOps(job, cd) {
  if (!cd || !cd.posY || cd.axisCuvette === undefined) return;
  var axisX = cd.axisCuvette;  // X du centre de la cuvette (généralement 22.5mm du bord)
  cd.posY.forEach(function(y) {
    job.operations.push({
      type: 'drill', subtype: 'charniere_cuvette',
      x: axisX, y: y,
      diameter: 35, depth: 12.5, through: false,
      tool_ref: 'D35'
    });
    // 2 trous fixation à ±16mm perpendiculaire à l'axe de la porte
    [axisX - 16, axisX + 16].forEach(function(xFix) {
      job.operations.push({
        type: 'drill', subtype: 'charniere_fixation',
        x: xFix, y: y,
        diameter: 5, depth: 10, through: false,
        tool_ref: 'D5'
      });
    });
  });
}

// ── Contournage (rectangle de la pièce) ─────────────────────────
function _opContour(LX, LY, epaisseur) {
  var toolRef = 'F6'; // fraise Ø6 par défaut pour la découpe
  return {
    type:     'contour',
    subtype:  'peripherique',
    path:     [[0,0], [LX,0], [LX,LY], [0,LY], [0,0]],
    depth:    epaisseur + GCODE_PARAMS.martyr,
    side:     'outside',  // compensation outil à l'extérieur du tracé
    closed:   true,
    tool_ref: toolRef
  };
}

// ═════════════════════════════════════════════════════════════════
// POST-PROCESSEUR GRBL
// ═════════════════════════════════════════════════════════════════

function postprocGrbl(job) {
  var P = GCODE_PARAMS;
  var out = [];
  var L = function(s) { out.push(s); };

  // ── En-tête ──────────────────────────────────────────────────
  L('(===== THE WOODER — G-code GRBL =====)');
  L('(Pièce      : ' + job.designation + ')');
  L('(ID         : ' + job.piece_id + ')');
  L('(Dimensions : ' + job.LX + ' × ' + job.LY + ' × ' + job.epaisseur + ' mm)');
  L('(Matériau   : ' + job.materiau + ')');
  L('(Face       : ' + job.face + ' — quantité ' + job.nombre + ')');
  L('(Origine    : X=0 Y=0 Z=0 au coin bas-gauche, surface pièce)');
  if (job.warnings && job.warnings.length) {
    L('(');
    job.warnings.forEach(function(w) { L('(  ⚠ ' + w + ')'); });
    L('(');
  }
  L('');
  L('G21 G90 G17 G54       (mm, absolu, plan XY, WCS1)');
  L('G94                    (avance mm/min)');
  L('G0 Z' + _gcFmt(P.clearance_z));
  L('');

  // ── Regrouper ops par outil ──────────────────────────────────
  var groups = _groupByTool(job.operations);

  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var tool = GCODE_TOOLS[g.tool_ref];
    if (!tool) {
      L('(!! Outil inconnu : ' + g.tool_ref + ' — opérations ignorées)');
      continue;
    }

    L('(--- Outil T' + tool.n + ' : ' + tool.name + ' Ø' + tool.diameter + ' ---)');
    L('M5                     (arrêt broche)');
    L('G0 Z' + _gcFmt(P.clearance_z));
    L('M6 T' + tool.n + '              (changement outil : ' + tool.name + ')');
    L('M0                     (pause — attente confirmation opérateur)');
    L('S' + tool.spindle + ' M3            (broche ON ' + tool.spindle + ' tr/min)');
    L('G4 P2                  (attente 2s montée broche)');
    L('');

    for (var oi = 0; oi < g.ops.length; oi++) {
      _renderOp(L, g.ops[oi], tool);
      L('');
    }
  }

  // ── Fin ──────────────────────────────────────────────────────
  L('(--- Fin du programme ---)');
  L('M5                     (broche OFF)');
  L('G0 Z' + _gcFmt(P.clearance_z));
  L('G0 X0 Y0');
  L('M30                    (fin)');

  return out.join('\r\n') + '\r\n';
}

// ── Regroupement par outil (préserve l'ordre : drill → mill → contour) ──
function _groupByTool(ops) {
  // Ordre préféré des subtypes (pour minimiser les changements d'outil)
  var order = [
    'excentrique_systeme32', 'tourillon_systeme32', 'tourillon_adjacent',
    'charniere_cuvette', 'charniere_fixation', 'clamex_access',
    'cabineo_pocket', 'clamex_p14', 'rainure_fond',
    'peripherique'
  ];
  var rank = function(op) {
    var idx = order.indexOf(op.subtype);
    return idx >= 0 ? idx : 50;
  };

  // Tri stable : par outil (pour grouper), puis par subtype rank
  var sorted = ops.slice().sort(function(a, b) {
    if (a.tool_ref === b.tool_ref) return rank(a) - rank(b);
    // mais on ne veut PAS mélanger les contours — ils restent en dernier
    if (a.subtype === 'peripherique') return 1;
    if (b.subtype === 'peripherique') return -1;
    return rank(a) - rank(b);
  });

  // Grouper par tool_ref en préservant l'ordre (mais contour toujours en dernier)
  var groups = [];
  var current = null;
  sorted.forEach(function(op) {
    if (!current || current.tool_ref !== op.tool_ref) {
      current = { tool_ref: op.tool_ref, ops: [] };
      groups.push(current);
    }
    current.ops.push(op);
  });
  return groups;
}

// ── Rendu d'une opération en G-code ─────────────────────────────
function _renderOp(L, op, tool) {
  switch (op.type) {
    case 'drill':   return _renderDrill(L, op, tool);
    case 'groove':  return _renderGroove(L, op, tool);
    case 'pocket':  return _renderPocket(L, op, tool);
    case 'contour': return _renderContour(L, op, tool);
    default: L('(!! op inconnue : ' + op.type + ')');
  }
}

// ── DRILL : plongée (avec peck si profond) ──────────────────────
function _renderDrill(L, op, tool) {
  var P = GCODE_PARAMS;
  var x = _gcFmt(op.x), y = _gcFmt(op.y);
  L('(  drill ' + (op.subtype || '') + ' @ X' + x + ' Y' + y + ' Ø' + op.diameter + ' prof ' + op.depth + ')');
  L('G0 X' + x + ' Y' + y);
  L('G0 Z' + _gcFmt(P.safe_z));

  var totalDepth = op.depth + (op.through ? P.martyr : 0);
  var peck = tool.peck || 0;

  if (peck <= 0 || totalDepth <= peck) {
    // Plongée directe
    L('G1 Z-' + _gcFmt(totalDepth) + ' F' + tool.plunge);
  } else {
    // Peck drilling : plongées successives avec remontée
    var z = 0;
    while (z < totalDepth) {
      var nextZ = Math.min(z + peck, totalDepth);
      L('G1 Z-' + _gcFmt(nextZ) + ' F' + tool.plunge);
      if (nextZ < totalDepth) {
        L('G0 Z' + _gcFmt(P.safe_z) + '    (peck retract)');
        L('G0 Z-' + _gcFmt(nextZ - 0.5));
      }
      z = nextZ;
    }
  }
  L('G0 Z' + _gcFmt(P.safe_z));
}

// ── GROOVE : rainure linéaire, plusieurs passes Z ───────────────
function _renderGroove(L, op, tool) {
  var P = GCODE_PARAMS;
  var x1 = _gcFmt(op.from.x), y1 = _gcFmt(op.from.y);
  var x2 = _gcFmt(op.to.x),   y2 = _gcFmt(op.to.y);
  var sd = tool.stepdown || op.depth;
  var nPasses = Math.ceil(op.depth / sd);
  L('(  groove ' + (op.subtype || '') + ' de (' + x1 + ',' + y1 + ') à (' + x2 + ',' + y2 + ') prof ' + op.depth + ' en ' + nPasses + ' passe(s))');

  L('G0 X' + x1 + ' Y' + y1);
  L('G0 Z' + _gcFmt(P.safe_z));

  var fwd = true;
  for (var i = 1; i <= nPasses; i++) {
    var z = -Math.min(sd * i, op.depth);
    L('G1 Z' + _gcFmt(z) + ' F' + tool.plunge);
    if (fwd) L('G1 X' + x2 + ' Y' + y2 + ' F' + tool.feed);
    else     L('G1 X' + x1 + ' Y' + y1 + ' F' + tool.feed);
    fwd = !fwd;
  }
  L('G0 Z' + _gcFmt(P.safe_z));
}

// ── POCKET : poche rectangulaire (raster parallèle à l'axe long) ──
function _renderPocket(L, op, tool) {
  var P  = GCODE_PARAMS;
  var D  = tool.diameter;
  var r  = D / 2;
  var step = D * P.stepover;
  // axe long = orientation
  var longAxis = op.orientation === 'x' ? 'x' : 'y';
  var longLen  = longAxis === 'x' ? op.length : op.length;
  var shortLen = op.width;
  // Zone utile (après déduction du rayon outil)
  var longEff  = longLen - D;
  var shortEff = shortLen - D;

  L('(  pocket ' + (op.subtype || '') + ' center (' + _gcFmt(op.cx) + ',' + _gcFmt(op.cy) + ') ' + op.length + '×' + op.width + ' prof ' + op.depth + ' axe long=' + longAxis + ')');

  if (longEff < 0 || shortEff < -0.1) {
    L('(!! poche plus petite que l\'outil Ø' + D + ' — ignorée)');
    return;
  }

  // Calcul des lignes raster
  // Si shortEff < step, une seule ligne (slot)
  var lines = [];
  if (shortEff <= 0.1) {
    lines.push(0); // ligne centrale unique
  } else {
    var nLines = Math.max(2, Math.ceil(shortEff / step) + 1);
    var dy = shortEff / (nLines - 1);
    for (var i = 0; i < nLines; i++) lines.push(-shortEff/2 + i * dy);
  }

  var sd = tool.stepdown || op.depth;
  var nPasses = Math.ceil(op.depth / sd);

  for (var pass = 1; pass <= nPasses; pass++) {
    var z = -Math.min(sd * pass, op.depth);
    L('(  passe Z ' + pass + '/' + nPasses + ' @ ' + _gcFmt(z) + ')');

    // Plongée au premier point
    var p0 = _pocketPoint(op, longAxis, -longEff/2, lines[0]);
    L('G0 X' + _gcFmt(p0.x) + ' Y' + _gcFmt(p0.y));
    L('G0 Z' + _gcFmt(P.safe_z));
    L('G1 Z' + _gcFmt(z) + ' F' + tool.plunge);

    var fwd = true;
    for (var li = 0; li < lines.length; li++) {
      var offShort = lines[li];
      var pA = _pocketPoint(op, longAxis, -longEff/2, offShort);
      var pB = _pocketPoint(op, longAxis,  longEff/2, offShort);
      // Déplacement vers la ligne si pas la première
      if (li > 0) {
        var pPrev = fwd ? pA : pB; // on arrive à cette extrémité
        L('G1 X' + _gcFmt(pPrev.x) + ' Y' + _gcFmt(pPrev.y) + ' F' + tool.feed);
      }
      // Parcours de la ligne
      var pEnd = fwd ? pB : pA;
      L('G1 X' + _gcFmt(pEnd.x) + ' Y' + _gcFmt(pEnd.y) + ' F' + tool.feed);
      fwd = !fwd;
    }
    L('G0 Z' + _gcFmt(P.safe_z));
  }
}

function _pocketPoint(op, longAxis, offLong, offShort) {
  if (longAxis === 'x') return { x: op.cx + offLong, y: op.cy + offShort };
  else                   return { x: op.cx + offShort, y: op.cy + offLong };
}

// ── CONTOUR : rectangle périphérique avec offset logiciel ──────
function _renderContour(L, op, tool) {
  var P  = GCODE_PARAMS;
  var r  = tool.diameter / 2;
  // Offset du path vers l'extérieur (ou l'intérieur) selon op.side
  var path = op.path;
  var offsetPath = _offsetRectPath(path, op.side === 'outside' ? r : -r);

  L('(  contour ' + (op.subtype || '') + ' ' + (op.side) + ' compensation Ø' + tool.diameter + ')');

  var sd = tool.stepdown || op.depth;
  var nPasses = Math.ceil(op.depth / sd);

  // Point de départ
  var p0 = offsetPath[0];
  L('G0 X' + _gcFmt(p0[0]) + ' Y' + _gcFmt(p0[1]));
  L('G0 Z' + _gcFmt(P.safe_z));

  for (var pass = 1; pass <= nPasses; pass++) {
    var z = -Math.min(sd * pass, op.depth);
    L('(  passe Z ' + pass + '/' + nPasses + ' @ ' + _gcFmt(z) + ')');

    // Plongée en rampe sur le premier segment
    if (pass === 1 && offsetPath.length > 1) {
      var dx = offsetPath[1][0] - offsetPath[0][0];
      var dy = offsetPath[1][1] - offsetPath[0][1];
      var segLen = Math.sqrt(dx*dx + dy*dy);
      var rampLen = Math.min(P.ramp_len_mm, segLen);
      var fx = dx / segLen, fy = dy / segLen;
      L('G1 X' + _gcFmt(p0[0] + fx * rampLen) + ' Y' + _gcFmt(p0[1] + fy * rampLen) + ' Z' + _gcFmt(z) + ' F' + tool.plunge);
    } else {
      L('G1 Z' + _gcFmt(z) + ' F' + tool.plunge);
    }

    // Parcours du contour
    for (var i = 1; i < offsetPath.length; i++) {
      L('G1 X' + _gcFmt(offsetPath[i][0]) + ' Y' + _gcFmt(offsetPath[i][1]) + ' F' + tool.feed);
    }
  }
  L('G0 Z' + _gcFmt(P.safe_z));
}

// Offset d'un rectangle fermé (simplification : valable pour rectangles seulement)
function _offsetRectPath(path, offset) {
  // path = [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]
  if (path.length !== 5) return path; // fallback non géré
  var xs = path.map(function(p){return p[0];});
  var ys = path.map(function(p){return p[1];});
  var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
  var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
  return [
    [xmin - offset, ymin - offset],
    [xmax + offset, ymin - offset],
    [xmax + offset, ymax + offset],
    [xmin - offset, ymax + offset],
    [xmin - offset, ymin - offset]
  ];
}

// ═════════════════════════════════════════════════════════════════
// EXPORT ZIP
// ═════════════════════════════════════════════════════════════════

function telechargerZipGcode() {
  if (typeof JSZip === 'undefined') {
    alert('JSZip non chargé — impossible de créer le ZIP.');
    return;
  }
  var jobs = buildJobs();
  if (jobs.length === 0) {
    alert('Aucune pièce à usiner. Lancez d\'abord le calcul du débit.');
    return;
  }
  var zip = new JSZip();

  // Fichier README global
  var readme = _buildReadme(jobs);
  zip.file('README.txt', readme);

  // Un fichier .gcode par pièce (avec quantité en nom si > 1)
  jobs.forEach(function(job) {
    var gcode = postprocGrbl(job);
    var fname = job.piece_id + (job.nombre > 1 ? '_x' + job.nombre : '') + '.gcode';
    zip.file(fname, gcode);
  });

  zip.generateAsync({ type: 'blob' }).then(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'wooder-gcode.zip';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function _buildReadme(jobs) {
  var lines = [];
  lines.push('THE WOODER — Export G-code CNC');
  lines.push('================================');
  lines.push('');
  lines.push('Post-processeur : GRBL (g-code ISO standard)');
  lines.push('Date export    : ' + new Date().toISOString());
  lines.push('Nb pièces      : ' + jobs.length);
  lines.push('');
  lines.push('CONVENTIONS :');
  lines.push('  • Unités       : millimètres (G21)');
  lines.push('  • Coordonnées  : absolues (G90) / plan XY (G17) / WCS G54');
  lines.push('  • Origine      : coin bas-gauche de la pièce, surface pièce = Z0');
  lines.push('  • Broche       : sens horaire (M3)');
  lines.push('  • Tool changes : M6 T_ + M0 (pause manuelle)');
  lines.push('');
  lines.push('AVANT DE LANCER :');
  lines.push('  1. Vérifier la table d\'outils (voir en-têtes de chaque fichier)');
  lines.push('  2. Régler la Z0 sur la surface supérieure du martyr sacrificiel');
  lines.push('     pour les découpes traversantes (contour), sinon surface pièce.');
  lines.push('  3. Fixer solidement la pièce (pas de bougé pendant l\'usinage).');
  lines.push('  4. Première pièce : simulation à vide avant usinage réel.');
  lines.push('');
  lines.push('LIMITES CONNUES :');
  lines.push('  • Les trous sur CHANT (tourillons de bout, Cabineo femelle, etc.)');
  lines.push('    ne peuvent pas être usinés en 3 axes. Utiliser perceuse de chant,');
  lines.push('    boring machine, ou gabarit manuel. Voir warnings dans chaque fichier.');
  lines.push('  • Clamex P-14 : la forme en D officielle nécessite une Zeta P2 Lamello.');
  lines.push('    La poche rectangulaire générée ici est une approximation.');
  lines.push('  • Charnières Ø35 : fraise Forstner requise (mèche classique ne suffit pas).');
  lines.push('');
  lines.push('LISTE DES FICHIERS :');
  jobs.forEach(function(job) {
    lines.push('  • ' + job.piece_id + '.gcode — ' + job.designation + ' (' + job.LX + '×' + job.LY + 'mm, ×' + job.nombre + ')');
  });
  lines.push('');
  return lines.join('\r\n');
}
