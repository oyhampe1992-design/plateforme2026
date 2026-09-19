/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — wooder-plan2d-editeur.js  (v2)
   Éditeur 2D vue de face d'un meuble, en CASES IMBRIQUÉES.
   Chaque case (compartiment) peut être re-divisée par une étagère
   (division horizontale) ou un montant (division verticale) — y compris
   des petits montants LOCAUX entre deux étagères.

   Module 100% autonome : ne dépend d'aucun autre script et ne touche
   pas au pipeline de calcul. Communique via le modèle + onChange.

   ── Modèle ─────────────────────────────────────────────────────────
   {
     H, L, P, ep,        // hors-tout + épaisseur panneau (mm)
     racine: cellule     // arbre de cases (espace intérieur)
   }
   cellule (feuille) = {}                       // compartiment vide
   cellule (divisée) = {
     sens: 'h' | 'v',    // 'h' = étagères (enfants empilés bas→haut)
                         // 'v' = montants  (enfants gauche→droite)
     tailles: [mm, …],   // taille libre de chaque enfant le long de l'axe
     enfants: [cellule, …]
   }
   Compat : un modèle { …, colonnes:[{largeur,etageres:[…]}] } est
   automatiquement converti en arbre.

   ── API ────────────────────────────────────────────────────────────
   var inst = WooderPlan2D.creer(container, { modele, onChange, lectureSeule });
   inst.getModele();  inst.setModele(m);  inst.detruire();
