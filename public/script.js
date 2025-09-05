/* =====================================================================
   BELLA NOTTE — MAIN JAVASCRIPT
   Complete app logic with graceful Firebase fallback
   Features:
   - Firebase bootstrapping (optional) for Auth + Firestore
   - Menu (Firestore -> fallback sample)
   - Cart (localStorage persistence)
   - Checkout flow (works locally; stores to Firestore if available)
   - Reservations form (Firestore if available; else localStorage)
   - Contact form (Firestore if available; else localStorage)
   - Auth modal (Firebase if available; else disabled with UX hints)
   - Toast notifications
   - Responsive nav + cart sidebar + basic utilities
   ===================================================================== */

/* =====================
   GLOBAL APP STATE
   ===================== */
let app = {
  firebaseReady: false,
  auth: null,
  db: null,
  user: null,
  menu: [],
  cart: [],
  isLoadingMenu: false,
  isRestoringCart: false,
};

/* =====================
   SAFE HELPERS
   ===================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const fmt = (n) => Number(n).toFixed(2);

function onDOMReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/* =====================
   TOASTS
   ===================== */
function showToast(message, type = 'info') {
  // type: 'success' | 'error' | 'warning' | 'info'
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${
      type === 'success' ? 'check-circle' :
      type === 'error' ? 'times-circle' :
      type === 'warning' ? 'exclamation-triangle' :
      'info-circle'
    }"></i>
    <span>${message}</span>
  `;
  (document.body || document.documentElement).appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* =====================
   LOADING SCREEN
   ===================== */
function hideLoadingScreen() {
  const loading = $('#loadingScreen');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => (loading.style.display = 'none'), 400);
  }
}

/* =====================
   LOCAL STORAGE
   ===================== */
const LS_KEYS = {
  CART: 'bellaNotteCart',
  RESERVATION: 'bellaNotteReservationDraft',
  CONTACT: 'bellaNotteContactDraft',
};

function saveCart() {
  try {
    localStorage.setItem(LS_KEYS.CART, JSON.stringify(app.cart));
  } catch (e) {
    console.warn('Cart save failed:', e);
  }
}

function restoreCart() {
  app.isRestoringCart = true;
  try {
    const raw = localStorage.getItem(LS_KEYS.CART);
    app.cart = raw ? JSON.parse(raw) : [];
  } catch {
    app.cart = [];
  }
  updateCartUI();
  app.isRestoringCart = false;
}

/* =====================
   FIREBASE BOOTSTRAP
   ===================== */
function bootstrapFirebaseIfAvailable() {
  try {
    // Available if firebase compat SDKs + firebase-config.js are included
    if (window.firebase && window.firebase.apps) {
      if (!firebase.apps.length) {
        // If firebase-config.js exports window.firebaseConfig
        if (window.firebaseConfig) {
          firebase.initializeApp(window.firebaseConfig);
        } else {
          console.warn('firebase-config.js not found or firebaseConfig missing.');
        }
      }
      // If initialized, set helpers
      if (firebase.apps.length) {
        app.auth = firebase.auth();
        // Prefer compat Firestore
        if (firebase.firestore) {
          app.db = firebase.firestore();
          app.firebaseReady = true;
          console.log('✅ Firebase initialized.');
        }
      }
    }
  } catch (e) {
    console.warn('Firebase not available, continuing in local mode.', e);
    app.firebaseReady = false;
  }
}

/* =====================
   AUTH (Firebase optional)
   ===================== */
function setupAuthStateListener() {
  if (app.auth) {
    app.auth.onAuthStateChanged(async (user) => {
      app.user = user || null;
      updateUserUI();
      if (user) {
        console.log('👤 Signed in:', user.email);
      } else {
        console.log('👤 Signed out');
      }
    });
  } else {
    // Local mode
    app.user = null;
    updateUserUI();
  }
}

function updateUserUI() {
  const userGreeting = $('#userGreeting');
  const userIcon = $('#userIcon');
  const dd = $('#userDropdown');

  if (app.user) {
    if (userGreeting) {
      const first = app.user.displayName ? app.user.displayName.split(' ')[0] : 'User';
      userGreeting.textContent = `Hi, ${first}`;
    }
    if (userIcon) userIcon.className = 'fas fa-user-circle';
    if (dd) {
      dd.innerHTML = `
        <a href="#" id="linkMyAccount">My Account</a>
        <a href="#" id="linkSignOut">Sign Out</a>
      `;
      $('#linkSignOut')?.addEventListener('click', (e) => {
        e.preventDefault();
        signOutUser();
      });
    }
  } else {
    if (userGreeting) userGreeting.textContent = 'Account';
    if (userIcon) userIcon.className = 'fas fa-user';
    if (dd) {
      dd.innerHTML = `
        <a href="#" id="linkLogin">Login</a>
        <a href="#" id="linkRegister">Sign Up</a>
      `;
      $('#linkLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthModal('login');
      });
      $('#linkRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        showAuthModal('register');
      });
    }
  }
}

async function signOutUser() {
  if (app.auth) {
    try {
      await app.auth.signOut();
      showToast('Signed out', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to sign out', 'error');
    }
  } else {
    // local mode: nothing to do
    showToast('Signed out (local)', 'success');
    app.user = null;
    updateUserUI();
  }
}

/* =====================
   AUTH MODAL
   ===================== */
function showAuthModal(type = 'login') {
  const modal = $('#authModal');
  if (!modal) return;

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // activate correct form
  const loginForm = $('#loginForm');
  const registerForm = $('#registerForm');
  if (loginForm && registerForm) {
    if (type === 'login') {
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
    } else {
      loginForm.classList.remove('active');
      registerForm.classList.add('active');
    }
  }
}

function closeAuthModal() {
  const modal = $('#authModal');
  if (!modal) return;
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
}

function switchToRegister() {
  showAuthModal('register');
}
function switchToLogin() {
  showAuthModal('login');
}

/* Attach auth form handlers (if present in DOM) */
function bindAuthForms() {
  // LOGIN
  const loginEl = $('#loginFormElement');
  if (loginEl) {
    loginEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!app.auth) {
        showToast('Auth disabled in local mode.', 'warning');
        return;
      }
      const email = $('#loginEmail')?.value.trim();
      const pass = $('#loginPassword')?.value;
      const msg = $('#loginMessage');

      try {
        await app.auth.signInWithEmailAndPassword(email, pass);
        msg && (msg.innerHTML = `<p class="success">Welcome back!</p>`);
        showToast('Logged in', 'success');
        setTimeout(closeAuthModal, 400);
      } catch (err) {
        console.error(err);
        msg && (msg.innerHTML = `<p class="error">${err.message}</p>`);
        showToast('Login failed', 'error');
      }
    });
  }

  // REGISTER
  const regEl = $('#registerFormElement');
  if (regEl) {
    regEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!app.auth) {
        showToast('Sign up disabled in local mode.', 'warning');
        return;
      }
      const name = $('#registerName')?.value.trim();
      const email = $('#registerEmail')?.value.trim();
      const phone = $('#registerPhone')?.value.trim();
      const pass = $('#registerPassword')?.value;
      const confirm = $('#confirmPassword')?.value;
      const msg = $('#registerMessage');

      if (pass !== confirm) {
        msg && (msg.innerHTML = `<p class="error">Passwords do not match.</p>`);
        return;
      }

      try {
        const cred = await app.auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: name });
        msg && (msg.innerHTML = `<p class="success">Account created. Welcome!</p>`);
        showToast('Registered successfully', 'success');
        setTimeout(closeAuthModal, 600);
      } catch (err) {
        console.error(err);
        msg && (msg.innerHTML = `<p class="error">${err.message}</p>`);
        showToast('Sign up failed', 'error');
      }
    });
  }
}

/* =====================
   NAV + USER MENU
   ===================== */
function toggleMobileMenu() {
  $('#navMenu')?.classList.toggle('active');
  $('.mobile-toggle')?.classList.toggle('active');
}
function closeMobileMenu() {
  $('#navMenu')?.classList.remove('active');
  $('.mobile-toggle')?.classList.remove('active');
}
function toggleUserMenu() {
  $('#userDropdown')?.classList.toggle('show');
}

/* Dismiss user menu when clicking outside */
function globalClickDismissals() {
  document.addEventListener('click', (e) => {
    const dd = $('#userDropdown');
    const toggle = $('.user-toggle');
    if (dd && toggle && !toggle.contains(e.target) && !dd.contains(e.target)) {
      dd.classList.remove('show');
    }
  });
}

/* =====================
   MENU (Firestore -> fallback)
   ===================== */
async function loadMenuItems() {
  try {
    app.isLoadingMenu = true;

    if (app.firebaseReady && app.db) {
      const snap = await app.db.collection('menu-items').get();
      app.menu = [];
      snap.forEach((doc) => app.menu.push({ id: doc.id, ...doc.data() }));
      if (!app.menu.length) {
        app.menu = getSampleMenuItems(); // just in case empty
      }
    } else {
      app.menu = getSampleMenuItems();
    }

    renderMenuItems();
    renderPopularDishes();
    showToast('Menu loaded', 'success');
  } catch (e) {
    console.error('Menu load error:', e);
    app.menu = getSampleMenuItems();
    renderMenuItems();
    renderPopularDishes();
    showToast('Menu loaded (fallback)', 'warning');
  } finally {
    app.isLoadingMenu = false;
  }
}

function getSampleMenuItems() {
  return [
    {
      id: '1',
      name: 'Margherita Pizza',
      description: 'Classic pizza with fresh tomatoes, mozzarella & basil',
      price: 720,
      category: 'pizza',
      image:
        'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['vegetarian', 'popular'],
      isAvailable: true,
      isPopular: true,
    },
    {
      id: '2',
      name: 'Spaghetti Carbonara',
      description: 'Roman pasta with eggs, pancetta & pecorino',
      price: 750,
      category: 'pasta',
      image:
        'https://images.pexels.com/photos/4518843/pexels-photo-4518843.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['popular'],
      isAvailable: true,
      isPopular: true,
    },
    {
      id: '3',
      name: 'Bruschetta Classica',
      description: 'Grilled bread with tomatoes, basil & garlic',
      price: 380,
      category: 'appetizers',
      image:
        'https://images.pexels.com/photos/5677972/pexels-photo-5677972.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['vegetarian'],
      isAvailable: true,
      isPopular: false,
    },
    {
      id: '4',
      name: 'Tiramisu',
      description: 'Mascarpone, espresso-soaked savoiardi & cocoa',
      price: 480,
      category: 'desserts',
      image:
        'https://images.pexels.com/photos/6896379/pexels-photo-6896379.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['popular'],
      isAvailable: true,
      isPopular: true,
    },
    {
      id: '5',
      name: 'Fettuccine Alfredo',
      description: 'Silky parmesan-butter sauce tossed with fettuccine',
      price: 680,
      category: 'pasta',
      image:
        'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['vegetarian'],
      isAvailable: true,
      isPopular: false,
    },
    {
      id: '6',
      name: 'Quattro Stagioni',
      description: 'Artichokes, ham, mushrooms & olives on tomato-mozz base',
      price: 920,
      category: 'pizza',
      image:
        'https://images.pexels.com/photos/708587/pexels-photo-708587.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: [],
      isAvailable: true,
      isPopular: false,
    },
    {
      id: '7',
      name: 'Espresso',
      description: 'Strong Italian coffee, short & bold',
      price: 180,
      category: 'beverages',
      image:
        'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['popular'],
      isAvailable: true,
      isPopular: true,
    },
    {
      id: '8',
      name: 'Panna Cotta',
      description: 'Silky vanilla cream with berry compote',
      price: 420,
      category: 'desserts',
      image:
        'https://images.pexels.com/photos/1099680/pexels-photo-1099680.jpeg?auto=compress&cs=tinysrgb&w=600',
      tags: ['vegetarian'],
      isAvailable: true,
      isPopular: false,
    },
  ];
}

function renderMenuItems(filter = 'all') {
  const container = $('#menuItems');
  if (!container) return;

  const items =
    filter === 'all' ? app.menu : app.menu.filter((i) => i.category === filter);

  container.innerHTML = items
    .map(
      (item) => `
      <div class="menu-item" data-category="${item.category}">
        <img class="menu-item-image"
             src="${item.image}"
             alt="${item.name}"
             onerror="this.src='https://via.placeholder.com/400x250/8B4513/FFFFFF?text=${encodeURIComponent(
               item.name
             )}'" />
        <div class="menu-item-content">
          <div class="menu-item-header">
            <div class="menu-item-info">
              <h3>${item.name}</h3>
              <p>${item.description}</p>
              <div class="menu-item-tags">
                ${
                  (item.tags || [])
                    .map((t) => `<span class="tag ${t}">${t}</span>`)
                    .join('') || ''
                }
              </div>
            </div>
            <div class="menu-item-price">₹${item.price}</div>
          </div>
          <div class="cart-controls">
            ${getCartButtonHTML(item.id)}
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderPopularDishes() {
  const container = $('#popularDishes');
  if (!container) return;

  const popular = app.menu.filter((i) => i.isPopular).slice(0, 3);
  container.innerHTML = popular
    .map(
      (item) => `
      <div class="menu-item">
        <img class="menu-item-image" src="${item.image}" alt="${item.name}" />
        <div class="menu-item-content">
          <div class="menu-item-header">
            <div class="menu-item-info">
              <h3>${item.name}</h3>
              <p>${item.description}</p>
            </div>
            <div class="menu-item-price">₹${item.price}</div>
          </div>
          <button class="add-to-cart-btn" onclick="addToCart('${item.id}')">
            <i class="fas fa-plus"></i> Add to Cart
          </button>
        </div>
      </div>
    `
    )
    .join('');
}

