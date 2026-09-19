/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — wooder-3d.js
   Configurateur / visualiseur 3D maison (Three.js vanilla), destiné à
   remplacer le modèle ShapeDiver.

   ── Principe ───────────────────────────────────────────────────────
   AUCUN nouveau format de données. Le module consomme le modèle meuble
   déjà utilisé partout (éditeur 2D, débit, devis, CAM) :

     { H, L, P, ep, epFond, modeConstruction, racine, pieds, mat… }

   et réutilise les fonctions de vérité existantes :
     • WooderPlan2D.layoutDebit(m)          → séparations + cases + façades (mm)
     • WooderPlan2D.facadeGeomPure(...)     → géométrie d'une façade selon la pose
     • WooderPlan2D.tiroirFrontRects(...)   → empilage des façades de tiroir
     • WooderPlan2D.couleurElement(...)     → teinte par matériau du catalogue
     • WooderModeConstruction.obtenirAttributs(id) → coque selon le mode

   Conséquence : le 3D, le débit et le devis ne peuvent pas diverger —
   c'est tout l'intérêt vs ShapeDiver.

   ── Repère 3D (mm, puis /1000 pour Three.js) ───────────────────────
     X : largeur, 0 = joue gauche       → L
     Y : hauteur, 0 = sol               → H
     Z : profondeur, 0 = arrière        → P (façades au-delà de P)
   Le fond est posé en arrière (z ∈ [-epFond, 0]) pour éviter tout
   recouvrement de faces avec les panneaux (dimensions = celles du débit).

   ── API ────────────────────────────────────────────────────────────
     var v = WooderVue3D.creer(container, {
       modele, materiaux, ouverture, fond, onSelect, onPret, onErreur
     });
     v.setModele(m); v.setOuverture(0..1); v.recadrer();
     v.capture() → dataURL PNG ; v.detruire();

     WooderVue3D.panneaux(modele) → liste de panneaux 3D en mm
       (utilisable sans Three.js : tests, contrôle croisé avec le débit)
