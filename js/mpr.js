/* ================================================================
   THE WOODER - mpr.js
   ================================================================
   Post-processeur MPR (woodWOP / Homag-Weeke) - format ASCII strict
   pour centres d'usinage point-a-point.

   Module autonome. Les fonctions exposees :
     - postprocMpr(job)        : genere le contenu .mpr pour une piece
     - telechargerZipMpr()     : genere un ZIP de tous les .mpr
     - _mprAscii(s), _mprFmt(v): utilitaires internes

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonction externe :
     buildJobs()  - construit la liste des pieces avec leurs operations
                    a partir de window._cutlistPieces, _percDets, etc.

   Librairie externe :
     JSZip        - chargee via CDN dans calcul.html

   ----------------------------------------------------------------
   CE FICHIER DOIT ETRE CHARGE APRES calcul.html
   car postprocMpr / telechargerZipMpr ne sont appeles qu'a la
   demande (clic sur un bouton ou export ZIP global).
   ================================================================ */

// ═════════════════════════════════════════════════════════════════
// POST-PROCESSEUR MPR (woodWOP / Homag-Weeke) — v2 conforme spec
// ═════════════════════════════════════════════════════════════════
// Format MPR "ancien" (woodWOP 6/7/8) — ASCII strict, structure à blocs.
//
// Structure d'un fichier MPR :
//   [H                          ← en-tête (sans crochet fermant !)
//   VERSION="4.0"
//   MAT="STANDARD"
//   [001                        ← section pièce
//   L="800"                     ← longueur (Länge, variable)
//   B="400"                     ← largeur  (Breite, variable)
//   D="19"                      ← épaisseur (Dicke, variable)
//   <100 \WerkStck\             ← déclaration de la pièce
//   LA="L" BR="B" DI="D"        ← référence aux variables L/B/D
//   <101 \Bohrung\              ← perçage vertical
//   XA="50" YA="50" TI="12.5" DU="8"
//   <102 \Nut\                  ← rainure
//   XA="20" YA="200" XE="780" YE="200" TI="8" DU="4"
//   <103 \HorBohrung\           ← perçage horizontal (chant)
//   XA="100" YA="0" TI="25" DU="8" RI="Y+"
//
// Règles critiques :
//   - ASCII strict : pas d'accents, pas de caractères spéciaux
//   - Valeurs entre guillemets doubles
//   - Origine bas-gauche vue de dessus, Y vers le haut
//   - Perçage horizontal : spécifier direction via RI (X+, X-, Y+, Y-)
//   - Macro numbers sémantiques : 100=WerkStck, 101=Bohrung, 102=Nut,
//     103=HorBohrung, 105=Konturfraesen, 107=Tasche
// ═════════════════════════════════════════════════════════════════

// Transliterate accents → ASCII (strict MPR requirement)
function _mprAscii(s) {
  if (!s) return '';
  return String(s)
    .replace(/[éèêë]/g, 'e').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[àâä]/g, 'a').replace(/[ÀÂÄ]/g, 'A')
    .replace(/[îï]/g, 'i').replace(/[ÎÏ]/g, 'I')
    .replace(/[ôö]/g, 'o').replace(/[ÔÖ]/g, 'O')
    .replace(/[ûü]/g, 'u').replace(/[ÛÜ]/g, 'U')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/[Øø]/g, 'dia')
    .replace(/×/g, 'x').replace(/°/g, 'deg')
    .replace(/[²³]/g, '').replace(/[–—]/g, '-')
    .replace(/['']/g, "'").replace(/[""]/g, '"')
    .replace(/[^\x00-\x7F]/g, '?');   // toute autre non-ASCII → '?'
}

function _mprFmt(v) { return Number(v).toFixed(2); }