function filterMenu(category) {
  // For compatibility (legacy buttons may call this)
  renderMenuItems(category);
}

/* =====================
   CART
   ===================== */
function getCartButtonHTML(itemId) {
  const ci = app.cart.find((c) => c.id === itemId);
  if (ci && ci.quantity > 0) {
    return `
      <div class="quantity-controls">
        <button class="quantity-btn" onclick="updateQuantity('${itemId}', -1)">
          <i class="fas fa-minus"></i>
        </button>
        <span class="quantity-display">${ci.quantity}</span>
        <button class="quantity-btn" onclick="updateQuantity('${itemId}', 1)">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `;
  }
  return `
    <button class="add-to-cart-btn" onclick="addToCart('${itemId}')">
      <i class="fas fa-plus"></i> Add to Cart
    </button>
  `;
}

function addToCart(itemId) {
  const item = app.menu.find((m) => m.id === itemId);
  if (!item) return;

  const existing = app.cart.find((c) => c.id === itemId);
  if (existing) {
    existing.quantity += 1;
  } else {
    app.cart.push({ ...item, quantity: 1 });
  }

  updateCartUI();
  updateMenuItemControls(itemId);
  saveCart();
  showToast(`${item.name} added to cart!`, 'success');
  openCart(); // UX: open after add
}

