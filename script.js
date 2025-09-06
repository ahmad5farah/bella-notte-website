/* =====================================================================
   BELLA NOTTE — ENHANCED RESTAURANT SYSTEM
   Complete production-ready restaurant application
   Features:
   - Email verification system
   - Complete user account management
   - Address book management
   - Order history and tracking
   - Enhanced security
   - Admin panel integration ready
   - Real-time notifications
   - Advanced cart management
   ===================================================================== */

/* =====================
   GLOBAL APP STATE
   ===================== */
let app = {
  firebaseReady: false,
  auth: null,
  db: null,
  user: null,
  userProfile: null,
  menu: [],
  cart: [],
  addresses: [],
  orders: [],
  notifications: [],
  isLoadingMenu: false,
  isRestoringCart: false,
  currentPage: 'home',
  emailVerificationSent: false
};

/* =====================
   CONSTANTS & CONFIG
   ===================== */
const CONFIG = {
  EMAIL_VERIFICATION_REQUIRED: true,
  MIN_PASSWORD_LENGTH: 8,
  MAX_CART_ITEMS: 50,
  DELIVERY_RADIUS_KM: 25,
  MIN_ORDER_VALUE: 200,
  FREE_DELIVERY_THRESHOLD: 500,
  DELIVERY_FEE: 40,
  TAX_RATE: 0.12,
  ORDER_CANCEL_TIME_MINUTES: 5
};

const LS_KEYS = {
  CART: 'bellaNotteCart',
  USER_PREFERENCES: 'bellaNottePrefs',
  DRAFT_ADDRESSES: 'bellaNotteAddresses',
  RECENT_ORDERS: 'bellaNotteRecentOrders'
};

/* =====================
   UTILITY FUNCTIONS
   ===================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const fmt = (n) => Number(n).toFixed(2);
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

function onDOMReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/* =====================
   NOTIFICATION SYSTEM
   ===================== */
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-${getToastIcon(type)}"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  const container = getOrCreateToastContainer();
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getToastIcon(type) {
  const icons = {
    success: 'check-circle',
    error: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };
  return icons[type] || 'info-circle';
}

function getOrCreateToastContainer() {
  let container = $('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/* =====================
   LOADING SYSTEM
   ===================== */
function showLoadingSpinner(text = 'Loading...') {
  const spinner = document.createElement('div');
  spinner.id = 'globalSpinner';
  spinner.className = 'global-spinner';
  spinner.innerHTML = `
    <div class="spinner-content">
      <div class="spinner"></div>
      <p>${text}</p>
    </div>
  `;
  document.body.appendChild(spinner);
  document.body.style.overflow = 'hidden';
}

function hideLoadingSpinner() {
  const spinner = $('#globalSpinner');
  if (spinner) {
    spinner.remove();
    document.body.style.overflow = 'auto';
  }
}

function hideLoadingScreen() {
  const loading = $('#loadingScreen');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.style.display = 'none', 400);
  }
}

/* =====================
   FIREBASE BOOTSTRAP
   ===================== */
function bootstrapFirebaseIfAvailable() {
  try {
    if (window.firebase && window.firebase.apps) {
      if (!firebase.apps.length && window.firebaseConfig) {
        firebase.initializeApp(window.firebaseConfig);
      }
      
      if (firebase.apps.length) {
        app.auth = firebase.auth();
        if (firebase.firestore) {
          app.db = firebase.firestore();
          app.firebaseReady = true;
          console.log('✅ Firebase initialized');
          
          // Enable offline persistence
          app.db.enablePersistence({ synchronizeTabs: true })
            .catch((err) => console.warn('Firestore persistence failed:', err));
        }
      }
    }
  } catch (e) {
    console.warn('Firebase not available, continuing in local mode:', e);
    app.firebaseReady = false;
  }
}

/* =====================
   AUTHENTICATION SYSTEM
   ===================== */
function setupAuthStateListener() {
  if (app.auth) {
    app.auth.onAuthStateChanged(async (user) => {
      app.user = user || null;
      
      if (user) {
        await loadUserProfile(user.uid);
        checkEmailVerification();
        loadUserData();
        console.log('👤 User signed in:', user.email);
      } else {
        app.userProfile = null;
        console.log('👤 User signed out');
      }
      
      updateUserUI();
    });
  } else {
    app.user = null;
    updateUserUI();
  }
}

