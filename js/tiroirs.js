/* ================================================================
   THE WOODER - tiroirs.js
   ================================================================
   Calcul des dimensions et pieces de caisson de tiroir en fonction
   du type de coulisse selectionne (bois ou metal).

   Pour chaque tiroir detecte dans les items importes :
   - calcule la hauteur de la facade et du caisson
   - calcule la largeur interieure selon le jeu lateral de la coulisse
   - calcule la profondeur selon la longueur nominale (NL) disponible
   - produit la liste des pieces (joues, devant, dos, fond)
     avec leurs epaisseurs propres (15/16/19mm joues bois,
     5mm fond bois, 8mm fond metal, 16mm dos metal)

   Alimente window._tiroirsCutlistExtra (consomme ensuite par
   calculerCutlist) et window._tiroirsDets (consomme par le prix
   et l'affichage).

   ----------------------------------------------------------------
   DEPENDANCES (lues depuis calcul.html)
   ----------------------------------------------------------------
   Fonctions externes :
     getCoulisseConfig()         - retourne la config de la coulisse
                                    selectionnee (jeuLat, epJoue,
                                    epFond, retrait, NLdispo, etc.)
     ouvrirSection(id)           - ouvre une section repliable
     formatMm(v)                 - formatte un nombre (mm) pour
                                    affichage
     esc(s)                      - escape HTML

   Variable globale lue :
     window._profMeubleRain      - profondeur du meuble (calculee
                                    dans calculerRainures)

   Variables globales ecrites :
     window._tiroirsCutlistExtra - liste des pieces de tiroir a
                                    ajouter au cutlist
     window._tiroirsDets         - details des tiroirs pour affichage

   Elements DOM :
     #epaisseur, #tiroirNb, #tiroirType, #tiroirJeu,
     #tiroirPieces, #badgeTiroirs, #tiroirInfo,
     #tbodyTiroirs, #tiroirCutlistExtra

   ----------------------------------------------------------------
   Usage : calculerTiroirs(items) appele depuis lancerCalcul,
   APRES calculerRainures (besoin de _profMeubleRain)
   et AVANT calculerCutlist (qui lit _tiroirsCutlistExtra).
   ================================================================ */