function removeFromCart(itemId) {
  const item = app.cart.find((c) => c.id === itemId);
  app.cart = app.cart.filter((c) => c.id !== itemId);
  updateCartUI();
  updateMenuItemControls(itemId);
  saveCart();
  if (item) showToast(`${item.name} removed from cart`, 'info');
}

function updateQuantity(itemId, delta) {
  const item = app.cart.find((c) => c.id === itemId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(itemId);
  } else {
    updateCartUI();
    updateMenuItemControls(itemId);
    saveCart();
  }
}

function updateMenuItemControls(itemId) {
  // Update the button/qty controls inside the menu card that matches the itemId
  // This selector finds any button having onclick with this id inside a cart-controls wrapper
  const cards = $$('.menu-item .cart-controls');
  cards.forEach((wrap) => {
    if (wrap.querySelector(`[onclick*="${itemId}"]`)) {
      wrap.innerHTML = getCartButtonHTML(itemId);
    }
  });
}

function updateCartUI() {
  const cartCount = $('#cartCount');
  const list = $('#cartItems');
  const subtotalEl = $('#cartSubtotal');
  const taxEl = $('#cartTax');
  const totalEl = $('#cartTotal');
  const checkoutBtn = $('.checkout-btn');

  const totalItems = app.cart.reduce((s, i) => s + i.quantity, 0);
  const subtotal = app.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  if (cartCount) {
    cartCount.textContent = totalItems;
    cartCount.classList.toggle('hidden', totalItems === 0);
  }

  if (list) {
    if (!app.cart.length) {
      list.innerHTML = `
        <div class="empty-cart">
          <i class="fas fa-shopping-cart"></i>
          <h3>Your cart is empty</h3>
          <p>Add some delicious items to get started!</p>
        </div>
      `;
    } else {
      list.innerHTML = app.cart
        .map(
          (i) => `
        <div class="cart-item">
          <img class="cart-item-image" src="${i.image}" alt="${i.name}"
               onerror="this.src='https://via.placeholder.com/60x60/8B4513/FFFFFF?text=${encodeURIComponent(
                 i.name.charAt(0)
               )}'" />
          <div class="cart-item-info">
            <h4>${i.name}</h4>
            <p>₹${fmt(i.price)} each</p>
          </div>
          <div class="cart-item-controls">
            <button class="quantity-btn" onclick="updateQuantity('${i.id}', -1)">-</button>
            <span class="quantity-display">${i.quantity}</span>
            <button class="quantity-btn" onclick="updateQuantity('${i.id}', 1)">+</button>
            <button class="quantity-btn remove-btn" onclick="removeFromCart('${i.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `
        )
        .join('');
    }
  }

  if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
  if (taxEl) taxEl.textContent = fmt(tax);
  if (totalEl) totalEl.textContent = fmt(total);

  // ✅ dynamic enable/disable
  if (checkoutBtn) checkoutBtn.disabled = app.cart.length === 0;
}