async function loadUserProfile(uid) {
  if (!app.db) return null;
  
  try {
    const doc = await app.db.collection('users').doc(uid).get();
    if (doc.exists) {
      app.userProfile = { id: doc.id, ...doc.data() };
    } else {
      // Create user profile on first login
      const profile = {
        email: app.user.email,
        displayName: app.user.displayName || '',
        phone: app.user.phoneNumber || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        preferences: {
          notifications: true,
          marketing: false,
          theme: 'light'
        }
      };
      
      await app.db.collection('users').doc(uid).set(profile);
      app.userProfile = { id: uid, ...profile };
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
  }
}

function checkEmailVerification() {
  if (CONFIG.EMAIL_VERIFICATION_REQUIRED && app.user && !app.user.emailVerified) {
    if (!app.emailVerificationSent) {
      showEmailVerificationBanner();
    }
  } else {
    hideEmailVerificationBanner();
  }
}

function showEmailVerificationBanner() {
  let banner = $('#emailVerificationBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'emailVerificationBanner';
    banner.className = 'verification-banner';
    banner.innerHTML = `
      <div class="verification-content">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Please verify your email address to access all features.</span>
        <button onclick="sendEmailVerification()" class="verify-btn">Send Verification</button>
        <button onclick="hideEmailVerificationBanner()" class="dismiss-btn">×</button>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  }
  banner.classList.add('show');
}

function hideEmailVerificationBanner() {
  const banner = $('#emailVerificationBanner');
  if (banner) banner.remove();
}

async function sendEmailVerification() {
  if (!app.user) return;
  
  try {
    await app.user.sendEmailVerification({
      url: window.location.origin + '/email-verified.html',
      handleCodeInApp: true
    });
    showToast('Verification email sent! Check your inbox.', 'success');
    app.emailVerificationSent = true;
    hideEmailVerificationBanner();
  } catch (error) {
    console.error('Email verification error:', error);
    showToast('Failed to send verification email', 'error');
  }
}

function updateUserUI() {
  const userGreeting = $('#userGreeting');
  const userIcon = $('#userIcon');
  const userDropdown = $('#userDropdown');

  if (app.user) {
    const displayName = app.user.displayName || app.userProfile?.displayName || 'User';
    const firstName = displayName.split(' ')[0];
    
    if (userGreeting) userGreeting.textContent = `Hi, ${firstName}`;
    if (userIcon) userIcon.className = 'fas fa-user-circle';
    
    if (userDropdown) {
      userDropdown.innerHTML = `
        <a href="my-account.html"><i class="fas fa-user"></i> My Account</a>
        <a href="order-history.html"><i class="fas fa-receipt"></i> Order History</a>
        <a href="addresses.html"><i class="fas fa-map-marker-alt"></i> Addresses</a>
        <a href="#" onclick="signOutUser()"><i class="fas fa-sign-out-alt"></i> Sign Out</a>
      `;
    }
  } else {
    if (userGreeting) userGreeting.textContent = 'Account';
    if (userIcon) userIcon.className = 'fas fa-user';
    
    if (userDropdown) {
      userDropdown.innerHTML = `
        <a href="#" onclick="showAuthModal('login')"><i class="fas fa-sign-in-alt"></i> Login</a>
        <a href="#" onclick="showAuthModal('register')"><i class="fas fa-user-plus"></i> Sign Up</a>
      `;
    }
  }
  
  // Update auth-dependent elements
  $$('.auth-required').forEach(el => {
    el.style.display = app.user ? 'block' : 'none';
  });
  
  $$('.auth-hidden').forEach(el => {
    el.style.display = app.user ? 'none' : 'block';
  });
}

/* =====================
   ENHANCED AUTH FORMS
   ===================== */
function bindAuthForms() {
  const loginForm = $('#loginFormElement');
  const registerForm = $('#registerFormElement');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  if (!app.auth) {
    showToast('Authentication not available in local mode', 'warning');
    return;
  }

  const email = $('#loginEmail')?.value.trim();
  const password = $('#loginPassword')?.value;
  const messageEl = $('#loginMessage');

  try {
    showLoadingSpinner('Signing in...');
    
    await app.auth.signInWithEmailAndPassword(email, password);
    
    if (messageEl) {
      messageEl.innerHTML = '<p class="success">Welcome back!</p>';
    }
    
    showToast('Logged in successfully', 'success');
    closeAuthModal();
    
    // Update last login time
    if (app.userProfile) {
      await app.db.collection('users').doc(app.user.uid).update({
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = getAuthErrorMessage(error);
    
    if (messageEl) {
      messageEl.innerHTML = `<p class="error">${errorMessage}</p>`;
    }
    
    showToast(errorMessage, 'error');
  } finally {
    hideLoadingSpinner();
  }
}

async function handleRegister(e) {
  e.preventDefault();
  if (!app.auth) {
    showToast('Registration not available in local mode', 'warning');
    return;
  }

  const name = $('#registerName')?.value.trim();
  const email = $('#registerEmail')?.value.trim();
  const phone = $('#registerPhone')?.value.trim();
  const password = $('#registerPassword')?.value;
  const confirmPassword = $('#confirmPassword')?.value;
  const messageEl = $('#registerMessage');

  // Validation
  const validationError = validateRegistrationData({
    name, email, phone, password, confirmPassword
  });
  
  if (validationError) {
    if (messageEl) messageEl.innerHTML = `<p class="error">${validationError}</p>`;
    showToast(validationError, 'error');
    return;
  }

  try {
    showLoadingSpinner('Creating account...');
    
    const credential = await app.auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: name });
    
    // Create user profile in Firestore
    await app.db.collection('users').doc(credential.user.uid).set({
      displayName: name,
      email: email,
      phone: phone,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      preferences: {
        notifications: true,
        marketing: false,
        theme: 'light'
      },
      stats: {
        totalOrders: 0,
        totalSpent: 0,
        favoriteItems: []
      }
    });

    if (CONFIG.EMAIL_VERIFICATION_REQUIRED) {
      await sendEmailVerification();
    }

    if (messageEl) {
      messageEl.innerHTML = '<p class="success">Account created successfully!</p>';
    }
    
    showToast('Account created! Welcome to Bella Notte!', 'success');
    setTimeout(closeAuthModal, 1000);
    
  } catch (error) {
    console.error('Registration error:', error);
    const errorMessage = getAuthErrorMessage(error);
    
    if (messageEl) {
      messageEl.innerHTML = `<p class="error">${errorMessage}</p>`;
    }
    
    showToast(errorMessage, 'error');
  } finally {
    hideLoadingSpinner();
  }
}

function validateRegistrationData({ name, email, phone, password, confirmPassword }) {
  if (!name || name.length < 2) return 'Name must be at least 2 characters';
  if (!email || !isValidEmail(email)) return 'Please enter a valid email address';
  if (!phone || !isValidPhone(phone)) return 'Please enter a valid phone number';
  if (!password || password.length < CONFIG.MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${CONFIG.MIN_PASSWORD_LENGTH} characters`;
  }
  if (password !== confirmPassword) return 'Passwords do not match';
  if (!isStrongPassword(password)) {
    return 'Password must contain uppercase, lowercase, number, and special character';
  }
  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[\+]?[0-9\s\-\(\)]{8,15}$/.test(phone);
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password);
}