function calculerTiroirs(items) {
  var cfg = getCoulisseConfig();
  var profMeuble = window._profMeubleRain || 600;
  var ep0 = parseFloat(document.getElementById('epaisseur').value) || 19;
  var tp  = (items[0] && items[0].typePortes) || 'applique';

  // ── Déterminer les largeurs de colonnes depuis les étagères ──
  // La largeur du tiroir dépend de la colonne dans laquelle il se trouve,
  // PAS de la largeur de la façade (qui est plus petite si encastrée).
  var colWidths = [];
  for (var ci = 0; ci < items.length; ci++) {
    if (items[ci].type === 'etagere') {
      var pe = items[ci].p;
      // La dimension qui N'est PAS la profondeur = largeur de colonne
      var dL = Math.abs(pe.longueur - profMeuble);
      var dW = Math.abs(pe.largeur  - profMeuble);
      var wCol = (dL < dW) ? pe.largeur : pe.longueur;
      var deja = false;
      for (var k = 0; k < colWidths.length; k++) { if (Math.abs(colWidths[k] - wCol) < 5) { deja = true; break; } }
      if (!deja) colWidths.push(wCol);
    }
  }
  colWidths.sort(function(a,b) { return a - b; });

  var tiroirs = [], nbTotal = 0, nbPiecesAjoutees = 0;
  var cutlistExtra = []; // pièces supplémentaires à ajouter au débit

  for (var i = 0; i < items.length; i++) {
    var p = items[i].p, type = items[i].type;
    if (type !== 'tiroir') continue;

    // Déterminer hauteur vs largeur de la façade
    // Pour un tiroir, la largeur correspond à la colonne (≈ colonne width)
    // et la hauteur est l'autre dimension (généralement plus petite)
    var dim1 = p.longueur, dim2 = p.largeur;
    var hFacade, lFacade;
    if (colWidths.length > 0) {
      // La dimension la plus proche d'une colonne = largeur de façade
      var diff1 = 99999, diff2 = 99999;
      for (var dw = 0; dw < colWidths.length; dw++) {
        diff1 = Math.min(diff1, Math.abs(colWidths[dw] - dim1));
        diff2 = Math.min(diff2, Math.abs(colWidths[dw] - dim2));
      }
      if (diff1 < diff2) {
        lFacade = dim1; hFacade = dim2; // dim1 = largeur (proche colonne)
      } else {
        lFacade = dim2; hFacade = dim1; // dim2 = largeur (proche colonne)
      }
    } else {
      // Fallback : la plus grande = largeur (tiroir plus large que haut en général)
      lFacade = Math.max(dim1, dim2);
      hFacade = Math.min(dim1, dim2);
    }
    var nb = p.nombre;
    nbTotal += nb;

    // ── Trouver la colonne qui correspond à ce tiroir ──
    // Pour portes encastrées : façade < colonne (jeu ~3mm/côté)
    // Pour portes en applique : façade ≈ colonne + débordement
    // On cherche la colonne la plus proche par largeur
    var largColonne = lFacade; // fallback : utiliser la façade
    if (colWidths.length > 0) {
      var bestDiff = 99999;
      for (var cw = 0; cw < colWidths.length; cw++) {
        // La façade encastrée est toujours PLUS PETITE que la colonne
        // La façade en applique est toujours PLUS GRANDE que la colonne
        var diff = Math.abs(colWidths[cw] - lFacade);
        if (diff < bestDiff) { bestDiff = diff; largColonne = colWidths[cw]; }
      }
    }

    // Largeur intérieure du tiroir = largeur COLONNE - 2 × jeu latéral coulisse
    var largInt = Math.round(largColonne - 2 * cfg.jeuLat);
    // Profondeur tiroir : basée sur la longueur nominale de coulisse (NL)
    // NL + retrait ≤ profondeur meuble → NL max = profMeuble - retrait
    var NL, SKL;
    if (cfg.NLdispo && cfg.NLdispo.length > 0) {
      var NLmax = profMeuble - (cfg.retrait || 3);
      NL = cfg.NLdispo[0]; // fallback : la plus petite
      for (var ni = 0; ni < cfg.NLdispo.length; ni++) {
        if (cfg.NLdispo[ni] <= NLmax) NL = cfg.NLdispo[ni];
      }
      SKL = NL - 10; // Longueur tiroir Blum = NL - 10
    } else {
      NL = Math.round(profMeuble - (cfg.retrait || 3));
      SKL = NL; // pas de décalage accouplement pour les génériques
    }
    var profTiroir = SKL;

    var detail = { p: p, hFacade: hFacade, lFacade: lFacade, largInt: largInt,
                   largColonne: largColonne, profTiroir: profTiroir, NL: NL, nb: nb, pieces: [] };

    if (cfg.typeTir === 'bois') {
      // ── TIROIR BOIS : caisson complet ──
      var epJ = cfg.epJoue || 15;
      var epF = cfg.epFond || 5;
      var lonJoueOff   = cfg.lonJoueOffset || 0;      // Tandem: 10mm (accouplement)
      var rainurePosition = cfg.rainurePos || 12;      // position rainure fond depuis le bas de la joue
      var profRainureFond = 5;
      var jeuRainure = 1; // jeu par côté

      // Hauteur joue = façade - dépassements façade (bas + haut)
      var facadeOffset = (cfg.facadeDepassBas != null && cfg.facadeDepassHaut != null)
        ? cfg.facadeDepassBas + cfg.facadeDepassHaut
        : 25;
      var hCaisson = Math.round(hFacade - facadeOffset);

      // Longueur avant et arrière = largeur intérieure tiroir (SKW)
      var largAvantDos = largInt;
      // Largeur nette entre les 2 joues (pour vue de dessus)
      var largNette = largInt - 2 * epJ;
      // Longueur joue = SKL (accouplement déjà compté dans NL-10)
      var lonJoue = profTiroir;

      var hDevantDos, lonFond, largFond;

      if (cfg.rainure4Cotes) {
        // BILLES STANDARD : devant et dos = même hauteur que joues, rainure sur les 4 côtés
        hDevantDos = hCaisson;
        // Fond : rainure 5mm dans chaque pièce (joues G/D + devant + dos), -1mm jeu par côté
        largFond = largInt + 2 * (profRainureFond - jeuRainure);    // rainures dans joues G et D
        lonFond  = lonJoue - 2 * epJ + 2 * (profRainureFond - jeuRainure); // entre devant/dos + rainures
      } else {
        // TANDEM : devant et dos posés SUR le fond, rainure uniquement dans les joues
        hDevantDos = Math.round(hCaisson - rainurePosition - epF);
        largFond = largInt + 2 * profRainureFond - jeuRainure;      // rainures dans joues G et D
        lonFond  = lonJoue;                                          // le fond court sur toute la profondeur
      }

      detail.hCaisson = hCaisson;
      detail.facadeOffset = facadeOffset;
      detail.rainurePos = rainurePosition;
      detail.profRainureFond = profRainureFond;
      detail.rainure4Cotes = cfg.rainure4Cotes || false;
      detail.lonJoue = lonJoue;
      detail.pieces = [
        { nom: 'Joue tiroir',       l: lonJoue,       w: hCaisson,    ep: epJ, nb: 2 * nb, mat: 'Panneau ' + epJ + 'mm' },
        { nom: 'Devant tiroir',     l: largAvantDos,  w: hDevantDos,  ep: epJ, nb: 1 * nb, mat: 'Panneau ' + epJ + 'mm' },
        { nom: 'Dos tiroir',        l: largAvantDos,  w: hDevantDos,  ep: epJ, nb: 1 * nb, mat: 'Panneau ' + epJ + 'mm' },
        { nom: 'Fond tiroir',       l: lonFond,       w: largFond,    ep: epF, nb: 1 * nb, mat: 'Panneau ' + epF + 'mm (fond tiroir)' }
      ];
    } else {
      // ── TIROIR MÉTAL : seuls fond et dos sont en bois ──
      // Les joues métalliques sont fournies avec le système
      var epF = cfg.epFond || 8;
      // Largeur fond = largeur intérieure (les côtés métal s'emboîtent sur le fond)
      var largFond = largInt;

      detail.pieces = [
        { nom: 'Fond tiroir métal',  l: profTiroir, w: largFond, ep: epF, nb: 1 * nb, mat: 'Panneau ' + epF + 'mm (fond tiroir)' },
        { nom: 'Dos tiroir métal',   l: largFond,   w: 68,       ep: 16,  nb: 1 * nb, mat: 'Panneau 16mm' }
      ];
      // Hauteur du dos varie selon le système, on utilise 68mm par défaut (hauteur M)
      if (cfg.hauteurs && cfg.hauteurs.length > 0) {
        detail.hauteursMetal = cfg.hauteurs;
        // Utiliser la plus petite hauteur standard pour le dos par défaut
        detail.pieces[1].w = cfg.hauteurs[0];
      }
    }

    // Ajouter les pièces au cutlist extra
    for (var pi = 0; pi < detail.pieces.length; pi++) {
      var pc = detail.pieces[pi];
      cutlistExtra.push(pc);
      nbPiecesAjoutees += pc.nb;
    }

    tiroirs.push(detail);
  }

  // ── Affichage section tiroirs ──
  if (tiroirs.length === 0) return;

  document.getElementById('tiroirNb').textContent = nbTotal;
  document.getElementById('tiroirType').textContent = cfg.typeTir === 'metal' ? 'Métal' : 'Bois';
  document.getElementById('tiroirJeu').textContent = cfg.jeuLat + ' mm';
  document.getElementById('tiroirPieces').textContent = nbPiecesAjoutees;
  document.getElementById('badgeTiroirs').textContent = nbTotal + ' tiroir' + (nbTotal > 1 ? 's' : '') + ' — ' + cfg.nom;

  var infoHtml = '<b>' + cfg.nom + '</b> — Tiroir ' + (cfg.typeTir === 'metal' ? 'métallique' : 'bois') +
    ' — Jeu latéral : ' + cfg.jeuLat + ' mm/côté — Profondeur tiroir (SKL) : ' + (tiroirs.length > 0 ? tiroirs[0].profTiroir : '—') + ' mm' +
    (tiroirs.length > 0 && tiroirs[0].NL ? ' — Coulisse NL ' + tiroirs[0].NL + ' mm' : '');
  if (cfg.typeTir === 'metal' && cfg.hauteurs) {
    infoHtml += '<br><span style="font-size:11px;color:#888">Hauteurs standard disponibles : ' + cfg.hauteurs.join(', ') + ' mm</span>';
  }
  if (cfg.rainurePos) {
    var offsetTotal = (cfg.facadeDepassBas != null ? (cfg.facadeDepassBas + cfg.facadeDepassHaut) : 0);
    infoHtml += '<br><span style="font-size:11px;color:#888">Rainure fond à ' + cfg.rainurePos + ' mm du bas de la joue' +
      (offsetTotal > 0 ? ' — Façade dépasse : ' + cfg.facadeDepassBas + 'mm bas + ' + cfg.facadeDepassHaut + 'mm haut = ' + offsetTotal + 'mm' : '') +
      ' — Offset accouplement : ' + (cfg.lonJoueOffset||0) + ' mm — Ép. max joue : ' + (cfg.epJoueMax||cfg.epJoue) + ' mm</span>';
  }
  document.getElementById('tiroirInfo').innerHTML = infoHtml;

  // Tableau détail
  var tbody = document.getElementById('tbodyTiroirs');
  tbody.innerHTML = '';
  for (var ti = 0; ti < tiroirs.length; ti++) {
    var d = tiroirs[ti];
    var piecesHtml = d.pieces.map(function(pc) {
      return pc.nom + ' ' + formatMm(pc.l) + '×' + formatMm(pc.w) + '×' + pc.ep + 'mm (×' + pc.nb + ')';
    }).join('<br>');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="font-size:11px"><b>' + esc(d.p.designation) + '</b></td>' +
      '<td>' + d.hFacade + ' × ' + d.lFacade + ' mm</td>' +
      '<td><span class="badge b-tiroir">' + cfg.nom + '</span></td>' +
      '<td>' + d.largColonne + ' mm</td>' +
      '<td><b>' + d.largInt + ' mm</b></td>' +
      '<td>' + d.profTiroir + ' mm</td>' +
      '<td style="font-size:10px">' + piecesHtml + '</td>';
    tbody.appendChild(tr);
  }

  // Liste des pièces supplémentaires pour le cutlist
  if (cutlistExtra.length > 0) {
    var extraHtml = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);margin-bottom:6px">Pièces caisson à ajouter au débit</div>';
    extraHtml += '<div class="scroll"><table><thead><tr><th>Pièce</th><th>Longueur</th><th>Largeur</th><th>Ép.</th><th>Qté</th><th>Matériau</th></tr></thead><tbody>';
    for (var ci = 0; ci < cutlistExtra.length; ci++) {
      var pc = cutlistExtra[ci];
      extraHtml += '<tr><td>' + pc.nom + '</td><td>' + formatMm(pc.l) + ' mm</td><td>' + formatMm(pc.w) + ' mm</td><td>' + pc.ep + ' mm</td><td>' + pc.nb + '</td><td style="font-size:10px">' + pc.mat + '</td></tr>';
    }
    extraHtml += '</tbody></table></div>';
    document.getElementById('tiroirCutlistExtra').innerHTML = extraHtml;
  }

  // Stocker pour utilisation dans le calcul de prix et cutlist
  window._tiroirsCutlistExtra = cutlistExtra;
  window._tiroirsDets = tiroirs;

  ouvrirSection('secTiroirs');
}
