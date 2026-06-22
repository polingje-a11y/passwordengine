/* ==========================================================================
   PasswordEngine Push Notifications Module
   Handles permission, FCM token, and local notification triggers.
   ========================================================================== */

// ── VAPID Key ────────────────────────────────────────────────────────────────
// Replace with your own VAPID key from Firebase Console →
// Project Settings → Cloud Messaging → Web Push certificates → Key pair
const VAPID_KEY = 'BGTHqBG7QchBd3Ag66Ervfi4mv42_m3K5h716m2jX7D2-uaBuWxEI0FCBk5MBeXc0hxICI20m_9d0OANUymmkP4';

const NotificationManager = {
  _permission: 'default', // 'default' | 'granted' | 'denied'
  _fcmToken: null,
  _swRegistration: null,
  _checkInterval: null,

  // Default preferences
  _prefs: {
    enabled: false,
    passwordReminders: true,
    reminderDays: 90,
    vaultLockNotify: true,
  },

  /* ========================================================================
     Initialisation
     ======================================================================== */

  /**
   * Initialise notification support. Should be called after auth is ready
   * and the service worker is registered.
   */
  async init() {
    // Check baseline support
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[Notifications] Push notifications are not supported in this browser.');
      return;
    }

    this._permission = Notification.permission;
    this.loadPrefs();

    // Get existing service worker registration
    try {
      this._swRegistration = await navigator.serviceWorker.ready;
    } catch (err) {
      console.warn('[Notifications] Service worker not available:', err);
    }

    // If user previously enabled notifications and we have permission, set up FCM
    if (this._prefs.enabled && this._permission === 'granted') {
      await this._setupFCM();
      this._startPasswordAgeChecks();
    }
  },

  /* ========================================================================
     Permission Flow
     ======================================================================== */

  /**
   * Returns current permission state.
   */
  getPermission() {
    return this._permission;
  },

  /**
   * Returns true if notifications are fully enabled (permission granted + user toggle on).
   */
  isEnabled() {
    return this._prefs.enabled && this._permission === 'granted';
  },

  /**
   * Returns true if the browser supports push notifications.
   */
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  },

  /**
   * Request notification permission from the user.
   * Returns 'granted', 'denied', or 'default'.
   */
  async requestPermission() {
    if (!this.isSupported()) return 'denied';

    try {
      const result = await Notification.requestPermission();
      this._permission = result;

      if (result === 'granted') {
        this._prefs.enabled = true;
        this.savePrefs();
        await this._setupFCM();
        this._startPasswordAgeChecks();

        // Show a welcome notification
        this._showLocalNotification(
          'Notifications Enabled 🔔',
          'You\'ll receive security reminders for your passwords.',
          'welcome'
        );
      }

      return result;
    } catch (err) {
      console.error('[Notifications] Permission request failed:', err);
      return 'denied';
    }
  },

  /**
   * Disable notifications (user toggled off).
   */
  disable() {
    this._prefs.enabled = false;
    this.savePrefs();
    this._stopPasswordAgeChecks();
  },

  /**
   * Enable notifications (user toggled on, permission already granted).
   */
  async enable() {
    if (this._permission !== 'granted') {
      return await this.requestPermission();
    }

    this._prefs.enabled = true;
    this.savePrefs();
    await this._setupFCM();
    this._startPasswordAgeChecks();
    return 'granted';
  },

  /* ========================================================================
     FCM Token Management
     ======================================================================== */

  async _setupFCM() {
    if (!this._swRegistration) return;
    if (VAPID_KEY === 'YOUR_VAPID_KEY_HERE') {
      console.info(
        '[Notifications] VAPID key not configured. Push from server will not work, ' +
        'but local notifications will function normally.'
      );
      return;
    }

    try {
      // Check if firebase.messaging is available
      if (typeof firebase !== 'undefined' && firebase.messaging) {
        const messaging = firebase.messaging();
        messaging.useServiceWorker(this._swRegistration);

        const token = await messaging.getToken({ vapidKey: VAPID_KEY });
        this._fcmToken = token;
        console.log('[Notifications] FCM token obtained:', token.substring(0, 20) + '…');

        // Listen for token refresh
        messaging.onTokenRefresh(async () => {
          const newToken = await messaging.getToken({ vapidKey: VAPID_KEY });
          this._fcmToken = newToken;
          console.log('[Notifications] FCM token refreshed');
        });

        // Handle foreground messages
        messaging.onMessage((payload) => {
          console.log('[Notifications] Foreground message:', payload);
          const { title, body, tag } = payload.notification || {};
          if (title) {
            this._showLocalNotification(title, body || '', tag || 'fcm-message');
          }
        });
      }
    } catch (err) {
      console.warn('[Notifications] FCM setup skipped:', err.message);
    }
  },

  /**
   * Returns the current FCM device token (null if not registered).
   */
  getFCMToken() {
    return this._fcmToken;
  },

  /* ========================================================================
     Local Notification Triggers
     ======================================================================== */

  /**
   * Show a local notification through the service worker.
   */
  async _showLocalNotification(title, body, tag) {
    if (!this._swRegistration || this._permission !== 'granted') return;

    try {
      await this._swRegistration.showNotification(title, {
        body,
        tag,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [100, 50, 100],
        data: {
          url: self.location ? self.location.origin : '/',
          timestamp: Date.now(),
        },
        actions: [
          { action: 'open', title: 'Open App' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });
    } catch (err) {
      console.error('[Notifications] Failed to show notification:', err);
    }
  },

  /**
   * Check vault credentials for passwords that are due for rotation.
   * @param {Array} vault — the decrypted vault credentials array
   */
  checkPasswordAge(vault) {
    if (!this._prefs.enabled || !this._prefs.passwordReminders) return;
    if (!vault || vault.length === 0) return;

    const now = Date.now();
    const thresholdMs = this._prefs.reminderDays * 24 * 60 * 60 * 1000;
    const staleCredentials = [];

    vault.forEach(cred => {
      const age = now - (cred.created || now);
      if (age >= thresholdMs) {
        staleCredentials.push(cred.title);
      }
    });

    if (staleCredentials.length > 0) {
      const count = staleCredentials.length;
      const names = staleCredentials.slice(0, 3).join(', ');
      const suffix = count > 3 ? ` and ${count - 3} more` : '';

      this._showLocalNotification(
        `🔑 Password Refresh Recommended`,
        `${names}${suffix} — ${count === 1 ? 'this password hasn\'t' : 'these passwords haven\'t'} been updated in over ${this._prefs.reminderDays} days.`,
        'password-age-reminder'
      );
    }
  },

  /**
   * Notify that the vault was auto-locked.
   */
  notifyVaultLocked() {
    if (!this._prefs.enabled || !this._prefs.vaultLockNotify) return;

    this._showLocalNotification(
      '🔒 Vault Locked',
      'Your vault has been automatically locked for security.',
      'vault-auto-lock'
    );
  },

  /* ========================================================================
     Periodic Password Age Checks
     ======================================================================== */

  _startPasswordAgeChecks() {
    this._stopPasswordAgeChecks();

    // Check every 6 hours (only fires if app is open)
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    this._checkInterval = setInterval(() => {
      // We'll trigger a check via the app's current vault state
      if (typeof state !== 'undefined' && !state.isVaultLocked && state.vault) {
        this.checkPasswordAge(state.vault);
      }
    }, SIX_HOURS);
  },

  _stopPasswordAgeChecks() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  },

  /* ========================================================================
     Preference Persistence (per-user scoped via AuthManager)
     ======================================================================== */

  savePrefs() {
    const key = (typeof AuthManager !== 'undefined' && AuthManager.isAuthenticated())
      ? AuthManager.getNotificationStorageKey()
      : 'passwordEngine_notifications';

    localStorage.setItem(key, JSON.stringify(this._prefs));
  },

  loadPrefs() {
    const key = (typeof AuthManager !== 'undefined' && AuthManager.isAuthenticated())
      ? AuthManager.getNotificationStorageKey()
      : 'passwordEngine_notifications';

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        this._prefs = { ...this._prefs, ...saved };
      } catch (e) {
        console.error('[Notifications] Prefs parse error:', e);
      }
    }
  },

  /**
   * Returns a copy of current preferences.
   */
  getPrefs() {
    return { ...this._prefs };
  },

  /**
   * Update a single preference and save.
   */
  setPref(key, value) {
    if (key in this._prefs) {
      this._prefs[key] = value;
      this.savePrefs();
    }
  },

  /**
   * Cleanup on sign-out.
   */
  cleanup() {
    this._stopPasswordAgeChecks();
    this._fcmToken = null;
    this._prefs = {
      enabled: false,
      passwordReminders: true,
      reminderDays: 90,
      vaultLockNotify: true,
    };
  },
};
