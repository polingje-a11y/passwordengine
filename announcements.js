/* ==========================================================================
   PasswordEngine Announcements Module
   Fetches and displays announcements from Firebase Firestore.
   ========================================================================== */

const AnnouncementsManager = {
  _announcements: [],
  _isLoading: false,
  _hasLoaded: false,
  _editingId: null,
  _listenersAttached: false,
  _adminEmail: 'polingje@gmail.com',

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
    this._setupAdminUI();
    await this.loadAnnouncements();
  },

  /**
   * Reset state on sign-out so the next user gets fresh data.
   */
  reset() {
    this._announcements = [];
    this._isLoading = false;
    this._hasLoaded = false;
    this._editingId = null;
    const container = document.getElementById('announcements-list');
    if (container) container.innerHTML = '';
    const btnAdd = document.getElementById('btn-add-announcement');
    if (btnAdd) btnAdd.style.display = 'none';
  },

  /* ========================================================================
     Admin — write operations (only available to the admin account)
     ======================================================================== */

  isAdmin() {
    if (typeof AuthManager === 'undefined') return false;
    return AuthManager.getUserEmail() === this._adminEmail;
  },

  _setupAdminUI() {
    if (this._listenersAttached) return;
    this._listenersAttached = true;

    const btnAdd = document.getElementById('btn-add-announcement');
    if (btnAdd && this.isAdmin()) {
      btnAdd.style.display = 'inline-flex';
      btnAdd.addEventListener('click', () => this.openAdminModal());
    }

    const btnCancel = document.getElementById('btn-cancel-announcement-modal');
    const btnSave = document.getElementById('btn-save-announcement-modal');
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeAdminModal());
    if (btnSave) btnSave.addEventListener('click', () => this.saveAnnouncement());
  },

  openAdminModal(id = null) {
    this._editingId = id;
    const modal = document.getElementById('announcement-modal');
    if (!modal) return;

    document.getElementById('announcement-modal-title').textContent =
      id ? 'Edit Announcement' : 'New Announcement';
    document.getElementById('btn-save-announcement-modal').textContent =
      id ? 'Save Changes' : 'Publish';

    if (id) {
      const ann = this._announcements.find(a => a.id === id);
      document.getElementById('ann-title').value = ann?.title || '';
      document.getElementById('ann-body').value = ann?.body || '';
      document.getElementById('ann-category').value = ann?.category || 'info';
      document.getElementById('ann-pinned').checked = ann?.pinned || false;
    } else {
      document.getElementById('ann-title').value = '';
      document.getElementById('ann-body').value = '';
      document.getElementById('ann-category').value = 'feature';
      document.getElementById('ann-pinned').checked = false;
    }

    modal.classList.add('active');
    document.getElementById('ann-title').focus();
  },

  closeAdminModal() {
    document.getElementById('announcement-modal')?.classList.remove('active');
    this._editingId = null;
  },

  async saveAnnouncement() {
    const titleVal = document.getElementById('ann-title')?.value.trim();
    const bodyVal = document.getElementById('ann-body')?.value.trim();
    const categoryVal = document.getElementById('ann-category')?.value || 'info';
    const pinnedVal = document.getElementById('ann-pinned')?.checked || false;

    const btn = document.getElementById('btn-save-announcement-modal');
    if (!titleVal || !bodyVal) {
      const orig = btn.textContent;
      btn.textContent = 'Title & body required';
      setTimeout(() => { btn.textContent = orig; }, 2000);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (this._editingId) {
        await db.collection('announcements').doc(this._editingId).update({
          title: titleVal,
          body: bodyVal,
          category: categoryVal,
          pinned: pinnedVal,
        });
      } else {
        await db.collection('announcements').add({
          title: titleVal,
          body: bodyVal,
          category: categoryVal,
          date: firebase.firestore.FieldValue.serverTimestamp(),
          pinned: pinnedVal,
        });
      }
      this.closeAdminModal();
      await this.refresh();
    } catch (err) {
      console.error('[Announcements] Save failed:', err);
      btn.disabled = false;
      btn.textContent = this._editingId ? 'Save Changes' : 'Publish';
    }
  },

  async deleteAnnouncementById(id) {
    try {
      await db.collection('announcements').doc(id).delete();
      await this.refresh();
    } catch (err) {
      console.error('[Announcements] Delete failed:', err);
    }
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

      const isAdmin = this.isAdmin();
      card.innerHTML = `
        <div class="announcement-card-header">
          <span class="announcement-badge ${categoryMeta.className}">
            ${categoryMeta.icon} ${categoryMeta.label}
          </span>
          <div class="announcement-card-header-right">
            ${announcement.pinned ? '<span class="announcement-pinned" title="Pinned">📌</span>' : ''}
            ${isAdmin ? `
              <button class="btn-icon ann-edit-btn" title="Edit">
                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none"/></svg>
              </button>
              <button class="btn-icon ann-delete-btn" title="Delete" style="color:var(--danger);">
                <svg viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" fill="none"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <h3 class="announcement-card-title">${this._escapeHTML(announcement.title)}</h3>
        <p class="announcement-card-body">${this._escapeHTML(announcement.body)}</p>
        <div class="announcement-card-footer">
          <span class="announcement-date">${relativeDate}</span>
        </div>
      `;

      if (isAdmin) {
        card.querySelector('.ann-edit-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.openAdminModal(announcement.id);
        });
        card.querySelector('.ann-delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof showConfirmModal !== 'undefined') {
            showConfirmModal(
              'Delete Announcement?',
              `Are you sure you want to delete "${announcement.title}"? This cannot be undone.`,
              () => this.deleteAnnouncementById(announcement.id)
            );
          }
        });
      }

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