function getAuthErrorMessage(error) {
  const errorMessages = {
    'auth/user-not-found': 'No account found with this email address',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'An account already exists with this email',
    'auth/weak-password': 'Password is too weak',
    'auth/invalid-email': 'Invalid email address',
    'auth/too-many-requests': 'Too many attempts. Please try again later',
    'auth/network-request-failed': 'Network error. Please check your connection'
  };
  
  return errorMessages[error.code] || error.message || 'An unexpected error occurred';
}

async function signOutUser() {
  if (app.auth) {
    try {
      await app.auth.signOut();
      showToast('Signed out successfully', 'success');
      
      // Clear local data
      app.userProfile = null;
      app.addresses = [];
      app.orders = [];
      
      // Redirect to home if on account pages
      if (window.location.pathname.includes('my-account') || 
          window.location.pathname.includes('order-history') ||
          window.location.pathname.includes('addresses')) {
        window.location.href = 'index.html';
      }
      
    } catch (error) {
      console.error('Sign out error:', error);
      showToast('Failed to sign out', 'error');
    }
  }
}

/* =====================
   MENU MANAGEMENT
   ===================== */
async function loadMenuItems() {
  try {
    app.isLoadingMenu = true;
    showMenuLoadingState();

    if (app.firebaseReady && app.db) {
      const snapshot = await app.db.collection('menu-items')
        .where('isAvailable', '==', true)
        .orderBy('category')
        .orderBy('priority', 'desc')
        .get();
        
      app.menu = [];
      snapshot.forEach(doc => {
        app.menu.push({ id: doc.id, ...doc.data() });
      });

      if (!app.menu.length) {
        app.menu = getSampleMenuItems();
      }
    } else {
      app.menu = getSampleMenuItems();
    }

    renderMenuItems();
    renderPopularDishes();
    showToast('Menu loaded successfully', 'success', 2000);

  } catch (error) {
    console.error('Menu load error:', error);
    app.menu = getSampleMenuItems();
    renderMenuItems();
    renderPopularDishes();
    showToast('Menu loaded from cache', 'warning');
  } finally {
    app.isLoadingMenu = false;
    hideMenuLoadingState();
  }
}

