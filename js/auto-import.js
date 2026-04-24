/* THE WOODER - auto-import.js */
(function() {
  function lirePhotoDepuisURL() {
    var params = new URLSearchParams(window.location.search);
    var b64 = params.get('photo');
    if (!b64) return null;
    try {
      var json = decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))));
      return JSON.parse(json);
    } catch (e) {
      console.error('[auto-import] Erreur decodage photo :', e);
      alert('Erreur : le parametre ?photo= dans l\'URL est invalide.');
      return null;
    }
  }

  function lancerImport(photoJson) {
    console.log('[auto-import] JSON recu :', photoJson);
    if (typeof mapperJSON !== 'function' || typeof ajouterMeubleGenere !== 'function') {
      console.error('[auto-import] Fichiers manquants.');
      return;
    }
    var plans = mapperJSON(photoJson);
    var resume = resumerMappage(plans);
    console.log('[auto-import] Resume :', resume);
    var ok = 0, nonSupportes = [];
    plans.forEach(function(p) {
      if (p.supported) {
        var meuble = window[p.generator](p.L, p.H, p.P, p.opts);
        ajouterMeubleGenere(meuble);
        ok++;
      } else {
        nonSupportes.push(p.reason);
      }
    });
    afficherBanniere(ok, nonSupportes);
  }

  function afficherBanniere(ok, nonSupportes) {
    var div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;padding:10px 16px;background:#2D5A3D;color:#fff;font-family:sans-serif;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.15);';
    var msg = '✓ ' + ok + ' meuble(s) importe(s)';
    if (nonSupportes.length > 0) {
      msg += ' — ' + nonSupportes.length + ' non supporte(s) : ' + nonSupportes.join(' | ');
    }
    div.innerHTML = msg + ' <button onclick="this.parentNode.remove()" style="margin-left:12px;background:rgba(255,255,255,.2);border:none;color:#fff;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px">✕</button>';
    document.body.appendChild(div);
    document.body.style.paddingTop = '50px';
    if (nonSupportes.length > 0) {
      console.warn('[auto-import] Non supportes :', nonSupportes);
    }
  }

  function demarrer() {
    var photoJson = lirePhotoDepuisURL();
    if (!photoJson) return;
    setTimeout(function() { lancerImport(photoJson); }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})();
