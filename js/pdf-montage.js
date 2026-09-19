/* ================================================================
   THE WOODER - pdf-montage.js   (v2 — géométrie EXACTE)
   ================================================================
   Notice de montage PDF style « prêt-à-poser » (façon IKEA).

   La géométrie est reconstruite à partir de l'ARBRE RÉEL du meuble
   (window._plan2dModele, ou window._wmcModeleDepuisItems en repli, ou
   un repli interne) : montants pleins / locaux, étagères par
   compartiment, fond par colonne, portes / tiroirs par colonne,
   plinthe. Aucune approximation « N étagères réparties ».

   Pages produites :
     1. Couverture (meuble fermé en iso + dimensions)
     2. Avant de commencer (sécurité)
     3. Pièces du meuble (inventaire numéroté)
     4. Outils & quincaillerie (repères A,B,C… + quantités exactes)
     5..N. Étapes numérotées (vue éclatée + flèches + zoom connecteur)
     N+1. Montage terminé

   Module AUTONOME (ses propres helpers de dessin). Ne modifie aucun
   pipeline de calcul, ne dépend pas des fonctions internes de
   pdf-plans.js.

   Globals lus (tous optionnels, lecture défensive) :
     window._itemsCache, _plan2dModele, _wmcModeleDepuisItems,
     _mXPos, _liaisons, _charnDets, _fonds, _meubles,
     _totalExc, _totalGou, _charnTotal, TYPE_CONNECTEUR

   Entrée : genererPlansMontagePDF(nomMeuble)
   ================================================================ */