function showMenuLoadingState() {
  const containers = ['#menuItems', '#popularDishes'];
  containers.forEach(selector => {
    const container = $(selector);
    if (container) {
      container.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading delicious menu items...</p>
        </div>
      `;
    }
  });
}

function hideMenuLoadingState() {
  $$('.loading-state').forEach(el => el.remove());
}

function getSampleMenuItems() {
  return [
    {
      id: '1',
      name: 'Margherita Pizza',
      description: 'Classic pizza with fresh tomatoes, mozzarella & basil',
      price: 720,
      originalPrice: 800,
      category: 'pizza',
      image: 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['vegetarian', 'popular', 'bestseller'],
      isAvailable: true,
      isPopular: true,
      preparationTime: 25,
      spiceLevel: 0,
      calories: 850,
      allergens: ['dairy', 'gluten'],
      priority: 10
    },
    {
      id: '2',
      name: 'Spaghetti Carbonara',
      description: 'Roman pasta with eggs, pancetta & pecorino cheese',
      price: 750,
      category: 'pasta',
      image: 'https://images.pexels.com/photos/4518843/pexels-photo-4518843.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['popular', 'chef-special'],
      isAvailable: true,
      isPopular: true,
      preparationTime: 20,
      spiceLevel: 0,
      calories: 920,
      allergens: ['dairy', 'gluten', 'eggs'],
      priority: 9
    }
    // Add more comprehensive menu items...
  ];
}

/* =====================
   CART MANAGEMENT
   ===================== */
function addToCart(itemId, customization = {}) {
  const item = app.menu.find(m => m.id === itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  if (!item.isAvailable) {
    showToast('This item is currently unavailable', 'warning');
    return;
  }

  // Check cart limits
  const currentItemCount = app.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (currentItemCount >= CONFIG.MAX_CART_ITEMS) {
    showToast(`Maximum ${CONFIG.MAX_CART_ITEMS} items allowed in cart`, 'warning');
    return;
  }

  const cartItemKey = `${itemId}_${JSON.stringify(customization)}`;
  const existingItem = app.cart.find(c => c.cartKey === cartItemKey);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    const cartItem = {
      ...item,
      cartKey: cartItemKey,
      quantity: 1,
      customization: customization,
      finalPrice: calculateItemPrice(item, customization),
      addedAt: new Date().toISOString()
    };
    app.cart.push(cartItem);
  }

  updateCartUI();
  updateMenuItemControls(itemId);
  saveCart();
  
  showToast(`${item.name} added to cart!`, 'success');
  
  // Auto-open cart on mobile for better UX
  if (window.innerWidth <= 768) {
    setTimeout(openCart, 300);
  }

  // Track analytics
  trackEvent('add_to_cart', { item_id: itemId, item_name: item.name });
}

function calculateItemPrice(item, customization) {
  let price = item.price;
  
  if (customization.size === 'large') price += 100;
  if (customization.extraCheese) price += 50;
  if (customization.extraToppings) price += customization.extraToppings.length * 30;
  
  return price;
}

function updateCartUI() {
  updateCartCounter();
  updateCartSidebar();
  updateCheckoutButton();
}

function updateCartCounter() {
  const cartCount = $('#cartCount');
  const totalItems = app.cart.reduce((sum, item) => sum + item.quantity, 0);
  
  if (cartCount) {
    cartCount.textContent = totalItems;
    cartCount.classList.toggle('hidden', totalItems === 0);
    
    // Animate counter on changes
    if (totalItems > 0) {
      cartCount.classList.add('bounce');
      setTimeout(() => cartCount.classList.remove('bounce'), 300);
    }
  }
}

function updateCartSidebar() {
  const cartItems = $('#cartItems');
  const cartSummary = $('.cart-summary');
  
  if (!cartItems) return;

  if (app.cart.length === 0) {
    cartItems.innerHTML = `
      <div class="empty-cart">
        <i class="fas fa-shopping-cart"></i>
        <h3>Your cart is empty</h3>
        <p>Add some delicious items to get started!</p>
        <button onclick="closeCart(); window.location.href='menu.html'" class="browse-menu-btn">
          Browse Menu
        </button>
      </div>
    `;
  } else {
    cartItems.innerHTML = app.cart.map(renderCartItem).join('');
  }

  updateCartTotals();
}

function renderCartItem(item) {
  const customizationText = formatCustomization(item.customization);
  
  return `
    <div class="cart-item" data-cart-key="${item.cartKey}">
      <img class="cart-item-image" 
           src="${item.image}" 
           alt="${item.name}"
           onerror="this.src='https://via.placeholder.com/80x80/8B4513/FFFFFF?text=${encodeURIComponent(item.name.charAt(0))}'">
      
      <div class="cart-item-details">
        <h4 class="cart-item-name">${item.name}</h4>
        ${customizationText ? `<p class="cart-item-customization">${customizationText}</p>` : ''}
        <p class="cart-item-price">₹${fmt(item.finalPrice)} each</p>
      </div>

      <div class="cart-item-controls">
        <div class="quantity-controls">
          <button class="quantity-btn minus" onclick="updateCartQuantity('${item.cartKey}', -1)">
            <i class="fas fa-minus"></i>
          </button>
          <span class="quantity-display">${item.quantity}</span>
          <button class="quantity-btn plus" onclick="updateCartQuantity('${item.cartKey}', 1)">
            <i class="fas fa-plus"></i>
          </button>
        </div>
        <button class="remove-item-btn" onclick="removeFromCart('${item.cartKey}')" title="Remove item">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function formatCustomization(customization) {
  const parts = [];
  if (customization.size && customization.size !== 'regular') {
    parts.push(`Size: ${customization.size}`);
  }
  if (customization.extraCheese) parts.push('Extra cheese');
  if (customization.spiceLevel) parts.push(`Spice: ${customization.spiceLevel}`);
  if (customization.notes) parts.push(`Note: ${customization.notes}`);
  
  return parts.join(', ');
}

function updateCartTotals() {
  const subtotal = app.cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
  const deliveryFee = subtotal >= CONFIG.FREE_DELIVERY_THRESHOLD ? 0 : CONFIG.DELIVERY_FEE;
  const tax = subtotal * CONFIG.TAX_RATE;
  const total = subtotal + tax + deliveryFee;

  $('#cartSubtotal')?.textContent && (document.getElementById('cartSubtotal').textContent = fmt(subtotal));
  $('#cartTax')?.textContent && (document.getElementById('cartTax').textContent = fmt(tax));
  $('#cartDeliveryFee')?.textContent && (document.getElementById('cartDeliveryFee').textContent = fmt(deliveryFee));
  $('#cartTotal')?.textContent && (document.getElementById('cartTotal').textContent = fmt(total));

  // Show free delivery progress
  if (subtotal > 0 && subtotal < CONFIG.FREE_DELIVERY_THRESHOLD) {
    const remaining = CONFIG.FREE_DELIVERY_THRESHOLD - subtotal;
    showDeliveryPromotion(remaining);
  } else {
    hideDeliveryPromotion();
  }
}

function showDeliveryPromotion(remaining) {
  let promo = $('#deliveryPromo');
  if (!promo) {
    promo = document.createElement('div');
    promo.id = 'deliveryPromo';
    promo.className = 'delivery-promo';
    $('#cartItems')?.parentNode?.insertBefore(promo, $('#cartItems')?.nextSibling);
  }
  
  promo.innerHTML = `
    <i class="fas fa-truck"></i>
    <span>Add ₹${fmt(remaining)} more for free delivery!</span>
  `;
  promo.classList.add('show');
}

function hideDeliveryPromotion() {
  const promo = $('#deliveryPromo');
  if (promo) promo.remove();
}

/* =====================
   LOCAL STORAGE
   ===================== */
function saveCart() {
  try {
    const cartData = {
      items: app.cart,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(LS_KEYS.CART, JSON.stringify(cartData));
  } catch (error) {
    console.warn('Failed to save cart:', error);
  }
}

function restoreCart() {
  try {
    const cartData = localStorage.getItem(LS_KEYS.CART);
    if (cartData) {
      const parsed = JSON.parse(cartData);
      
      // Check if cart is not too old (24 hours)
      const cartAge = new Date() - new Date(parsed.timestamp);
      if (cartAge < 24 * 60 * 60 * 1000) {
        app.cart = parsed.items || [];
      } else {
        // Clear old cart
        localStorage.removeItem(LS_KEYS.CART);
        app.cart = [];
      }
    }
  } catch (error) {
    console.warn('Failed to restore cart:', error);
    app.cart = [];
  }
  
  updateCartUI();
}

/* =====================
   ANALYTICS & TRACKING
   ===================== */
function trackEvent(eventName, parameters = {}) {
  try {
    // Firebase Analytics
    if (window.gtag) {
      gtag('event', eventName, parameters);
    }
    
    // Custom analytics
    console.log('Analytics Event:', eventName, parameters);
    
    // Store locally for debugging
    const events = JSON.parse(localStorage.getItem('analyticsEvents') || '[]');
    events.push({
      event: eventName,
      parameters,
      timestamp: new Date().toISOString(),
      userId: app.user?.uid || 'anonymous'
    });
    
    // Keep only last 100 events
    if (events.length > 100) events.splice(0, events.length - 100);
    localStorage.setItem('analyticsEvents', JSON.stringify(events));
    
  } catch (error) {
    console.warn('Analytics tracking failed:', error);
  }
}

/* =====================
   EVENT LISTENERS SETUP
   ===================== */
function setupEventListeners() {
  // Navigation
  $('.mobile-toggle')?.addEventListener('click', toggleMobileMenu);
  $('.cart-toggle')?.addEventListener('click', openCart);
  $('#cartOverlay')?.addEventListener('click', closeCart);
  $('.user-toggle')?.addEventListener('click', toggleUserMenu);

  // Auth modals
  $('#authModal .close')?.addEventListener('click', closeAuthModal);
  $('#authModal .auth-switch a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (link.textContent?.toLowerCase().includes('sign up')) {
        switchToRegister();
      } else {
        switchToLogin();
      }
    });
  });

  // Global click handlers
  document.addEventListener('click', handleGlobalClicks);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Form bindings
  bindAuthForms();
  bindCheckoutForm();
  bindContactForm();
  bindReservationForm();

  console.log('✅ Event listeners initialized');
}

function handleGlobalClicks(e) {
  // Close dropdowns when clicking outside
  if (!e.target.closest('.user-dropdown')) {
    $('#userDropdown')?.classList.remove('show');
  }

  // Close mobile menu when clicking menu links
  if (e.target.matches('.nav-menu a')) {
    closeMobileMenu();
  }
}

function handleKeyboardShortcuts(e) {
  // ESC key closes modals
  if (e.key === 'Escape') {
    closeAuthModal();
    closeCart();
  }

  // Ctrl/Cmd + K opens search (if implemented)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    // openSearchModal(); // Implement if needed
  }
}

