/* ==========================================================================
   PasswordEngine Authentication Module
   OAuth 2.0 Authorization Code + PKCE with WordPress
   ========================================================================== */

const AuthConfig = {
  // ── WordPress OAuth Server Configuration ──────────────────────────────
  // Update these values after installing WP OAuth Server plugin
  wordpressUrl: 'https://eventregistration.live',
  clientId: 'yTyYckeyacjfXjzSsNMwfsqPGHOqujtM',
  redirectUri: new URL('callback.html', window.location.href).href,

  // ── OAuth Endpoints (WP OAuth Server defaults) ────────────────────────
  get authorizeEndpoint() {
    return this.wordpressUrl + '/oauth/authorize';
  },
  get tokenEndpoint() {
    return this.wordpressUrl + '/oauth/token';
  },
  get userInfoEndpoint() {
    return this.wordpressUrl + '/oauth/me';
  },
  get revokeEndpoint() {
    return this.wordpressUrl + '/oauth/destroy';
  },

  // ── Session Settings ──────────────────────────────────────────────────
  sessionDurationMs: 24 * 60 * 60 * 1000,  // 24 hours default
  storagePrefix: 'passwordEngine_auth_',
};

/* ==========================================================================
   PKCE Helpers (Web Crypto API)
   ========================================================================== */

/**
 * Generate a cryptographically random code verifier string.
 * RFC 7636 recommends 43-128 characters from [A-Z, a-z, 0-9, -, ., _, ~]
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate SHA-256 code challenge from the code verifier.
 * Returns a Base64URL-encoded hash string.
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64URL encode a Uint8Array (no padding, URL-safe).
 */
