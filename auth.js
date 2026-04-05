// auth.js — InspectAI global auth manager
(function() {
  window.auth = {
    getUser: function() {
      const user = localStorage.getItem('inspectai_user');
      return user ? JSON.parse(user) : null;
    },
    signOut: function() {
      localStorage.removeItem('inspectai_user');
      window.location.reload();
    },
    initNav: function() {
      const user = this.getUser();
      const authArea = document.getElementById('authArea');
      if (!authArea) return;

      if (user) {
        authArea.innerHTML = `
          <div class="user-profile">
            <span class="credits-badge">${user.credits || 0} Credits</span>
            <img src="${user.picture}" class="user-avatar" alt="User" />
            <button class="sign-out-btn" onclick="auth.signOut()">Sign Out</button>
          </div>
        `;
      } else {
        // 补上缺失的 Sign In 按钮
        authArea.innerHTML = `<a href="/app" class="btn-nav">Sign In</a>`;
      }
    }
  };
})();
