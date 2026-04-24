/* ================================================================
   THE WOODER - test-pipeline.js (v2)
   ================================================================
   Deux boutons flottants pour tester la chaine photo -> moteur
   sur CB_2P et CB_1P, sans coller de code dans la console.
   A supprimer une fois le test valide.
   ================================================================ */

(function() {
  // ── JSON de test : CB_2P (Brabant Gautier 800x740x400) ──────────
  var jsonCB_2P = {
    ensemble: {
      nom_client: "Armoire basse de bureau",
      nom_technique: "Caisson bas 2 portes",
      materiau_apparent: "Melamine chene clair",
      dimensions_totales: { hauteur: 74, largeur: 80, profondeur: 40 },
      particularites: ["pieds reglables", "plinthe rapportee"]
    },
    elements: [{
      id: "CB_01", type: "CB", zone_horizontale: "centre",
      largeur: 80, hauteur: 74, profondeur: 40,
      facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
      sous_elements: { MI: 0, PB: 2, PC: 0, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
    }]
  };

  // ── JSON de test : CB_1P (caisson etroit 400x740x400) ───────────
  var jsonCB_1P = {
    ensemble: {
      nom_client: "Caisson bas etroit",
      nom_technique: "Caisson bas 1 porte",
      materiau_apparent: "Melamine chene clair",
      dimensions_totales: { hauteur: 74, largeur: 40, profondeur: 40 },
      particularites: ["pieds reglables", "plinthe rapportee"]
    },
    elements: [{
      id: "CB_01", type: "CB", zone_horizontale: "centre",
      largeur: 40, hauteur: 74, profondeur: 40,
      facade: { type: "portes_battantes", nb_portes: 1, nb_tiroirs: 0, pose: "applique" },
      sous_elements: { MI: 0, PB: 1, PC: 0, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
    }]
  };

  function lancerTest(label, photoJson) {
    console.log('=== TEST ' + label + ' ===');

    if (typeof mapperJSON !== 'function' || typeof ajouterMeubleGenere !== 'function') {
      alert('ERREUR : fichiers manquants. Recharge la page.');
      return;
    }

    // Vide la liste existante pour partir propre
    if (window._meubles) window._meubles.length = 0;

    var plans = mapperJSON(photoJson);
    console.log('Resume :', resumerMappage(plans));

    var ok = 0, ko = 0;
    plans.forEach(function(p) {
      if (p.supported) {
        var meuble = window[p.generator](p.L, p.H, p.P, p.opts);
        console.log('Meuble genere :', meuble);
        ajouterMeubleGenere(meuble);
        ok++;
      } else {
        console.warn('Non supporte :', p.reason);
        ko++;
      }
    });

    alert(label + ' : ' + ok + ' genere(s), ' + ko + ' non supporte(s).\n' +
          'Regarde les sections Debit, Plan 2D, DXF qui doivent se remplir.');
  }

  function creerBoutons() {
    // Bouton CB_2P
    var b1 = document.createElement('button');
    b1.textContent = '🧪 TEST CB_2P';
    b1.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:99999;' +
      'padding:10px 16px;background:#DC2626;color:#fff;' +
      'border:none;border-radius:8px;font-weight:700;font-size:12px;' +
      'cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    b1.onclick = function() { lancerTest('CB_2P', jsonCB_2P); };
    document.body.appendChild(b1);

    // Bouton CB_1P
    var b2 = document.createElement('button');
    b2.textContent = '🧪 TEST CB_1P';
    b2.style.cssText =
      'position:fixed;top:50px;right:10px;z-index:99999;' +
      'padding:10px 16px;background:#7C3AED;color:#fff;' +
      'border:none;border-radius:8px;font-weight:700;font-size:12px;' +
      'cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    b2.onclick = function() { lancerTest('CB_1P', jsonCB_1P); };
    document.body.appendChild(b2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', creerBoutons);
  } else {
    creerBoutons();
  }
})();