function base64UrlEncode(buffer) {
  let str = '';
  for (const byte of buffer) {
    str += String.fromCharCode(byte);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a random state parameter for CSRF protection.
 */
function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/* ==========================================================================
   Auth Manager
   ========================================================================== */

const AuthManager = {

  /**
   * Check if the user has a valid (non-expired) session.
   */
  isAuthenticated() {
    const session = this.getSession();
    if (!session) return false;

    // Check expiry
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.clearSession();
      return false;
    }

    return true;
  },

  /**
   * Get the current session data (user info + tokens).
   * Returns null if no session exists.
   */
  getSession() {
    try {
      const raw = localStorage.getItem(AuthConfig.storagePrefix + 'session');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Auth session parse error:', e);
      return null;
    }
  },

  /**
   * Save session data to localStorage with expiry timestamp.
   */
  saveSession(sessionData) {
    const data = {
      ...sessionData,
      expiresAt: Date.now() + AuthConfig.sessionDurationMs,
      savedAt: Date.now(),
    };
    localStorage.setItem(
      AuthConfig.storagePrefix + 'session',
      JSON.stringify(data)
    );
  },

  /**
   * Clear the session from storage.
   */
  clearSession() {
    localStorage.removeItem(AuthConfig.storagePrefix + 'session');
    localStorage.removeItem(AuthConfig.storagePrefix + 'pkce_verifier');
    localStorage.removeItem(AuthConfig.storagePrefix + 'pkce_state');
  },

  /**
   * Get the current user's unique ID for vault scoping.
   * Returns null if not authenticated.
   */
  getUserId() {
    const session = this.getSession();
    if (!session || !session.user) return null;
    return session.user.id || session.user.ID || null;
  },

  /**
   * Get the current user's display name.
   */
  getUserDisplayName() {
    const session = this.getSession();
    if (!session || !session.user) return 'User';
    return session.user.display_name || session.user.user_nicename || session.user.user_login || 'User';
  },

  /**
   * Get the current user's email.
   */
  getUserEmail() {
    const session = this.getSession();
    if (!session || !session.user) return '';
    return session.user.user_email || '';
  },

  /**
   * Get the current user's avatar URL.
   * Falls back to Gravatar via email hash.
   */
  getUserAvatar() {
    const session = this.getSession();
    if (!session || !session.user) return '';

    // If user info includes avatar_urls (WP REST API format)
    if (session.user.avatar_urls) {
      return session.user.avatar_urls['48'] || session.user.avatar_urls['24'] || '';
    }

    // Fallback: generate Gravatar URL from email
    const email = this.getUserEmail();
    if (email) {
      return `https://www.gravatar.com/avatar/?d=mp&s=48`;
    }

    return '';
  },

  /**
   * Authenticate with username and password directly (OAuth password grant).
   * Returns { success: boolean, error?: string }
   */
  async loginWithCredentials(username, password) {
    try {
      const tokenResponse = await fetch(AuthConfig.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username,
          password,
          client_id: AuthConfig.clientId,
          scope: 'openid profile email',
        }).toString(),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        return {
          success: false,
          error: tokenData.error_description || tokenData.error || 'Invalid username or password.',
        };
      }

      // Fetch user info
      const userResponse = await fetch(AuthConfig.userInfoEndpoint, {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });

      let userData = {};
      if (userResponse.ok) {
        userData = await userResponse.json();
      }

      this.saveSession({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenType: tokenData.token_type || 'Bearer',
        user: userData,
      });

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Network error. Please check your connection.' };
    }
  },

  /**
   * Initiate the OAuth authorization code + PKCE flow (used for social SSO buttons).
   * Redirects the browser to the WordPress OAuth authorize page.
   */
  async loginWithRedirect() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const stateParam = generateState();

    localStorage.setItem(AuthConfig.storagePrefix + 'pkce_verifier', codeVerifier);
    localStorage.setItem(AuthConfig.storagePrefix + 'pkce_state', stateParam);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: AuthConfig.clientId,
      redirect_uri: AuthConfig.redirectUri,
      state: stateParam,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: 'openid profile email',
    });

    window.location.href = AuthConfig.authorizeEndpoint + '?' + params.toString();
  },

  /**
   * Handle the OAuth callback.
   * Exchanges the authorization code for tokens and fetches user info.
   * Returns { success: boolean, error?: string }
   */
  async handleCallback(queryString) {
    const params = new URLSearchParams(queryString);
    const code = params.get('code');
    const returnedState = params.get('state');
    const error = params.get('error');
    const errorDesc = params.get('error_description');

    // Check for OAuth errors
    if (error) {
      return {
        success: false,
        error: errorDesc || error || 'Authorization was denied.',
      };
    }

    if (!code) {
      return {
        success: false,
        error: 'No authorization code received.',
      };
    }

    // Validate state parameter (CSRF protection)
    const savedState = localStorage.getItem(AuthConfig.storagePrefix + 'pkce_state');
    if (!savedState || savedState !== returnedState) {
      return {
        success: false,
        error: 'Invalid state parameter. Possible CSRF attack.',
      };
    }

    // Retrieve the code verifier
    const codeVerifier = localStorage.getItem(AuthConfig.storagePrefix + 'pkce_verifier');
    if (!codeVerifier) {
      return {
        success: false,
        error: 'PKCE code verifier not found. Please try logging in again.',
      };
    }

    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch(AuthConfig.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: AuthConfig.redirectUri,
          client_id: AuthConfig.clientId,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error('Token exchange failed:', errBody);
        return {
          success: false,
          error: 'Failed to exchange authorization code. Please try again.',
        };
      }

      const tokenData = await tokenResponse.json();

      // Fetch user info
      const userResponse = await fetch(AuthConfig.userInfoEndpoint, {
        headers: {
          'Authorization': 'Bearer ' + tokenData.access_token,
        },
      });

      let userData = {};
      if (userResponse.ok) {
        userData = await userResponse.json();
      }

      // Save session
      this.saveSession({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenType: tokenData.token_type || 'Bearer',
        user: userData,
      });

      // Cleanup PKCE artifacts
      localStorage.removeItem(AuthConfig.storagePrefix + 'pkce_verifier');
      localStorage.removeItem(AuthConfig.storagePrefix + 'pkce_state');

      return { success: true };

    } catch (err) {
      console.error('Auth callback error:', err);
      return {
        success: false,
        error: 'Network error during authentication. Please check your connection.',
      };
    }
  },

  /**
   * Log out the user. Clears local session and optionally revokes the token.
   */
  async logout() {
    const session = this.getSession();

    // Attempt to revoke token on the server (best-effort, don't block on failure)
    if (session && session.accessToken) {
      try {
        await fetch(AuthConfig.revokeEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + session.accessToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: session.accessToken,
          }).toString(),
        });
      } catch (e) {
        // Silently ignore revocation errors — local cleanup is sufficient
        console.warn('Token revocation failed (non-critical):', e);
      }
    }

    this.clearSession();
  },

  /**
   * Get the per-user storage key prefix for vault data.
   * This ensures each WordPress user has their own isolated vault.
   */
  getVaultStorageKey() {
    const userId = this.getUserId();
    if (userId) {
      return 'passwordEngine_vault_' + userId;
    }
    // Fallback to legacy key if no user ID (shouldn't happen when authenticated)
    return 'passwordEngine_vault';
  },

  /**
   * Get the per-user config storage key.
   */
  getConfigStorageKey() {
    const userId = this.getUserId();
    if (userId) {
      return 'passwordEngine_config_' + userId;
    }
    return 'passwordEngine_config';
  },
};
