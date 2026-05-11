/* ================================================================
   THE WOODER — fiche-decoupe.js (v9 — coordonnées modulables)
   ================================================================
   Module ADDITIF — ne touche à aucun fichier existant.

   Changements v9 vs v8 :
   - Ajout d'une section "Mes coordonnées" dans le modal :
     Société, Nom/Prénom, Téléphone, Email — persistés en
     localStorage, donc à remplir une fois puis pré-remplis ensuite.
   - Bouney : Y8 (Société) est maintenant rempli depuis le modal
     (n'est plus codé en dur dans le template).
   - Dispano : H3 (Nom) rempli depuis le modal aussi.

   Installation :
     1. js/fiche-decoupe.js (ce fichier)
     2. calcul.html : <script src="js/fiche-decoupe.js"></script>
     3. templates/Dispano.xlsx (déjà uploadé)
     4. templates/Bouney.xlsx (à remplacer par la nouvelle version
        où "Menuiserie Oyhampe" n'est plus en dur)
   ================================================================ */

(function() {
  'use strict';

  var SHEETJS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var STORAGE_KEY    = 'wooder_ficheDecoupe_v2';
  var TEMPLATE_DISPANO = 'templates/Dispano.xlsx';
  var TEMPLATE_BOUNEY  = 'templates/Bouney.xlsx';

  function chargerReglages() {
    try { var s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : {}; }
    catch (e) { return {}; }
  }
  function sauverReglages(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function chargerSheetJS(cb) {
    if (typeof XLSX !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = function() { cb(); };
    s.onerror = function() { alert('Impossible de charger SheetJS depuis le CDN.'); };
    document.head.appendChild(s);
  }

  function coteLargeurInterieureEtagere(pc) {
    var profE = window._profEtag;
    if (profE == null) return 'L';
    var TOL = 1;
    var lonEstProf = Math.abs(Number(pc.longueur) - profE) <= TOL;
    var larEstProf = Math.abs(Number(pc.largeur)  - profE) <= TOL;
    if (lonEstProf && !larEstProf) return 'l';
    return 'L';
  }

  function estFondTiroir(pc) {
    return (pc.designation || '').toLowerCase().indexOf('fond') !== -1;
  }

  function chantsCotes(pc) {
    var t = pc.type;
    if (t === 'porte' || t === 'tiroir')   return { L1: 1, L2: 1, l1: 1, l2: 1 };
    if (t === 'plinthe')                    return { L1: 1, L2: 1, l1: 1, l2: 0 };
    if (t === 'etagere') {
      var cote = coteLargeurInterieureEtagere(pc);
      return (cote === 'l')
        ? { L1: 0, L2: 0, l1: 1, l2: 0 }
        : { L1: 1, L2: 0, l1: 0, l2: 0 };
    }
    if (t === 'tiroir_piece') {
      if (estFondTiroir(pc)) return { L1: 0, L2: 0, l1: 0, l2: 0 };
      return { L1: 1, L2: 0, l1: 0, l2: 0 };
    }
    if (t === 'lateral' || t === 'montant' || t === 'panneau')
      return { L1: 1, L2: 0, l1: 0, l2: 0 };
    return { L1: 0, L2: 0, l1: 0, l2: 0 };
  }

  function typeLisible(t) {
    var m = { porte: 'Porte', tiroir: 'Tiroir', tiroir_piece: 'Pièce tiroir',
              plinthe: 'Plinthe', lateral: 'Latéral', montant: 'Montant',
              panneau: 'Panneau', etagere: 'Étagère', fond: 'Fond',
              fond_calc: 'Fond calculé', traverse: 'Traverse', dos: 'Dos' };
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

  function parseEp(s) {
    if (!s) return null;
    var m = String(s).match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function parseMateriau(s) {
    if (!s) return { nom: '', ep: null };
    var m = String(s).match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*mm\s*$/i);
    if (m) return { nom: m[1].trim(), ep: parseFloat(m[2]) };
    return { nom: String(s).trim(), ep: null };
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT GÉNÉRIQUE
  // ════════════════════════════════════════════════════════════════
  function exportGenerique(pieces) {
    chargerSheetJS(function() {
      var rows = [['Désignation','Type','L (mm)','l (mm)','Ép. (mm)','Qté','Matière',
                   'Chant L1','Chant L2','Chant l1','Chant l2']];
      for (var i = 0; i < pieces.length; i++) {
        var pc = pieces[i], c = chantsCotes(pc);
        rows.push([
          pc.designation || '', typeLisible(pc.type),
          Number(pc.longueur) || '', Number(pc.largeur) || '',
          pc.epaisseur || '', Number(pc.nombre) || 1,
          pc.materiau || '',
          c.L1 ? 'X' : '', c.L2 ? 'X' : '', c.l1 ? 'X' : '', c.l2 ? 'X' : ''
        ]);
      }
      var ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{wch:30},{wch:14},{wch:10},{wch:10},{wch:10},{wch:6},{wch:30},
                     {wch:9},{wch:9},{wch:9},{wch:9}];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fiche de découpe');
      XLSX.writeFile(wb, 'fiche-decoupe_' + stampNow() + '.xlsx');
    });
  }

  // ── Helpers XML ─────────────────────────────────────────────────
  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function setCellString(xml, addr, value) {
    if (value == null || value === '') return xml;
    var safe = escapeXml(value);
    var re = new RegExp('<c r="' + addr + '"([^>]*?)(?:/>|>\\s*</c>)');
    return xml.replace(re, function(match, attrs) {
      attrs = attrs.replace(/\s*t="[^"]*"/g, '');
      return '<c r="' + addr + '"' + attrs + ' t="inlineStr"><is><t xml:space="preserve">'
           + safe + '</t></is></c>';
    });
  }

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

  function filtrerPiecesPourFournisseur(piecesAll, epCible) {
    var pieces = [], excluFondCalc = [], excluEpaisseur = [];
    for (var i = 0; i < piecesAll.length; i++) {
      var p = piecesAll[i];
      if (p.type === 'fond_calc') { excluFondCalc.push(p); continue; }
      if (epCible != null && Number(p.epaisseur) !== epCible) {
        excluEpaisseur.push(p); continue;
      }
      pieces.push(p);
    }
    return { pieces: pieces, excluFondCalc: excluFondCalc, excluEpaisseur: excluEpaisseur };
  }

  function construireAlertes(pieces, excluFondCalc, excluEpaisseur, maxRows) {
    var alerts = [];
    if (pieces.length > maxRows) {
      alerts.push((pieces.length - maxRows) + ' pièce(s) non insérée(s) (limite '
                + maxRows + ' par feuille)');
    }
    if (excluFondCalc.length) {
      var nbF = 0;
      for (var f = 0; f < excluFondCalc.length; f++) nbF += excluFondCalc[f].nombre;
      alerts.push(excluFondCalc.length + ' fond(s) calculé(s) exclu(s) (' + nbF + 'u, matériau différent)'
                + ' : à commander séparément');
    }
    if (excluEpaisseur.length) {
      var grpEp = {};
      for (var ex = 0; ex < excluEpaisseur.length; ex++) {
        var e = excluEpaisseur[ex].epaisseur;
        grpEp[e] = (grpEp[e] || 0) + excluEpaisseur[ex].nombre;
      }
      var listEp = [];
      for (var ke in grpEp) listEp.push(grpEp[ke] + 'u en ' + ke + 'mm');
      alerts.push(excluEpaisseur.length + ' pièce(s) en autre(s) épaisseur(s) : ' + listEp.join(', '));
    }
    return alerts;
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT DISPANO
  // ════════════════════════════════════════════════════════════════
  function exportDispano(piecesAll, infos) {
    if (typeof JSZip === 'undefined') { alert('JSZip non chargé.'); return; }

    var epCible = parseEp(infos.epMatiere);
    var f = filtrerPiecesPourFournisseur(piecesAll, epCible);
    var pieces = f.pieces;

    if (!pieces.length) {
      alert('Aucune pièce ne correspond aux critères.');
      return;
    }

    fetch(TEMPLATE_DISPANO)
      .then(function(r) {
        if (!r.ok) throw new Error('Template introuvable : ' + TEMPLATE_DISPANO + ' (HTTP ' + r.status + ')');
        return r.arrayBuffer();
      })
      .then(function(buf) { return JSZip.loadAsync(buf); })
      .then(function(zip) {
        return zip.file('xl/worksheets/sheet1.xml').async('string').then(function(xml) {

          xml = setCellString(xml, 'H3',  infos.nom);
          xml = setCellString(xml, 'H4',  infos.societe);
          xml = setCellNumber(xml, 'H5',  infos.tel);
          xml = setCellString(xml, 'H6',  infos.mail);
          xml = setCellString(xml, 'C8',  infos.refChantier);
          xml = setCellString(xml, 'C10', infos.adresse);
          xml = setCellString(xml, 'H9',  infos.typeMatiere);
          xml = setCellString(xml, 'H10', infos.epMatiere);
          xml = setCellString(xml, 'H13', infos.typeChant || 'ABS');
          xml = setCellString(xml, 'H14', infos.epChant   || '1MM');
          if (infos.mode === 'devis')    xml = setCellString(xml, 'D5', 'X');
          if (infos.mode === 'commande') xml = setCellString(xml, 'D6', 'X');

          var MAX_ROWS = 30;
          var nbInsere = Math.min(pieces.length, MAX_ROWS);
          var stats = { etagereInversee: 0 };

          for (var i = 0; i < nbInsere; i++) {
            var row = 19 + i, pc = pieces[i], c = chantsCotes(pc);
            if (pc.type === 'etagere' && c.l1) stats.etagereInversee++;

            xml = setCellString(xml, 'C' + row, pc.designation || '');
            xml = setCellNumber(xml, 'D' + row, pc.longueur);
            xml = setCellNumber(xml, 'E' + row, pc.largeur);
            xml = setCellNumber(xml, 'F' + row, pc.nombre || 1);
            if (c.L1) xml = setCellString(xml, 'G' + row, 'X');
            if (c.L2) xml = setCellString(xml, 'H' + row, 'X');
            if (c.l1) xml = setCellString(xml, 'I' + row, 'X');
            if (c.l2) xml = setCellString(xml, 'J' + row, 'X');
          }

          zip.file('xl/worksheets/sheet1.xml', xml);
          var alerts = construireAlertes(pieces, f.excluFondCalc, f.excluEpaisseur, MAX_ROWS);

          return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            compression: 'DEFLATE'
          }).then(function(blob) {
            var refSafe = (infos.refChantier || 'export').replace(/[^A-Za-z0-9_-]/g, '_').substring(0, 30);
            var epTag = epCible != null ? ('_' + epCible + 'mm') : '';
            var filename = 'Dispano_' + refSafe + epTag + '_' + stampNow() + '.xlsx';
            telechargerBlob(blob, filename);
            console.log('[fiche-decoupe v9] Export Dispano : ' + filename
                      + ' (' + nbInsere + ' pièces, ' + stats.etagereInversee + ' étagère(s) inversée(s))');
            if (alerts.length) alert('⚠ ' + alerts.join('\n\n'));
          });
        });
      })
      .catch(function(err) {
        alert('Erreur export Dispano :\n' + err.message);
        console.error('[fiche-decoupe]', err);
      });
  }

  // ════════════════════════════════════════════════════════════════
  //  EXPORT BOUNEY
  // ════════════════════════════════════════════════════════════════
  function exportBouney(piecesAll, infos) {
    if (typeof JSZip === 'undefined') { alert('JSZip non chargé.'); return; }

    var epCible = parseEp(infos.epMatiere);
    var f = filtrerPiecesPourFournisseur(piecesAll, epCible);
    var pieces = f.pieces;

    if (!pieces.length) {
      alert('Aucune pièce ne correspond aux critères.');
      return;
    }

    // Bouney combine matière + épaisseur dans N17
    var refMateriau = '';
    if (infos.typeMatiere || infos.epMatiere) {
      refMateriau = (infos.typeMatiere || '').trim();
      if (infos.epMatiere) {
        var ep = parseEp(infos.epMatiere);
        if (ep != null) refMateriau += (refMateriau ? ' ' : '') + ep + 'mm';
        else            refMateriau += (refMateriau ? ' ' : '') + infos.epMatiere;
      }
    }

    fetch(TEMPLATE_BOUNEY)
      .then(function(r) {
        if (!r.ok) throw new Error('Template introuvable : ' + TEMPLATE_BOUNEY + ' (HTTP ' + r.status + ')');
        return r.arrayBuffer();
      })
      .then(function(buf) { return JSZip.loadAsync(buf); })
      .then(function(zip) {
        return zip.file('xl/worksheets/sheet1.xml').async('string').then(function(xml) {

          xml = setCellString(xml, 'Y8',   infos.societe);
          xml = setCellString(xml, 'Y9',   infos.nom);
          xml = setCellNumber(xml, 'Y10',  infos.tel);
          xml = setCellString(xml, 'Y11',  infos.mail);
          xml = setCellString(xml, 'AU9',  infos.adresse);
          xml = setCellString(xml, 'AU11', infos.refChantier);
          xml = setCellString(xml, 'N17',  refMateriau);
          xml = setCellString(xml, 'N18',  infos.typeChant || 'ABS');

          var MAX_ROWS = 63;
          var nbInsere = Math.min(pieces.length, MAX_ROWS);
          var stats = { etagereInversee: 0 };

          for (var i = 0; i < nbInsere; i++) {
            var row = 27 + i, pc = pieces[i], c = chantsCotes(pc);
            if (pc.type === 'etagere' && c.l1) stats.etagereInversee++;

            xml = setCellString(xml, 'B'  + row, pc.designation || '');
            xml = setCellNumber(xml, 'O'  + row, pc.longueur);
            xml = setCellNumber(xml, 'T'  + row, pc.largeur);
            xml = setCellNumber(xml, 'Y'  + row, pc.nombre || 1);
            if (c.L1) xml = setCellString(xml, 'AB' + row, 'X');
            if (c.L2) xml = setCellString(xml, 'AF' + row, 'X');
            if (c.l1) xml = setCellString(xml, 'AJ' + row, 'X');
            if (c.l2) xml = setCellString(xml, 'AN' + row, 'X');
          }

          zip.file('xl/worksheets/sheet1.xml', xml);
          var alerts = construireAlertes(pieces, f.excluFondCalc, f.excluEpaisseur, MAX_ROWS);

          return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            compression: 'DEFLATE'
          }).then(function(blob) {
            var refSafe = (infos.refChantier || 'export').replace(/[^A-Za-z0-9_-]/g, '_').substring(0, 30);
            var epTag = epCible != null ? ('_' + epCible + 'mm') : '';
            var filename = 'Bouney_' + refSafe + epTag + '_' + stampNow() + '.xlsx';
            telechargerBlob(blob, filename);
            console.log('[fiche-decoupe v9] Export Bouney : ' + filename
                      + ' (' + nbInsere + ' pièces, ' + stats.etagereInversee + ' étagère(s) inversée(s))');
            if (alerts.length) alert('⚠ ' + alerts.join('\n\n'));
          });
        });
      })
      .catch(function(err) {
        alert('Erreur export Bouney :\n' + err.message);
        console.error('[fiche-decoupe]', err);
      });
  }

  // ════════════════════════════════════════════════════════════════
  //  MODAL
  // ════════════════════════════════════════════════════════════════
  function ouvrirModal() {
    var pieces = window._cutlistPieces || [];
    if (!pieces.length) {
      alert('Aucune pièce dans la feuille de débit.\nLancez d\'abord un calcul.');
      return;
    }
    if (document.getElementById('ficheDecoupeOverlay')) return;

    var r = chargerReglages();

    var pcRef = null;
    for (var pi = 0; pi < pieces.length; pi++) {
      if (pieces[pi].type !== 'fond_calc') { pcRef = pieces[pi]; break; }
    }
    var matInfo = parseMateriau(pcRef ? pcRef.materiau : pieces[0].materiau);
    var typeMatDefault = r.typeMatiere || matInfo.nom || '';
    var epMatDefault   = r.epMatiere || (matInfo.ep ? (matInfo.ep + 'MM') : '');

    var epsPresentes = {};
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].type === 'fond_calc') continue;
      var ep = pieces[i].epaisseur;
      epsPresentes[ep] = (epsPresentes[ep] || 0) + pieces[i].nombre;
    }
    var recapEp = [];
    for (var k in epsPresentes) recapEp.push(epsPresentes[k] + 'u en ' + k + 'mm');

    var overlay = document.createElement('div');
    overlay.id = 'ficheDecoupeOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;'
      + 'background:rgba(0,0,0,.55);z-index:1000;display:flex;'
      + 'align-items:center;justify-content:center;padding:15px';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:6px;max-width:540px;width:100%;'
      + 'max-height:90vh;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;'
      + 'box-shadow:0 10px 40px rgba(0,0,0,.3)';

    var fournisseur = r.fournisseur || 'aucun';
    var afficheFourn = (fournisseur === 'dispano' || fournisseur === 'bouney') ? 'block' : 'none';
    var afficheDispano = (fournisseur === 'dispano') ? 'block' : 'none';
    var afficheSociete = (fournisseur === 'dispano' || fournisseur === 'bouney') ? 'block' : 'none';

    // Mini-séparateur entre sections du modal
    var sep = '<hr style="margin:4px 0 16px 0;border:none;border-top:1px solid #eee">';
    var titreSection = function(t) {
      return '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#999;font-weight:600;margin-bottom:10px">'
           + t + '</div>';
    };

    modal.innerHTML = ''
      + '<div style="padding:18px 22px;border-bottom:1px solid #eee;background:#5a6c7d;color:#fff;border-radius:6px 6px 0 0">'
      +   '<h3 style="margin:0;font-size:15px;font-weight:600">📋 Fiche de découpe</h3>'
      +   '<p style="margin:4px 0 0;font-size:11px;opacity:.85">Pièces (hors fonds calculés) : '
      +     recapEp.join(' · ') + '</p>'
      + '</div>'
      + '<div style="padding:20px 22px">'

      // Fournisseur
      +   '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:6px">Fournisseur</label>'
      +   '<select id="fd_fournisseur" style="width:100%;padding:9px;font-size:14px;border:1px solid #ccc;border-radius:4px;margin-bottom:18px">'
      +     '<option value="aucun"'   + (fournisseur==='aucun'   ?' selected':'') + '>Aucun — format générique</option>'
      +     '<option value="dispano"' + (fournisseur==='dispano' ?' selected':'') + '>Dispano</option>'
      +     '<option value="bouney"'  + (fournisseur==='bouney'  ?' selected':'') + '>Bouney</option>'
      +   '</select>'

      // Toute la zone fournisseur (Dispano + Bouney)
      +   '<div id="fd_zoneFourn" style="display:' + afficheFourn + '">'

      // ── Section "Mes coordonnées" ──
      +     titreSection('Mes coordonnées')
      +     '<div id="fd_zoneSociete" style="display:' + afficheSociete + '">'
      +       champ('societe', 'Société', r.societe || '', 'text', 'ex: Menuiserie Oyhampe')
      +     '</div>'
      +     champ('nom',  'Nom / Prénom', r.nom  || '', 'text', 'ex: Pierre Oyhampe')
      +     champ('tel',  'Téléphone',    r.tel  || '', 'text', 'ex: 0673933607')
      +     champ('mail', 'Email',        r.mail || '', 'text', 'ex: contact@email.com')
      +     sep

      // ── Section Chantier ──
      +     titreSection('Chantier')
      +     champ('refChantier', 'Référence chantier', r.refChantier || '', 'text')
      +     champ('adresse',     'Adresse de livraison', r.adresse || '', 'textarea')
      +     sep

      // ── Section Matière ──
      +     titreSection('Matière')
      +     champ('typeMatiere', 'Type matière', typeMatDefault, 'text', 'ex: Mélaminé blanc')
      +     champ('epMatiere',   'Épaisseur matière (filtre)', epMatDefault, 'text', 'ex: 19MM')
      +     '<p style="font-size:10px;color:#888;margin:-10px 0 14px 0">Seules les pièces de cette épaisseur sont exportées. Fonds calculés exclus.</p>'
      +     sep

      // ── Section Chant ──
      +     titreSection('Chant')
      +     champ('typeChant', 'Type de chant', r.typeChant || 'ABS', 'text')
      +     '<div id="fd_zoneEpChant" style="display:' + afficheDispano + '">'
      +       champ('epChant', 'Épaisseur chant', r.epChant || '1MM', 'text')
      +     '</div>'

      // ── Mode (Dispano only) ──
      +     '<div id="fd_zoneModeDevis" style="display:' + afficheDispano + '">'
      +       sep
      +       titreSection('Mode')
      +       '<div style="margin-bottom:14px">'
      +         '<label style="margin-right:18px;font-size:13px;cursor:pointer">'
      +           '<input type="radio" name="fd_mode" value="devis"'    + ((r.mode||'devis')==='devis'?' checked':'') + '> Devis</label>'
      +         '<label style="font-size:13px;cursor:pointer">'
      +           '<input type="radio" name="fd_mode" value="commande"' + (r.mode==='commande'?' checked':'') + '> Commande</label>'
      +       '</div>'
      +     '</div>'

      +   '</div>'
      + '</div>'

      // Footer
      + '<div style="padding:14px 22px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;background:#fafafa;border-radius:0 0 6px 6px">'
      +   '<button id="fd_annuler" style="padding:9px 18px;font-size:12px;background:#fff;border:1px solid #ccc;border-radius:4px;cursor:pointer">Annuler</button>'
      +   '<button id="fd_generer" style="padding:9px 22px;font-size:12px;background:#c9a961;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;text-transform:uppercase;letter-spacing:1px">Générer</button>'
      + '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('fd_fournisseur').addEventListener('change', function(e) {
      var v = e.target.value;
      document.getElementById('fd_zoneFourn').style.display    = (v === 'dispano' || v === 'bouney') ? 'block' : 'none';
      document.getElementById('fd_zoneSociete').style.display  = (v === 'dispano' || v === 'bouney') ? 'block' : 'none';
      document.getElementById('fd_zoneEpChant').style.display  = (v === 'dispano') ? 'block' : 'none';
      document.getElementById('fd_zoneModeDevis').style.display = (v === 'dispano') ? 'block' : 'none';
    });

    document.getElementById('fd_annuler').addEventListener('click', fermerModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) fermerModal(); });
    document.getElementById('fd_generer').addEventListener('click', function() {
      var fr = document.getElementById('fd_fournisseur').value;
      if (fr === 'aucun') {
        sauverReglages({ fournisseur: 'aucun' });
        fermerModal();
        exportGenerique(window._cutlistPieces || []);
        return;
      }
      var modeEl = document.querySelector('input[name="fd_mode"]:checked');
      var infos = {
        fournisseur: fr,
        societe:     getVal('fd_societe'),
        nom:         getVal('fd_nom'),
        tel:         getVal('fd_tel'),
        mail:        getVal('fd_mail'),
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
      if (fr === 'dispano') exportDispano(window._cutlistPieces || [], infos);
      else if (fr === 'bouney') exportBouney(window._cutlistPieces || [], infos);
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
    console.log('[fiche-decoupe v10] Bouton injecté (Société aussi en Dispano)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injecterBouton);
  } else {
    injecterBouton();
  }

})();
