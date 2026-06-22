/* ==========================================================================
   PasswordEngine Authentication Module
   Firebase Authentication
   ========================================================================== */

// ── Firebase Configuration ──────────────────────────────────────────────────
// Replace the placeholder values below with your project's config.
// Find them at: Firebase Console → Project Settings → Your apps → SDK setup
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAr2H--5ymgIOfi_bvE5Ndo8544C0kbTsM",
  authDomain: "password-engine.firebaseapp.com",
  projectId: "password-engine",
  storageBucket: "password-engine.firebasestorage.app",
  messagingSenderId: "724596928403",
  appId: "1:724596928403:web:0345c43656ff27993fc266"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ==========================================================================
   Auth Manager
   ========================================================================== */

const AuthManager = {
  _currentUser: null,
};

// Resolves once Firebase reports the initial auth state (null or user).
// Subsequent state changes (token refresh, sign-out, etc.) keep _currentUser updated.
AuthManager.authReady = new Promise(resolve => {
  auth.onAuthStateChanged(user => {
    AuthManager._currentUser = user;
    resolve(user);
  });
});

Object.assign(AuthManager, {

  isAuthenticated() {
    return this._currentUser !== null;
  },

  getUserId() {
    return this._currentUser ? this._currentUser.uid : null;
  },

  getUserDisplayName() {
    if (!this._currentUser) return 'User';
    return this._currentUser.displayName
      || (this._currentUser.email ? this._currentUser.email.split('@')[0] : 'User');
  },

  getUserEmail() {
    return this._currentUser ? (this._currentUser.email || '') : '';
  },

  getUserAvatar() {
    return this._currentUser ? (this._currentUser.photoURL || '') : '';
  },

  async registerWithCredentials(email, password, displayName) {
    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      if (displayName) {
        await credential.user.updateProfile({ displayName });
      }
      this._currentUser = auth.currentUser;
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async loginWithCredentials(email, password) {
    try {
      const credential = await auth.signInWithEmailAndPassword(email, password);
      this._currentUser = credential.user;
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async loginWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await auth.signInWithPopup(provider);
      this._currentUser = result.user;
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async loginWithFacebook() {
    try {
      const provider = new firebase.auth.FacebookAuthProvider();
      const result = await auth.signInWithPopup(provider);
      this._currentUser = result.user;
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async loginWithApple() {
    try {
      const provider = new firebase.auth.OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await auth.signInWithPopup(provider);
      this._currentUser = result.user;
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async sendPasswordReset(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return { success: true };
    } catch (err) {
      return { success: false, error: this._errorMessage(err) };
    }
  },

  async logout() {
    try {
      await auth.signOut();
    } finally {
      this._currentUser = null;
    }
  },

  getVaultStorageKey() {
    const uid = this.getUserId();
    return uid ? 'passwordEngine_vault_' + uid : 'passwordEngine_vault';
  },

  getConfigStorageKey() {
    const uid = this.getUserId();
    return uid ? 'passwordEngine_config_' + uid : 'passwordEngine_config';
  },

  getNotificationStorageKey() {
    const uid = this.getUserId();
    return uid ? 'passwordEngine_notifications_' + uid : 'passwordEngine_notifications';
  },

  _errorMessage(err) {
    switch (err.code) {
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Pop-up was blocked by the browser. Please allow pop-ups for this site.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return err.message || 'Authentication failed. Please try again.';
    }
  },
});