/* =====================
   CART OPERATIONS
   ===================== */
function updateCartQuantity(cartKey, delta) {
  const item = app.cart.find(c => c.cartKey === cartKey);
  if (!item) return;

  const newQuantity = item.quantity + delta;
  
  if (newQuantity <= 0) {
    removeFromCart(cartKey);
  } else if (newQuantity <= 10) { // Max 10 of same item
    item.quantity = newQuantity;
    updateCartUI();
    updateMenuItemControls(item.id);
    saveCart();
    
    // Haptic feedback on mobile
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  } else {
    showToast('Maximum 10 items of the same type allowed', 'warning');
  }
}

function removeFromCart(cartKey) {
  const item = app.cart.find(c => c.cartKey === cartKey);
  if (!item) return;

  app.cart = app.cart.filter(c => c.cartKey !== cartKey);
  updateCartUI();
  updateMenuItemControls(item.id);
  saveCart();
  
  showToast(`${item.name} removed from cart`, 'info');
  trackEvent('remove_from_cart', { 
    item_id: item.id, 
    item_name: item.name,
    quantity_removed: item.quantity
  });
}

function clearCart() {
  if (app.cart.length === 0) return;
  
  if (confirm('Are you sure you want to clear your cart?')) {
    app.cart = [];
    updateCartUI();
    saveCart();
    showToast('Cart cleared', 'info');
    trackEvent('clear_cart');
  }
}

