/* ================================================================
   THE WOODER — fiche-decoupe.js (v2 — multi-fournisseurs)
   ================================================================
   Module ADDITIF — ne touche à aucun fichier existant.

   Au clic sur le bouton sticky :
   - Ouvre un modal de configuration
   - Permet de choisir le fournisseur (Aucun = générique / Dispano)
   - Mémorise les réglages en localStorage (par navigateur)
   - Génère et télécharge le bon format Excel

   Formats supportés :
   - "Aucun"  → format générique (Meuble | Désignation | L | l | Ép. | Qté
                | Chant L1/L2/l1/l2)
   - "Dispano" → remplit le template templates/Dispano.xlsx avec les cellules
                 correctes (en-tête chantier + lignes 19+ pour les pièces,
                 colonnes Av/Ar/G/D)

   Bouney sera ajouté ultérieurement (phase 2B).

   Installation :
     1. Poser ce fichier dans js/
     2. Dans calcul.html : <script src="js/fiche-decoupe.js"></script>
     3. Pour Dispano : poser le template vide dans templates/Dispano.xlsx
   ================================================================ */

(function() {
  'use strict';

  var SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var STORAGE_KEY = 'wooder_ficheDecoupe_v2';
  var TEMPLATE_DISPANO = 'templates/Dispano.xlsx';

  // ── localStorage ────────────────────────────────────────────────
  function chargerReglages() {
    try { var s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : {}; }
    catch (e) { return {}; }
  }
  function sauverReglages(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  // ── Chargement dynamique SheetJS ────────────────────────────────
  function chargerSheetJS(cb) {
    if (typeof XLSX !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = function() { cb(); };
    s.onerror = function() { alert('Impossible de charger SheetJS depuis le CDN.'); };
    document.head.appendChild(s);
  }

  // ── Chants génériques (L1/L2/l1/l2) ─────────────────────────────
  function chantsGenerique(item) {
    var p = item.p, t = item.type, prof = item.prof || 600;
    if (t === 'porte' || t === 'tiroir')
      return { L1: 1, L2: 1, l1: 1, l2: 1 };
    if (t === 'plinthe')
      return { L1: 1, L2: 1, l1: 1, l2: 0 };
    if (t === 'lateral' || t === 'montant' || t === 'panneau' || t === 'etagere') {
      return (p.longueur <= prof)
        ? { L1: 0, L2: 0, l1: 1, l2: 0 }
        : { L1: 1, L2: 0, l1: 0, l2: 0 };
    }
    return { L1: 0, L2: 0, l1: 0, l2: 0 };
  }

  // ── Chants Dispano (Av/Ar/G/D) ──────────────────────────────────
  function chantsDispano(item) {
    var t = item.type;
    if (t === 'porte' || t === 'tiroir')
      return { Av: 1, Ar: 1, G: 1, D: 1 };
    if (t === 'plinthe')
      return { Av: 1, Ar: 1, G: 1, D: 0 };
    if (t === 'lateral' || t === 'montant' || t === 'panneau' || t === 'etagere')
      return { Av: 1, Ar: 0, G: 0, D: 0 };
    return { Av: 0, Ar: 0, G: 0, D: 0 };
  }

  // ── Type lisible ────────────────────────────────────────────────
  function typeLisible(t) {
    var m = { porte: 'Porte', tiroir: 'Tiroir', plinthe: 'Plinthe',
              lateral: 'Latéral', montant: 'Montant', panneau: 'Panneau',
              etagere: 'Étagère', fond: 'Fond', traverse: 'Traverse', dos: 'Dos' };
    return m[t] || (t || '—');
  }

  // ── Stamp daté ──────────────────────────────────────────────────
  function stampNow() {
    var d = new Date(), pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
         + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  // ── Export GÉNÉRIQUE ────────────────────────────────────────────
  function exportGenerique(items) {
    var rows = [['Meuble','Désignation','Type','L (mm)','l (mm)','Ép. (mm)','Qté',
                 'Chant L1','Chant L2','Chant l1','Chant l2']];
    var sorted = items.slice().sort(function(a, b) {
      return (a.meubleIdx || 0) - (b.meubleIdx || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var it = sorted[i], p = it.p, c = chantsGenerique(it);
      rows.push([
        it.meuble || '', p.designation || '', typeLisible(it.type),
        p.longueur || '', p.largeur || '', it.ep || '', p.nombre || 1,
        c.L1 ? 'X' : '', c.L2 ? 'X' : '', c.l1 ? 'X' : '', c.l2 ? 'X' : ''
      ]);
    }
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:18},{wch:28},{wch:12},{wch:10},{wch:10},{wch:10},
                   {wch:6},{wch:9},{wch:9},{wch:9},{wch:9}];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fiche de découpe');
    XLSX.writeFile(wb, 'fiche-decoupe_' + stampNow() + '.xlsx');
  }

  // ── Export DISPANO ──────────────────────────────────────────────
  function exportDispano(items, infos) {
    fetch(TEMPLATE_DISPANO)
      .then(function(r) {
        if (!r.ok) throw new Error('Template introuvable : ' + TEMPLATE_DISPANO + ' (HTTP ' + r.status + ')');
        return r.arrayBuffer();
      })
      .then(function(buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        if (!wb.Sheets['Materiau 1']) throw new Error('Feuille "Materiau 1" absente du template');
        var ws = wb.Sheets['Materiau 1'];

        // En-tête chantier
        ws['H3']  = { t: 's', v: infos.nom         || 'OYHAMPE PIERRE' };
        ws['H5']  = { t: 's', v: infos.tel         || '' };
        ws['H6']  = { t: 's', v: infos.mail        || '' };
        ws['C8']  = { t: 's', v: infos.refChantier || '' };
        ws['C10'] = { t: 's', v: infos.adresse     || '' };
        ws['H9']  = { t: 's', v: infos.typeMatiere || '' };
        ws['H10'] = { t: 's', v: infos.epMatiere   || '' };
        ws['H13'] = { t: 's', v: infos.typeChant   || 'ABS' };
        ws['H14'] = { t: 's', v: infos.epChant     || '1MM' };
        if (infos.mode === 'devis')    ws['D5'] = { t: 's', v: 'X' };
        if (infos.mode === 'commande') ws['D6'] = { t: 's', v: 'X' };

        // Pièces (lignes 19+)
        var sorted = items.slice().sort(function(a, b) {
          return (a.meubleIdx || 0) - (b.meubleIdx || 0);
        });
        var MAX_ROWS = 30;
        var nbInsere = Math.min(sorted.length, MAX_ROWS);

        for (var i = 0; i < nbInsere; i++) {
          var row = 19 + i;
          var it = sorted[i], p = it.p || {}, c = chantsDispano(it);
          var nom = (window._meubles && window._meubles.length > 1 && it.meuble)
                  ? (it.meuble + ' - ' + (p.designation || ''))
                  : (p.designation || '');

          ws['C' + row] = { t: 's', v: nom };
          ws['D' + row] = { t: 'n', v: Number(p.longueur) || 0 };
          ws['E' + row] = { t: 'n', v: Number(p.largeur)  || 0 };
          ws['F' + row] = { t: 'n', v: Number(p.nombre)   || 1 };
          if (c.Av) ws['G' + row] = { t: 's', v: 'X' };
          if (c.Ar) ws['H' + row] = { t: 's', v: 'X' };
          if (c.G)  ws['I' + row] = { t: 's', v: 'X' };
          if (c.D)  ws['J' + row] = { t: 's', v: 'X' };
        }

        if (sorted.length > MAX_ROWS) {
          alert('⚠ ' + (sorted.length - MAX_ROWS) + ' pièce(s) non insérée(s) — le template Dispano '
              + 'limite à ' + MAX_ROWS + ' lignes par feuille. Ajoutez-les manuellement dans Materiau 2/3.');
        }

        // Détection mix d'épaisseurs
        var eps = {};
        for (var k = 0; k < sorted.length; k++) { if (sorted[k].ep) eps[sorted[k].ep] = true; }
        var epsList = Object.keys(eps);
        if (epsList.length > 1) {
          console.warn('[fiche-decoupe] Plusieurs épaisseurs détectées : ' + epsList.join(', ')
                     + '. Tout est dans Materiau 1 — à répartir manuellement dans Materiau 2/3.');
        }

        var refSafe = (infos.refChantier || 'export').replace(/[^A-Za-z0-9_-]/g, '_').substring(0, 30);
        var filename = 'Dispano_' + refSafe + '_' + stampNow() + '.xlsx';
        XLSX.writeFile(wb, filename);
        console.log('[fiche-decoupe] Export Dispano : ' + filename + ' (' + nbInsere + ' pièces)');
      })
      .catch(function(err) {
        alert('Erreur export Dispano :\n' + err.message
            + '\n\nVérifiez que le fichier templates/Dispano.xlsx existe dans votre repo.');
        console.error('[fiche-decoupe]', err);
      });
  }

  // ── Modal de configuration ──────────────────────────────────────
  function ouvrirModal() {
    var items = window._itemsCache || [];
    if (!items.length) { alert('Aucune pièce calculée.\nLancez d\'abord un calcul.'); return; }
    if (document.getElementById('ficheDecoupeOverlay')) return;

    var r = chargerReglages();

    var epDefault = r.epMatiere;
    if (!epDefault && window._meubles && window._meubles[0]) {
      var ep1 = window._meubles[0].epaisseur;
      if (ep1) epDefault = ep1 + 'MM';
    }

    var overlay = document.createElement('div');
    overlay.id = 'ficheDecoupeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;'
      + 'background:rgba(0,0,0,.55);z-index:1000;display:flex;'
      + 'align-items:center;justify-content:center;padding:15px';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:6px;max-width:520px;width:100%;'
      + 'max-height:90vh;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;'
      + 'box-shadow:0 10px 40px rgba(0,0,0,.3)';

    var fournisseur = r.fournisseur || 'aucun';

    modal.innerHTML = ''
      + '<div style="padding:18px 22px;border-bottom:1px solid #eee;background:#5a6c7d;color:#fff;border-radius:6px 6px 0 0">'
      +   '<h3 style="margin:0;font-size:15px;font-weight:600">📋 Fiche de découpe</h3>'
      +   '<p style="margin:4px 0 0;font-size:11px;opacity:.85">' + items.length + ' pièce(s) prêtes à exporter</p>'
      + '</div>'
      + '<div style="padding:20px 22px">'
      +   '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:6px">Fournisseur</label>'
      +   '<select id="fd_fournisseur" style="width:100%;padding:9px;font-size:14px;border:1px solid #ccc;border-radius:4px;margin-bottom:18px">'
      +     '<option value="aucun"' + (fournisseur==='aucun'?' selected':'') + '>Aucun — format générique</option>'
      +     '<option value="dispano"' + (fournisseur==='dispano'?' selected':'') + '>Dispano</option>'
      +   '</select>'
      +   '<div id="fd_zoneDispano" style="display:' + (fournisseur==='dispano'?'block':'none') + '">'
      +     champ('refChantier', 'Référence chantier', r.refChantier || '', 'text')
      +     champ('adresse',     'Adresse de livraison', r.adresse || '', 'textarea')
      +     champ('typeMatiere', 'Type matière', r.typeMatiere || '', 'text', 'ex: Blanc kaolin super standard')
      +     champ('epMatiere',   'Épaisseur matière', epDefault || '', 'text', 'ex: 19MM')
      +     champ('typeChant',   'Type de chant', r.typeChant || 'ABS', 'text')
      +     champ('epChant',     'Épaisseur chant', r.epChant || '1MM', 'text')
      +     '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:6px">Mode</label>'
      +     '<div style="margin-bottom:14px">'
      +       '<label style="margin-right:18px;font-size:13px;cursor:pointer">'
      +         '<input type="radio" name="fd_mode" value="devis"' + ((r.mode||'devis')==='devis'?' checked':'') + '> Devis</label>'
      +       '<label style="font-size:13px;cursor:pointer">'
      +         '<input type="radio" name="fd_mode" value="commande"' + (r.mode==='commande'?' checked':'') + '> Commande</label>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div style="padding:14px 22px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;background:#fafafa;border-radius:0 0 6px 6px">'
      +   '<button id="fd_annuler" style="padding:9px 18px;font-size:12px;background:#fff;border:1px solid #ccc;border-radius:4px;cursor:pointer">Annuler</button>'
      +   '<button id="fd_generer" style="padding:9px 22px;font-size:12px;background:#c9a961;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:1px">Générer</button>'
      + '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('fd_fournisseur').addEventListener('change', function(e) {
      document.getElementById('fd_zoneDispano').style.display = (e.target.value === 'dispano') ? 'block' : 'none';
    });
    document.getElementById('fd_annuler').addEventListener('click', fermerModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) fermerModal(); });
    document.getElementById('fd_generer').addEventListener('click', function() {
      var f = document.getElementById('fd_fournisseur').value;
      if (f === 'aucun') {
        sauverReglages({ fournisseur: 'aucun' });
        fermerModal();
        exportGenerique(window._itemsCache || []);
      } else if (f === 'dispano') {
        var modeEl = document.querySelector('input[name="fd_mode"]:checked');
        var infos = {
          fournisseur: 'dispano',
          refChantier: getVal('fd_refChantier'),
          adresse:     getVal('fd_adresse'),
          typeMatiere: getVal('fd_typeMatiere'),
          epMatiere:   getVal('fd_epMatiere'),
          typeChant:   getVal('fd_typeChant'),
          epChant:     getVal('fd_epChant'),
          mode:        modeEl ? modeEl.value : 'devis'
        };
        sauverReglages(infos);
        fermerModal();
        exportDispano(window._itemsCache || [], infos);
      }
    });
  }

  function getVal(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
  function fermerModal() {
    var ov = document.getElementById('ficheDecoupeOverlay');
    if (ov) ov.parentNode.removeChild(ov);
  }

  function champ(name, label, valeur, type, placeholder) {
    var id = 'fd_' + name;
    var input;
    if (type === 'textarea') {
      input = '<textarea id="' + id + '" rows="2" style="width:100%;padding:9px;font-size:13px;border:1px solid #ccc;border-radius:4px;margin-bottom:14px;font-family:inherit;resize:vertical">'
            + escAttr(valeur) + '</textarea>';
    } else {
      input = '<input id="' + id + '" type="text" value="' + escAttr(valeur) + '" '
            + (placeholder ? 'placeholder="' + escAttr(placeholder) + '" ' : '')
            + 'style="width:100%;padding:9px;font-size:13px;border:1px solid #ccc;border-radius:4px;margin-bottom:14px;font-family:inherit">';
    }
    return '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:6px">'
         + label + '</label>' + input;
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Injection du bouton sticky ──────────────────────────────────
  function injecterBouton() {
    var bar = document.getElementById('stickyBar');
    if (!bar) { setTimeout(injecterBouton, 200); return; }
    if (document.getElementById('btnFicheDecoupe')) return;
    var btn = document.createElement('button');
    btn.id = 'btnFicheDecoupe';
    btn.className = 'sticky-btn';
    btn.style.background = '#5a6c7d';
    btn.style.color      = '#fff';
    btn.textContent      = '📋 Fiche de découpe';
    btn.onclick = function() { chargerSheetJS(ouvrirModal); };
    bar.appendChild(btn);
    console.log('[fiche-decoupe v2] Bouton injecté');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injecterBouton);
  } else {
    injecterBouton();
  }

})();
