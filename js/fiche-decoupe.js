/* ================================================================
   THE WOODER — fiche-decoupe.js (v4 — JSZip XML surgical)
   ================================================================
   Module ADDITIF — ne touche à aucun fichier existant.

   Changement v4 vs v3 :
   - L'export Dispano n'utilise plus ExcelJS (qui plantait sur les images
     du template "anchors"). À la place, JSZip (déjà chargé dans calcul.html)
     ouvre le xlsx comme un zip et modifie chirurgicalement les cellules
     directement dans xl/worksheets/sheet1.xml.
   - Résultat : 100% de la mise en forme du template d'origine est préservée
     (images, fusions, polices, bordures, styles, drawings — tout intact).
   - SheetJS reste utilisé pour le format "Aucun" (génération from scratch).

   Installation :
     1. js/fiche-decoupe.js (ce fichier)
     2. calcul.html : <script src="js/fiche-decoupe.js"></script>
     3. templates/Dispano.xlsx (template vide déjà fourni)
   ================================================================ */

(function() {
  'use strict';

  var SHEETJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var STORAGE_KEY  = 'wooder_ficheDecoupe_v2';
  var TEMPLATE_DISPANO = 'templates/Dispano.xlsx';

  // ── localStorage ────────────────────────────────────────────────
  function chargerReglages() {
    try { var s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : {}; }
    catch (e) { return {}; }
  }
  function sauverReglages(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  // ── Chargement dynamique SheetJS (pour export générique uniquement) ──
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
    if (t === 'porte' || t === 'tiroir')   return { L1: 1, L2: 1, l1: 1, l2: 1 };
    if (t === 'plinthe')                   return { L1: 1, L2: 1, l1: 1, l2: 0 };
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
    if (t === 'porte' || t === 'tiroir')   return { Av: 1, Ar: 1, G: 1, D: 1 };
    if (t === 'plinthe')                   return { Av: 1, Ar: 1, G: 1, D: 0 };
    if (t === 'lateral' || t === 'montant' || t === 'panneau' || t === 'etagere')
      return { Av: 1, Ar: 0, G: 0, D: 0 };
    return { Av: 0, Ar: 0, G: 0, D: 0 };
  }

  function typeLisible(t) {
    var m = { porte: 'Porte', tiroir: 'Tiroir', plinthe: 'Plinthe', lateral: 'Latéral',
              montant: 'Montant', panneau: 'Panneau', etagere: 'Étagère', fond: 'Fond',
              traverse: 'Traverse', dos: 'Dos' };
    return m[t] || (t || '—');
  }

  function stampNow() {
    var d = new Date(), pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
         + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function telechargerBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT GÉNÉRIQUE (SheetJS, from scratch)
  // ════════════════════════════════════════════════════════════════
  function exportGenerique(items) {
    chargerSheetJS(function() {
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
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT DISPANO — JSZip + manipulation XML chirurgicale
  // ════════════════════════════════════════════════════════════════

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Remplace une cellule par une valeur string (inline string)
  function setCellString(xml, addr, value) {
    if (value == null || value === '') return xml;
    var safe = escapeXml(value);
    // Pattern : <c r="ADDR" attrs/> ou <c r="ADDR" attrs></c> (cellule vide)
    var re = new RegExp('<c r="' + addr + '"([^>]*?)(?:/>|>\\s*</c>)');
    return xml.replace(re, function(match, attrs) {
      // Retirer t="..." s'il existe (la cellule passe en inlineStr)
      attrs = attrs.replace(/\s*t="[^"]*"/g, '');
      return '<c r="' + addr + '"' + attrs + ' t="inlineStr"><is><t xml:space="preserve">'
           + safe + '</t></is></c>';
    });
  }

  // Remplace une cellule par une valeur numérique
  function setCellNumber(xml, addr, value) {
    if (value == null || value === '') return xml;
    var n = Number(value);
    if (isNaN(n)) return xml;
    var re = new RegExp('<c r="' + addr + '"([^>]*?)(?:/>|>\\s*</c>)');
    return xml.replace(re, function(match, attrs) {
      attrs = attrs.replace(/\s*t="[^"]*"/g, '');
      return '<c r="' + addr + '"' + attrs + '><v>' + n + '</v></c>';
    });
  }

  function exportDispano(items, infos) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip non chargé. Le module doit être utilisé dans calcul.html qui charge JSZip.');
      return;
    }

    fetch(TEMPLATE_DISPANO)
      .then(function(r) {
        if (!r.ok) throw new Error('Template introuvable : ' + TEMPLATE_DISPANO + ' (HTTP ' + r.status + ')');
        return r.arrayBuffer();
      })
      .then(function(buf) {
        return JSZip.loadAsync(buf);
      })
      .then(function(zip) {
        return zip.file('xl/worksheets/sheet1.xml').async('string').then(function(xml) {

          // ── En-tête chantier ──
          xml = setCellString(xml, 'H3',  infos.nom         || 'OYHAMPE PIERRE');
          xml = setCellNumber(xml, 'H5',  infos.tel);
          xml = setCellString(xml, 'H6',  infos.mail);
          xml = setCellString(xml, 'C8',  infos.refChantier);
          xml = setCellString(xml, 'C10', infos.adresse);
          xml = setCellString(xml, 'H9',  infos.typeMatiere);
          xml = setCellString(xml, 'H10', infos.epMatiere);
          xml = setCellString(xml, 'H13', infos.typeChant   || 'ABS');
          xml = setCellString(xml, 'H14', infos.epChant     || '1MM');
          if (infos.mode === 'devis')    xml = setCellString(xml, 'D5', 'X');
          if (infos.mode === 'commande') xml = setCellString(xml, 'D6', 'X');

          // ── Pièces (lignes 19+) ──
          var sorted = items.slice().sort(function(a, b) {
            return (a.meubleIdx || 0) - (b.meubleIdx || 0);
          });
          var MAX_ROWS = 30;
          var nbInsere = Math.min(sorted.length, MAX_ROWS);

          for (var i = 0; i < nbInsere; i++) {
            var row = 19 + i;
            var it  = sorted[i];
            var p   = it.p || {};
            var c   = chantsDispano(it);
            var nom = (window._meubles && window._meubles.length > 1 && it.meuble)
                    ? (it.meuble + ' - ' + (p.designation || ''))
                    : (p.designation || '');

            xml = setCellString(xml, 'C' + row, nom);
            xml = setCellNumber(xml, 'D' + row, p.longueur);
            xml = setCellNumber(xml, 'E' + row, p.largeur);
            xml = setCellNumber(xml, 'F' + row, p.nombre || 1);
            if (c.Av) xml = setCellString(xml, 'G' + row, 'X');
            if (c.Ar) xml = setCellString(xml, 'H' + row, 'X');
            if (c.G)  xml = setCellString(xml, 'I' + row, 'X');
            if (c.D)  xml = setCellString(xml, 'J' + row, 'X');
          }

          if (sorted.length > MAX_ROWS) {
            alert('⚠ ' + (sorted.length - MAX_ROWS) + ' pièce(s) non insérée(s) — limite '
                + MAX_ROWS + ' lignes par feuille Materiau. À ajouter dans Materiau 2/3.');
          }

          // Mix d'épaisseurs
          var eps = {};
          for (var k = 0; k < sorted.length; k++) { if (sorted[k].ep) eps[sorted[k].ep] = true; }
          if (Object.keys(eps).length > 1) {
            console.warn('[fiche-decoupe] Plusieurs épaisseurs : ' + Object.keys(eps).join(', ')
                       + '. Tout dans Materiau 1.');
          }

          // Sauver le XML modifié dans le zip
          zip.file('xl/worksheets/sheet1.xml', xml);

          // Générer le blob xlsx
          return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            compression: 'DEFLATE'
          }).then(function(blob) {
            var refSafe = (infos.refChantier || 'export').replace(/[^A-Za-z0-9_-]/g, '_').substring(0, 30);
            var filename = 'Dispano_' + refSafe + '_' + stampNow() + '.xlsx';
            telechargerBlob(blob, filename);
            console.log('[fiche-decoupe] Export Dispano : ' + filename + ' (' + nbInsere + ' pièces)');
          });
        });
      })
      .catch(function(err) {
        alert('Erreur export Dispano :\n' + err.message
            + '\n\nVérifiez que le fichier templates/Dispano.xlsx existe dans votre repo.');
        console.error('[fiche-decoupe]', err);
      });
  }

  // ════════════════════════════════════════════════════════════════
  //  MODAL DE CONFIGURATION
  // ════════════════════════════════════════════════════════════════
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
      +     '<option value="aucun"'   + (fournisseur==='aucun'   ?' selected':'') + '>Aucun — format générique</option>'
      +     '<option value="dispano"' + (fournisseur==='dispano' ?' selected':'') + '>Dispano</option>'
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
      +         '<input type="radio" name="fd_mode" value="devis"'    + ((r.mode||'devis')==='devis'?' checked':'') + '> Devis</label>'
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
    btn.onclick = ouvrirModal;
    bar.appendChild(btn);
    console.log('[fiche-decoupe v4] Bouton injecté (JSZip mode)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injecterBouton);
  } else {
    injecterBouton();
  }

})();
