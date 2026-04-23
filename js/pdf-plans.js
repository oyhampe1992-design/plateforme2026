/* ================================================================
   THE WOODER - pdf-plans.js
   ================================================================
   Generation des plans de fabrication en PDF (via jsPDF).

   Pour chaque meuble :
   - Page de garde avec recap dimensions et quincaillerie
   - Plan du meuble vu de face avec cotes
   - Feuilles de debit par epaisseur (19mm, 8mm, autres)
   - Plans detailles par piece (percages, rainures, connecteurs)
   - Plans des tiroirs si presents
   - Plans de coupe (optimisation) par epaisseur

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html ou autres modules)
   ----------------------------------------------------------------
   Librairie externe :
     window.jspdf                - chargee via CDN dans calcul.html

   Fonctions externes :
     Depuis calcul.html :
       formatMm(v), esc(s)
     Depuis calculs.js :
       posCharn, posPercBout, nbCharn

   Variables globales lues :
     window._itemsCache, window._profEtag, window._rainures,
     window._liaisons, window._mXPos, window._meubles,
     window._opti19, window._cutlistPieces, window._fonds,
     window._tiroirsDets

   ----------------------------------------------------------------
   Usage : genererPlansPDF(nomMeuble) appele par le bouton
   "Plans PDF" dans l'interface.
   ================================================================ */

