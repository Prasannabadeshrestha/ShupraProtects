import { auth, signOut } from './public/firebase-config.js';

// Check if user is authenticated
auth.onAuthStateChanged((user) => {
    if (!user) {
        // No user is signed in, redirect to login
        window.location.href = 'login.html';
    } else {
        // User is signed in
        console.log('User is authenticated:', user.email);
        
        // Store user info in chrome storage
        chrome.storage.local.set({
            userEmail: user.email,
            userId: user.uid,
            isLoggedIn: true
        });
    }
});

// Logout function that you can call from your dashboard
export async function logout() {
    try {
        await signOut(auth);
        
        // Clear chrome storage
        chrome.storage.local.remove(['userEmail', 'userId', 'isLoggedIn']);
        
        // Redirect to login page
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

// Make logout available globally
window.logout = logout;