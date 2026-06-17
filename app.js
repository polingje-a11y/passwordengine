// DOM Elements
const elements = {
  // Login Screen
  loginScreen: document.getElementById('login-screen'),
  loginParticles: document.getElementById('login-particles'),
  appContainer: document.getElementById('app-container'),
  btnLoginWp: document.getElementById('btn-login-wp'),
  btnLoginGoogle: document.getElementById('btn-login-google'),
  btnLoginFacebook: document.getElementById('btn-login-facebook'),
  btnLoginApple: document.getElementById('btn-login-apple'),

  // User Profile (Header)
  userProfileBadge: document.getElementById('user-profile-badge'),
  userAvatar: document.getElementById('user-avatar'),
  userDisplayName: document.getElementById('user-display-name'),

  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  tabContents: document.querySelectorAll('.tab-content'),
  lockVaultBtn: document.getElementById('lock-vault-btn'),

  // Generator Screen
  passwordOutput: document.getElementById('password-output'),
  copyPasswordBtn: document.getElementById('copy-password-btn'),
  regenPasswordBtn: document.getElementById('regen-password-btn'),
  strengthValue: document.getElementById('strength-value'),
  strengthBars: [
    document.getElementById('strength-bar-1'),
    document.getElementById('strength-bar-2'),
    document.getElementById('strength-bar-3'),
    document.getElementById('strength-bar-4'),
  ],
  lengthSlider: document.getElementById('length-slider'),
  lengthVal: document.getElementById('length-val'),
  optUppercase: document.getElementById('opt-uppercase'),
  optLowercase: document.getElementById('opt-lowercase'),
  optNumbers: document.getElementById('opt-numbers'),
  optSymbols: document.getElementById('opt-symbols'),
  optSimilar: document.getElementById('opt-similar'),
  generateBtn: document.getElementById('generate-btn'),

  // Vault Lock Screen
  vaultLockedState: document.getElementById('vault-locked-state'),
  lockStateTitle: document.getElementById('lock-state-title'),
  lockStateDesc: document.getElementById('lock-state-desc'),
  setupGroup: document.getElementById('master-password-setup-group'),
  loginGroup: document.getElementById('master-password-login-group'),
  setupMasterPw: document.getElementById('setup-master-pw'),
  setupMasterPwConfirm: document.getElementById('setup-master-pw-confirm'),
  loginMasterPw: document.getElementById('login-master-pw'),
  btnCreateVault: document.getElementById('btn-create-vault'),
  btnUnlockVault: document.getElementById('btn-unlock-vault'),

  // Vault Unlocked Screen
  vaultUnlockedState: document.getElementById('vault-unlocked-state'),
  btnAddCredential: document.getElementById('btn-add-credential'),
  vaultSearch: document.getElementById('vault-search'),
  vaultItems: document.getElementById('vault-items'),

  // Modals
  credModal: document.getElementById('credential-modal'),
  modalTitle: document.getElementById('modal-title'),
  credTitle: document.getElementById('cred-title'),
  credUsername: document.getElementById('cred-username'),
  credPassword: document.getElementById('cred-password'),
  credGenPwBtn: document.getElementById('cred-gen-pw-btn'),
  credUrl: document.getElementById('cred-url'),
  btnCancelModal: document.getElementById('btn-cancel-modal'),
  btnSaveModal: document.getElementById('btn-save-modal'),

  confirmModal: document.getElementById('confirm-modal'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  btnConfirmOk: document.getElementById('btn-confirm-ok'),

  // Settings Screen
  settingChangePassword: document.getElementById('setting-change-password'),
  settingAutolock: document.getElementById('setting-autolock'),
  settingExportVault: document.getElementById('setting-export-vault'),
  settingImportVault: document.getElementById('setting-import-vault'),
  settingClearVault: document.getElementById('setting-clear-vault'),
  settingSignOut: document.getElementById('setting-sign-out'),
  settingUserEmail: document.getElementById('setting-user-email'),
  settingUserName: document.getElementById('setting-user-name'),

  // Toast
  toast: document.getElementById('toast'),
};

// Global App State
const state = {
  activeTab: 'generator-tab',
  vault: [],             // Decrypted vault credentials
  masterPassword: null,  // In-memory key for current session
  isVaultLocked: true,
  autolock: true,
  editingCredId: null,   // Credential currently being edited
  confirmCallback: null  // Callback for general confirm modal
};

// Character Sets for Generator
const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  similar: 'oO0iI1lL'
};

