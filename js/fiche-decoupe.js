/* ================================================================
   THE WOODER — fiche-decoupe.js (v1)
   ================================================================
   Module ADDITIF — ne touche à aucun fichier existant.

   Ajoute un bouton "Fiche de découpe" dans la sticky bar, à côté
   de "Récupérer les fichiers". Au clic, lit window._itemsCache
   et génère un fichier Excel (.xlsx) :

     Meuble | Désignation | Type | L | l | Ép. | Qté
            | Chant L1 | Chant L2 | Chant l1 | Chant l2

   Les chants (X) suivent EXACTEMENT la logique de calculerChant()
   dans calculs.js :
     - porte / tiroir       → 4 chants (L1 L2 l1 l2)
     - plinthe              → 2 longueurs + 1 largeur (L1 L2 l1)
     - lateral / montant
       / panneau / etagere  → 1 chant côté longueur OU largeur,
                              selon p.longueur <= prof
     - autres (fond, etc.)  → aucun chant

   Installation :
     1. Poser ce fichier dans le dossier js/
     2. Ajouter dans calcul.html, après les autres <script> :
        <script src="js/fiche-decoupe.js"></script>

   SheetJS (xlsx) est chargé dynamiquement depuis le CDN au 1er clic.
   ================================================================ */

(function() {
  'use strict';

  var SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  // ── Chargement dynamique de SheetJS ─────────────────────────────
  function chargerSheetJS(callback) {
    if (typeof XLSX !== 'undefined') { callback(); return; }
    var s = document.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = function() { callback(); };
    s.onerror = function() {
      alert('Impossible de charger SheetJS depuis le CDN.\nVérifiez votre connexion.');
    };
    document.head.appendChild(s);
  }

  // ── Détermination des chants pour une pièce ─────────────────────
  // Retourne { L1, L2, l1, l2 } (booléens)
  // L = côté longueur (long bord), l = côté largeur (petit bord)
  function chantsForItem(item) {
    var p    = item.p;
    var type = item.type;
    var prof = item.prof || 600;

    if (type === 'porte' || type === 'tiroir') {
      return { L1: true, L2: true, l1: true, l2: true };
    }
    if (type === 'plinthe') {
      // calculerChant : c = p.longueur * 2 + p.largeur
      // → 2 longueurs (L1+L2) + 1 largeur (l1)
      return { L1: true, L2: true, l1: true, l2: false };
    }
    if (type === 'lateral' || type === 'montant' || type === 'panneau' || type === 'etagere') {
      // calculerChant : c = p.longueur <= prof ? p.largeur : p.longueur;
      // Un seul chant côté visible
      if (p.longueur <= prof) {
        return { L1: false, L2: false, l1: true, l2: false };
      } else {
        return { L1: true, L2: false, l1: false, l2: false };
      }
    }
    // fond, traverse, dos, etc. → pas de chant
    return { L1: false, L2: false, l1: false, l2: false };
  }

  // ── Type lisible pour la fiche ──────────────────────────────────
  function typeLisible(t) {
    var map = {
      porte: 'Porte', tiroir: 'Tiroir', plinthe: 'Plinthe',
      lateral: 'Latéral', montant: 'Montant', panneau: 'Panneau',
      etagere: 'Étagère', fond: 'Fond', traverse: 'Traverse',
      dos: 'Dos'
    };
    return map[t] || (t || '—');
  }

  // ── Génération du fichier Excel ─────────────────────────────────
  function genererFicheDecoupe() {
    var items = window._itemsCache || [];
    if (!items.length) {
      alert('Aucune pièce calculée.\nLancez d\'abord un calcul.');
      return;
    }

    chargerSheetJS(function() {
      // En-tête
      var rows = [[
        'Meuble',
        'Désignation',
        'Type',
        'L (mm)',
        'l (mm)',
        'Ép. (mm)',
        'Qté',
        'Chant L1',
        'Chant L2',
        'Chant l1',
        'Chant l2'
      ]];

      // Trier par meuble puis garder l'ordre original
      var sorted = items.slice().sort(function(a, b) {
        return (a.meubleIdx || 0) - (b.meubleIdx || 0);
      });

      var dernMeuble = null;
      for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        var p  = it.p || {};
        var c  = chantsForItem(it);

        // Ligne de séparation entre meubles (si > 1 meuble)
        var meubles = window._meubles || [];
        if (meubles.length > 1 && it.meuble !== dernMeuble) {
          dernMeuble = it.meuble;
        }

        rows.push([
          it.meuble || '',
          p.designation || '',
          typeLisible(it.type),
          p.longueur || '',
          p.largeur || '',
          it.ep || '',
          p.nombre || 1,
          c.L1 ? 'X' : '',
          c.L2 ? 'X' : '',
          c.l1 ? 'X' : '',
          c.l2 ? 'X' : ''
        ]);
      }

      // Construction worksheet
      var ws = XLSX.utils.aoa_to_sheet(rows);

      // Largeurs colonnes
      ws['!cols'] = [
        { wch: 18 }, // Meuble
        { wch: 28 }, // Désignation
        { wch: 12 }, // Type
        { wch: 10 }, // L
        { wch: 10 }, // l
        { wch: 10 }, // Ép.
        { wch: 6  }, // Qté
        { wch: 9  }, // L1
        { wch: 9  }, // L2
        { wch: 9  }, // l1
        { wch: 9  }  // l2
      ];

      // Workbook
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fiche de découpe');

      // Nom de fichier daté
      var d = new Date();
      var pad = function(n) { return (n < 10 ? '0' : '') + n; };
      var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
                + '_' + pad(d.getHours()) + pad(d.getMinutes());
      var filename = 'fiche-decoupe_' + stamp + '.xlsx';

      XLSX.writeFile(wb, filename);
      console.log('[fiche-decoupe] Exporté : ' + filename + ' (' + (rows.length - 1) + ' lignes)');
    });
  }

  // ── Injection du bouton dans la sticky bar ──────────────────────
  function injecterBouton() {
    var bar = document.getElementById('stickyBar');
    if (!bar) {
      // sticky bar pas encore en DOM → réessayer
      setTimeout(injecterBouton, 200);
      return;
    }
    if (document.getElementById('btnFicheDecoupe')) return; // déjà injecté

    var btn = document.createElement('button');
    btn.id = 'btnFicheDecoupe';
    btn.className = 'sticky-btn';
    btn.style.background  = '#5a6c7d';
    btn.style.color       = '#fff';
    btn.textContent       = '📋 Fiche de découpe';
    btn.onclick           = genererFicheDecoupe;

    bar.appendChild(btn);
    console.log('[fiche-decoupe] Bouton injecté dans la sticky bar');
  }

  // ── Lancement ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injecterBouton);
  } else {
    injecterBouton();
  }

})();