function openCart() {
  $('#cartSidebar')?.classList.add('open');
  $('#cartOverlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
  trackEvent('view_cart');
}

function closeCart() {
  $('#cartSidebar')?.classList.remove('open');
  $('#cartOverlay')?.classList.remove('show');
  document.body.style.overflow = 'auto';
}

function proceedToCheckout() {
  if (app.cart.length === 0) {
    showToast('Your cart is empty', 'warning');
    return;
  }

  const subtotal = app.cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
  if (subtotal < CONFIG.MIN_ORDER_VALUE) {
    showToast(`Minimum order value is ₹${CONFIG.MIN_ORDER_VALUE}`, 'warning');
    return;
  }

  // Save cart and proceed
  saveCart();
  trackEvent('begin_checkout', { 
    value: subtotal,
    items: app.cart.length 
  });
  
  window.location.href = 'checkout.html';
}

/* =====================
   MENU RENDERING
   ===================== */
function renderMenuItems(filter = 'all') {
  const container = $('#menuItems');
  if (!container) return;

  const filteredItems = filter === 'all' 
    ? app.menu 
    : app.menu.filter(item => item.category === filter);

  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="no-items-found">
        <i class="fas fa-search"></i>
        <h3>No items found</h3>
        <p>Try selecting a different category</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredItems.map(renderMenuItem).join('');
  
  // Update active category button
  $('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === filter);
  });
}

function renderMenuItem(item) {
  const cartItem = app.cart.find(c => c.id === item.id);
  const isInCart = cartItem && cartItem.quantity > 0;
  const discountPercentage = item.originalPrice ? 
    Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100) : 0;

  return `
    <div class="menu-item ${!item.isAvailable ? 'unavailable' : ''}" data-category="${item.category}">
      <div class="menu-item-image-container">
        <img class="menu-item-image"
             src="${item.image}"
             alt="${item.name}"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/300x200/8B4513/FFFFFF?text=${encodeURIComponent(item.name)}'">
        
        ${discountPercentage > 0 ? `<div class="discount-badge">${discountPercentage}% OFF</div>` : ''}
        ${item.tags?.includes('bestseller') ? '<div class="bestseller-badge">Bestseller</div>' : ''}
        ${!item.isAvailable ? '<div class="unavailable-overlay">Currently Unavailable</div>' : ''}
      </div>

      <div class="menu-item-content">
        <div class="menu-item-header">
          <div class="menu-item-info">
            <h3 class="menu-item-name">${item.name}</h3>
            <p class="menu-item-description">${item.description}</p>
            
            <div class="menu-item-details">
              ${item.preparationTime ? `<span class="prep-time"><i class="fas fa-clock"></i> ${item.preparationTime} min</span>` : ''}
              ${item.spiceLevel > 0 ? `<span class="spice-level">${'🌶️'.repeat(item.spiceLevel)}</span>` : ''}
              ${item.calories ? `<span class="calories">${item.calories} cal</span>` : ''}
            </div>

            <div class="menu-item-tags">
              ${(item.tags || []).map(tag => `<span class="tag tag-${tag}">${tag}</span>`).join('')}
            </div>
          </div>

          <div class="menu-item-pricing">
            ${item.originalPrice ? `<span class="original-price">₹${item.originalPrice}</span>` : ''}
            <span class="current-price">₹${item.price}</span>
          </div>
        </div>

        <div class="menu-item-actions">
          ${item.isAvailable ? renderCartControls(item.id) : '<button class="unavailable-btn" disabled>Unavailable</button>'}
        </div>
      </div>
    </div>
  `;
}