/* ==========================================================================
   Cryptography Helpers (Web Crypto API AES-GCM)
   ========================================================================== */

function str2ab(str) {
  return new TextEncoder().encode(str);
}

function ab2str(buf) {
  return new TextDecoder().decode(buf);
}

function buf2base64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base642buf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive the AES-GCM key from the master password and salt using PBKDF2
async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    str2ab(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt string data with a password
async function encryptVault(dataStr, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    str2ab(dataStr)
  );

  return {
    salt: buf2base64(salt),
    iv: buf2base64(iv),
    ciphertext: buf2base64(encrypted)
  };
}

// Decrypt encrypted payload with a password
async function decryptVault(encryptedObj, password) {
  try {
    const salt = base642buf(encryptedObj.salt);
    const iv = base642buf(encryptedObj.iv);
    const ciphertext = base642buf(encryptedObj.ciphertext);
    const key = await deriveKey(password, new Uint8Array(salt));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext
    );

    return ab2str(decrypted);
  } catch (err) {
    throw new Error('Incorrect master password or corrupted database.');
  }
}

/* ==========================================================================
   Application Logic
   ========================================================================== */

// Initialize UI
function init() {
  // Check authentication state first
  if (AuthManager.isAuthenticated()) {
    showApp();
  } else {
    showLoginScreen();
  }

  setupEventListeners();
  generatePassword(); // Generate initial password on load

  // Register Service Worker for PWA offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered:', reg.scope))
        .catch(err => console.warn('Service Worker registration failed:', err));
    });
  }
}

/* ==========================================================================
   Authentication / Login Screen Logic
   ========================================================================== */

// Show the login screen and hide the app
function showLoginScreen() {
  elements.loginScreen.classList.remove('hiding', 'hidden');
  elements.loginScreen.style.display = 'flex';
  elements.appContainer.style.display = 'none';
  createLoginParticles();
}