function openCart() {
  $('#cartSidebar')?.classList.add('open');
  $('#cartOverlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  $('#cartSidebar')?.classList.remove('open');
  $('#cartOverlay')?.classList.remove('show');
  document.body.style.overflow = 'auto';
}

/* =====================
   CHECKOUT FLOW
   ===================== */
function proceedToCheckout() {
  if (!app.cart.length) {
    showToast('Your cart is empty.', 'warning');
    return;
  }
  // Always redirect to checkout page
  saveCart(); // make sure cart is preserved
  window.location.href = 'checkout.html';
}

// =====================
// CHECKOUT: UI + Firestore submit
// =====================

function bindCheckoutForm() {
  const form = document.getElementById('checkoutForm');
  if (!form) return;

  // show/hide payment fields based on method
  form.querySelectorAll('input[name="paymentMethod"]').forEach((el) => {
    el.addEventListener('change', handlePaymentMethodChange);
  });

  // show/hide delivery vs pickup fields
  form.querySelectorAll('input[name="deliveryType"]').forEach((el) => {
    el.addEventListener('change', handleDeliveryTypeChange);
  });

  // populate order summary when modal opens
  const modal = document.getElementById('checkoutModal');
  if (modal) {
    modal.addEventListener('transitionend', updateOrderSummaryOnOpen);
    // also update immediately in case modal already visible
    updateOrderSummary();
  }

  // submit handler
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    await submitOrder();
  });
}

