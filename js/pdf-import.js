/* ================================================================
   THE WOODER - pdf-import.js
   ================================================================
   Import et parsing des PDF de devis pour extraire les pieces.
   Supporte aussi le copier-coller de texte brut (tableur).

   Pipeline :
     Upload PDF -> lirePDF() -> extraction texte via pdf.js
       -> parseTxt() -> detection des lignes de pieces
       -> traiterTexte() -> construit un meuble
       -> ajouterMeuble() -> push dans window._meubles

   Fonctions exposees :
     parseTxt(txt)              - parse texte brut en liste de pieces
     lirePDF(file)              - lit un PDF via pdf.js et traite
     traiterTexte(txt, nom,     - cree un meuble a partir de texte
       imageB64)
     ajouterMeuble(pieces,      - ajoute a la liste
       nom, imageB64)
     supprimerMeuble(idx)       - retire de la liste
     updateMeubleNom(input)     - renomme un meuble
     updateMeubleParam(input)   - met a jour type plinthe/portes
     syncGlobaux()              - synchronise les DOM partages
     afficherListeMeubles()     - regenere la liste UI
     afficherToutesPieces()     - tableau global des pieces
     rendrePercageParMeuble()   - groupe perçages par meuble
     changerType(select)        - change le type d'une piece (UI)
     _mkOpts, _miseAJourCompteur - helpers UI

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html ou autres modules)
   ----------------------------------------------------------------
   Librairie externe :
     pdfjsLib                   - chargee via CDN dans calcul.html
                                   (worker configure via initPdfWorker
                                    qui reste dans calcul.html)

   Fonctions externes :
     Depuis calcul.html :
       setPdfStatus, showMsg, esc, nrm, detectType, getTD, setHeader,
       ouvrirSection, lancerCalcul

   Constantes :
     IS_IOS  (dans calcul.html)

   Variables globales :
     LECTURES + ECRITURES : window._meubles

   ----------------------------------------------------------------
   Usage : lirePDF() appele depuis le handler change d'un input file,
   ou depuis le handler drop d'une zone drag & drop.
   ================================================================ */

function parseTxt(txt) {
  var lines  = txt.split('\n');
  var pieces = [];
  var colonnesVues = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var low = nrm(line);
    // Ligne d'en-tête → on active la lecture
    if (low.indexOf('designation') > -1 || low.indexOf('longueur') > -1) {
      colonnesVues = true;
      continue;
    }
    // Fallback : si pas d'en-tête après 10 lignes, on tente quand même
    if (!colonnesVues && i > 10) colonnesVues = true;
    if (!colonnesVues) continue;

    var nums = [], nom = '';
    var parts = line.split(/\t|\s{2,}/);
    for (var j = 0; j < parts.length; j++) {
      var p = parts[j].trim();
      if (!p) continue;
      var n = parseFloat(p.replace(',', '.'));
      if (!isNaN(n) && /^[\d.,]+$/.test(p)) {
        nums.push(n);
      } else if (nums.length === 0) {
        nom += (nom ? ' ' : '') + p;
      }
    }
    if (!nom || nums.length < 2 || nums[0] === 0) continue;
    pieces.push({
      designation: nom.trim(),
      longueur:    nums[0],
      largeur:     nums[1],
      epaisseur:   nums[2] || 19,
      nombre:      Math.round(nums[3]) || 1
    });
  }

  // Retry sans gate si rien trouvé (PDF sans en-tête)
  if (!pieces.length) {
    for (var ii = 0; ii < lines.length; ii++) {
      var l2 = lines[ii].trim();
      if (!l2) continue;
      var lw2 = nrm(l2);
      if (lw2.indexOf('designation') > -1 || lw2.indexOf('longueur') > -1) continue;
      var n2 = [], nm = '';
      var pt = l2.split(/\t|\s{2,}/);
      for (var jj = 0; jj < pt.length; jj++) {
        var p2 = pt[jj].trim(); if (!p2) continue;
        var nv = parseFloat(p2.replace(',', '.'));
        if (!isNaN(nv) && /^[\d.,]+$/.test(p2)) n2.push(nv);
        else if (n2.length === 0) nm += (nm ? ' ' : '') + p2;
      }
      if (!nm || n2.length < 2 || n2[0] === 0) continue;
      pieces.push({
        designation: nm.trim(),
        longueur: n2[0], largeur: n2[1],
        epaisseur: n2[2] || 19, nombre: Math.round(n2[3]) || 1
      });
    }
  }
  return pieces;
}

