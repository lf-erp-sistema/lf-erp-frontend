(function () {
  try {
    var raw = localStorage.getItem('lf_erp_auth') || sessionStorage.getItem('lf_erp_auth');
    var auth = raw ? JSON.parse(raw) : null;
    if (!auth || !auth.user || !auth.user.is_saas_owner) {
      window.location.replace('./index.html');
    }
  } catch (e) {
    window.location.replace('./index.html');
  }
})();