function handlePaymentMethodChange(e) {
  const val = e.target.value;
  const paymentDetails = document.getElementById('paymentDetails');
  const cardFields = document.getElementById('cardFields');
  const upiFields = document.getElementById('upiFields');
  if (!paymentDetails || !cardFields || !upiFields) return;

  paymentDetails.classList.remove('hidden');
  cardFields.classList.add('hidden');
  upiFields.classList.add('hidden');

  if (val === 'card') {
    cardFields.classList.remove('hidden');
  } else if (val === 'upi') {
    upiFields.classList.remove('hidden');
  } else {
    paymentDetails.classList.add('hidden');
  }
}

function handleDeliveryTypeChange(e) {
  const val = e.target.value;
  const deliveryFields = document.getElementById('deliveryFields');
  if (!deliveryFields) return;
  deliveryFields.style.display = val === 'pickup' ? 'none' : 'block';
  updateOrderSummary();
}

function updateOrderSummaryOnOpen(e) {
  // ensure summary is up-to-date when modal becomes visible
  if (e.propertyName === 'opacity') {
    updateOrderSummary();
  }
}

function updateOrderSummary() {
  // render cart items + totals to checkout modal
  const itemsContainer = document.getElementById('checkoutOrderItems');
  const subtotalEl = document.getElementById('checkoutSubtotal');
  const taxEl = document.getElementById('checkoutTax');
  const totalEl = document.getElementById('checkoutTotal');
  const deliveryFeeEl = document.getElementById('checkoutDeliveryFee');

  const items = app.cart || [];
  if (!itemsContainer) return;

  if (!items.length) {
    itemsContainer.innerHTML = '<p>Your cart is empty.</p>';
  } else {
    itemsContainer.innerHTML = items.map(i => `
      <div class="checkout-line">
        <span class="item-name">${i.name} x ${i.quantity}</span>
        <span class="item-price">₹${(i.price * i.quantity).toFixed(2)}</span>
      </div>
    `).join('');
  }

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = subtotal * 0.12;
  const deliveryFee = Number(deliveryFeeEl?.textContent || 40);
  const total = subtotal + tax + deliveryFee;

  if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2);
  if (taxEl) taxEl.textContent = tax.toFixed(2);
  if (deliveryFeeEl) deliveryFeeEl.textContent = deliveryFee.toFixed(2);
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

