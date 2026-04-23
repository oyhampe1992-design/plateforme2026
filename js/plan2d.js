/* ================================================================
   THE WOODER - plan2d.js
   ================================================================
   Dessin du plan 2D cote du meuble sur canvas HTML.
   Affiche la vue de face avec cotations, colonnes, portes,
   plinthe, rainures, fonds.

   Module autonome avec export PNG.

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     telechargerBlob(blob, nom)  - declenche le telechargement
     ouvrirSection(id)           - ouvre une section repliable

   Variable globale :
     window._colonnesOrdre       - ordre des colonnes valide par
                                    l'utilisateur dans la section
                                    "Ordre des colonnes"

   Elements DOM :
     #epaisseur, #typePlinthe    - inputs de saisie
     #planCanvas                 - canvas cible du dessin
     #btnExportPlan              - bouton d'export PNG

   ----------------------------------------------------------------
   Usage : dessinerPlan(items) apres un calcul complet
   ================================================================ */

function dessinerPlan(items) {
  var ep0 = parseFloat(document.getElementById('epaisseur').value) || 19;
  var tp  = document.getElementById('typePlinthe').value;

  // ── Collecter les données ──────────────────────────────────────
  var hM = 0, lM = 0, hPl = 0, etag = [], portes = [];
  for (var i = 0; i < items.length; i++) {
    var p    = items[i].p, type = items[i].type;
    var lon  = Math.max(p.longueur, p.largeur);
    var lar  = Math.min(p.longueur, p.largeur);
    if (type === 'lateral')                             hM = lon;
    if (type === 'panneau' && !lM)                     lM = lon;
    if (type === 'plinthe')                            hPl = lar;
    if (type === 'etagere') {
      var deja = false;
      for (var k = 0; k < etag.length; k++) { if (etag[k] === lon) { deja = true; break; } }
      if (!deja) etag.push(lon);
    }
    if (type === 'porte') portes.push({ lon: lon, lar: lar, nb: p.nombre, p: p });
  }
  if (!hM || !lM) return;

  // ── Géométrie ─────────────────────────────────────────────────
  var ep   = ep0;
  var yBas = tp === 'encastree' ? hPl : tp === 'applique' ? hPl - ep : 0;
  var hInt = hM - ep - ep - yBas;
  var largInt = lM - 2 * ep;

  // Détecter nombre de montants pleins
  // Nombre de colonnes : utiliser la même logique que afficherSectionColonnes,
  // càd le classifier _montantType (défini par classifierMontants) plutôt qu'une
  // heuristique de hauteur locale. Sans ça, nbCols peut différer entre plan2d et
  // la section "ordre des colonnes", faisant silencieusement échouer la
  // condition `colOrdre2D.length === nbCols` et ignorer l'ordre validé.
  var nbMP = 0;
  for (var j = 0; j < items.length; j++) {
    if (items[j].type === 'montant' && items[j]._montantType !== 'etagere') {
      nbMP += items[j].p.nombre;
    }
  }
  var nbCols = nbMP + 1;
  var etUs   = etag.slice().sort(function (a, b) { return b - a; });

  // Largeurs colonnes — respecter l'ordre choisi par l'utilisateur si disponible
  var colWidths = [];
  var colOrdre2D = window._colonnesOrdre;
  if (colOrdre2D && colOrdre2D.length === nbCols) {
    // Utiliser l'ordre défini dans la section "Ordre des colonnes"
    for (var co = 0; co < colOrdre2D.length; co++) {
      if (colOrdre2D[co]) {
        colWidths.push(colOrdre2D[co]);
      } else {
        // Colonne vide : calculer la largeur restante
        var sommeCols = (nbCols - 1) * ep; // montants intermédiaires seulement
        for (var co2 = 0; co2 < colOrdre2D.length; co2++) {
          if (colOrdre2D[co2]) sommeCols += colOrdre2D[co2];
        }
        colWidths.push(Math.max(10, largInt - sommeCols));
      }
    }
  } else if (etUs.length > 0) {
    colWidths.push(etUs[0]);
    if (nbCols === 2) {
      colWidths.push(Math.max(10, largInt - etUs[0] - ep));
    } else if (nbCols >= 3) {
      var w1 = etUs[1] || Math.floor((largInt - etUs[0] - ep * 2) / 2);
      colWidths.push(w1);
      colWidths.push(Math.max(10, largInt - etUs[0] - w1 - ep * 2));
    }
  } else {
    colWidths = [largInt];
  }
  colWidths = colWidths.filter(function (w) { return w > 0; });
  if (!colWidths.length) colWidths = [largInt];

  // ── Setup canvas ───────────────────────────────────────────────
  var canvas = document.getElementById('planCanvas');
  var mL = 88, mR = 68, mT = 58, mB = 78;
  var maxW  = Math.min(840, window.innerWidth - 32);
  var scale = Math.min((maxW - mL - mR) / lM, (560 - mT - mB) / hM, 0.19);
  var dW    = Math.round(lM * scale), dH = Math.round(hM * scale);
  canvas.width  = dW + mL + mR;
  canvas.height = dH + mT + mB;
  canvas.style.maxWidth = '100%';

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var ox = mL, oy = mT;
  var epS = Math.round(ep * scale), plS = Math.round(hPl * scale), yBS = Math.round(yBas * scale);

  // ── Dessin ─────────────────────────────────────────────────────
  // Fond global
  ctx.fillStyle = '#f8f4ef';
  ctx.fillRect(ox, oy, dW, dH);

  // Colonnes (fond coloré)
  var colColors = ['#f0ebe3', '#edf0f5', '#f5f0ed'];
  var xCS = epS;
  for (var ci = 0; ci < colWidths.length; ci++) {
    var cW = Math.round(colWidths[ci] * scale);
    ctx.fillStyle = colColors[ci % colColors.length]; ctx.globalAlpha = 0.4;
    ctx.fillRect(ox + xCS, oy + epS, cW, dH - 2 * epS - yBS);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#aaa'; ctx.font = '9px Georgia,serif'; ctx.textAlign = 'center';
    ctx.fillText('Col.' + (ci + 1), ox + xCS + cW / 2, oy + epS + 14);
    xCS += cW + epS;
  }

  // Panneaux structurels
  function panR(x, y, w, h, lbl, rot) {
    ctx.fillStyle = '#d8cfc0'; ctx.strokeStyle = '#5a4520'; ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#5a4520'; ctx.font = 'bold 9px Georgia,serif';
    if (rot) {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
      ctx.textAlign = 'center'; ctx.fillText(lbl, 0, 4); ctx.restore();
    } else {
      ctx.textAlign = 'center'; ctx.fillText(lbl, x + w / 2, y + h / 2 + 4);
    }
  }

  var infY = oy + dH - epS - yBS;
  panR(ox, oy,              dW, epS, 'D');
  panR(ox, infY,            dW, epS, 'C');
  panR(ox, oy,              epS, dH, 'A', -Math.PI / 2);
  panR(ox + dW - epS, oy,  epS, dH, 'B',  Math.PI / 2);

  // Montants intermédiaires
  var xCur = epS;
  for (var cm = 0; cm < colWidths.length - 1; cm++) {
    xCur += Math.round(colWidths[cm] * scale);
    panR(ox + xCur, oy + epS, epS, dH - 2 * epS - yBS, 'F');
    xCur += epS;
  }

  // Plinthe
  if (hPl > 0) {
    ctx.fillStyle = '#c8bfb0'; ctx.strokeStyle = '#6a4e00'; ctx.lineWidth = 1;
    ctx.fillRect(ox + epS, oy + dH - plS, dW - 2 * epS, plS);
    ctx.strokeRect(ox + epS, oy + dH - plS, dW - 2 * epS, plS);
    ctx.fillStyle = '#888'; ctx.font = '9px Georgia,serif'; ctx.textAlign = 'center';
    ctx.fillText('Plinthe', ox + epS + (dW - 2 * epS) / 2, oy + dH - plS / 2 + 4);
  }

  // ── Cotes ─────────────────────────────────────────────────────
  function cote(x1, y1, x2, y2, lbl, side, color, off) {
    off = off || 0;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 0.8; ctx.font = '9px Georgia,serif';
    var arr = 4, gap2 = 10 + off;
    if (side === 'top' || side === 'bottom') {
      var yL = side === 'top' ? Math.min(y1, y2) - gap2 : Math.max(y1, y2) + gap2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(x1, Math.min(y1,y2)); ctx.lineTo(x1, yL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, Math.min(y1,y2)); ctx.lineTo(x2, yL); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x1, yL); ctx.lineTo(x2, yL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1,yL); ctx.lineTo(x1+arr,yL-3); ctx.lineTo(x1+arr,yL+3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x2,yL); ctx.lineTo(x2-arr,yL-3); ctx.lineTo(x2-arr,yL+3); ctx.closePath(); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillText(lbl, (x1 + x2) / 2, side === 'top' ? yL - 4 : yL + 12);
    } else {
      var xL = side === 'left' ? Math.min(x1, x2) - gap2 : Math.max(x1, x2) + gap2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(Math.min(x1,x2), y1); ctx.lineTo(xL, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(Math.min(x1,x2), y2); ctx.lineTo(xL, y2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xL, y1); ctx.lineTo(xL, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xL,y1); ctx.lineTo(xL-3,y1+arr); ctx.lineTo(xL+3,y1+arr); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(xL,y2); ctx.lineTo(xL-3,y2-arr); ctx.lineTo(xL+3,y2-arr); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(xL + (side === 'left' ? -12 : 12), (y1 + y2) / 2);
      ctx.rotate(side === 'left' ? -Math.PI / 2 : Math.PI / 2);
      ctx.textAlign = 'center'; ctx.fillText(lbl, 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  cote(ox, oy, ox + dW, oy,     lM + ' mm',             'top',    '#1a1a1a', 0);
  cote(ox, oy, ox, oy + dH,     hM + ' mm',             'left',   '#1a1a1a', 0);
  cote(ox, oy + epS, ox, infY,  Math.round(hInt) + ' mm','left',  '#8B6914', 22);
  if (hPl > 0) cote(ox + dW, oy + dH - plS, ox + dW, oy + dH, hPl + ' mm', 'right', '#888', 0);
  var xCC = epS;
  for (var cc = 0; cc < colWidths.length; cc++) {
    var cWc = Math.round(colWidths[cc] * scale);
    cote(ox + xCC, oy + dH, ox + xCC + cWc, oy + dH, Math.round(colWidths[cc]) + ' mm', 'bottom', '#2255aa', cc * 18);
    xCC += cWc + epS;
  }

  // ── Titre ─────────────────────────────────────────────────────
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 12px Georgia,serif'; ctx.textAlign = 'left';
  ctx.fillText('THE WOODER — Plan 2D coté — Vue de face', ox, oy - 35);
  ctx.font = '10px Georgia,serif'; ctx.fillStyle = '#888';
  var tpL = tp === 'encastree' ? 'Plinthe encastrée' : tp === 'applique' ? 'Plinthe applique' : 'Sans plinthe';
  ctx.fillText(lM + '×' + hM + ' mm — ' + tpL + ' — Éch. 1:' + Math.round(1 / scale), ox, oy - 18);

  ouvrirSection('secPlan2D');

  // Export PNG — défini APRÈS le dessin (pas de race condition)
  document.getElementById('btnExportPlan').onclick = function () {
    var dataURL  = canvas.toDataURL('image/png', 1.0);
    var parts    = dataURL.split(',');
    var binary   = atob(parts[1]);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    telechargerBlob(new Blob([arr], { type: 'image/png' }), 'wooder-plan-2D.png');
  };
}
