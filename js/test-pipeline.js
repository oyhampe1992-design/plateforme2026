/* ================================================================
   THE WOODER - test-pipeline.js
   ================================================================
   Fichier TEMPORAIRE pour tester la chaine photo -> generateur
   -> moteur de calcul sans avoir a coller du code dans la console.

   Ajoute un bouton flottant en haut a droite de la page.
   Au clic : genere et injecte un meuble de test (Brabant Gautier
   CB_2P 800x740x400, JSON issu de l'analyseur photo).

   A SUPPRIMER une fois le test valide.
   ================================================================ */

(function() {
  // JSON de test : sortie reelle de l'analyseur photo
  // pour l'armoire basse de bureau Brabant Gautier
  var photoJsonTest = {
    ensemble: {
      nom_client: "Armoire basse de bureau",
      nom_technique: "Caisson bas 2 portes battantes avec serrure",
      materiau_apparent: "Melamine chene clair",
      dimensions_totales: { hauteur: 74, largeur: 80, profondeur: 40 },
      particularites: ["pieds reglables", "plinthe rapportee"]
    },
    elements: [{
      id: "CB_01",
      type: "CB",
      zone_horizontale: "centre",
      largeur: 80, hauteur: 74, profondeur: 40,
      facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
      sous_elements: { MI: 0, PB: 2, PC: 0, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
    }]
  };

  function lancerTest() {
    console.log('=== TEST PIPELINE PHOTO -> MOTEUR ===');
    console.log('JSON photo :', photoJsonTest);

    if (typeof mapperJSON !== 'function') {
      alert('ERREUR : mapperJSON non charge. Verifie que mapper-photo.js est bien inclus.');
      return;
    }
    if (typeof generateCB_2P !== 'function') {
      alert('ERREUR : generateCB_2P non charge. Verifie que generateurs.js est bien inclus.');
      return;
    }
    if (typeof ajouterMeubleGenere !== 'function') {
      alert('ERREUR : ajouterMeubleGenere non charge. Verifie que generateurs.js est bien inclus.');
      return;
    }

    var plans = mapperJSON(photoJsonTest);
    console.log('Resume :', resumerMappage(plans));
    console.log('Plans :', plans);

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

    alert('Test lance : ' + ok + ' meuble(s) genere(s), ' + ko + ' non supporte(s).\n\n' +
          'Regarde :\n' +
          '- la section "Pieces detectees" qui doit se remplir\n' +
          '- les sections Chant, Prix, Debit qui doivent se calculer\n' +
          '- la console (F12) pour les details');
  }

  // Cree un bouton flottant rouge bien visible
  function creerBouton() {
    var btn = document.createElement('button');
    btn.textContent = '🧪 TEST Pipeline Photo';
    btn.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:99999;' +
      'padding:12px 20px;background:#DC2626;color:#fff;' +
      'border:none;border-radius:8px;font-weight:700;' +
      'font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    btn.onclick = lancerTest;
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', creerBouton);
  } else {
    creerBouton();
  }
})();
