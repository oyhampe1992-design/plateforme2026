/* test-pipeline v4 - 5 boutons dont COMPO multi-meuble */

(function() {
  var TESTS = [
    {
      label: 'CB_2P', color: '#DC2626', top: 10, multi: false,
      data: {
        ensemble: { nom_client: "CB 2P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 74, largeur: 80, profondeur: 40 },
          particularites: ["plinthe rapportee"] },
        elements: [{
          id: "CB_01", type: "CB", largeur: 80, hauteur: 74, profondeur: 40,
          facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 2, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
        }]
      }
    },
    {
      label: 'CB_1P', color: '#7C3AED', top: 50, multi: false,
      data: {
        ensemble: { nom_client: "CB 1P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 74, largeur: 40, profondeur: 40 },
          particularites: ["plinthe rapportee"] },
        elements: [{
          id: "CB_01", type: "CB", largeur: 40, hauteur: 74, profondeur: 40,
          facade: { type: "portes_battantes", nb_portes: 1, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 1, TIR: 0, ETG: 1, PEND: 0, PLI: "applique" }
        }]
      }
    },
    {
      label: 'CH_2P', color: '#2563EB', top: 90, multi: false,
      data: {
        ensemble: { nom_client: "CH 2P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 72, largeur: 80, profondeur: 33 },
          particularites: [] },
        elements: [{
          id: "CH_01", type: "CH", largeur: 80, hauteur: 72, profondeur: 33,
          facade: { type: "portes_battantes", nb_portes: 2, nb_tiroirs: 0, pose: "applique" },
          sous_elements: { MI: 0, PB: 2, TIR: 0, ETG: 1, PEND: 0, PLI: "aucune" }
        }]
      }
    },
    {
      label: 'CH_1P', color: '#16A34A', top: 130, multi: false,
      data: {
        ensemble: { nom_client: "CH 1P", materiau_apparent: "Melamine",
          dimensions_totales: { hauteur: 72, largeur: 40, profondeur: 33 },
          particularites: [] },
        elements: [{
          id: "CH_01", type: "CH", largeur: 40,
