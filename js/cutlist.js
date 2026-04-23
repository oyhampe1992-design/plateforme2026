/* ================================================================
   THE WOODER - cutlist.js
   ================================================================
   Construction de la feuille de debit et optimisation de coupe 2D
   (algorithme First-Fit Decreasing sur plaques rectangulaires).

   Fonctions exposees :
     calculerCutlist(items)   - construit la liste de pieces a
                                  debiter, fusionne les pieces de
                                  tiroir, detecte les materiaux par
                                  epaisseur
     optimiserCoupe(pieces,   - algo FFD 2D : retourne
       pW, pH, trait)            { nbPanneaux, panneaux[], mlDecoupe,
                                    tauxChute, surfTotale }
     lancerOptimisation()      - orchestre : separe caisson/facades
                                  selon mode, traite 19mm/fond/autres
                                  epaisseurs, appelle afficherOpti
     afficherOpti(...)         - affiche les resultats dans la section
     dessinerOpti(canvasId,    - dessin canvas d'un plan de coupe
       res, pW, pH, label)

   Alimente window._cutlistPieces, window._opti19, window._opti8,
   window._opti19Facades, window._optisExtra, window._profEtag,
   window._profLat.

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     catalogueGet(cat, id)       - lecture catalogue
     esc(s)                      - escape HTML
     ouvrirSection(id)           - ouvre une section repliable
     afficherSectionPrix()       - declenche le calcul du prix
                                    (dans prix.js - appelee en cascade)

   Variables globales lues :
     window._profMeubleRain      - profondeur du meuble
     window._fonds               - fonds calcules
     window._tiroirsCutlistExtra - pieces de tiroir a fusionner

   Variables globales ecrites :
     window._cutlistPieces       - liste complete des pieces
     window._opti19, _opti8      - resultats d'optimisation principaux
     window._opti19Facades       - si mode separe (caisson+facades)
     window._optisExtra          - optimisation autres epaisseurs
                                    (5/15/16mm pour tiroirs)
     window._profEtag            - profondeur des etageres
     window._profLat             - profondeur des lateraux

   Constantes globales :
     FOND_EPAISSEUR, CATALOG
     PANN_W, PANN_H              - dimensions panneau brut 19mm
     PANN_FOND_W, PANN_FOND_H    - dimensions panneau fond
     RAIN_DIST_BORD, RAIN_LARGEUR, TRAIT

   ----------------------------------------------------------------
   Usage : calculerCutlist(items) appele depuis lancerCalcul.
   A la fin, declenche lancerOptimisation() qui declenche
   afficherSectionPrix() en cascade.
   ================================================================ */