// Show the main app (user is authenticated)
function showApp() {
  // Populate user profile info
  const displayName = AuthManager.getUserDisplayName();
  const email = AuthManager.getUserEmail();
  const avatar = AuthManager.getUserAvatar();

  elements.userDisplayName.textContent = displayName;
  if (avatar) {
    elements.userAvatar.src = avatar;
    elements.userAvatar.alt = displayName;
  } else {
    // Generate initial-based avatar
    elements.userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=8b5cf6&color=fff&size=52&bold=true`;
    elements.userAvatar.alt = displayName;
  }
  elements.userProfileBadge.style.display = 'flex';

  // Update settings tab user info
  elements.settingUserEmail.textContent = email || 'No email';
  elements.settingUserName.textContent = displayName;

  // Hide login screen with animation
  elements.loginScreen.classList.add('hiding');
  setTimeout(() => {
    elements.loginScreen.classList.add('hidden');
    elements.loginScreen.style.display = 'none';
  }, 500);

  // Show app container with entrance animation
  elements.appContainer.style.display = 'flex';
  elements.appContainer.classList.add('entering');
  setTimeout(() => {
    elements.appContainer.classList.remove('entering');
  }, 500);

  // Load per-user config and vault state
  loadConfig();
  checkVaultExists();
}

// Handle sign out
async function handleSignOut() {
  showConfirmModal('Sign Out', 'Are you sure you want to sign out? Your vault will be locked.', async () => {
    // Lock vault first
    lockVault();

    // Clear auth session
    await AuthManager.logout();

    // Hide app, show login
    elements.appContainer.style.display = 'none';
    elements.userProfileBadge.style.display = 'none';
    showLoginScreen();
    showToast('Signed out successfully.');
  });
}

// Create floating particles for login screen
function createLoginParticles() {
  const container = elements.loginParticles;
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'login-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (8 + Math.random() * 12) + 's';
    particle.style.animationDelay = (Math.random() * 10) + 's';
    particle.style.width = (2 + Math.random() * 4) + 'px';
    particle.style.height = particle.style.width;
    particle.style.opacity = (0.1 + Math.random() * 0.4);

    // Vary colors between purple and blue
    const hue = 240 + Math.random() * 30;
    particle.style.background = `hsla(${hue}, 80%, 65%, 0.3)`;

    container.appendChild(particle);
  }
}

// Save config preferences (per-user scoped)
function saveConfig() {
  const key = AuthManager.isAuthenticated() ? AuthManager.getConfigStorageKey() : 'passwordEngine_config';
  localStorage.setItem(key, JSON.stringify({
    autolock: state.autolock
  }));
}

// Load config preferences (per-user scoped)
function loadConfig() {
  const key = AuthManager.isAuthenticated() ? AuthManager.getConfigStorageKey() : 'passwordEngine_config';
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      state.autolock = cfg.autolock !== undefined ? cfg.autolock : true;
      elements.settingAutolock.checked = state.autolock;
    } catch (e) {
      console.error('Config parsing error:', e);
    }
  }
}

// Check if a vault already exists in local storage (per-user scoped)
function checkVaultExists() {
  const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
  const vaultData = localStorage.getItem(vaultKey);
  if (vaultData) {
    elements.lockStateTitle.textContent = "Unlock Vault";
    elements.lockStateDesc.textContent = "Please enter your master password to decrypt your credentials.";
    elements.setupGroup.style.display = 'none';
    elements.loginGroup.style.display = 'block';
  } else {
    elements.lockStateTitle.textContent = "Create Master Password";
    elements.lockStateDesc.textContent = "It looks like this is your first time. Set a master password to secure your credentials local vault.";
    elements.setupGroup.style.display = 'block';
    elements.loginGroup.style.display = 'none';
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // ── Login Screen Events ──
  elements.btnLoginWp.addEventListener('click', () => AuthManager.login());
  elements.btnLoginGoogle.addEventListener('click', () => AuthManager.login());
  elements.btnLoginFacebook.addEventListener('click', () => AuthManager.login());
  elements.btnLoginApple.addEventListener('click', () => AuthManager.login());

  // ── Navigation Tabs Switching ──
  elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Generator Page Events
  elements.lengthSlider.addEventListener('input', (e) => {
    elements.lengthVal.textContent = e.target.value;
    generatePassword();
  });

  [elements.optUppercase, elements.optLowercase, elements.optNumbers, elements.optSymbols, elements.optSimilar].forEach(checkbox => {
    checkbox.addEventListener('change', generatePassword);
  });

  elements.generateBtn.addEventListener('click', generatePassword);
  elements.regenPasswordBtn.addEventListener('click', generatePassword);
  elements.copyPasswordBtn.addEventListener('click', () => {
    const pwd = elements.passwordOutput.textContent;
    if (pwd && pwd !== 'Click Generate' && !elements.passwordOutput.classList.contains('placeholder')) {
      copyToClipboard(pwd, 'Password copied to clipboard');
    }
  });

  // Vault Security Operations
  elements.btnCreateVault.addEventListener('click', handleCreateVault);
  elements.btnUnlockVault.addEventListener('click', handleUnlockVault);
  elements.lockVaultBtn.addEventListener('click', () => lockVault());

  // Input password validation / enter key triggers
  elements.loginMasterPw.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUnlockVault();
  });
  elements.setupMasterPwConfirm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreateVault();
  });

  // Unlocked Vault Items Events
  elements.btnAddCredential.addEventListener('click', () => openCredentialModal());
  elements.btnCancelModal.addEventListener('click', closeCredentialModal);
  elements.btnSaveModal.addEventListener('click', handleSaveCredential);
  elements.vaultSearch.addEventListener('input', renderVaultItems);
  
  // Generating password inside credential modal
  elements.credGenPwBtn.addEventListener('click', () => {
    const length = elements.lengthSlider.value;
    const pwd = generateRandomPassword(length, elements.optUppercase.checked, elements.optLowercase.checked, elements.optNumbers.checked, elements.optSymbols.checked, elements.optSimilar.checked);
    elements.credPassword.value = pwd;
    showToast('Random password inserted');
  });

  // Settings Actions
  elements.settingAutolock.addEventListener('change', (e) => {
    state.autolock = e.target.checked;
    saveConfig();
    showToast(`Auto-lock ${state.autolock ? 'enabled' : 'disabled'}`);
  });

  elements.settingChangePassword.addEventListener('click', handleInitiateChangePassword);
  elements.settingExportVault.addEventListener('click', exportEncryptedVaultFile);
  elements.settingImportVault.addEventListener('click', importVaultFileTrigger);
  elements.settingClearVault.addEventListener('click', handleDestructiveClearVault);
  elements.settingSignOut.addEventListener('click', handleSignOut);

  // Confirm Modal cancellation/ok
  elements.btnConfirmCancel.addEventListener('click', () => elements.confirmModal.classList.remove('active'));
  elements.btnConfirmOk.addEventListener('click', () => {
    elements.confirmModal.classList.remove('active');
    if (state.confirmCallback) {
      state.confirmCallback();
      state.confirmCallback = null;
    }
  });

  // Auto-Lock triggers on app backgrounding (tab switches or lockscreen)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.autolock && !state.isVaultLocked) {
      lockVault();
    }
  });
}

// Tab Switching Routing
function switchTab(tabId) {
  elements.navItems.forEach(nav => {
    if (nav.getAttribute('data-tab') === tabId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  elements.tabContents.forEach(content => {
    if (content.id === tabId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  state.activeTab = tabId;
}

/* ==========================================================================
   Password Generator Logic
   ========================================================================== */

function generatePassword() {
  const length = parseInt(elements.lengthSlider.value);
  const useUpper = elements.optUppercase.checked;
  const useLower = elements.optLowercase.checked;
  const useNumbers = elements.optNumbers.checked;
  const useSymbols = elements.optSymbols.checked;
  const excludeSimilar = elements.optSimilar.checked;

  if (!useUpper && !useLower && !useNumbers && !useSymbols) {
    elements.passwordOutput.textContent = 'Select at least one option';
    elements.passwordOutput.classList.add('placeholder');
    updateStrengthIndicator('', 0);
    return;
  }

  const pwd = generateRandomPassword(length, useUpper, useLower, useNumbers, useSymbols, excludeSimilar);
  elements.passwordOutput.textContent = pwd;
  elements.passwordOutput.classList.remove('placeholder');

  // Estimate strength
  const entropy = calculateEntropy(pwd, useUpper, useLower, useNumbers, useSymbols, excludeSimilar);
  updateStrengthIndicator(pwd, entropy);
}

function generateRandomPassword(length, upper, lower, numbers, symbols, similar) {
  let chars = '';
  let mandatory = [];

  // Exclude similar characters helper
  const filterSimilar = (str) => {
    if (!similar) return str;
    return str.split('').filter(c => !CHAR_SETS.similar.includes(c)).join('');
  };

  if (upper) {
    const charset = filterSimilar(CHAR_SETS.uppercase);
    chars += charset;
    if (charset.length > 0) mandatory.push(getRandomChar(charset));
  }
  if (lower) {
    const charset = filterSimilar(CHAR_SETS.lowercase);
    chars += charset;
    if (charset.length > 0) mandatory.push(getRandomChar(charset));
  }
  if (numbers) {
    const charset = filterSimilar(CHAR_SETS.numbers);
    chars += charset;
    if (charset.length > 0) mandatory.push(getRandomChar(charset));
  }
  if (symbols) {
    const charset = filterSimilar(CHAR_SETS.symbols);
    chars += charset;
    if (charset.length > 0) mandatory.push(getRandomChar(charset));
  }

  if (chars.length === 0) return '';

  let generated = [];
  // Insert mandatory characters first to ensure complexity settings are satisfied
  for (let i = 0; i < mandatory.length && i < length; i++) {
    generated.push(mandatory[i]);
  }

  // Fill remaining characters
  const cryptoArr = new Uint32Array(length - generated.length);
  window.crypto.getRandomValues(cryptoArr);
  for (let i = 0; i < cryptoArr.length; i++) {
    generated.push(chars[cryptoArr[i] % chars.length]);
  }

  // Shuffle array cryptographically
  for (let i = generated.length - 1; i > 0; i--) {
    const rArr = new Uint32Array(1);
    window.crypto.getRandomValues(rArr);
    const j = rArr[0] % (i + 1);
    const temp = generated[i];
    generated[i] = generated[j];
    generated[j] = temp;
  }

  return generated.join('');
}

function getRandomChar(str) {
  const randomArr = new Uint32Array(1);
  window.crypto.getRandomValues(randomArr);
  return str[randomArr[0] % str.length];
}

// Calculate Password Entropy (Shannon Entropy / Pool Size representation)
function calculateEntropy(password, upper, lower, numbers, symbols, similar) {
  let poolSize = 0;
  const simCount = CHAR_SETS.similar.length;
  
  if (upper) poolSize += 26 - (similar ? 4 : 0); // O, I, L exclusion estimation
  if (lower) poolSize += 26 - (similar ? 2 : 0); // o, i, l exclusion estimation
  if (numbers) poolSize += 10 - (similar ? 2 : 0); // 0, 1 exclusion estimation
  if (symbols) poolSize += CHAR_SETS.symbols.length;

  if (poolSize === 0) return 0;
  return password.length * Math.log2(poolSize);
}

function updateStrengthIndicator(password, entropy) {
  let level = '';
  let fillCount = 0;
  let colorClass = '';

  if (password.length === 0) {
    level = 'None';
    fillCount = 0;
  } else if (entropy < 40 || password.length < 10) {
    level = 'Weak';
    fillCount = 1;
    colorClass = 'color-weak';
  } else if (entropy < 60 || password.length < 12) {
    level = 'Fair';
    fillCount = 2;
    colorClass = 'color-fair';
  } else if (entropy < 80 || password.length < 14) {
    level = 'Strong';
    fillCount = 3;
    colorClass = 'color-strong';
  } else {
    level = 'Secure';
    fillCount = 4;
    colorClass = 'color-secure';
  }

  elements.strengthValue.textContent = level;
  elements.strengthValue.className = `strength-value ${colorClass}`;

  elements.strengthBars.forEach((bar, index) => {
    bar.style.background = '';
    if (index < fillCount) {
      if (level === 'Weak') bar.style.background = 'var(--strength-weak)';
      if (level === 'Fair') bar.style.background = 'var(--strength-fair)';
      if (level === 'Strong') bar.style.background = 'var(--strength-strong)';
      if (level === 'Secure') bar.style.background = 'var(--strength-secure)';
    }
  });
}

/* ==========================================================================
   Vault Screen Cryptographic Operations
   ========================================================================== */

// Create vault database from master password
async function handleCreateVault() {
  const master = elements.setupMasterPw.value.trim();
  const confirm = elements.setupMasterPwConfirm.value.trim();

  if (master.length < 8) {
    showToast('Master password must be at least 8 characters.');
    return;
  }

  if (master !== confirm) {
    showToast('Master passwords do not match.');
    return;
  }

  try {
    // Initial empty vault list
    const initialVaultStr = JSON.stringify([]);
    const encryptedObj = await encryptVault(initialVaultStr, master);
    
    // Save to local storage (per-user scoped)
    const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
    localStorage.setItem(vaultKey, JSON.stringify(encryptedObj));
    
    // Authenticate local session
    state.masterPassword = master;
    state.vault = [];
    state.isVaultLocked = false;
    
    // Reset inputs
    elements.setupMasterPw.value = '';
    elements.setupMasterPwConfirm.value = '';

    unlockVaultUI();
    showToast('Vault created successfully.');
  } catch (err) {
    console.error(err);
    showToast('Error initializing vault.');
  }
}

// Unlock local vault using master password
async function handleUnlockVault() {
  const master = elements.loginMasterPw.value.trim();
  if (!master) {
    showToast('Enter your master password.');
    return;
  }

  const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
  const rawVault = localStorage.getItem(vaultKey);
  if (!rawVault) {
    showToast('No database file found. Create database.');
    return;
  }

  try {
    const encryptedObj = JSON.parse(rawVault);
    const decryptedStr = await decryptVault(encryptedObj, master);
    
    // Successfully decrypted! Store session states
    state.masterPassword = master;
    state.vault = JSON.parse(decryptedStr);
    state.isVaultLocked = false;

    // Reset inputs
    elements.loginMasterPw.value = '';

    unlockVaultUI();
    showToast('Vault unlocked.');
  } catch (err) {
    console.error(err);
    showToast('Incorrect master password.');
    elements.loginMasterPw.focus();
  }
}

// UI State Toggles for Unlocked state
function unlockVaultUI() {
  elements.vaultLockedState.style.display = 'none';
  elements.vaultUnlockedState.style.display = 'block';
  elements.lockVaultBtn.style.display = 'flex';
  renderVaultItems();
}

// Lock vault and flush security details from browser memory
function lockVault() {
  state.masterPassword = null;
  state.vault = [];
  state.isVaultLocked = true;

  elements.vaultLockedState.style.display = 'flex';
  elements.vaultUnlockedState.style.display = 'none';
  elements.lockVaultBtn.style.display = 'none';
  elements.vaultItems.innerHTML = '';
  
  // Re-verify login screen is formatted correctly
  checkVaultExists();
  showToast('Vault locked.');
}

// Encrypt and save vault content updates back into localStorage
async function saveVaultData() {
  if (state.isVaultLocked || !state.masterPassword) {
    showToast('Unauthorized vault write session.');
    return false;
  }

  try {
    const payloadStr = JSON.stringify(state.vault);
    const encryptedObj = await encryptVault(payloadStr, state.masterPassword);
    const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
    localStorage.setItem(vaultKey, JSON.stringify(encryptedObj));
    return true;
  } catch (err) {
    console.error(err);
    showToast('Failed to save encrypted vault database.');
    return false;
  }
}

/* ==========================================================================
   Vault UI Listing Operations
   ========================================================================== */

function renderVaultItems() {
  const search = elements.vaultSearch.value.toLowerCase().trim();
  elements.vaultItems.innerHTML = '';

  const filtered = state.vault.filter(item => {
    return item.title.toLowerCase().includes(search) || 
           item.username.toLowerCase().includes(search) ||
           (item.url && item.url.toLowerCase().includes(search));
  });

  if (filtered.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '40px 10px';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontSize = '14px';
    emptyMsg.textContent = search ? 'No matching logins found.' : 'Your vault is empty. Add a login to get started.';
    elements.vaultItems.appendChild(emptyMsg);
    return;
  }

  // Populate UI elements
  filtered.forEach(item => {
    const row = document.createElement('div');
    row.className = 'vault-item';
    
    row.innerHTML = `
      <div class="vault-item-info">
        <span class="vault-item-title">${escapeHTML(item.title)}</span>
        <span class="vault-item-user">${escapeHTML(item.username)}</span>
      </div>
      <div class="vault-item-actions">
        <button class="btn-icon btn-view-cred" data-id="${item.id}" title="View Details">
          <svg viewBox="0 0 24 24">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" fill="none"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button class="btn-icon btn-copy-cred" data-id="${item.id}" data-type="password" title="Copy Password">
          <svg viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete-cred" data-id="${item.id}" title="Delete Login">
          <svg viewBox="0 0 24 24" style="color: var(--danger);">
            <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </button>
      </div>
    `;

    // Attaching listeners
    row.querySelector('.btn-view-cred').addEventListener('click', () => openCredentialModal(item.id));
    row.querySelector('.btn-copy-cred').addEventListener('click', () => {
      copyToClipboard(item.password, `Password for ${item.title} copied`);
    });
    row.querySelector('.btn-delete-cred').addEventListener('click', () => {
      showConfirmModal('Delete Credentials?', `Are you sure you want to delete the login for ${item.title}? This action cannot be undone.`, () => {
        handleDeleteCredential(item.id);
      });
    });

    elements.vaultItems.appendChild(row);
  });
}

// Open modal for details add/edit
function openCredentialModal(credId = null) {
  state.editingCredId = credId;

  if (credId) {
    elements.modalTitle.textContent = "Edit Login";
    const record = state.vault.find(v => v.id === credId);
    if (record) {
      elements.credTitle.value = record.title;
      elements.credUsername.value = record.username;
      elements.credPassword.value = record.password;
      elements.credUrl.value = record.url || '';
    }
  } else {
    elements.modalTitle.textContent = "Add New Login";
    elements.credTitle.value = '';
    elements.credUsername.value = '';
    elements.credPassword.value = '';
    elements.credUrl.value = '';
  }

  elements.credModal.classList.add('active');
}

function closeCredentialModal() {
  elements.credModal.classList.remove('active');
  state.editingCredId = null;
}

// Add or edit login credentials
async function handleSaveCredential() {
  const title = elements.credTitle.value.trim();
  const username = elements.credUsername.value.trim();
  const password = elements.credPassword.value;
  const url = elements.credUrl.value.trim();

  if (!title || !username || !password) {
    showToast('Title, username, and password are required fields.');
    return;
  }

  if (state.editingCredId) {
    // Edit existing
    const index = state.vault.findIndex(item => item.id === state.editingCredId);
    if (index !== -1) {
      state.vault[index] = {
        ...state.vault[index],
        title,
        username,
        password,
        url
      };
    }
  } else {
    // Add new
    const newRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      title,
      username,
      password,
      url,
      created: Date.now()
    };
    state.vault.push(newRecord);
  }

  const success = await saveVaultData();
  if (success) {
    closeCredentialModal();
    renderVaultItems();
    showToast(state.editingCredId ? 'Login updated.' : 'Login added.');
  }
}

// Delete login credential record
async function handleDeleteCredential(credId) {
  state.vault = state.vault.filter(item => item.id !== credId);
  const success = await saveVaultData();
  if (success) {
    renderVaultItems();
    showToast('Login removed.');
  }
}

/* ==========================================================================
   Settings Options Actions
   ========================================================================== */

function handleInitiateChangePassword() {
  if (state.isVaultLocked) {
    showToast('Unlock your vault first to edit security parameters.');
    switchTab('vault-tab');
    return;
  }

  // Let's reuse confirmation dialogue or prompt directly. Since prompts are standard,
  // we can use standard inputs in a custom UI sequence. Let's make an alert that triggers a prompt.
  const newPw = prompt('Please enter your NEW Master Password:');
  if (!newPw) return;

  if (newPw.trim().length < 8) {
    alert('Change aborted: New master password must be at least 8 characters.');
    return;
  }

  const newPwConfirm = prompt('Confirm your NEW Master Password:');
  if (newPw !== newPwConfirm) {
    alert('Change aborted: Passwords do not match.');
    return;
  }

  // Recrypt vault logic
  state.masterPassword = newPw;
  saveVaultData().then(success => {
    if (success) {
      showToast('Master password successfully updated.');
    }
  });
}

// Backup vault database (Encrypted JSON file download)
function exportEncryptedVaultFile() {
  const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
  const rawData = localStorage.getItem(vaultKey);
  if (!rawData) {
    showToast('Nothing to export. Vault is empty.');
    return;
  }

  try {
    const blob = new Blob([rawData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PasswordEngine_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Vault backup downloaded.');
  } catch (e) {
    console.error(e);
    showToast('Backup export failed.');
  }
}

// Restore database (Import encrypted file)
function importVaultFileTrigger() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const parsed = JSON.parse(text);

        if (!parsed.salt || !parsed.iv || !parsed.ciphertext) {
          throw new Error('Invalid backup file formatting.');
        }

        // Prompt user for master password corresponding to backup file
        const pass = prompt('Enter the Master Password for this backup file:');
        if (!pass) return;

        // Try decrypting to verify
        const decryptedStr = await decryptVault(parsed, pass);
        
        // Save database file (per-user scoped)
        const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
        localStorage.setItem(vaultKey, JSON.stringify(parsed));
        
        // Update current session if matching
        state.masterPassword = pass;
        state.vault = JSON.parse(decryptedStr);
        state.isVaultLocked = false;
        
        unlockVaultUI();
        switchTab('vault-tab');
        showToast('Vault restored successfully!');
      } catch (err) {
        console.error(err);
        alert('Restore failed: Verify backup file and master password.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Clear vault (Wipes local storage database entirely)
function handleDestructiveClearVault() {
  showConfirmModal('Destroy Vault Data?', 'WARNING: This will delete the secure vault and all stored credentials. There is no way to recover your data.', () => {
    const vaultKey = AuthManager.isAuthenticated() ? AuthManager.getVaultStorageKey() : 'passwordEngine_vault';
    localStorage.removeItem(vaultKey);
    lockVault();
    showToast('Database wiped.');
  });
}

/* ==========================================================================
   Global Helper Functions
   ========================================================================== */

// Copy string value to system clipboard and display feedback toast
function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message);
  }).catch(err => {
    console.error('Copy failed:', err);
    // Fallback selection copy
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(message);
    } catch (e) {
      showToast('Copying not supported on your browser');
    }
    document.body.removeChild(textarea);
  });
}

// Display Toast popup
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  
  // Clear previous timeouts if triggering multiple times
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
  }
  
  state.toastTimeout = setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2500);
}

// General purpose confirmation modal controller
function showConfirmModal(title, msg, onConfirm) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = msg;
  state.confirmCallback = onConfirm;
  elements.confirmModal.classList.add('active');
}

// Helper to escape HTML tags and safeguard output
function escapeHTML(str) {
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
}

// Bootstrap Application Load
window.addEventListener('DOMContentLoaded', init);
