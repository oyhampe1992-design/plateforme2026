/* ================================================================
   THE WOODER - auto-import.js (avec DEBUG)
   ================================================================
   Lit le JSON photo depuis ?photo= de l'URL et importe les meubles
   en utilisant le mapper + generateurs.

   Cette version LOG tout ce que fait le mapper pour chaque element
   afin de diagnostiquer les cas de refus.
   ================================================================ */

(function() {

  function base64UrlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      return decodeURIComponent(atob(s).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      return atob(s);
    }
  }

  function afficherBanniere(msg, couleur) {
    var div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
                        'background:' + (couleur || '#16a34a') + ';color:#fff;' +
                        'padding:12px 20px;border-radius:8px;z-index:9999;' +
                        'font-weight:600;max-width:90%;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(function() { div.style.opacity = '0'; div.style.transition = 'opacity 1s'; }, 8000);
    setTimeout(function() { if (div.parentNode) div.parentNode.removeChild(div); }, 9000);
  }

  function lancerImport() {
    var params = new URLSearchParams(window.location.search);
    var photoB64 = params.get('photo');
    if (!photoB64) return;

    try {
      var photoJson = JSON.parse(base64UrlDecode(photoB64));
      console.log('═══════════════════════════════════════════════════');
      console.log('[auto-import] JSON recu de l\'outil d\'analyse :');
      console.log(photoJson);
      console.log('═══════════════════════════════════════════════════');

      if (typeof mapperJSON !== 'function') {
        console.error('[auto-import] mapperJSON non defini. Le fichier mapper-photo.js n\'est pas charge.');
        afficherBanniere('Erreur : mapper-photo.js non charge', '#dc2626');
        return;
      }

      var plans = mapperJSON(photoJson);

      // LOG DETAILLE pour chaque element
      console.log('[auto-import] Decisions du mapper :');
      for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        var el = photoJson.elements[i];
        console.log('  Element ' + (i + 1) + ' (' + (el.id || '?') + ', ' + el.type + ') :');
        if (p.supported) {
          console.log('    -> SUPPORTE par ' + p.archetype + ' (' + p.generator + ')');
          console.log('    -> L=' + p.L + ' H=' + p.H + ' P=' + p.P);
          console.log('    -> opts =', p.opts);
        } else {
          console.log('    -> REFUSE : ' + p.reason);
          console.log('    -> facade brute :', el.facade);
        }
      }

      // Compter supportes / refuses
      var ok = 0, ko = 0, raisons = [];
      for (var i = 0; i < plans.length; i++) {
        if (plans[i].supported) ok++;
        else { ko++; raisons.push(plans[i].reason); }
      }

      // Importer les supportes
      for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        if (!p.supported) continue;
        var fn = window[p.generator];
        if (typeof fn !== 'function') {
          console.error('[auto-import] Fonction ' + p.generator + ' non trouvee');
          continue;
        }
        if (photoJson.ensemble && photoJson.ensemble.plinthe && !p.opts.typePlinthe) {
          p.opts.typePlinthe = photoJson.ensemble.plinthe.type;
          p.opts.hPlinthe    = photoJson.ensemble.plinthe.hauteur || 100;
        }
        var meuble = fn(p.L, p.H, p.P, p.opts);
        ajouterMeubleGenere(meuble);
      }

      var msg = '✓ ' + ok + ' meuble(s) importe(s)';
      if (ko > 0) {
        msg += ' — ' + ko + ' non supporte(s) : ' + raisons.join(' | ');
        afficherBanniere(msg, '#ea580c');
      } else {
        afficherBanniere(msg, '#16a34a');
      }

      if (typeof lancerCalcul === 'function') {
        setTimeout(function() {
          try { lancerCalcul(); }
          catch (e) { console.error('lancerCalcul auto err:', e); }
        }, 200);
      }

    } catch (e) {
      console.error('[auto-import] Erreur :', e);
      afficherBanniere('Erreur import photo : ' + e.message, '#dc2626');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lancerImport);
  } else {
    lancerImport();
  }
})();
