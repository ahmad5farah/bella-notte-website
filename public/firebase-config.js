// ========================================
// BELLA NOTTE - FIREBASE CONFIGURATION (FIXED)
// ========================================

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCD5SRID01l3R3l37KQBu6QQm32NMsyZNw",
    authDomain: "bella-notte-18d54.firebaseapp.com",
    projectId: "bella-notte-18d54",
    storageBucket: "bella-notte-18d54.firebasestorage.app",
    messagingSenderId: "365493407337",
    appId: "1:365493407337:web:b8b1e85f64fc89b3d99cf8",
    measurementId: "G-R6LD3VKNGK"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    window.auth = firebase.auth();
    window.db = firebase.firestore();
    console.log('🔥 Firebase initialized successfully!');
} else {
    console.warn('⚠️ Firebase not loaded. Some features may not work.');
}