function calculerCutlist(items) {
  var profM = window._profMeubleRain || 600;
  var pieces = [], surf = 0;

  // ── Déterminer la profondeur réelle des latéraux ──────────────
  // Règle : montants intermédiaires = même profondeur que les latéraux
  //         étagères = profondeur latéraux - fond - jeu derrière
  var profLat = 0;
  for (var ii = 0; ii < items.length; ii++) {
    if (items[ii].type === 'lateral') {
      profLat = Math.min(items[ii].p.longueur, items[ii].p.largeur);
      break;
    }
  }
  if (!profLat) profLat = profM; // fallback
  // Profondeur d'une étagère ou d'un petit montant : s'arrête au bord AVANT de la rainure
  // = profondeur latérale - distance bord arrière - largeur rainure
  var profEtag = Math.max(10, profLat - RAIN_DIST_BORD - RAIN_LARGEUR);
  window._profEtag = profEtag;
  window._profLat  = profLat;

  for (var i = 0; i < items.length; i++) {
    var p = items[i].p, type = items[i].type;
    // Ignorer les fonds importés du PDF (on utilisera les fonds recalculés en 8mm)
    // et les types inconnus
    if (type === 'fond' || type === 'autre') continue;
    var lon = Math.max(p.longueur, p.largeur);
    var lar = Math.min(p.longueur, p.largeur);
    // Règle profondeurs :
    // montant → même profondeur que le latéral
    // panneau (sup/inf) → profondeur issue du PDF (déjà correcte)
    // étagère → profLat - fond - jeu
    if (type === 'montant') {
      // Montant plein → profondeur latéral | Petit montant étagère → profEtag
      lar = (items[i]._montantType === 'etagere') ? profEtag : profLat;
    } else if (type === 'panneau') lar = profM;
    else if (type === 'etagere') {
      // Détecter quelle dimension est la profondeur (proche de profLat) et laquelle est la largeur colonne
      var diffLon = Math.abs(lon - profLat);
      var diffLar = Math.abs(lar - profLat);
      if (diffLon <= diffLar) {
        lon = profEtag; // lon était la profondeur → remplacer
      } else {
        lar = profEtag; // lar était la profondeur → remplacer
      }
    }
    surf += (lon * lar * p.nombre) / 1e6;
    // Portes et tiroirs : toujours en 19mm pour le cutlist
    var epPiece = (type === 'porte' || type === 'tiroir') ? 19 : p.epaisseur;
    // Nom du matériau selon le mode et le type
    var modeMat = document.getElementById('selModeMat').value;
    var nomMatCaisson = '', nomMatFacades = '';
    var selC = document.getElementById('selMat19');
    if (selC && selC.selectedIndex >= 0) nomMatCaisson = selC.options[selC.selectedIndex].text;
    var selF = document.getElementById('selMatFacades');
    if (selF && selF.selectedIndex >= 0) nomMatFacades = selF.options[selF.selectedIndex].text;
    var selFd = document.getElementById('selMatFond');
    var nomMatFond = '';
    if (selFd && selFd.selectedIndex >= 0) nomMatFond = selFd.options[selFd.selectedIndex].text;
    var isFacade = (type === 'porte' || type === 'tiroir');
    var nomMat;
    if (modeMat === 'separe' && isFacade) {
      nomMat = nomMatFacades + ' ' + epPiece + 'mm';
    } else if (epPiece === 19) {
      nomMat = (modeMat === 'separe' ? nomMatCaisson : nomMatCaisson) + ' ' + epPiece + 'mm';
    } else {
      nomMat = 'Panneau ' + epPiece + 'mm';
    }
    pieces.push({ designation: p.designation, longueur: lon, largeur: lar, epaisseur: epPiece, nombre: p.nombre, materiau: nomMat, type: type, isFacade: isFacade });
  }

  // Ajouter les fonds recalculés (épaisseur paramétrable)
  if (window._fonds) {
    for (var j = 0; j < window._fonds.length; j++) {
      var f = window._fonds[j];
      surf += (f.longueur * f.largeur * f.nombre) / 1e6;
      pieces.push({ designation: f.designation, longueur: f.longueur, largeur: f.largeur, epaisseur: FOND_EPAISSEUR, nombre: f.nombre, materiau: 'Panneau ' + FOND_EPAISSEUR + 'mm (fond)', type: 'fond_calc' });
    }
  }

  // ── Ajouter les pièces de tiroirs (joues, devants, dos, fonds, dos métal) ──
  // Matériau : même essence que le caisson, épaisseur propre à chaque pièce.
  // Si le catalogue ne contient pas le matériau dans l'épaisseur voulue,
  // on flag la pièce avec un nom explicite pour que le devis affiche une alerte.
  var tiroirsExtra = window._tiroirsCutlistExtra || [];
  if (tiroirsExtra.length > 0) {
    var selCaisson = document.getElementById('selMat19');
    var matCaissonBase = null;
    if (selCaisson && selCaisson.selectedIndex >= 0) {
      matCaissonBase = catalogueGet('materiaux', selCaisson.value);
    }
    for (var tp = 0; tp < tiroirsExtra.length; tp++) {
      var te = tiroirsExtra[tp];
      // Chercher dans le catalogue : même nom que le caisson + bonne épaisseur
      var matTiroir = null;
      if (matCaissonBase) {
        for (var mi = 0; mi < CATALOG.materiaux.length; mi++) {
          if (CATALOG.materiaux[mi].nom === matCaissonBase.nom && CATALOG.materiaux[mi].ep === te.ep) {
            matTiroir = CATALOG.materiaux[mi];
            break;
          }
        }
      }
      var nomMateriau = matTiroir
        ? matTiroir.nom + ' ' + te.ep + 'mm'
        : '⚠ Panneau ' + te.ep + 'mm — matériau absent du catalogue pour « ' + (matCaissonBase ? matCaissonBase.nom : 'caisson') + ' »';
      surf += (te.l * te.w * te.nb) / 1e6;
      pieces.push({
        designation: te.nom,
        longueur: te.l,
        largeur: te.w,
        epaisseur: te.ep,
        nombre: te.nb,
        materiau: nomMateriau,
        type: 'tiroir_piece',
        isFacade: false,
        _matId: matTiroir ? matTiroir.id : null
      });
    }
  }

  document.getElementById('cutlistNbPieces').textContent = pieces.length;
  document.getElementById('cutlistSurf').textContent     = surf.toFixed(3) + ' m²';

  var tbody = document.getElementById('tbodyCutlist');
  for (var k = 0; k < pieces.length; k++) {
    var pc = pieces[k], tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px">' + esc(pc.designation) + '</td>' +
      '<td>' + pc.longueur + ' mm</td><td>' + pc.largeur + ' mm</td>' +
      '<td>' + pc.epaisseur + ' mm</td><td>' + pc.nombre + '</td>' +
      '<td style="font-size:11px">' + pc.materiau + '</td>';
    tbody.appendChild(tr);
  }
  window._cutlistPieces = pieces;

  document.getElementById('btnCutlist19').onclick   = function () { exportCSV(pieces.filter(function (p) { return p.epaisseur === 19; }), 'wooder-cutlist-19mm.csv'); };
  document.getElementById('btnCutlist8').onclick    = function () { exportCSV(pieces.filter(function (p) { return p.epaisseur === FOND_EPAISSEUR;  }), 'wooder-cutlist-' + FOND_EPAISSEUR + 'mm.csv');  };
  document.getElementById('btnCutlistTout').onclick = function () { exportCSV(pieces, 'wooder-cutlist-complet.csv'); };

  ouvrirSection('secDebit');
  // Lancer l'optimisation (qui déclenchera ensuite le calcul prix)
  lancerOptimisation();
}