function postprocMpr(job) {
  var out = [];
  var L = function(s) { out.push(s); };

  // ── EN-TÊTE (attention : [H SANS crochet fermant) ────────────
  L('[H');
  L('VERSION="4.0"');
  L('MAT="' + _mprAscii(job.materiau || 'STANDARD').replace(/"/g, '') + '"');
  L('ML=""');
  L('BS=""');
  L('BM="0"');
  L('LA="' + _mprFmt(job.LY) + '"');  // longueur pièce
  L('BR="' + _mprFmt(job.LX) + '"');  // largeur pièce (= profondeur meuble)
  L('DI="' + _mprFmt(job.epaisseur) + '"');
  L('FNX="0"');
  L('FNY="0"');
  L('FNZ="0"');
  L('AX="0"');
  L('AY="0"');
  L('AZ="0"');
  L('OX="1"');
  L('OY="1"');
  L('OZ="1"');
  L('R="0"');
  L('CX="L/2"');    // centre pièce en X
  L('CY="B/2"');    // centre pièce en Y
  L('R1="L"');
  L('R2="B"');
  L('WP="' + _mprAscii(job.piece_id) + '"');
  L('CMT="' + _mprAscii(job.designation).replace(/"/g, '') + '"');

  // ── SECTION PIÈCE [001] ──────────────────────────────────────
  L('');
  L('[001');
  L('L="' + _mprFmt(job.LY) + '"');
  L('B="' + _mprFmt(job.LX) + '"');
  L('D="' + _mprFmt(job.epaisseur) + '"');

  // Déclaration de la pièce de travail (obligatoire)
  L('<100 \\WerkStck\\');
  L('LA="L"');
  L('BR="B"');
  L('DI="D"');
  L('FNX="0"');
  L('FNY="0"');
  L('AX="0"');
  L('AY="0"');
  L('AZ="0"');
  L('CMT=""');

  // Warnings en commentaires ASCII
  (job.warnings || []).forEach(function(w) {
    L('(* WARN: ' + _mprAscii(w).replace(/\*\)/g, '').substring(0, 200) + ' *)');
  });

  // ── OPÉRATIONS ──────────────────────────────────────────────
  // Convention d'axes : dans MPR, XA/YA sont en coords pièce (L=longueur en X,
  // B=largeur en Y). Notre job : X=largeur/profondeur, Y=longueur.
  // Donc MPR.XA = job.Y (longueur), MPR.YA = job.X (profondeur).

  for (var i = 0; i < job.operations.length; i++) {
    var op = job.operations[i];
    if (op.type === 'contour') continue;  // MPR ne fait pas de contour

    if (op.type === 'drill') {
      // Skip trous sur chant (macro différente, rare sur 3 axes)
      if (op.edge) {
        L('(* trou sur chant ignore : ' + _mprAscii(op.subtype || '') + ' dia ' + op.diameter + ' *)');
        continue;
      }
      L('<101 \\Bohrung\\');
      L('XA="' + _mprFmt(op.y) + '"');        // X MPR = Y job (longueur)
      L('YA="' + _mprFmt(op.x) + '"');        // Y MPR = X job (profondeur)
      L('TI="' + _mprFmt(op.depth) + '"');
      L('DU="' + _mprFmt(op.diameter) + '"');
      L('BM="1"');                             // 1 trou unique
      L('BX="0"');
      L('BY="0"');
      L('AN="2"');                             // axe Z (perçage vertical standard)
      L('WZ="' + (op.diameter <= 5 ? '101' : op.diameter <= 8 ? '102' : '103') + '"');  // num. outil selon Ø
      L('CMT="' + _mprAscii(op.subtype || 'drill') + '"');
      L('');

    } else if (op.type === 'groove') {
      L('<102 \\Nut\\');
      L('XA="' + _mprFmt(op.from.y) + '"');
      L('YA="' + _mprFmt(op.from.x) + '"');
      L('XE="' + _mprFmt(op.to.y) + '"');
      L('YE="' + _mprFmt(op.to.x) + '"');
      L('TI="' + _mprFmt(op.depth) + '"');
      L('DU="' + _mprFmt(op.width) + '"');
      L('WZ="201"');                           // num. outil fraise (à adapter atelier)
      L('EM="MOD0"');
      L('RK="NOWRK"');
      L('F_="STANDARD"');
      L('CMT="' + _mprAscii(op.subtype || 'groove') + '"');
      L('');

    } else if (op.type === 'pocket') {
      // Poche rectangulaire : en MPR standard on approxime par une Nut
      // avec un outil dont le Ø = largeur de la poche. Si la poche est plus
      // large que ce que peut couvrir un passage d'outil, un warning est ajouté.
      var D = op.width;
      var axisLongMPR = (op.orientation === 'y') ? 'x' : 'y'; // axe machine
      var longLen = op.length;

      // Convertir le centre+longueur vers from/to (en coords pièce puis MPR)
      var fromX_job, fromY_job, toX_job, toY_job;
      if (op.orientation === 'y') {
        fromX_job = op.cx; fromY_job = op.cy - longLen/2 + D/2;
        toX_job   = op.cx; toY_job   = op.cy + longLen/2 - D/2;
      } else {
        fromX_job = op.cx - longLen/2 + D/2; fromY_job = op.cy;
        toX_job   = op.cx + longLen/2 - D/2; toY_job   = op.cy;
      }

      L('<102 \\Nut\\');
      L('XA="' + _mprFmt(fromY_job) + '"');   // X MPR = Y job
      L('YA="' + _mprFmt(fromX_job) + '"');   // Y MPR = X job
      L('XE="' + _mprFmt(toY_job) + '"');
      L('YE="' + _mprFmt(toX_job) + '"');
      L('TI="' + _mprFmt(op.depth) + '"');
      L('DU="' + _mprFmt(D) + '"');
      L('WZ="' + (D <= 7 ? '201' : D <= 8 ? '202' : '203') + '"');
      L('EM="MOD0"');
      L('RK="NOWRK"');
      L('F_="STANDARD"');
      L('CMT="' + _mprAscii((op.subtype || 'pocket') + ' approx Nut Ø' + D) + '"');
      L('');

      // Si la poche est plus large que l'outil, un 2e passage serait nécessaire
      // (non géré ici — l'opérateur woodWOP doit ajouter la passe ou utiliser Tasche)
      if (op.width < Math.max(op.length, op.width) * 0.9 && op.width > D * 1.2) {
        L('(* poche ' + op.length + 'x' + op.width + ' approximee par une seule Nut dia ' + D + ' - ajuster dans woodWOP si besoin *)');
        L('');
      }
    }
  }

  return out.join('\r\n') + '\r\n';
}

// ═════════════════════════════════════════════════════════════════
// ZIP MPR (un fichier .mpr par pièce, ASCII)
// ═════════════════════════════════════════════════════════════════

function telechargerZipMpr() {
  if (typeof JSZip === 'undefined') { alert('JSZip non charge.'); return; }
  var jobs = buildJobs();
  if (jobs.length === 0) { alert('Aucune piece - lancer d\'abord le calcul du debit.'); return; }
  var zip = new JSZip();

  // README ASCII
  var readme = [
    'THE WOODER - Export MPR (woodWOP / Homag-Weeke)',
    '===============================================',
    '',
    'Format : MPR texte ASCII (woodWOP 6/7/8)',
    'Convention : L=longueur (X), B=largeur (Y), D=epaisseur (Z)',
    'Origine : coin bas-gauche, Y vers le haut, Z vers epaisseur',
    '',
    'IMPORTANT : Ces fichiers sont generes sans reference woodWOP locale.',
    'Verifier OBLIGATOIREMENT dans woodWOP Viewer (gratuit chez Homag)',
    'AVANT chargement sur machine. Les numeros d\'outils (WZ) doivent',
    'etre adaptes a la table d\'outils de votre machine :',
    '  - WZ 101-103 : meches verticales (Bohrung)',
    '  - WZ 201-203 : fraises (Nut, Tasche)',
    '',
    'Limites :',
    '  - Les trous sur chant (Cabineo femelle, tourillons de bout)',
    '    ne sont PAS inclus (macro HorBohrung non generee en v1)',
    '  - Le Clamex P-14 est approxime par une Nut rectiligne',
    '  - Les poches Cabineo sont approximees par une Nut large',
    '  - Le contour peripherique n\'est pas genere (piece deja debitee)',
    '',
    'Liste des fichiers :'
  ];
  jobs.forEach(function(job) {
    if (job.type === 'fond_calc' || job.type === 'fond') return;
    readme.push('  ' + job.piece_id + '.mpr - ' + _mprAscii(job.designation) + ' (' + job.LX + 'x' + job.LY + 'x' + job.epaisseur + 'mm)');
  });
  zip.file('README.txt', readme.join('\r\n'));

  jobs.forEach(function(job) {
    if (job.type === 'fond_calc' || job.type === 'fond') return;
    var mpr = postprocMpr(job);
    var fname = job.piece_id + (job.nombre > 1 ? '_x' + job.nombre : '') + '.mpr';
    zip.file(fname, mpr);
  });

  zip.generateAsync({ type: 'blob' }).then(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'wooder-mpr.zip';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function telechargerMprIndividuel(idx) {
  var jobs = buildJobs();
  var job = jobs[idx];
  if (!job) return;
  var mpr = postprocMpr(job);
  // Blob ASCII explicite (text/plain avec charset=us-ascii)
  var blob = new Blob([mpr], { type: 'text/plain;charset=us-ascii' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = job.piece_id + '.mpr';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