(function (global) {
  'use strict';

  // ── Palette ─────────────────────────────────────────────────────
  var COL = {
    encre:   [28, 28, 30],
    bois:    [223, 197, 156],
    boisTop: [236, 214, 180],
    boisCote:[197, 167, 125],
    fond:    [188, 198, 208],
    porte:   [208, 212, 219],
    porteTop:[222, 226, 232],
    accent:  [200, 90, 30],
    accent2: [40, 120, 100],
    gris:    [120, 120, 125],
    grisClr: [241, 241, 243],
    ombre:   [205, 205, 208]
  };
  var C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);

  function fMm(v) {
    if (v == null || isNaN(v)) return '—';
    var r = Math.round(v * 10) / 10;
    if (Math.abs(r - Math.round(r)) < 0.05) return Math.round(r).toString();
    return r.toFixed(1).replace('.', ',');
  }
  function setDash(pdf, pat) {
    if (pdf.setLineDashPattern) pdf.setLineDashPattern(pat || [], 0);
    else if (pdf.setLineDash) pdf.setLineDash(pat || [], 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOTEUR ISOMÉTRIQUE
  // ═══════════════════════════════════════════════════════════════
  // x = largeur (0→L), y = profondeur (0→P, 0 = avant), z = hauteur (0→H).
  function makeIso(scale, ox, oy) {
    return {
      scale: scale, ox: ox, oy: oy,
      proj: function (x, y, z) {
        return { X: ox + (x - y) * C30 * scale, Y: oy + ((x + y) * S30 - z) * scale };
      }
    };
  }

  // Ajuste une projection iso pour faire tenir un nuage de boîtes dans rect.
  function fitBoxes(rect, boxes) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    boxes.forEach(function (b) {
      [b.x0, b.x0 + b.dx].forEach(function (X) {
        [b.y0, b.y0 + b.dy].forEach(function (Y) {
          [b.z0, b.z0 + b.dz].forEach(function (Z) {
            var px = (X - Y) * C30, py = (X + Y) * S30 - Z;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          });
        });
      });
    });
    var spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    var scale = Math.min(rect.w / spanX, rect.h / spanY);
    var ox = rect.x + (rect.w - spanX * scale) / 2 - minX * scale;
    var oy = rect.y + (rect.h - spanY * scale) / 2 - minY * scale;
    return makeIso(scale, ox, oy);
  }

  // Dessine une boîte. Faces visibles : dessus, avant, côté droit.
  function isoBox(pdf, iso, b) {
    var base = b.col, p = iso.proj;
    var x0 = b.x0, y0 = b.y0, z0 = b.z0, dx = b.dx, dy = b.dy, dz = b.dz;
    var A = p(x0,y0,z0), B = p(x0+dx,y0,z0), F = p(x0+dx,y0,z0+dz), E = p(x0,y0,z0+dz);
    var C = p(x0+dx,y0+dy,z0), G = p(x0+dx,y0+dy,z0+dz), H = p(x0,y0+dy,z0+dz);
    function shade(c, k) { return [Math.min(255,Math.round(c[0]*k)), Math.min(255,Math.round(c[1]*k)), Math.min(255,Math.round(c[2]*k))]; }
    function face(pts, c) {
      var arr = [];
      for (var i = 1; i < pts.length; i++) arr.push([pts[i].X - pts[i-1].X, pts[i].Y - pts[i-1].Y]);
      pdf.setFillColor(c[0], c[1], c[2]);
      pdf.setDrawColor(COL.encre[0], COL.encre[1], COL.encre[2]);
      pdf.setLineWidth(b.faint ? 0.15 : 0.3);
      pdf.lines(arr, pts[0].X, pts[0].Y, [1, 1], 'FD', true);
    }
    face([B, C, G, F], shade(base, 0.80));   // côté droit
    face([A, B, F, E], shade(base, 0.93));   // avant
    face([E, F, G, H], shade(base, 1.07));   // dessus
  }

  function fleche(pdf, x1, y1, x2, y2, col) {
    col = col || COL.accent;
    pdf.setDrawColor(col[0], col[1], col[2]); pdf.setLineWidth(0.7);
    setDash(pdf, [1.1, 0.9]); pdf.line(x1, y1, x2, y2); setDash(pdf, null);
    var a = Math.atan2(y2 - y1, x2 - x1), h = 3.4, w = 0.46;
    pdf.setFillColor(col[0], col[1], col[2]);
    pdf.triangle(x2, y2, x2 - h*Math.cos(a-w), y2 - h*Math.sin(a-w), x2 - h*Math.cos(a+w), y2 - h*Math.sin(a+w), 'F');
  }

  function badge(pdf, x, y, r, txt, col, txtCol) {
    col = col || COL.accent; txtCol = txtCol || [255, 255, 255];
    pdf.setFillColor(col[0], col[1], col[2]); pdf.setDrawColor(255,255,255); pdf.setLineWidth(0.4);
    pdf.circle(x, y, r, 'FD');
    pdf.setTextColor(txtCol[0], txtCol[1], txtCol[2]);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(r * 2.3);
    pdf.text(String(txt), x, y + r * 0.62, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PICTOGRAMMES OUTILS
  // ═══════════════════════════════════════════════════════════════
  function pictoOutil(pdf, type, cx, cy, s) {
    pdf.setDrawColor(COL.encre[0], COL.encre[1], COL.encre[2]);
    pdf.setFillColor(COL.encre[0], COL.encre[1], COL.encre[2]); pdf.setLineWidth(0.5);
    if (type === 'tournevis') {
      pdf.setLineWidth(0.7); pdf.line(cx - s*0.5, cy + s*0.5, cx + s*0.2, cy - s*0.2);
      pdf.setLineWidth(1.6); pdf.line(cx + s*0.15, cy - s*0.15, cx + s*0.5, cy - s*0.5);
    } else if (type === 'perceuse') {
      pdf.roundedRect(cx - s*0.55, cy - s*0.35, s*0.7, s*0.55, 1, 1, 'F');
      pdf.setLineWidth(1.1); pdf.line(cx + s*0.15, cy - s*0.08, cx + s*0.62, cy - s*0.08);
      pdf.setFillColor(COL.encre[0], COL.encre[1], COL.encre[2]);
      pdf.rect(cx - s*0.4, cy + s*0.2, s*0.18, s*0.4, 'F');
    } else if (type === 'maillet') {
      pdf.roundedRect(cx - s*0.55, cy - s*0.5, s*0.6, s*0.42, 1, 1, 'F');
      pdf.setLineWidth(1.4); pdf.line(cx - s*0.25, cy - s*0.05, cx + s*0.5, cy + s*0.6);
    } else if (type === 'equerre') {
      pdf.setLineWidth(1.4);
      pdf.line(cx - s*0.5, cy - s*0.5, cx - s*0.5, cy + s*0.5);
      pdf.line(cx - s*0.5, cy + s*0.5, cx + s*0.5, cy + s*0.5);
    } else if (type === 'crayon') {
      pdf.setLineWidth(1.3); pdf.line(cx - s*0.5, cy + s*0.5, cx + s*0.4, cy - s*0.4);
      pdf.triangle(cx + s*0.4, cy - s*0.4, cx + s*0.58, cy - s*0.18, cx + s*0.18, cy - s*0.58, 'F');
    } else if (type === 'metre') {
      pdf.roundedRect(cx - s*0.5, cy - s*0.3, s*0.65, s*0.6, 1.2, 1.2, 'S');
      pdf.setLineWidth(0.8); pdf.line(cx + s*0.15, cy + s*0.05, cx + s*0.6, cy + s*0.05);
    } else if (type === 'niveau') {
      pdf.roundedRect(cx - s*0.6, cy - s*0.18, s*1.2, s*0.36, 1, 1, 'S');
      pdf.setFillColor(120,200,120); pdf.circle(cx, cy, s*0.12, 'F');
    } else if (type === 'serrejoint') {
      // indispensable dès qu'il y a de la colle : c'est lui qui ferme le joint
      pdf.setLineWidth(1.2);
      pdf.line(cx - s*0.45, cy - s*0.55, cx - s*0.45, cy + s*0.55);   // dos
      pdf.line(cx - s*0.45, cy - s*0.55, cx + s*0.35, cy - s*0.55);   // mors fixe
      pdf.line(cx - s*0.45, cy + s*0.2,  cx + s*0.35, cy + s*0.2);    // mors mobile
      pdf.setLineWidth(0.8);
      pdf.line(cx + s*0.35, cy + s*0.2, cx + s*0.35, cy + s*0.6);     // vis
      pdf.line(cx + s*0.15, cy + s*0.6, cx + s*0.55, cy + s*0.6);     // poignée
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CATALOGUE DES CONNECTEURS
  // ═══════════════════════════════════════════════════════════════
  // Tout ce que la notice doit dire d'un assemblage tient ici. Avant, les
  // textes étaient écrits en dur pour l'excentrique : choisir du Cabineo ou
  // du Domino donnait quand même « verrouillez d'un quart de tour ». Une
  // notice qui décrit un autre assemblage que celui livré est pire qu'une
  // absence de notice — l'artisan la suit et abîme la pièce.
  //
  //   piece      : nom de la quincaillerie sur la liste
  //   symbole    : dessin utilisé (voir dessQuinc / zoomConnecteur)
  //   colle      : true = assemblage collé, donc DÉFINITIF
  //   demontable : true = le meuble se démonte sans rien casser
  //   serrage    : 'serre-joints' | 'auto' | null
  //   outils     : outils nécessaires AU MONTAGE (pas à l'usinage)
  //   preparer   : ce qu'on fait avant d'emboîter
  //   assembler  : ce qu'on fait pour fermer et bloquer le joint
  //
  // Les tailles d'embout et de clé ne sont volontairement PAS affirmées :
  // elles varient selon les références, et une cote fausse dans une notice
  // fait perdre plus de temps qu'une consigne qui renvoie au fabricant.
  var CONNECTEURS = {
    excentrique_tourillon: {
      nom: 'Excentrique + tourillon', symbole: 'excentrique', colle: false,
      demontable: true, serrage: null, outils: ['tournevis', 'maillet'],
      pieces: [{ label: 'Excentrique Ø15', type: 'excentrique', col: [200, 60, 30] },
               { label: 'Goujon Ø6 (pour excentrique)', type: 'goujon', col: [130, 132, 140] }],
      preparer: 'Enfoncez les tourillons dans les chants, puis logez les boîtiers ' +
                'excentriques dans les trous Ø15 des faces. La flèche gravée sur ' +
                'chaque excentrique doit pointer vers le chant à rejoindre.',
      assembler: 'Présentez les panneaux et engagez les tourillons à fond. Serrez ' +
                 'chaque excentrique d\'un quart de tour dans le sens horaire. ' +
                 'Vérifiez l\'équerrage AVANT de bloquer le dernier.'
    },
    cabineo_8: {
      nom: 'Cabineo 8', symbole: 'cabineo', colle: false, demontable: true,
      serrage: null, outils: ['perceuse'],
      pieces: [{ label: 'Connecteur Cabineo 8', type: 'cabineo', col: COL.accent }],
      preparer: 'Clipsez un Cabineo dans chaque poche fraisée. Il ne rentre que ' +
                'dans un sens : la tête vissable reste accessible.',
      assembler: 'Posez le panneau en face, alignez sur les trous Ø5 du chant, ' +
                 'puis vissez chaque Cabineo avec l\'embout Lamello fourni. ' +
                 'Serrez sans forcer : le connecteur tire le joint de lui-même.'
    },
    cabineo_12: {
      nom: 'Cabineo 12', symbole: 'cabineo', colle: false, demontable: true,
      serrage: null, outils: ['perceuse'],
      pieces: [{ label: 'Connecteur Cabineo 12', type: 'cabineo', col: COL.accent }],
      preparer: 'Clipsez un Cabineo dans chaque poche fraisée. Il ne rentre que ' +
                'dans un sens : la tête vissable reste accessible.',
      assembler: 'Posez le panneau en face, alignez sur les trous du chant, puis ' +
                 'vissez chaque Cabineo avec l\'embout Lamello fourni.'
    },
    clamex_p14: {
      nom: 'Clamex P-14', symbole: 'clamex', colle: false, demontable: true,
      serrage: null, outils: ['tournevis'],
      pieces: [{ label: 'Clamex P-14 (paire)', type: 'clamex', col: COL.accent }],
      preparer: 'Vissez une moitié de Clamex dans chaque rainure en P, une par ' +
                'panneau. Les deux moitiés doivent se faire face.',
      assembler: 'Emboîtez les deux panneaux à la main jusqu\'au contact, puis ' +
                 'verrouillez chaque Clamex en tournant son levier d\'un demi-tour ' +
                 'avec la clé Allen, par le trou d\'accès. Un clic franc = verrouillé.'
    },
    clamex_biscuit: {
      nom: 'Clamex P-14 + biscuit', symbole: 'clamex', colle: false, demontable: true,
      serrage: null, outils: ['tournevis'],
      pieces: [{ label: 'Clamex P-14 (paire)', type: 'clamex', col: COL.accent },
               { label: 'Biscuit n°20', type: 'biscuit', col: [202, 172, 112] }],
      preparer: 'Vissez les Clamex aux extrémités du joint et placez les biscuits ' +
                'à sec dans les rainures du centre : ils alignent, les Clamex serrent.',
      assembler: 'Emboîtez, puis verrouillez les Clamex à la clé Allen par les ' +
                 'trous d\'accès. Les biscuits centraux ne se collent pas : ils ' +
                 'gardent le joint aligné sur toute sa longueur.'
    },
    lamello_biscuit: {
      nom: 'Biscuit Lamello', symbole: 'biscuit', colle: true, demontable: false,
      serrage: 'serre-joints', outils: ['maillet', 'equerre'],
      pieces: [{ label: 'Biscuit n°20', type: 'biscuit', col: [202, 172, 112] },
               { label: 'Colle à bois D3', type: 'colle', col: COL.gris }],
      preparer: 'Faites d\'abord un montage À BLANC, sans colle, pour vérifier que ' +
                'tout tombe juste. Préparez les serre-joints avant d\'encoller : ' +
                'passé l\'encollage, vous avez une dizaine de minutes.',
      assembler: 'Encollez rainures et biscuits, emboîtez, serrez aux serre-joints ' +
                 'et contrôlez l\'équerrage aux diagonales pendant le serrage. ' +
                 'ASSEMBLAGE DÉFINITIF : le meuble ne se démontera plus.'
    },
    tenso: {
      nom: 'Lamello Tenso P-14', symbole: 'clamex', colle: true, demontable: false,
      serrage: 'auto', outils: ['maillet', 'equerre'],
      pieces: [{ label: 'Tenso P-14 (paire)', type: 'clamex', col: COL.accent },
               { label: 'Colle à bois D3', type: 'colle', col: COL.gris }],
      preparer: 'Clipsez les Tenso dans les rainures en P, une moitié par panneau. ' +
                'Montage à blanc conseillé : le Tenso se déclipse mal une fois engagé.',
      assembler: 'Encollez le joint, puis emboîtez d\'un coup franc jusqu\'au clic. ' +
                 'Le Tenso serre tout seul le temps de la prise — pas de serre-joints. ' +
                 'ASSEMBLAGE DÉFINITIF une fois la colle sèche.'
    },
    domino: {
      nom: 'Festool Domino', symbole: 'domino', colle: true, demontable: false,
      serrage: 'serre-joints', outils: ['maillet', 'equerre'],
      pieces: [{ label: 'Domino (tenon)', type: 'domino', col: [202, 172, 112] },
               { label: 'Colle à bois D3', type: 'colle', col: COL.gris }],
      preparer: 'Montage à blanc d\'abord : les Domino ne laissent aucun jeu, un ' +
                'défaut d\'alignement ne se rattrape pas à la colle. Serre-joints prêts.',
      assembler: 'Encollez les mortaises, enfoncez les Domino, emboîtez et serrez ' +
                 'aux serre-joints. Contrôlez les diagonales pendant la prise. ' +
                 'ASSEMBLAGE DÉFINITIF.'
    },
    tourillon: {
      nom: 'Tourillon collé', symbole: 'tourillon', colle: true, demontable: false,
      serrage: 'serre-joints', outils: ['maillet', 'equerre'],
      pieces: [{ label: 'Tourillon Ø8', type: 'tourillon', col: [202, 172, 112] },
               { label: 'Colle à bois D3', type: 'colle', col: COL.gris }],
      preparer: 'Montage à blanc, puis serre-joints prêts avant d\'encoller.',
      assembler: 'Encollez les trous, enfoncez les tourillons, emboîtez et serrez. ' +
                 'ASSEMBLAGE DÉFINITIF.'
    },
    taquet: {
      nom: 'Taquet d\'étagère', symbole: 'taquet', colle: false, demontable: true,
      serrage: null, outils: [],
      pieces: [{ label: 'Taquet d\'étagère', type: 'taquet', col: COL.gris }],
      preparer: 'Repérez la hauteur voulue dans les perçages Ø5, quatre trous à ' +
                'la même cote — deux devant, deux derrière.',
      assembler: 'Clipsez les taquets, posez l\'étagère dessus. Elle reste ' +
                 'déplaçable : c\'est tout l\'intérêt du perçage système 32.'
    }
  };

  function connecteurInfo(cle) {
    return CONNECTEURS[cle] || CONNECTEURS[String(cle || '').split('_')[0]] ||
           CONNECTEURS.excentrique_tourillon;
  }

  // Polygone fermé. ATTENTION : pdf.lines attend des deltas SÉQUENTIELS
  // (chacun depuis le point précédent), pas depuis le premier point.
  function polygone(pdf, pts, style) {
    var d = [];
    for (var i = 1; i < pts.length; i++)
      d.push([pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]]);
    pdf.lines(d, pts[0][0], pts[0][1], [1, 1], style || 'FD', true);
  }

  // ── Quincaillerie : vue rapprochée, dessinée d'après la pièce réelle ──
  // Un symbole abstrait ne sert à rien : devant son sachet, le client doit
  // RECONNAÎTRE la pièce. On dessine donc la silhouette juste et le détail
  // qui distingue — la came excentrée, l'empreinte étoile du Cabineo, le
  // levier du Clamex, les cannelures du tenon.
  function dessQuinc(pdf, type, x, y, s) {
    pdf.setLineWidth(0.3);

    if (type === 'excentrique') {
      // boîtier de came vu de dessus : corps Ø15, lumière d'entrée du goujon
      // sur le flanc, et came excentrée à l'intérieur (c'est elle qui tire).
      pdf.setFillColor(198,200,206); pdf.setDrawColor(90,92,100);
      pdf.circle(x, y, s*0.5, 'FD');
      pdf.setFillColor(150,152,160); pdf.setDrawColor(90,92,100);
      pdf.circle(x + s*0.11, y, s*0.28, 'FD');                 // came, décentrée
      pdf.setDrawColor(60,62,68); pdf.setLineWidth(0.55);
      pdf.line(x - s*0.16, y - s*0.16, x + s*0.16, y + s*0.16); // empreinte
      pdf.setFillColor(255,255,255); pdf.setDrawColor(90,92,100); pdf.setLineWidth(0.3);
      pdf.rect(x - s*0.13, y + s*0.38, s*0.26, s*0.2, 'FD');    // lumière du goujon

    } else if (type === 'goujon') {
      // goujon métallique : tige filetée d'un côté, tête champignon de l'autre
      pdf.setFillColor(198,200,206); pdf.setDrawColor(90,92,100);
      pdf.rect(x - s*0.5, y - s*0.09, s*0.72, s*0.18, 'FD');
      pdf.circle(x + s*0.34, y, s*0.17, 'FD');                  // tête
      pdf.setDrawColor(120,122,130); pdf.setLineWidth(0.25);
      for (var g = 0; g < 4; g++)                               // filet
        pdf.line(x - s*0.46 + g*s*0.11, y - s*0.09, x - s*0.40 + g*s*0.11, y + s*0.09);

    } else if (type === 'tourillon') {
      // tourillon bois : cylindre à bouts arrondis + cannelures de dégazage
      pdf.setFillColor(206,178,120); pdf.setDrawColor(130,100,50);
      pdf.roundedRect(x - s*0.5, y - s*0.17, s, s*0.34, s*0.17, s*0.17, 'FD');
      pdf.setDrawColor(150,120,70); pdf.setLineWidth(0.25);
      pdf.line(x - s*0.3, y - s*0.06, x + s*0.3, y - s*0.06);
      pdf.line(x - s*0.3, y + s*0.06, x + s*0.3, y + s*0.06);

    } else if (type === 'biscuit') {
      // biscuit lamello : galette de hêtre comprimé, en forme de lentille
      pdf.setFillColor(214,190,142); pdf.setDrawColor(140,112,62);
      pdf.ellipse(x, y, s*0.5, s*0.22, 'FD');
      pdf.setDrawColor(165,138,88); pdf.setLineWidth(0.22);
      pdf.line(x - s*0.3, y - s*0.07, x + s*0.3, y - s*0.07);
      pdf.line(x - s*0.34, y + s*0.03, x + s*0.34, y + s*0.03);

    } else if (type === 'domino') {
      // tenon Domino : oblong à bouts demi-ronds, cannelé sur la longueur
      pdf.setFillColor(206,178,120); pdf.setDrawColor(130,100,50);
      pdf.roundedRect(x - s*0.5, y - s*0.2, s, s*0.4, s*0.2, s*0.2, 'FD');
      pdf.setDrawColor(150,120,70); pdf.setLineWidth(0.25);
      for (var d2 = 0; d2 < 3; d2++)
        pdf.line(x - s*0.22 + d2*s*0.22, y - s*0.15, x - s*0.22 + d2*s*0.22, y + s*0.15);

    } else if (type === 'clamex') {
      // Clamex P-14 : platine noire, queue en P derrière, levier au centre
      pdf.setFillColor(120,122,128); pdf.setDrawColor(40,40,44);
      polygone(pdf, [[x - s*0.28, y - s*0.3], [x + s*0.5, y - s*0.16],
                     [x + s*0.5, y + s*0.16], [x - s*0.28, y + s*0.3]], 'FD'); // queue en P
      pdf.setFillColor(58,58,64); pdf.setDrawColor(20,20,24);
      pdf.roundedRect(x - s*0.5, y - s*0.34, s*0.34, s*0.68, 0.5, 0.5, 'FD');  // platine
      pdf.setFillColor(210,212,216);
      pdf.circle(x - s*0.42, y - s*0.2, s*0.06, 'F');                          // trous de vis
      pdf.circle(x - s*0.42, y + s*0.2, s*0.06, 'F');
      pdf.setFillColor(235,180,60); pdf.setDrawColor(150,110,20);
      pdf.circle(x - s*0.2, y, s*0.13, 'FD');                                  // levier
      pdf.setDrawColor(60,45,10); pdf.setLineWidth(0.4);
      pdf.line(x - s*0.26, y, x - s*0.14, y);

    } else if (type === 'cabineo') {
      // Cabineo : boîtier rond, collerette, vis centrale à empreinte étoile
      pdf.setFillColor(96,98,104); pdf.setDrawColor(30,30,34);
      pdf.circle(x, y, s*0.5, 'FD');
      pdf.setFillColor(130,132,138); pdf.setDrawColor(60,60,66); pdf.setLineWidth(0.25);
      pdf.circle(x, y, s*0.33, 'FD');
      pdf.setFillColor(215,217,222); pdf.setDrawColor(90,90,96);
      pdf.circle(x, y, s*0.2, 'FD');
      pdf.setDrawColor(45,45,50); pdf.setLineWidth(0.42);       // empreinte étoile
      for (var e = 0; e < 3; e++) {
        var a = e * Math.PI / 3;
        pdf.line(x - Math.cos(a)*s*0.13, y - Math.sin(a)*s*0.13,
                 x + Math.cos(a)*s*0.13, y + Math.sin(a)*s*0.13);
      }

    } else if (type === 'charniere') {
      // charnière à cuvette : cuvette Ø35, bras, embase percée
      pdf.setFillColor(196,200,208); pdf.setDrawColor(85,90,100);
      pdf.circle(x - s*0.28, y, s*0.34, 'FD');                  // cuvette
      pdf.setFillColor(168,172,182);
      pdf.circle(x - s*0.28, y, s*0.19, 'FD');
      pdf.setFillColor(196,200,208); pdf.setDrawColor(85,90,100);
      pdf.roundedRect(x - s*0.02, y - s*0.13, s*0.32, s*0.26, 0.4, 0.4, 'FD'); // bras
      pdf.rect(x + s*0.28, y - s*0.28, s*0.22, s*0.56, 'FD');   // embase
      pdf.setFillColor(255,255,255);
      pdf.circle(x + s*0.39, y - s*0.15, s*0.05, 'F');
      pdf.circle(x + s*0.39, y + s*0.15, s*0.05, 'F');

    } else if (type === 'taquet') {
      // taquet : goupille Ø5 qui entre dans le trou + berceau qui porte
      pdf.setFillColor(162,164,170); pdf.setDrawColor(75,75,82);
      pdf.rect(x - s*0.5, y - s*0.07, s*0.4, s*0.14, 'FD');     // goupille
      polygone(pdf, [[x - s*0.1, y - s*0.24], [x + s*0.42, y - s*0.24],
                     [x + s*0.42, y - s*0.02], [x + s*0.06, y - s*0.02],
                     [x + s*0.06, y + s*0.2], [x - s*0.1, y + s*0.2]], 'FD'); // berceau

    } else if (type === 'colle') {
      // flacon de colle : corps, épaulement, bec, et une goutte
      pdf.setFillColor(240,242,246); pdf.setDrawColor(90,92,100);
      pdf.roundedRect(x - s*0.28, y - s*0.1, s*0.56, s*0.6, 0.6, 0.6, 'FD');
      polygone(pdf, [[x - s*0.28, y - s*0.1], [x - s*0.1, y - s*0.34],
                     [x + s*0.1, y - s*0.34], [x + s*0.28, y - s*0.1]], 'FD');
      pdf.setFillColor(210,90,40); pdf.setDrawColor(140,55,20);
      pdf.rect(x - s*0.09, y - s*0.5, s*0.18, s*0.17, 'FD');    // bouchon
      pdf.setFillColor(150,190,230); pdf.setDrawColor(90,140,190);
      pdf.circle(x + s*0.4, y + s*0.24, s*0.09, 'FD');          // goutte

    } else if (type === 'vis') {
      // vis à tête fraisée : tête conique + tige filetée
      pdf.setFillColor(178,180,188); pdf.setDrawColor(80,82,90);
      polygone(pdf, [[x - s*0.3, y - s*0.5], [x + s*0.3, y - s*0.5],
                     [x + s*0.1, y - s*0.24], [x - s*0.1, y - s*0.24]], 'FD');
      pdf.rect(x - s*0.1, y - s*0.26, s*0.2, s*0.5, 'FD');
      pdf.triangle(x - s*0.1, y + s*0.24, x + s*0.1, y + s*0.24, x, y + s*0.5, 'FD');
      pdf.setDrawColor(70,72,80); pdf.setLineWidth(0.3);
      pdf.line(x - s*0.18, y - s*0.5, x + s*0.18, y - s*0.5);   // empreinte
      pdf.setDrawColor(120,122,130); pdf.setLineWidth(0.22);
      for (var v = 0; v < 3; v++)                                // filet
        pdf.line(x - s*0.1, y - s*0.16 + v*s*0.14, x + s*0.1, y - s*0.09 + v*s*0.14);
    }
    pdf.setLineWidth(0.4);
  }

  // Zoom connecteur excentrique + tourillon (schéma de principe)
  function zoomConnecteur(pdf, type, cx, cy, r) {
    pdf.setFillColor(255,255,255); pdf.setDrawColor(COL.accent[0],COL.accent[1],COL.accent[2]);
    pdf.setLineWidth(0.6); pdf.circle(cx, cy, r, 'FD');
    // deux chants de panneaux qui se rencontrent (en T)
    pdf.setFillColor(COL.bois[0],COL.bois[1],COL.bois[2]); pdf.setDrawColor(120,95,55); pdf.setLineWidth(0.3);
    pdf.rect(cx - r*0.8, cy - r*0.18, r*1.6, r*0.36, 'FD');       // panneau horizontal
    pdf.rect(cx - r*0.18, cy - r*0.7, r*0.36, r*0.55, 'FD');      // panneau vertical (chant)
    if (type === 'cabineo') {
      pdf.setFillColor(90,90,95); pdf.setDrawColor(20,20,20); pdf.circle(cx, cy, r*0.16, 'FD');
      pdf.setFillColor(220,220,220); pdf.circle(cx, cy, r*0.06, 'F');
    } else if (type === 'clamex') {
      pdf.setFillColor(70,70,75); pdf.setDrawColor(20,20,20); pdf.roundedRect(cx - r*0.22, cy - r*0.12, r*0.44, r*0.24, 0.4,0.4, 'FD');
    } else if (type === 'tourillon' || type === 'domino' || type === 'biscuit') {
      // tenon / biscuit / domino : une languette à cheval sur le joint,
      // moitié dans le chant, moitié dans la face en face.
      pdf.setFillColor(202,172,112); pdf.setDrawColor(120,90,40);
      var lg = (type === 'biscuit') ? r*0.22 : r*0.14;
      pdf.roundedRect(cx - lg/2, cy - r*0.42, lg, r*0.5, r*0.05, r*0.05, 'FD');
      pdf.setDrawColor(150,120,70); pdf.setLineWidth(0.25);
      pdf.line(cx - lg/2, cy - r*0.17, cx + lg/2, cy - r*0.17);   // plan de joint
    } else if (type === 'taquet') {
      pdf.setFillColor(150,150,155); pdf.setDrawColor(70,70,75);
      pdf.roundedRect(cx - r*0.26, cy - r*0.16, r*0.3, r*0.18, 0.5, 0.5, 'FD');
    } else {
      // excentrique (came) sur le panneau horizontal + tourillon dans le chant
      pdf.setFillColor(200,60,30); pdf.setDrawColor(120,30,10); pdf.circle(cx, cy + r*0.02, r*0.17, 'FD');
      pdf.setDrawColor(255,255,255); pdf.setLineWidth(0.5); pdf.line(cx - r*0.1, cy + r*0.02, cx + r*0.1, cy + r*0.02);
      pdf.setFillColor(202,172,112); pdf.setDrawColor(120,90,40); pdf.setLineWidth(0.3);
      pdf.roundedRect(cx - r*0.05, cy - r*0.5, r*0.1, r*0.32, r*0.05, r*0.05, 'FD'); // tourillon
    }
    pdf.setTextColor(COL.gris[0],COL.gris[1],COL.gris[2]); pdf.setFont('helvetica','italic'); pdf.setFontSize(5.5);
    pdf.text('détail liaison', cx, cy + r + 4, { align: 'center' });
    pdf.setTextColor(0,0,0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ANALYSE GÉOMÉTRIQUE (arbre → pièces 3D exactes)
  // ═══════════════════════════════════════════════════════════════
  function box(role, x0, y0, z0, dx, dy, dz, meta) {
    var b = { role: role, x0: x0, y0: y0, z0: z0, dx: dx, dy: dy, dz: dz };
    if (meta) for (var k in meta) b[k] = meta[k];
    b.col = colByRole(role, meta);
    return b;
  }
  function colByRole(role, meta) {
    if (role === 'fond') return COL.fond;
    if (role === 'porte' || role === 'tiroir') return COL.porte;
    if (role === 'plinthe') return COL.boisCote;
    if (role === 'etagere') return COL.boisTop;
    return COL.bois;
  }

  // Dimensions hors-tout déduites directement des pièces (pour valider l'arbre)
  function dimsDesPieces(items) {
    var lat = null, panLon = 0;
    items.forEach(function (it) {
      if (it.type === 'lateral' && !lat) lat = it;
      if (it.type === 'panneau') panLon = Math.max(panLon, Math.max(it.p.longueur, it.p.largeur));
    });
    return {
      H: lat ? Math.max(lat.p.longueur, lat.p.largeur) : 0,
      P: lat ? Math.min(lat.p.longueur, lat.p.largeur) : 0,
      L: panLon
    };
  }

  // Récupère l'arbre exact du meuble. On n'utilise window._plan2dModele que
  // s'il correspond aux dimensions des pièces analysées (sinon, multi-meubles :
  // il décrit un AUTRE meuble) → on reconstruit alors depuis les pièces.
  function obtenirArbre(items) {
    var d = dimsDesPieces(items);
    var t = global._plan2dModele;
    if (t && t.racine && t.L && t.H) {
      // H et P viennent du latéral (= hors-tout fiable) → tolérance serrée.
      // L vient du panneau (intérieur ≈ L−2ép) → tolérance large.
      var okH = !d.H || Math.abs((t.H || 0) - d.H) <= 8;
      var okP = !d.P || Math.abs((t.P || 0) - d.P) <= 8;
      var okL = !d.L || Math.abs((t.L || 0) - d.L) <= Math.max(60, 0.1 * d.L);
      if (okH && okP && okL) return t;
    }
    if (typeof global._wmcModeleDepuisItems === 'function') {
      try { var m = global._wmcModeleDepuisItems(items); if (m && m.L) return m; } catch (e) {}
    }
    return arbreReplica(items);
  }

  // Repli interne minimal si rien d'autre n'est dispo (standalone)
  function arbreReplica(items) {
    var ep = (items[0] && items[0].ep) || 19;
    var lat = null, panLon = 0, prof = 0;
    items.forEach(function (it) {
      if (it.type === 'lateral' && !lat) lat = it;
      if (it.type === 'panneau') panLon = Math.max(panLon, Math.max(it.p.longueur, it.p.largeur));
    });
    var H = lat ? Math.max(lat.p.longueur, lat.p.largeur) : 2000;
    var P = lat ? Math.min(lat.p.longueur, lat.p.largeur) : 400;
    var L = panLon || 900;
    var nbMont = 0;
    items.forEach(function (it) { if (it.type === 'montant' && it._montantType !== 'etagere') nbMont += (it.p.nombre || 1); });
    var nEt = 0;
    items.forEach(function (it) { if (it.type === 'etagere') nEt += (it.p.nombre || 1); });
    var nbCol = nbMont + 1;
    function colCase(n) {
      if (n <= 0) return {};
      var k = n + 1, t = [], e = [];
      for (var i = 0; i < k; i++) { t.push((H - 2*ep - n*ep) / k); e.push({}); }
      return { sens: 'h', tailles: t, enfants: e };
    }
    if (nbCol <= 1) return { H:H, L:L, P:P, ep:ep, racine: colCase(nEt) };
    var perCol = Math.round(nEt / nbCol), t = [], e = [];
    for (var c = 0; c < nbCol; c++) { t.push((L - 2*ep - (nbCol-1)*ep)/nbCol); e.push(colCase(perCol)); }
    return { H:H, L:L, P:P, ep:ep, racine: { sens:'v', tailles:t, enfants:e } };
  }

  // ── SOURCE EXACTE : positions de la vue de face (_pos) ──────────
  // Quand le meuble vient de l'éditeur 2D, chaque pièce porte
  // _pos = {x,y,w,h} (mm, origine coin haut-gauche, y vers le bas).
  // On dessine alors CHAQUE pièce à sa position réelle (montants locaux,
  // vraies hauteurs d'étagères, épaisseurs exactes) — aucune reconstruction.
  function partsDepuisPos(items) {
    var withPos = items.filter(function (it) { return it._pos && it._pos.w && it._pos.h; });
    if (withPos.length < 3) return null; // pas assez de positions → on retombe sur l'arbre
    var ep = 0, H = 0, L = 0, P = 0;
    items.forEach(function (it) { if (it._pos) { L = Math.max(L, it._pos.x + it._pos.w); H = Math.max(H, it._pos.y + it._pos.h); } });
    items.forEach(function (it) { if (it.type === 'lateral' && it._pos && it._pos.w) ep = it._pos.w; });
    if (!ep) ep = (items[0] && items[0].ep) || 19;
    items.forEach(function (it) { var d = Math.min(it.p.longueur, it.p.largeur); if (it.type === 'lateral') P = Math.max(P, d); if (it.prof) P = Math.max(P, it.prof); });
    if (!P) P = 600;
    var epFond = (global._meubles && global._meubles[0] && global._meubles[0].epFond) || 8;
    items.forEach(function (it) { if (it.type === 'fond') epFond = it.p.epaisseur || epFond; });
    var hPl = 0;
    items.forEach(function (it) { if (it.type === 'plinthe') hPl = Math.max(hPl, Math.min(it.p.longueur, it.p.largeur)); });

    var parts = [];
    function depthOf(it) {
      var role = it.type, pd = Math.min(it.p.longueur, it.p.largeur);
      if (role === 'fond') return { y0: P - epFond, dy: epFond };
      if (role === 'porte' || role === 'tiroir') return { y0: -ep - 2, dy: ep };
      var dy = Math.min(pd || P, P) || P;
      return { y0: 0, dy: dy };
    }
    withPos.forEach(function (it) {
      var ps = it._pos, role = it.type, d = depthOf(it), z0 = H - (ps.y + ps.h), meta = {};
      if (role === 'lateral') meta.cote = (ps.x < L / 2) ? 'gauche' : 'droit';
      else if (role === 'panneau') meta.pos = (ps.y < H / 2) ? 'haut' : 'bas';
      else if (role === 'montant') meta.plein = Math.abs(ps.h - (H - 2 * ep)) <= Math.max(14, ep);
      parts.push(box(role, ps.x, d.y0, z0, ps.w, d.dy, ps.h, meta));
    });
    if (hPl > 0 && !withPos.some(function (it) { return it.type === 'plinthe'; })) {
      parts.push(box('plinthe', ep, 12, 0, L - 2 * ep, ep, hPl));
    }
    return { parts: parts, L: L, H: H, P: P, ep: ep, hPl: hPl, epFond: epFond };
  }

  function analyser(items) {
    var viaPos = partsDepuisPos(items);
    if (viaPos) {
      var hwP = recapQuincaillerie({ L: viaPos.L, H: viaPos.H, P: viaPos.P, ep: viaPos.ep, parts: viaPos.parts }, items);
      var invP = construireInventaire(items, viaPos.parts);
      var nomP = (items[0] && items[0].meuble) || (global._meubles && global._meubles[0] && global._meubles[0].nom) || 'Meuble';
      return { nom: nomP, L: viaPos.L, H: viaPos.H, P: viaPos.P, ep: viaPos.ep, hPl: viaPos.hPl, epFond: viaPos.epFond,
               parts: viaPos.parts, colBounds: [], compartments: [], hw: hwP, inventaire: invP, items: items };
    }
    var arbre = obtenirArbre(items);
    var ep = arbre.ep || 19, L = arbre.L, H = arbre.H, P = arbre.P;
    var epFond = (global._meubles && global._meubles[0] && global._meubles[0].epFond) || 8;

    // Plinthe
    var hPl = 0, plintheType = 'encastree';
    items.forEach(function (it) {
      if (it.type === 'plinthe') { hPl = Math.max(hPl, Math.min(it.p.longueur, it.p.largeur)); plintheType = it.typePlinthe || plintheType; }
    });

    var parts = [], compartments = [], colBounds = [];
    var IX0 = ep, IX1 = L - ep, IZ0 = hPl + ep, IZ1 = H - ep;

    // Carcasse
    parts.push(box('lateral', 0, 0, hPl, ep, P, H - hPl, { cote: 'gauche' }));
    parts.push(box('lateral', L - ep, 0, hPl, ep, P, H - hPl, { cote: 'droit' }));
    parts.push(box('panneau', ep, 0, hPl, L - 2*ep, P, ep, { pos: 'bas' }));
    parts.push(box('panneau', ep, 0, H - ep, L - 2*ep, P, ep, { pos: 'haut' }));
    if (hPl > 0) parts.push(box('plinthe', ep, 12, 0, L - 2*ep, ep, hPl));

    // Division récursive de l'intérieur
    function divide(cell, x0, x1, z0, z1, depth, col) {
      if (!cell || !cell.sens) { compartments.push({ x0:x0, x1:x1, z0:z0, z1:z1, col:col }); return; }
      var t = cell.tailles || [], enf = cell.enfants || [], n = enf.length;
      if (cell.sens === 'v') {
        var cx = x0;
        for (var i = 0; i < n; i++) {
          var w = (t[i] != null) ? t[i] : (x1 - x0 - (n-1)*ep) / n;
          var childCol = (depth === 0) ? i : col;
          if (depth === 0) colBounds.push({ x0: cx, x1: cx + w, col: i });
          divide(enf[i], cx, cx + w, z0, z1, depth + 1, childCol);
          cx += w;
          if (i < n - 1) { parts.push(box('montant', cx, 0, z0, ep, P, z1 - z0, { plein: depth === 0, col: col })); cx += ep; }
        }
      } else { // 'h'
        var cz = z0;
        for (var j = 0; j < n; j++) {
          var h = (t[j] != null) ? t[j] : (z1 - z0 - (n-1)*ep) / n;
          divide(enf[j], x0, x1, cz, cz + h, depth + 1, col);
          cz += h;
          if (j < n - 1) { parts.push(box('etagere', x0 + 1, 4, cz, (x1 - x0) - 2, P - 8, ep, { col: col })); cz += ep; }
        }
      }
    }
    var racine = arbre.racine || {};
    if (racine.sens === 'v') { divide(racine, IX0, IX1, IZ0, IZ1, 0, 0); }
    else { colBounds.push({ x0: IX0, x1: IX1, col: 0 }); divide(racine, IX0, IX1, IZ0, IZ1, 0, 0); }
    if (!colBounds.length) colBounds.push({ x0: IX0, x1: IX1, col: 0 });

    // Fond par colonne
    var fonds = items.filter(function (it) { return false; }); // placeholder
    colBounds.forEach(function (cb) {
      parts.push(box('fond', cb.x0, P - epFond, IZ0, cb.x1 - cb.x0, epFond, IZ1 - IZ0, { col: cb.col }));
    });

    // Portes : on les répartit sur les colonnes (de gauche à droite)
    var portesItems = [];
    items.filter(function (it) { return it.type === 'porte'; }).forEach(function (it) {
      var nb = it.p.nombre || 1; for (var k = 0; k < nb; k++) portesItems.push(it);
    });
    var pi = 0;
    colBounds.forEach(function (cb) {
      if (pi >= portesItems.length) return;
      var it = portesItems[pi];
      var cw = cb.x1 - cb.x0;
      if (it.sens === 'paire' && pi + 1 <= portesItems.length) {
        // 2 vantaux
        var w2 = (cw - 3) / 2;
        parts.push(box('porte', cb.x0, -ep - 2, hPl, w2, ep, H - hPl, { battant: 'g' }));
        parts.push(box('porte', cb.x0 + w2 + 3, -ep - 2, hPl, w2, ep, H - hPl, { battant: 'd' }));
        pi += 1;
      } else {
        parts.push(box('porte', cb.x0 + 1, -ep - 2, hPl, cw - 2, ep, H - hPl, { battant: it.sens }));
        pi += 1;
      }
    });

    // Tiroirs : empilés dans leur colonne (par ordre)
    var tiroirsItems = items.filter(function (it) { return it.type === 'tiroir'; });
    if (tiroirsItems.length) {
      var nbT = 0; tiroirsItems.forEach(function (it) { nbT += (it.p.nombre || 1); });
      var cb = colBounds[colBounds.length - 1]; // dernière colonne par défaut
      var hT = (IZ1 - IZ0) / nbT;
      for (var t2 = 0; t2 < nbT; t2++) {
        parts.push(box('tiroir', cb.x0 + 1, -ep - 2, IZ0 + t2 * hT, (cb.x1 - cb.x0) - 2, ep, hT - 4, {}));
      }
    }

    // Quincaillerie exacte
    var hw = recapQuincaillerie({ L:L, H:H, P:P, ep:ep, parts:parts }, items);

    // Inventaire des pièces
    var inventaire = construireInventaire(items, parts);

    var nom = (items[0] && items[0].meuble) || (global._meubles && global._meubles[0] && global._meubles[0].nom) || 'Meuble';
    return {
      nom: nom, L: L, H: H, P: P, ep: ep, hPl: hPl, epFond: epFond,
      parts: parts, colBounds: colBounds, compartments: compartments,
      hw: hw, inventaire: inventaire, items: items
    };
  }

  // ── Inventaire : regroupe les pièces par type + dimensions ──────
  function construireInventaire(items, parts) {
    var roleNoms = { lateral:'Latéral', montant:'Montant', panneau:'Panneau', etagere:'Étagère',
                     porte:'Porte', tiroir:'Façade tiroir', plinthe:'Plinthe' };
    var groupes = {};
    items.forEach(function (it) {
      if (!roleNoms[it.type]) return;
      var lo = Math.max(it.p.longueur, it.p.largeur), la = Math.min(it.p.longueur, it.p.largeur);
      var key = it.type + '|' + Math.round(lo) + '|' + Math.round(la) + '|' + Math.round(it.p.epaisseur || 0);
      if (!groupes[key]) groupes[key] = { type: it.type, nom: roleNoms[it.type], lo: lo, la: la, ep: it.p.epaisseur, qty: 0 };
      groupes[key].qty += (it.p.nombre || 1);
    });
    // fonds
    (global._fonds || []).forEach(function (f) {
      var key = 'fond|' + Math.round(f.longueur) + '|' + Math.round(f.largeur);
      if (!groupes[key]) groupes[key] = { type: 'fond', nom: 'Fond', lo: f.longueur, la: f.largeur, ep: f.epaisseur || 8, qty: 0 };
      groupes[key].qty += (f.nombre || 1);
    });
    var ordre = { lateral:0, panneau:1, montant:2, etagere:3, fond:4, porte:5, tiroir:6, plinthe:7 };
    var list = Object.keys(groupes).map(function (k) { return groupes[k]; })
      .sort(function (a, b) { return (ordre[a.type] - ordre[b.type]) || (b.lo - a.lo); });
    list.forEach(function (g, i) { g.ref = i + 1; });
    return list;
  }

  // ── Quincaillerie : repères A,B,C… + quantités exactes ──────────
  function recapQuincaillerie(modele, items) {
    var conn = global.TYPE_CONNECTEUR || 'excentrique_tourillon';
    var rep = [], L = 'A'.charCodeAt(0);
    function add(label, qty, type, col) {
      rep.push({ rep: String.fromCharCode(L++), label: label, qty: qty, type: type, col: col || COL.encre });
    }
    var liens = global._liaisons || [];
    function compteParPositions() {
      var e = 0, t = 0, cb = 0;
      liens.forEach(function (l) {
        if (l.exc && l.exc.length) e += l.exc.length;
        if (l.tou && l.tou.length) t += l.tou.length;
        if (l.nbCab) cb += l.nbCab;
      });
      return { e: e * 2, t: t * 2, cb: cb };
    }
    var byPos = compteParPositions();
    // La liste suit le CATALOGUE : chaque connecteur déclare ses pièces, on
    // n'a plus à deviner à coups de indexOf sur le nom du type.
    var info = connecteurInfo(conn);
    var nJoints = Math.max(byPos.e || 0, byPos.cb || 0, 8);
    if (conn.indexOf('cabineo') === 0) {
      add(info.pieces[0].label, Math.max(byPos.cb, 8), 'cabineo', COL.accent);
    } else if (conn === 'excentrique_tourillon') {
      var nExc = (global._totalExc != null) ? global._totalExc : (byPos.e || 8);
      var nGou = (global._totalGou != null) ? global._totalGou : (byPos.t || 8);
      add('Excentrique Ø15', nExc, 'excentrique', [200, 60, 30]);
      add('Goujon Ø6 (pour excentrique)', nGou, 'goujon', [130, 132, 140]);
    } else {
      info.pieces.forEach(function (p, i) {
        // la colle se compte en flacon, pas à l'unité
        var qte = (p.type === 'vis' && /colle/i.test(p.label)) ? 1 : nJoints;
        add(p.label, qte, p.type, p.col);
      });
    }
    var nbCharn = (global._charnTotal != null) ? global._charnTotal : 0;
    if (!nbCharn && global._charnDets && global._charnDets.length) {
      global._charnDets.forEach(function (c) { nbCharn += (c.nb || 2); });
    }
    var nbPortes = items.filter(function (it) { return it.type === 'porte'; }).length;
    if (!nbCharn && nbPortes) nbCharn = nbPortes * 3;
    if (nbCharn > 0) add('Charnière', nbCharn, 'charniere', COL.accent2);

    var nbEt = 0; items.forEach(function (it) { if (it.type === 'etagere') nbEt += (it.p.nombre || 1); });
    if (nbEt > 0) add('Taquet d\'étagère', nbEt * 4, 'taquet', COL.gris);

    var nbFond = (global._fonds && global._fonds.length) || modele.parts.filter(function (p) { return p.role === 'fond'; }).length;
    add('Vis de fixation', Math.max(12, nbFond * 6 + 8), 'vis', COL.gris);
    return rep;
  }

  // ═══════════════════════════════════════════════════════════════
  //  POSITIONNEMENT ÉCLATÉ + TRI D'OCCLUSION
  // ═══════════════════════════════════════════════════════════════
  // cfg : { eclate:0..1, only:[roles], focus:[roles] }
  // Renvoie {boxes, arrows}. focus = pièces mises en avant (les autres en filigrane).
  function positionner(model, cfg) {
    cfg = cfg || {};
    var e = cfg.eclate || 0;
    var only = cfg.only || null, focus = cfg.focus || null;
    var sep = Math.max(model.L, model.H) * 0.14;
    var boxes = [], arrows = [];

    function visible(role) { return !only || only.indexOf(role) > -1; }
    function estFocus(role) { return !focus || focus.indexOf(role) > -1; }

    model.parts.forEach(function (p) {
      if (!visible(p.role)) return;
      var off = { x: 0, y: 0, z: 0 };
      if (e > 0.02 && estFocus(p.role)) {
        if (p.role === 'lateral') off.x = (p.cote === 'droit') ? sep : -sep;
        else if (p.role === 'panneau') off.z = (p.pos === 'haut') ? sep * 0.9 : -sep * 0.55;
        else if (p.role === 'montant') off.z = sep * 0.7;
        else if (p.role === 'etagere') off.z = sep * 0.6 + (p.z0 / model.H) * sep * 0.5;
        else if (p.role === 'fond') off.y = sep * 1.1;
        else if (p.role === 'porte' || p.role === 'tiroir') off.y = -sep * 1.2;
        else if (p.role === 'plinthe') off.z = -sep * 0.6;
      }
      var nb = { role: p.role, x0: p.x0 + off.x, y0: p.y0 + off.y, z0: p.z0 + off.z,
                 dx: p.dx, dy: p.dy, dz: p.dz, col: p.col, battant: p.battant, pos: p.pos, cote: p.cote };
      nb.faint = focus && !estFocus(p.role);
      boxes.push(nb);
      // flèche de montage (vers la position finale)
      if (e > 0.05 && estFocus(p.role) && (off.x || off.y || off.z)) {
        nb._arrow = off;
      }
    });

    // Tri d'occlusion : par COUCHES (robuste pour du mobilier), puis par
    // profondeur (1,1,1) à l'intérieur d'une couche. Les portes/tiroirs sont
    // toujours au premier plan ; le fond toujours à l'arrière.
    var couche = { fond:0, panneau:2, lateral:3, montant:3, etagere:4, plinthe:5, tiroir:7, porte:8 };
    boxes.forEach(function (b) {
      b._couche = (couche[b.role] != null) ? couche[b.role] : 4;
      if (b.role === 'panneau' && b.pos === 'haut') b._couche = 5;     // dessus par-dessus la carcasse
      // profondeur : plus petit (x+y+z) au coin avant = plus proche
      b._prof = (b.x0 + b.y0 + b.z0);
    });
    boxes.sort(function (a, b) {
      if (a._couche !== b._couche) return a._couche - b._couche;
      return b._prof - a._prof; // loin (grand) d'abord, proche (petit) ensuite
    });
    return { boxes: boxes };
  }

  function dessinerScene(pdf, iso, scene, opts) {
    opts = opts || {};
    // ombre au sol
    if (opts.ombre) {
      var c = iso.proj((opts.L||0)/2, (opts.P||0)/2, 0);
      pdf.setFillColor(COL.ombre[0], COL.ombre[1], COL.ombre[2]);
      pdf.ellipse(c.X, c.Y + 2, (opts.L||300) * iso.scale * 0.42, (opts.P||300) * iso.scale * 0.22, 'F');
    }
    scene.boxes.forEach(function (b) { isoBox(pdf, iso, b); });
    // flèches au-dessus
    scene.boxes.forEach(function (b) {
      if (!b._arrow) return;
      var o = b._arrow, cx = b.x0 + b.dx/2, cy = b.y0 + b.dy/2, cz = b.z0 + b.dz/2;
      var p1 = iso.proj(cx, cy, cz);
      var p2 = iso.proj(cx - o.x*0.5, cy - o.y*0.5, cz - o.z*0.5);
      fleche(pdf, p1.X, p1.Y, p2.X, p2.Y, COL.accent);
    });
    // poignées de portes
    scene.boxes.forEach(function (b) {
      if (b.role !== 'porte') return;
      var hy = (b.battant === 'd') ? b.x0 + b.dx*0.12 : b.x0 + b.dx*0.88;
      var pH = iso.proj(hy, b.y0, b.z0 + b.dz*0.5);
      pdf.setFillColor(80,80,85); pdf.circle(pH.X, pH.Y, Math.max(0.6, 1.1*iso.scale*8/8), 'F');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PAGES
  // ═══════════════════════════════════════════════════════════════
  var PW = 210, PH = 297, MG = 14;

  function bandeau(pdf, titre, num, total) {
    pdf.setFillColor(COL.encre[0], COL.encre[1], COL.encre[2]); pdf.rect(0, 0, PW, 10, 'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(8);
    pdf.text('THE WOODER — ' + titre, MG, 6.6);
    if (num != null) pdf.text(num + ' / ' + total, PW - MG, 6.6, { align: 'right' });
    pdf.setTextColor(0,0,0);
  }
  function pied(pdf) {
    pdf.setDrawColor(230,230,232); pdf.setLineWidth(0.2); pdf.line(MG, PH - 12, PW - MG, PH - 12);
    pdf.setTextColor(COL.gris[0],COL.gris[1],COL.gris[2]); pdf.setFont('helvetica','normal'); pdf.setFontSize(7);
    pdf.text('the wooder — mobilier sur-mesure', MG, PH - 7.5);
    pdf.setTextColor(0,0,0);
  }

  function pageCouverture(pdf, m) {
    pdf.setFillColor(COL.encre[0], COL.encre[1], COL.encre[2]); pdf.rect(0, 0, PW, PH, 'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(30);
    pdf.text('NOTICE DE MONTAGE', PW/2, 46, { align: 'center' });
    pdf.setFontSize(14); pdf.setFont('helvetica','normal');
    pdf.setTextColor(COL.accent[0],COL.accent[1],COL.accent[2]);
    pdf.text(m.nom, PW/2, 58, { align: 'center' });

    var ext = m.parts.some(function (p) { return p.role === 'porte'; })
      ? ['lateral','panneau','porte','plinthe','tiroir']
      : ['lateral','panneau','montant','etagere','plinthe'];
    var scene = positionner(m, { eclate: 0, only: ext });
    var iso = fitBoxes({ x: MG, y: 76, w: PW - 2*MG, h: 150 }, scene.boxes);
    dessinerScene(pdf, iso, scene, { ombre: true, L: m.L, P: m.P });

    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','normal'); pdf.setFontSize(11);
    pdf.text('Dimensions hors-tout : ' + fMm(m.L) + ' L  ×  ' + fMm(m.H) + ' H  ×  ' + fMm(m.P) + ' P  (mm)', PW/2, 246, { align: 'center' });
    pdf.setFontSize(9); pdf.setTextColor(170,170,175);
    pdf.text('Lisez la notice en entier avant de commencer.', PW/2, 264, { align: 'center' });
    pdf.text('the wooder — mobilier sur-mesure', PW/2, 280, { align: 'center' });
  }

  function pageSecurite(pdf, m, titre, num, total) {
    bandeau(pdf, titre, num, total);
    pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(16);
    pdf.text('Avant de commencer', MG, 24);
    var conseils = [
      ['lire',   'Lisez toute la notice', 'Vérifiez d\'abord que toutes les pièces et la quincaillerie sont présentes.'],
      ['deux',   'Montage à 2 personnes', 'Certaines pièces sont lourdes ou encombrantes : faites-vous aider.'],
      ['sol',    'Travaillez sur sol plat', 'Posez un carton ou une couverture pour ne pas rayer les panneaux.'],
      ['serrer', 'Ne serrez pas tout de suite', 'Pré-assemblez, vérifiez l\'équerrage, puis serrez l\'ensemble.'],
      ['mur',    'Fixez le meuble au mur', 'Si la hauteur dépasse la profondeur, ancrez-le pour éviter tout basculement.']
    ];
    var y = 40;
    conseils.forEach(function (c) {
      pdf.setFillColor(COL.grisClr[0],COL.grisClr[1],COL.grisClr[2]);
      pdf.roundedRect(MG, y, PW - 2*MG, 26, 2, 2, 'F');
      pictoSecurite(pdf, c[0], MG + 14, y + 13, 9);
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(11);
      pdf.text(c[1], MG + 32, y + 11);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(90,90,95);
      pdf.text(pdf.splitTextToSize(c[2], PW - 2*MG - 40), MG + 32, y + 18);
      y += 31;
    });
    pied(pdf);
  }

  function pictoSecurite(pdf, type, cx, cy, s) {
    pdf.setDrawColor(COL.accent[0],COL.accent[1],COL.accent[2]); pdf.setFillColor(COL.accent[0],COL.accent[1],COL.accent[2]); pdf.setLineWidth(0.8);
    if (type === 'lire') { pdf.roundedRect(cx - s*0.6, cy - s*0.5, s*1.2, s, 0.8,0.8, 'S'); pdf.line(cx, cy - s*0.5, cx, cy + s*0.5); }
    else if (type === 'deux') { pdf.circle(cx - s*0.4, cy - s*0.3, s*0.22, 'F'); pdf.circle(cx + s*0.4, cy - s*0.3, s*0.22, 'F'); pdf.setLineWidth(1.4); pdf.line(cx - s*0.4, cy - s*0.05, cx - s*0.4, cy + s*0.5); pdf.line(cx + s*0.4, cy - s*0.05, cx + s*0.4, cy + s*0.5); }
    else if (type === 'sol') { pdf.setLineWidth(1.4); pdf.line(cx - s*0.6, cy + s*0.4, cx + s*0.6, cy + s*0.4); pdf.setLineWidth(0.8); pdf.rect(cx - s*0.3, cy - s*0.2, s*0.6, s*0.6, 'S'); }
    else if (type === 'serrer') { pdf.circle(cx, cy, s*0.5, 'S'); pdf.setLineWidth(1.2); pdf.line(cx, cy, cx + s*0.35, cy - s*0.2); }
    else if (type === 'mur') { pdf.setLineWidth(1.4); pdf.line(cx - s*0.6, cy - s*0.5, cx - s*0.6, cy + s*0.5); pdf.setLineWidth(0.8); pdf.rect(cx - s*0.4, cy - s*0.45, s*0.8, s*0.9, 'S'); pdf.setFillColor(COL.accent[0],COL.accent[1],COL.accent[2]); pdf.circle(cx - s*0.5, cy - s*0.2, s*0.08, 'F'); pdf.circle(cx - s*0.5, cy + s*0.2, s*0.08, 'F'); }
    pdf.setDrawColor(0,0,0);
  }

  function pageInventaire(pdf, m, titre, num, total) {
    bandeau(pdf, titre, num, total);
    pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(16);
    pdf.text('Pièces du meuble', MG, 24);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(90,90,95);
    pdf.text('Vérifiez que toutes les pièces sont présentes avant de commencer.', MG, 31);

    var inv = m.inventaire;
    var nC = 3, cw = (PW - 2*MG) / nC, ch = 46;
    var x0 = MG, y0 = 40;
    inv.forEach(function (g, i) {
      var col = i % nC, row = Math.floor(i / nC);
      var cx = x0 + col * cw, cy = y0 + row * ch;
      pdf.setDrawColor(228,228,231); pdf.setLineWidth(0.3); pdf.roundedRect(cx, cy, cw - 6, ch - 6, 1.5, 1.5, 'S');
      // mini-dessin proportionnel
      miniPiece(pdf, g, cx + 6, cy + 6, cw - 24, ch - 24);
      // ref + texte
      badge(pdf, cx + cw - 12, cy + 8, 4, g.ref, COL.encre);
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(8);
      pdf.text(g.nom, cx + 6, cy + ch - 12);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(110,110,115);
      pdf.text(fMm(g.lo) + ' × ' + fMm(g.la) + (g.ep ? ' × ' + fMm(g.ep) : '') + ' mm', cx + 6, cy + ch - 8);
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor(COL.accent[0],COL.accent[1],COL.accent[2]);
      pdf.text('×' + g.qty, cx + cw - 12, cy + ch - 9, { align: 'center' });
    });
    pied(pdf);
  }

  function miniPiece(pdf, g, x, y, w, h) {
    var ratio = g.la / g.lo;
    var dw = w, dh = w * ratio;
    if (dh > h) { dh = h; dw = h / ratio; }
    var px = x + (w - dw) / 2, py = y + (h - dh) / 2;
    pdf.setFillColor(COL.bois[0],COL.bois[1],COL.bois[2]); pdf.setDrawColor(120,95,55); pdf.setLineWidth(0.3);
    pdf.rect(px, py, dw, dh, 'FD');
    if (g.type === 'porte') { pdf.setFillColor(80,80,85); pdf.circle(px + dw*0.85, py + dh*0.5, 0.8, 'F'); }
  }

  function pageOutils(pdf, m, rep, titre, num, total) {
    bandeau(pdf, titre, num, total);
    pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(16);
    pdf.text('Outils & quincaillerie', MG, 24);
    pdf.setFontSize(11); pdf.text('Outils nécessaires', MG, 38);
    // Liste d'outils déduite des connecteurs réellement employés : annoncer
    // des serre-joints pour un montage démontable est du bruit, et l'inverse
    // — les oublier sur un montage collé — arrête le chantier en cours de colle.
    var NOMS_OUTILS = { perceuse: 'Perceuse-visseuse', tournevis: 'Tournevis',
                        maillet: 'Maillet', equerre: 'Équerre', metre: 'Mètre',
                        niveau: 'Niveau', serrejoint: 'Serre-joints' };
    var outils = ['metre', 'equerre', 'niveau'];
    [global.TYPE_CONNECTEUR, global._connMontant, global._connEtagere].forEach(function (c) {
      if (!c) return;
      var info = connecteurInfo(c);
      (info.outils || []).forEach(function (o) { if (outils.indexOf(o) < 0) outils.push(o); });
      if (info.serrage === 'serre-joints' && outils.indexOf('serrejoint') < 0) outils.push('serrejoint');
    });
    if (outils.indexOf('perceuse') < 0) outils.push('perceuse');   // portes, fond : toujours
    outils.sort(function (a, b) {
      var ordre = ['perceuse','tournevis','maillet','serrejoint','equerre','metre','niveau'];
      return ordre.indexOf(a) - ordre.indexOf(b);
    });
    var labels = outils.map(function (o) { return NOMS_OUTILS[o] || o; });
    var x = MG, y = 52;
    outils.forEach(function (o, i) {
      pdf.setDrawColor(COL.gris[0],COL.gris[1],COL.gris[2]); pdf.setLineWidth(0.3);
      pdf.roundedRect(x, y - 10, 29, 24, 1.5, 1.5, 'S');
      pictoOutil(pdf, o, x + 10, y - 1, 9);
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','normal'); pdf.setFontSize(6.3);
      pdf.text(labels[i], x + 14.5, y + 11, { align: 'center' });
      x += 31;
    });
    var yT = 90;
    pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.text('Quincaillerie fournie', MG, yT); yT += 9;
    pdf.setFontSize(9);
    rep.forEach(function (r) {
      pdf.setDrawColor(228,228,231); pdf.setLineWidth(0.3); pdf.line(MG, yT + 5, PW - MG, yT + 5);
      badge(pdf, MG + 4, yT, 4, r.rep, COL.encre);
      dessQuinc(pdf, r.type, MG + 22, yT, 6);
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5);
      pdf.text(r.label, MG + 34, yT + 1.4);
      pdf.setFont('helvetica','bold');
      pdf.text('×' + r.qty, PW - MG - 4, yT + 1.4, { align: 'right' });
      yT += 12;
    });
    pdf.setTextColor(COL.gris[0],COL.gris[1],COL.gris[2]); pdf.setFont('helvetica','italic'); pdf.setFontSize(7.5);
    pdf.text('Les lettres (A, B, C…) renvoient aux repères des étapes de montage.', MG, yT + 6);
    pied(pdf);
  }

  function pageEtape(pdf, m, et, titre, num, total) {
    bandeau(pdf, titre, num, total);
    badge(pdf, MG + 6, 24, 7, et.no, COL.accent);
    pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(15);
    pdf.text(et.titre, MG + 18, 26);

    var scene = positionner(m, et.dessin);
    var iso = fitBoxes({ x: MG, y: 42, w: PW - 2*MG - 46, h: 188 }, scene.boxes);
    dessinerScene(pdf, iso, scene, { ombre: !et.dessin.eclate, L: m.L, P: m.P });

    // encart quincaillerie de l'étape
    var bx = PW - MG - 40, by = 46;
    if (et.quinc && et.quinc.length) {
      pdf.setFillColor(COL.grisClr[0],COL.grisClr[1],COL.grisClr[2]);
      pdf.roundedRect(bx - 4, by - 8, 44, 12 + et.quinc.length * 12, 2, 2, 'F');
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(8);
      pdf.text('Pour cette étape', bx, by - 1);
      var yy = by + 9;
      et.quinc.forEach(function (q) {
        badge(pdf, bx + 2, yy, 3.5, q.rep, COL.encre);
        dessQuinc(pdf, q.type, bx + 10, yy, 4);
        pdf.setFont('helvetica','bold'); pdf.setFontSize(8); pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]);
        pdf.text('×' + q.qty, bx + 17, yy + 1);
        pdf.setFont('helvetica','normal'); pdf.setFontSize(6); pdf.setTextColor(110,110,115);
        pdf.text(pdf.splitTextToSize(q.label, 34), bx, yy + 6);
        yy += 12;
      });
    }
    // zoom connecteur
    if (et.zoom) zoomConnecteur(pdf, et.zoom, PW - MG - 18, 168, 15);

    if (et.conseil) {
      pdf.setFillColor(255,247,235); pdf.roundedRect(MG, PH - 36, PW - 2*MG, 20, 2, 2, 'F');
      pdf.setTextColor(COL.accent[0],COL.accent[1],COL.accent[2]); pdf.setFont('helvetica','bold'); pdf.setFontSize(9);
      pdf.text('Conseil', MG + 6, PH - 27);
      pdf.setTextColor(COL.encre[0],COL.encre[1],COL.encre[2]); pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5);
      pdf.text(pdf.splitTextToSize(et.conseil, PW - 2*MG - 30), MG + 24, PH - 28);
    }
    pied(pdf);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ÉTAPES
  // ═══════════════════════════════════════════════════════════════
  function construireEtapes(m, rep) {
    var conn = global.TYPE_CONNECTEUR || 'excentrique_tourillon';
    var zoom = conn.indexOf('cabineo') === 0 ? 'cabineo' : conn.indexOf('clamex') === 0 ? 'clamex' : 'exc';
    var etapes = [], no = 1;
    function q(motcle) {
      return rep.filter(function (r) { return r.label.toLowerCase().indexOf(motcle) > -1; })
                .map(function (r) { return { rep: r.rep, qty: r.qty, label: r.label, type: r.type }; });
    }
    // Les trois familles peuvent avoir des assemblages différents : on peut
    // très bien monter le caisson en Cabineo et poser les étagères sur taquets.
    var cCaisson = connecteurInfo(global.TYPE_CONNECTEUR || 'excentrique_tourillon');
    var cMontant = connecteurInfo(global._connMontant || global.TYPE_CONNECTEUR);
    var cEtagere = connecteurInfo(global._connEtagere || global.TYPE_CONNECTEUR);

    // Quincaillerie d'une étape : on ne montre QUE les pièces de ce connecteur.
    function qConn(c) {
      var voulu = c.pieces.map(function (p) { return p.label.toLowerCase(); });
      return rep.filter(function (r) {
        return voulu.some(function (v) { return r.label.toLowerCase().indexOf(v.split(' ')[0]) > -1; });
      }).map(function (r) { return { rep: r.rep, qty: r.qty, label: r.label, type: r.type }; });
    }

    var aMontants = m.parts.some(function (p) { return p.role === 'montant'; });
    var aEtageres = m.parts.some(function (p) { return p.role === 'etagere'; });
    var aPortes   = m.parts.some(function (p) { return p.role === 'porte'; });
    var aTiroirs  = m.parts.some(function (p) { return p.role === 'tiroir'; });
    var aPlinthe  = m.hPl > 0;

    // Un assemblage collé ne se rattrape pas : on le dit AVANT, sur sa propre
    // étape, pas au détour d'un conseil en bas de page.
    if (cCaisson.colle) etapes.push({ no: no++, titre: 'Avant d\'encoller — à lire',
      dessin: { eclate: 0.8, only: ['lateral','panneau'] }, quinc: qConn(cCaisson),
      conseil: 'Ce meuble s\'assemble en ' + cCaisson.nom + ' : le montage est DÉFINITIF. ' +
               'Montez-le d\'abord entièrement À BLANC, sans colle, et vérifiez ' +
               'les diagonales. N\'encollez qu\'une fois ce montage à blanc concluant' +
               (cCaisson.serrage === 'serre-joints'
                 ? ', et préparez vos serre-joints : après encollage il reste une dizaine de minutes.'
                 : '.') });

    etapes.push({ no: no++, titre: 'Préparer les connecteurs — ' + cCaisson.nom,
      dessin: { eclate: 0.7, only: ['lateral','panneau'], focus: ['panneau'] },
      quinc: qConn(cCaisson), zoom: cCaisson.symbole,
      conseil: cCaisson.preparer });

    etapes.push({ no: no++, titre: 'Assembler le caisson',
      dessin: { eclate: 0.5, only: ['lateral','panneau'] },
      quinc: qConn(cCaisson), zoom: cCaisson.symbole,
      conseil: cCaisson.assembler });

    if (aMontants) etapes.push({ no: no++, titre: 'Poser les montants',
      dessin: { eclate: 0.45, only: ['lateral','panneau','montant'], focus: ['montant'] },
      quinc: qConn(cMontant), zoom: cMontant.symbole,
      conseil: 'Les montants divisent le meuble en compartiments. ' + cMontant.assembler });

    etapes.push({ no: no++, titre: 'Fixer le fond',
      dessin: { eclate: 0.5, only: ['lateral','panneau','montant','fond'], focus: ['fond'] }, quinc: q('vis'),
      conseil: 'Glissez le(s) panneau(x) de fond dans les rainures arrière, puis vissez. Le fond assure l\'équerrage définitif du meuble.' });

    if (aEtageres) {
      // Une étagère sur perçage Ø32 se pose sur taquets ; une étagère FIXE
      // se monte avec le connecteur choisi pour elle. Ce n'est pas le même
      // geste, ni la même quincaillerie.
      var surTaquets = m.parts.some(function (p) { return p.role === 'etagere' && p.perc32; }) ||
                       rep.some(function (r) { return r.type === 'taquet'; });
      var cEt = surTaquets ? CONNECTEURS.taquet : cEtagere;
      etapes.push({ no: no++, titre: 'Installer les étagères',
        dessin: { eclate: 0.4, only: ['lateral','panneau','montant','etagere'], focus: ['etagere'] },
        quinc: qConn(cEt), zoom: cEt.symbole,
        conseil: cEt.preparer + ' ' + cEt.assembler });
    }

    if (aTiroirs) etapes.push({ no: no++, titre: 'Monter les tiroirs',
      dessin: { eclate: 0.5, only: ['lateral','panneau','montant','tiroir'], focus: ['tiroir'] }, quinc: q('vis'),
      conseil: 'Fixez les coulisses, assemblez les caissons de tiroir puis enclenchez-les sur leurs glissières.' });

    if (aPortes) etapes.push({ no: no++, titre: 'Poser les portes',
      dessin: { eclate: 0.5, only: ['lateral','panneau','montant','porte'], focus: ['porte'] }, quinc: q('charni'),
      conseil: 'Vissez les charnières dans les cuvettes Ø35 des portes, clipsez-les sur les embases, puis réglez l\'alignement (3 vis par charnière).' });

    if (aPlinthe) etapes.push({ no: no++, titre: 'Fixer la plinthe',
      dessin: { eclate: 0.45, only: ['lateral','panneau','plinthe'], focus: ['plinthe'] }, quinc: q('vis'),
      conseil: 'Clipsez ou vissez la plinthe sous le caisson. Mettez le meuble de niveau avant la pose finale.' });

    etapes.push({ no: no++, titre: 'Montage terminé', dessin: { eclate: 0 }, quinc: [],
      conseil: 'Vérifiez le bon fonctionnement des portes et tiroirs. Fixez le meuble au mur si sa hauteur dépasse sa profondeur (risque de basculement).' });
    return etapes;
  }

  // ═══════════════════════════════════════════════════════════════
  //  POINT D'ENTRÉE
  // ═══════════════════════════════════════════════════════════════
  function genererPlansMontagePDF(nomMeuble) {
    var jsPDFLib = global.jspdf ? global.jspdf.jsPDF : null;
    if (!jsPDFLib) { alert('jsPDF non disponible'); return; }
    var items = global._itemsCache || [];
    if (!items.length) { alert('Calculez d\'abord le meuble.'); return; }

    var pdf = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var m = analyser(items);
    var titre = nomMeuble || m.nom;
    var rep = m.hw;
    var etapes = construireEtapes(m, rep);
    var total = 4 + etapes.length; // couverture + sécurité + pièces + outils + étapes

    pageCouverture(pdf, m);
    pdf.addPage(); pageSecurite(pdf, m, titre, 2, total);
    pdf.addPage(); pageInventaire(pdf, m, titre, 3, total);
    pdf.addPage(); pageOutils(pdf, m, rep, titre, 4, total);
    etapes.forEach(function (et, i) { pdf.addPage(); pageEtape(pdf, m, et, titre, 5 + i, total); });

    var nf = (titre || 'notice').replace(/[^a-zA-Z0-9_-]/g, '_');
    pdf.save('notice-montage-' + nf + '.pdf');
  }

  global.genererPlansMontagePDF = genererPlansMontagePDF;
  // Le catalogue est exporté : il décrit l'assemblage livré, et sert autant
  // à la notice qu'aux contrôles (test-montage-connecteurs.js).
  global.WooderMontage = { generer: genererPlansMontagePDF, analyser: analyser,
                           construireEtapes: construireEtapes,
                           connecteurs: CONNECTEURS, connecteurInfo: connecteurInfo,
                           // exporté pour pouvoir RELIRE les dessins sur une
                           // planche de contrôle : un picto se juge à l'œil.
                           dessinerQuincaillerie: dessQuinc };

})(typeof window !== 'undefined' ? window : this);