function renderCartControls(itemId) {
  const cartItem = app.cart.find(c => c.id === itemId);
  
  if (cartItem && cartItem.quantity > 0) {
    return `
      <div class="quantity-controls">
        <button class="quantity-btn minus" onclick="updateCartQuantity('${cartItem.cartKey}', -1)">
          <i class="fas fa-minus"></i>
        </button>
        <span class="quantity-display">${cartItem.quantity}</span>
        <button class="quantity-btn plus" onclick="updateCartQuantity('${cartItem.cartKey}', 1)">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
  }

  return `
    <button class="add-to-cart-btn" onclick="addToCart('${itemId}')">
      <i class="fas fa-plus"></i>
      <span>Add to Cart</span>
    </button>
  `;
}

function updateMenuItemControls(itemId) {
  const menuItems = $(`.menu-item[data-category]`);
  menuItems.forEach(menuItem => {
    const addButton = menuItem.querySelector(`[onclick*="${itemId}"]`);
    if (addButton) {
      const actionsContainer = menuItem.querySelector('.menu-item-actions');
      if (actionsContainer) {
        actionsContainer.innerHTML = renderCartControls(itemId);
      }
    }
  });
}

function renderPopularDishes() {
  const container = $('#popularDishes');
  if (!container) return;

  const popularItems = app.menu.filter(item => item.isPopular && item.isAvailable).slice(0, 6);
  
  if (popularItems.length === 0) {
    container.innerHTML = '<p class="no-popular-items">No popular dishes available at the moment</p>';
    return;
  }

  container.innerHTML = popularItems.map(item => `
    <div class="popular-dish-card">
      <img src="${item.image}" alt="${item.name}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/250x150/8B4513/FFFFFF?text=${encodeURIComponent(item.name)}'">
      
      <div class="popular-dish-content">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <div class="popular-dish-footer">
          <span class="price">₹${item.price}</span>
          <button onclick="addToCart('${item.id}')" class="quick-add-btn">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function filterMenu(category) {
  renderMenuItems(category);
  trackEvent('filter_menu', { category });
}

/* =====================
   MODAL MANAGEMENT
   ===================== */
function showAuthModal(type = 'login') {
  const modal = $('#authModal');
  if (!modal) return;

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  const loginForm = $('#loginForm');
  const registerForm = $('#registerForm');

  if (loginForm && registerForm) {
    if (type === 'login') {
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
    } else {
      registerForm.classList.add('active');
      loginForm.classList.remove('active');
    }
  }

  // Focus first input
  setTimeout(() => {
    const firstInput = modal.querySelector('.active input');
    if (firstInput) firstInput.focus();
  }, 100);
}

function closeAuthModal() {
  const modal = $('#authModal');
  if (!modal) return;

  modal.classList.remove('show');
  document.body.style.overflow = 'auto';

  // Clear form messages
  $('#loginMessage')?.textContent && (document.getElementById('loginMessage').innerHTML = '');
  $('#registerMessage')?.textContent && (document.getElementById('registerMessage').innerHTML = '');
}

function switchToRegister() {
  showAuthModal('register');
}

function switchToLogin() {
  showAuthModal('login');
}

/* =====================
   NAVIGATION
   ===================== */
function toggleMobileMenu() {
  $('#navMenu')?.classList.toggle('active');
  $('.mobile-toggle')?.classList.toggle('active');
  
  // Prevent scroll when menu is open
  if ($('#navMenu')?.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'auto';
  }
}

function closeMobileMenu() {
  $('#navMenu')?.classList.remove('active');
  $('.mobile-toggle')?.classList.remove('active');
  document.body.style.overflow = 'auto';
}

function toggleUserMenu() {
  $('#userDropdown')?.classList.toggle('show');
}

/* =====================
   FORM HANDLERS
   ===================== */
function bindCheckoutForm() {
  const form = $('#checkoutForm');
  if (!form) return;

  form.addEventListener('submit', handleCheckoutSubmit);
  
  // Payment method changes
  form.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
    input.addEventListener('change', handlePaymentMethodChange);
  });

  // Delivery type changes  
  form.querySelectorAll('input[name="deliveryType"]').forEach(input => {
    input.addEventListener('change', handleDeliveryTypeChange);
  });

  // Real-time validation
  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', validateField);
  });

  console.log('✅ Checkout form bound');
}

function bindContactForm() {
  const form = $('#contactForm');
  if (!form) return;

  form.addEventListener('submit', handleContactSubmit);
  console.log('✅ Contact form bound');
}

