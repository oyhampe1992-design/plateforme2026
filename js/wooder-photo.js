/* ═══════════════════════════════════════════════════════════════════
   THE WOODER — wooder-photo.js
   Caler une photo de pièce pour y poser des meubles en 3D.

   ── Principe ───────────────────────────────────────────────────────
   L'utilisateur désigne sur le SOL 4 points formant un rectangle dont il
   connaît les dimensions réelles (un carrelage, les angles de la pièce,
   une planche posée au sol). Ces 4 correspondances donnent l'homographie
   du plan du sol, d'où l'on déduit la POSE de l'appareil photo.

   Une fois la caméra retrouvée, plus rien n'est approximé : les meubles
   sont posés dans la scène 3D et se projettent d'eux-mêmes à la bonne
   perspective. Le sol stratifié est un simple plan texturé en y = 0.

   ── Repère ─────────────────────────────────────────────────────────
   Sol       : X vers la droite, Z vers le fond, Y vers le haut (mm)
   Image     : x vers la droite, y vers le BAS (pixels)
   Les 4 points sont donnés dans l'ordre : avant-gauche, avant-droit,
   arrière-droit, arrière-gauche (sens horaire vu du dessus).

   ── API ────────────────────────────────────────────────────────────
     var H = WooderPhoto.homographie(sol4, image4);   // 3x3
     var cam = WooderPhoto.camera(H, larg, haut, focalePx);
        → { position:[x,y,z], cible:[x,y,z], haut:[x,y,z], fov, focale }
     WooderPhoto.projeter(H, [x, z])  → [px, py]   (contrôle)
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Algèbre minimale ─────────────────────────────────────────────
  function resoudre(A, b) {           // élimination de Gauss, A carré n×n
    var n = b.length, i, j, k;
    var M = A.map(function (r, idx) { return r.concat([b[idx]]); });
    for (i = 0; i < n; i++) {
      // pivot partiel : indispensable, sans quoi un point aligné fait diverger
      var p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      if (Math.abs(M[p][i]) < 1e-12) return null;      // configuration dégénérée
      var t = M[i]; M[i] = M[p]; M[p] = t;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }
  function norme(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function divise(v, k) { return [v[0] / k, v[1] / k, v[2] / k]; }
  function croix(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function scal(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // ── Homographie plan → image, à partir de 4 correspondances ──────
  // sol[i] = [X, Z] en mm ; img[i] = [x, y] en pixels.
  // On pose h33 = 1 et on résout les 8 inconnues restantes.
  function homographie(sol, img) {
    if (!sol || !img || sol.length < 4 || img.length < 4) return null;
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var X = sol[i][0], Z = sol[i][1], x = img[i][0], y = img[i][1];
      A.push([X, Z, 1, 0, 0, 0, -x * X, -x * Z]); b.push(x);
      A.push([0, 0, 0, X, Z, 1, -y * X, -y * Z]); b.push(y);
    }
    var h = resoudre(A, b);
    if (!h) return null;
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  // Projette un point du sol par l'homographie (sert au contrôle visuel).
  function projeter(H, p) {
    var X = p[0], Z = p[1];
    var w = H[2][0] * X + H[2][1] * Z + H[2][2];
    return [(H[0][0] * X + H[0][1] * Z + H[0][2]) / w,
            (H[1][0] * X + H[1][1] * Z + H[1][2]) / w];
  }

  // Chemin inverse : un point de l'IMAGE redonne son point au sol. C'est ce
  // qui permet de faire glisser un meuble à la souris — on lit directement
  // où le curseur tombe sur le plancher, en millimètres, sans tâtonner.
  // On résout H·[X, Z, 1]ᵀ ∝ [x, y, 1]ᵀ, soit deux équations à deux inconnues.
  function solDepuisImage(H, p) {
    if (!H) return null;
    var x = p[0], y = p[1];
    var A = [[H[0][0] - x * H[2][0], H[0][1] - x * H[2][1]],
             [H[1][0] - y * H[2][0], H[1][1] - y * H[2][1]]];
    var b = [x * H[2][2] - H[0][2], y * H[2][2] - H[1][2]];
    return resoudre(A, b);      // null si le point est sur la ligne d'horizon
  }

  // ── Pose de l'appareil photo à partir de l'homographie ───────────
  // K = matrice interne supposée : point principal au centre de l'image,
  // pixels carrés, focale donnée en pixels (réglable par l'utilisateur —
  // c'est le seul paramètre qu'on ne peut pas déduire de 4 points).
  //
  // H = K · [r1 r2 t] à un facteur près. On en tire r1, r2, puis
  // r3 = r1 × r2, et on ré-orthonormalise (les mesures ne sont jamais
  // exactes, la matrice obtenue ne l'est donc pas non plus).
  // cibleSol : point du sol [X, Z] que l'appareil regarde (en général le
  // centre du rectangle de calage). Il lève la dernière ambiguïté : selon
  // l'ordre des points, la décomposition peut donner la visée à l'opposé.
  function camera(H, largeur, hauteur, focale, cibleSol) {
    if (!H) return null;
    var f = focale || largeur;                 // ~53° d'ouverture : un téléphone
    var cx = largeur / 2, cy = hauteur / 2;
    // K⁻¹ appliqué à une colonne de H
    function Kinv(c) { return [(c[0] - cx * c[2]) / f, (c[1] - cy * c[2]) / f, c[2]]; }
    var h1 = Kinv([H[0][0], H[1][0], H[2][0]]);
    var h2 = Kinv([H[0][1], H[1][1], H[2][1]]);
    var h3 = Kinv([H[0][2], H[1][2], H[2][2]]);
    var l1 = norme(h1), l2 = norme(h2);
    if (!l1 || !l2) return null;
    var lambda = 2 / (l1 + l2);                // moyenne : plus stable qu'un seul
    var r1 = divise(h1, l1), r2 = divise(h2, l2);
    // ré-orthonormalisation (Gram-Schmidt symétrique)
    var moy = [(r1[0] + r2[0]) / 2, (r1[1] + r2[1]) / 2, (r1[2] + r2[2]) / 2];
    var dif = croix(croix(r1, r2), moy);
    var mn = norme(moy), dn = norme(dif);
    if (!mn || !dn) return null;
    moy = divise(moy, mn); dif = divise(dif, dn);
    // `dif` doit pointer du côté de r1, sinon la reconstruction échange les
    // deux axes du sol (le X devient le Z) et la caméra part de travers.
    if (scal(dif, r1) < 0) dif = [-dif[0], -dif[1], -dif[2]];
    var s = Math.SQRT1_2;
    r1 = [s * (moy[0] + dif[0]), s * (moy[1] + dif[1]), s * (moy[2] + dif[2])];
    r2 = [s * (moy[0] - dif[0]), s * (moy[1] - dif[1]), s * (moy[2] - dif[2])];
    var r3 = croix(r1, r2);
    var t = [h3[0] * lambda, h3[1] * lambda, h3[2] * lambda];

    // Repère caméra (vision par ordinateur) : x droite, y BAS, z devant.
    // Position de l'appareil dans le repère du sol : C = -Rᵀ·t
    function centre() {
      return [-(r1[0] * t[0] + r1[1] * t[1] + r1[2] * t[2]),
              -(r2[0] * t[0] + r2[1] * t[1] + r2[2] * t[2]),
              -(r3[0] * t[0] + r3[1] * t[1] + r3[2] * t[2])];
    }
    var C = centre();
    // L'homographie ne fixe pas le signe : deux décompositions sont valables,
    // l'une plaçant l'appareil au-dessus du sol, l'autre dessous (son reflet).
    // On garde évidemment celle du dessus — sinon le meuble se retrouve
    // à l'envers, à une hauteur négative.
    if (C[2] < 0) {
      r1 = [-r1[0], -r1[1], -r1[2]];
      r2 = [-r2[0], -r2[1], -r2[2]];
      t  = [-t[0], -t[1], -t[2]];
      r3 = croix(r1, r2);
      C = centre();
    }
    // Axes de l'appareil exprimés dans le repère du sol (lignes de R).
    // On prend l'opposé des axes y et z : le repère de la vision par
    // ordinateur regarde vers +z avec le y vers le bas, celui d'une caméra
    // 3D regarde vers -z avec le y vers le haut. Nier ces deux axes fait
    // passer de l'un à l'autre en gardant un repère direct.
    var avant = [-r1[2], -r2[2], -r3[2]];   // direction de visée
    var bas   = [-r1[1], -r2[1], -r3[1]];   // vers le bas de l'image

    // Le plan du sol est (X, Z) et la hauteur est Y : on remet dans le
    // repère 3D de la scène, où Y est vertical.
    // Repère du sol (X, Z, hauteur) → repère de la scène (x, y, z).
    // ATTENTION : se contenter d'échanger les deux derniers axes RETOURNE le
    // trièdre — la scène devient le miroir de la réalité et tout se projette
    // à l'envers horizontalement. Il faut donc aussi nier le Z.
    //   scène x =  X du sol      scène y = hauteur      scène z = −Z du sol
    // Le fond de la pièce est ainsi en z négatif, comme le veut Three.js.
    function versScene(v) { return [v[0], v[2], -v[1]]; }
    var pos = versScene(C);
    var dir = versScene(avant);
    var hautV = versScene([-bas[0], -bas[1], -bas[2]]);

    // L'appareil doit regarder VERS le sol calé. Si la décomposition l'a
    // orienté à l'opposé, on retourne la caméra autour de son axe horizontal
    // (visée et haut inversés ensemble : le repère reste direct).
    var cs = cibleSol || [0, 0];
    var versCible = [cs[0] - pos[0], -pos[1], -cs[1] - pos[2]];   // cible en repère scène
    if (dir[0] * versCible[0] + dir[1] * versCible[1] + dir[2] * versCible[2] < 0) {
      dir   = [-dir[0], -dir[1], -dir[2]];
      hautV = [-hautV[0], -hautV[1], -hautV[2]];
    }
    var cible = [pos[0] + dir[0] * 1000, pos[1] + dir[1] * 1000, pos[2] + dir[2] * 1000];

    return {
      position: pos, cible: cible, haut: hautV,
      // champ vertical, celui qu'attend une caméra Three.js
      fov: 2 * Math.atan(hauteur / (2 * f)) * 180 / Math.PI,
      focale: f
    };
  }

  // Écart moyen, en pixels, entre les points cliqués et leur reprojection.
  // C'est le contrôle honnête : au-delà de quelques pixels, le calage est
  // mauvais (points mal placés ou rectangle qui n'en est pas un).
  function erreur(H, sol, img) {
    if (!H) return null;
    var s = 0;
    for (var i = 0; i < sol.length; i++) {
      var p = projeter(H, sol[i]);
      s += Math.sqrt(Math.pow(p[0] - img[i][0], 2) + Math.pow(p[1] - img[i][1], 2));
    }
    return s / sol.length;
  }

  global.WooderPhoto = {
    homographie: homographie,
    projeter: projeter,
    solDepuisImage: solDepuisImage,
    camera: camera,
    erreur: erreur
  };
})(typeof window !== 'undefined' ? window : this);