═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SNAP   = 5;
  var EP_DEF = 19;
  var MIN_CASE = 20;   // taille mini d'une case (mm)
  var JEU_APPLIQUE = 3; // jeu total entre 2 façades en applique (mm)
  var JEU_ENCASTRE = 2; // jeu périphérique d'une façade encastrée (mm)
  var COUL_ETAGERE = '#2e9e7b'; // vert — symbole étagère (trait horizontal)
  var COUL_MONTANT = '#c2792b'; // orange — symbole montant (trait vertical)
  var COUL_SUPPR   = '#c0392b'; // rouge — bouton supprimer une séparation
  var COUL_PORTE   = '#4F5E3C'; // brun accent — bouton « + porte sur toute la colonne »

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function snap(v)        { return Math.round(v / SNAP) * SNAP; }
  function isFeuille(c)   { return !c || !c.sens; }

  function svg(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function htm(tag, attrs, txt) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (txt != null) e.textContent = txt;
    return e;
  }

  // ── Modèle par défaut / conversions ────────────────────────────
  function modeleDefaut() {
    return { H: 2000, L: 1000, P: 600, ep: EP_DEF, racine: {} };
  }
  function hauteurInterieure(m) { return m.H - 2 * m.ep; }
  function largeurInterieure(m) { return m.L - 2 * m.ep; }

  // Convertit l'ancien format { colonnes:[…] } en arbre
  function depuisColonnes(m) {
    var ep = m.ep, Hi = hauteurInterieure(m);
    function colVersCase(col) {
      var ps = (col.etageres || []).slice().sort(function (a, b) { return a - b; });
      if (!ps.length) return {};
      var tailles = [], bas = 0;
      for (var i = 0; i < ps.length; i++) { tailles.push(Math.max(MIN_CASE, ps[i] - bas)); bas = ps[i] + ep; }
      tailles.push(Math.max(MIN_CASE, Hi - bas));
      return { sens: 'h', tailles: tailles, enfants: tailles.map(function () { return {}; }) };
    }
    var cols = m.colonnes && m.colonnes.length ? m.colonnes : [{}];
    if (cols.length === 1) return colVersCase(cols[0]);
    return {
      sens: 'v',
      tailles: cols.map(function (c) { return c.largeur || (largeurInterieure(m) - (cols.length - 1) * ep) / cols.length; }),
      enfants: cols.map(colVersCase)
    };
  }
  function normaliserModele(m) {
    if (m.ep == null) m.ep = EP_DEF;
    if (!m.racine) {
      if (m.colonnes) m.racine = depuisColonnes(m);
      else m.racine = {};
    }
    return m;
  }

  // ── Répartition des tailles sur un axe (cœur commun 2D / 3D / débit) ──
  // Répartit S entre les k enfants, proportionnellement aux tailles demandées,
  // avec un minimum par case.
  //
  // Règle importante : les cases qui tomberaient sous le minimum sont ÉPINGLÉES
  // au minimum et le reste est redistribué entre les autres, itérativement.
  // (Avant : tout l'écart était absorbé par la DERNIÈRE case, qui pouvait
  // devenir négative — la pièce disparaissait du dessin et les séparations
  // suivantes sortaient du meuble. Cf. [3000,20,20,…] dans 1000 mm.)
  //
  // Si le meuble est trop étroit pour k cases au minimum, le minimum effectif
  // est abaissé à la part égale : mieux vaut des cases plus petites que prévu
  // qu'un dessin qui déborde du meuble.
  function repartirTailles(taillesIn, k, S, ep) {
    var i, dispo = S - (k - 1) * ep;
    if (!(dispo > 0)) dispo = Math.max(1, k);      // cas dégénéré : jamais de négatif
    var mini = Math.min(MIN_CASE, dispo / k);
    var t = [];
    for (i = 0; i < k; i++) { var v = parseFloat(taillesIn && taillesIn[i]); t.push(isFinite(v) && v > 0 ? v : 0); }
    var somme = t.reduce(function (a, b) { return a + b; }, 0);
    if (somme <= 0) t = t.map(function () { return dispo / k; });

    var epingle = t.map(function () { return false; }), r = t.slice(), tour = 0;
    while (tour++ <= k) {
      var reste = dispo, sommeLibre = 0;
      for (i = 0; i < k; i++) { if (epingle[i]) reste -= mini; else sommeLibre += t[i]; }
      var f = sommeLibre > 0 ? reste / sommeLibre : 0;
      var change = false;
      for (i = 0; i < k; i++) {
        if (epingle[i]) { r[i] = mini; continue; }
        r[i] = t[i] * f;
        if (r[i] < mini) { epingle[i] = true; change = true; }
      }
      if (!change) break;
    }
    // arrondi : l'écart résiduel va sur la plus grande case, jamais sous le mini
    var s2 = r.reduce(function (a, b) { return a + b; }, 0), diff = dispo - s2;
    if (Math.abs(diff) > 1e-9) {
      var idx = 0;
      for (i = 1; i < k; i++) if (r[i] > r[idx]) idx = i;
      r[idx] = Math.max(mini, r[idx] + diff);
    }
    return r;
  }

  // Rescale les tailles d'un nœud pour remplir exactement S (axe), mini MIN_CASE
  function normaliserTailles(node, S, ep) {
    node.tailles = repartirTailles(node.tailles, node.enfants.length, S, ep);
  }

  // ── Matériaux ────────────────────────────────────────────────────
  // type d'un élément d'après sa clé : 'caisson' | 'etagere' | 'montant'
  function typeDeKey(key) {
    if (key && key.indexOf('facade:') === 0) return 'facade';
    if (key && key.indexOf('sep:') === 0) return key.split(':')[1] === 'h' ? 'etagere' : 'montant';
    // le fileur et la plinthe sont des pièces d'habillage : catégorie à part,
    // pour pouvoir leur donner une autre matière que le caisson.
    if (key === 'fileur' || key === 'plinthe') return 'fileur';
    return 'caisson';
  }
  function trouverMat(materiaux, id) {
    if (!materiaux) return null;
    for (var i = 0; i < materiaux.length; i++) if (materiaux[i].id === id) return materiaux[i];
    return null;
  }
  // id du matériau d'un élément : override par pièce → défaut par type → défaut meuble
  function materiauIdElement(m, key) {
    var t = typeDeKey(key);
    return (m.mat && m.mat[key]) || (m.matType && m.matType[t]) || m.materiauDefaut || null;
  }
  // Sens du fil du bois d'un élément, même cascade que le matériau.
  //   'long'  = fil dans la LONGUEUR de la pièce (défaut, débit standard)
  //   'trav'  = fil en TRAVERS
  // Sert au rendu 3D (orientation du décor) et, à terme, au sens de débit.
  function filElement(m, key) {
    var t = typeDeKey(key);
    return (m.fil && m.fil[key]) || (m.filType && m.filType[t]) || m.filDefaut || 'long';
  }
  // teinte de rendu déduite du nom / de la famille (le catalogue ne stocke pas de couleur)
  var COULEURS_MAT = [
    [/noir|graphite|soft black|thermo noir|anthracite|chocolat noir/, '#33312e', '#1c1b19', 1],
    [/gris (clair|perle|angora|cachemire|c[ée]ladon)/, '#cbc8bf', '#a7a399', 0],
    [/gris|b[ée]ton|ardoise|textile|metallic|inox/, '#b4b1a8', '#908c82', 0],
    [/noyer|walnut|weng[ée]|chesterfield|pure walnut/, '#6d4a30', '#4d3220', 1],
    [/ch[êe]ne|oak|bardolino|lancaster|kendal|nebraska|querkus/, '#d4b483', '#a37f4f', 0],
    [/fr[êe]ne|bouleau|h[êe]tre|[ée]rable|\bpin\b|atlas|shinnoki|peuplier|okoum[ée]|latt[ée]/, '#e4caa0', '#bb9a66', 0],
    [/bleu/, '#6a86a3', '#465f74', 1],
    [/vert/, '#7c9079', '#566a54', 1],
    [/rouge|bordeaux|grenat|oxyde|terracotta|brun violine/, '#a05a52', '#783f39', 1],
    [/orange|caramel|havane/, '#c88a52', '#9c6736', 0],
    [/jaune|citron/, '#dcc66a', '#b39f44', 0],
    [/marbre|coquille|cr[èe]me|beige|sable|amande|nude|nature/, '#e7dac2', '#c4b698', 0],
    [/blanc|kaolin|craie|alpin|premium|alb[âa]tre|[ée]cru|cass[ée]/, '#f4f2ec', '#d6d0c2', 0],
    [/mdf|medium/, '#cdab84', '#a4814f', 0],
    [/contreplaqu|^cp |hdf|isorel|agglom/, '#e0cba0', '#b89d6a', 0]
  ];
  function couleurMateriau(mat) {
    if (!mat) return { fill: '#d9b98a', stroke: '#9c7b4f', texte: '#1f1f1d' };
    var s = ((mat.nom || '') + ' ' + (mat.famille || '')).toLowerCase();
    for (var i = 0; i < COULEURS_MAT.length; i++) {
      if (COULEURS_MAT[i][0].test(s)) return { fill: COULEURS_MAT[i][1], stroke: COULEURS_MAT[i][2], texte: COULEURS_MAT[i][3] ? '#fff' : '#1f1f1d' };
    }
    return { fill: '#d9b98a', stroke: '#9c7b4f', texte: '#1f1f1d' };
  }
  function couleurElement(m, key, materiaux) {
    return couleurMateriau(trouverMat(materiaux, materiauIdElement(m, key)));
  }

  // ════════════════════════════════════════════════════════════════
  function creer(container, opts) {
    opts = opts || {};
    var modele = normaliserModele(opts.modele ? JSON.parse(JSON.stringify(opts.modele)) : modeleDefaut());
    var lectureSeule = !!opts.lectureSeule;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    var materiaux = opts.materiaux || [];
    if (opts.materiauDefaut && modele.materiauDefaut == null) modele.materiauDefaut = opts.materiauDefaut;

    var outil   = 'select';     // 'select' | 'etagere' | 'montant' | 'porte' | 'tiroir' | 'accessoires' | 'perc32' | 'materiau'
    var selPath = null;         // chemin de la case sélectionnée (feuille)
    var leafRects = {};         // path.join('-') -> {x,y,w,h}

    // ── DOM ──────────────────────────────────────────────────────
    container.innerHTML = '';
    var root = htm('div', { style: 'font-family:inherit' });
    container.appendChild(root);

    function btnStyle(actif) {
      return 'min-height:44px;padding:10px 14px;font:inherit;font-size:14px;font-weight:600;border-radius:8px;' +
             'cursor:pointer;-webkit-tap-highlight-color:transparent;border:1.5px solid #4F5E3C;' +
             (actif ? 'background:#4F5E3C;color:#fff;' : 'background:#fff;color:#4F5E3C;');
    }

    // Barre dimensions
    var bar = htm('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px' });
    root.appendChild(bar);
    function champNum(label, val, min, max, step, onInput) {
      var wrap = htm('div', { style: 'display:flex;flex-direction:column;gap:3px' });
      wrap.appendChild(htm('label', { style: 'font-size:11px;color:#6b6b66;font-weight:500' }, label));
      var inp = htm('input', { type: 'number', value: val, inputmode: 'numeric',
        style: 'width:84px;min-height:40px;padding:6px 10px;border:1px solid #e3dfd3;border-radius:8px;font:inherit;font-size:16px' });
      if (min != null) inp.min = min; if (max != null) inp.max = max; if (step != null) inp.step = step;
      if (lectureSeule) inp.disabled = true;
      inp.addEventListener('input', function () { var v = parseFloat(inp.value); if (!isNaN(v)) onInput(v); });
      wrap.appendChild(inp); wrap._input = inp; return wrap;
    }
    var champH  = champNum('Hauteur (mm)',    modele.H,  100, 4000, 1, function (v) { modele.H = v; maj(); });
    var champL  = champNum('Largeur (mm)',    modele.L,  100, 4000, 1, function (v) { modele.L = v; maj(); });
    var champP  = champNum('Profondeur (mm)', modele.P,  50,  1200, 1, function (v) { modele.P = v; emettre(); });
    var champEp = champNum('Épaisseur (mm)',  modele.ep, 5,   60, 0.5, function (v) { modele.ep = v; maj(); });
    // « Nb colonnes » : superflu quand on pose les séparations avec l'outil
    // « + Montant ». La page hôte peut le retirer (opts.champColonnes = false).
    var champNc = champNum('Nb colonnes',     nbColonnes(), 1, 12, 1, function (v) { setNbColonnes(Math.round(v)); });
    var avecNc = (opts.champColonnes !== false);
    [champH, champL, champP, champEp].concat(avecNc ? [champNc] : [])
      .forEach(function (c) { bar.appendChild(c); });

    // ── Mode de construction : sélecteur VISUEL (vignettes) ──────
    // Vignette du mode courant + libellé + bouton « Changer » qui ouvre la
    // grille visuelle (WooderModeConstruction.creerPicker). Remplace l'ancien
    // menu déroulant texte : on voit le visuel dès le départ.
    var modeOverlay = null, modePickerApi = null, _syncMode = function () {};
    var _MC = (typeof WooderModeConstruction !== 'undefined') ? WooderModeConstruction : null;
    if (_MC && _MC.creerPicker && _MC.obtenirListe && _MC.obtenirListe().length && !lectureSeule) {
      // défaut : 1er mode si rien de choisi (pour que le débit ait toujours un mode)
      if (!modele.modeConstruction) modele.modeConstruction = _MC.obtenirListe()[0].id;

      var wrapMode = htm('div', { style: 'display:flex;flex-direction:column;gap:3px' });
      wrapMode.appendChild(htm('label', { style: 'font-size:11px;color:#6b6b66;font-weight:500' }, 'Mode de construction'));
      var ligneMode = htm('div', { style: 'display:flex;align-items:center;gap:8px' });
      var thumb = htm('div', { style: 'width:56px;height:42px;border:1px solid #e3dfd3;border-radius:6px;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;flex:0 0 auto' });
      var lblMode = htm('div', { style: 'font-size:12px;color:#6b6b66;max-width:150px;line-height:1.2' }, '');
      var btnMode = htm('button', { type: 'button', style: btnStyle(false) + 'min-height:40px;padding:8px 12px' }, '🔧 Changer');
      ligneMode.appendChild(thumb); ligneMode.appendChild(lblMode); ligneMode.appendChild(btnMode);
      wrapMode.appendChild(ligneMode); bar.appendChild(wrapMode);

      function majVignetteMode() {
        var a = modele.modeConstruction ? _MC.obtenirAttributs(modele.modeConstruction) : null;
        thumb.innerHTML = (a && a.svg) ? a.svg : '';
        var s = thumb.querySelector('svg');
        if (s) { s.setAttribute('preserveAspectRatio', 'xMidYMid meet'); s.style.width = '100%'; s.style.height = '100%'; }
        lblMode.textContent = a ? (a.label || a.id) : 'À choisir';
      }

      // overlay modal (grille visuelle)
      modeOverlay = htm('div', { style: 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px' });
      var modal = htm('div', { style: 'background:#fff;border-radius:12px;max-width:900px;width:100%;padding:16px 18px;box-shadow:0 12px 44px rgba(0,0,0,.3)' });
      var head = htm('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px' });
      head.appendChild(htm('div', { style: 'font-size:16px;font-weight:700' }, 'Mode de construction'));
      var btnOk = htm('button', { type: 'button', style: btnStyle(true) }, '✓ Valider');
      head.appendChild(btnOk); modal.appendChild(head);
      var pickerHost = htm('div', {}); modal.appendChild(pickerHost);
      modeOverlay.appendChild(modal); document.body.appendChild(modeOverlay);

      function ouvrirPicker() {
        modeOverlay.style.display = 'flex';
        // (Re)démarre le PROCESSUS GUIDÉ à chaque ouverture : 2 questions (caissons
        // séparés ? + pose au sol : montants/plinthe encastrée OU pieds/socle) puis
        // les modes correspondants — au lieu de sauter directement à la grille.
        modePickerApi = _MC.creerPicker(pickerHost, {
          selected: modele.modeConstruction || null,
          forcerAssistant: true,
          // la page hôte peut imposer « un meuble = un caisson » (éditeur de
          // meuble : pour plusieurs caissons on ajoute plusieurs meubles)
          caissonUnique: !!opts.caissonUnique,
          // Branche pieds/socle (Q2 « pose au sol ») : même parcours complet que calcul
          piedsActive:    !!(modele.pieds && modele.pieds.active),
          hauteurPlinthe: (modele.pieds && modele.pieds.hauteurPlinthe) || 100,
          onSelect: function (id) { modele.modeConstruction = id; majVignetteMode(); maj(); },
          onPiedsChange: function (etat) {
            modele.pieds = { active: !!etat.active, hauteurPlinthe: (etat && etat.hauteurPlinthe) || 100 };
            maj();
          }
        });
      }
      function fermerPicker() { modeOverlay.style.display = 'none'; }
      btnMode.addEventListener('click', ouvrirPicker);
      btnOk.addEventListener('click', fermerPicker);
      modeOverlay.addEventListener('click', function (e) { if (e.target === modeOverlay) fermerPicker(); });

      _syncMode = majVignetteMode;   // permet de resynchroniser la vignette depuis maj()
      majVignetteMode();
    }

    // Barre d'outils
    var toolbar = htm('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px' });
    root.appendChild(toolbar);
    var btnSel, btnEt, btnMo, btnMat, btnPorte, btnTiroir, btnPend, btnPerc, btnColsEq, btnEtEq, barreCtx;
    if (!lectureSeule) {
      btnSel = htm('button', { style: btnStyle(true) }, '👆 Sélection');
      btnEt  = htm('button', { style: btnStyle(false) }, '⊞ + Étagère');
      btnMo  = htm('button', { style: btnStyle(false) }, '▯ + Montant');
      btnPorte  = htm('button', { style: btnStyle(false) }, '🚪 Porte');
      btnTiroir = htm('button', { style: btnStyle(false) }, '🗄 Tiroir');
      btnPend   = htm('button', { style: btnStyle(false) }, '🧰 Accessoires');
      btnPerc   = htm('button', { style: btnStyle(false) }, '🕳 Perçages 32');
      btnSel.addEventListener('click', function () { setOutil('select'); });
      btnEt.addEventListener('click',  function () { setOutil('etagere'); });
      btnMo.addEventListener('click',  function () { setOutil('montant'); });
      btnPorte.addEventListener('click',  function () { setOutil('porte'); });
      btnTiroir.addEventListener('click', function () { setOutil('tiroir'); });
      btnPend.addEventListener('click',   function () { setOutil('accessoires'); });
      btnPerc.addEventListener('click',   function () { setOutil('perc32'); });
      [btnSel, btnEt, btnMo, btnPorte, btnTiroir, btnPend, btnPerc].forEach(function (b) { toolbar.appendChild(b); });
      if (materiaux.length) {
        btnMat = htm('button', { style: btnStyle(false) }, '🎨 Matériau');
        btnMat.addEventListener('click', function () { setOutil('materiau'); });
        toolbar.appendChild(btnMat);
      }
      // Barre contextuelle : actions liées à l'étape courante (sous la barre d'étapes)
      barreCtx = htm('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;min-height:0' });
      root.appendChild(barreCtx);
      btnColsEq = htm('button', { style: btnStyle(false) + 'border-style:dashed;' }, '⊟ Colonnes égales');
      btnColsEq.addEventListener('click', function () { colonnesEgales(); });
      btnEtEq = htm('button', { style: btnStyle(false) + 'border-style:dashed;' }, '⊞ Étagères égales');
      btnEtEq.addEventListener('click', function () { etageresEgales(); });
    }
    function majBarreCtx(o) {
      if (!barreCtx) return;
      barreCtx.innerHTML = '';
      if (o === 'montant') barreCtx.appendChild(btnColsEq);   // étape montants → colonnes égales
      else if (o === 'etagere') barreCtx.appendChild(btnEtEq); // étape étagères → étagères égales
    }
    function setOutil(o) {
      outil = o; selPath = null;
      if (btnSel) btnSel.style.cssText = btnStyle(o === 'select');
      if (btnEt)  btnEt.style.cssText  = btnStyle(o === 'etagere');
      if (btnMo)  btnMo.style.cssText  = btnStyle(o === 'montant');
      if (btnPorte)  btnPorte.style.cssText  = btnStyle(o === 'porte');
      if (btnTiroir) btnTiroir.style.cssText = btnStyle(o === 'tiroir');
      if (btnPend)   btnPend.style.cssText   = btnStyle(o === 'accessoires');
      if (btnPerc)   btnPerc.style.cssText   = btnStyle(o === 'perc32');
      if (btnMat) btnMat.style.cssText = btnStyle(o === 'materiau');
      majAide(o);
      majBarreCtx(o);
      // la page hôte peut réagir au changement d'outil (ex. afficher la liste
      // des matériaux uniquement quand l'outil « Matériau » est actif)
      if (typeof opts.onOutil === 'function') { try { opts.onOutil(o); } catch (e) {} }
      rendre();
    }

    // Aide CONTEXTUELLE : un message court, propre à l'outil actif (au lieu
    // d'un gros pavé qui décrit tous les outils en même temps).
    var AIDE_OUTILS = {
      select:  'Clique une case pour la sélectionner, puis ajoute une étagère ou un montant. Glisse une séparation pour la déplacer.',
      etagere: 'Étagère : clique dans une case pour poser une étagère horizontale. Glisse-la pour l’ajuster. « Étagères égales » répartit la colonne.',
      montant: 'Montant : clique dans une case pour poser une séparation verticale. « Colonnes égales » répartit la largeur.',
      porte:   'Porte : clique une colonne pour poser une porte pleine hauteur. Re-clique la porte pour l’éditer (sens, double, volumes).',
      tiroir:  'Tiroir : clique une case pour poser une façade tiroir. Re-clique-la pour régler le nombre et les hauteurs.',
      accessoires:'Accessoires : clique une case pour choisir ce qu’on y pose (tringle de penderie…). La liste s’étoffera.',
      perc32:  'Perçages Ø32 : clique une case pour cycler aucun → Ø32 volume → Ø32 colonne → aucun (re-clique encore pour retirer). Sans Ø32 = étagères fixes + connecteur.',
      materiau:'Matériau : clique un panneau, une étagère ou un montant pour choisir sa matière.'
    };
    var aide = htm('p', { style: 'font-size:12px;color:#6b6b66;margin:0 0 10px;min-height:16px' }, AIDE_OUTILS.select);
    function majAide(o) { aide.textContent = AIDE_OUTILS[o] || AIDE_OUTILS.select; }
    if (!lectureSeule) root.appendChild(aide);

    // Zone SVG
    var svgWrap = htm('div', { style:
      'position:relative;background:#fff;border:1px solid #e3dfd3;border-radius:10px;padding:14px;overflow:auto' });
    root.appendChild(svgWrap);

    var PAD = 80;
    var svgEl;

    // ── Navigation dans l'arbre ──────────────────────────────────
    function caseAt(path) { var c = modele.racine; for (var i = 0; i < path.length; i++) c = c.enfants[path[i]]; return c; }
    function parentDe(path) {
      if (!path.length) return null;
      return { node: caseAt(path.slice(0, -1)), idx: path[path.length - 1] };
    }
    function nbColonnes() { return modele.racine.sens === 'v' ? modele.racine.enfants.length : 1; }

    // Index de colonne dont il faut ouvrir la saisie de largeur après le rendu
    // (une colonne vient d'être ajoutée). Null le reste du temps.
    var _saisieLargeurCol = null;

    function setNbColonnes(n) {
      n = clamp(n, 1, 12);
      var r = modele.racine;
      if (n === 1) {
        // 1 colonne : si déjà 'v', garde la 1re ; sinon laisse tel quel
        if (r.sens === 'v') modele.racine = r.enfants[0];
        maj(); return;
      }
      if (r.sens !== 'v') {
        // enveloppe le contenu actuel comme 1re colonne
        var Wi = largeurInterieure(modele);
        var w = (Wi - (n - 1) * modele.ep) / n;
        modele.racine = { sens: 'v', tailles: [], enfants: [] };
        modele.racine.enfants.push(r);
        for (var i = 1; i < n; i++) modele.racine.enfants.push({});
        modele.racine.tailles = modele.racine.enfants.map(function () { return w; });
      } else {
        var cur = r.enfants.length;
        if (n > cur) {
          // Une nouvelle colonne naît à la largeur MOYENNE des colonnes
          // existantes (avant : MIN_CASE = 20 mm → une lamelle invisible à
          // droite, le meuble avait l'air de ne pas réagir). La saisie de
          // largeur s'ouvre ensuite sur la 1re colonne ajoutée.
          var somme = 0;
          for (var s = 0; s < cur; s++) somme += (r.tailles[s] || 0);
          var moy = cur > 0 && somme > 0 ? somme / cur : largeurInterieure(modele) / n;
          for (var j = cur; j < n; j++) { r.enfants.push({}); r.tailles.push(Math.max(MIN_CASE, moy)); }
          _saisieLargeurCol = cur;      // → popup ouverte à la fin du rendu
        }
        else { r.enfants.length = n; r.tailles.length = n; }
      }
      selPath = null; maj();
    }

    function colonnesEgales() {
      var r = modele.racine;
      if (r.sens === 'v') {
        var Wi = largeurInterieure(modele);
        var w = (Wi - (r.enfants.length - 1) * modele.ep) / r.enfants.length;
        r.tailles = r.enfants.map(function () { return w; });
      }
      maj();
    }
    // Répartit également toutes les étagères (splits horizontaux), à tous les niveaux.
    // tailles=0 → le rendu (normaliserTailles) redistribue en parts égales.
    function etageresEgales() {
      (function walk(cell) {
        if (isFeuille(cell)) return;
        if (cell.sens === 'h') cell.tailles = cell.enfants.map(function () { return 0; });
        cell.enfants.forEach(walk);
      })(modele.racine);
      maj();
    }

    // Ajoute une étagère (h) ou un montant (v) dans la case `path`
    function ajouter(path, type) {
      var sens = type === 'etagere' ? 'h' : 'v';
      var ep = modele.ep;
      var info = parentDe(path);
      if (info && info.node.sens === sens) {
        // insertion à plat dans le parent (même orientation)
        var node = info.node, i = info.idx;
        var old = node.tailles[i];
        var half = Math.max(MIN_CASE, (old - ep) / 2);
        node.tailles[i] = half;
        node.tailles.splice(i + 1, 0, half);
        node.enfants.splice(i + 1, 0, {});
      } else {
        // conversion de la feuille en case divisée (2 parts égales)
        var r = leafRects[path.join('-')] || { w: largeurInterieure(modele), h: hauteurInterieure(modele) };
        var S = sens === 'h' ? r.h : r.w;
        var hh = Math.max(MIN_CASE, (S - ep) / 2);
        var nouvelle = { sens: sens, tailles: [hh, hh], enfants: [{}, {}] };
        // Conserver les marqueurs de la case d'origine (perçages Ø32, penderie) :
        // diviser une colonne en étagères ne doit PAS effacer ses perçages.
        var ancienne = info ? info.node.enfants[info.idx] : modele.racine;
        if (ancienne && ancienne.perc32)   nouvelle.perc32   = ancienne.perc32;
        if (ancienne && ancienne.penderie) nouvelle.penderie = ancienne.penderie;
        if (info) info.node.enfants[info.idx] = nouvelle;
        else modele.racine = nouvelle;
      }
      selPath = null; maj();
    }

    // Cycle le mode de perçages 32 d'une case : aucun → volume → colonne → aucun.
    //  'volume'  = trame 32 uniquement dans ce volume (étagères modulables localement)
    //  'colonne' = trame 32 sur toute la colonne contenant cette case (étagères modulables)
    //  aucun     = étagères fixes → connecteur intégré aux positions exactes dans les fichiers fab
    function cyclePerc32(path) {
      var cell = caseAt(path);
      var cur = cell.perc32 || null;
      // Si la case n'a pas de marqueur local mais que sa colonne est en 'colonne',
      // l'état courant EST 'colonne' → le cycle peut aller jusqu'à la suppression.
      // (Sinon un re-clic rajoutait un 'volume' par-dessus → impossible de retirer.)
      // Meuble à UNE seule colonne (racine pas en montants) : la « colonne »,
      // c'est le meuble entier → le marqueur vit sur la racine.
      var mono = modele.racine.sens !== 'v';
      if (!cur) {
        if (!mono && path.length >= 1 && modele.racine.enfants[path[0]].perc32 === 'colonne') cur = 'colonne';
        else if (mono && modele.racine.perc32 === 'colonne') cur = 'colonne';
      }
      var next = cur === null ? 'volume' : (cur === 'volume' ? 'colonne' : null);
      function _clr(c) { if (!c) return; if (c.perc32) delete c.perc32; if (c.enfants) c.enfants.forEach(_clr); }
      if (next === 'colonne') {
        // applique sur la colonne entière, et retire les marqueurs locaux dessous
        var r = modele.racine;
        if (!mono && path.length >= 1) {
          var col = r.enfants[path[0]];
          _clr(col); col.perc32 = 'colonne';
        } else {
          _clr(r); r.perc32 = 'colonne';
        }
      } else if (next === null) {
        delete cell.perc32;
        // si la colonne (ou le meuble entier) portait 'colonne', l'enlever aussi
        var rr = modele.racine;
        if (!mono && path.length >= 1 && rr.enfants[path[0]].perc32 === 'colonne') delete rr.enfants[path[0]].perc32;
        else if (mono && rr.perc32 === 'colonne') delete rr.perc32;
      } else {
        cell.perc32 = 'volume';
      }
      maj();
    }

    // Liste des accessoires posables dans une case. Volontairement ouverte :
    // ajouter une entrée ici suffit à la voir apparaître dans le menu.
    //   cle  = champ posé sur la cellule du modèle
    //   test = comment savoir s'il est déjà là
    var ACCESSOIRES = [
      { cle: 'penderie', lib: 'Tringle de penderie', desc: 'Barre horizontale en haut de la case.' }
    ];
    function ouvrirAccessoires(path, svgCx, svgCy) {
      svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); });
      var cell = caseAt(path);
      var ctm = svgEl.getScreenCTM(), pt = svgEl.createSVGPoint();
      pt.x = svgCx; pt.y = svgCy;
      var sp = pt.matrixTransform(ctm), wr = svgWrap.getBoundingClientRect();
      var pop = htm('div', { class: 'w2d-pop', style:
        'position:absolute;z-index:20;display:flex;flex-direction:column;gap:8px;background:#fff;' +
        'border:1.5px solid #4F5E3C;border-radius:10px;padding:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);width:250px' });
      pop.style.left = clamp(sp.x - wr.left + svgWrap.scrollLeft - 125, 4, Math.max(4, svgWrap.clientWidth - 254)) + 'px';
      pop.style.top  = clamp(sp.y - wr.top + svgWrap.scrollTop - 10, 4, 100000) + 'px';
      pop.appendChild(htm('div', { style: 'font-size:12px;color:#6b6b66;font-weight:600' }, 'Accessoires de cette case'));
      ACCESSOIRES.forEach(function (a) {
        var pose = !!cell[a.cle];
        var b = htm('button', { style: 'text-align:left;min-height:44px;padding:8px 10px;border-radius:8px;font:inherit;cursor:pointer;' +
          (pose ? 'border:none;background:#4F5E3C;color:#fff' : 'border:1px solid #4F5E3C;background:#fff;color:#4F5E3C') });
        b.innerHTML = '<div style="font-weight:700;font-size:13px">' + (pose ? '✓ ' : '+ ') + a.lib + '</div>' +
                      '<div style="font-size:11px;opacity:.8">' + a.desc + '</div>';
        b.addEventListener('click', function () {
          if (cell[a.cle]) delete cell[a.cle]; else cell[a.cle] = true;
          fermerPop(); maj();
        });
        pop.appendChild(b);
      });
      svgWrap.appendChild(pop);
    }

    // Pose / retire une tringle de penderie sur une case.
    function togglePenderie(path) {
      var cell = caseAt(path);
      if (cell.penderie) delete cell.penderie; else cell.penderie = true;
      maj();
    }

    // Définit N étagères régulières dans une colonne (clic sur le numéro)
    function setEtageresColonne(colIdx, n) {
      var ep = modele.ep;
      var r = modele.racine;
      var col, parentNode, setter;
      if (r.sens === 'v') { col = r.enfants[colIdx]; setter = function (c) { r.enfants[colIdx] = c; }; }
      else { col = r; setter = function (c) { modele.racine = c; }; }
      // Conserver les marqueurs de la colonne (perçages Ø32, penderie) : régler le
      // nombre d'étagères ne doit PAS les effacer.
      function avecMarqueurs(node) {
        if (col && col.perc32) node.perc32 = col.perc32;
        if (col && col.penderie) node.penderie = col.penderie;
        return node;
      }
      var rect = leafRectColonne(colIdx);
      var Hcol = rect ? rect.h : hauteurInterieure(modele);
      if (n <= 0) { setter(avecMarqueurs({})); }
      else {
        var part = Math.max(MIN_CASE, (Hcol - n * ep) / (n + 1));
        var k = n + 1;
        setter(avecMarqueurs({ sens: 'h', tailles: Array.apply(null, { length: k }).map(function () { return part; }),
                 enfants: Array.apply(null, { length: k }).map(function () { return {}; }) }));
      }
      selPath = null; maj();
    }

    // ── Layout récursif ──────────────────────────────────────────
    function layout(cell, x, y, w, h, path, out) {
      if (isFeuille(cell)) { out.leaves.push({ x: x, y: y, w: w, h: h, path: path }); leafRects[path.join('-')] = { x: x, y: y, w: w, h: h }; return; }
      var ep = modele.ep, k = cell.enfants.length;
      normaliserTailles(cell, cell.sens === 'h' ? h : w, ep);
      if (cell.sens === 'v') {
        var cx = x;
        for (var i = 0; i < k; i++) {
          var cw = cell.tailles[i];
          layout(cell.enfants[i], cx, y, cw, h, path.concat(i), out);
          cx += cw;
          if (i < k - 1) { out.dividers.push({ sens: 'v', x: cx, y: y, w: ep, h: h, path: path, idx: i, caisson: path.length === 0 }); cx += ep; }
        }
      } else {
        var by = y + h;
        for (var j = 0; j < k; j++) {
          var ch = cell.tailles[j];
          var top = by - ch;
          layout(cell.enfants[j], x, top, w, ch, path.concat(j), out);
          by = top;
          if (j < k - 1) { by -= ep; out.dividers.push({ sens: 'h', x: x, y: by, w: w, h: ep, path: path, idx: j }); }
        }
      }
    }
    function leafRectColonne(colIdx) {
      var r = modele.racine;
      if (r.sens === 'v') {
        // recalcule via layout courant : largeur colonne, hauteur intérieure
        var Wi = largeurInterieure(modele);
        normaliserTailles(r, Wi, modele.ep);
        return { w: r.tailles[colIdx], h: hauteurInterieure(modele) };
      }
      return { w: largeurInterieure(modele), h: hauteurInterieure(modele) };
    }

    // ── Rendu ────────────────────────────────────────────────────
    function rendre() {
      leafRects = {};
      svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); });
      svgWrap.innerHTML = '';
      var W = modele.L + PAD * 2, Htot = modele.H + PAD * 2;
      svgEl = svg('svg', { viewBox: '0 0 ' + W + ' ' + Htot, width: '100%',
        style: 'max-height:72vh;display:block;font-family:inherit;touch-action:none' });
      svgWrap.appendChild(svgEl);

      var x0 = PAD, y0 = PAD, ep = modele.ep;
      var bois = '#d9b98a', boisStroke = '#9c7b4f';
      function panneau(x, y, w, h, key) {
        var c = (key && materiaux.length) ? couleurElement(modele, key, materiaux) : { fill: bois, stroke: boisStroke };
        var r = svg('rect', { x: x, y: y, width: w, height: h, fill: c.fill, stroke: c.stroke, 'stroke-width': 2 });
        // en mode matériau, les panneaux du caisson sont cliquables (les séparations ont leur propre zone)
        if (!lectureSeule && outil === 'materiau' && key && key.indexOf('sep:') !== 0) {
          r.style.cursor = 'pointer';
          (function (k, cx, cy) { r.addEventListener('click', function (e) { e.stopPropagation(); ouvrirPickerMateriau(k, cx, cy); }); })(key, x + w / 2, y + h / 2);
        }
        svgEl.appendChild(r);
      }

      // Caisson — coque selon le mode de construction (cf. dessinerMeuble) :
      //  pan_sup/pan_inf = 'interieur' → joue traversante (pleine hauteur), panneau
      //  ENTRE les joues ; sinon panneau pleine largeur PAR-DESSUS, joue plus courte.
      //  nb_montants_centraux == 2 → murs mitoyens en joues DOUBLÉES (caissons séparés).
      var _attrsE = (typeof WooderModeConstruction !== 'undefined' &&
                     WooderModeConstruction.obtenirAttributs && modele.modeConstruction)
        ? WooderModeConstruction.obtenirAttributs(modele.modeConstruction) : null;
      var supInE = !!(_attrsE && _attrsE.pan_sup === 'interieur');
      var infInE = !!(_attrsE && _attrsE.pan_inf === 'interieur');
      var doubleMontE = !!(_attrsE && _attrsE.nb_montants_centraux == 2);
      // montants traversants → pleine hauteur (panneaux entre eux) ; sandwich →
      // montant entre les panneaux. pan_*_continu === false → panneau DÉCOUPÉ
      // en un morceau par caisson (sinon une seule pièce continue).
      var traversE = !!(_attrsE && _attrsE.montants_centraux === 'traversants');
      var supContE = !(_attrsE && _attrsE.pan_sup_continu === false);
      var infContE = !(_attrsE && _attrsE.pan_inf_continu === false);
      var sTopE = supInE ? 0 : ep, sBotE = infInE ? 0 : ep;
      // Plinthe encastrée (mode « montants au sol » / plinthe entre joues) : les
      // joues descendent au sol, l'intérieur est raccourci de la hauteur de
      // plinthe, le panneau inf est remonté, et une plinthe est dessinée au sol.
      var plintheEnc = !!(_attrsE && _attrsE.plinthe_encastree);
      var plintheH = plintheEnc ? ((modele.pieds && modele.pieds.hauteurPlinthe) || 100) : 0;
      if (plintheEnc) sBotE = 0;
      var ix = x0 + ep, iy = y0 + ep, iw = modele.L - 2 * ep, ih = modele.H - 2 * ep - plintheH;

      // Layout d'abord : on a besoin des positions des séparateurs de niveau
      // racine (bornes des caissons) AVANT de dessiner les panneaux haut/bas.
      var out = { leaves: [], dividers: [] };
      layout(modele.racine, ix, iy, iw, ih, [], out);
      var caissonDivs = out.dividers.filter(function (d) { return d.caisson && d.sens === 'v'; })
                                    .sort(function (a, b) { return a.x - b.x; });
      var splitPan = doubleMontE && caissonDivs.length > 0;

      // joues latérales (selon recouvrement sup/inf)
      panneau(x0, y0 + sTopE, ep, modele.H - sTopE - sBotE, 'latG');
      panneau(x0 + modele.L - ep, y0 + sTopE, ep, modele.H - sTopE - sBotE, 'latD');

      // panneaux haut / bas — un morceau par caisson si non continu
      function bandePanneau(yB, role, interieur, continu) {
        var pStart = interieur ? x0 + ep : x0;
        var pEnd   = interieur ? x0 + modele.L - ep : x0 + modele.L;
        if (!splitPan || continu) { panneau(pStart, yB, pEnd - pStart, ep, role); return; }
        // Panneau INTÉRIEUR → le morceau s'arrête au nu du mur mitoyen ;
        // PAR-DESSUS / PAR-DESSOUS → il va jusqu'au MILIEU du mur (chaque
        // caisson recouvre ses 2 joues), sinon il reste un trou de 2·ep.
        var seg = pStart;
        caissonDivs.forEach(function (d) {
          var xC = d.x + d.w / 2;             // axe du montant doublé (largeur 2·ep)
          panneau(seg, yB, Math.max(1, (interieur ? xC - d.w : xC) - seg), ep, role);
          seg = interieur ? xC + d.w : xC;
        });
        panneau(seg, yB, Math.max(1, pEnd - seg), ep, role);
      }
      bandePanneau(y0, 'sup', supInE, supContE);
      bandePanneau(y0 + modele.H - ep - plintheH, 'inf', infInE || plintheEnc, infContE);

      svgEl.appendChild(svg('rect', { x: ix, y: iy, width: iw, height: ih, fill: '#fbf6ec' }));
      // Plinthe encastrée : bande au sol, entre les joues, en retrait (pointillés).
      if (plintheEnc && plintheH > 0) {
        svgEl.appendChild(svg('rect', { x: x0 + ep, y: y0 + modele.H - plintheH, width: modele.L - 2 * ep, height: plintheH, fill: '#ead9b8', stroke: '#9c7b4a', 'stroke-width': 2, 'stroke-dasharray': '7 4' }));
      }
      var facadesADessiner = []; // dessinées APRÈS les séparations → la porte recouvre montants/étagères

      // Cases (feuilles) : cotes + interactions + symboles si sélectionnée
      var grab = Math.max(ep, Math.min(60, Math.min(iw, ih) * 0.05));
      out.leaves.forEach(function (lf) {
        var cx = lf.x + lf.w / 2, cy = lf.y + lf.h / 2, key = lf.path.join('-');
        var selected = selPath && selPath.join('-') === key;
        var cell = caseAt(lf.path), fac = cell && cell.facade;

        // surface sélectionnée légèrement teintée
        if (selected) svgEl.appendChild(svg('rect', { x: lf.x, y: lf.y, width: lf.w, height: lf.h, fill: '#f3e8d6' }));

        // indicateur perçages 32 : 'colonne' (colonne entière) ou 'volume' (local)
        var p32 = cell && cell.perc32;
        if (!p32) {  // hérite du perç32 d'un ANCÊTRE (colonne 'colonne', ou volume divisé en étagères)
          var _n = modele.racine;
          if (_n && _n.perc32) p32 = _n.perc32;   // marqueur porté par le meuble entier
          for (var _pi = 0; _pi < lf.path.length && !p32; _pi++) { _n = _n.enfants[lf.path[_pi]]; if (_n && _n.perc32) p32 = _n.perc32; }
        }
        if (p32) {
          var coul32 = p32 === 'colonne' ? '#1d6fb8' : '#2e9e6a';
          // trame de points Ø32 le long des 2 bords intérieurs
          var PAS32 = 32, y32 = lf.y + 40;
          while (y32 <= lf.y + lf.h - 40) {
            svgEl.appendChild(svg('circle', { cx: lf.x + 50, cy: y32, r: 4, fill: coul32, opacity: 0.55 }));
            svgEl.appendChild(svg('circle', { cx: lf.x + lf.w - 50, cy: y32, r: 4, fill: coul32, opacity: 0.55 }));
            y32 += PAS32 * 4;
          }
          var bg = svg('rect', { x: lf.x + lf.w / 2 - 46, y: lf.y + 8, width: 92, height: 26, rx: 6, fill: coul32, opacity: 0.92 });
          svgEl.appendChild(bg);
          var t32 = svg('text', { x: lf.x + lf.w / 2, y: lf.y + 26, 'text-anchor': 'middle', 'font-size': 17, fill: '#fff', 'font-weight': 600, 'font-family': 'inherit' });
          t32.textContent = p32 === 'colonne' ? 'Ø32 colonne' : 'Ø32 volume';
          svgEl.appendChild(t32);
        }

        // penderie : tringle horizontale (barre + 2 supports) près du haut de la case
        if (cell && cell.penderie) {
          var pyT = lf.y + Math.min(80, lf.h * 0.14);
          var px1 = lf.x + 34, px2 = lf.x + lf.w - 34;
          svgEl.appendChild(svg('line', { x1: px1, y1: pyT, x2: px2, y2: pyT, stroke: '#7a5b34', 'stroke-width': 13, 'stroke-linecap': 'round' }));
          svgEl.appendChild(svg('line', { x1: px1, y1: pyT - 22, x2: px1, y2: pyT + 22, stroke: '#7a5b34', 'stroke-width': 10, 'stroke-linecap': 'round' }));
          svgEl.appendChild(svg('line', { x1: px2, y1: pyT - 22, x2: px2, y2: pyT + 22, stroke: '#7a5b34', 'stroke-width': 10, 'stroke-linecap': 'round' }));
        }

        // cotes : hauteur libre = VERTICALE le long du montant (bord gauche) ; largeur = bas
        var hx = lf.x + 26;
        var tH = svg('text', { x: hx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 30, fill: '#9c7b4f', 'font-weight': 600, 'font-family': 'inherit',
          transform: 'rotate(-90 ' + hx + ' ' + cy + ')' });
        tH.textContent = Math.round(lf.h); svgEl.appendChild(tH);
        var tW = svg('text', { x: cx, y: lf.y + lf.h - 12, 'text-anchor': 'middle', 'font-size': 26, fill: '#b59b78', 'font-family': 'inherit' });
        tW.textContent = Math.round(lf.w); svgEl.appendChild(tW);

        // zone cliquable
        if (!lectureSeule) {
          var hit = svg('rect', { x: lf.x, y: lf.y, width: lf.w, height: lf.h, fill: 'transparent',
            style: 'cursor:' + (outil === 'select' ? 'pointer' : 'copy') });
          (function (path) {
            hit.addEventListener('click', function (e) {
              e.stopPropagation();
              if (outil === 'materiau') return; // en mode matériau, l'intérieur de case ne fait rien
              if (outil === 'etagere') ajouter(path, 'etagere');
              else if (outil === 'montant') ajouter(path, 'montant');
              else if (outil === 'porte')  ajouterFacade(path, 'porte');
              else if (outil === 'tiroir') ajouterFacade(path, 'tiroir');
              else if (outil === 'accessoires') ouvrirAccessoires(path, cx, cy);
              else if (outil === 'perc32') cyclePerc32(path);
              else { selPath = path; rendre(); }
            });
          })(lf.path);
          svgEl.appendChild(hit);
        }

        // façade (porte / tiroir) — collectée, dessinée APRÈS les séparations (recouvre montants/étagères)
        if (fac) { var fr = unionFacadeRect(lf, cell); facadesADessiner.push({ lf: { x: fr.x, y: fr.y, w: fr.w, h: fr.h, path: lf.path }, cell: cell }); }

        // symboles d'ajout au centre si la case est sélectionnée (sans façade)
        // étagère = carré + trait HORIZONTAL (vert) · montant = carré + trait VERTICAL (orange)
        if (selected && outil === 'select' && !lectureSeule && !fac) {
          var bw = Math.min(lf.w * 0.42, lf.h * 0.42, 150);
          bw = Math.max(bw, 60);
          dessinerSymbole(cx - bw / 2 - 8, cy, bw, 'h', COUL_ETAGERE, function () { ajouter(lf.path, 'etagere'); });
          dessinerSymbole(cx + bw / 2 + 8, cy, bw, 'v', COUL_MONTANT, function () { ajouter(lf.path, 'montant'); });
        }
      });

      // Séparations (étagères = h, montants = v) — dessin + drag (ou choix matériau)
      out.dividers.forEach(function (d) {
        var key = 'sep:' + d.sens + ':' + d.path.join('.') + ':' + d.idx;
        // multi-caisson : un séparateur de caisson (niveau racine) = mur mitoyen de
        // DEUX joues accolées → 2 panneaux contournés au lieu d'un seul.
        if (doubleMontE && d.caisson && d.sens === 'v') {
          // Deux joues mitoyennes accolées (caissons séparés). Séparateur élargi
          // à ~2× l'épaisseur pour que le doublement soit LISIBLE à l'écran.
          // Pleine hauteur si montants traversants, sinon hauteur intérieure
          // (sandwich : montant entre les panneaux haut/bas).
          var totE = d.w * 2, gapE = Math.max(3, d.w * 0.5);
          var hwE = (totE - gapE) / 2, xE = d.x + d.w / 2 - totE / 2;
          var myE = traversE ? (y0 + sTopE) : d.y;
          var mhE = traversE ? (modele.H - sTopE - sBotE) : d.h;
          panneau(xE, myE, hwE, mhE, key);
          panneau(xE + hwE + gapE, myE, hwE, mhE, key);
        } else {
          panneau(d.x, d.y, d.w, d.h, key);
        }
        if (lectureSeule) return;
        var hg = d.sens === 'v'
          ? { x: d.x + d.w / 2 - grab / 2, y: d.y, w: grab, h: d.h, cur: 'ew-resize' }
          : { x: d.x, y: d.y + d.h / 2 - grab / 2, w: d.w, h: grab, cur: 'ns-resize' };
        var hit = svg('rect', { x: hg.x, y: hg.y, width: hg.w, height: hg.h, fill: 'transparent' });
        if (outil === 'materiau') {
          hit.style.cursor = 'pointer';
          (function (k, cx, cy) { hit.addEventListener('click', function (e) { e.stopPropagation(); ouvrirPickerMateriau(k, cx, cy); }); })(key, d.x + d.w / 2, d.y + d.h / 2);
        } else {
          hit.style.cursor = hg.cur;
          attacherDragDiv(hit, d);
          hit.addEventListener('dblclick', function (e) { e.stopPropagation(); supprimerDivider(d); });
        }
        svgEl.appendChild(hit);
        // bouton × pour supprimer la séparation (visible, tactile)
        if (!lectureSeule && outil !== 'materiau') dessinerSuppr(d);
      });

      // Façades par-case : APRÈS les séparations → en applique elles recouvrent montants/étagères.
      // En outils structure (étagère / montant / perçages 32), dessinerFacade les masque (caisson nu).
      facadesADessiner.forEach(function (f) { dessinerFacade(f.lf, f.cell); });

      // Numéros de colonnes (cliquables) en haut
      dessinerNumerosColonnes(ix, iy, iw);
      // Portes pleine colonne + boutons « + porte » au bas des colonnes
      dessinerColonnesPorte(ix, iy, iw, ih);

      // Cotation hors-tout
      coteH(x0, y0, modele.L);
      coteV(x0, y0, modele.H);

      // Colonne(s) qui viennent d'être ajoutées → saisie de largeur, ancrée sur
      // la 1re. Le drapeau est consommé ici pour ne pas boucler au re-rendu.
      if (_saisieLargeurCol != null) {
        var _ci = _saisieLargeurCol; _saisieLargeurCol = null;
        var _cols = colonnesInfo(ix, iw);
        if (_cols[_ci]) ouvrirSaisieColonne(_ci, _cols[_ci].x + _cols[_ci].w / 2, iy);
      }
    }

    // orient : 'h' = étagère (trait horizontal) · 'v' = montant (trait vertical)
    function dessinerSymbole(cx, cy, size, orient, couleur, onClick) {
      var g = svg('g', { style: 'cursor:pointer' });
      g.appendChild(svg('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: 12,
        fill: '#ffffff', stroke: couleur, 'stroke-width': 4 }));
      var m = size * 0.24;
      if (orient === 'h')
        g.appendChild(svg('line', { x1: cx - size / 2 + m, y1: cy, x2: cx + size / 2 - m, y2: cy, stroke: couleur, 'stroke-width': 7, 'stroke-linecap': 'round' }));
      else
        g.appendChild(svg('line', { x1: cx, y1: cy - size / 2 + m, x2: cx, y2: cy + size / 2 - m, stroke: couleur, 'stroke-width': 7, 'stroke-linecap': 'round' }));
      // petit badge « + » en haut à droite pour signaler l'ajout
      var br = size * 0.26, bx = cx + size / 2 - br * 0.4, by = cy - size / 2 + br * 0.4;
      g.appendChild(svg('circle', { cx: bx, cy: by, r: br, fill: couleur }));
      var tp = svg('text', { x: bx, y: by, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': br * 1.5, fill: '#fff', 'font-weight': 700, 'font-family': 'inherit' });
      tp.textContent = '+'; g.appendChild(tp);
      g.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
      svgEl.appendChild(g);
    }

    // bouton rouge × au centre d'une séparation → la supprimer
    function dessinerSuppr(d) {
      var cx = d.x + d.w / 2, cy = d.y + d.h / 2, r = 19;
      var g = svg('g', { style: 'cursor:pointer' });
      g.appendChild(svg('circle', { cx: cx, cy: cy, r: r, fill: '#fff', stroke: COUL_SUPPR, 'stroke-width': 3 }));
      var s = r * 0.5;
      g.appendChild(svg('path', { d: 'M' + (cx - s) + ' ' + (cy - s) + 'L' + (cx + s) + ' ' + (cy + s) + 'M' + (cx + s) + ' ' + (cy - s) + 'L' + (cx - s) + ' ' + (cy + s),
        stroke: COUL_SUPPR, 'stroke-width': 4, 'stroke-linecap': 'round' }));
      // zone tactile plus large
      g.appendChild(svg('circle', { cx: cx, cy: cy, r: r + 8, fill: 'transparent' }));
      g.addEventListener('click', function (e) { e.stopPropagation(); supprimerDivider(d); });
      g.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      svgEl.appendChild(g);
    }

    // Colonnes du meuble : {x, w, idx, node, path} (racine 'v' → colonnes ; sinon 1 colonne = racine)
    function colonnesInfo(ix, iw) {
      var r = modele.racine, cols = [];
      if (r.sens === 'v') {
        normaliserTailles(r, iw, modele.ep);
        var cx = ix;
        for (var i = 0; i < r.enfants.length; i++) { cols.push({ x: cx, w: r.tailles[i], idx: i, node: r.enfants[i], path: [i] }); cx += r.tailles[i] + modele.ep; }
      } else cols = [{ x: ix, w: iw, idx: 0, node: r, path: [] }];
      return cols;
    }

    function dessinerNumerosColonnes(ix, iy, iw) {
      colonnesInfo(ix, iw).forEach(function (c) {
        var centre = c.x + c.w / 2, yb = iy - 34;
        var g = svg('g', { style: lectureSeule ? '' : 'cursor:pointer' });
        g.appendChild(svg('circle', { cx: centre, cy: yb, r: 22, fill: '#fff', stroke: '#4F5E3C', 'stroke-width': 2.5 }));
        var t = svg('text', { x: centre, y: yb, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': 26, fill: '#4F5E3C', 'font-weight': 700, 'font-family': 'inherit' });
        t.textContent = (c.idx + 1); g.appendChild(t);
        if (!lectureSeule) g.addEventListener('click', function (e) { e.stopPropagation(); ouvrirSaisieColonne(c.idx, centre, yb); });
        svgEl.appendChild(g);
      });
    }

    // Porte/façade sur TOUTE une colonne : dessine la façade des colonnes-splits qui en ont une,
    // + un bouton « + porte » au bas de chaque colonne qui n'en a pas encore.
    function dessinerColonnesPorte(ix, iy, iw, ih) {
      colonnesInfo(ix, iw).forEach(function (c) {
        var node = c.node;
        // façade pleine colonne sur un nœud divisé (les feuilles sont gérées dans la boucle leaves)
        if (node && node.facade && !isFeuille(node)) {
          dessinerFacade({ x: c.x, y: iy, w: c.w, h: ih, path: c.path }, node);
        }
        // bouton « + porte » au bas de la colonne (si pas déjà de façade sur ce nœud)
        if (!lectureSeule && outil !== 'materiau' && !(node && node.facade)) {
          var bx = c.x + c.w / 2, by = iy + ih + 42, hw = Math.min(54, c.w * 0.42), r = 21;
          var g = svg('g', { style: 'cursor:pointer' });
          g.appendChild(svg('rect', { x: bx - hw, y: by - r, width: hw * 2, height: r * 2, rx: r, fill: '#fff', stroke: COUL_PORTE, 'stroke-width': 3 }));
          var t = svg('text', { x: bx, y: by, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 24, fill: COUL_PORTE, 'font-weight': 700, 'font-family': 'inherit' });
          t.textContent = '🚪 +'; g.appendChild(t);
          (function (path) { g.addEventListener('click', function (e) { e.stopPropagation(); ajouterFacadeColonne(path); }); })(c.path);
          svgEl.appendChild(g);
        }
      });
    }

    // Fixe la largeur d'UNE colonne : les autres se partagent le reste au
    // prorata de leur largeur actuelle (la colonne saisie est donc respectée,
    // au lieu d'être re-proportionnée avec toutes les autres).
    function appliquerLargeurColonne(colIdx, W) {
      var r = modele.racine;
      if (r.sens !== 'v' || !r.enfants[colIdx] || r.enfants.length < 2) return;
      var k = r.enfants.length, ep = modele.ep;
      var dispo = largeurInterieure(modele) - (k - 1) * ep;
      var mini = Math.min(MIN_CASE, dispo / k);
      W = clamp(W, mini, Math.max(mini, dispo - (k - 1) * mini));
      var reste = dispo - W, somme = 0, i;
      for (i = 0; i < k; i++) if (i !== colIdx) somme += (r.tailles[i] || 0);
      for (i = 0; i < k; i++) {
        if (i === colIdx) r.tailles[i] = W;
        else r.tailles[i] = somme > 0 ? Math.max(mini, (r.tailles[i] || 0) * (reste / somme))
                                      : reste / (k - 1);
      }
    }

    // Petit champ flottant pour saisir la largeur + le nb d'étagères d'une colonne
    function ouvrirSaisieColonne(colIdx, svgCx, svgCy) {
      svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); });
      var ctm = svgEl.getScreenCTM();
      var p = svgEl.createSVGPoint(); p.x = svgCx; p.y = svgCy;
      var sp = p.matrixTransform(ctm);
      var wr = svgWrap.getBoundingClientRect();
      var pop = htm('div', { class: 'w2d-pop', style:
        'position:absolute;z-index:20;display:flex;gap:6px;align-items:center;background:#fff;border:1.5px solid #4F5E3C;' +
        'border-radius:8px;padding:6px 8px;box-shadow:0 4px 14px rgba(0,0,0,.15)' });
      pop.style.left = (sp.x - wr.left + svgWrap.scrollLeft - 60) + 'px';
      pop.style.top  = (sp.y - wr.top + svgWrap.scrollTop + 24) + 'px';
      var champStyle = 'width:70px;min-height:38px;padding:4px 8px;border:1px solid #e3dfd3;border-radius:6px;font:inherit;font-size:16px';
      var lblStyle = 'font-size:12px;color:#6b6b66';

      // Largeur : seulement s'il y a plusieurs colonnes (sinon elle est imposée
      // par le meuble). Les autres colonnes absorbent la différence.
      var r0 = modele.racine, inpW = null;
      if (r0.sens === 'v' && r0.enfants.length > 1) {
        pop.appendChild(htm('span', { style: lblStyle }, 'Largeur'));
        inpW = htm('input', { type: 'number', value: Math.round(r0.tailles[colIdx] || 0),
          min: 10, step: 1, inputmode: 'numeric', style: champStyle });
        pop.appendChild(inpW);
        pop.appendChild(htm('span', { style: lblStyle }, 'mm'));
      }

      pop.appendChild(htm('span', { style: lblStyle }, 'Étagères'));
      var nbAct = compterEtageresColonne(colIdx);
      var inp = htm('input', { type: 'number', value: nbAct, min: 0, max: 30, inputmode: 'numeric',
        style: champStyle });
      var ok = htm('button', { style: 'min-height:38px;padding:6px 12px;border:none;background:#4F5E3C;color:#fff;border-radius:6px;font:inherit;cursor:pointer' }, 'OK');
      function valider() {
        if (inpW) { var w = parseFloat(inpW.value); if (isFinite(w) && w > 0) appliquerLargeurColonne(colIdx, w); }
        setEtageresColonne(colIdx, Math.max(0, Math.round(parseFloat(inp.value) || 0)));
        maj();
      }
      ok.addEventListener('click', valider);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') valider(); });
      if (inpW) inpW.addEventListener('keydown', function (e) { if (e.key === 'Enter') valider(); });
      pop.appendChild(inp); pop.appendChild(ok);
      svgWrap.appendChild(pop);
      var premier = inpW || inp;
      // preventScroll : sans ça, le focus fait sauter la page vers l'éditeur
      try { premier.focus({ preventScroll: true }); } catch (e) { premier.focus(); }
      premier.select();
    }
    function compterEtageresColonne(colIdx) {
      var r = modele.racine;
      var col = r.sens === 'v' ? r.enfants[colIdx] : r;
      return (col && col.sens === 'h') ? col.enfants.length - 1 : 0;
    }

    // ── Choix du matériau d'un élément (mode 🎨) ─────────────────────
    var LIB_FAMILLE = {
      melamine_blanc: 'Mélaminé blanc', melamine_couleur: 'Mélaminé couleur', melamine_bois: 'Mélaminé bois',
      plaque_bois: 'Plaqué bois', contreplaque_bois: 'Contreplaqué', laque_mat: 'Laqué mat',
      laque_brillant: 'Laqué brillant', mdf_brut: 'MDF brut', fond_fin: 'Fonds fins'
    };
    var LIB_TYPE = { caisson: 'le caisson', etagere: 'les étagères', montant: 'les montants',
                     facade: 'les façades', fileur: 'les fileurs et plinthes' };
    function ouvrirPickerMateriau(key, svgCx, svgCy) {
      svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); });
      var t = typeDeKey(key), courant = materiauIdElement(modele, key);
      var ctm = svgEl.getScreenCTM(), p = svgEl.createSVGPoint(); p.x = svgCx; p.y = svgCy;
      var sp = p.matrixTransform(ctm), wr = svgWrap.getBoundingClientRect();
      var pop = htm('div', { class: 'w2d-pop', style:
        'position:absolute;z-index:20;display:flex;flex-direction:column;gap:8px;background:#fff;border:1.5px solid #4F5E3C;' +
        'border-radius:10px;padding:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);width:248px' });
      pop.style.left = clamp(sp.x - wr.left + svgWrap.scrollLeft - 124, 4, Math.max(4, svgWrap.clientWidth - 252)) + 'px';
      pop.style.top  = clamp(sp.y - wr.top + svgWrap.scrollTop - 10, 4, 100000) + 'px';
      pop.appendChild(htm('div', { style: 'font-size:12px;color:#6b6b66;font-weight:600' }, 'Matériau · ' + LIB_TYPE[t]));

      var sel = htm('select', { style: 'min-height:40px;padding:6px 8px;border:1px solid #e3dfd3;border-radius:8px;font:inherit;font-size:16px' });
      var familles = {};
      materiaux.forEach(function (m) { (familles[m.famille] = familles[m.famille] || []).push(m); });
      Object.keys(familles).forEach(function (fam) {
        var og = htm('optgroup'); og.label = LIB_FAMILLE[fam] || fam;
        familles[fam].forEach(function (m) {
          var op = htm('option', null, m.nom + ' · ' + m.ep + 'mm'); op.value = m.id;
          if (m.id === courant) op.selected = true;
          og.appendChild(op);
        });
        sel.appendChild(og);
      });
      pop.appendChild(sel);

      // ── Sens du fil du bois ──────────────────────────────────────
      // 'long' = fil dans la longueur de la pièce (débit standard),
      // 'trav' = en travers. Visible immédiatement sur le décor en 3D.
      var filCour = filElement(modele, key);
      pop.appendChild(htm('div', { style: 'font-size:12px;color:#6b6b66;font-weight:600;margin-top:2px' }, 'Fil du bois'));
      var ligneFil = htm('div', { style: 'display:flex;gap:6px' });
      function btnFil(val, lib) {
        var b = htm('button', { style: 'flex:1;min-height:38px;border-radius:8px;font:inherit;cursor:pointer;' +
          (filCour === val ? 'border:none;background:#4F5E3C;color:#fff' : 'border:1px solid #4F5E3C;background:#fff;color:#4F5E3C') }, lib);
        b.addEventListener('click', function () {
          filCour = val;
          Array.prototype.forEach.call(ligneFil.children, function (c) {
            var actif = c === b;
            c.setAttribute('style', 'flex:1;min-height:38px;border-radius:8px;font:inherit;cursor:pointer;' +
              (actif ? 'border:none;background:#4F5E3C;color:#fff' : 'border:1px solid #4F5E3C;background:#fff;color:#4F5E3C'));
          });
        });
        return b;
      }
      ligneFil.appendChild(btnFil('long', '↕ Longueur'));
      ligneFil.appendChild(btnFil('trav', '↔ Travers'));
      pop.appendChild(ligneFil);

      // ── Portée : cet élément / tout ce type / tout le meuble ─────
      pop.appendChild(htm('div', { style: 'font-size:12px;color:#6b6b66;font-weight:600;margin-top:2px' }, 'Appliquer à'));
      function btnPortee(portee, lib, plein) {
        var b = htm('button', { style: 'flex:1;min-height:38px;border-radius:8px;font:inherit;cursor:pointer;' +
          (plein ? 'border:none;background:#4F5E3C;color:#fff' : 'border:1px solid #4F5E3C;background:#fff;color:#4F5E3C') }, lib);
        b.addEventListener('click', function () { appliquerMateriau(key, sel.value, portee, filCour); fermerPop(); });
        return b;
      }
      var ligne = htm('div', { style: 'display:flex;gap:6px' });
      ligne.appendChild(btnPortee('element', 'Cet élément', true));
      // LIB_TYPE contient déjà l'article (« le caisson », « les étagères ») :
      // « Idem pour … » évite le « Tou·te·s le caisson » de la version précédente.
      ligne.appendChild(btnPortee('type', 'Idem pour ' + LIB_TYPE[t], false));
      pop.appendChild(ligne);
      var ligne2 = htm('div', { style: 'display:flex' });
      ligne2.appendChild(btnPortee('meuble', 'Tout le meuble', false));
      pop.appendChild(ligne2);

      svgWrap.appendChild(pop); sel.focus();
    }
    function fermerPop() { svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); }); }

    // portee : 'element' (cette pièce) | 'type' (toutes les pièces du type)
    //        | 'meuble' (tout le meuble : devient le défaut, les exceptions
    //          par pièce et par type sont effacées)
    function appliquerMateriau(key, id, portee, fil) {
      if (!modele.mat)     modele.mat = {};
      if (!modele.matType) modele.matType = {};
      if (!modele.fil)     modele.fil = {};
      if (!modele.filType) modele.filType = {};
      if (portee === 'meuble') {
        modele.materiauDefaut = id; modele.mat = {}; modele.matType = {};
        modele.filDefaut = fil;     modele.fil = {}; modele.filType = {};
      } else if (portee === 'type') {
        var t = typeDeKey(key);
        modele.matType[t] = id; modele.filType[t] = fil;
        // retire les exceptions par pièce de ce type pour qu'elles suivent
        Object.keys(modele.mat).forEach(function (k) { if (typeDeKey(k) === t) delete modele.mat[k]; });
        Object.keys(modele.fil).forEach(function (k) { if (typeDeKey(k) === t) delete modele.fil[k]; });
      } else {
        modele.mat[key] = id; modele.fil[key] = fil;
      }
      maj();
    }

    // ── Façades : portes & tiroirs ───────────────────────────────────
    // On attache une façade à une CASE (feuille). La dimension H×L×P est le
    // hors-tout fini : applique = devant le caisson (recouvre), encastré = dans l'ouverture.
    function ajouterFacade(path, type) {
      var c = caseAt(path);
      if (!c || c.sens) return;             // seulement sur une feuille
      c.facade = { type: type, pose: 'applique', sens: type === 'porte' ? 'droite' : null };
      selPath = path; maj();
    }
    // porte sur TOUTE une colonne : façade attachée au nœud colonne (feuille OU divisé)
    function ajouterFacadeColonne(path) {
      var c = caseAt(path);
      if (!c) return;
      c.facade = { type: 'porte', pose: 'applique', sens: 'droite' };
      selPath = null; maj();
    }
    // géométrie de la façade en coords svg (mm) selon la pose
    function facadeGeom(lf, pose) {
      if (pose === 'encastre') {
        var j = JEU_ENCASTRE;
        return { x: lf.x + j, y: lf.y + j, w: Math.max(1, lf.w - 2 * j), h: Math.max(1, lf.h - 2 * j) };
      }
      // applique : déborde de ep/2 sur chaque bord (recouvre montants/caisson), retrait jeu/2
      var e = modele.ep / 2, g = JEU_APPLIQUE / 2;
      return { x: lf.x - e + g, y: lf.y - e + g, w: lf.w + 2 * e - 2 * g, h: lf.h + 2 * e - 2 * g };
    }
    // Nb max de cases-feuilles consécutives qu'une façade peut couvrir vers le haut (depuis sa case)
    function maxSpanFacade(path) {
      var info = parentDe(path);
      if (!info || info.node.sens !== 'h') return 1;
      var node = info.node, n = 1;
      for (var k = info.idx + 1; k < node.enfants.length && isFeuille(node.enfants[k]); k++) n++;
      return n;
    }
    // Rectangle d'une façade en tenant compte de span (cases empilées couvertes, vers le haut)
    function unionFacadeRect(lf, cell) {
      var span = (cell.facade && cell.facade.span) || 1;
      if (span <= 1) return { x: lf.x, y: lf.y, w: lf.w, h: lf.h };
      var info = parentDe(lf.path);
      if (!info || info.node.sens !== 'h') return { x: lf.x, y: lf.y, w: lf.w, h: lf.h };
      var node = info.node, i = info.idx, minY = lf.y, maxY = lf.y + lf.h, x = lf.x, w = lf.w;
      for (var k = 1; k < span && i + k < node.enfants.length; k++) {
        var p = lf.path.slice(); p[p.length - 1] = i + k;
        var r = leafRects[p.join('-')];
        if (!r) break;                       // voisin non-feuille → on s'arrête
        minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
        x = Math.min(x, r.x); w = Math.max(w, r.w);
      }
      return { x: x, y: minY, w: w, h: maxY - minY };
    }
    function dessinerFacade(lf, cell) {
      // Outils « structure » (perçages 32, étagère, montant) : on masque les
      // façades (portes/tiroirs) pour montrer le caisson nu → l'utilisateur
      // clique une colonne/case pour y travailler (poser étagère/montant, ou
      // cycler les perçages Ø32 via cyclePerc32). En Sélection : façades visibles.
      if (outil === 'perc32' || outil === 'etagere' || outil === 'montant' || outil === 'accessoires') return;
      var f = cell.facade, g = facadeGeom(lf, f.pose), key = 'facade:' + lf.path.join('.');
      var col = materiaux.length ? couleurElement(modele, key, materiaux) : { fill: '#e7d7b8', stroke: '#9c7b4f', texte: '#1f1f1d' };
      var trait = col.texte === '#fff' ? '#ffffff' : '#5a4326';
      var gFac = svg('g', {});
      var r = svg('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 3, fill: col.fill, stroke: col.stroke, 'stroke-width': 2.5 });
      gFac.appendChild(r);
      // encastré : liseré du jeu (montre qu'elle est dans l'ouverture)
      if (f.pose === 'encastre') r.setAttribute('stroke-dasharray', '');

      if (f.type === 'tiroir') {
        // plusieurs façades de tiroir empilées + espace vide (haut/bas) → le rect global sert de zone de clic
        var fronts = tiroirFrontRects(g, f);
        var multi = (f.tiroirs && f.tiroirs.length) ? true : false;
        if (multi) { r.setAttribute('fill', 'transparent'); r.setAttribute('stroke', 'none'); }
        fronts.forEach(function (fr) {
          if (multi) gFac.appendChild(svg('rect', { x: fr.x, y: fr.y, width: fr.w, height: fr.h, rx: 3, fill: col.fill, stroke: col.stroke, 'stroke-width': 2.5 }));
          var hy = fr.y + Math.min(40, fr.h * 0.28); // poignée horizontale en haut de chaque tiroir
          gFac.appendChild(svg('line', { x1: fr.x + fr.w * 0.28, y1: hy, x2: fr.x + fr.w * 0.72, y2: hy, stroke: trait, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        });
      } else {
        var sens = f.sens || 'droite';
        function poignee(px) { gFac.appendChild(svg('line', { x1: px, y1: g.y + g.h * 0.42, x2: px, y2: g.y + g.h * 0.58, stroke: trait, 'stroke-width': 7, 'stroke-linecap': 'round' })); }
        function ouverture(xCharniere, xPoignee) { // V indiquant le sens d'ouverture
          var d = 'M' + xCharniere + ' ' + g.y + ' L' + xPoignee + ' ' + (g.y + g.h / 2) + ' L' + xCharniere + ' ' + (g.y + g.h);
          gFac.appendChild(svg('path', { d: d, fill: 'none', stroke: trait, 'stroke-width': 1.2, 'stroke-dasharray': '6 6', opacity: 0.7 }));
        }
        var mP = Math.min(42, g.w * 0.12);
        if (sens === 'double') {
          // trait de démarcation entre les 2 vantaux + poignées de part et d'autre
          gFac.appendChild(svg('line', { x1: g.x + g.w / 2, y1: g.y, x2: g.x + g.w / 2, y2: g.y + g.h, stroke: trait, 'stroke-width': 2.5 }));
          poignee(g.x + g.w / 2 - 14); poignee(g.x + g.w / 2 + 14);
          ouverture(g.x, g.x + g.w / 2); ouverture(g.x + g.w, g.x + g.w / 2);
        } else if (sens === 'gauche') {       // charnière à droite, poignée à gauche
          poignee(g.x + mP); ouverture(g.x + g.w, g.x);
        } else {                               // 'droite' : charnière à gauche, poignée à droite
          poignee(g.x + g.w - mP); ouverture(g.x, g.x + g.w);
        }
      }
      svgEl.appendChild(gFac);
      if (!lectureSeule) {
        r.style.cursor = 'pointer';
        (function (path, cxp, cyp) {
          r.addEventListener('click', function (e) {
            e.stopPropagation();
            if (outil === 'materiau') ouvrirPickerMateriau(key, cxp, cyp);
            else ouvrirEditFacade(path, cxp, cyp);
          });
        })(lf.path, g.x + g.w / 2, g.y + g.h / 2);
      }
    }
    // petit panneau d'édition d'une façade (type / pose / sens / suppr)
    function ouvrirEditFacade(path, svgCx, svgCy) {
      svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); });
      var c = caseAt(path), f = c.facade; if (!f) return;
      var ctm = svgEl.getScreenCTM(), p = svgEl.createSVGPoint(); p.x = svgCx; p.y = svgCy;
      var sp = p.matrixTransform(ctm), wr = svgWrap.getBoundingClientRect();
      var pop = htm('div', { class: 'w2d-pop', style:
        'position:absolute;z-index:20;display:flex;flex-direction:column;gap:8px;background:#fff;border:1.5px solid #4F5E3C;' +
        'border-radius:10px;padding:10px;box-shadow:0 6px 18px rgba(0,0,0,.18);width:230px' });
      pop.style.left = clamp(sp.x - wr.left + svgWrap.scrollLeft - 115, 4, Math.max(4, svgWrap.clientWidth - 234)) + 'px';
      pop.style.top  = clamp(sp.y - wr.top + svgWrap.scrollTop - 10, 4, 100000) + 'px';
      function ligne(label) { var d = htm('div', { style: 'display:flex;gap:6px;align-items:center' }); d.appendChild(htm('span', { style: 'font-size:12px;color:#6b6b66;width:54px' }, label)); return d; }
      function seg(vals, courant, onPick) {
        var d = htm('div', { style: 'display:flex;gap:4px;flex:1' });
        vals.forEach(function (v) {
          var b = htm('button', { style: 'flex:1;min-height:34px;border:1px solid #4F5E3C;border-radius:7px;font:inherit;font-size:13px;cursor:pointer;' + (v.val === courant ? 'background:#4F5E3C;color:#fff' : 'background:#fff;color:#4F5E3C') }, v.lbl);
          b.addEventListener('click', function () { onPick(v.val); });
          d.appendChild(b);
        });
        return d;
      }
      var lT = ligne('Type'); lT.appendChild(seg([{ val: 'porte', lbl: 'Porte' }, { val: 'tiroir', lbl: 'Tiroir' }], f.type, function (v) { f.type = v; if (v === 'porte' && !f.sens) f.sens = 'droite'; maj(); ouvrirEditFacade(path, svgCx, svgCy); })); pop.appendChild(lT);
      var lP = ligne('Pose'); lP.appendChild(seg([{ val: 'applique', lbl: 'Applique' }, { val: 'encastre', lbl: 'Encastré' }], f.pose, function (v) { f.pose = v; maj(); ouvrirEditFacade(path, svgCx, svgCy); })); pop.appendChild(lP);
      if (f.type === 'porte') {
        var lS = ligne('Ouvre'); lS.appendChild(seg([{ val: 'gauche', lbl: 'G' }, { val: 'droite', lbl: 'D' }, { val: 'double', lbl: '2 vtx' }], f.sens, function (v) { f.sens = v; maj(); ouvrirEditFacade(path, svgCx, svgCy); })); pop.appendChild(lS);
      }
      // Volumes : étend la façade sur plusieurs cases empilées (vers le haut)
      var maxSp = maxSpanFacade(path);
      if (maxSp > 1 || (f.span || 1) > 1) {
        var lVol = ligne('Volumes');
        var box = htm('div', { style: 'display:flex;gap:4px;flex:1;align-items:center' });
        function stepBtn(lbl) { return htm('button', { style: 'width:40px;min-height:34px;border:1px solid #4F5E3C;border-radius:7px;background:#fff;color:#4F5E3C;font:inherit;font-size:18px;font-weight:700;cursor:pointer' }, lbl); }
        var moins = stepBtn('−'), plus = stepBtn('+');
        var val = htm('span', { style: 'flex:1;text-align:center;font-size:15px;font-weight:600' }, String(f.span || 1));
        moins.addEventListener('click', function () { var s = Math.max(1, (f.span || 1) - 1); if (s <= 1) delete f.span; else f.span = s; maj(); ouvrirEditFacade(path, svgCx, svgCy); });
        plus.addEventListener('click', function () { f.span = Math.min(maxSp, (f.span || 1) + 1); maj(); ouvrirEditFacade(path, svgCx, svgCy); });
        box.appendChild(moins); box.appendChild(val); box.appendChild(plus);
        lVol.appendChild(box); pop.appendChild(lVol);
      }
      // ── Tiroirs : nombre + côté de l'espace vide + hauteur de chaque façade ──
      if (f.type === 'tiroir') {
        // hauteur dispo (mm) du volume de la façade (tient compte de pose + span)
        var lfR = leafRects[path.join('-')];
        var dispoH = lfR ? Math.round(facadeGeom(unionFacadeRect(lfR, c), f.pose).h) : hauteurInterieure(modele);
        if (!f.tiroirs || !f.tiroirs.length) f.tiroirs = [dispoH]; // init : un seul tiroir plein
        if (!f.vide) f.vide = 'haut';
        function repartirEgal(n) { var h = Math.round(dispoH / n); f.tiroirs = []; for (var i = 0; i < n; i++) f.tiroirs.push(h); }
        // Nombre de tiroirs
        var lNb = ligne('Tiroirs');
        var boxN = htm('div', { style: 'display:flex;gap:4px;flex:1;align-items:center' });
        function stepBtnT(lbl) { return htm('button', { style: 'width:40px;min-height:34px;border:1px solid #4F5E3C;border-radius:7px;background:#fff;color:#4F5E3C;font:inherit;font-size:18px;font-weight:700;cursor:pointer' }, lbl); }
        var moinsT = stepBtnT('−'), plusT = stepBtnT('+');
        var valN = htm('span', { style: 'flex:1;text-align:center;font-size:15px;font-weight:600' }, String(f.tiroirs.length));
        moinsT.addEventListener('click', function () { if (f.tiroirs.length > 1) { repartirEgal(f.tiroirs.length - 1); maj(); ouvrirEditFacade(path, svgCx, svgCy); } });
        plusT.addEventListener('click', function () { repartirEgal(f.tiroirs.length + 1); maj(); ouvrirEditFacade(path, svgCx, svgCy); });
        boxN.appendChild(moinsT); boxN.appendChild(valN); boxN.appendChild(plusT);
        lNb.appendChild(boxN); pop.appendChild(lNb);
        // Espace vide : haut / bas
        var lE = ligne('Espace'); lE.appendChild(seg([{ val: 'haut', lbl: 'Haut' }, { val: 'bas', lbl: 'Bas' }], f.vide, function (v) { f.vide = v; maj(); ouvrirEditFacade(path, svgCx, svgCy); })); pop.appendChild(lE);
        // Hauteur de chaque façade (mm), du HAUT vers le BAS dans l'affichage
        var lH = htm('div', { style: 'display:flex;flex-direction:column;gap:4px' });
        lH.appendChild(htm('span', { style: 'font-size:12px;color:#6b6b66' }, 'Hauteur façades (mm) — dispo ' + dispoH));
        for (var ti = f.tiroirs.length - 1; ti >= 0; ti--) { // affichage haut→bas
          (function (idx) {
            var row = htm('div', { style: 'display:flex;gap:6px;align-items:center' });
            row.appendChild(htm('span', { style: 'font-size:12px;color:#6b6b66;width:54px' }, 'Tiroir ' + (idx + 1)));
            var inp = htm('input', { type: 'number', min: '20', step: '5', value: String(Math.round(f.tiroirs[idx])),
              style: 'flex:1;min-height:34px;border:1px solid #4F5E3C;border-radius:7px;font:inherit;font-size:13px;padding:0 8px;width:60px' });
            inp.addEventListener('change', function () {
              var v = Math.max(20, Math.min(dispoH, Math.round(+inp.value || 0)));
              f.tiroirs[idx] = v; maj(); ouvrirEditFacade(path, svgCx, svgCy);
            });
            row.appendChild(inp); lH.appendChild(row);
          })(ti);
        }
        pop.appendChild(lH);
      }
      var bSup = htm('button', { style: 'min-height:36px;border:none;background:#c0392b;color:#fff;border-radius:8px;font:inherit;cursor:pointer' }, 'Supprimer la façade');
      bSup.addEventListener('click', function () { delete c.facade; svgWrap.querySelectorAll('.w2d-pop').forEach(function (n) { n.remove(); }); selPath = null; maj(); });
      pop.appendChild(bSup);
      svgWrap.appendChild(pop);
    }

    // ── Drag d'une séparation ────────────────────────────────────
    function attacherDragDiv(hit, d) {
      hit.addEventListener('pointerdown', function (e) {
        e.preventDefault(); selPath = null;
        var node = caseAt(d.path);
        var i = d.idx, ep = modele.ep;
        var a = node.tailles[i], b = node.tailles[i + 1];
        function loc(ev) { var p = svgEl.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svgEl.getScreenCTM().inverse()); }
        var start = loc(e);
        function move(ev) {
          var pt = loc(ev);
          var dd = d.sens === 'v' ? (pt.x - start.x) : (start.y - pt.y); // +dd agrandit l'enfant i
          dd = snap(dd);
          var na = clamp(a + dd, MIN_CASE, a + b - MIN_CASE);
          node.tailles[i] = na; node.tailles[i + 1] = a + b - na;
          rendre();
        }
        function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); emettre(); }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
    }

    // Supprime une séparation : fusionne les 2 cases adjacentes.
    // 2 feuilles → 1 feuille · feuille+contenu → garde le côté avec contenu · 2 splits → garde le plus grand
    function supprimerDivider(d) {
      var node = caseAt(d.path), i = d.idx, ep = modele.ep;
      var a = node.enfants[i], b = node.enfants[i + 1];
      var aF = isFeuille(a), bF = isFeuille(b);
      var nouvelleTaille = node.tailles[i] + node.tailles[i + 1] + ep;
      var garde;
      if (aF && bF) garde = {};
      else if (aF) garde = b;
      else if (bF) garde = a;
      else garde = (node.tailles[i] >= node.tailles[i + 1]) ? a : b;
      node.enfants.splice(i, 2, garde);
      node.tailles.splice(i, 2, nouvelleTaille);
      // si plus qu'un enfant, le nœud devient cette case
      if (node.enfants.length === 1) {
        var info = parentDe(d.path);
        if (info) info.node.enfants[info.idx] = node.enfants[0];
        else modele.racine = node.enfants[0];
      }
      selPath = null; maj();
    }

    // ── Cotations hors-tout ──────────────────────────────────────
    function coteH(x0, y0, L) {
      var y = y0 - 64;
      svgEl.appendChild(svg('line', { x1: x0, y1: y, x2: x0 + L, y2: y, stroke: '#6b6b66', 'stroke-width': 1.5 }));
      ['M' + x0 + ' ' + (y - 6) + 'V' + (y + 6), 'M' + (x0 + L) + ' ' + (y - 6) + 'V' + (y + 6)]
        .forEach(function (dd) { svgEl.appendChild(svg('path', { d: dd, stroke: '#6b6b66', 'stroke-width': 1.5 })); });
      var t = svg('text', { x: x0 + L / 2, y: y - 6, 'text-anchor': 'middle', 'font-size': 30, fill: '#6b6b66', 'font-family': 'inherit' });
      t.textContent = Math.round(L); svgEl.appendChild(t);
    }
    function coteV(x0, y0, H) {
      var x = x0 - 26;
      svgEl.appendChild(svg('line', { x1: x, y1: y0, x2: x, y2: y0 + H, stroke: '#6b6b66', 'stroke-width': 1.5 }));
      ['M' + (x - 6) + ' ' + y0 + 'H' + (x + 6), 'M' + (x - 6) + ' ' + (y0 + H) + 'H' + (x + 6)]
        .forEach(function (dd) { svgEl.appendChild(svg('path', { d: dd, stroke: '#6b6b66', 'stroke-width': 1.5 })); });
      var t = svg('text', { x: x - 8, y: y0 + H / 2, 'text-anchor': 'middle', 'font-size': 30, fill: '#6b6b66', 'font-family': 'inherit',
        transform: 'rotate(-90 ' + (x - 8) + ' ' + (y0 + H / 2) + ')' });
      t.textContent = Math.round(H); svgEl.appendChild(t);
    }

    // Désélection au clic dans le vide
    svgWrap.addEventListener('click', function (e) {
      if (e.target === svgEl || e.target === svgWrap) { selPath = null; rendre(); }
    });

    // ── Cycle ────────────────────────────────────────────────────
    function emettre() { onChange(getModele()); }
    function maj() {
      champH._input.value = modele.H; champL._input.value = modele.L;
      champP._input.value = modele.P; champEp._input.value = modele.ep;
      champNc._input.value = nbColonnes();
      _syncMode();
      rendre(); emettre();
    }

    rendre();

    // ── API ──────────────────────────────────────────────────────
    function getModele() { return JSON.parse(JSON.stringify(modele)); }
    function setModele(m) { modele = normaliserModele(JSON.parse(JSON.stringify(m))); selPath = null; maj(); }
    function detruire() {
      if (modeOverlay && modeOverlay.parentNode) modeOverlay.parentNode.removeChild(modeOverlay);
      container.innerHTML = '';
    }
    return { getModele: getModele, setModele: setModele, detruire: detruire };
  }

  // ════════════════════════════════════════════════════════════════
  //  DESSIN STATIQUE d'un meuble (réutilisable, lecture seule)
  // ════════════════════════════════════════════════════════════════
  // Même répartition que l'éditeur (repartirTailles), sans muter le modèle.
  function normaliserTaillesPure(tailles, enfants, S, ep) {
    return repartirTailles(tailles, enfants.length, S, ep);
  }
  // géométrie pure d'une façade en coords mm selon la pose (sans dépendre du scope creer)
  function facadeGeomPure(lf, pose, ep) {
    if (pose === 'encastre') {
      var j = JEU_ENCASTRE;
      return { x: lf.x + j, y: lf.y + j, w: Math.max(1, lf.w - 2 * j), h: Math.max(1, lf.h - 2 * j) };
    }
    var e = ep / 2, g = JEU_APPLIQUE / 2;
    return { x: lf.x - e + g, y: lf.y - e + g, w: lf.w + 2 * e - 2 * g, h: lf.h + 2 * e - 2 * g };
  }
  // Rectangles des façades de tiroirs empilées dans un volume (g = rect façade en mm).
  // f.tiroirs = [hauteurs mm, du BAS vers le HAUT] ; f.vide = 'haut'|'bas' = côté de l'espace restant.
  // Sans f.tiroirs → un seul tiroir qui remplit le volume. Renvoie les rects du BAS vers le HAUT.
  function tiroirFrontRects(g, f) {
    var list = (f && f.tiroirs && f.tiroirs.length) ? f.tiroirs.slice() : [g.h];
    var S = 0, i; for (i = 0; i < list.length; i++) S += list[i];
    if (S > g.h && S > 0) { var k = g.h / S; for (i = 0; i < list.length; i++) list[i] *= k; S = g.h; }
    var stackBottom = (f && f.vide === 'bas') ? (g.y + S) : (g.y + g.h); // vide en bas → pile collée en haut
    var out = [], yb = stackBottom;
    for (i = 0; i < list.length; i++) { out.push({ x: g.x, y: yb - list[i], w: g.w, h: list[i] }); yb -= list[i]; }
    return out;
  }
  // layout pur (ne mute pas le modèle) — remplit out.dividers + out.feuilles en coords mm
  // encAnc = true si cette cellule est entièrement derrière une porte encastrée (héritée d'un ancêtre).
  // Règle débit : un séparateur interne (étagère 'h' OU montant 'v') situé derrière une porte
  // ENCASTRÉE recule en profondeur de RET_ENCASTRE = ep + JEU_ENCASTRE (la porte occupe l'avant
  // de l'ouverture). On le note sur le divider via retraitFond (>0) / profEncastre (bool).
  function layoutCellule(cell, x, y, w, h, ep, out, path, encAnc) {
    path = path || [];
    var RET = ep + JEU_ENCASTRE;
    // façade attachée à cette cellule (feuille OU nœud divisé = porte pleine colonne)
    if (cell.facade && out.facades) out.facades.push({ x: x, y: y, w: w, h: h, path: path.slice(), cell: cell, span: cell.facade.span || 1 });
    if (isFeuille(cell)) { if (out.feuilles) out.feuilles.push({ x: x, y: y, w: w, h: h, path: path.slice(), cell: cell }); return; }
    var k = cell.enfants.length;
    var tailles = normaliserTaillesPure(cell.tailles.slice(), cell.enfants, cell.sens === 'h' ? h : w, ep);
    // un enfant est derrière une porte encastrée s'il en hérite OU s'il porte lui-même une telle porte (porte pleine colonne)
    function enfEnc(ch) { return encAnc || !!(ch && ch.facade && ch.facade.pose === 'encastre'); }
    if (cell.sens === 'v') {
      var cx = x;
      for (var i = 0; i < k; i++) {
        var cw = tailles[i];
        layoutCellule(cell.enfants[i], cx, y, cw, h, ep, out, path.concat(i), enfEnc(cell.enfants[i])); cx += cw;
        // caisson = séparateur vertical au niveau racine (path vide) → mur mitoyen
        // entre deux caissons : peut être rendu en « joues doublées » selon le mode.
        if (i < k - 1) { out.dividers.push({ x: cx, y: y, w: ep, h: h, sens: 'v', retraitFond: encAnc ? RET : 0, profEncastre: !!encAnc, caisson: path.length === 0 }); cx += ep; }
      }
    } else {
      // un séparateur 'h' (étagère) entre enfants j/j+1 est derrière une porte encastrée si encAnc,
      // ou si une feuille sœur i<=j porte une porte encastrée dont le span couvre j+1 (porte multi-volumes).
      var divEnc = function (j) {
        if (encAnc) return true;
        for (var ii = 0; ii <= j; ii++) {
          var ch = cell.enfants[ii];
          if (ch && ch.facade && ch.facade.pose === 'encastre' && (ii + (ch.facade.span || 1) - 1) >= j + 1) return true;
        }
        return false;
      };
      var by = y + h;
      for (var j = 0; j < k; j++) {
        var ch = tailles[j], top = by - ch;
        layoutCellule(cell.enfants[j], x, top, w, ch, ep, out, path.concat(j), enfEnc(cell.enfants[j])); by = top;
        if (j < k - 1) { by -= ep; var de = divEnc(j); out.dividers.push({ x: x, y: by, w: w, h: ep, sens: 'h', retraitFond: de ? RET : 0, profEncastre: de }); }
      }
    }
  }
  // dessine un meuble (caisson + séparations) dans svgEl, coin haut-gauche (x0,y0) en mm
  // o.materiaux (catalogue) → teintes par matériau ; o.bois force une teinte unie ; o.stroke force le contour
  // o.sansFacades = true → plan SANS portes/tiroirs (vue intérieure pour la récupération)
  function dessinerMeuble(svgEl, m, x0, y0, o) {
    o = o || {};
    var ep = m.ep, mats = o.materiaux, sw = o.sw || 2;
    function coul(key) {
      if (o.bois) return { fill: o.bois, stroke: o.stroke || '#9c7b4f' };
      if (mats && mats.length) { var c = couleurMateriau(trouverMat(mats, materiauIdElement(m, key))); return { fill: c.fill, stroke: o.stroke || c.stroke }; }
      return { fill: '#d9b98a', stroke: o.stroke || '#9c7b4f' };
    }
    function pan(x, y, w, h, key) { var c = coul(key); svgEl.appendChild(svg('rect', { x: x, y: y, width: w, height: h, fill: c.fill, stroke: c.stroke, 'stroke-width': sw })); }
    // ── Coque selon le mode de construction ──────────────────────────
    // pan_sup/pan_inf = 'interieur' → joue traversante (pleine hauteur),
    //   panneau ENTRE les joues (plus court). Sinon ('pardessus'/'pardessous')
    //   → panneau pleine largeur PAR-DESSUS, joue plus courte entre les panneaux.
    // Sans mode sélectionné → ancien rendu (panneaux pleine largeur).
    var _attrs = (typeof WooderModeConstruction !== 'undefined' &&
                  WooderModeConstruction.obtenirAttributs && m.modeConstruction)
      ? WooderModeConstruction.obtenirAttributs(m.modeConstruction) : null;
    var supIn = !!(_attrs && _attrs.pan_sup === 'interieur'); // panneau sup entre les joues
    var infIn = !!(_attrs && _attrs.pan_inf === 'interieur'); // panneau inf entre les joues
    // multi-caisson : montants doublés (nb_montants_centraux == 2) → mur mitoyen =
    // 2 joues accolées. Même critère que decomposerItemsSelonMode (calcul.html).
    var doubleMont = !!(_attrs && _attrs.nb_montants_centraux == 2);
    // traversants → montants pleine hauteur ; sandwich → entre les panneaux.
    // pan_*_continu === false → panneau découpé en un morceau par caisson.
    var travers = !!(_attrs && _attrs.montants_centraux === 'traversants');
    var supCont = !(_attrs && _attrs.pan_sup_continu === false);
    var infCont = !(_attrs && _attrs.pan_inf_continu === false);
    var sTop = supIn ? 0 : ep;   // décalage du haut de la joue (0 = pleine hauteur)
    var sBot = infIn ? 0 : ep;
    var ix = x0 + ep, iy = y0 + ep, iw = m.L - 2 * ep, ih = m.H - 2 * ep;

    // Layout d'abord : bornes des caissons (séparateurs de niveau racine).
    var out = { dividers: [], feuilles: [], facades: [] };
    layoutCellule(m.racine, ix, iy, iw, ih, ep, out);
    var caissonDivs = out.dividers.filter(function (d) { return d.caisson && d.sens === 'v'; })
                                  .sort(function (a, b) { return a.x - b.x; });
    var splitPan = doubleMont && caissonDivs.length > 0;

    // joues
    pan(x0,             y0 + sTop, ep, m.H - sTop - sBot, 'latG');
    pan(x0 + m.L - ep,  y0 + sTop, ep, m.H - sTop - sBot, 'latD');
    // panneaux haut / bas — un morceau par caisson si non continu
    function bandePan(yB, role, interieur, continu) {
      var pStart = interieur ? x0 + ep : x0;
      var pEnd   = interieur ? x0 + m.L - ep : x0 + m.L;
      if (!splitPan || continu) { pan(pStart, yB, pEnd - pStart, ep, role); return; }
      // Où s'arrête le morceau au droit du mur mitoyen (2 joues accolées) ?
      //   panneau INTÉRIEUR   → au nu du mur (les 2 joues passent entre)
      //   PAR-DESSUS/DESSOUS  → au MILIEU du mur : chaque caisson porte le
      //     sien par-dessus ses 2 joues, les morceaux se rejoignent.
      //     (= largeur colonne + 2·ep, comme decomposerItemsSelonMode)
      var seg = pStart;
      caissonDivs.forEach(function (d) {
        var xC = d.x + d.w / 2;
        pan(seg, yB, Math.max(1, (interieur ? xC - d.w : xC) - seg), ep, role);
        seg = interieur ? xC + d.w : xC;
      });
      pan(seg, yB, Math.max(1, pEnd - seg), ep, role);
    }
    bandePan(y0, 'sup', supIn, supCont);
    bandePan(y0 + m.H - ep, 'inf', infIn, infCont);
    svgEl.appendChild(svg('rect', { x: ix, y: iy, width: iw, height: ih, fill: o.interieur || '#fbf6ec' }));
    out.dividers.forEach(function (d) {
      // joues doublées : un séparateur de caisson (niveau racine) en mode multi-
      // caisson représente un mur mitoyen de DEUX joues accolées (caissons séparés).
      // On dessine alors 2 panneaux contournés côte à côte au lieu d'un seul.
      if (doubleMont && d.caisson && d.sens === 'v') {
        // 2 joues mitoyennes : séparateur élargi (~2× ep) + gap visible.
        // Pleine hauteur si traversants, sinon hauteur intérieure (sandwich).
        var totM = d.w * 2, gap = Math.max(3, d.w * 0.5), hw = (totM - gap) / 2;
        var xM = d.x + d.w / 2 - totM / 2, c2 = coul('sep:v:_:0');
        var myM = travers ? (y0 + sTop) : d.y;
        var mhM = travers ? (m.H - sTop - sBot) : d.h;
        svgEl.appendChild(svg('rect', { x: xM,             y: myM, width: hw, height: mhM, fill: c2.fill, stroke: c2.stroke, 'stroke-width': sw }));
        svgEl.appendChild(svg('rect', { x: xM + hw + gap,  y: myM, width: hw, height: mhM, fill: c2.fill, stroke: c2.stroke, 'stroke-width': sw }));
      } else {
        pan(d.x, d.y, d.w, d.h, 'sep:' + d.sens + ':_:0');
      }
    });
    // map des rects de feuilles pour résoudre les façades multi-volumes (span)
    var leafMap = {}; out.feuilles.forEach(function (lf) { leafMap[lf.path.join('.')] = lf; });
    // façades (portes & tiroirs) par-dessus — feuilles, colonnes pleines, et span multi-cases
    // o.sansFacades : plan « sans portes » (récupération) → on saute le dessin des façades
    if (!o.sansFacades) out.facades.forEach(function (ff) {
      var fac = ff.cell.facade; if (!fac) return;
      var lf = { x: ff.x, y: ff.y, w: ff.w, h: ff.h };
      if ((ff.span || 1) > 1 && ff.path.length) {       // étend sur les cases empilées au-dessus
        var i = ff.path[ff.path.length - 1], minY = lf.y, maxY = lf.y + lf.h;
        for (var k = 1; k < ff.span; k++) {
          var p = ff.path.slice(); p[p.length - 1] = i + k;
          var r = leafMap[p.join('.')]; if (!r) break;
          minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
        }
        lf = { x: lf.x, y: minY, w: lf.w, h: maxY - minY };
      }
      var g = facadeGeomPure(lf, fac.pose, ep), key = 'facade:' + ff.path.join('.');
      var c = o.bois ? { fill: o.bois, stroke: o.stroke || '#9c7b4f' } : coul(key);
      var trait = (mats && mats.length) ? (couleurMateriau(trouverMat(mats, materiauIdElement(m, key))).texte === '#fff' ? '#ffffff' : '#5a4326') : '#5a4326';
      var tiroirMulti = fac.type === 'tiroir' && fac.tiroirs && fac.tiroirs.length;
      if (!tiroirMulti) svgEl.appendChild(svg('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 3, fill: c.fill, stroke: o.stroke || c.stroke, 'stroke-width': sw }));
      if (fac.type === 'tiroir') {
        tiroirFrontRects(g, fac).forEach(function (fr) {
          if (tiroirMulti) svgEl.appendChild(svg('rect', { x: fr.x, y: fr.y, width: fr.w, height: fr.h, rx: 3, fill: c.fill, stroke: o.stroke || c.stroke, 'stroke-width': sw }));
          var hy = fr.y + Math.min(40, fr.h * 0.28);
          svgEl.appendChild(svg('line', { x1: fr.x + fr.w * 0.28, y1: hy, x2: fr.x + fr.w * 0.72, y2: hy, stroke: trait, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        });
      } else {
        var sens = fac.sens || 'droite', mP = Math.min(42, g.w * 0.12);
        function poignee(px) { svgEl.appendChild(svg('line', { x1: px, y1: g.y + g.h * 0.42, x2: px, y2: g.y + g.h * 0.58, stroke: trait, 'stroke-width': 7, 'stroke-linecap': 'round' })); }
        if (sens === 'double') {
          svgEl.appendChild(svg('line', { x1: g.x + g.w / 2, y1: g.y, x2: g.x + g.w / 2, y2: g.y + g.h, stroke: trait, 'stroke-width': 2 }));
          poignee(g.x + g.w / 2 - 14); poignee(g.x + g.w / 2 + 14);
        }
        else if (sens === 'gauche') { poignee(g.x + mP); }
        else { poignee(g.x + g.w - mP); }
      }
    });
    if (o.cotes) dessinerCotes(svgEl, m, x0, y0, out, ep, sw);
  }

  // Cotes de la vue de face : hors-tout L×H + largeurs de colonnes + hauteurs des
  // compartiments (les « espaces »). Coords absolues (mêmes que dessinerMeuble).
  function dessinerCotes(svgEl, m, x0, y0, out, ep, sw) {
    var dim = Math.max(m.L, m.H), fs = dim / 45, tick = dim / 150, col = '#9c7b4f', lw = Math.max(0.6, sw * 0.5);
    function ln(x1, y1, x2, y2) { svgEl.appendChild(svg('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: col, 'stroke-width': lw })); }
    function tx(x, y, s, rot) { var t = svg('text', { x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: col, 'font-family': 'inherit' }); if (rot) t.setAttribute('transform', 'rotate(' + rot + ' ' + x + ' ' + y + ')'); t.textContent = s; svgEl.appendChild(t); }
    function coteH(x1, x2, y, lab) { if (x2 - x1 < 1) return; ln(x1, y, x2, y); ln(x1, y - tick, x1, y + tick); ln(x2, y - tick, x2, y + tick); tx((x1 + x2) / 2, y - fs * 0.8, lab); }
    function coteV(y1, y2, x, lab) { if (y2 - y1 < 1) return; ln(x, y1, x, y2); ln(x - tick, y1, x + tick, y1); ln(x - tick, y2, x + tick, y2); tx(x - fs * 0.8, (y1 + y2) / 2, lab, -90); }
    // hors-tout
    coteH(x0, x0 + m.L, y0 + m.H + tick * 3, String(Math.round(m.L)));
    coteV(y0, y0 + m.H, x0 - tick * 3, String(Math.round(m.H)));
    // largeurs de colonnes (si plusieurs) : feuilles groupées par 1re composante de path
    var cols = {};
    (out.feuilles || []).forEach(function (lf) {
      var c = (lf.path && lf.path.length) ? lf.path[0] : 0;
      var o = cols[c] || (cols[c] = { x0: Infinity, x1: -Infinity });
      o.x0 = Math.min(o.x0, lf.x); o.x1 = Math.max(o.x1, lf.x + lf.w);
    });
    var keys = Object.keys(cols);
    if (keys.length > 1) keys.forEach(function (k) { var c = cols[k]; coteH(c.x0, c.x1, y0 + m.H + tick * 8, String(Math.round(c.x1 - c.x0))); });
    // hauteurs de compartiments (les « espaces ») : chaque feuille, cote verticale bord gauche intérieur
    (out.feuilles || []).forEach(function (lf) { if (lf.h > fs * 2.2) coteV(lf.y, lf.y + lf.h, lf.x + tick * 2.5, String(Math.round(lf.h))); });
  }

  // ════════════════════════════════════════════════════════════════
  //  COMPOSITION — mise en place des meubles dans l'espace dispo
  //  positions[i] = { x: mm depuis bord gauche, y: mm du sol au bas du meuble }
  // ════════════════════════════════════════════════════════════════
  function creerComposition(container, opts) {
    opts = opts || {};
    var espace = Object.assign({ L: 3000, H: 2400, P: 600 }, opts.espace || {});
    var meubles = (opts.meubles || []).map(function (m) { return normaliserModele(JSON.parse(JSON.stringify(m))); });
    var lectureSeule = !!opts.lectureSeule;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};
    var materiaux = opts.materiaux || [];
    var PAD = 140, SNAPD = 25;   // distance d'aimantation (mm)

    var positions = opts.positions ? JSON.parse(JSON.stringify(opts.positions)) : null;
    if (!positions || positions.length !== meubles.length) {
      positions = []; var cur = 0;
      meubles.forEach(function (m) { positions.push({ x: cur, y: 0 }); cur += m.L + 10; });
    }

    container.innerHTML = '';
    var wrap = htm('div', { style: 'font-family:inherit' });
    var info = htm('div', { style: 'font-size:13px;color:#6b6b66;margin:0 0 8px;min-height:18px' });
    var svgWrap = htm('div', { style: 'position:relative;border:1px solid #e3dfd3;border-radius:8px;background:#faf8f2;padding:8px;overflow:auto' });
    wrap.appendChild(info); wrap.appendChild(svgWrap); container.appendChild(wrap);
    var svgEl, drag = -1;

    function deborde(i) {
      var m = meubles[i], p = positions[i];
      return p.x < -0.5 || p.y < -0.5 || p.x + m.L > espace.L + 0.5 || p.y + m.H > espace.H + 0.5;
    }
    // coin haut-gauche d'un meuble en coords svg (mm)
    function coin(i) { return { x: PAD + positions[i].x, y: PAD + (espace.H - positions[i].y - meubles[i].H) }; }

    function aimante(i) {
      var m = meubles[i], p = positions[i], cx = [0, espace.L - m.L], cy = [0, espace.H - m.H];
      for (var j = 0; j < meubles.length; j++) {
        if (j === i) continue;
        var o = meubles[j], q = positions[j];
        cx.push(q.x, q.x + o.L - m.L, q.x + o.L, q.x - m.L);
        cy.push(q.y, q.y + o.H - m.H, q.y + o.H, q.y - m.H);
      }
      function best(v, arr) { var b = v, d = SNAPD; arr.forEach(function (c) { var dd = Math.abs(c - v); if (dd < d) { d = dd; b = c; } }); return b; }
      p.x = best(p.x, cx); p.y = best(p.y, cy);
    }

    function rendre() {
      svgWrap.innerHTML = '';
      var W = espace.L + PAD * 2, H = espace.H + PAD * 2;
      svgEl = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: 'max-height:74vh;display:block;font-family:inherit;touch-action:none' });
      svgWrap.appendChild(svgEl);

      // sol
      svgEl.appendChild(svg('line', { x1: PAD - 40, y1: PAD + espace.H, x2: PAD + espace.L + 40, y2: PAD + espace.H, stroke: '#b0a890', 'stroke-width': 3 }));
      // cadre espace dispo (pointillés)
      svgEl.appendChild(svg('rect', { x: PAD, y: PAD, width: espace.L, height: espace.H, fill: 'none', stroke: '#9c7b4f', 'stroke-width': 2, 'stroke-dasharray': '14 10', rx: 2 }));
      // cotes espace
      (function () {
        var t = svg('text', { x: PAD + espace.L / 2, y: PAD - 50, 'text-anchor': 'middle', 'font-size': 34, fill: '#6b6b66', 'font-family': 'inherit' });
        t.textContent = 'Espace ' + Math.round(espace.L) + ' × ' + Math.round(espace.H) + ' mm'; svgEl.appendChild(t);
      })();

      var deb = false;
      meubles.forEach(function (m, i) {
        var c = coin(i), over = deborde(i); if (over) deb = true;
        var selStroke = (i === drag) ? '#4F5E3C' : (over ? '#c0392b' : null);
        var optDess = over
          ? { stroke: '#c0392b', sw: 3, bois: '#eccfca' }
          : { stroke: selStroke, sw: (i === drag ? 4 : 2), materiaux: materiaux };
        dessinerMeuble(svgEl, m, c.x, c.y, optDess);
        // étiquette numéro
        var lbl = svg('g', {});
        lbl.appendChild(svg('circle', { cx: c.x + 28, cy: c.y + 28, r: 20, fill: '#fff', stroke: '#4F5E3C', 'stroke-width': 2.5 }));
        var tn = svg('text', { x: c.x + 28, y: c.y + 28, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 24, 'font-weight': 700, fill: '#4F5E3C', 'font-family': 'inherit' });
        tn.textContent = (i + 1); lbl.appendChild(tn); svgEl.appendChild(lbl);
        // dimensions du meuble (sous le meuble)
        var td = svg('text', { x: c.x + m.L / 2, y: c.y + m.H + 38, 'text-anchor': 'middle', 'font-size': 26, fill: '#6b6b66', 'font-family': 'inherit' });
        td.textContent = Math.round(m.L) + '×' + Math.round(m.H); svgEl.appendChild(td);

        if (lectureSeule) return;
        var hit = svg('rect', { x: c.x, y: c.y, width: m.L, height: m.H, fill: 'transparent', style: 'cursor:move' });
        attacherDrag(hit, i); svgEl.appendChild(hit);
      });

      info.textContent = deb
        ? '⚠️ Un meuble (en rouge) dépasse de l\'espace disponible.'
        : (lectureSeule ? '' : 'Glissez les meubles : ils s\'aimantent entre eux et aux bords.');
      info.style.color = deb ? '#c0392b' : '#6b6b66';
    }

    function attacherDrag(hit, i) {
      hit.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        drag = i;
        function loc(ev) { var pt = svgEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svgEl.getScreenCTM().inverse()); }
        var s = loc(e), p0 = { x: positions[i].x, y: positions[i].y };
        rendre();
        function move(ev) {
          var pt = loc(ev);
          positions[i].x = snap(p0.x + (pt.x - s.x));
          positions[i].y = snap(p0.y - (pt.y - s.y)); // y vers le haut
          aimante(i);
          rendre();
        }
        function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); drag = -1; rendre(); emettre(); }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
    }

    function emettre() { onChange({ espace: espace, positions: JSON.parse(JSON.stringify(positions)) }); }
    rendre();

    return {
      getPositions: function () { return JSON.parse(JSON.stringify(positions)); },
      setEspace: function (e) { espace = Object.assign(espace, e); rendre(); },
      setMeubles: function (ms, pos) { meubles = ms.map(function (m) { return normaliserModele(JSON.parse(JSON.stringify(m))); }); if (pos) positions = JSON.parse(JSON.stringify(pos)); else { positions = []; var c = 0; meubles.forEach(function (m) { positions.push({ x: c, y: 0 }); c += m.L + 10; }); } rendre(); },
      detruire: function () { container.innerHTML = ''; }
    };
  }

  // Layout intérieur pour le DÉBIT (pur, ne dépend pas du rendu) : renvoie les séparateurs
  // internes avec leur profondeur effective. Une étagère/un montant derrière une porte
  // encastrée recule de ep+JEU_ENCASTRE (la porte ferme dans l'épaisseur de l'ouverture).
  // profondeur = profondeurBase - retraitFond ; profEncastre = true si reculé.
  function layoutDebit(modele) {
    var m = normaliserModele(JSON.parse(JSON.stringify(modele)));
    var ep = m.ep, ix = m.ep, iy = m.ep, iw = m.L - 2 * m.ep, ih = m.H - 2 * m.ep;
    var out = { dividers: [], feuilles: [], facades: [] };
    layoutCellule(m.racine, ix, iy, iw, ih, ep, out, [], false);
    var Pbase = m.P;
    out.dividers.forEach(function (d) {
      d.profondeurBase = Pbase;
      d.profondeur = Math.max(1, Pbase - (d.retraitFond || 0));
    });
    out.coque = coqueSelonMode(m, out);
    return out;
  }

  // ── Coque du caisson selon le mode de construction ────────────────
  // SOURCE UNIQUE : le dessin 2D, la 3D et le débit doivent donner les mêmes
  // pièces. Tant que chacun recalculait sa coque dans son coin, le débit
  // ignorait le mode et sortait toujours des panneaux pleine largeur — on
  // coupait donc les mauvaises pièces dès qu'on quittait le mode par-dessus.
  //   pan_sup/pan_inf = 'interieur' → panneau ENTRE les joues (L − 2·ep),
  //     joues pleine hauteur ; sinon panneau PAR-DESSUS (L), joues raccourcies.
  //   pan_*_continu === false + montants doublés → un morceau par caisson.
  // Retourne [{ role:'latG'|'latD'|'sup'|'inf', x, y, w, h }] en vue de face
  // (y vers le BAS depuis le haut du meuble), profondeur = m.P.
  function coqueSelonMode(m, lay) {
    var MC = global.WooderModeConstruction;
    var a = (MC && MC.obtenirAttributs && m.modeConstruction)
      ? MC.obtenirAttributs(m.modeConstruction) : null;
    var ep = m.ep, L = m.L, H = m.H;
    var supIn      = !!(a && a.pan_sup === 'interieur');
    var infIn      = !!(a && a.pan_inf === 'interieur');
    var supCont    = !(a && a.pan_sup_continu === false);
    var infCont    = !(a && a.pan_inf_continu === false);
    var doubleMont = !!(a && a.nb_montants_centraux == 2);
    var plintheEnc = !!(a && a.plinthe_encastree);
    var plintheH   = plintheEnc ? ((m.pieds && m.pieds.hauteurPlinthe) || 100) : 0;
    var Hb   = H - plintheH;            // la plinthe encastrée est une pièce à part
    var sTop = supIn ? 0 : ep;
    var sBot = (infIn || plintheEnc) ? 0 : ep;
    var divs = (lay.dividers || []).filter(function (d) { return d.caisson && d.sens === 'v'; })
                                   .sort(function (x, y) { return x.x - y.x; });
    var split = doubleMont && divs.length > 0;
    var c = [];
    c.push({ role: 'latG', x: 0,      y: sTop, w: ep, h: H - sTop - sBot });
    c.push({ role: 'latD', x: L - ep, y: sTop, w: ep, h: H - sTop - sBot });
    function bande(y, role, interieur, continu) {
      var x0 = interieur ? ep : 0, x1 = interieur ? L - ep : L;
      if (!split || continu) { c.push({ role: role, x: x0, y: y, w: x1 - x0, h: ep }); return; }
      var seg = x0;
      divs.forEach(function (d) {
        var xC = d.x + d.w / 2;                    // axe du mur mitoyen
        c.push({ role: role, x: seg, y: y, w: Math.max(1, (interieur ? xC - d.w : xC) - seg), h: ep });
        seg = interieur ? xC + d.w : xC;           // reprise après le mur
      });
      c.push({ role: role, x: seg, y: y, w: Math.max(1, x1 - seg), h: ep });
    }
    bande(0,       'sup', supIn, supCont);
    bande(Hb - ep, 'inf', infIn || plintheEnc, infCont);
    return c;
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT — débit ré-importable + PDF 3 pages (tableau, face, éclatée)
  // ════════════════════════════════════════════════════════════════

  // Liste de débit déduite du modèle (panneaux caisson + séparateurs + façades).
  // Format compatible avec l'import PDF de l'outil de calcul :
  //   { designation, longueur, largeur, epaisseur, nombre }
  // Sens de débit imposé à une pièce, ou null si elle peut pivoter librement.
  // Un décor UNI n'a pas de fil : le contraindre ne ferait qu'ajouter de la
  // chute pour rien. Sans table de décors chargée, on ne contraint que si
  // l'utilisateur a explicitement réglé un sens sur ce meuble.
  function filDebit(m, key) {
    var WT = global.WooderTextures;
    if (WT && WT.veine) return WT.veine(materiauIdElement(m, key)) ? filElement(m, key) : null;
    var choisi = (m.fil && Object.keys(m.fil).length) ||
                 (m.filType && Object.keys(m.filType).length) || m.filDefaut;
    return choisi ? filElement(m, key) : null;
  }

  // Le mode de construction porte-t-il une plinthe encastrée entre les joues ?
  function _plintheEncastree(m) {
    var MC = global.WooderModeConstruction;
    if (!MC || !MC.obtenirAttributs || !m.modeConstruction) return false;
    var a = MC.obtenirAttributs(m.modeConstruction);
    return !!(a && a.plinthe_encastree);
  }

  function debit(modeleIn) {
    var m = normaliserModele(JSON.parse(JSON.stringify(modeleIn)));
    var ep = m.ep, P = m.P, H = m.H, L = m.L;
    var lay = layoutDebit(m);
    var pieces = [];
    // key = clé matériau de la pièce → sert au sens du fil (et au matériau)
    function add(designation, a, b, epp, nb, key) {
      if (nb <= 0) return;
      var lon = Math.round(Math.max(a, b)), lar = Math.round(Math.min(a, b));
      var p = { designation: designation, longueur: lon, largeur: lar, epaisseur: epp, nombre: nb };
      if (key) {
        var f = filDebit(m, key);
        if (f) p.fil = f;                       // 'long' | 'trav' — sinon absent
        p.matId = materiauIdElement(m, key) || undefined;
      }
      pieces.push(p);
    }
    // Caisson : dimensions prises dans la coque calculée par layoutDebit, donc
    // identiques au dessin 2D et à la 3D. Un panneau non continu sort en
    // plusieurs morceaux — c'est bien ce qu'on coupe.
    var NOM_COQUE = { latG: 'Cote gauche', latD: 'Cote droit',
                      sup: 'Panneau superieur', inf: 'Panneau inferieur' };
    var nCoque = {};
    (lay.coque || []).forEach(function (c) {
      var n = (nCoque[c.role] = (nCoque[c.role] || 0) + 1);
      var multi = (lay.coque.filter(function (q) { return q.role === c.role; }).length > 1);
      // un côté est debout (sa hauteur est sa longueur), un panneau est couché
      var estCote = (c.role === 'latG' || c.role === 'latD');
      add(NOM_COQUE[c.role] + (multi ? ' ' + n : ''),
          estCote ? c.h : c.w, P, ep, 1, c.role);
    });
    add('Fond du meuble', H - 2 * ep, L - 2 * ep, (m.epFond || 8), 1, 'fond');
    // séparateurs internes (regroupés par dimension utile + profondeur)
    var grpMont = {}, grpEtag = {};
    lay.dividers.forEach(function (d) {
      if (d.sens === 'v') { var k = Math.round(d.h) + '|' + Math.round(d.profondeur); grpMont[k] = (grpMont[k] || 0) + 1; }
      else { var k2 = Math.round(d.w) + '|' + Math.round(d.profondeur); grpEtag[k2] = (grpEtag[k2] || 0) + 1; }
    });
    var hInt = H - 2 * ep, im = 1;
    Object.keys(grpMont).sort(function (a, b) { return parseFloat(b) - parseFloat(a); }).forEach(function (k) {
      var pr = k.split('|'), hh = parseFloat(pr[0]), pp = parseFloat(pr[1]);
      var plein = Math.abs(hh - hInt) <= Math.max(10, ep);
      add('Montant' + (plein ? ' intermediaire ' : ' local ') + (im++), hh, pp, ep, grpMont[k], 'sep:v:_:0');
    });
    var ie = 1;
    Object.keys(grpEtag).sort(function (a, b) { return parseFloat(b) - parseFloat(a); }).forEach(function (k) {
      var pr = k.split('|'), ww = parseFloat(pr[0]), pp = parseFloat(pr[1]);
      add('Etagere ' + (ie++), ww, pp, ep, grpEtag[k], 'sep:h:_:0');
    });
    // façades (portes + tiroirs) — résolution du span multi-volumes comme au dessin
    var leafMap = {}; lay.feuilles.forEach(function (lf) { leafMap[lf.path.join('.')] = lf; });
    // Les façades sont regroupées par dimensions ET par clé matériau : deux
    // portes de même taille mais de matière (ou de sens de fil) différentes
    // ne doivent pas être fusionnées en une seule ligne de débit.
    var portes = {}, tiroirs = {};
    function addPorte(w, h, n, key) { var k = Math.round(w) + 'x' + Math.round(h) + '|' + key; if (!portes[k]) portes[k] = { w: w, h: h, n: 0, key: key }; portes[k].n += n; }
    function addTiroir(w, h, n, key) { var k = Math.round(w) + 'x' + Math.round(h) + '|' + key; if (!tiroirs[k]) tiroirs[k] = { w: w, h: h, n: 0, key: key }; tiroirs[k].n += n; }
    lay.facades.forEach(function (ff) {
      var fac = ff.cell.facade; if (!fac) return;
      var lf = { x: ff.x, y: ff.y, w: ff.w, h: ff.h };
      if ((ff.span || 1) > 1 && ff.path.length) {
        var i = ff.path[ff.path.length - 1], minY = lf.y, maxY = lf.y + lf.h;
        for (var k = 1; k < ff.span; k++) { var p = ff.path.slice(); p[p.length - 1] = i + k; var r = leafMap[p.join('.')]; if (!r) break; minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h); }
        lf = { x: lf.x, y: minY, w: lf.w, h: maxY - minY };
      }
      var g = facadeGeomPure(lf, fac.pose, ep);
      var kf = 'facade:' + ff.path.join('.');
      if (fac.type === 'tiroir') { tiroirFrontRects(g, fac).forEach(function (fr) { addTiroir(fr.w, fr.h, 1, kf); }); }
      else if (fac.sens === 'double') { addPorte(g.w / 2, g.h, 2, kf); }
      else { addPorte(g.w, g.h, 1, kf); }
    });
    var ip = 1; Object.keys(portes).forEach(function (k) { var f = portes[k]; add('Porte ' + (ip++), f.h, f.w, ep, f.n, f.key); });
    var it = 1; Object.keys(tiroirs).forEach(function (k) { var f = tiroirs[k]; add('Tiroir facade ' + (it++), f.w, f.h, ep, f.n, f.key); });

    // ── Fileurs et plinthe rapportée ────────────────────────────────
    // Pièces d'habillage saisies par l'utilisateur (largeur = jeu mesuré).
    // Elles appartiennent au meuble : elles partent donc dans SON débit.
    var fl = m.fileurs || {};
    var plr = m.plinthe || {};
    var plRap = !!plr.active && !_plintheEncastree(m);
    var hPl = plRap ? (plr.hauteur || (m.pieds && m.pieds.hauteurPlinthe) || 100) : 0;
    // Le fileur descend jusqu'au SOL et borde la plinthe : avec une plinthe
    // rapportée le meuble est sur pieds, le fileur fait donc H + la hauteur de
    // plinthe ; avec une plinthe encastrée le caisson touche déjà le sol.
    // (Mêmes règles que wooder-3d.js : le débit et la 3D doivent coïncider.)
    var hFil = H + hPl;
    if (fl.gauche > 0) add('Fileur gauche', hFil, fl.gauche, ep, 1, 'fileur');
    if (fl.droite > 0) add('Fileur droit',  hFil, fl.droite, ep, 1, 'fileur');
    if (fl.haut   > 0) add('Fileur haut', L + (fl.gauche || 0) + (fl.droite || 0), fl.haut, ep, 1, 'fileur');
    // La plinthe s'arrête au nu du caisson : ce sont les fileurs qui la bordent.
    if (plRap) add('Plinthe rapportee', L, hPl, ep, 1, 'plinthe');
    return pieces;
  }

  // SVG autonome (avec fond blanc + namespace) pour sérialisation/image.
  function svgAutonome(W, H) {
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'font-family': 'Outfit,system-ui,sans-serif' });
    s.setAttribute('xmlns', SVG_NS);
    s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }));
    return s;
  }
  function svgVueFace(m, materiaux) {
    var pad = Math.round(Math.max(m.L, m.H) * 0.12) + 80;   // marge pour les cotes
    var W = m.L + pad * 2, H = m.H + pad * 2;
    var s = svgAutonome(W, H);
    dessinerMeuble(s, m, pad, pad, { materiaux: materiaux, cotes: true });
    return s;
  }
  // Vue « éclatée » lisible : structure ouverte (sans façades) à gauche, meuble complet à droite.
  function svgEclate(m, materiaux) {
    var pad = 70, gap = m.L * 0.5 + 120;
    var W = m.L * 2 + gap + pad * 2, H = m.H + pad * 2 + 60;
    var s = svgAutonome(W, H);
    dessinerMeuble(s, m, pad, pad, { materiaux: materiaux, sansFacades: true });
    dessinerMeuble(s, m, pad + m.L + gap, pad, { materiaux: materiaux });
    function legende(cx, txt) {
      var t = svg('text', { x: cx, y: pad + m.H + 44, 'text-anchor': 'middle', 'font-size': 34, fill: '#6b6b66' });
      t.textContent = txt; s.appendChild(t);
    }
    legende(pad + m.L / 2, 'Structure');
    legende(pad + m.L + gap + m.L / 2, 'Façades');
    return s;
  }
  // SVG → image JPEG (dataURL) via canvas. Promesse { dataURL, w, h }.
  function svgVersImage(svgEl) {
    return new Promise(function (resolve, reject) {
      var vb = (svgEl.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
      var w = vb[2], h = vb[3], scale = 2;
      var str = new XMLSerializer().serializeToString(svgEl);
      var src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(str)));
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ dataURL: cv.toDataURL('image/jpeg', 0.92), w: w, h: h });
      };
      img.onerror = reject;
      img.src = src;
    });
  }
  // PDF 3 pages : p1 = tableau de débit (texte ré-importable), p2 = vue de face, p3 = vue éclatée.
  function exporterPDF(modeleIn, opts) {
    opts = opts || {};
    var jsPDFns = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFns) { alert('jsPDF non chargé : impossible de générer le PDF.'); return Promise.reject('jsPDF'); }
    var m = normaliserModele(JSON.parse(JSON.stringify(modeleIn)));
    if (modeleIn && modeleIn.modeConstruction) m.modeConstruction = modeleIn.modeConstruction;
    var materiaux = opts.materiaux || [];
    var nom = opts.nom || 'Meuble';
    var pieces = debit(m);

    // Libellé du mode de construction
    var _mcAttrs = (typeof WooderModeConstruction !== 'undefined' && WooderModeConstruction.obtenirAttributs && m.modeConstruction)
      ? WooderModeConstruction.obtenirAttributs(m.modeConstruction) : null;
    var modeTxt = _mcAttrs ? (_mcAttrs.label + ' [' + m.modeConstruction + ']') : (m.modeConstruction || 'non defini');
    // Résumé des perçages Ø32
    function resumePercages(mm) {
      var out = [], r = mm.racine;
      if (r && r.sens === 'v' && r.enfants) r.enfants.forEach(function (col, i) {
        if (col && col.perc32 === 'colonne') out.push('Colonne ' + (i + 1) + ' : O32 colonne entiere');
      });
      var nVol = 0;
      (function scan(c) { if (!c) return; if (c.perc32 === 'volume') nVol++; if (c.enfants) c.enfants.forEach(scan); })(r);
      if (nVol) out.push(nVol + ' case(s) en O32 volume');
      return out.length ? out.join(' ; ') : 'aucun';
    }
    var percTxt = resumePercages(m);
    var doc = new jsPDFns({ unit: 'mm', format: 'a4' });
    // ── PAGE 1 : tableau (colonnes à x fixes → extraction tab-séparée à l'import) ──
    var cols = [14, 96, 122, 148, 174];
    doc.setFontSize(14); doc.text(nom + ' - debit', 14, 16);
    doc.setFontSize(9);
    doc.text('Designation', cols[0], 28); doc.text('Longueur', cols[1], 28);
    doc.text('Largeur', cols[2], 28); doc.text('Epaisseur', cols[3], 28); doc.text('Nombre', cols[4], 28);
    doc.setLineWidth(0.2); doc.line(14, 30, 196, 30);
    var y = 36;
    pieces.forEach(function (p) {
      if (y > 285) { doc.addPage(); y = 20; }
      doc.text(String(p.designation), cols[0], y);
      doc.text(String(p.longueur), cols[1], y);
      doc.text(String(p.largeur), cols[2], y);
      doc.text(String(p.epaisseur), cols[3], y);
      doc.text(String(p.nombre), cols[4], y);
      y += 7;
    });
    // ── Paramètres de fabrication (mode + perçages) ──
    var yp = Math.min(286, y + 4);
    doc.setFontSize(9);
    doc.text('Mode de construction : ' + modeTxt, 14, yp);
    doc.setFontSize(8);
    doc.text('Profondeur ' + Math.round(m.P) + ' mm - Epaisseur ' + m.ep + ' mm', 14, yp + 6);
    var lignesPerc = doc.splitTextToSize('Percages O32 : ' + percTxt, 180);
    doc.text(lignesPerc, 14, yp + 11);
    // ── PAGES 2 & 3 : images ──
    return Promise.all([svgVersImage(svgVueFace(m, materiaux)), svgVersImage(svgEclate(m, materiaux))]).then(function (res) {
      [['Vue de face', res[0]], ['Vue eclatee', res[1]]].forEach(function (pair) {
        doc.addPage();
        doc.setFontSize(14); doc.text(nom + ' - ' + pair[0], 14, 16);
        var im = pair[1], maxW = 180, maxH = 250, ratio = im.w / im.h;
        var w = maxW, h = w / ratio;
        if (h > maxH) { h = maxH; w = h * ratio; }
        doc.addImage(im.dataURL, 'JPEG', (210 - w) / 2, 26, w, h);
      });
      // ── PAGE 4 : modèle complet embarqué (récupération exacte au ré-import) ──
      // Contient mode + perçages + structure + façades + positions → tout est
      // reconstructible. Encadré par des marqueurs pour extraction fiable.
      try {
        var modelJSON = JSON.stringify(m);
        var b64 = global.btoa ? global.btoa(unescape(encodeURIComponent(modelJSON))) : '';
        if (b64) {
          doc.addPage();
          doc.setFontSize(11); doc.text(nom + ' - donnees techniques (ne pas modifier)', 14, 16);
          doc.setFontSize(7);
          doc.text(doc.splitTextToSize('Bloc de reimport The Wooder : conserve le mode de construction, les percages et la structure complete du meuble.', 180), 14, 24);
          doc.setFontSize(6);
          var bloc = '@@WOODER_MODELE_V1@@' + b64 + '@@FIN_MODELE@@';
          doc.text(doc.splitTextToSize(bloc, 182), 14, 34);
        }
      } catch (e) { /* embarquement best-effort */ }
      doc.save(String(nom).replace(/[^\w\-]+/g, '_') + '_debit.pdf');
      return true;
    });
  }

  global.WooderPlan2D = {
    creer: creer, creerComposition: creerComposition,
    dessinerMeuble: dessinerMeuble, modeleDefaut: modeleDefaut,
    largeurInterieure: largeurInterieure, hauteurInterieure: hauteurInterieure,
    layoutDebit: layoutDebit, coqueSelonMode: coqueSelonMode,
    // helpers purs partagés avec wooder-3d.js (même géométrie 2D / 3D / débit)
    facadeGeomPure: facadeGeomPure, tiroirFrontRects: tiroirFrontRects,
    couleurElement: couleurElement, materiauIdElement: materiauIdElement,
    filElement: filElement, typeDeKey: typeDeKey,
    debit: debit, svgVueFace: svgVueFace, svgEclate: svgEclate, exporterPDF: exporterPDF
  };
})(window);
