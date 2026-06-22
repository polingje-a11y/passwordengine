/* ==========================================================================
   PasswordEngine Announcements Module
   Fetches and displays announcements from Firebase Firestore.
   ========================================================================== */

const AnnouncementsManager = {
  _announcements: [],
  _isLoading: false,
  _hasLoaded: false,

  // Built-in fallback announcement (shown when Firestore is unreachable or empty)
  _fallbackAnnouncement: {
    id: 'welcome-announcement',
    title: 'Welcome to Announcements!',
    body: 'PasswordEngine now has an Announcements page! Stay up to date with the latest features, security updates, and important notices — all right here. Check back often for news about your favorite password manager.',
    category: 'feature',
    date: new Date('2026-06-22T12:00:00Z'),
    pinned: true,
  },

  /* ========================================================================
     Initialisation
     ======================================================================== */

  /**
   * Initialise the announcements module. Loads announcements from Firestore.
   */
  async init() {
    if (this._hasLoaded || this._isLoading) return;
    await this.loadAnnouncements();
  },

  /**
   * Reset state on sign-out so the next user gets fresh data.
   */
  reset() {
    this._announcements = [];
    this._isLoading = false;
    this._hasLoaded = false;
    const container = document.getElementById('announcements-list');
    if (container) container.innerHTML = '';
  },

  /* ========================================================================
     Data Fetching
     ======================================================================== */

  /**
   * Load announcements from Firestore. Falls back to built-in announcement
   * if Firestore is empty or unavailable.
   */
  async loadAnnouncements() {
    this._isLoading = true;
    this.renderLoadingSkeleton();

    try {
      if (typeof db === 'undefined') {
        throw new Error('Firestore not initialized');
      }

      const snapshot = await db.collection('announcements')
        .orderBy('date', 'desc')
        .limit(50)
        .get();

      if (snapshot.empty) {
        // No announcements in Firestore — use fallback
        this._announcements = [this._fallbackAnnouncement];
      } else {
        this._announcements = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title || 'Untitled',
            body: data.body || '',
            category: data.category || 'info',
            date: data.date ? data.date.toDate() : new Date(),
            pinned: data.pinned || false,
          };
        });
      }
    } catch (err) {
      console.warn('[Announcements] Firestore unavailable, using fallback:', err.message);
      this._announcements = [this._fallbackAnnouncement];
    }

    // Sort: pinned first, then by date descending
    this._announcements.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    this._isLoading = false;
    this._hasLoaded = true;
    this.renderAnnouncements();
  },

  /**
   * Refresh announcements (pull fresh data from Firestore).
   */
  async refresh() {
    this._hasLoaded = false;
    await this.loadAnnouncements();
  },

  /* ========================================================================
     Rendering
     ======================================================================== */

  /**
   * Render loading skeleton into the announcements container.
   */
  renderLoadingSkeleton() {
    const container = document.getElementById('announcements-list');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const skeleton = document.createElement('div');
      skeleton.className = 'announcement-card skeleton';
      skeleton.innerHTML = `
        <div class="skeleton-line skeleton-badge"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-body"></div>
        <div class="skeleton-line skeleton-body short"></div>
        <div class="skeleton-line skeleton-date"></div>
      `;
      container.appendChild(skeleton);
    }

    // Hide empty state
    const emptyState = document.getElementById('announcements-empty');
    if (emptyState) emptyState.style.display = 'none';
  },

  /**
   * Render announcement cards into the DOM.
   */
  renderAnnouncements() {
    const container = document.getElementById('announcements-list');
    const emptyState = document.getElementById('announcements-empty');
    if (!container) return;

    container.innerHTML = '';

    if (this._announcements.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    this._announcements.forEach((announcement, index) => {
      const card = document.createElement('div');
      card.className = 'announcement-card';
      card.style.animationDelay = `${index * 0.08}s`;

      const categoryMeta = this._getCategoryMeta(announcement.category);
      const relativeDate = this._formatRelativeDate(announcement.date);

      card.innerHTML = `
        <div class="announcement-card-header">
          <span class="announcement-badge ${categoryMeta.className}">
            ${categoryMeta.icon} ${categoryMeta.label}
          </span>
          ${announcement.pinned ? '<span class="announcement-pinned" title="Pinned">📌</span>' : ''}
        </div>
        <h3 class="announcement-card-title">${this._escapeHTML(announcement.title)}</h3>
        <p class="announcement-card-body">${this._escapeHTML(announcement.body)}</p>
        <div class="announcement-card-footer">
          <span class="announcement-date">${relativeDate}</span>
        </div>
      `;

      container.appendChild(card);
    });
  },

  /* ========================================================================
     Category Helpers
     ======================================================================== */

  _getCategoryMeta(category) {
    const categories = {
      feature: {
        label: 'New Feature',
        className: 'badge-feature',
        icon: '✨',
      },
      security: {
        label: 'Security',
        className: 'badge-security',
        icon: '🛡️',
      },
      update: {
        label: 'Update',
        className: 'badge-update',
        icon: '🚀',
      },
      info: {
        label: 'Info',
        className: 'badge-info',
        icon: 'ℹ️',
      },
    };

    return categories[category] || categories.info;
  },

  /* ========================================================================
     Date Formatting
     ======================================================================== */

  _formatRelativeDate(date) {
    if (!date) return '';

    const now = new Date();
    const d = new Date(date);
    const diffMs = now - d;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    // Older than a week — show formatted date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    if (year === now.getFullYear()) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, ${year}`;
  },

  /* ========================================================================
     Admin Seed Function
     ======================================================================== */

  /**
   * Seed the first announcement into Firestore.
   * Run this ONCE from the browser console:
   *   AnnouncementsManager.seedFirstAnnouncement()
   */
  async seedFirstAnnouncement() {
    if (typeof db === 'undefined') {
      console.error('[Announcements] Firestore not initialized.');
      return;
    }

    try {
      const docRef = await db.collection('announcements').add({
        title: 'Welcome to Announcements!',
        body: 'PasswordEngine now has an Announcements page! Stay up to date with the latest features, security updates, and important notices — all right here. Check back often for news about your favorite password manager.',
        category: 'feature',
        date: firebase.firestore.FieldValue.serverTimestamp(),
        pinned: true,
      });
      console.log('[Announcements] First announcement seeded with ID:', docRef.id);
      console.log('[Announcements] Refreshing...');
      await this.refresh();
    } catch (err) {
      console.error('[Announcements] Failed to seed announcement:', err);
      console.error('Make sure Firestore security rules allow writes, or use the Firebase Console to add the document manually.');
    }
  },

  /* ========================================================================
     Utilities
     ======================================================================== */

  _escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  },
};