// validate simple required fields for delivery (for deliveryType=delivery)
function validateCheckoutFormValues(values) {
  // basic checks
  if (!values.deliveryType) return 'Delivery type required';
  if (values.deliveryType === 'delivery') {
    if (!values.name) return 'Name is required';
    if (!values.phone || !/^[0-9]{8,15}$/.test(values.phone.replace(/\s+/g, ''))) return 'Valid phone is required';
    if (!values.addressLine) return 'Address is required';
    if (!values.city) return 'City is required';
    if (!values.pincode || !/^\d{6}$/.test(values.pincode)) return 'Valid 6-digit pincode required';
  }
  // payment check (if UPI/Card require a field)
  if (!values.paymentMethod) return 'Payment method required';
  if (values.paymentMethod === 'upi' && !values.upiId) return 'Please provide UPI ID';
  if (values.paymentMethod === 'card') {
    // We store card info as masked/placeholder only (no real processing here)
    if (!values.cardNumber || !values.cardName) return 'Card details required (card processing not integrated)';
  }
  if (!app.cart || !app.cart.length) return 'Cart is empty';
  return null;
}

async function submitOrder() {
  // collect form values
  const deliveryType = document.querySelector('input[name="deliveryType"]:checked')?.value || 'delivery';
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cod';

  const values = {
    deliveryType,
    paymentMethod,
    name: (document.getElementById('deliveryName')?.value || '').trim(),
    phone: (document.getElementById('deliveryPhone')?.value || '').trim(),
    addressLine: (document.getElementById('deliveryAddressLine')?.value || '').trim(),
    city: (document.getElementById('deliveryCity')?.value || '').trim(),
    pincode: (document.getElementById('deliveryPincode')?.value || '').trim(),
    instructions: (document.getElementById('deliveryInstructions')?.value || '').trim(),
    upiId: (document.getElementById('upiId')?.value || '').trim(),
    cardNumber: (document.getElementById('cardNumber')?.value || '').trim(),
    expiryDate: (document.getElementById('expiryDate')?.value || '').trim(),
    cvv: (document.getElementById('cvv')?.value || '').trim(),
    cardName: (document.getElementById('cardName')?.value || '').trim(),
  };

  // validate
  const validationError = validateCheckoutFormValues(values);
  if (validationError) {
    showToast(validationError, 'error');
    return;
  }

  // compute totals
  const subtotal = app.cart.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = subtotal * 0.12;
  const deliveryFee = Number(document.getElementById('checkoutDeliveryFee')?.textContent || 40);
  const total = subtotal + tax + deliveryFee;

  // prepare order payload
  const orderPayload = {
    items: app.cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity })),
    subtotal,
    tax,
    deliveryFee,
    total,
    paymentMethod: values.paymentMethod,
    deliveryType: values.deliveryType,
    name: values.name || null,
    phone: values.phone || null,
    addressLine: values.addressLine || null,
    city: values.city || null,
    pincode: values.pincode || null,
    instructions: values.instructions || null,
    createdAt: new Date().toISOString(),
    uid: app.user ? app.user.uid : null,
    status: 'pending',
  };

  // If card or upi we mark paymentStatus accordingly (no gateway integration here)
  if (values.paymentMethod === 'card' || values.paymentMethod === 'upi') {
    orderPayload.paymentStatus = 'pending';
    // **Important**: Do NOT store raw CVV or sensitive full card numbers. If card fields are collected,
    // store only masked data or a token returned from a proper payment gateway.
    if (values.cardNumber) {
      orderPayload.cardMasked = values.cardNumber.replace(/\s+/g, '').slice(-4).padStart(values.cardNumber.length, '*');
    }
    if (values.upiId) orderPayload.upiId = values.upiId;
  } else {
    orderPayload.paymentStatus = 'cash_on_delivery';
  }