// ── Lecture PDF via pdf.js ───────────────────────────────────────
function lirePDF(file) {
  setPdfStatus('<span class="spinner"></span> Lecture de ' + esc(file.name) + ' (' + Math.round(file.size/1024) + ' Ko)...', 'loading');

  // Vérification que pdfjsLib est bien chargé
  if (typeof pdfjsLib === 'undefined') {
    setPdfStatus('⚠ PDF.js non chargé. Rechargez la page ou utilisez l\'onglet Copier-coller.', 'msg-err');
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () {
    setPdfStatus('⚠ Erreur lecture fichier "' + esc(file.name) + '". Code: ' + (reader.error ? reader.error.name : 'inconnu') + '. Sur iPad, essayez de re-télécharger le PDF.', 'msg-err');
  };
  reader.onabort = function () {
    setPdfStatus('⚠ Lecture de "' + esc(file.name) + '" interrompue.', 'msg-err');
  };
  reader.onload = function (e) {
    try {
      var pdfData = new Uint8Array(e.target.result);
      if (pdfData.length === 0) {
        setPdfStatus('⚠ Fichier vide après lecture. Probable bug iOS — ré-essayez.', 'msg-err');
        return;
      }
      pdfjsLib.getDocument({ data: pdfData }).promise
      .then(function (pdf) {

        // -- Extraire le texte de toutes les pages --
        var pagePromises = [];
        for (var i = 1; i <= pdf.numPages; i++) {
          pagePromises.push(pdf.getPage(i).then(function (page) {
            return page.getTextContent().then(function (tc) {
              var items = tc.items;
              items.sort(function (a, b) {
                var dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
                return dy !== 0 ? dy : a.transform[4] - b.transform[4];
              });
              var lines = [], lastY = null, line = [];
              for (var j = 0; j < items.length; j++) {
                var y = Math.round(items[j].transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 3) {
                  if (line.length) lines.push(line.join('\t'));
                  line = [];
                }
                line.push(items[j].str.trim());
                lastY = y;
              }
              if (line.length) lines.push(line.join('\t'));
              return lines.join('\n');
            });
          }));
        }

        // -- Extraire la page 3 en image si elle existe (vue eclatee + 3D) --
        var imagePromise = Promise.resolve(null);
        if (pdf.numPages >= 3) {
          imagePromise = pdf.getPage(3).then(function (page) {
            var scale  = 2.0; // haute resolution
            var vp     = page.getViewport({ scale: scale });
            var canvas = document.createElement('canvas');
            canvas.width  = vp.width;
            canvas.height = vp.height;
            var ctx = canvas.getContext('2d');
            return page.render({ canvasContext: ctx, viewport: vp }).promise
              .then(function () {
                return canvas.toDataURL('image/jpeg', 0.92);
              });
          }).catch(function () { return null; });
        }

        Promise.all([Promise.all(pagePromises), imagePromise])
          .then(function (results) {
            var pages    = results[0];
            var imageB64 = results[1]; // null si pas de page 3
            setPdfStatus('', '');
            traiterTexte(pages.join('\n'), file.name, imageB64);
          });
      })
      .catch(function (err) {
        var msg = 'Erreur PDF : ' + err.message;
        if (IS_IOS || location.protocol === 'file:') {
          msg += '. Sur iPad/iPhone, certains PDF protégés ou téléchargés depuis un email ne peuvent pas être lus. ';
          msg += 'Solution : ouvrez le PDF, copiez son contenu, puis utilisez l\'onglet "Copier-coller".';
        } else {
          msg += '. Essayez l\'onglet Copier-coller.';
        }
        setPdfStatus(msg, 'msg-err');
      });
    } catch (errSync) {
      setPdfStatus('⚠ Erreur pendant le traitement PDF : ' + errSync.message, 'msg-err');
    }
  };
  try {
    reader.readAsArrayBuffer(file);
  } catch (errRead) {
    setPdfStatus('⚠ Impossible de lire le fichier : ' + errRead.message, 'msg-err');
  }
}

// ── Traitement après lecture ──────────────────────────────────────
function traiterTexte(txt, nomFichier, imageB64) {
  var pieces = parseTxt(txt);
  if (!pieces.length) {
    showMsg('Aucune pièce détectée. Essayez l\'onglet Copier-coller.', 'err');
    return;
  }
  ajouterMeuble(pieces, nomFichier || 'Meuble', imageB64 || null);
  showMsg(pieces.length + ' pièces ajoutées — ' + window._meubles.length + ' meuble(s).' + (imageB64 ? ' Vue 3D detectee \u2713' : ''), 'ok');
}


/* ============================================================
   5. MEUBLES -- Gestion multi-meubles, cartes parametres
   ============================================================ */


/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — meubles.js
   Gestion de la liste des meubles et affichage des pièces détectées.
   Pour modifier les paramètres par meuble ou l'UI des cartes : ici.
═══════════════════════════════════════════════════════════════════ */

// ── Ajouter un meuble ────────────────────────────────────────────
function ajouterMeuble(pieces, nomFichier, imageB64) {
  var nom = nomFichier
    .replace(/\.pdf$/i, '').replace(/[_-]/g, ' ')
    .replace(/the wooder/gi, '').replace(/feuille de debit/gi, '').trim();
  if (!nom) nom = 'Meuble ' + (window._meubles.length + 1);

  // Détection automatique profondeur & épaisseur depuis les latéraux
  var profAuto = 600, epAuto = 19;
  for (var k = 0; k < pieces.length; k++) {
    if (detectType(pieces[k].designation) === 'lateral') {
      profAuto = Math.min(pieces[k].longueur, pieces[k].largeur);
      epAuto   = pieces[k].epaisseur;
      break;
    }
  }

  window._meubles.push({
    nom:        nom,
    pieces:     pieces,
    profondeur: profAuto,
    epaisseur:  epAuto,
    debutPerc:  96,
    margeBas:   100,
    typePortes: 'applique',
    typePlinthe:'encastree',
    image3D:    imageB64 || null  // page 3 du PDF the-wooder.com (vue eclatee + 3D)
  });

  afficherListeMeubles();
  afficherToutesPieces();
  _miseAJourCompteur();
}

// ── Supprimer un meuble ──────────────────────────────────────────
function supprimerMeuble(idx) {
  window._meubles.splice(idx, 1);
  afficherListeMeubles();
  afficherToutesPieces();
  _miseAJourCompteur();
}

// ── Mise à jour directe sans rebuild DOM (évite la perte de focus) ─
function updateMeubleNom(input) {
  var idx = parseInt(input.dataset.idx, 10);
  if (window._meubles[idx]) window._meubles[idx].nom = input.value;
}

function updateMeubleParam(input) {
  var idx = parseInt(input.dataset.idx, 10);
  var key = input.dataset.key;
  if (!window._meubles[idx]) return;
  var val = input.value;
  if (key !== 'typePortes' && key !== 'typePlinthe') val = parseFloat(val) || 0;
  window._meubles[idx][key] = val;
  syncGlobaux();
}

// ── Synchroniser les inputs globaux cachés avec le 1er meuble ────
function syncGlobaux() {
  if (!window._meubles.length) return;
  var m = window._meubles[0];
  document.getElementById('typePortes').value  = m.typePortes  || 'applique';
  document.getElementById('typePlinthe').value = m.typePlinthe || 'encastree';
  document.getElementById('epaisseur').value   = m.epaisseur   || 19;
  document.getElementById('debutPerc').value   = m.debutPerc   || 96;
  document.getElementById('margeBas').value    = m.margeBas    || 100;
  document.getElementById('profondeur').value  = m.profondeur  || 600;
}

// ── Afficher la liste des meubles (cartes paramètres) ────────────
function afficherListeMeubles() {
  var el = document.getElementById('listeMeubles');
  if (!window._meubles.length) { el.innerHTML = ''; return; }

  var html = '';
  for (var i = 0; i < window._meubles.length; i++) {
    var m = window._meubles[i];
    var sP  = _mkOpts(['applique','encastree'], ['Portes en applique','Portes encastrées'], m.typePortes);
    var sPl = _mkOpts(['encastree','applique','aucune'], ['Plinthe encastrée','Plinthe en applique','Sans plinthe'], m.typePlinthe);

    html +=
      '<div class="meuble-card">' +
        '<div class="meuble-card-header">' +
          '<div>' +
            '<div class="meuble-num">Meuble ' + (i + 1) + '</div>' +
            '<input class="meuble-name-input" type="text" value="' + esc(m.nom) + '" data-idx="' + i + '" onchange="updateMeubleNom(this)">' +
          '</div>' +
          '<button onclick="supprimerMeuble(' + i + ')" class="btn btn-danger btn-sm">✕</button>' +
        '</div>' +
        '<div class="meuble-params">' +
          '<div class="meuble-param"><label>Type de portes</label><select data-idx="' + i + '" data-key="typePortes" onchange="updateMeubleParam(this)">' + sP + '</select></div>' +
          '<div class="meuble-param"><label>Type de plinthe</label><select data-idx="' + i + '" data-key="typePlinthe" onchange="updateMeubleParam(this)">' + sPl + '</select></div>' +
          '<div class="meuble-param"><label>Profondeur (mm)</label><input type="number" value="' + m.profondeur + '" min="100" data-idx="' + i + '" data-key="profondeur" onchange="updateMeubleParam(this)"></div>' +
          '<div class="meuble-param"><label>Épaisseur (mm)</label><input type="number" value="' + m.epaisseur + '" min="10" data-idx="' + i + '" data-key="epaisseur" onchange="updateMeubleParam(this)"></div>' +
        '</div>' +
        '<div class="meuble-info">' + m.pieces.length + ' pièces détectées</div>' +
      '</div>';
  }
  el.innerHTML = html;
  syncGlobaux();
  rendrePercageParMeuble();
}

// Rendu du bloc "Perçage système 32 par meuble" dans Paramétrage Fabrication
function rendrePercageParMeuble() {
  var zone = document.getElementById('zonePercageParMeuble');
  if (!zone) return;
  if (!window._meubles || window._meubles.length === 0) {
    zone.innerHTML = '<p class="note">Importer un PDF pour voir les meubles.</p>';
    return;
  }
  var h = '';
  for (var i = 0; i < window._meubles.length; i++) {
    var m = window._meubles[i];
    h += '<div style="border:1px solid #e5dfd3;border-radius:3px;padding:10px;margin-bottom:8px">' +
      '<div style="font-size:11px;color:var(--gold);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Meuble ' + (i+1) + ' — ' + esc(m.nom) + '</div>' +
      '<div class="grid2">' +
      '<div class="field"><label>1er perçage depuis le haut (mm)</label><input type="number" value="' + m.debutPerc + '" min="0" data-idx="' + i + '" data-key="debutPerc" onchange="updateMeubleParam(this)"></div>' +
      '<div class="field"><label>Marge bas (mm)</label><input type="number" value="' + m.margeBas + '" min="0" data-idx="' + i + '" data-key="margeBas" onchange="updateMeubleParam(this)"></div>' +
      '</div></div>';
  }
  zone.innerHTML = h;
}

// ── Afficher le tableau de toutes les pièces ──────────────────────
function afficherToutesPieces() {
  var container = document.getElementById('tbodyPiecesMulti');
  if (!window._meubles.length) {
    document.getElementById('secPieces').classList.add('hidden');
    return;
  }

  var total = 0, html = '';
  for (var mi = 0; mi < window._meubles.length; mi++) {
    var m = window._meubles[mi];
    total += m.pieces.length;

    if (window._meubles.length > 1) {
      html += '<div class="sep-meuble">Meuble ' + (mi + 1) + ' — ' + esc(m.nom) + '</div>';
    }

    html += '<div class="scroll"><table style="margin-bottom:0">' +
      '<thead><tr><th>Désignation</th><th>Long.</th><th>Larg.</th><th>Ép.</th><th>Nb</th><th>Type</th><th>Perç.</th></tr></thead><tbody>';

    for (var pi = 0; pi < m.pieces.length; pi++) {
      var p    = m.pieces[pi];
      var type = p._typeForce || detectType(p.designation);

      var sel = '<select data-mi="' + mi + '" data-pi="' + pi + '" onchange="changerType(this)">';
      for (var ti = 0; ti < TYPES_DEF.length; ti++) {
        sel += '<option value="' + TYPES_DEF[ti].val + '"' + (TYPES_DEF[ti].val === type ? ' selected' : '') + '>' + TYPES_DEF[ti].lab + '</option>';
      }
      sel += '</select>';

      html += '<tr>' +
        '<td style="font-size:11px">' + esc(p.designation) + '</td>' +
        '<td>' + p.longueur + '</td><td>' + p.largeur + '</td>' +
        '<td>' + p.epaisseur + '</td><td>' + p.nombre + '</td>' +
        '<td>' + sel + '</td>' +
        '<td style="font-size:10px;color:#888">' + (getTD(type).perc ? 'Oui' : '—') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
  }

  container.innerHTML = html;
  document.getElementById('nbPieces').textContent =
    total + ' pièce' + (total > 1 ? 's' : '') +
    (window._meubles.length > 1 ? ' — ' + window._meubles.length + ' meubles' : '');
  ouvrirSection('secPieces');

  // Auto-déclenchement du calcul : l'utilisateur n'a plus à cliquer "Calculer tout"
  // → la section "Ordre des colonnes" apparaîtra automatiquement
  if (typeof lancerCalcul === 'function' && total > 0) {
    setTimeout(function() { try { lancerCalcul(); } catch(e) { console.error('lancerCalcul auto err:', e); } }, 100);
  }
}

// ── Changer le type d'une pièce manuellement ─────────────────────
function changerType(sel) {
  var mi = parseInt(sel.dataset.mi, 10);
  var pi = parseInt(sel.dataset.pi, 10);
  if (window._meubles[mi] && window._meubles[mi].pieces[pi]) {
    window._meubles[mi].pieces[pi]._typeForce = sel.value;
  }
}

// ── Helpers privés ────────────────────────────────────────────────
function _mkOpts(vals, labs, selected) {
  return vals.map(function (v, i) {
    return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + labs[i] + '</option>';
  }).join('');
}

function _miseAJourCompteur() {
  var nb = window._meubles.length;
  document.getElementById('badgeImport').textContent = nb + ' meuble' + (nb > 1 ? 's' : '');
  setHeader(nb ? nb + ' meuble' + (nb > 1 ? 's' : '') : '');
}