function genererPlansPDF(nomMeuble) {
  var jsPDFLib = window.jspdf ? window.jspdf.jsPDF : null;
  if (!jsPDFLib) { alert('jsPDF non disponible'); return; }

  var ep       = parseFloat(document.getElementById('epaisseur').value) || 19;
  var debLat   = parseFloat(document.getElementById('debutPerc').value) || 96;
  var margeBas = parseFloat(document.getElementById('margeBas').value)  || 100;
  var tp       = document.getElementById('typePortes').value;
  var items    = window._itemsCache || [];
  if (!items.length) { alert('Calculez d\'abord.'); return; }

  var titreDoc     = nomMeuble || 'Plans';
  var nomFichierPDF = titreDoc.replace(/[^a-zA-Z0-9_-]/g, '_');
  var pieces = items.filter(function (it) {
    return ['lateral','montant','panneau','etagere','porte'].indexOf(it.type) > -1;
  });
  if (!pieces.length) { alert('Aucune pièce à dessiner.'); return; }

  var pdf = new jsPDFLib({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // A4 portrait, 1 pièce par page pour lisibilité maximale
  // A4 paysage : 297×210mm — 2 colonnes, 1 rangée → cellules 136×186mm
  var PW = 297, PH = 210, mg = 8, nC = 2, nR = 1;
  var cW = (PW - (nC + 1) * mg) / nC;   // ≈ 136mm par cellule
  var cH = (PH - (nR + 1) * mg - 8) / nR; // ≈ 186mm par cellule

  // ── En-tête de page ──────────────────────────────────────────
  function titrePage(num) {
    pdf.setFillColor(30, 30, 30); pdf.rect(0, 0, PW, 8, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
    pdf.text('THE WOODER — ' + titreDoc, mg, 5.5);
    pdf.text('Page ' + (num + 1), PW - mg, 5.5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }

  // ── Ligne de cote ────────────────────────────────────────────
  function cotePDF(x1, y1, x2, y2, lbl, side, r, g, b) {
    if (Math.abs(x2-x1) < 0.5 && Math.abs(y2-y1) < 0.5) return; // cote nulle, skip
    pdf.setDrawColor(r, g, b); pdf.setTextColor(r, g, b);
    pdf.setFont('helvetica','normal');
    pdf.setLineWidth(0.15); pdf.setFontSize(3.8);
    var off = 4;
    var arr = 1.2;
    // Texte placé juste au-dessus de la ligne (baseline du texte à ~0.5mm au-dessus)
    // Pour une police de 3.8mm, un écart de 0.5mm laisse le texte presque collé à la ligne
    var txtOff = 0.5;
    if (side === 'top' || side === 'bottom') {
      var yL = side === 'top' ? Math.min(y1,y2) - off : Math.max(y1,y2) + off;
      pdf.setLineDash([0.6,0.6],0);
      pdf.line(x1, Math.min(y1,y2), x1, yL);
      pdf.line(x2, Math.min(y1,y2), x2, yL);
      pdf.setLineDash([],0);
      pdf.line(x1, yL, x2, yL);
      pdf.line(x1,yL,x1+arr,yL-arr*0.6); pdf.line(x1,yL,x1+arr,yL+arr*0.6);
      pdf.line(x2,yL,x2-arr,yL-arr*0.6); pdf.line(x2,yL,x2-arr,yL+arr*0.6);
      // Texte juste au-dessus/en-dessous de la ligne (baseline du texte → au ras de la ligne)
      var ty = side==='top' ? yL - 1 : yL + 3;
      pdf.text(lbl, (x1+x2)/2, ty, { align:'center' });
    } else {
      var xL = side === 'left' ? Math.min(x1,x2) - off : Math.max(x1,x2) + off;
      pdf.setLineDash([0.6,0.6],0);
      pdf.line(Math.min(x1,x2), y1, xL, y1);
      pdf.line(Math.min(x1,x2), y2, xL, y2);
      pdf.setLineDash([],0);
      pdf.line(xL, y1, xL, y2);
      pdf.line(xL,y1,xL-arr*0.6,y1+arr); pdf.line(xL,y1,xL+arr*0.6,y1+arr);
      pdf.line(xL,y2,xL-arr*0.6,y2-arr); pdf.line(xL,y2,xL+arr*0.6,y2-arr);
      // Texte pivoté 90° : centré SUR la ligne de flèches
      // ty décalé vers le BAS de ~0.6mm pour que le centre visuel du texte (pas sa baseline)
      // soit aligné avec le milieu des flèches
      var tx = side==='left' ? xL + 0.65 : xL - 0.65;
      var ty = (y1+y2)/2 + 1.2; // +1.2mm pour descendre le centre du texte sur le milieu
      pdf.text(lbl, tx, ty, { angle:90, align:'center' });
    }
    pdf.setTextColor(0,0,0); pdf.setLineDash([],0);
  }

  // ── Dessin d'une pièce dans une cellule ───────────────────────
  function dessinerPDF(item, ox, oy, cw, ch) {
    // Helper : formatte une valeur mm en "123" si entier ou "123,5" si décimal (virgule française)
    function formatMm(v) {
      if (v == null || isNaN(v)) return '—';
      var rounded = Math.round(v * 10) / 10; // arrondi au 1/10mm
      if (Math.abs(rounded - Math.round(rounded)) < 0.05) return Math.round(rounded).toString();
      return rounded.toFixed(1).replace('.', ',');
    }

    var p     = item.p, type = item.type;
    var hP    = Math.max(p.longueur, p.largeur);
    var lP    = Math.min(p.longueur, p.largeur);
    var sF    = item._sensForce || null;
    var nA    = item._nbAffiche != null ? item._nbAffiche : p.nombre;
    var estPM = (type === 'montant' && item._montantType === 'etagere');
    // Pour un petit montant intermédiaire : sa profondeur (lP) est celle d'une étagère
    // (s'arrête au bord avant de la rainure), pas celle d'un latéral.
    // On force la dimension à window._profEtag pour que le PDF soit cohérent.
    if (estPM && window._profEtag) {
      lP = window._profEtag;
    }
    var isFaceB = (sF === 'faceB');
    var nomR  = (p.designation||'').toLowerCase().replace(/[éèêë]/g,'e').replace(/[àâ]/g,'a');
    var pMr   = window._rainures ? window._rainures.profMeuble : lP;
    var liais = window._liaisons || [];
    var ep    = item.ep || 19;
    var tp    = item.typePlinthe || 'encastree';
    var hPl   = 0;
    for (var li0=0; li0<liais.length; li0++) {
      if (liais[li0].yDepuisBas !== undefined && liais[li0].type_piece==='lateral') {
        // yDepuisBas = hPl + ep/2, donc hPl = yDepuisBas - ep/2
        hPl = liais[li0].yDepuisBas - ep/2; break;
      }
    }

    // Titre
    var fL = sF==='faceA'?' — Face A':sF==='faceB'?' — Face B':(estPM?' — Petit montant':'');
    var cL = sF==='gauche'?' — Charnière GAUCHE':sF==='droite'?' — Charnière DROITE':'';
    var titre = p.designation+fL+cL+' '+hP+'×'+lP+'×'+p.epaisseur+'mm'+(nA>1?' (×'+nA+')':'');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(7); pdf.setTextColor(30,30,30);
    pdf.text(titre, ox+4, oy+7);
    // Bandeau Face A / Face B
    if (sF === 'faceA' || sF === 'faceB') {
      var faceColor = sF === 'faceA' ? [0,100,180] : [180,60,0];
      pdf.setFillColor(faceColor[0], faceColor[1], faceColor[2]);
      pdf.rect(ox, oy+9, cw, 5, 'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(5.5); pdf.setTextColor(255,255,255);
      pdf.text(sF === 'faceA' ? 'FACE A — INTÉRIEURE' : 'FACE B — MIROIR', ox + cw/2, oy+12.5, {align:'center'});
      pdf.setTextColor(0,0,0);
    }

    pdf.setDrawColor(200,200,200); pdf.setLineWidth(0.15);
    pdf.rect(ox, oy, cw, ch);

    // ── Fonction helper : légende en haut à droite ──
    // entries = tableau d'objets {color:[r,g,b], label:string}
    // La légende est placée à l'angle haut droit de la cellule
    function legendePDF(entries) {
      if (!entries || !entries.length) return;
      pdf.setFont('helvetica','normal'); pdf.setFontSize(4);
      var xL = ox + cw - 4;
      var yL = oy + ((sF==='faceA'||sF==='faceB') ? 18 : 12);
      for (var le=0; le<entries.length; le++) {
        var e = entries[le];
        pdf.setTextColor(e.color[0], e.color[1], e.color[2]);
        pdf.text(e.label, xL, yL, {align:'right'});
        yL += 3.5;
      }
      pdf.setTextColor(0,0,0);
    }

    // Helper : dessine un arc en pointillés (forme demi-lune Clamex P-14)
    // Paramètres en coordonnées PDF (pas MM) :
    //   cxPx, cyPx    = position du centre de la corde (point au bord du chant)
    //   orientation   = 'H' (chant haut/bas, arc va vers le haut ou le bas)
    //                   'V' (chant gauche/droite, arc va vers la gauche ou droite)
    //   sens          = +1 ou -1, direction dans laquelle l'arc s'enfonce
    //                   H  : +1 arc vers le bas,  -1 vers le haut
    //                   V  : +1 arc vers la droite, -1 vers la gauche
    //   scale         = échelle mm→PDF (sc ou scP)
    // Les dimensions utilisées sont CLAMEX_LONG et CLAMEX_PROF (globaux).
    function arcClamexChant(cxPx, cyPx, orientation, sens, scale) {
      var L = CLAMEX_LONG * scale;  // corde
      var F = CLAMEX_PROF * scale;  // flèche
      var k = 4 * F / 3;
      pdf.setLineWidth(0.2);
      if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.6, 0.6], 0);
      else if (pdf.setLineDash) pdf.setLineDash([0.6, 0.6], 0);
      if (orientation === 'V') {
        // corde verticale, arc horizontal (sens = direction X)
        pdf.lines(
          [[sens*k, L*0.25, sens*k, L*0.75, 0, L]],
          cxPx, cyPx - L/2,
          [1, 1],
          'S'
        );
      } else {
        // corde horizontale, arc vertical (sens = direction Y, +1 vers le bas)
        pdf.lines(
          [[L*0.25, sens*k, L*0.75, sens*k, L, 0]],
          cxPx - L/2, cyPx,
          [1, 1],
          'S'
        );
      }
      if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
      else if (pdf.setLineDash) pdf.setLineDash([], 0);
    }

    var mL=28, mR=28, mT=(sF==='faceA'||sF==='faceB'?26:20), mB=22;
    var dw = cw-mL-mR, dh = ch-mT-mB;

    // ────────────────────────────────────────────────────────
    // PANNEAU SUP/INF — vue paysage
    // ────────────────────────────────────────────────────────
    if (type === 'panneau') {
      var mLP=32, mRP=32, mTP=24, mBP=28;
      // Plus de plafond d'échelle : on utilise toute la cellule disponible
      // (les marges mLP/mRP/mTP/mBP laissent déjà la place pour les cotes/légendes)
      var scP  = Math.min((cw-mLP-mRP)/hP, (ch-mTP-mBP)/lP);
      var pwP  = hP*scP;
      var phP  = lP*scP;
      var pxP  = ox + mLP + ((cw-mLP-mRP)-pwP)/2;
      var pyP  = oy + mTP + ((ch-mTP-mBP)-phP)/2;

      // Détecter sup ou inf
      var isInf = false;
      for (var li4=0; li4<liais.length; li4++) {
        if (liais[li4].designation===p.designation && liais[li4].type_piece==='panneau_inf') { isInf=true; break; }
      }

      // Fond
      pdf.setFillColor(252,250,247); pdf.rect(pxP, pyP, pwP, phP, 'F');

      // ── Pointillés bleus : position des pièces adjacentes (latéraux + montants) ──
      // Vue paysage : X = longueur (pwP), Y = profondeur (phP)
      // Latéraux aux 2 bouts : traits verticaux à x = ep (bout gauche) et x = pwP - ep (bout droit)
      traitAdj(pxP + ep*scP, pyP, pxP + ep*scP, pyP + phP);
      traitAdj(pxP + pwP - ep*scP, pyP, pxP + pwP - ep*scP, pyP + phP);
      // Montants intermédiaires : encadrer chaque position par 2 traits (±ep/2)
      var mXPosP = window._mXPos || [];
      for (var mxiP = 0; mxiP < mXPosP.length; mxiP++) {
        var xMtP = mXPosP[mxiP] * scP;
        traitAdj(pxP + xMtP - (ep/2)*scP, pyP, pxP + xMtP - (ep/2)*scP, pyP + phP);
        traitAdj(pxP + xMtP + (ep/2)*scP, pyP, pxP + xMtP + (ep/2)*scP, pyP + phP);
      }

      // Rainure fond — sup : bord arrière | inf : miroir = bord avant
      var xR1p = isInf ? RAIN_DIST_BORD  : pMr-RAIN_DIST_BORD;
      var xR2p = isInf ? (RAIN_DIST_BORD + RAIN_LARGEUR)  : pMr-(RAIN_DIST_BORD + RAIN_LARGEUR);
      var xRminP=Math.min(xR1p,xR2p), xRmaxP=Math.max(xR1p,xR2p);
      pdf.setDrawColor(0,160,160); pdf.setLineWidth(0.3);
      pdf.line(pxP, pyP+xR1p*scP, pxP+pwP, pyP+xR1p*scP);
      pdf.line(pxP, pyP+xR2p*scP, pxP+pwP, pyP+xR2p*scP);
      // Cotes complètes encadrant la rainure (vue paysage, rainure horizontale) :
      // [bord avant ──── xRminP] [xRminP ── rainure ── xRmaxP] [xRmaxP ──── bord arrière]
      // Placées loin à gauche (-14/-19) car les cotes excentriques/tourillons rouges/violettes
      // sont plus proches de la pièce (-4 et -9)
      cotePDF(pxP-14, pyP, pxP-14, pyP+xRminP*scP, formatMm(xRminP)+'mm', 'left', 0,160,160);
      cotePDF(pxP-19, pyP+xRminP*scP, pxP-19, pyP+xRmaxP*scP, formatMm(RAIN_LARGEUR)+'mm', 'left', 0,160,160);
      cotePDF(pxP-14, pyP+xRmaxP*scP, pxP-14, pyP+phP, formatMm(lP-xRmaxP)+'mm', 'left', 0,160,160);

      // ── Bouts (connexion latéraux) : Exc.Ø15 + Goujon Ø5  OU  Clamex P-14 ─────
      // X = ep/2 depuis chaque bout de la longueur
      // Y dans profondeur : exc à 100 et lP-100, tou à 140 et lP-140
      var rExcP  = Math.min(7.5*scP, 3.5);
      var rTouP  = Math.min((DIAM_TOU/2)*scP, 2.0);
      var xBoutG = (ep/2)*scP;
      var xBoutD = pwP - (ep/2)*scP;
      var yE1 = EXC_AVANT*scP, yE2 = (lP-EXC_AVANT)*scP;
      var yT1 = TOU_AVANT*scP, yT2 = (lP-TOU_AVANT)*scP;
      var useClamex = (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14');
      var useCabineo = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
      var ajouteBiscP = (useClamex && TYPE_CONNECTEUR === 'clamex_biscuit' && hP > BISCUIT_SEUIL && lP > BISCUIT_SEUIL);

      if (useClamex) {
        // Mode Clamex — Sur un panneau sup/inf, TOUTES les rainures sont dans des chants (invisibles de dessus)
        // • Bouts gauche/droit = chant qui se colle au latéral → rainure dans le chant
        // • Positions des montants = chant bas (pour sup) ou haut (pour inf) qui se colle au montant
        // → Tout représenté en POINTILLÉS fins rouges (usinage caché, convention plan technique)
        // AUCUN trou d'accès sur le panneau : ils sont sur les latéraux et montants
        var ARC_VISIB = CLAMEX_LONG || 52; // longueur de l'arc (60.3 Lamello, 52 défaut)
        var yCl1 = CLAMEX_AVANT*scP, yCl2 = (lP-CLAMEX_AVANT)*scP;

        // Helper : dessine un arc en pointillés (forme demi-lune Clamex P-14)
        // xBord = X de la corde (aligné avec le chant), yCenter = Y du centre vertical de l'arc
        // sens = +1 si l'arc pointe vers la droite (bord gauche), -1 si vers la gauche (bord droit)
        // longueurMM = longueur de la corde (axe Y, 60.3mm standard)
        // flecheMM   = profondeur de l'arc vers l'intérieur (14mm standard)
        function arcClamexBout(xBord, yCenter, sens, longueurMM, flecheMM) {
          var L = longueurMM * scP;
          var F = flecheMM   * scP;
          // L'arc va de (xBord, yCenter-L/2) à (xBord, yCenter+L/2)
          // avec un sommet à (xBord + sens*F, yCenter)
          // Approximation Bézier cubique : 2 points de contrôle pour approximer l'arc
          // Pour un arc tangent aux extrémités parallèle à l'axe X :
          var k = 4 * F / 3; // offset optimal pour approximation bézier d'un demi-cercle-like
          pdf.setLineWidth(0.2);
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.6, 0.6], 0);
          else if (pdf.setLineDash) pdf.setLineDash([0.6, 0.6], 0);
          // jsPDF.lines(lines, x, y, scale, style, closed)
          // chaque "line" = [x1_ctrl, y1_ctrl, x2_ctrl, y2_ctrl, x_end, y_end] pour bézier cubique
          // Point de départ : (xBord, yCenter - L/2)
          // Arrivée : (xBord, yCenter + L/2)
          pdf.lines(
            [[sens*k, L*0.25, sens*k, L*0.75, 0, L]],  // bézier du point haut au point bas
            xBord, yCenter - L/2,
            [1, 1],
            'S'
          );
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
          else if (pdf.setLineDash) pdf.setLineDash([], 0);
        }

        // Helper : rainure rectangulaire cachée en pointillés (pour montants intermédiaires)
        function rainureCachee(cxPx, cyPx, direction) {
          var longPx = ARC_VISIB * scP;
          var largPx = CLAMEX_LARG * scP;
          pdf.setLineWidth(0.15);
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
          else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
          if (direction === 'H') {
            pdf.rect(cxPx - longPx/2, cyPx - largPx/2, longPx, largPx, 'S');
          } else {
            pdf.rect(cxPx - largPx/2, cyPx - longPx/2, largPx, longPx, 'S');
          }
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
          else if (pdf.setLineDash) pdf.setLineDash([], 0);
        }

        // ── BOUTS gauche/droit : arc de fraise en forme de demi-lune → pointillés rouges fins ──
        // Le bord gauche a l'arc qui pointe vers la DROITE (vers l'intérieur de la pièce)
        // Le bord droit a l'arc qui pointe vers la GAUCHE (vers l'intérieur de la pièce)
        pdf.setDrawColor(200,0,0);
        [yCl1, yCl2].forEach(function(y) {
          arcClamexBout(pxP + 0,  pyP + y,  +1, ARC_VISIB, CLAMEX_PROF);  // bord gauche → arc vers droite
          arcClamexBout(pxP + pwP, pyP + y, -1, ARC_VISIB, CLAMEX_PROF);  // bord droit → arc vers gauche
        });

        // ── MONTANTS intermédiaires : rainures DANS LE CHANT aussi (chant qui colle au montant) ──
        var mXAll = window._mXPos || [];
        for (var mxi=0; mxi<mXAll.length; mxi++) {
          var xMpx = mXAll[mxi]*scP;
          pdf.setDrawColor(200,0,0);
          [yCl1, yCl2].forEach(function(y) {
            rainureCachee(pxP+xMpx, pyP+y, 'V');
          });
          // Biscuit central (également dans le chant) → pointillés jaunes fins
          if (ajouteBiscP) {
            var wBisP = BISCUIT_LARG*scP, hBisP = BISCUIT_LONG*scP;
            pdf.setDrawColor(180,140,0); pdf.setLineWidth(0.15);
            if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
            else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
            pdf.rect(pxP+xMpx-wBisP/2, pyP+phP/2-hBisP/2, wBisP, hBisP, 'S');
            if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
            else if (pdf.setLineDash) pdf.setLineDash([], 0);
          }
        }

        // ── COTES en bleu : positions des montants intermédiaires (sous le panneau) ──
        // En mode Clamex : on cote bord-à-bord (case visible entre montants), pas l'entraxe
        if (mXAll.length > 0) {
          var xPrevP = 0;
          for (var mct=0; mct<mXAll.length; mct++) {
            var xGauche = mXAll[mct] - ep/2; // bord gauche du montant
            var xDroite = mXAll[mct] + ep/2; // bord droit du montant
            cotePDF(pxP+xPrevP*scP, pyP+phP, pxP+xGauche*scP, pyP+phP, formatMm(xGauche-xPrevP)+'mm', 'bottom', 0,80,200);
            xPrevP = xDroite;
          }
          cotePDF(pxP+xPrevP*scP, pyP+phP, pxP+pwP, pyP+phP, formatMm(hP-xPrevP)+'mm', 'bottom', 0,80,200);
        }

        // ── LÉGENDE en haut à droite (hors de la pièce) ──
        var entriesP = [ {color:[200,0,0], label:'Clamex P-14 (chants)'} ];
        if (ajouteBiscP) entriesP.push({color:[180,140,0], label:'Biscuit #20'});
        entriesP.push({color:[0,160,160], label:'Rainure fond'});
        if (mXAll.length > 0) entriesP.push({color:[0,80,200], label:'Montants intermédiaires'});
        entriesP.push({color:[200,80,0], label:'Chant plaqué'});
        legendePDF(entriesP);
      } else if (useCabineo) {
        // Mode Cabineo — Panneau = MÂLE aux bouts, FEMELLE aux montants
        // Poches multi-cercles sur la face (côté intérieur) aux 2 bouts
        // + trous Ø5 au droit des montants (reçoivent la vis Cabineo du montant)
        var cabNamePP = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';

        // Nombre et positions Y (dans la profondeur lP)
        var nbCabPP;
        if (CAB_NB_BOUT === 'auto') nbCabPP = (lP > CAB_SEUIL) ? 3 : 2;
        else nbCabPP = parseInt(CAB_NB_BOUT, 10) || 2;
        var yCabsMm;
        if (nbCabPP <= 2) yCabsMm = [CAB_AVANT, lP - CAB_AVANT];
        else if (nbCabPP === 3) yCabsMm = [CAB_AVANT, lP/2, lP - CAB_AVANT];
        else {
          yCabsMm = [CAB_AVANT];
          var stepYmm = (lP - 2*CAB_AVANT) / (nbCabPP - 1);
          for (var kk = 1; kk < nbCabPP - 1; kk++) yCabsMm.push(CAB_AVANT + kk * stepYmm);
          yCabsMm.push(lP - CAB_AVANT);
        }

        // Paramètres forage pour dessin poche (N cercles chevauchants le long de X)
        var nbFPP = Math.max(2, CAB_NB_FORAGES);
        var rFPP  = (CAB_DIAM_FORAGE/2) * scP;
        var startPP = -CAB_POCHE_L/2 + CAB_DIAM_FORAGE/2;
        var endPP   =  CAB_POCHE_L/2 - CAB_DIAM_FORAGE/2;
        var stepPP  = (endPP - startPP) / (nbFPP - 1);

        // POCHES aux 2 bouts (connexion latéraux) — axe long poche // X
        pdf.setDrawColor(200, 60, 0); pdf.setLineWidth(0.3);
        var xPocheCentresMm = [CAB_POCHE_L/2, hP - CAB_POCHE_L/2];
        xPocheCentresMm.forEach(function(xCmm) {
          yCabsMm.forEach(function(yCmm) {
            for (var kP = 0; kP < nbFPP; kP++) {
              var off_mm = startPP + kP * stepPP;
              pdf.circle(pxP + (xCmm + off_mm) * scP, pyP + yCmm * scP, rFPP, 'S');
            }
          });
        });

        // TROUS Ø5 au droit des montants (femelle) — petits cercles verts
        var mXAllCab = window._mXPos || [];
        var rHolePP  = Math.min(Math.max(0.6, (CAB_HOLE/2) * scP), 1.2);
        pdf.setDrawColor(0, 140, 60); pdf.setLineWidth(0.25);
        mXAllCab.forEach(function(xMmm) {
          yCabsMm.forEach(function(yCmm) {
            pdf.circle(pxP + xMmm * scP, pyP + yCmm * scP, rHolePP, 'S');
          });
        });

        // Cotes profondeur des positions Cabineo (premier et dernier)
        cotePDF(pxP-4, pyP, pxP-4, pyP+yCabsMm[0]*scP, formatMm(yCabsMm[0])+'mm', 'left', 200,60,0);
        var yLast = yCabsMm[yCabsMm.length-1];
        cotePDF(pxP-4, pyP+yLast*scP, pxP-4, pyP+phP, formatMm(lP - yLast)+'mm', 'left', 200,60,0);

        // ── COTES positions des montants intermédiaires (bord-à-bord) ──
        if (mXAllCab.length > 0) {
          var xPrevPC = 0;
          for (var mctC = 0; mctC < mXAllCab.length; mctC++) {
            var xGauche = mXAllCab[mctC] - ep/2;
            var xDroite = mXAllCab[mctC] + ep/2;
            cotePDF(pxP+xPrevPC*scP, pyP+phP, pxP+xGauche*scP, pyP+phP, formatMm(xGauche-xPrevPC)+'mm', 'bottom', 0,80,200);
            xPrevPC = xDroite;
          }
          cotePDF(pxP+xPrevPC*scP, pyP+phP, pxP+pwP, pyP+phP, formatMm(hP-xPrevPC)+'mm', 'bottom', 0,80,200);
        }

        // ── LÉGENDE ──
        var entriesPC = [
          {color:[200,60,0], label: cabNamePP + ' (poche ' + CAB_NB_FORAGES + '×Ø' + CAB_DIAM_FORAGE + ')'},
          {color:[0,140,60], label: 'Trou Ø' + CAB_HOLE + ' (femelle montants)'},
          {color:[0,160,160], label:'Rainure fond'}
        ];
        if (mXAllCab.length > 0) entriesPC.push({color:[0,80,200], label:'Montants intermédiaires'});
        entriesPC.push({color:[200,80,0], label:'Chant plaqué'});
        legendePDF(entriesPC);
      } else {
        // Mode classique : excentriques Ø15 SUR LA FACE + goujons Ø5 (100mm) et tourillons Ø6 (140mm) DANS LES CHANTS
        // Bouts gauche/droit (connexion latéraux) :
        //   • Excentriques Ø15 : sur la face → cercles rouges visibles
        //   • Goujons Ø5 dans le chant gauche/droit à 100mm : rectangles pointillés verts
        //   • Tourillons Ø6 dans le chant gauche/droit à 140mm : rectangles pointillés violets
        var wGouP = DIAM*scP, lGouP = PROF_TOU*scP;
        var wTouP = DIAM_TOU*scP, lTouP = PROF_TOU*scP;
        var yT1p = TOU_AVANT*scP, yT2p = (lP-TOU_AVANT)*scP;
        pdf.setDrawColor(200,0,0); pdf.setLineWidth(0.3);
        pdf.circle(pxP+xBoutG, pyP+yE1, rExcP, 'S');
        pdf.circle(pxP+xBoutG, pyP+yE2, rExcP, 'S');
        pdf.circle(pxP+xBoutD, pyP+yE1, rExcP, 'S');
        pdf.circle(pxP+xBoutD, pyP+yE2, rExcP, 'S');
        // Goujons Ø5 (100mm) dans les chants — pointillés verts
        pdf.setDrawColor(0,140,60); pdf.setLineWidth(0.15);
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
        else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
        // Chant gauche (x=0) : rectangles partent du bord gauche et s'enfoncent vers la droite
        pdf.rect(pxP, pyP+yE1-wGouP/2, lGouP, wGouP, 'S');
        pdf.rect(pxP, pyP+yE2-wGouP/2, lGouP, wGouP, 'S');
        // Chant droit (x=pwP) : rectangles partent du bord droit et s'enfoncent vers la gauche
        pdf.rect(pxP+pwP-lGouP, pyP+yE1-wGouP/2, lGouP, wGouP, 'S');
        pdf.rect(pxP+pwP-lGouP, pyP+yE2-wGouP/2, lGouP, wGouP, 'S');
        // Tourillons Ø6 (140mm) dans les chants — pointillés violets
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.15);
        pdf.rect(pxP, pyP+yT1p-wTouP/2, lTouP, wTouP, 'S');
        pdf.rect(pxP, pyP+yT2p-wTouP/2, lTouP, wTouP, 'S');
        pdf.rect(pxP+pwP-lTouP, pyP+yT1p-wTouP/2, lTouP, wTouP, 'S');
        pdf.rect(pxP+pwP-lTouP, pyP+yT2p-wTouP/2, lTouP, wTouP, 'S');
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
        else if (pdf.setLineDash) pdf.setLineDash([], 0);

        // Cotes profondeur (positions des perçages — essentiel pour positionner l'usinage)
        // Proche de la pièce (pxP-4) : cotes ROUGES des excentriques à 100mm (petite valeur)
        // Plus loin (pxP-9) : cotes VIOLETTES des tourillons à 140mm (grande valeur)
        cotePDF(pxP-4, pyP, pxP-4, pyP+yE1, EXC_AVANT+'mm', 'left', 200,0,0);
        cotePDF(pxP-4, pyP+yE2, pxP-4, pyP+phP, EXC_AVANT+'mm', 'left', 200,0,0);
        cotePDF(pxP-9, pyP, pxP-9, pyP+yT1p, TOU_AVANT+'mm', 'left', 80,0,160);
        cotePDF(pxP-9, pyP+yT2p, pxP-9, pyP+phP, TOU_AVANT+'mm', 'left', 80,0,160);

        // ── Montants intermédiaires : goujons/tourillons DANS LE CHANT BAS du panneau (invisibles sur face)
        // → rectangles pointillés verts/violets à la position X du montant
        // Le chant bas du panneau est le chant qui touche le montant intermédiaire
        // Vu de dessus, ces perçages sont cachés → représentation conventionnelle en pointillés
        var mXAll = window._mXPos || [];
        for (var mxi=0; mxi<mXAll.length; mxi++) {
          var xMpx = mXAll[mxi]*scP;
          // Aux positions des montants intermédiaires : perçages TRAVERSANTS sur la face du panneau
          // (même logique que sur les latéraux : cercles pleins sur la face, pas rectangles)
          // Le montant est dessous/dessus du panneau, ses tourillons traversent la face du panneau
          var rG5P = Math.min((DIAM/2)*scP, 1.2);
          var rT6P = Math.min((DIAM_TOU/2)*scP, 1.8);
          // Goujons Ø5 à yE1 et yE2 (positions 100mm et lP-100mm) — cercles verts sur la face
          pdf.setDrawColor(0,140,60); pdf.setLineWidth(0.25);
          pdf.circle(pxP+xMpx, pyP+yE1, rG5P, 'S');
          pdf.circle(pxP+xMpx, pyP+yE2, rG5P, 'S');
          // Tourillons Ø6 à yT1 et yT2 (positions 140mm et lP-140mm) — cercles violets sur la face
          pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.25);
          pdf.circle(pxP+xMpx, pyP+yT1, rT6P, 'S');
          pdf.circle(pxP+xMpx, pyP+yT2, rT6P, 'S');
        }

        // ── COTES en bleu : positions des montants intermédiaires (sous le panneau) ──
        // Bord-à-bord (pas entraxe) pour montrer les compartiments utiles
        if (mXAll.length > 0) {
          var xPrevP = 0;
          for (var mct=0; mct<mXAll.length; mct++) {
            var xGauche = mXAll[mct] - ep/2;
            var xDroite = mXAll[mct] + ep/2;
            cotePDF(pxP+xPrevP*scP, pyP+phP, pxP+xGauche*scP, pyP+phP, formatMm(xGauche-xPrevP)+'mm', 'bottom', 0,80,200);
            xPrevP = xDroite;
          }
          cotePDF(pxP+xPrevP*scP, pyP+phP, pxP+pwP, pyP+phP, formatMm(hP-xPrevP)+'mm', 'bottom', 0,80,200);
        }

        // ── LÉGENDE en haut à droite (hors de la pièce) ──
        var entriesP = [
          {color:[200,0,0],   label:'Excentrique Ø15'},
          {color:[0,140,60],  label:'Goujon Ø5'},
          {color:[80,0,160],  label:'Tourillon Ø6'},
          {color:[0,160,160], label:'Rainure fond'}
        ];
        if (mXAll.length > 0) entriesP.push({color:[0,80,200], label:'Montants intermédiaires'});
        entriesP.push({color:[200,80,0], label:'Chant plaqué'});
        legendePDF(entriesP);
      }

      // Contour paysage — le chant (orange) est sur le bord AVANT
      // Sup : rainure en bas → chant en haut | Inf : rainure en haut → chant en bas
      pdf.setLineWidth(0.35);
      // Bords gauche et droit (bouts) : toujours foncé
      pdf.setDrawColor(20,20,20);
      pdf.line(pxP, pyP, pxP, pyP+phP);
      pdf.line(pxP+pwP, pyP, pxP+pwP, pyP+phP);
      // Bord haut : orange si sup (avant), foncé si inf (arrière)
      pdf.setDrawColor(isInf?20:200, isInf?20:80, isInf?20:0);
      pdf.line(pxP, pyP, pxP+pwP, pyP);
      // Bord bas : orange si inf (avant), foncé si sup (arrière)
      pdf.setDrawColor(isInf?200:20, isInf?80:20, isInf?0:20);
      pdf.line(pxP, pyP+phP, pxP+pwP, pyP+phP);
      pdf.setDrawColor(20,20,20);
      cotePDF(pxP, pyP, pxP+pwP, pyP, hP+'mm', 'top', 180,0,0);
      // Cote profondeur totale à DROITE de la pièce (opposé des cotes de perçage à gauche)
      cotePDF(pxP+pwP, pyP, pxP+pwP, pyP+phP, lP+'mm', 'right', 180,0,0);
      return;
    }

    // ────────────────────────────────────────────────────────
    // Dimensions communes pour les pièces portrait
    // ────────────────────────────────────────────────────────
    var sc = Math.min(dh/hP, dw/lP);
    var pw = lP*sc, ph = hP*sc;
    var px = ox + mL + (dw-pw)/2;
    var py = oy + mT + (dh-ph)/2;
    pdf.setFillColor(252,250,247); pdf.rect(px, py, pw, ph, 'F');

    // ── Pointillés bleus : position des pièces adjacentes ────────
    // Aide au positionnement de la machine portative (Zeta P2, défonceuse...)
    // Style plan technique : bleu pointillé fin
    // Fonction helper accessible dans toutes les sections (panneaux / latéraux / montants)
    function traitAdj(x1, y1, x2, y2) {
      pdf.setDrawColor(0, 80, 200);
      pdf.setLineWidth(0.15);
      if (pdf.setLineDashPattern) pdf.setLineDashPattern([1, 1], 0);
      else if (pdf.setLineDash) pdf.setLineDash([1, 1], 0);
      pdf.line(x1, y1, x2, y2);
      if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
      else if (pdf.setLineDash) pdf.setLineDash([], 0);
    }

    if ((type==='lateral' || type==='montant') && !estPM) {
      // Vue portrait : X = profondeur (pw), Y = longueur/hauteur (ph)
      // Traits pointillés bleus sur latéral uniquement (sur montant, les arcs Clamex
      // matérialisent déjà l'emplacement des panneaux sup/inf → redondant)
      if (type === 'lateral') {
        // Bord supérieur : panneau sup vient dessus, bord inf du panneau sup = à ep de distance
        traitAdj(px, py + ep*sc, px + pw, py + ep*sc);
        // Panneau inf : son bord SUPÉRIEUR est à (hPl + ep) depuis le bas
        traitAdj(px, py + ph - (hPl + ep)*sc, px + pw, py + ph - (hPl + ep)*sc);
        // Plinthe : bord supérieur à y = ph - hPl*sc (si plinthe existe)
        if (hPl > 0) {
          traitAdj(px, py + ph - hPl*sc, px + pw, py + ph - hPl*sc);
        }
      }
    }

    var rExc = Math.min(7.5*sc, 4.0);
    var rTou = Math.min((DIAM_TOU/2)*sc, 2.5);

    // ────────────────────────────────────────────────────────
    // LATÉRAL & MONTANT PLEIN — vue portrait face intérieure
    // ────────────────────────────────────────────────────────
    if ((type==='lateral'||type==='montant') && !estPM) {
      // Excentriques trame 32mm (bleu) — seulement sur montant plein
      var debut = Math.max(0, type==='lateral' ? debLat : debLat-ep);
      var posY2=[]; var y2=debut;
      while (y2<=hP-margeBas) { posY2.push(y2); y2+=PAS; }
      var xRg = isFaceB ? lP-BORD : BORD;
      var xRd = isFaceB ? BORD : lP-BORD;
      pdf.setDrawColor(0,80,200); pdf.setLineWidth(0.15);
      for (var yi=0; yi<posY2.length; yi++) {
        pdf.circle(px+xRg*sc, py+posY2[yi]*sc, rTou*0.8, 'S');
        pdf.circle(px+xRd*sc, py+posY2[yi]*sc, rTou*0.8, 'S');
      }
      if (posY2.length>0) {
        cotePDF(px+pw+2, py, px+pw+2, py+posY2[0]*sc, formatMm(posY2[0])+'mm', 'right', 0,80,200);
        if (posY2.length>1) cotePDF(px+pw+5, py+posY2[0]*sc, px+pw+5, py+posY2[1]*sc, '32mm', 'right', 0,80,200);
        cotePDF(px+pw+2, py+posY2[posY2.length-1]*sc, px+pw+2, py+ph, formatMm(hP-posY2[posY2.length-1])+'mm', 'right', 0,80,200);
      }

      // ── Bout HAUT ──
      var yHaut  = type==='montant' ? (ep+ep/2)*sc : (ep/2)*sc;
      var posB = posPercBout(lP);
      var posX_this = isFaceB ? {exc:[lP-posB.exc[0],lP-posB.exc[1]], tou:[lP-posB.tou[0],lP-posB.tou[1]]} : posB;
      var useClamexLM = (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14');
      var useCabineoLM = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
      var ajouteBiscLM = (useClamexLM && TYPE_CONNECTEUR === 'clamex_biscuit' && hP > BISCUIT_SEUIL && lP > BISCUIT_SEUIL);

      // Helper Cabineo : dessine une poche (N cercles chevauchants) centrée à (xCmm, yCmm) en mm
      // axisAlongY=true : cercles alignés verticalement (le long de Y, axe longueur pièce)
      function drawPocheCabLM(xCmm, yCmm, axisAlongY) {
        var nbF_ = Math.max(2, CAB_NB_FORAGES);
        var rF_  = (CAB_DIAM_FORAGE/2) * sc;
        var start_ = -CAB_POCHE_L/2 + CAB_DIAM_FORAGE/2;
        var end_   =  CAB_POCHE_L/2 - CAB_DIAM_FORAGE/2;
        var step_  = (end_ - start_) / (nbF_ - 1);
        for (var kF = 0; kF < nbF_; kF++) {
          var off_ = start_ + kF * step_;
          var cx_ = px + (xCmm + (axisAlongY ? 0 : off_)) * sc;
          var cy_ = py + (yCmm + (axisAlongY ? off_ : 0)) * sc;
          pdf.circle(cx_, cy_, rF_, 'S');
        }
      }

      if (useClamexLM) {
        var xCl1 = CLAMEX_AVANT*sc, xCl2 = (lP-CLAMEX_AVANT)*sc;
        if (isFaceB) { xCl1 = (lP-CLAMEX_AVANT)*sc; xCl2 = CLAMEX_AVANT*sc; }
        pdf.setDrawColor(200,0,0);
        if (type === 'montant') {
          // Montant : Clamex usiné sur la FACE → demi-lunes (arcs)
          arcClamexChant(px+xCl1, py, 'H', +1, sc);
          arcClamexChant(px+xCl2, py, 'H', +1, sc);
        } else {
          // Latéral : Clamex reçu dans le CHANT → rectangles pleins rouges centrés sur ép. panneau
          var longSlotH = CLAMEX_LONG*sc, largSlotH = CLAMEX_LARG*sc;
          pdf.setLineWidth(0.3);
          pdf.rect(px+xCl1-longSlotH/2, py+yHaut-largSlotH/2, longSlotH, largSlotH, 'S');
          pdf.rect(px+xCl2-longSlotH/2, py+yHaut-largSlotH/2, longSlotH, largSlotH, 'S');
        }
        if (ajouteBiscLM) {
          var wBisL = BISCUIT_LONG*sc, hBisL = BISCUIT_LARG*sc;
          pdf.setDrawColor(180,140,0); pdf.setLineWidth(0.15);
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
          else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
          pdf.rect(px+(lP/2)*sc-wBisL/2, py, wBisL, hBisL, 'S');
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
          else if (pdf.setLineDash) pdf.setLineDash([], 0);
        }
      } else if (useCabineoLM) {
        // Mode Cabineo — bout HAUT
        var posXCabH = posX_this.exc; // [CAB_AVANT, lP-CAB_AVANT] (idem excentrique)
        if (type === 'montant') {
          // MÂLE : poche unique (jamais sur Face B — c'est un perçage borgne sur la face A)
          if (!isFaceB) {
            pdf.setDrawColor(200,60,0); pdf.setLineWidth(0.3);
            var yCH = CAB_POCHE_L/2; // à fleur du chant haut (plan de liaison)
            posXCabH.forEach(function(xmm) { drawPocheCabLM(xmm, yCH, true); });
          }
        } else {
          // LATÉRAL (femelle) : perçages Ø5 sur la face (reçoivent le goujon Cabineo)
          var rCabLat = Math.min((CAB_HOLE/2)*sc, 1.2);
          pdf.setDrawColor(0,140,60); pdf.setLineWidth(0.25);
          posXCabH.forEach(function(xmm) {
            pdf.circle(px+xmm*sc, py+yHaut, rCabLat, 'S');
          });
        }
      } else if (type==='montant') {
        // Excentriques Ø15 sur la face (visibles) : cercles rouges à 100mm et lP-100mm
        pdf.setDrawColor(200,0,0); pdf.setLineWidth(0.3);
        pdf.circle(px+posX_this.exc[0]*sc, py+yHaut, rExc, 'S');
        pdf.circle(px+posX_this.exc[1]*sc, py+yHaut, rExc, 'S');
        // Tourillons Ø6 prof.13mm DANS LE CHANT HAUT (invisibles sur face) : rectangles pointillés violets
        var wTouM = DIAM_TOU*sc, lTouM = PROF_TOU*sc;
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.15);
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
        else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
        pdf.rect(px+posX_this.tou[0]*sc-wTouM/2, py, wTouM, lTouM, 'S');
        pdf.rect(px+posX_this.tou[1]*sc-wTouM/2, py, wTouM, lTouM, 'S');
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
        else if (pdf.setLineDash) pdf.setLineDash([], 0);
      } else {
        // Latéral : goujons Ø5 à 100mm SUR LA FACE (perçages visibles qui reçoivent les excentriques du panneau)
        //          + perçages Ø6 à 140mm SUR LA FACE (reçoivent les tourillons qui viennent du panneau sup)
        var rGouLat = Math.min((DIAM/2)*sc, 1.2);
        var rTouLat = Math.min((DIAM_TOU/2)*sc, 1.8);
        pdf.setDrawColor(180,80,0); pdf.setLineWidth(0.25);
        pdf.circle(px+posX_this.exc[0]*sc, py+yHaut, rGouLat, 'S');
        pdf.circle(px+posX_this.exc[1]*sc, py+yHaut, rGouLat, 'S');
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.25);
        pdf.circle(px+posX_this.tou[0]*sc, py+yHaut, rTouLat, 'S');
        pdf.circle(px+posX_this.tou[1]*sc, py+yHaut, rTouLat, 'S');
      }

      // ── Bout BAS ──
      var yBasDepuisBas = type==='montant' ? (ep+ep/2) : (hPl + ep/2);
      var yBasPx = ph - yBasDepuisBas*sc;
      if (useClamexLM) {
        var xCl1b = CLAMEX_AVANT*sc, xCl2b = (lP-CLAMEX_AVANT)*sc;
        if (isFaceB) { xCl1b = (lP-CLAMEX_AVANT)*sc; xCl2b = CLAMEX_AVANT*sc; }
        var yCordeBas = (type==='montant') ? ph : ph - hPl*sc;
        pdf.setDrawColor(200,0,0);
        if (type === 'montant') {
          // Montant : Clamex usiné sur la FACE → demi-lunes (arcs)
          arcClamexChant(px+xCl1b, py+yCordeBas, 'H', -1, sc);
          arcClamexChant(px+xCl2b, py+yCordeBas, 'H', -1, sc);
        } else {
          // Latéral : Clamex reçu dans le CHANT → rectangles pleins rouges centrés sur ép. panneau
          var longSlotB = CLAMEX_LONG*sc, largSlotB = CLAMEX_LARG*sc;
          pdf.setLineWidth(0.3);
          pdf.rect(px+xCl1b-longSlotB/2, py+yBasPx-largSlotB/2, longSlotB, largSlotB, 'S');
          pdf.rect(px+xCl2b-longSlotB/2, py+yBasPx-largSlotB/2, longSlotB, largSlotB, 'S');
        }
        if (ajouteBiscLM) {
          var wBisLB = BISCUIT_LONG*sc, hBisLB = BISCUIT_LARG*sc;
          pdf.setDrawColor(180,140,0); pdf.setLineWidth(0.15);
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
          else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
          pdf.rect(px+(lP/2)*sc-wBisLB/2, py+yCordeBas-hBisLB, wBisLB, hBisLB, 'S');
          if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
          else if (pdf.setLineDash) pdf.setLineDash([], 0);
        }
      } else if (useCabineoLM) {
        // Mode Cabineo — bout BAS
        var posXCabB = posX_this.exc;
        var yBordBas_mm = (type==='montant') ? ph/sc : (ph/sc - hPl); // position en mm du bord joint bas
        if (type === 'montant') {
          // MÂLE : poche à fleur du chant bas (jamais sur Face B)
          if (!isFaceB) {
            pdf.setDrawColor(200,60,0); pdf.setLineWidth(0.3);
            var yCB = yBordBas_mm - CAB_POCHE_L/2;
            posXCabB.forEach(function(xmm) { drawPocheCabLM(xmm, yCB, true); });
          }
        } else {
          // LATÉRAL (femelle) : perçages Ø5 sur la face (reçoivent le goujon Cabineo)
          var rCabLatB = Math.min((CAB_HOLE/2)*sc, 1.2);
          pdf.setDrawColor(0,140,60); pdf.setLineWidth(0.25);
          posXCabB.forEach(function(xmm) {
            pdf.circle(px+xmm*sc, py+yBasPx, rCabLatB, 'S');
          });
        }
      } else if (type==='montant') {
        // Excentriques Ø15 sur la face (visibles) : cercles rouges
        pdf.setDrawColor(200,0,0); pdf.setLineWidth(0.3);
        pdf.circle(px+posX_this.exc[0]*sc, py+yBasPx, rExc, 'S');
        pdf.circle(px+posX_this.exc[1]*sc, py+yBasPx, rExc, 'S');
        // Tourillons Ø6 prof.13mm DANS LE CHANT BAS (invisibles sur face) : rectangles pointillés violets
        // Partent du bord bas (py+ph) et remontent de 13mm vers l'intérieur
        var wTouMB = DIAM_TOU*sc, lTouMB = PROF_TOU*sc;
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.15);
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
        else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
        pdf.rect(px+posX_this.tou[0]*sc-wTouMB/2, py+ph-lTouMB, wTouMB, lTouMB, 'S');
        pdf.rect(px+posX_this.tou[1]*sc-wTouMB/2, py+ph-lTouMB, wTouMB, lTouMB, 'S');
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
        else if (pdf.setLineDash) pdf.setLineDash([], 0);
      } else {
        // Latéral bas : goujons Ø5 à 100mm SUR LA FACE (reçoivent les excentriques du panneau inf)
        //               + perçages Ø6 à 140mm SUR LA FACE (reçoivent les tourillons qui viennent du panneau inf)
        // Le chant bas du latéral est au-dessus de la plinthe (à yBasPx)
        var rGouLat2 = Math.min((DIAM/2)*sc, 1.2);
        var rTouLat2 = Math.min((DIAM_TOU/2)*sc, 1.8);
        pdf.setDrawColor(180,80,0); pdf.setLineWidth(0.25);
        pdf.circle(px+posX_this.exc[0]*sc, py+yBasPx, rGouLat2, 'S');
        pdf.circle(px+posX_this.exc[1]*sc, py+yBasPx, rGouLat2, 'S');
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.25);
        pdf.circle(px+posX_this.tou[0]*sc, py+yBasPx, rTouLat2, 'S');
        pdf.circle(px+posX_this.tou[1]*sc, py+yBasPx, rTouLat2, 'S');
      }

      // Cotes bouts — affichées seulement en mode excentrique (utile pour positionner la perceuse)
      // En mode Clamex/Cabineo, positions fixes paramétrées — on ne cote pas
      if (!useClamexLM && !useCabineoLM) {
        cotePDF(px-5, py, px-5, py+yHaut, formatMm(type==='montant'?ep+ep/2:ep/2)+'mm', 'left', type==='montant'?200:180, type==='montant'?0:80, 0);
        cotePDF(px-5, py+yBasPx, px-5, py+ph, formatMm(yBasDepuisBas)+'mm', 'left', type==='montant'?200:180, type==='montant'?0:80, 0);
        // Cotes X profondeur en bas : petite valeur (100mm = goujon/exc) au-dessus, grande valeur (140mm = tourillon) en dessous
        var excSorted = posX_this.exc.slice().sort(function(a,b){return a-b;});
        var touSorted = posX_this.tou.slice().sort(function(a,b){return a-b;});
        // Ligne HAUT (y=py+ph+4) : cote 100mm → couleur de l'élément à 100mm
        //   sur montant : exc Ø15 (rouge), sur latéral : goujon Ø5 (orange)
        var col100r = type==='montant' ? 200 : 180;
        var col100g = type==='montant' ?   0 :  80;
        var col100b = type==='montant' ?   0 :   0;
        cotePDF(px, py+ph+4, px+excSorted[0]*sc, py+ph+4, formatMm(excSorted[0])+'mm', 'bottom', col100r, col100g, col100b);
        cotePDF(px+excSorted[1]*sc, py+ph+4, px+pw, py+ph+4, formatMm(lP-excSorted[1])+'mm', 'bottom', col100r, col100g, col100b);
        // Ligne BAS (y=py+ph+9) : cote 140mm → tourillon Ø6 (violet)
        cotePDF(px, py+ph+9, px+touSorted[0]*sc, py+ph+9, formatMm(touSorted[0])+'mm', 'bottom', 80, 0, 160);
        cotePDF(px+touSorted[1]*sc, py+ph+9, px+pw, py+ph+9, formatMm(lP-touSorted[1])+'mm', 'bottom', 80, 0, 160);
      }

      // ── COTES en bleu : plinthe (latéral uniquement) ──
      // Sur le latéral, afficher la hauteur de plinthe si elle existe
      // Décalée à +8 pour ne pas chevaucher avec les cotes trame 32mm (à +2 et +5)
      if (type==='lateral' && hPl > 0) {
        cotePDF(px+pw+8, py+ph-hPl*sc, px+pw+8, py+ph, formatMm(hPl)+'mm', 'right', 0,80,200);
      }

      // Rainure fond (traits verticaux seulement, sans texte sur la pièce)
      var eDroit = (type==='lateral') && nomR.indexOf('droit')>-1;
      var xR1 = eDroit ? (RAIN_DIST_BORD + RAIN_LARGEUR) : pMr-RAIN_DIST_BORD;
      var xR2 = eDroit ? RAIN_DIST_BORD : pMr-(RAIN_DIST_BORD + RAIN_LARGEUR);
      if (isFaceB) { xR1=lP-xR1; xR2=lP-xR2; }
      var xRmin=Math.min(xR1,xR2), xRmax=Math.max(xR1,xR2);
      pdf.setDrawColor(0,160,160); pdf.setLineWidth(0.3);
      pdf.line(px+xR1*sc, py, px+xR1*sc, py+ph);
      pdf.line(px+xR2*sc, py, px+xR2*sc, py+ph);
      // Cotes complètes encadrant la rainure :
      // [bord avant ───── xRmin] [xRmin ── rainure ── xRmax] [xRmax ──── bord arrière]
      // Les cotes extérieures à -2, la cote centrale (largeur) à -7 pour bien les séparer
      cotePDF(px, py-2, px+xRmin*sc, py-2, formatMm(xRmin)+'mm', 'top', 0,160,160);
      cotePDF(px+xRmin*sc, py-7, px+xRmax*sc, py-7, formatMm(RAIN_LARGEUR)+'mm', 'top', 0,160,160);
      cotePDF(px+xRmax*sc, py-2, px+pw, py-2, formatMm(lP-xRmax)+'mm', 'top', 0,160,160);

      // ── LÉGENDE en haut à droite ──
      var entriesL = [];
      if (useClamexLM) {
        entriesL.push({color:[200,0,0], label: type==='montant' ? 'Clamex P-14 (face)' : 'Clamex P-14 (chants)'});
        if (ajouteBiscLM) entriesL.push({color:[180,140,0], label:'Biscuit #20'});
      } else if (useCabineoLM) {
        var cabNameLM = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';
        if (type === 'montant') {
          if (isFaceB) {
            // Pas de poche sur la face B d'un montant (perçage borgne côté A)
            entriesL.push({color:[120,120,120], label: cabNameLM + ' (poches côté Face A)'});
          } else {
            entriesL.push({color:[200,60,0], label: cabNameLM + ' (poche face)'});
          }
        } else {
          entriesL.push({color:[0,140,60], label: cabNameLM + ' (trou Ø' + CAB_HOLE + ' chant)'});
        }
      } else {
        if (type==='montant') entriesL.push({color:[200,0,0],  label:'Excentrique Ø15'});
        entriesL.push({color:[180,80,0], label:'Goujon Ø5'});
        if (type==='lateral') entriesL.push({color:[80,0,160], label:'Tourillon Ø6'});
        else entriesL.push({color:[80,0,160], label:'Tourillon Ø6 (chants)'});
      }
      entriesL.push({color:[0,160,160], label:'Rainure fond'});
      if (posY2.length > 0) entriesL.push({color:[0,80,200], label:'Trame 32mm (Ø5)'});
      if (type==='lateral' && hPl > 0) entriesL.push({color:[0,80,200], label:'Plinthe '+formatMm(hPl)+'mm'});
      entriesL.push({color:[200,80,0], label:'Chant plaqué'});
      legendePDF(entriesL);
    }

    // ────────────────────────────────────────────────────────
    // PETIT MONTANT — mode Clamex : demi-lunes | mode excentrique : rectangles pointillés tourillons
    // ────────────────────────────────────────────────────────
    if (estPM) {
      var usePMClamex = (TYPE_CONNECTEUR === 'clamex_biscuit' || TYPE_CONNECTEUR === 'clamex_p14');
      var usePMCabineo = (TYPE_CONNECTEUR === 'cabineo_8' || TYPE_CONNECTEUR === 'cabineo_12');
      if (usePMClamex) {
        // Mode Clamex : demi-lunes en haut et en bas (même logique que montants intermédiaires pleins)
        var xCl1PM = CLAMEX_AVANT*sc, xCl2PM = (lP-CLAMEX_AVANT)*sc;
        if (isFaceB) { xCl1PM = (lP-CLAMEX_AVANT)*sc; xCl2PM = CLAMEX_AVANT*sc; }
        pdf.setDrawColor(200,0,0);
        // Haut : corde au chant haut (y=py), arc plonge vers le bas (+1)
        arcClamexChant(px+xCl1PM, py, 'H', +1, sc);
        arcClamexChant(px+xCl2PM, py, 'H', +1, sc);
        // Bas : corde au chant bas (y=py+ph), arc plonge vers le haut (-1)
        arcClamexChant(px+xCl1PM, py+ph, 'H', -1, sc);
        arcClamexChant(px+xCl2PM, py+ph, 'H', -1, sc);
        // Légende petit montant (Clamex)
        var entriesPM = [
          {color:[200,0,0],   label:'Clamex P-14 (chants)'},
          {color:[200,80,0],  label:'Chant plaqué'}
        ];
        legendePDF(entriesPM);
      } else if (usePMCabineo) {
        // Mode Cabineo sur petit montant (mâle) : poches multi-cercles aux 2 extrémités
        // Positions X : mêmes que excentrique (CAB_AVANT, lP-CAB_AVANT)
        var posXPMcab = [CAB_AVANT*sc, (lP - CAB_AVANT)*sc];
        if (isFaceB) { posXPMcab = [(lP - CAB_AVANT)*sc, CAB_AVANT*sc]; }
        var nbFpm = Math.max(2, CAB_NB_FORAGES);
        var rFpm = (CAB_DIAM_FORAGE/2) * sc;
        var startPM = -CAB_POCHE_L/2 + CAB_DIAM_FORAGE/2;
        var endPM   =  CAB_POCHE_L/2 - CAB_DIAM_FORAGE/2;
        var stepPM  = (endPM - startPM) / (nbFpm - 1);
        pdf.setDrawColor(200,60,0); pdf.setLineWidth(0.3);
        // Haut : centre poche à CAB_POCHE_L/2 du bord haut (à fleur)
        // Bas  : centre poche à CAB_POCHE_L/2 du bord bas
        var yPMcenters = [CAB_POCHE_L/2 * sc, ph - CAB_POCHE_L/2 * sc];
        posXPMcab.forEach(function(xP) {
          yPMcenters.forEach(function(yPc) {
            for (var kPM = 0; kPM < nbFpm; kPM++) {
              var offPM = startPM + kPM * stepPM;
              pdf.circle(px + xP, py + yPc + offPM * sc, rFpm, 'S');
            }
          });
        });
        // Légende petit montant (Cabineo)
        var cabNamePM = (TYPE_CONNECTEUR === 'cabineo_12') ? 'Cabineo 12' : 'Cabineo 8';
        var entriesPM = [
          {color:[200,60,0],  label: cabNamePM + ' (poche face)'},
          {color:[200,80,0],  label:'Chant plaqué'}
        ];
        legendePDF(entriesPM);
      } else {
        // Mode excentrique : tourillons enfoncés de 13mm dans les chants haut/bas
        // → représentés par des rectangles pointillés violets : 6mm (Ø tourillon) × 13mm (profondeur)
        // Collés au bord du chant, s'étendant vers l'intérieur de la pièce
        var xAvPM = 80*sc, xArPM = (lP-80)*sc;
        var wTouPM = DIAM_TOU * sc;      // largeur = 6mm
        var lTouPM = PROF_TOU * sc;      // profondeur enfoncement = 13mm
        pdf.setDrawColor(80,0,160); pdf.setLineWidth(0.15);
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([0.15, 0.15], 0);
        else if (pdf.setLineDash) pdf.setLineDash([0.15, 0.15], 0);
        // Haut : rectangles partant du chant haut (y=py) et descendant de 13mm
        pdf.rect(px+xAvPM-wTouPM/2, py, wTouPM, lTouPM, 'S');
        pdf.rect(px+xArPM-wTouPM/2, py, wTouPM, lTouPM, 'S');
        // Bas : rectangles partant du chant bas (y=py+ph) et remontant de 13mm
        pdf.rect(px+xAvPM-wTouPM/2, py+ph-lTouPM, wTouPM, lTouPM, 'S');
        pdf.rect(px+xArPM-wTouPM/2, py+ph-lTouPM, wTouPM, lTouPM, 'S');
        if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
        else if (pdf.setLineDash) pdf.setLineDash([], 0);
        // Cotes positions horizontales (80mm de chaque bord)
        cotePDF(px, py-4, px+xAvPM, py-4, '80mm', 'top', 80,0,160);
        cotePDF(px+xArPM, py-4, px+pw, py-4, '80mm', 'top', 80,0,160);
        // Légende petit montant (mode excentrique)
        var entriesPM = [
          {color:[80,0,160],  label:'Tourillon Ø'+DIAM_TOU+' prof.'+PROF_TOU+'mm (chants)'},
          {color:[200,80,0],  label:'Chant plaqué'}
        ];
        legendePDF(entriesPM);
      }
    }

    // Étagères : pas de perçage
    // ────────────────────────────────────────────────────────
    // CHARNIÈRES portes
    // ────────────────────────────────────────────────────────
    if (type==='porte') {
      var jH2=tp==='encastree'?3:1.5, yPD2=ep+jH2;
      var nbC2=nbCharn(hP), pC2=posCharn(hP,nbC2,yPD2);
      var axC2=(sF==='droite')?(lP-22.5):22.5;
      var rCuv2=Math.min(3.0,17.5*sc), rIns2=Math.max(0.3,4*sc);
      var xIns2=((axC2<lP/2)?axC2+9.5:axC2-9.5)*sc;
      pdf.setDrawColor(200,0,0); pdf.setLineWidth(0.2);
      for (var chi2=0; chi2<pC2.length; chi2++) {
        var cyC2=py+pC2[chi2]*sc;
        pdf.circle(px+axC2*sc,cyC2,rCuv2,'S');
        pdf.setDrawColor(0,140,0); pdf.setLineWidth(0.15);
        pdf.circle(px+xIns2,cyC2-22.5*sc,rIns2,'S');
        pdf.circle(px+xIns2,cyC2+22.5*sc,rIns2,'S');
        pdf.setDrawColor(200,0,0); pdf.setLineWidth(0.2);
      }
      if (pC2.length>0) {
        // Cote depuis le BAS de la porte (y=py+ph) jusqu'au CENTRE de chaque charnière
        // pC2[i] est la position Y depuis le HAUT → la hauteur depuis le bas = hP - pC2[i]
        // Ordre : la charnière la plus haute (grande valeur) est la plus éloignée de la porte
        //         la charnière la plus basse (petite valeur) est la plus proche de la porte
        // Positionnement spécial : texte à 1mm à droite de la ligne (pas collé dessus)
        var nbCh = pC2.length;
        for (var chCot=0; chCot<nbCh; chCot++) {
          var yCentre = py + pC2[chCot]*sc;
          var offsetX = 2 + (nbCh - 1 - chCot) * 4;
          var xLigne = px + pw + offsetX + 4; // position de la ligne verticale (même calcul que cotePDF avec off=4)
          // Dessin manuel : lignes pointillées + ligne verticale + flèches
          pdf.setDrawColor(200,0,0); pdf.setTextColor(200,0,0);
          pdf.setLineWidth(0.15); pdf.setFontSize(3.8);
          pdf.setLineDash([0.6,0.6],0);
          pdf.line(px+pw+offsetX, yCentre, xLigne, yCentre);
          pdf.line(px+pw+offsetX, py+ph,  xLigne, py+ph);
          pdf.setLineDash([],0);
          pdf.line(xLigne, yCentre, xLigne, py+ph);
          var arr2 = 1.2;
          pdf.line(xLigne, yCentre, xLigne-arr2*0.6, yCentre+arr2);
          pdf.line(xLigne, yCentre, xLigne+arr2*0.6, yCentre+arr2);
          pdf.line(xLigne, py+ph,   xLigne-arr2*0.6, py+ph-arr2);
          pdf.line(xLigne, py+ph,   xLigne+arr2*0.6, py+ph-arr2);
          // Texte à 1mm à droite de la ligne verticale, centré verticalement
          pdf.text(formatMm(hP - pC2[chCot]) + 'mm', xLigne + 1, (yCentre + py+ph)/2 + 1.2, { angle:90, align:'center' });
        }
        pdf.setTextColor(0,0,0);
      }

      // ── LÉGENDE en haut à droite (hors de la porte) ──
      var entriesD = [
        {color:[200,0,0],  label:'Cuvette charnière Ø35'},
        {color:[0,140,0],  label:'Insert Ø8'},
        {color:[200,80,0], label:'Chant plaqué'}
      ];
      legendePDF(entriesD);
    }

    // ────────────────────────────────────────────────────────
    // CONTOUR + COTES (toutes pièces sauf panneau)
    // ────────────────────────────────────────────────────────
    if (type !== 'panneau') {
      var chG=false,chD=false,chH=false,chB=false;
      if (type==='porte'||type==='tiroir') { chG=chD=chH=chB=true; }
      else if (type==='lateral'||type==='montant') {
        var eD2=(type==='lateral')&&nomR.indexOf('droit')>-1;
        if (!eD2&&!isFaceB) chG=true; else chD=true;
      }
      else if (type==='etagere') { chD=true; }
      pdf.setLineWidth(0.35);
      pdf.setDrawColor(chH?200:20,chH?80:20,chH?0:20); pdf.line(px,py,px+pw,py);
      pdf.setDrawColor(chB?200:20,chB?80:20,chB?0:20); pdf.line(px,py+ph,px+pw,py+ph);
      pdf.setDrawColor(chG?200:20,chG?80:20,chG?0:20); pdf.line(px,py,px,py+ph);
      pdf.setDrawColor(chD?200:20,chD?80:20,chD?0:20); pdf.line(px+pw,py,px+pw,py+ph);
      pdf.setDrawColor(20,20,20);
      cotePDF(px,py,px+pw,py,lP+'mm','top',180,0,0);
      cotePDF(px,py,px,py+ph,hP+'mm','left',180,0,0);
    }
  }

  // ── Grouper les pièces par meuble ────────────────────────────
  var groups = {}, order = [];
  for (var pi = 0; pi < pieces.length; pi++) {
    var it = pieces[pi], mK = it.meubleIdx || 0;
    if (!groups[mK]) { groups[mK] = { nom: it.meuble || 'Meuble', items: [] }; order.push(mK); }
    if (it.type === 'porte' && it.p.nombre >= 2) {
      var nP = Math.floor(it.p.nombre / 2);
      groups[mK].items.push({ item: it, sensForce: 'gauche', nbAffiche: nP });
      groups[mK].items.push({ item: it, sensForce: 'droite',  nbAffiche: nP });
      if (it.p.nombre % 2 !== 0) groups[mK].items.push({ item: it, sensForce: 'gauche', nbAffiche: 1 });
    } else if (it.type === 'montant') {
      if (it._montantType === 'etagere') {
        // Petit montant étagère : 1 seule face (tourillons haut/bas, symétrique)
        groups[mK].items.push({ item: it, sensForce: null, nbAffiche: it.p.nombre });
      } else {
        // Montant plein : 2 faces — Face A (rainure/perçages gauche) et Face B (miroir)
        groups[mK].items.push({ item: it, sensForce: 'faceA', nbAffiche: it.p.nombre });
        groups[mK].items.push({ item: it, sensForce: 'faceB', nbAffiche: it.p.nombre });
      }
    } else {
      groups[mK].items.push({ item: it, sensForce: null, nbAffiche: it.p.nombre });
    }
  }

  // ── Boucle pages ─────────────────────────────────────────────
  // -- Page de couverture : vue eclatee + 3D si disponible --
  // Chercher l'image 3D dans les meubles concernes par ce PDF
  var image3D = null;
  for (var mi0 = 0; mi0 < window._meubles.length; mi0++) {
    if (window._meubles[mi0].image3D) {
      image3D = window._meubles[mi0].image3D;
      break;
    }
  }
  // Si on genere le PDF pour un meuble specifique, chercher dans ce meuble
  if (nomMeuble) {
    for (var mi0b = 0; mi0b < window._meubles.length; mi0b++) {
      if (window._meubles[mi0b].nom === nomMeuble && window._meubles[mi0b].image3D) {
        image3D = window._meubles[mi0b].image3D;
        break;
      }
    }
  }

  if (image3D) {
    // Page de couverture pleine page avec l'image
    pdf.setFillColor(30, 30, 30); pdf.rect(0, 0, PW, 8, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
    pdf.text('THE WOODER — ' + titreDoc, mg, 5.5);
    pdf.text('Vue d\'ensemble', PW - mg, 5.5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
    // Inserer l'image sur toute la page (sous le header)
    try {
      pdf.addImage(image3D, 'JPEG', mg, 12, PW - 2 * mg, PH - 14);
    } catch(e) {
      console.warn('Impossible d\'inserer l\'image 3D:', e);
    }
    pdf.addPage();
  }

  // ── Page feuille de débit ─────────────────────────────────────
  var opti19p = window._opti19, opti8p = window._opti8;
  if (opti19p || opti8p) {
    // Si pas d'image3D, la première page n'a pas encore été créée — on l'utilise directement
    // Si image3D existait, addPage() a déjà été appelé → on est sur une page vierge
    if (!image3D) {
      // page 1 déjà créée par new jsPDFLib → on dessine directement dessus
    }
    pdf.setFillColor(30,30,30); pdf.rect(0,0,PW,8,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
    pdf.text('THE WOODER — ' + titreDoc, mg, 5.5);
    pdf.text('Feuille de débit', PW-mg, 5.5, { align:'right' });
    pdf.setTextColor(0,0,0);

    // Sous-titre
    var nbTotD = (opti19p ? opti19p.nbPanneaux : 0) + (opti8p ? opti8p.nbPanneaux : 0);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(5); pdf.setTextColor(80,80,80);
    pdf.text('Format brut : ' + PANN_W + ' × ' + PANN_H + ' mm  —  ' + nbTotD + ' panneau' + (nbTotD>1?'x':'') + ' total', mg, 13);
    // Légende chant
    pdf.setDrawColor(200,80,0); pdf.setLineWidth(0.6);
    pdf.line(PW-mg-55, 12, PW-mg-45, 12);
    pdf.setFontSize(4); pdf.setTextColor(200,80,0);
    pdf.text('= arête à chanter', PW-mg-43, 13);
    pdf.setTextColor(0,0,0);

    var colorsD = [
      [212,232,212],[212,212,232],[232,212,212],[232,232,212],
      [212,232,232],[232,212,232],[240,216,192],[192,216,240],
      [224,240,212],[240,224,212]
    ];

    // Calculer chant par nom de pièce pour la feuille de débit
    var prof0d = parseFloat(document.getElementById('profondeur').value) || 600;
    var chantMap = {};
    for (var cdi = 0; cdi < items.length; cdi++) {
      var itd = items[cdi], pd2 = itd.p, td = itd.type;
      var profD = itd.prof || prof0d;
      var descD = '';
      if (td === 'porte' || td === 'tiroir')  descD = '4cotes';
      else if (td === 'etagere')              descD = 'bas';
      else if (td === 'lateral' || td === 'montant') descD = 'gauche';
      else if (td === 'panneau')              descD = 'bas';
      if (descD) chantMap[pd2.designation] = { desc: descD, type: td };
    }

    function dessinerDebit(res, label, yStart, couleurTitre) {
      pdf.setFont('helvetica','bold'); pdf.setFontSize(5.5);
      pdf.setTextColor(couleurTitre[0], couleurTitre[1], couleurTitre[2]);
      pdf.text('▸  Panneaux ' + label + '  —  ' + res.nbPanneaux + ' panneau' + (res.nbPanneaux>1?'x':'') + '  —  ' + res.tauxChute + '% chute', mg, yStart);
      yStart += 3;

      var nbShow = Math.min(res.nbPanneaux, 4);
      var scD = Math.min(
        (PW - 2*mg - (nbShow-1)*5) / (nbShow * PANN_W),
        (PH - yStart - 14) / PANN_H,
        0.052
      );
      var panWD = Math.round(PANN_W * scD);
      var panHD = Math.round(PANN_H * scD);
      var totalW = nbShow * panWD + (nbShow-1) * 5;
      var startX = mg + (PW - 2*mg - totalW) / 2;

      for (var pdx = 0; pdx < nbShow; pdx++) {
        var poxD = startX + pdx * (panWD + 5);
        var poyD = yStart;

        // Fond panneau
        pdf.setFillColor(252,251,249); pdf.setDrawColor(160,160,160); pdf.setLineWidth(0.25);
        pdf.rect(poxD, poyD, panWD, panHD, 'FD');

        // Numéro panneau
        pdf.setFont('helvetica','bold'); pdf.setFontSize(4); pdf.setTextColor(100,80,60);
        pdf.text(label + ' P' + (pdx+1), poxD+1.5, poyD+4);

        // Pièces placées
        if (res.panneaux[pdx]) {
          for (var ppi = 0; ppi < res.panneaux[pdx].pieces.length; ppi++) {
            var pcp = res.panneaux[pdx].pieces[ppi];
            var pxD = poxD + pcp.x * scD;
            var pyD = poyD + pcp.y * scD;
            var pwD = Math.max(1, pcp.l * scD);
            var phD = Math.max(1, pcp.h * scD);
            var col3 = colorsD[ppi % colorsD.length];
            pdf.setFillColor(col3[0],col3[1],col3[2]);
            pdf.setDrawColor(0,0,0); pdf.setLineWidth(0.12);
            pdf.rect(pxD, pyD, pwD, phD, 'FD');

            // Chant sur la pièce
            var nomP = pcp.nom || '';
            var chI = chantMap[nomP];
            // fallback par mot-clé si nom exact pas trouvé
            if (!chI) {
              var nl = nomP.toLowerCase();
              var td2 = nl.indexOf('lat') > -1 || nl.indexOf('cot') > -1 ? 'lateral'
                      : nl.indexOf('mont') > -1 ? 'montant'
                      : nl.indexOf('porte') > -1 ? 'porte'
                      : nl.indexOf('etag') > -1 ? 'etagere'
                      : nl.indexOf('tiroir') > -1 ? 'tiroir'
                      : nl.indexOf('panneau') > -1 || nl.indexOf('sup') > -1 || nl.indexOf('inf') > -1 ? 'panneau'
                      : null;
              if (td2) chI = { desc: td2==='porte'||td2==='tiroir' ? '4cotes' : td2==='etagere'||td2==='panneau' ? 'bas' : 'gauche', type: td2 };
            }
            if (chI) {
              pdf.setDrawColor(200,80,0); pdf.setLineWidth(0.5);
              if (chI.desc === '4cotes') {
                pdf.line(pxD,pyD,pxD+pwD,pyD);
                pdf.line(pxD,pyD+phD,pxD+pwD,pyD+phD);
                pdf.line(pxD,pyD,pxD,pyD+phD);
                pdf.line(pxD+pwD,pyD,pxD+pwD,pyD+phD);
              } else if (chI.desc === 'bas') {
                pdf.line(pxD,pyD+phD,pxD+pwD,pyD+phD);
              } else {
                pdf.line(pxD,pyD,pxD,pyD+phD);
              }
            }

            // Nom pièce si assez grand
            if (pwD > 6 && phD > 4) {
              pdf.setFont('helvetica','normal'); pdf.setFontSize(2.8); pdf.setTextColor(30,30,30);
              var nc = nomP.length > 14 ? nomP.substring(0,13)+'…' : nomP;
              if (pwD >= phD) {
                pdf.text(nc, pxD+pwD/2, pyD+phD/2+1, { align:'center' });
              } else {
                pdf.text(nc, pxD+pwD/2, pyD+phD/2+1, { angle:90, align:'center' });
              }
              pdf.setTextColor(0,0,0);
            }
          }
        }

        // Dimensions
        pdf.setFont('helvetica','normal'); pdf.setFontSize(3); pdf.setTextColor(150,150,150);
        pdf.text(PANN_W+'×'+PANN_H, poxD+panWD/2, poyD+panHD-1.5, { align:'center' });
        pdf.setTextColor(0,0,0);
      }

      if (res.nbPanneaux > 4) {
        pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(120,120,120);
        pdf.text('+ ' + (res.nbPanneaux-4) + ' panneau' + (res.nbPanneaux-4>1?'x':'') + ' supplémentaire' + (res.nbPanneaux-4>1?'s':''), mg, yStart + panHD + 4);
        pdf.setTextColor(0,0,0);
      }

      return yStart + panHD + 8;
    }

    var yAfter = 17;
    if (opti19p) yAfter = dessinerDebit(opti19p, '19 mm', yAfter, [139,105,20]);
    if (opti8p)  dessinerDebit(opti8p, '8 mm (fonds)', yAfter + 4, [34,85,170]);

    // ── Page tableau liste de débit complète ─────────────────
    pdf.addPage();
    pdf.setFillColor(30,30,30); pdf.rect(0,0,PW,8,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
    pdf.text('THE WOODER — ' + titreDoc, mg, 5.5);
    pdf.text('Liste de débit', PW-mg, 5.5, { align:'right' });
    pdf.setTextColor(0,0,0);

    // Construire la liste complète : pièces 19mm + fonds recalculés
    var cutPieces = (window._cutlistPieces || []).slice();
    // S'assurer que les fonds sont bien inclus (ils ont type fond_calc)
    // _cutlistPieces les contient déjà, mais on vérifie
    var hasFonds = cutPieces.some(function(p){ return p.epaisseur === FOND_EPAISSEUR; });
    if (!hasFonds && window._fonds) {
      window._fonds.forEach(function(f){
        cutPieces.push({ designation: f.designation, longueur: f.longueur, largeur: f.largeur, epaisseur: FOND_EPAISSEUR, nombre: f.nombre, materiau: 'Panneau ' + FOND_EPAISSEUR + 'mm (fond)', type: 'fond_calc' });
      });
    }

    if (cutPieces.length > 0) {
      // Colonnes : Désignation | Longueur | Largeur | Ép. | Qté | Matériau
      var cols  = [94, 26, 26, 16, 12, 40]; // largeurs mm
      var colX  = [mg];
      for (var ci2 = 1; ci2 < cols.length; ci2++) colX.push(colX[ci2-1] + cols[ci2-1]);
      var hdrs  = ['Désignation','Long.(mm)','Larg.(mm)','Ép.','Qté','Matériau'];
      var rH    = 5.5;
      var yT    = 13;

      function debitHeader() {
        pdf.setFillColor(30,30,30);
        pdf.rect(mg, yT, PW-2*mg, rH, 'F');
        pdf.setFont('helvetica','bold'); pdf.setFontSize(4.5); pdf.setTextColor(255,255,255);
        for (var h = 0; h < hdrs.length; h++) pdf.text(hdrs[h], colX[h]+1.5, yT+3.8);
        pdf.setTextColor(0,0,0);
        yT += rH;
      }
      debitHeader();

      var lastEp = null;
      pdf.setFont('helvetica','normal'); pdf.setFontSize(4.2);
      for (var ri3 = 0; ri3 < cutPieces.length; ri3++) {
        var pc = cutPieces[ri3];

        // Séparateur de groupe : ep.fond = fonds, tout le reste = panneaux bois
        var grp = (pc.epaisseur === FOND_EPAISSEUR) ? FOND_EPAISSEUR : 19;
        if (grp !== lastEp) {
          if (lastEp !== null) {
            pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.3);
            pdf.line(mg, yT, PW-mg, yT); yT += 1;
          }
          var secColor = grp === 19 ? [240,230,210] : [210,225,245];
          pdf.setFillColor(secColor[0],secColor[1],secColor[2]);
          pdf.rect(mg, yT, PW-2*mg, rH-0.5, 'F');
          pdf.setFont('helvetica','bold'); pdf.setFontSize(4.5); pdf.setTextColor(30,30,30);
          var secLabel = grp === 19 ? 'Panneaux' : 'Panneaux ' + FOND_EPAISSEUR + ' mm — Fonds';
          pdf.text(secLabel, colX[0]+1.5, yT+3.5);
          yT += rH;
          pdf.setFont('helvetica','normal'); pdf.setFontSize(4.2);
          lastEp = grp;
        }

        // Nouvelle page si besoin
        if (yT + rH > PH - 8) {
          pdf.addPage();
          pdf.setFillColor(30,30,30); pdf.rect(0,0,PW,8,'F');
          pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
          pdf.text('THE WOODER — ' + titreDoc, mg, 5.5);
          pdf.text('Liste de débit (suite)', PW-mg, 5.5, { align:'right' });
          pdf.setTextColor(0,0,0);
          yT = 13;
          debitHeader();
          pdf.setFont('helvetica','normal'); pdf.setFontSize(4.2);
        }

        // Alternance fond lignes
        if (ri3 % 2 === 0) {
          pdf.setFillColor(248,246,242);
          pdf.rect(mg, yT, PW-2*mg, rH, 'F');
        }

        // Contenu ligne
        pdf.setTextColor(20,20,20);
        pdf.text(pc.designation.substring(0,38), colX[0]+1.5, yT+3.8);
        pdf.setFont('helvetica','bold');
        pdf.text(String(pc.longueur), colX[1]+cols[1]/2, yT+3.8, { align:'center' });
        pdf.text(String(pc.largeur),  colX[2]+cols[2]/2, yT+3.8, { align:'center' });
        pdf.setFont('helvetica','normal');
        pdf.text(String(pc.epaisseur), colX[3]+cols[3]/2, yT+3.8, { align:'center' });
        pdf.setFont('helvetica','bold'); pdf.setTextColor(pc.epaisseur===FOND_EPAISSEUR?34:20, pc.epaisseur===FOND_EPAISSEUR?85:20, pc.epaisseur===FOND_EPAISSEUR?170:20);
        pdf.text(String(pc.nombre),    colX[4]+cols[4]/2, yT+3.8, { align:'center' });
        pdf.setFont('helvetica','normal'); pdf.setTextColor(100,100,100);
        pdf.text(pc.materiau || '', colX[5]+1.5, yT+3.8);

        // Bordure ligne
        pdf.setDrawColor(220,215,210); pdf.setLineWidth(0.15);
        pdf.rect(mg, yT, PW-2*mg, rH);

        pdf.setTextColor(0,0,0);
        yT += rH;
      }

      // Ligne total
      yT += 1;
      var tot19 = cutPieces.filter(function(p){return p.epaisseur!==FOND_EPAISSEUR;}).reduce(function(s,p){return s+p.nombre;},0);
      var tot8  = cutPieces.filter(function(p){return p.epaisseur===FOND_EPAISSEUR; }).reduce(function(s,p){return s+p.nombre;},0);
      var surfTot = cutPieces.reduce(function(s,p){return s+(p.longueur*p.largeur*p.nombre)/1e6;},0);
      pdf.setFillColor(30,30,30); pdf.rect(mg, yT, PW-2*mg, rH+1, 'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(4.5); pdf.setTextColor(255,255,255);
      pdf.text(cutPieces.length + ' références  —  ' + tot19 + ' pièces 19mm  —  ' + tot8 + ' pièces ' + FOND_EPAISSEUR + 'mm  —  Surface totale : ' + surfTot.toFixed(3) + ' m²', mg+2, yT+4);
    }

    pdf.addPage(); // page suivante = plans de fabrication
  } else if (image3D) {
    // Image 3D mais pas d'optimisation : on ajoute quand même une page
    pdf.addPage();
  }
  // Si ni image3D ni opti : page 1 vierge → titrePage() dessine dessus directement

  titrePage(0);
  var pageCount = 0;

  for (var mi3 = 0; mi3 < order.length; mi3++) {
    var gr = groups[order[mi3]];
    if (mi3 > 0) {
      pdf.addPage(); pageCount++;
      pdf.setFillColor(20,20,20); pdf.rect(0,0,PW,PH,'F');
      pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(18);
      pdf.text(gr.nom.toUpperCase(), PW/2, PH/2-8, { align:'center' });
      pdf.addPage(); pageCount++; titrePage(pageCount);
    }

    // Séparer les panneaux (vue paysage) des autres pièces (vue portrait)
    // Panneaux : layout 1 colonne × 2 rangées (289×93mm par cellule) pour maximiser la largeur
    // Autres   : layout 2 colonnes × 1 rangée (136×186mm par cellule) pour garder la hauteur
    var panneauxGr = [], autresGr = [];
    for (var sg = 0; sg < gr.items.length; sg++) {
      if (gr.items[sg].item.type === 'panneau') panneauxGr.push(gr.items[sg]);
      else autresGr.push(gr.items[sg]);
    }

    // ── 1. Dessin des PANNEAUX (layout pleine largeur, 1col × 2rows) ──
    if (panneauxGr.length > 0) {
      var nCp = 1, nRp = 2;
      var cWp = (PW - (nCp + 1) * mg) / nCp;      // ≈ 281mm
      var cHp = (PH - (nRp + 1) * mg - 8) / nRp;  // ≈ 90mm
      var cellIdxP = 0;
      for (var cip = 0; cip < panneauxGr.length; cip++) {
        var colP = cellIdxP % nCp, rowP = Math.floor(cellIdxP / nCp) % nRp;
        if (cellIdxP > 0 && cellIdxP % (nCp * nRp) === 0) { pdf.addPage(); pageCount++; titrePage(pageCount); }
        var cellP = panneauxGr[cip];
        cellP.item._sensForce  = cellP.sensForce;
        cellP.item._nbAffiche  = cellP.nbAffiche;
        dessinerPDF(cellP.item, mg + colP * (cWp + mg), 8 + mg + rowP * (cHp + mg), cWp, cHp);
        cellP.item._sensForce  = null;
        cellP.item._nbAffiche  = null;
        cellIdxP++;
      }
      // Si on a dessiné au moins un panneau et qu'il reste des pièces non-panneau à dessiner, changer de page
      if (autresGr.length > 0) {
        pdf.addPage(); pageCount++; titrePage(pageCount);
      }
    }

    // ── 2. Dessin des AUTRES pièces (layout 2col × 1row portrait) ──
    var cellIdx = 0;
    for (var ci = 0; ci < autresGr.length; ci++) {
      var col = cellIdx % nC, row = Math.floor(cellIdx / nC) % nR;
      if (cellIdx > 0 && cellIdx % (nC * nR) === 0) { pdf.addPage(); pageCount++; titrePage(pageCount); }
      var cell = autresGr[ci];
      cell.item._sensForce  = cell.sensForce;
      cell.item._nbAffiche  = cell.nbAffiche;
      dessinerPDF(cell.item, mg + col * (cW + mg), 8 + mg + row * (cH + mg), cW, cH);
      cell.item._sensForce  = null;
      cell.item._nbAffiche  = null;
      cellIdx++;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PAGES TIROIRS BOIS — Plans de fabrication caisson
  // ════════════════════════════════════════════════════════════════
  var tiroirsDets = window._tiroirsDets || [];
  var cfgTir = getCoulisseConfig();
  if (tiroirsDets.length > 0 && cfgTir.typeTir === 'bois') {

    // Page de séparation
    pdf.addPage(); pageCount++;
    pdf.setFillColor(20,20,20); pdf.rect(0,0,PW,PH,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(18);
    pdf.text('TIROIRS BOIS', PW/2, PH/2-14, { align:'center' });
    pdf.setFontSize(10); pdf.setFont('helvetica','normal');
    pdf.text(cfgTir.nom + ' — Épaisseur joues : ' + cfgTir.epJoue + ' mm', PW/2, PH/2+2, { align:'center' });
    pdf.text(tiroirsDets.length + ' tiroir(s)', PW/2, PH/2+14, { align:'center' });
    pdf.setTextColor(0,0,0);

    for (var tdi = 0; tdi < tiroirsDets.length; tdi++) {
      var td = tiroirsDets[tdi];
      if (!td.pieces || td.pieces.length === 0) continue;

      var epJ = cfgTir.epJoue || 15;
      var epFT = cfgTir.epFond || 5;
      var hCais = td.hCaisson || (td.hFacade - 25);
      var profT = td.lonJoue || td.profTiroir;  // longueur joue (Tandem: NL - 10 - epDos)
      var profTirTotal = td.profTiroir;          // profondeur totale (NL)
      var largNette = td.largInt - 2 * epJ;
      var fondSur = td.fondSureleve || 0;
      var rainPos = td.rainurePos || 12;  // position rainure fond depuis le bas de la joue
      var rainLarg = epFT + 1;

      // ── PAGE 1 : Vue assemblée de dessus + vue de face ──
      pdf.addPage(); pageCount++; titrePage(pageCount);

      // Sous-titre
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(30,30,30);
      pdf.text('Tiroir — ' + td.p.designation + '  (façade ' + td.hFacade + '×' + td.lFacade + 'mm — colonne ' + td.largColonne + 'mm)', mg, 16);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(6); pdf.setTextColor(100,100,100);
      pdf.text(cfgTir.nom + ' — Jeu latéral ' + cfgTir.jeuLat + 'mm/côté — Ép. joue ' + epJ + 'mm — Fond ' + epFT + 'mm — Rainure à ' + rainPos + 'mm du bas', mg, 21);
      pdf.setTextColor(0,0,0);

      // ─── VUE DE DESSUS (haut de la page) ───
      var vueMgT = 30, vueMgL = 40;
      var maxWvue = PW - 2*vueMgL, maxHvue = 75;
      var scVue = Math.min(maxWvue / td.largInt, maxHvue / profT);
      var vW = td.largInt * scVue, vH = profT * scVue;
      var vX = vueMgL + (maxWvue - vW)/2, vY = 28;

      pdf.setFont('helvetica','bold'); pdf.setFontSize(5); pdf.setTextColor(100,80,60);
      pdf.text('VUE DE DESSUS', vX, vY - 2);
      pdf.setTextColor(0,0,0);

      // Fond (rectangle intérieur gris clair)
      pdf.setFillColor(245,242,238); pdf.setDrawColor(180,170,155); pdf.setLineWidth(0.15);
      pdf.rect(vX + epJ*scVue, vY + epJ*scVue, largNette*scVue, (profT-2*epJ)*scVue, 'FD');

      // Joue gauche
      pdf.setFillColor(220,210,195); pdf.setDrawColor(80,60,30); pdf.setLineWidth(0.3);
      pdf.rect(vX, vY, epJ*scVue, vH, 'FD');
      // Joue droite
      pdf.rect(vX + vW - epJ*scVue, vY, epJ*scVue, vH, 'FD');
      // Devant
      pdf.setFillColor(210,200,180);
      pdf.rect(vX + epJ*scVue, vY, largNette*scVue, epJ*scVue, 'FD');
      // Dos
      pdf.setFillColor(200,195,180);
      pdf.rect(vX + epJ*scVue, vY + vH - epJ*scVue, largNette*scVue, epJ*scVue, 'FD');

      // Étiquettes
      pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(60,40,10);
      pdf.text('Joue G', vX + epJ*scVue*0.5, vY + vH/2, { align:'center', angle:90 });
      pdf.text('Joue D', vX + vW - epJ*scVue*0.5, vY + vH/2, { align:'center', angle:90 });
      pdf.text('Devant', vX + vW/2, vY + epJ*scVue*0.6, { align:'center' });
      pdf.text('Dos', vX + vW/2, vY + vH - epJ*scVue*0.4, { align:'center' });
      pdf.text('Fond', vX + vW/2, vY + vH/2, { align:'center' });
      pdf.setTextColor(0,0,0);

      // Cotes vue de dessus
      cotePDF(vX, vY, vX + vW, vY, formatMm(td.largInt) + 'mm', 'top', 180,0,0);
      cotePDF(vX, vY, vX, vY + vH, formatMm(profT) + 'mm', 'left', 180,0,0);
      cotePDF(vX + vW, vY, vX + vW, vY + vH, formatMm(profT) + 'mm', 'right', 0,80,200);
      // Cote largeur nette
      cotePDF(vX + epJ*scVue, vY + vH, vX + vW - epJ*scVue, vY + vH, formatMm(largNette) + 'mm', 'bottom', 0,80,200);
      // Cote épaisseur joue
      cotePDF(vX, vY + vH, vX + epJ*scVue, vY + vH, formatMm(epJ) + 'mm', 'bottom', 120,100,60);

      // ─── VUE DE FACE (bas de la page) ───
      var vueFY = vY + vH + 30;
      var maxHface = PH - vueFY - 20;
      var scFace = Math.min(maxWvue / td.largInt, maxHface / hCais);
      var fW = td.largInt * scFace, fH = hCais * scFace;
      var fX = vueMgL + (maxWvue - fW)/2;

      pdf.setFont('helvetica','bold'); pdf.setFontSize(5); pdf.setTextColor(100,80,60);
      pdf.text('VUE DE FACE', fX, vueFY - 2);
      pdf.setTextColor(0,0,0);

      var is4R = td.rainure4Cotes || false;
      var hDevantAff = td.pieces[1] ? td.pieces[1].w : hCais;

      if (is4R) {
        // ── BILLES STANDARD : devant/dos = même hauteur que joues ──
        // Fond (arrière-plan)
        pdf.setFillColor(245,242,238); pdf.setDrawColor(180,170,155); pdf.setLineWidth(0.15);
        pdf.rect(fX + epJ*scFace, vueFY, largNette*scFace, fH, 'FD');
        // Joues
        pdf.setFillColor(220,210,195); pdf.setDrawColor(80,60,30); pdf.setLineWidth(0.3);
        pdf.rect(fX, vueFY, epJ*scFace, fH, 'FD');
        pdf.rect(fX + fW - epJ*scFace, vueFY, epJ*scFace, fH, 'FD');
        // Devant (pleine hauteur, même que les joues)
        pdf.setFillColor(210,200,180); pdf.setDrawColor(80,60,30); pdf.setLineWidth(0.3);
        pdf.rect(fX + epJ*scFace, vueFY, largNette*scFace, fH, 'FD');
        // Rainure fond visible dans les joues ET le devant
        var yRainure = vueFY + fH - rainPos*scFace;
        var profRF = (td.profRainureFond || 5) * scFace;
        var rainH = rainLarg * scFace;
        pdf.setFillColor(200,240,240); pdf.setDrawColor(0,160,160); pdf.setLineWidth(0.2);
        // Joue gauche
        pdf.rect(fX + epJ*scFace - profRF, yRainure - rainH, profRF, rainH, 'FD');
        // Joue droite
        pdf.rect(fX + fW - epJ*scFace, yRainure - rainH, profRF, rainH, 'FD');
        // Devant (rainure horizontale en bas du devant)
        pdf.rect(fX + epJ*scFace, yRainure - rainH, largNette*scFace, rainH, 'S');
        // Étiquettes
        pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(60,40,10);
        pdf.text('Joue', fX + epJ*scFace*0.5, vueFY + fH/2, { align:'center', angle:90 });
        pdf.text('Joue', fX + fW - epJ*scFace*0.5, vueFY + fH/2, { align:'center', angle:90 });
        pdf.text('Devant', fX + fW/2, vueFY + fH*0.35, { align:'center' });
        pdf.setTextColor(0,0,0);
        // Cotes
        cotePDF(fX, vueFY, fX + fW, vueFY, formatMm(td.largInt) + 'mm', 'top', 180,0,0);
        cotePDF(fX, vueFY, fX, vueFY + fH, formatMm(hCais) + 'mm', 'left', 180,0,0);
        cotePDF(fX + fW + 4, yRainure, fX + fW + 4, vueFY + fH, formatMm(rainPos) + 'mm', 'right', 0,160,160);
      } else {
        // ── TANDEM : devant plus court, posé sur le fond ──
        // Fond visible entre les joues
        var yFondTop = vueFY + fH - (rainPos + epFT) * scFace;
        var hFondPx = epFT * scFace;
        pdf.setFillColor(235,230,220); pdf.setDrawColor(150,140,120); pdf.setLineWidth(0.2);
        pdf.rect(fX + epJ*scFace, yFondTop, largNette*scFace, hFondPx, 'FD');
        // Joues
        pdf.setFillColor(220,210,195); pdf.setDrawColor(80,60,30); pdf.setLineWidth(0.3);
        pdf.rect(fX, vueFY, epJ*scFace, fH, 'FD');
        pdf.rect(fX + fW - epJ*scFace, vueFY, epJ*scFace, fH, 'FD');
        // Devant (posé sur le fond, plus court)
        pdf.setFillColor(210,200,180); pdf.setDrawColor(80,60,30); pdf.setLineWidth(0.3);
        pdf.rect(fX + epJ*scFace, vueFY, largNette*scFace, hDevantAff*scFace, 'FD');
        // Rainure fond (uniquement dans les joues)
        var yRainure = vueFY + fH - rainPos*scFace;
        var profRF = (td.profRainureFond || 5) * scFace;
        var rainH = rainLarg * scFace;
        pdf.setFillColor(200,240,240); pdf.setDrawColor(0,160,160); pdf.setLineWidth(0.2);
        pdf.rect(fX + epJ*scFace - profRF, yRainure - rainH, profRF, rainH, 'FD');
        pdf.rect(fX + fW - epJ*scFace, yRainure - rainH, profRF, rainH, 'FD');
        // Étiquettes
        pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(60,40,10);
        pdf.text('Joue', fX + epJ*scFace*0.5, vueFY + fH/2, { align:'center', angle:90 });
        pdf.text('Joue', fX + fW - epJ*scFace*0.5, vueFY + fH/2, { align:'center', angle:90 });
        pdf.text('Devant', fX + fW/2, vueFY + hDevantAff*scFace*0.4, { align:'center' });
        pdf.setTextColor(150,140,120);
        pdf.text('Fond', fX + fW/2, yFondTop + hFondPx*0.7, { align:'center' });
        pdf.setTextColor(0,0,0);
        // Cotes
        cotePDF(fX, vueFY, fX + fW, vueFY, formatMm(td.largInt) + 'mm', 'top', 180,0,0);
        cotePDF(fX, vueFY, fX, vueFY + fH, formatMm(hCais) + 'mm', 'left', 180,0,0);
        cotePDF(fX + fW + 4, vueFY, fX + fW + 4, vueFY + hDevantAff*scFace, formatMm(hDevantAff) + 'mm', 'right', 80,60,30);
        cotePDF(fX + fW + 9, yRainure, fX + fW + 9, vueFY + fH, formatMm(rainPos) + 'mm', 'right', 0,160,160);
      }

      // Zone coulisse sous le tiroir (Tandem : fond surélevé)
      if (fondSur > 0) {
        var ySur = vueFY + fH;
        var hSur = fondSur * scFace;
        pdf.setFillColor(230,225,215); pdf.setDrawColor(150,140,120); pdf.setLineWidth(0.2);
        pdf.rect(fX, ySur, fW, hSur, 'FD');
        // Hachures légères
        pdf.setDrawColor(180,170,150); pdf.setLineWidth(0.1);
        for (var hx = 0; hx < fW + hSur; hx += 3) {
          var x1h = fX + hx, y1h = ySur;
          var x2h = fX + hx - hSur, y2h = ySur + hSur;
          if (x1h > fX + fW) x1h = fX + fW;
          if (x2h < fX) { y2h = ySur + (hx); x2h = fX; }
          if (x2h > fX + fW) continue;
          pdf.line(x1h, y1h, x2h, y2h);
        }
        pdf.setFont('helvetica','normal'); pdf.setFontSize(3.5); pdf.setTextColor(120,100,60);
        pdf.text('Zone coulisse Tandem', fX + fW/2, ySur + hSur/2 + 1, { align:'center' });
        // Cote surélévation
        cotePDF(fX - 4, ySur, fX - 4, ySur + hSur, formatMm(fondSur) + 'mm', 'left', 120,100,60);
        // Cote hauteur totale (caisson + surélévation)
        cotePDF(fX - 9, vueFY, fX - 9, ySur + hSur, formatMm(hCais + fondSur) + 'mm', 'left', 100,80,60);
        pdf.setTextColor(0,0,0);
      }

      // Légende
      pdf.setFont('helvetica','normal'); pdf.setFontSize(4);
      pdf.setTextColor(0,160,160); pdf.text('Rainure fond ' + (td.profRainureFond||5) + '×' + rainLarg + 'mm (joues)', fX + fW + 5, yRainure - 2);
      if (fondSur > 0) {
        pdf.setTextColor(120,100,60); pdf.text('Coulisse invisible sous tiroir', fX + fW + 5, yRainure + 4);
      }
      pdf.setDrawColor(200,80,0); pdf.setLineWidth(0.5);
      pdf.line(PW-mg-50, vueFY - 2, PW-mg-42, vueFY - 2);
      pdf.setTextColor(200,80,0); pdf.text('= chant plaqué', PW-mg-40, vueFY - 1);
      pdf.setTextColor(0,0,0);

      // ── PAGE 2 : Pièces individuelles cotées ──
      pdf.addPage(); pageCount++; titrePage(pageCount);
      pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(30,30,30);
      pdf.text('Tiroir — ' + td.p.designation + ' — Pièces de caisson (×' + td.nb + ')', mg, 16);
      pdf.setTextColor(0,0,0);

      // Layout : 3 colonnes × 2 rangées
      var nColT = 3, nRowT = 2;
      var cWT = (PW - (nColT+1)*mg) / nColT;
      var cHT = (PH - 25 - (nRowT+1)*mg) / nRowT;
      var r4c = td.rainure4Cotes || false;
      var piecesDessin = [
        { nom: 'Joue (×' + (2*td.nb) + ')', l: td.pieces[0].l, w: td.pieces[0].w, chant: 'haut', rainure: true },
        { nom: 'Devant (×' + td.nb + ')',    l: td.pieces[1].l, w: td.pieces[1].w, chant: '4cotes', rainure: r4c },
        { nom: 'Dos (×' + td.nb + ')',       l: td.pieces[2].l, w: td.pieces[2].w, chant: 'aucun', rainure: r4c },
        { nom: 'Fond (×' + td.nb + ')',      l: td.pieces[3].l, w: td.pieces[3].w, chant: 'aucun', rainure: false, ep: epFT },
        { nom: 'Façade (×' + td.nb + ')',    l: td.lFacade, w: td.hFacade, chant: '4cotes', rainure: false, facade: true }
      ];

      for (var pdi = 0; pdi < piecesDessin.length; pdi++) {
        var pc = piecesDessin[pdi];
        var colT = pdi % nColT, rowT = Math.floor(pdi / nColT);
        var oxT = mg + colT * (cWT + mg);
        var oyT = 22 + rowT * (cHT + mg);

        // Cadre
        pdf.setDrawColor(200,200,200); pdf.setLineWidth(0.15);
        pdf.rect(oxT, oyT, cWT, cHT);

        // Titre pièce
        pdf.setFont('helvetica','bold'); pdf.setFontSize(6); pdf.setTextColor(30,30,30);
        pdf.text(pc.nom, oxT + 4, oyT + 7);
        var epAff = pc.ep || epJ;
        pdf.setFont('helvetica','normal'); pdf.setFontSize(4.5); pdf.setTextColor(100,100,100);
        pdf.text(formatMm(pc.l) + ' × ' + formatMm(pc.w) + ' × ' + formatMm(epAff) + ' mm', oxT + 4, oyT + 12);
        pdf.setTextColor(0,0,0);

        // Dessin de la pièce
        var mLp=16, mRp=16, mTp=18, mBp=14;
        var scP2 = Math.min((cWT-mLp-mRp)/pc.l, (cHT-mTp-mBp)/pc.w);
        var pwP2 = pc.l * scP2, phP2 = pc.w * scP2;
        var pxP2 = oxT + mLp + ((cWT-mLp-mRp) - pwP2)/2;
        var pyP2 = oyT + mTp + ((cHT-mTp-mBp) - phP2)/2;

        // Fond pièce
        pdf.setFillColor(pc.facade ? 240:252, pc.facade ? 235:250, pc.facade ? 225:247);
        pdf.setDrawColor(20,20,20); pdf.setLineWidth(0.3);
        pdf.rect(pxP2, pyP2, pwP2, phP2, 'FD');

        // Rainure fond (sur joues et devant)
        if (pc.rainure) {
          var yR = pyP2 + phP2 - rainPos*scP2;
          pdf.setDrawColor(0,160,160); pdf.setLineWidth(0.25);
          pdf.line(pxP2, yR, pxP2 + pwP2, yR);
          pdf.line(pxP2, yR - rainLarg*scP2, pxP2 + pwP2, yR - rainLarg*scP2);
          // Cote rainure
          cotePDF(pxP2+pwP2, yR, pxP2+pwP2, pyP2+phP2, formatMm(rainPos)+'mm', 'right', 0,160,160);
        }

        // Chant plaqué (trait orange épais)
        pdf.setLineWidth(0.5);
        if (pc.chant === '4cotes') {
          pdf.setDrawColor(200,80,0);
          pdf.rect(pxP2, pyP2, pwP2, phP2, 'S');
        } else if (pc.chant === 'haut') {
          pdf.setDrawColor(200,80,0);
          pdf.line(pxP2, pyP2, pxP2 + pwP2, pyP2); // bord haut seulement
        }

        // Cotes
        pdf.setDrawColor(20,20,20);
        cotePDF(pxP2, pyP2, pxP2 + pwP2, pyP2, pc.l + 'mm', 'top', 180,0,0);
        cotePDF(pxP2, pyP2, pxP2, pyP2 + phP2, pc.w + 'mm', 'left', 180,0,0);
      }
    }
  }

  // Si un callback est fourni (export ZIP multi-connecteurs), renvoyer le blob sans telecharger
  if (typeof arguments[1] === 'function') {
    arguments[1](pdf.output('blob'));
  } else {
    pdf.save('wooder-' + nomFichierPDF + '.pdf');
  }
}