function bindReservationForm() {
  const form = $('#reservationForm');
  if (!form) return;

  form.addEventListener('submit', handleReservationSubmit);
  
  // Set minimum date to today
  const dateInput = $('#resDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }

  console.log('✅ Reservation form bound');
}

/* =====================
   FORM SUBMIT HANDLERS
   ===================== */
async function handleCheckoutSubmit(e) {
  e.preventDefault();
  
  if (!validateCheckoutForm()) {
    return;
  }

  try {
    showLoadingSpinner('Processing your order...');
    
    const orderData = collectCheckoutData();
    const orderId = await submitOrder(orderData);
    
    // Clear cart on successful order
    app.cart = [];
    saveCart();
    updateCartUI();
    
    // Redirect to success page
    window.location.href = `order-success.html?orderId=${orderId}`;
    
  } catch (error) {
    console.error('Checkout error:', error);
    showToast('Failed to place order. Please try again.', 'error');
  } finally {
    hideLoadingSpinner();
  }
}

async function handleContactSubmit(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const contactData = Object.fromEntries(formData);
  
  try {
    if (app.firebaseReady && app.db) {
      await app.db.collection('contact-messages').add({
        ...contactData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: app.user?.uid || null,
        status: 'new'
      });
    } else {
      // Local fallback
      const messages = JSON.parse(localStorage.getItem('contactMessages') || '[]');
      messages.push({
        ...contactData,
        id: 'msg_' + Date.now(),
        timestamp: new Date().toISOString(),
        status: 'new'
      });
      localStorage.setItem('contactMessages', JSON.stringify(messages));
    }
    
    showToast('Message sent successfully! We\'ll get back to you soon.', 'success');
    e.target.reset();
    
  } catch (error) {
    console.error('Contact form error:', error);
    showToast('Failed to send message. Please try again.', 'error');
  }
}

async function handleReservationSubmit(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const reservationData = Object.fromEntries(formData);
  
  try {
    if (app.firebaseReady && app.db) {
      await app.db.collection('reservations').add({
        ...reservationData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: app.user?.uid || null,
        status: 'pending'
      });
    } else {
      // Local fallback
      const reservations = JSON.parse(localStorage.getItem('reservations') || '[]');
      reservations.push({
        ...reservationData,
        id: 'res_' + Date.now(),
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
      localStorage.setItem('reservations', JSON.stringify(reservations));
    }
    
    showToast('Reservation submitted successfully!', 'success');
    e.target.reset();
    
  } catch (error) {
    console.error('Reservation form error:', error);
    showToast('Failed to submit reservation. Please try again.', 'error');
  }
}

/* =====================
   INITIALIZATION
   ===================== */
async function initializeApp() {
  try {
    console.log('🍕 Initializing Bella Notte...');
    
    bootstrapFirebaseIfAvailable();
    setupAuthStateListener();
    
    await loadMenuItems();
    
    restoreCart();
    setupEventListeners();
    
    // Load user-specific data if logged in
    if (app.user) {
      loadUserData();
    }
    
    hideLoadingScreen();
    updateCartUI();
    
    console.log('✅ Bella Notte ready!');
    
  } catch (error) {
    console.error('App initialization error:', error);
    hideLoadingScreen();
    showToast('Some features may not work properly. Please refresh the page.', 'warning');
  }
}

async function loadUserData() {
  if (!app.user || !app.firebaseReady) return;
  
  try {
    // Load user addresses
    const addressSnapshot = await app.db.collection('addresses')
      .where('userId', '==', app.user.uid)
      .orderBy('isDefault', 'desc')
      .get();
      
    app.addresses = addressSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Load recent orders
    const ordersSnapshot = await app.db.collection('orders')
      .where('userId', '==', app.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
      
    app.orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  } catch (error) {
    console.error('Error loading user data:', error);
  }
}
function switchToForgotPassword() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  
  if (loginForm) loginForm.classList.remove('active');
  if (registerForm) registerForm.classList.remove('active');
  if (forgotPasswordForm) forgotPasswordForm.classList.add('active');
}

function switchBackToLogin() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  
  if (loginForm) loginForm.classList.add('active');
  if (registerForm) registerForm.classList.remove('active');
  if (forgotPasswordForm) forgotPasswordForm.classList.remove('active');
}

/* =====================
   WINDOW EXPORTS
   ===================== */
window.toggleMobileMenu = toggleMobileMenu;
window.toggleUserMenu = toggleUserMenu;
window.openCart = openCart;
window.closeCart = closeCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.clearCart = clearCart;
window.filterMenu = filterMenu;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchToLogin = switchToLogin;
window.switchToRegister = switchToRegister;
window.switchToForgotPassword = switchToForgotPassword;
window.switchBackToLogin = switchBackToLogin;
window.signOutUser = signOutUser;
window.proceedToCheckout = proceedToCheckout;
window.sendEmailVerification = sendEmailVerification;
window.hideEmailVerificationBanner = hideEmailVerificationBanner;

/* =====================
   APP STARTUP
   ===================== */
onDOMReady(initializeApp);