// write to Firestore if available
try {
  if (app.firebaseReady && app.db && window.firebase?.firestore) {
    const docRef = await app.db.collection('orders').add({
      ...orderPayload,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // clear cart
    app.cart = [];
    saveCart();
    updateCartUI();

    // 🔑 redirect to order confirmation page
    window.location.href = `order-success.html?orderId=${docRef.id}`;
  } else {
    // fallback (local storage)
    const raw = localStorage.getItem('localOrders');
    const orders = raw ? JSON.parse(raw) : [];
    const localId = 'local_' + Date.now();
    orders.push({ id: localId, ...orderPayload });
    localStorage.setItem('localOrders', JSON.stringify(orders));

    app.cart = [];
    saveCart();
    updateCartUI();

    // redirect with local orderId
    window.location.href = `order-success.html?orderId=${localId}`;
  }
} catch (err) {
  console.error('Order submit error', err);
  showToast('Failed to place order. Try again later.', 'error');
}



/* =====================
   RESERVATIONS
   ===================== */
function bindReservationForm() {
  const form = $('#reservationForm');
  if (!form) return;

  // Set min date today
  const dateInput = $('#resDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = $('#resName')?.value.trim();
    const phone = $('#resPhone')?.value.trim();
    const email = $('#resEmail')?.value.trim();
    const date = $('#resDate')?.value;
    const time = $('#resTime')?.value;
    const guests = parseInt($('#resGuests')?.value || '2', 10);
    const note = $('#resNote')?.value.trim() || '';

    const payload = {
      name,
      phone,
      email,
      date,
      time,
      guests,
      note,
      createdAt: new Date().toISOString(),
    };

    try {
      if (app.firebaseReady && app.db) {
        await app.db.collection('reservations').add({
          ...payload,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          uid: app.user ? app.user.uid : null,
        });
      } else {
        // local fallback
        const draftRaw = localStorage.getItem(LS_KEYS.RESERVATION);
        const arr = draftRaw ? JSON.parse(draftRaw) : [];
        arr.push(payload);
        localStorage.setItem(LS_KEYS.RESERVATION, JSON.stringify(arr));
      }
      showToast('Reservation submitted!', 'success');
      form.reset();
    } catch (e2) {
      console.error(e2);
      showToast('Failed to submit reservation', 'error');
    }
  });
}

/* =====================
   CONTACT FORM
   ===================== */
function bindContactForm() {
  const form = $('#contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#contactName')?.value.trim();
    const email = $('#contactEmail')?.value.trim();
    const subject = $('#contactSubject')?.value;
    const message = $('#contactMessageText')?.value.trim();
    const statusBox = $('#contactMessage');

    const payload = {
      name,
      email,
      subject,
      message,
      createdAt: new Date().toISOString(),
    };

    try {
      if (app.firebaseReady && app.db && window.firebase?.firestore) {
        await app.db.collection('contactMessages').add({
          ...payload,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          uid: app.user ? app.user.uid : null,
        });
      } else {
        // local fallback
        const raw = localStorage.getItem(LS_KEYS.CONTACT);
        const arr = raw ? JSON.parse(raw) : [];
        arr.push(payload);
        localStorage.setItem(LS_KEYS.CONTACT, JSON.stringify(arr));
      }

      statusBox &&
        (statusBox.innerHTML = `<p class="success">✅ Thank you, ${name}! Your message has been sent.</p>`);
      showToast('Message sent successfully', 'success');
      form.reset();
    } catch (err) {
      console.error(err);
      statusBox &&
        (statusBox.innerHTML = `<p class="error">❌ Something went wrong. Please try again later.</p>`);
      showToast('Failed to send your message', 'error');
    }
  });
}