═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Chargement paresseux de Three.js (build UMD → global THREE) ────
  var VER = '0.147.0';
  var URL_THREE = 'https://cdn.jsdelivr.net/npm/three@' + VER + '/build/three.min.js';
  var URL_ORBIT = 'https://cdn.jsdelivr.net/npm/three@' + VER + '/examples/js/controls/OrbitControls.js';
  var _chargement = null;

  function injecter(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function chargerThree() {
    if (global.THREE && global.THREE.OrbitControls) return Promise.resolve(global.THREE);
    if (_chargement) return _chargement;
    _chargement = (global.THREE ? Promise.resolve() : injecter(URL_THREE))
      .then(function () { return global.THREE.OrbitControls ? null : injecter(URL_ORBIT); })
      .then(function () { return global.THREE; });
    return _chargement;
  }

  // ── Constantes géométriques (alignées sur l'éditeur 2D) ────────────
  var JEU_APPLIQUE   = 3;   // jeu total entre 2 façades en applique (mm)
  var JEU_ENCASTRE   = 2;   // jeu périphérique d'une façade encastrée (mm)
  var RETRAIT_PLINTHE = 50; // retrait de la plinthe par rapport au nu de façade
  var PIED_COTE      = 45;  // section d'un pied réglable (mm)
  var HAUTEUR_PIEDS  = 100; // hauteur par défaut quand le modèle n'en donne pas
  var TRINGLE_D      = 25;  // diamètre tringle de penderie (mm)
  var POIGNEE_S      = 20;  // section d'une poignée barre (mm)
  var PAS32          = 32;  // système 32 : pas entre 2 perçages (mm)
  var RANG32         = 37;  // distance rangée / bord du panneau (mm)
  var MARGE32        = 40;  // marge haut et bas d'une case (mm)
  var PERC32_D       = 5;   // diamètre d'un perçage de tablette (mm)
  var PERC32_PROF    = 12;  // profondeur d'un perçage (mm)
  var MAX_PERCAGES   = 4000; // garde-fou : au-delà, on n'en dessine pas plus
  // Dépassement du perçage côté intérieur. Physiquement le trou est à fleur,
  // mais un cylindre exactement affleurant est mangé par la face du panneau
  // (précision du tampon de profondeur) : 1 mm le rend visible sans mentir.
  var AFFLEURE       = 1;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ── Repli local si wooder-plan2d-editeur.js n'expose pas les helpers
  //    (versions antérieures du fichier) : mêmes formules, mêmes jeux.
  function facadeGeom(lf, pose, ep) {
    var P2 = global.WooderPlan2D;
    if (P2 && P2.facadeGeomPure) return P2.facadeGeomPure(lf, pose, ep);
    if (pose === 'encastre') {
      var j = JEU_ENCASTRE;
      return { x: lf.x + j, y: lf.y + j, w: Math.max(1, lf.w - 2 * j), h: Math.max(1, lf.h - 2 * j) };
    }
    var e = ep / 2, g = JEU_APPLIQUE / 2;
    return { x: lf.x - e + g, y: lf.y - e + g, w: lf.w + 2 * e - 2 * g, h: lf.h + 2 * e - 2 * g };
  }
  function tiroirRects(g, f) {
    var P2 = global.WooderPlan2D;
    if (P2 && P2.tiroirFrontRects) return P2.tiroirFrontRects(g, f);
    var list = (f && f.tiroirs && f.tiroirs.length) ? f.tiroirs.slice() : [g.h];
    var S = 0, i; for (i = 0; i < list.length; i++) S += list[i];
    if (S > g.h && S > 0) { var k = g.h / S; for (i = 0; i < list.length; i++) list[i] *= k; S = g.h; }
    var bas = (f && f.vide === 'bas') ? (g.y + S) : (g.y + g.h);
    var out = [], yb = bas;
    for (i = 0; i < list.length; i++) { out.push({ x: g.x, y: yb - list[i], w: g.w, h: list[i] }); yb -= list[i]; }
    return out;
  }
  function attrsMode(id) {
    var MC = global.WooderModeConstruction;
    return (MC && MC.obtenirAttributs && id) ? MC.obtenirAttributs(id) : null;
  }

  // ════════════════════════════════════════════════════════════════
  //  1. MODÈLE MEUBLE  →  LISTE DE PANNEAUX 3D (mm)
  //     Chaque panneau : { key, role, nom, x, y, z, w, h, d, ouvrant }
  //       x,y,z = coin mini ; w,h,d = dimensions ; key = clé matériau
  //       (identique à l'éditeur 2D → même teinte, même override)
  // ════════════════════════════════════════════════════════════════
  function panneaux(modeleIn) {
    var m = clone(modeleIn || {});
    if (m.ep == null) m.ep = 19;
    if (!m.racine) m.racine = {};
    var ep = m.ep, L = m.L, P = m.P, H = m.H;
    var epFond = m.epFond || 8;
    var a = attrsMode(m.modeConstruction);

    var supIn      = !!(a && a.pan_sup === 'interieur');   // panneau sup ENTRE les joues
    var infIn      = !!(a && a.pan_inf === 'interieur');
    var supCont    = !(a && a.pan_sup_continu === false);
    var infCont    = !(a && a.pan_inf_continu === false);
    var doubleMont = !!(a && a.nb_montants_centraux == 2); // mur mitoyen = 2 joues
    var travers    = !!(a && a.montants_centraux === 'traversants');
    var plintheEnc = !!(a && a.plinthe_encastree);

    var plintheH = plintheEnc ? ((m.pieds && m.pieds.hauteurPlinthe) || 100) : 0;
    var Hb = H - plintheH;              // hauteur de la boîte utile (hors plinthe encastrée)
    var sTop = supIn ? 0 : ep;          // décalage haut de la joue (0 = pleine hauteur)
    var sBot = (infIn || plintheEnc) ? 0 : ep;

    // Layout partagé avec le débit : le modèle transmis a la hauteur de boîte,
    // exactement comme l'éditeur (ih = H - 2·ep - plintheH).
    var mLay = clone(m); mLay.H = Hb;
    var lay = (global.WooderPlan2D && global.WooderPlan2D.layoutDebit)
      ? global.WooderPlan2D.layoutDebit(mLay)
      : { dividers: [], feuilles: [], facades: [] };

    // Le layout est en coordonnées « vue de face » (y vers le BAS depuis le
    // haut du meuble). Origine 3D au sol → Y = H - y2d - hauteur.
    function Y(y2d, h) { return H - y2d - h; }

    var out = [];
    function push(role, key, nom, x, y2d, z, w, h, d, extra) {
      if (w <= 0 || h <= 0 || d <= 0) return null;
      var p = { role: role, key: key, nom: nom,
                x: x, y: Y(y2d, h), z: z, w: w, h: h, d: d, ouvrant: null };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) p[k] = extra[k];
      out.push(p); return p;
    }

    // ── Coque : joues + panneaux haut/bas ───────────────────────────
    var caissonDivs = lay.dividers.filter(function (d) { return d.caisson && d.sens === 'v'; })
                                  .sort(function (x, y) { return x.x - y.x; });

    // La coque vient de WooderPlan2D : c'est la MÊME fonction qui sert au dessin
    // 2D et au débit. Chacun la recalculait auparavant de son côté et le débit
    // ignorait le mode de construction — on coupait les mauvaises pièces.
    // `lay` est calculé sur une hauteur de boîte : la coque, elle, se calcule
    // sur le modèle entier, sinon la plinthe encastrée serait retirée deux fois.
    var NOM_COQUE = { latG: 'Côté gauche', latD: 'Côté droit',
                      sup: 'Panneau supérieur', inf: 'Panneau inférieur' };
    var coque = (global.WooderPlan2D && global.WooderPlan2D.coqueSelonMode)
      ? global.WooderPlan2D.coqueSelonMode(m, lay) : [];
    var nCoque = {};
    coque.forEach(function (c) {
      var n = (nCoque[c.role] = (nCoque[c.role] || 0) + 1);
      var multi = coque.filter(function (q) { return q.role === c.role; }).length > 1;
      var role3d = (c.role === 'latG' || c.role === 'latD') ? 'lateral' : 'panneau';
      push(role3d, c.role, NOM_COQUE[c.role] + (multi ? ' ' + n : ''),
           c.x, c.y, 0, c.w, c.h, P);
    });

    // ── Zones libres entre joues (une par colonne) ──────────────────
    // Bornes d'une colonne : nu des joues. Avec un mur mitoyen (2 joues
    // accolées), la zone s'arrête au nu de ce mur, pas à son axe.
    function zonesEntreJoues(divs) {
      var z = [], deb = ep;
      divs.forEach(function (d) {
        var xC = d.x + d.w / 2;
        z.push([deb, doubleMont ? xC - d.w : d.x]);
        deb = doubleMont ? xC + d.w : d.x + d.w;
      });
      z.push([deb, L - ep]);
      return z;
    }
    var zonesCol = zonesEntreJoues(caissonDivs);

    // ── Fonds : UN PAR COLONNE, comme calculerFonds (« Fond colonne N »).
    //    Dimensions ici = ouverture libre ; le débit y ajoute la pénétration
    //    dans les rainures (RAIN_PROF_LATERAL / RAIN_PROF_MONTANT).
    //    Posé à l'arrière (z négatif) : aucune face coplanaire avec les joues.
    zonesCol.forEach(function (z, i) {
      push('fond', 'fond', zonesCol.length > 1 ? 'Fond colonne ' + (i + 1) : 'Fond du meuble',
           z[0], ep, -epFond, z[1] - z[0], Hb - 2 * ep, epFond);
    });

    // ── Séparations internes (montants + étagères) ──────────────────
    lay.dividers.forEach(function (d, i) {
      var prof = Math.max(1, d.profondeur || P);
      var key = 'sep:' + d.sens + ':_:0';
      if (doubleMont && d.caisson && d.sens === 'v') {
        // mur mitoyen : 2 joues accolées, centrées sur la séparation du layout
        var xC = d.x + d.w / 2, gap = 0;
        var yT = travers ? sTop : d.y, hM = travers ? (H - sTop - sBot) : d.h;
        push('montant', key, 'Joue mitoyenne G', xC - d.w - gap / 2, yT, 0, d.w, hM, prof);
        push('montant', key, 'Joue mitoyenne D', xC + gap / 2,       yT, 0, d.w, hM, prof);
        return;
      }
      if (d.sens === 'v') push('montant', key, 'Montant ' + (i + 1), d.x, d.y, 0, d.w, d.h, prof);
      else                push('etagere', key, 'Étagère ' + (i + 1), d.x, d.y, 0, d.w, d.h, prof);
    });

    // ── Plinthe encastrée / pieds ───────────────────────────────────
    // Pieds réglables : un caisson repose TOUJOURS sur des pieds, y compris
    // en plinthe encastrée où ils sont simplement cachés derrière elle. Dans
    // ce cas ils tiennent dans la hauteur de plinthe et ne changent donc rien
    // à la hauteur hors-tout du meuble.
    function poserPieds(y2d, hp, zones) {
      var marge = 40;
      zones.forEach(function (z, ic) {
        var xg = z[0] + marge, xd = z[1] - marge - PIED_COTE;
        [[xg, marge], [xd, marge], [xg, P - marge - PIED_COTE], [xd, P - marge - PIED_COTE]]
        .forEach(function (c, k) {
          push('pied', 'plinthe', 'Pied ' + (zones.length > 1 ? (ic + 1) + '.' : '') + (k + 1),
               c[0], y2d, c[1], PIED_COTE, hp, PIED_COTE);
        });
      });
    }

    if (plintheEnc && plintheH > 0) {
      var retr = (m.pieds && m.pieds.retrait != null) ? m.pieds.retrait : RETRAIT_PLINTHE;
      // Pieds logés DANS la hauteur de plinthe, derrière elle : leur dessous
      // est au sol (Y = 0), donc y2d = H - plintheH. Ils ne surélèvent rien.
      poserPieds(H - plintheH, plintheH, doubleMont ? zonesCol : [[ep, L - ep]]);
      // Multi-caissons : chaque caisson est autonome → il porte SA plinthe,
      // entre ses deux joues. Caisson unique → une seule plinthe continue
      // (les montants intermédiaires reposent dessus, cf. _wmcReduireMontantsPlinthe).
      var zonesPl = doubleMont ? zonesCol : [[ep, L - ep]];
      zonesPl.forEach(function (z, i) {
        push('plinthe', 'plinthe', zonesPl.length > 1 ? 'Plinthe caisson ' + (i + 1) : 'Plinthe',
             z[0], H - plintheH, Math.max(0, P - retr - ep), z[1] - z[0], plintheH, ep);
      });
    } else {
      // Pas de plinthe encastrée → pieds SOUS le meuble (il est surélevé
      // d'autant). Multi-caissons : 4 pieds par caisson, chacun autonome.
      // y2d = H → Y = -hp : les pieds descendent sous le caisson.
      var hp = (m.pieds && m.pieds.hauteurPlinthe) || HAUTEUR_PIEDS;
      poserPieds(H, hp, doubleMont ? zonesCol : [[0, L]]);
    }

    // ── Fileurs et plinthe rapportée ────────────────────────────────
    // Fileur = bande qui comble le jeu entre le meuble et le mur (ou le
    // plafond), posée au NU DE FAÇADE. Sa largeur est saisie par l'utilisateur
    // (l'espace mesuré sur place) ; sa hauteur suit le meuble.
    //   m.fileurs = { gauche, droite, haut }   largeurs/hauteur en mm, 0 = aucun
    //   m.plinthe = { active, hauteur, retrait }   plinthe rapportée devant les pieds
    var fl = m.fileurs || {};
    var zFileur = Math.max(0, P - ep);        // le fileur affleure la façade
    var pl = m.plinthe || {};
    var plRap = !plintheEnc && !!pl.active;   // plinthe rapportée, devant les pieds
    var hpl = plRap ? (pl.hauteur || (m.pieds && m.pieds.hauteurPlinthe) || HAUTEUR_PIEDS) : 0;
    // Le fileur descend JUSQU'AU SOL et encadre la plinthe : il passe donc à
    // gauche et à droite d'elle, pas au-dessus. Avec une plinthe rapportée le
    // meuble est sur pieds, le sol est donc plus bas que le caisson de sa
    // hauteur ; avec une plinthe encastrée le caisson touche déjà le sol.
    var hFileur = Math.max(1, H + hpl);
    if (fl.gauche > 0) push('fileur', 'fileur', 'Fileur gauche', -fl.gauche, 0, zFileur, fl.gauche, hFileur, ep);
    if (fl.droite > 0) push('fileur', 'fileur', 'Fileur droit',  L,           0, zFileur, fl.droite, hFileur, ep);
    // fileur haut : au-dessus du meuble (y2d négatif = au-dessus du dessus)
    if (fl.haut > 0) {
      var xg = -(fl.gauche || 0), xd = L + (fl.droite || 0);
      push('fileur', 'fileur', 'Fileur haut', xg, -fl.haut, zFileur, xd - xg, fl.haut, ep);
    }

    // Plinthe rapportée : planche devant les pieds.
    //   pose 'applique'  → au nu de la façade, elle se voit (retrait 0)
    //   pose 'encastree' → en retrait, elle dégage le pied (retrait par défaut)
    // Elle s'arrête au nu du caisson : ce sont les fileurs qui la bordent.
    // Sans objet en plinthe encastrée, qui a déjà la sienne entre les joues.
    if (plRap) {
      var rpl = (pl.retrait != null) ? pl.retrait
              : (pl.pose === 'applique' ? 0 : RETRAIT_PLINTHE);
      push('plinthe', 'plinthe', 'Plinthe rapportée', 0, H, Math.max(0, P - rpl - ep),
           L, hpl, ep);
    }

    // ── Façades (portes & tiroirs) ──────────────────────────────────
    var leafMap = {}, nFac = 0;
    lay.feuilles.forEach(function (lf) { leafMap[lf.path.join('.')] = lf; });
    lay.facades.forEach(function (ff) {
      var fac = ff.cell.facade; if (!fac) return;
      var lf = { x: ff.x, y: ff.y, w: ff.w, h: ff.h };
      // façade couvrant plusieurs cases empilées (span)
      if ((ff.span || 1) > 1 && ff.path.length) {
        var i0 = ff.path[ff.path.length - 1], minY = lf.y, maxY = lf.y + lf.h;
        for (var k = 1; k < ff.span; k++) {
          var p = ff.path.slice(); p[p.length - 1] = i0 + k;
          var r = leafMap[p.join('.')]; if (!r) break;
          minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
        }
        lf = { x: lf.x, y: minY, w: lf.w, h: maxY - minY };
      }
      var g = facadeGeom(lf, fac.pose, ep);
      var zF = (fac.pose === 'encastre') ? (P - ep) : P;   // nu avant = P
      var key = 'facade:' + ff.path.join('.');

      // Poignée : barre solidaire de la façade (suit l'ouverture). Purement
      // visuelle — elle n'entre pas dans le débit (role 'poignee').
      function poigneeTiroir(fr, idF) {
        var lp = Math.min(300, fr.w * 0.45), y2d = fr.y + Math.min(50, fr.h * 0.3);
        push('poignee', 'poignee', 'Poignée', fr.x + (fr.w - lp) / 2, y2d, zF + ep,
             lp, POIGNEE_S, POIGNEE_S, { attacheA: idF });
      }
      function poigneePorte(gp, cote, idF) {
        var hp2 = Math.min(160, gp.h * 0.22);
        var x = (cote === 'gauche') ? gp.x + 38 : gp.x + gp.w - 38 - POIGNEE_S;
        push('poignee', 'poignee', 'Poignée', x, gp.y + (gp.h - hp2) / 2, zF + ep,
             POIGNEE_S, hp2, POIGNEE_S, { attacheA: idF });
      }

      if (fac.type === 'tiroir') {
        tiroirRects(g, fac).forEach(function (fr, n) {
          var t = push('tiroir', key, 'Tiroir ' + (n + 1), fr.x, fr.y, zF, fr.w, fr.h, ep,
                       { id: 'f' + (nFac++) });
          if (!t) return;
          t.ouvrant = { type: 'tiroir', course: Math.max(0, P * 0.6) };
          poigneeTiroir(fr, t.id);
        });
        return;
      }
      // porte : 'double' = 2 vantaux, sinon sens = côté POIGNÉE (charnière opposée)
      if (fac.sens === 'double') {
        var demi = (g.w - JEU_APPLIQUE) / 2;
        var pg = push('porte', key, 'Porte gauche', g.x, g.y, zF, demi, g.h, ep, { id: 'f' + (nFac++) });
        if (pg) { pg.ouvrant = { type: 'porte', charniere: 'gauche' };
                  poigneePorte({ x: g.x, y: g.y, w: demi, h: g.h }, 'droite', pg.id); }
        var pd = push('porte', key, 'Porte droite', g.x + g.w - demi, g.y, zF, demi, g.h, ep, { id: 'f' + (nFac++) });
        if (pd) { pd.ouvrant = { type: 'porte', charniere: 'droite' };
                  poigneePorte({ x: g.x + g.w - demi, y: g.y, w: demi, h: g.h }, 'gauche', pd.id); }
      } else {
        var pu = push('porte', key, 'Porte', g.x, g.y, zF, g.w, g.h, ep, { id: 'f' + (nFac++) });
        // sens 'droite' = poignée à droite → charnière à gauche
        if (pu) { var cote = (fac.sens === 'gauche') ? 'gauche' : 'droite';
                  pu.ouvrant = { type: 'porte', charniere: (cote === 'gauche') ? 'droite' : 'gauche' };
                  poigneePorte(g, cote, pu.id); }
      }
    });

    // ── Penderies (tringles) : cases portant cell.penderie ──────────
    lay.feuilles.forEach(function (lf) {
      if (!lf.cell || !lf.cell.penderie) return;
      var y2d = lf.y + Math.min(80, lf.h * 0.14);
      push('tringle', 'tringle', 'Tringle penderie', lf.x, y2d, Math.max(0, P / 2 - TRINGLE_D / 2),
           lf.w, TRINGLE_D, TRINGLE_D, { cylindre: true });
    });

    // ── Perçages système 32 ─────────────────────────────────────────
    // Une case porte perc32 = 'volume' (cette case seule) ou 'colonne'
    // (toute la colonne) ; l'attribut peut être hérité d'un ancêtre.
    // Deux rangées par joue (à RANG32 du bord avant et du bord arrière),
    // pas de 32 mm, sur les deux joues qui bordent la case.
    function perc32De(lf) {
      if (lf.cell && lf.cell.perc32) return lf.cell.perc32;
      var n = m.racine;
      if (n && n.perc32) return n.perc32;      // marqueur porté par le meuble entier
      for (var i = 0; i < lf.path.length; i++) {
        n = n.enfants && n.enfants[lf.path[i]];
        if (n && n.perc32) return n.perc32;
      }
      return null;
    }
    lay.feuilles.forEach(function (lf) {
      if (!perc32De(lf)) return;
      var haut = lf.y + MARGE32, bas = lf.y + lf.h - MARGE32;
      if (bas <= haut) return;
      var profs = [RANG32, Math.max(RANG32, P - RANG32)];
      // Le perçage s'enfonce dans la joue, mais dépasse de AFFLEURE mm côté
      // intérieur : sinon il est entièrement noyé dans le panneau et invisible.
      var cotes = [lf.x - PERC32_PROF, lf.x + lf.w - AFFLEURE];   // joue G / joue D
      cotes.forEach(function (xc, ic) {
        profs.forEach(function (zc) {
          for (var y = haut; y <= bas; y += PAS32) {
            push('percage', 'percage', 'Perçage Ø' + PERC32_D + ' (joue ' + (ic ? 'D' : 'G') + ')',
                 xc, y - PERC32_D / 2, zc - PERC32_D / 2,
                 PERC32_PROF + AFFLEURE, PERC32_D, PERC32_D, { cylindre: true, axe: 'x' });
          }
        });
      });
    });

    return out;
  }

  // ════════════════════════════════════════════════════════════════
  //  1bis. COMPOSITION : plusieurs meubles posés dans un même repère
  //     Même structure que l'étape « Composition » de WooderProjet :
  //     une liste de meubles + une position {x, y} par meuble (y = hauteur
  //     du DESSOUS depuis le sol).
  //       y = 0        → posé au sol
  //       y = H du bas → meuble haut POSÉ sur le meuble bas
  //       y = 1400     → meuble haut SUSPENDU à 1400 mm du sol
  //     Chaque panneau reçoit _meuble (index) pour retrouver son modèle
  //     (matériaux) et un id d'ouvrant unique.
  // ════════════════════════════════════════════════════════════════
  function panneauxComposition(liste) {
    var out = [];
    (liste || []).forEach(function (item, i) {
      if (!item || !item.modele) return;
      var ox = item.x || 0, oy = item.y || 0, oz = item.z || 0;
      // Un meuble qui ne touche pas le sol (haut, suspendu, posé sur un autre)
      // n'a ni pieds ni plinthe : il repose sur le mur ou sur le meuble du
      // dessous. On les retire ici plutôt que dans panneaux(), qui ne sait pas
      // où le meuble est posé.
      var auSol = (item.auSol != null) ? !!item.auSol : (oy <= 0.5);
      panneaux(item.modele).forEach(function (p) {
        if (!auSol && (p.role === 'pied' || p.role === 'plinthe')) return;
        p.x += ox; p.y += oy; p.z += oz;
        p._meuble = i;
        p.nom = (item.nom ? item.nom + ' · ' : '') + p.nom;
        if (p.id) p.id = i + ':' + p.id;
        if (p.attacheA) p.attacheA = i + ':' + p.attacheA;
        out.push(p);
      });
    });
    return out;
  }

  // ════════════════════════════════════════════════════════════════
  //  2. RENDU THREE.JS
  // ════════════════════════════════════════════════════════════════
  var TEINTES_ROLE = {   // teinte de repli quand aucun catalogue n'est fourni
    lateral: '#d9b98a', panneau: '#d9b98a', montant: '#d9b98a', etagere: '#d9b98a',
    fond: '#c9a877', plinthe: '#cfae7e', pied: '#5a5a58', porte: '#e0c396',
    tiroir: '#e0c396', tringle: '#8d8d8a', poignee: '#8d8d8a', percage: '#3a3632'
  };
  var SANS_DECOR = { tringle: 1, pied: 1, poignee: 1, percage: 1 };  // quincaillerie

  function teinte(m, p, materiaux) {
    if (SANS_DECOR[p.role]) return TEINTES_ROLE[p.role];
    var P2 = global.WooderPlan2D;
    if (materiaux && materiaux.length && P2 && P2.couleurElement) {
      var c = P2.couleurElement(m, p.key, materiaux);
      if (c && c.fill) return c.fill;
    }
    return TEINTES_ROLE[p.role] || '#d9b98a';
  }

  // Décor EGGER du panneau, s'il en a un (textures-materiaux.js, généré par
  // generer-textures.ps1). → { url, l, h, code } en mm, ou null.
  function decorDe(m, p) {
    if (SANS_DECOR[p.role]) return null;
    var WT = global.WooderTextures, P2 = global.WooderPlan2D;
    if (!WT || !P2 || !P2.materiauIdElement) return null;
    return WT.pour(P2.materiauIdElement(m, p.key)) || null;
  }

  // Sens du fil choisi pour ce panneau ('long' par défaut).
  function filDe(m, p) {
    var P2 = global.WooderPlan2D;
    return (P2 && P2.filElement) ? P2.filElement(m, p.key) : 'long';
  }

  // Pose le décor à l'ÉCHELLE RÉELLE sur chaque face de la boîte, au lieu de
  // l'étirer sur 0..1 : un panneau de 600 mm ne montre que 600/1300 de la
  // largeur de la planche. Le fil du décor court sur la HAUTEUR de la planche.
  //   fil = 'long' (défaut) → le fil suit la plus grande dimension de la face
  //   fil = 'trav'          → il la croise
  // On décale aussi le motif d'un panneau à l'autre pour ne pas voir 20 fois
  // le même bout de veine.
  // Faces de BoxGeometry, dans l'ordre : +X, -X, +Y, -Y, +Z, -Z.
  function poserDecor(geo, p, info, fil) {
    var uv = geo.attributes && geo.attributes.uv;
    if (!uv) return;
    var travers = (fil === 'trav');
    var faces = [[p.d, p.h], [p.d, p.h],    // chants gauche / droit
                 [p.w, p.d], [p.w, p.d],    // chants haut / bas
                 [p.w, p.h], [p.w, p.h]];   // faces avant / arrière
    function frac(v) { v = v % 1; return v < 0 ? v + 1 : v; }
    var ox = frac((p.x * 0.0007 + p.y * 0.0013)), oy = frac((p.y * 0.0011 + p.z * 0.0017));
    for (var f = 0; f < 6; f++) {
      var a = faces[f][0], b = faces[f][1];
      var tourne = travers ? (a <= b) : (a > b);
      var su = (tourne ? b : a) / info.l, sv = (tourne ? a : b) / info.h;
      for (var k = 0; k < 4; k++) {
        var i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, ox + (tourne ? v : u) * su, oy + (tourne ? u : v) * sv);
      }
    }
    uv.needsUpdate = true;
  }

  function creer(container, opts) {
    opts = opts || {};
    var THREE = null, scene, camera, renderer, controls, groupe, sol, raf = null;
    // Un seul meuble ou une composition : en interne, toujours une liste.
    var meubles = opts.meubles ? clone(opts.meubles)
                : (opts.modele ? [{ modele: clone(opts.modele), x: 0, y: 0, z: 0 }] : []);
    var materiaux = opts.materiaux || [];
    var ouverture = opts.ouverture || 0;
    var detruit = false, ro = null;
    var matCache = {};      // couleur+décor → MeshStandardMaterial (réutilisé)
    var texCache = {};      // code décor → THREE.Texture (chargée une seule fois)
    var texturesActives = opts.textures !== false;
    var meshes = [];
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;

    // Le voile d'attente est en `absolute` : il faut donc un parent positionné.
    // On ne l'impose QUE si la page n'a rien prévu — écrire `relative` en style
    // inline écraserait un `absolute; inset:0` venu de la feuille de style, et
    // le cadre 3D cesserait de suivre son conteneur (calage photo faussé).
    if (global.getComputedStyle(container).position === 'static')
      container.style.position = 'relative';
    var etat = document.createElement('div');
    etat.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font:14px/1.4 inherit;color:#6b6b66;background:#f6f2ea;text-align:center;padding:16px';
    etat.textContent = 'Chargement de la vue 3D…';
    container.appendChild(etat);

    chargerThree().then(function (T) {
      if (detruit) return;
      THREE = T;
      initialiser();
      if (meubles.length) construire();
      boucle();
      etat.remove();
      if (typeof opts.onPret === 'function') opts.onPret(api);
    }).catch(function (e) {
      etat.textContent = 'Vue 3D indisponible (' + e.message + ')';
      if (typeof opts.onErreur === 'function') opts.onErreur(e);
    });

    function taille() {
      return { w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight || 420) };
    }

    function initialiser() {
      var t = taille();
      scene = new THREE.Scene();
      // fond photo : la scène est transparente, l'image est derrière le canvas
      scene.background = (opts.fond === 'photo') ? null : new THREE.Color(opts.fond || '#f2ece1');

      camera = new THREE.PerspectiveCamera(38, t.w / t.h, 0.05, 200);
      renderer = new THREE.WebGLRenderer({
        antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
        // fond photo → il faut un canvas transparent pour laisser voir l'image
        alpha: (opts.fond === 'photo')
      });
      // Rendu à la densité réelle de l'écran (2× sur un écran Retina / un
      // téléphone récent) : c'est ce qui enlève l'aspect crénelé.
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(t.w, t.h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
      // Courbe de rendu douce : évite les blancs brûlés sur les décors clairs
      if (THREE.ACESFilmicToneMapping) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
      }
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
      container.appendChild(renderer.domElement);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.6;
      controls.maxDistance = 30;
      controls.maxPolarAngle = Math.PI * 0.52;   // pas sous le sol

      // ── Éclairage d'environnement (IBL) ──────────────────────────
      // C'est LE facteur de réalisme : sans lui, une surface n'a que la
      // lumière directe et paraît plate. On fabrique un petit « studio »
      // (plafond lumineux + murs + sol) qu'on convertit en carte
      // d'environnement : chaque panneau y reflète son entourage, les
      // arêtes s'éclairent, la matière prend du relief.
      // Construit à la volée : aucun fichier HDRI à charger.
      environnement();

      // Éclairage volontairement doux : au-delà, une face bien exposée sature
      // en blanc et le décor bois n'y est plus lisible.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 0.28));
      var dir = new THREE.DirectionalLight(0xffffff, 0.45);
      dir.position.set(2.5, 4, 3);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);   // ombres nettes plutôt que baveuses
      dir.shadow.bias = -0.0005;
      dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 20;
      dir.shadow.camera.left = -4; dir.shadow.camera.right = 4;
      dir.shadow.camera.top = 4; dir.shadow.camera.bottom = -4;
      scene.add(dir);
      var app = new THREE.DirectionalLight(0xffffff, 0.22);
      app.position.set(-3, 2, -2); scene.add(app);

      sol = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.18 })
      );
      sol.rotation.x = -Math.PI / 2;
      sol.receiveShadow = true;
      scene.add(sol);

      groupe = new THREE.Group();
      scene.add(groupe);

      if (onSelect) renderer.domElement.addEventListener('pointerdown', clic);
      if (global.ResizeObserver) {
        ro = new ResizeObserver(function () { redimensionner(); });
        ro.observe(container);
      } else {
        global.addEventListener('resize', redimensionner);
      }
    }

    // Une texture chargée UNE fois par décor et partagée par tous les panneaux
    // qui l'utilisent : la mise à l'échelle est faite dans les UV (poserDecor),
    // pas dans texture.repeat — sinon il faudrait un envoi GPU par panneau.
    function texture(info) {
      if (!info || !texturesActives) return null;
      if (texCache[info.code] !== undefined) return texCache[info.code];
      var t = null;
      try {
        // Le relief se calcule à partir de l'IMAGE, donc seulement une fois
        // chargée : on met alors à jour les matériaux qui l'utilisent déjà.
        t = new THREE.TextureLoader().load(info.url, function (tex) {
          var n = relief(info, tex.image);
          if (!n) return;
          Object.keys(matCache).forEach(function (k) {
            var mt = matCache[k];
            if (mt.map === tex && !mt.normalMap) {
              mt.normalMap = n;
              mt.normalScale = new THREE.Vector2(0.55, 0.55);
              mt.needsUpdate = true;
            }
          });
        }, undefined, function () {
          texCache[info.code] = null;   // décor introuvable → couleur unie
        });
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        // Filtrage anisotrope au MAXIMUM supporté : c'est lui qui garde le
        // veinage net sur un panneau vu de biais (une étagère, un dessus).
        if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy)
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
      } catch (e) { t = null; }
      texCache[info.code] = t;
      return t;
    }

    // Petit studio converti en carte d'environnement (PMREM) : plafond
    // lumineux, murs clairs, sol chaud. Rendu une seule fois au démarrage.
    function environnement() {
      if (!THREE.PMREMGenerator) return;
      var st = new THREE.Scene();
      function bloc(coul, intensite, l, h, p, x, y, z, rx) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(l, h),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(coul).multiplyScalar(intensite),
                                        side: THREE.DoubleSide })
        );
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        st.add(m);
      }
      var R = Math.PI / 2;
      bloc('#ffffff', 3.2, 8, 8, 0,  0,  4,  0, R);   // plafond : la source principale
      bloc('#f3efe6', 0.9, 8, 6, 0,  0,  1, -4, 0);   // mur du fond
      bloc('#eae4d7', 0.7, 8, 6, 0, -4,  1,  0, 0);   // mur gauche
      bloc('#eae4d7', 0.7, 8, 6, 0,  4,  1,  0, 0);   // mur droit
      bloc('#d8cec0', 0.5, 8, 8, 0,  0, -1,  0, R);   // sol, plus chaud
      var pmrem = new THREE.PMREMGenerator(renderer);
      try {
        scene.environment = pmrem.fromScene(st, 0.04).texture;
      } catch (e) { /* pas d'environnement : on garde les lumières seules */ }
      pmrem.dispose();
      st.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    }

    // ── Relief du décor (carte de normales déduite de l'image) ───────
    // Un décor synchronisé (ST37, Feelwood…) a un grain PHYSIQUE aligné sur
    // le dessin : le veinage se sent au doigt. On le reconstitue en dérivant
    // la luminance de l'image : les zones sombres du veinage deviennent des
    // creux. Sans ça le bois reste un dessin plat collé sur une planche.
    var relCache = {};
    function relief(info, img) {
      if (!info || !img) return null;
      if (relCache[info.code] !== undefined) return relCache[info.code];
      var r = null;
      try {
        var T2 = 256;                     // suffisant : le relief est diffus
        var cv = document.createElement('canvas'); cv.width = T2; cv.height = T2;
        var cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0, T2, T2);
        var src = cx.getImageData(0, 0, T2, T2), d = src.data;
        var out = cx.createImageData(T2, T2), o = out.data;
        function lum(x, y) {
          x = (x + T2) % T2; y = (y + T2) % T2;
          var i = (y * T2 + x) * 4;
          return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        }
        var force = 2.2;                  // amplitude du relief
        for (var y = 0; y < T2; y++) {
          for (var x = 0; x < T2; x++) {
            var dx = (lum(x + 1, y) - lum(x - 1, y)) * force;
            var dy = (lum(x, y + 1) - lum(x, y - 1)) * force;
            var nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            var k = (y * T2 + x) * 4;
            o[k]     = Math.round((-dx * nz * 0.5 + 0.5) * 255);
            o[k + 1] = Math.round(( dy * nz * 0.5 + 0.5) * 255);
            o[k + 2] = Math.round((      nz * 0.5 + 0.5) * 255);
            o[k + 3] = 255;
          }
        }
        cx.putImageData(out, 0, 0);
        r = new THREE.CanvasTexture(cv);
        r.wrapS = r.wrapT = THREE.RepeatWrapping;
      } catch (e) { r = null; }
      relCache[info.code] = r;
      return r;
    }

    function materiau(coul, role, tex) {
      var metal = (role === 'tringle' || role === 'pied' || role === 'poignee');
      var cle = coul + '|' + role + '|' + (tex ? tex.uuid : '-');
      if (matCache[cle]) return matCache[cle];
      var mt = new THREE.MeshStandardMaterial({
        // avec un décor, la teinte doit rester blanche : elle multiplie la texture
        color: new THREE.Color(tex ? '#ffffff' : coul),
        map: tex || null,
        // Un mélaminé n'est pas totalement mat : il renvoie un voile de
        // lumière. 0.62 laisse apparaître les reflets doux du studio sans
        // faire briller le panneau comme du plastique.
        roughness: metal ? 0.32 : 0.62,
        metalness: metal ? 0.7 : 0.03,
        envMapIntensity: metal ? 1.2 : 0.85
      });
      matCache[cle] = mt;
      return mt;
    }

    function vider() {
      meshes.forEach(function (o) {
        groupe.remove(o);
        o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); });
      });
      meshes = [];
    }

    // Tous les perçages en une InstancedMesh (un seul appel de dessin).
    // Le cylindre est couché sur X : il s'enfonce dans la joue.
    function construirePercages(liste) {
      var n = Math.min(liste.length, MAX_PERCAGES);
      var geo = new THREE.CylinderGeometry(PERC32_D / 2000, PERC32_D / 2000,
                                           (PERC32_PROF + AFFLEURE) / 1000, 8);
      geo.rotateZ(Math.PI / 2);
      var im = new THREE.InstancedMesh(geo, materiau(TEINTES_ROLE.percage, 'percage', null), n);
      var mat4 = new THREE.Matrix4();
      for (var i = 0; i < n; i++) {
        var p = liste[i];
        mat4.makeTranslation((p.x + p.w / 2) / 1000, (p.y + p.h / 2) / 1000, (p.z + p.d / 2) / 1000);
        im.setMatrixAt(i, mat4);
      }
      im.instanceMatrix.needsUpdate = true;
      // Sans ça, la sphère englobante reste celle du cylindre à l'origine et
      // tout le lot disparaît au culling dès que la caméra bouge.
      if (im.computeBoundingSphere) im.computeBoundingSphere();
      im.frustumCulled = false;
      im.userData.panneau = { nom: n + ' perçages système 32', w: PERC32_D, h: PERC32_D, d: PERC32_PROF };
      groupe.add(im); meshes.push(im);
    }

    function construire() {
      vider();
      if (!meubles.length) return;
      var liste = panneauxComposition(meubles);
      var ouvrants = {};   // id de façade → objet (pivot de porte ou mesh de tiroir)

      // Perçages Ø5 : des centaines de petits volumes → une seule InstancedMesh,
      // sinon la scène s'écroule dès qu'une colonne est en système 32.
      var percages = liste.filter(function (p) { return p.role === 'percage'; });
      liste = liste.filter(function (p) { return p.role !== 'percage'; });
      if (percages.length) construirePercages(percages);

      liste.forEach(function (p) {
        var modele = (meubles[p._meuble || 0] || {}).modele || {};
        var geo = p.cylindre
          ? new THREE.CylinderGeometry(p.h / 2000, p.h / 2000, p.w / 1000, 16)
          : new THREE.BoxGeometry(p.w / 1000, p.h / 1000, p.d / 1000);
        var info = p.cylindre ? null : decorDe(modele, p);
        var deco = info ? texture(info) : null;
        if (deco) poserDecor(geo, p, info, filDe(modele, p));
        var mesh = new THREE.Mesh(geo, materiau(teinte(modele, p, materiaux), p.role, deco));
        if (p.cylindre) mesh.rotation.z = Math.PI / 2;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.panneau = p;
        // pivot : porte → charnière ; sinon centre du panneau
        var cx = (p.x + p.w / 2) / 1000, cy = (p.y + p.h / 2) / 1000, cz = (p.z + p.d / 2) / 1000;

        // poignée : enfant de l'ouvrant → elle suit la rotation / la translation
        if (p.attacheA && ouvrants[p.attacheA]) {
          var par = ouvrants[p.attacheA];
          mesh.position.set(cx - par.position.x, cy - par.position.y, cz - par.position.z);
          par.add(mesh);
          return;
        }
        if (p.ouvrant && p.ouvrant.type === 'porte') {
          var pivot = new THREE.Group();
          var xg = (p.ouvrant.charniere === 'gauche') ? p.x : (p.x + p.w);
          pivot.position.set(xg / 1000, cy, cz);
          mesh.position.set(cx - xg / 1000, 0, 0);
          pivot.add(mesh);
          pivot.userData.ouvrant = p.ouvrant;
          if (p.id) ouvrants[p.id] = pivot;
          groupe.add(pivot); meshes.push(pivot);
          return;
        }
        mesh.position.set(cx, cy, cz);
        if (p.ouvrant && p.ouvrant.type === 'tiroir') {
          mesh.userData.ouvrant = p.ouvrant;
          mesh.userData.z0 = cz;
          if (p.id) ouvrants[p.id] = mesh;
        }
        groupe.add(mesh); meshes.push(mesh);
      });
      appliquerOuverture();
      recadrer();
    }

    function appliquerOuverture() {
      meshes.forEach(function (o) {
        var ouv = o.userData.ouvrant;
        if (!ouv) return;
        if (ouv.type === 'porte') {
          var sens = (ouv.charniere === 'gauche') ? -1 : 1;
          o.rotation.y = sens * ouverture * (Math.PI / 2.2);
        } else if (ouv.type === 'tiroir') {
          o.position.z = o.userData.z0 + (ouv.course / 1000) * ouverture;
        }
      });
    }

    // ── Caméra imposée (photo calée par WooderPhoto) ─────────────────
    // Les coordonnées arrivent en mm dans le repère du sol : on divise par
    // 1000 comme le reste de la scène. Le groupe n'est alors PAS recentré :
    // le meuble doit rester là où l'utilisateur l'a posé dans la pièce.
    var camImposee = null;
    function appliquerCamera() {
      if (!camImposee || !camera) return;
      var c = camImposee;
      groupe.position.set(0, 0, 0);         // repère de la pièce, pas de recentrage
      sol.position.y = 0;
      // Le format du cadre vient d'être mis à celui de la photo : il faut le
      // reprendre ICI. Attendre le ResizeObserver, c'est projeter au format
      // précédent — quelques pixels d'écart, et le calage semble faux.
      var t = taille();
      camera.aspect = t.w / t.h;
      if (renderer) renderer.setSize(t.w, t.h);
      camera.fov = c.fov;
      camera.position.set(c.position[0] / 1000, c.position[1] / 1000, c.position[2] / 1000);
      camera.up.set(c.haut[0], c.haut[1], c.haut[2]);
      camera.lookAt(c.cible[0] / 1000, c.cible[1] / 1000, c.cible[2] / 1000);
      camera.near = 0.02; camera.far = 200;
      camera.updateProjectionMatrix();
      if (controls) { controls.enabled = false; }
    }

    // ── Sol de la pièce (stratifié) ──────────────────────────────────
    // Plan texturé à hauteur zéro : posé dans la scène, il se met en
    // perspective tout seul puisque la caméra est celle de la photo.
    var solDeco = null;
    function poserSol(info) {
      if (solDeco) { scene.remove(solDeco); solDeco.geometry.dispose(); solDeco = null; }
      if (!info || !info.url) return;
      var tx = new THREE.TextureLoader().load(info.url);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      if (THREE.sRGBEncoding) tx.encoding = THREE.sRGBEncoding;
      if (renderer.capabilities.getMaxAnisotropy) tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // une lame fait info.l × info.h mm : on répète à l'échelle réelle
      var COTE = 12;                                   // 12 m de sol, large
      tx.repeat.set(COTE * 1000 / (info.l || 1220), COTE * 1000 / (info.h || 3050));
      solDeco = new THREE.Mesh(
        new THREE.PlaneGeometry(COTE, COTE),
        new THREE.MeshStandardMaterial({ map: tx, roughness: 0.65, metalness: 0.02, envMapIntensity: 0.7 })
      );
      solDeco.rotation.x = -Math.PI / 2;
      solDeco.position.set(0, -0.001, 0);              // juste sous les meubles
      solDeco.receiveShadow = true;
      scene.add(solDeco);
    }

    var dejaCadre = false;
    // force = true : on recadre vraiment (bouton « Recadrer », premier affichage).
    // Sinon on garde l'angle et la distance que l'utilisateur a réglés à la
    // souris — sans ça la vue se remettait à zéro à chaque modification, et on
    // reperdait son point de vue dès qu'on ajoutait une étagère.
    function recadrer(force) {
      if (camImposee) { appliquerCamera(); return; }   // caméra de la photo : on n'y touche pas
      if (!groupe || !meshes.length) return;
      var garder = dejaCadre && !force;
      var ecart = garder ? camera.position.clone().sub(controls.target) : null;
      var bb = new THREE.Box3().setFromObject(groupe);
      var c = bb.getCenter(new THREE.Vector3());
      var s = bb.getSize(new THREE.Vector3());
      var d = Math.max(s.x, s.y, s.z);
      // recentre le meuble sur l'origine en X/Z, garde le sol en Y=0
      groupe.position.x = -c.x; groupe.position.z = -c.z;
      groupe.position.y = -bb.min.y;
      sol.position.y = 0;
      var cible = new THREE.Vector3(0, s.y / 2, 0);
      controls.target.copy(cible);
      // Reprendre le format du cadre AVANT de calculer la distance. Le premier
      // cadrage a lieu avant que le ResizeObserver n'ait mesuré le conteneur :
      // avec l'ancien format, la caméra se pose trop près et coupe le bas du
      // meuble — on croit alors que la plinthe ou les pieds ne s'affichent pas.
      var t = taille();
      camera.aspect = t.w / t.h;
      if (renderer) renderer.setSize(t.w, t.h);
      // distance calée sur la sphère englobante (tient compte du format du cadre)
      var fov = camera.fov * Math.PI / 180;
      var fovH = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
      var rayon = s.length() / 2;
      var dist = rayon / Math.sin(Math.max(0.15, Math.min(fov, fovH)) / 2) * 0.95;
      if (garder) {
        camera.position.copy(cible).add(ecart);       // même angle, même distance
      } else {
        var az = Math.PI * 0.19, el = Math.PI * 0.09; // 3/4 avant, légèrement en plongée
        camera.position.set(
          cible.x + dist * Math.sin(az) * Math.cos(el),
          cible.y + dist * Math.sin(el),
          cible.z + dist * Math.cos(az) * Math.cos(el)
        );
        dejaCadre = true;
      }
      camera.near = Math.max(0.02, d / 200); camera.far = dist * 12;
      camera.updateProjectionMatrix();
      controls.update();
    }

    function clic(ev) {
      var r = renderer.domElement.getBoundingClientRect();
      var v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1,
                                -((ev.clientY - r.top) / r.height) * 2 + 1);
      var rc = new THREE.Raycaster(); rc.setFromCamera(v, camera);
      var hits = rc.intersectObjects(groupe.children, true);
      if (hits.length) onSelect(hits[0].object.userData.panneau || null, hits[0]);
    }

    function redimensionner() {
      if (!renderer) return;
      var t = taille();
      camera.aspect = t.w / t.h; camera.updateProjectionMatrix();
      renderer.setSize(t.w, t.h);
    }

    function boucle() {
      if (detruit) return;
      raf = requestAnimationFrame(boucle);
      // Caméra imposée (photo calée) : surtout PAS controls.update(), qui
      // réapplique son propre état à chaque image et défait le calage.
      // `enabled = false` bloque la souris, pas cette remise à jour.
      if (!camImposee) controls.update();
      renderer.render(scene, camera);
    }

    var api = {
      setModele: function (m) { meubles = m ? [{ modele: clone(m), x: 0, y: 0, z: 0 }] : []; if (THREE) construire(); },
      // Composition : [{ modele, x, y, z, nom }] — y = hauteur du dessous
      // depuis le sol (0 = posé au sol, H du bas = posé dessus, 1400 = suspendu).
      setMeubles: function (list) { meubles = list ? clone(list) : []; if (THREE) construire(); },
      getMeubles: function () { return clone(meubles); },
      setMateriaux: function (mats) { materiaux = mats || []; matCache = {}; if (THREE) construire(); },
      setTextures: function (on) { texturesActives = !!on; matCache = {}; if (THREE) construire(); },
      // Caméra retrouvée depuis une photo (WooderPhoto.camera) — mm.
      // null → on revient au cadrage automatique et à la souris.
      setCamera: function (cam) {
        camImposee = cam ? clone(cam) : null;
        if (!THREE) return;
        if (camImposee) appliquerCamera();
        else { if (controls) controls.enabled = true; recadrer(); }
      },
      // Sol de la pièce : { url, l, h } en mm, ou null pour l'enlever.
      setSol: function (info) { if (THREE) poserSol(info); },
      // Projette un point de la scène (mm) en pixels du canvas. C'est le
      // contrôle décisif d'un calage photo : un point du sol doit retomber
      // là où l'utilisateur a cliqué.
      projeter: function (p) {
        if (!THREE || !camera || !renderer) return null;
        // project() lit matrixWorldInverse, qui n'est recalculée qu'au rendu :
        // sans cette mise à jour on projette avec la caméra d'avant.
        camera.updateMatrixWorld();
        var v = new THREE.Vector3(p[0] / 1000, p[1] / 1000, p[2] / 1000).project(camera);
        var t = taille();
        return [(v.x + 1) / 2 * t.w, (1 - v.y) / 2 * t.h];
      },
      setOuverture: function (t) { ouverture = Math.max(0, Math.min(1, t)); if (THREE) appliquerOuverture(); },
      // appelée par le bouton « Recadrer » : là, on remet vraiment la vue d'origine
      recadrer: function () { if (THREE) recadrer(true); },
      panneaux: function () { return panneauxComposition(meubles); },
      capture: function () { return renderer ? renderer.domElement.toDataURL('image/png') : null; },
      detruire: function () {
        detruit = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else global.removeEventListener('resize', redimensionner);
        if (renderer) { renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.remove(); }
        container.innerHTML = '';
      }
    };
    return api;
  }

  global.WooderVue3D = {
    creer: creer,
    panneaux: panneaux,                       // un meuble → panneaux 3D (mm)
    panneauxComposition: panneauxComposition, // plusieurs meubles positionnés
    chargerThree: chargerThree
  };

})(window);
