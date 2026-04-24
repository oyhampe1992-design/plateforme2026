/* ================================================================
   THE WOODER - test-pipeline.js (v3)
   ================================================================
   Quatre boutons flottants pour tester CB_1P, CB_2P, CH_1P, CH_2P.
   A supprimer une fois le test valide.
   ================================================================ */

(function() {
  var TESTS = [
    {
      label: 'CB_2P',
      color: '#DC2626',
      top: 10,
      data: {
        ensemble: {
          nom_client: "Caisson bas 2P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 74, largeur: 80, profondeur: 40 },
          particularites: ["plinthe rapportee"]
        },
        elements: [{
          id: "CB_01", type: "CB", zone_horizontale: "centre",
          largeur: 80, hauteur: 74, profondeur: 40,
          facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 2, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
        }]
      }
    },
    {
      label: 'CB_1P',
      color: '#7C3AED',
      top: 50,
      data: {
        ensemble: {
          nom_client: "Caisson bas 1P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 74, largeur: 40, profondeur: 40 },
          particularites: ["plinthe rapportee"]
        },
        elements: [{
          id: "CB_01", type: "CB", zone_horizontale: "centre",
          largeur: 40, hauteur: 74, profondeur: 40,
          facade: { type: "portes_battantes", nb_portes: 1, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 1, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
        }]
      }
    },
    {
      label: 'CH_2P',
      color: '#2563EB',
      top: 90,
      data: {
        ensemble: {
          nom_client: "Caisson haut 2P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 72, largeur: 80, profondeur: 33 },
          particularites: []
        },
        elements: [{
          id: "CH_01", type: "CH", zone_horizontale: "centre",
          largeur: 80, hauteur: 72, profondeur: 33,
          facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 2, TIR: 0, ETG: 1, PEND: 0, PLI: "aucune" }
        }]
      }
    },
    {
      label: 'CH_1P',
      color: '#16A34A',
      top: 130,
      data: {
        ensemble: {
          nom_client: "Caisson haut 1P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 72, largeur: 40, profondeur: 33 },
          particularites: []
        },
        elements: [{
          id: "CH_01", type: "CH", zone_horizontale: "centre",
          largeur: 40, hauteur: 72, profondeur: 33,
          facade: { type: "portes_battantes", nb_portes: 1, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 1, TIR: 0, ETG: 1, PEND: 0, PLI: "aucune" }
        }]
      }
    }
  ];

  function lancerTest(t) {
    console.log('=== TEST ' + t.label + ' ===');
    if (typeof mapperJSON !== 'function' || typeof ajouterMeubleGenere !== 'function') {
      alert('ERREUR : fichiers manquants.');
      return;
    }
    if (window._meubles) window._meubles.length = 0;

    var plans = mapperJSON(t.data);
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

    alert(t.label + ' : ' + ok + ' genere, ' + ko + ' non supporte.');
  }

  function creerBoutons() {
    TESTS.forEach(function(t) {
      var b = document.createElement('button');
      b.textContent = '🧪 ' + t.label;
      b.style.cssText =
        'position:fixed;top:' + t.top + 'px;right:10px;z-index:99999;' +
        'padding:8px 14px;background:' + t.color + ';color:#fff;' +
        'border:none;border-radius:8px;font-weight:700;font-size:11px;' +
        'cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);';
      b.onclick = function() { lancerTest(t); };
      document.body.appendChild(b);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', creerBoutons);
  } else {
    creerBoutons();
  }
})();