/* =====================
   MODALS (GENERIC)
   ===================== */
function showModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
}

/* =====================
   EVENT BINDINGS
   ===================== */
function setupEventListeners() {
  // Nav & user menu
  $('.mobile-toggle')?.addEventListener('click', toggleMobileMenu);
  $('.cart-toggle')?.addEventListener('click', openCart);
  $('#cartOverlay')?.addEventListener('click', closeCart);

  // Auth modal links if present
  $('#authModal .close')?.addEventListener('click', closeAuthModal);
  $$('#authModal .auth-switch a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.textContent?.toLowerCase().includes('sign up')) {
        switchToRegister();
      } else {
        switchToLogin();
      }
    });
  });

  // Global click dismissals
  globalClickDismissals();

  // Bind forms present on page
  bindAuthForms();
bindCheckoutForm();
  bindReservationForm();
  bindContactForm();

  // Enable clicking the checkout button if present
  const checkoutBtn = $('.checkout-btn');
  checkoutBtn?.addEventListener('click', proceedToCheckout);

  console.log('✅ Event listeners bound');
}

/* =====================
   INIT
   ===================== */
onDOMReady(async () => {
  console.log('🍝 Bella Notte — initializing app');
  bootstrapFirebaseIfAvailable();      // optional
  setupAuthStateListener();            // auth state
  await loadMenuItems();               // menu load (db -> fallback)
  restoreCart();                       // restore cart & refresh UI
  setupEventListeners();               // wire events
  hideLoadingScreen();                 // hide preloader if any

  // Initial UI pass to ensure button states are correct
  updateCartUI();

  console.log('🍕 Bella Notte — ready');
});

/* =====================
   EXPORT FOR INLINE HANDLERS
   ===================== */
window.toggleMobileMenu = toggleMobileMenu;
window.toggleUserMenu = toggleUserMenu;
window.openCart = openCart;
window.closeCart = closeCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.filterMenu = filterMenu;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchToLogin = switchToLogin;
window.switchToRegister = switchToRegister;
window.signOutUser = signOutUser;
window.proceedToCheckout = proceedToCheckout;
window.showModal = showModal;
window.closeModal = closeModal;

/* =====================================================================
   END OF FILE
   ===================================================================== */