// ── Export CSV (format CutList Plus) ─────────────────────────────
function exportCSV(pieces, filename) {
  var lines = ['"Name","Width","Length","Thickness","Qty","Material","Comment"'];
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i];
    lines.push('"' + p.designation.replace(/"/g, "'") + '",' + p.largeur + ',' + p.longueur + ',' + p.epaisseur + ',' + p.nombre + ',"' + p.materiau.replace(/"/g, "'") + '","Panneau brut 2800x2070mm"');
  }
  telechargerBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

// ── Optimisation de coupe — First Fit Decreasing 2D ──────────────
function optimiserCoupe(pieces, pW, pH, trait) {
  var toPlace = [];
  for (var i = 0; i < pieces.length; i++) {
    for (var n = 0; n < pieces[i].nb; n++) toPlace.push({ l: pieces[i].l, h: pieces[i].h, nom: pieces[i].nom });
  }
  toPlace.sort(function (a, b) { return (b.l * b.h) - (a.l * a.h); });

  var panneaux = [];
  function nouvPan() { return { espaces: [{ x: 0, y: 0, w: pW, h: pH }], pieces: [], ml: 0 }; }

  function placer(pan, piece) {
    var ori = [{ l: piece.l, h: piece.h }, { l: piece.h, h: piece.l }];
    for (var o = 0; o < ori.length; o++) {
      var pl = ori[o].l + trait, ph2 = ori[o].h + trait;
      for (var e = 0; e < pan.espaces.length; e++) {
        var esp = pan.espaces[e];
        if (pl <= esp.w && ph2 <= esp.h) {
          pan.pieces.push({ x: esp.x, y: esp.y, l: ori[o].l, h: ori[o].h, nom: piece.nom });
          pan.ml += (ori[o].l + trait) / 1000 + (ori[o].h + trait) / 1000;
          var nv = [];
          if (esp.w - pl  > 50) nv.push({ x: esp.x + pl, y: esp.y,       w: esp.w - pl,  h: ph2 });
          if (esp.h - ph2 > 50) nv.push({ x: esp.x,       y: esp.y + ph2, w: esp.w,        h: esp.h - ph2 });
          pan.espaces.splice(e, 1);
          nv.forEach(function (e2) { pan.espaces.push(e2); });
          pan.espaces.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
          return true;
        }
      }
    }
    return false;
  }

  for (var p = 0; p < toPlace.length; p++) {
    var ok = false;
    for (var pan = 0; pan < panneaux.length; pan++) { if (placer(panneaux[pan], toPlace[p])) { ok = true; break; } }
    if (!ok) { var np = nouvPan(); placer(np, toPlace[p]); panneaux.push(np); }
  }

  var sP = 0;
  for (var pp = 0; pp < toPlace.length; pp++) sP += toPlace[pp].l * toPlace[pp].h;
  var sT = panneaux.length * pW * pH;
  var ml = 0; for (var mp = 0; mp < panneaux.length; mp++) ml += panneaux[mp].ml;

  return {
    nbPanneaux: panneaux.length,
    mlDecoupe:  Math.round(ml * 10) / 10,
    tauxChute:  sT > 0 ? Math.round((1 - sP / sT) * 100) : 0,
    panneaux:   panneaux
  };
}

function lancerOptimisation() {
  var pieces = window._cutlistPieces || [];
  if (!pieces.length) return;

  var modeMat = document.getElementById('selModeMat').value;
  var p19Caisson = [], p19Facades = [], pFond = [];
  for (var i = 0; i < pieces.length; i++) {
    var it = { l: pieces[i].longueur, h: pieces[i].largeur, nom: pieces[i].designation, nb: pieces[i].nombre };
    if (pieces[i].epaisseur === 19) {
      if (modeMat === 'separe' && pieces[i].isFacade) {
        p19Facades.push(it);
      } else {
        p19Caisson.push(it);
      }
    } else if (pieces[i].epaisseur === FOND_EPAISSEUR) {
      pFond.push(it);
    }
  }

  // Noms matériaux pour l'affichage
  var selC = document.getElementById('selMat19');
  var nomC = (selC && selC.selectedIndex >= 0) ? selC.options[selC.selectedIndex].text : 'Panneau';
  var selF = document.getElementById('selMatFacades');
  var nomF = (selF && selF.selectedIndex >= 0) ? selF.options[selF.selectedIndex].text : 'Façades';

  if (modeMat === 'separe') {
    window._opti19 = p19Caisson.length ? optimiserCoupe(p19Caisson, PANN_W, PANN_H, TRAIT) : null;
    window._opti19Facades = p19Facades.length ? optimiserCoupe(p19Facades, PANN_W, PANN_H, TRAIT) : null;
  } else {
    var p19All = p19Caisson.concat(p19Facades);
    window._opti19 = p19All.length ? optimiserCoupe(p19All, PANN_W, PANN_H, TRAIT) : null;
    window._opti19Facades = null;
  }
  window._opti8 = pFond.length ? optimiserCoupe(pFond, PANN_FOND_W, PANN_FOND_H, TRAIT) : null;

  // ── Optimisation pour les AUTRES épaisseurs (tiroirs : 5, 15, 16mm…) ──
  // Groupe les pièces par épaisseur (hors 19 et FOND_EPAISSEUR déjà traitées).
  // Cherche les dimensions du panneau brut correspondant dans le catalogue
  // (même nom que le caisson + épaisseur cible), sinon fallback sur PANN_W/H.
  window._optisExtra = {};
  var epsAutres = {};
  for (var pi = 0; pi < pieces.length; pi++) {
    var epPiece = pieces[pi].epaisseur;
    if (epPiece === 19 || epPiece === FOND_EPAISSEUR) continue;
    if (!epsAutres[epPiece]) epsAutres[epPiece] = [];
    epsAutres[epPiece].push({
      l: pieces[pi].longueur,
      h: pieces[pi].largeur,
      nom: pieces[pi].designation,
      nb: pieces[pi].nombre
    });
  }
  var selCaissonOpti = document.getElementById('selMat19');
  var matCaissonOpti = (selCaissonOpti && selCaissonOpti.selectedIndex >= 0)
    ? catalogueGet('materiaux', selCaissonOpti.value) : null;
  for (var epKey in epsAutres) {
    if (!epsAutres.hasOwnProperty(epKey)) continue;
    var epNum = parseInt(epKey, 10);
    // Trouver les dimensions du panneau brut pour cette épaisseur
    var pannW = PANN_W, pannH = PANN_H;
    if (matCaissonOpti) {
      for (var mi2 = 0; mi2 < CATALOG.materiaux.length; mi2++) {
        if (CATALOG.materiaux[mi2].nom === matCaissonOpti.nom && CATALOG.materiaux[mi2].ep === epNum) {
          pannW = CATALOG.materiaux[mi2].longueur || PANN_W;
          pannH = CATALOG.materiaux[mi2].largeur  || PANN_H;
          break;
        }
      }
    }
    var resOpti = optimiserCoupe(epsAutres[epKey], pannW, pannH, TRAIT);
    if (resOpti) {
      resOpti.ep = epNum;
      resOpti.surfPanneau = (pannW / 1000) * (pannH / 1000);
      window._optisExtra[epKey] = resOpti;
    }
  }

  afficherOpti(window._opti19, window._opti8, window._opti19Facades, nomC, nomF, modeMat);
  afficherSectionPrix();
}

// ── Affichage résultats optimisation ─────────────────────────────
function afficherOpti(r19, r8, r19Facades, nomC, nomF, modeMat) {
  var el = document.getElementById('optiResultat');
  if (!el) return;

  function bloc(titre, r, bg) {
    if (!r) return '';
    return '<div style="background:' + bg + ';border:1.5px solid #ddd;padding:11px;margin-bottom:7px">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:7px">' + titre + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">' +
      '<div><div style="font-size:17px;color:var(--gold)">' + r.nbPanneaux + '</div><div style="font-size:9px;color:#888;text-transform:uppercase">Panneaux</div></div>' +
      '<div><div style="font-size:17px;color:var(--gold)">' + r.mlDecoupe + ' ml</div><div style="font-size:9px;color:#888;text-transform:uppercase">ML découpe</div></div>' +
      '<div><div style="font-size:17px;color:' + (r.tauxChute > 25 ? 'var(--red)' : 'var(--green)') + '">' + r.tauxChute + '%</div><div style="font-size:9px;color:#888;text-transform:uppercase">Chute</div></div>' +
      '</div></div>';
  }

  var titre19 = modeMat === 'separe' ? 'Panneaux 19mm — ' + (nomC || 'Caisson') : 'Panneaux 19mm';
  var titreFac = 'Panneaux 19mm — ' + (nomF || 'Façades');
  el.innerHTML = bloc(titre19, r19, '#faf8f5') +
    (r19Facades ? bloc(titreFac, r19Facades, '#f5f0ea') : '') +
    bloc('Panneaux ' + FOND_EPAISSEUR + 'mm (fond)', r8, '#f5f8fa');

  var badge = document.getElementById('badgeDebit');
  var totalPann = (r19 ? r19.nbPanneaux : 0) + (r19Facades ? r19Facades.nbPanneaux : 0) + (r8 ? r8.nbPanneaux : 0);
  if (totalPann > 0) badge.textContent = totalPann + ' panneaux';

  // Dessiner les canvas
  if (r19) dessinerOpti('canvasOpti19', r19, PANN_W, PANN_H, titre19);
  var cvFac = document.getElementById('canvasOptiFacades');
  if (r19Facades) {
    if (cvFac) cvFac.style.display = '';
    dessinerOpti('canvasOptiFacades', r19Facades, PANN_W, PANN_H, titreFac);
  } else {
    if (cvFac) { cvFac.style.display = 'none'; cvFac.width = 0; cvFac.height = 0; }
  }
  if (r8) dessinerOpti('canvasOpti8', r8, PANN_FOND_W, PANN_FOND_H, FOND_EPAISSEUR + 'mm');
}

function dessinerOpti(canvasId, res, pW, pH, label) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var scale  = 0.055;
  var nbPan  = Math.min(res.nbPanneaux, 6);
  var pw = Math.round(pW * scale), ph2 = Math.round(pH * scale);
  var gap = 7, cols = Math.min(nbPan, 3), rows = Math.ceil(nbPan / cols);

  canvas.width  = cols * (pw + gap) + gap;
  canvas.height = rows * (ph2 + gap) + gap + 26;
  canvas.style.maxWidth = '100%';

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 10px Georgia,serif';
  ctx.fillText('Panneau ' + label + ' — ' + res.nbPanneaux + ' panneau' + (res.nbPanneaux > 1 ? 'x' : '') + ' — ' + res.tauxChute + '% chute', gap, 13);

  var colors = ['#d4e8d4','#d4d4e8','#e8d4d4','#e8e8d4','#d4e8e8','#e8d4e8','#f0d8c0','#c0d8f0'];
  for (var p = 0; p < nbPan; p++) {
    var col = p % cols, row = Math.floor(p / cols);
    var ox = gap + col * (pw + gap), oy = 20 + gap + row * (ph2 + gap);
    ctx.fillStyle = '#f5f2ee'; ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    ctx.fillRect(ox, oy, pw, ph2); ctx.strokeRect(ox, oy, pw, ph2);
    if (res.panneaux[p]) {
      for (var pi = 0; pi < res.panneaux[p].pieces.length; pi++) {
        var pc = res.panneaux[p].pieces[pi];
        ctx.fillStyle = colors[pi % colors.length]; ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 0.5;
        ctx.fillRect(ox + Math.round(pc.x * scale), oy + Math.round(pc.y * scale), Math.max(1, Math.round(pc.l * scale)), Math.max(1, Math.round(pc.h * scale)));
        ctx.strokeRect(ox + Math.round(pc.x * scale), oy + Math.round(pc.y * scale), Math.max(1, Math.round(pc.l * scale)), Math.max(1, Math.round(pc.h * scale)));
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '8px Georgia,serif';
    ctx.fillText('P' + (p + 1), ox + 3, oy + 9);
  }
  if (res.nbPanneaux > 6) {
    ctx.fillStyle = '#888'; ctx.font = '10px Georgia,serif';
    ctx.fillText('… + ' + (res.nbPanneaux - 6) + ' panneaux', gap, canvas.height - 4);
  }
}
