import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateDoc, doc, setDoc } from './firebase-config.js';

let isLoginMode = true;

// DOM elements
const form = document.getElementById('auth-form');
const nameInput = document.getElementById('name');
const nameGroup = document.getElementById('name-group');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const formTitle = document.getElementById('form-title');
const toggleLink = document.getElementById('toggle-link');
const toggleMessage = document.getElementById('toggle-message');

// Toggle between login and signup
toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
        formTitle.textContent = 'Login';
        submitBtn.textContent = 'Login';
        toggleMessage.textContent = "Don't have an account?";
        toggleLink.textContent = 'Sign up';
        nameGroup.style.display = 'none';
        nameInput.removeAttribute('required');
    } else {
        formTitle.textContent = 'Sign Up';
        submitBtn.textContent = 'Sign Up';
        toggleMessage.textContent = 'Already have an account?';
        toggleLink.textContent = 'Login';
        nameGroup.style.display = 'block';
        nameInput.setAttribute('required', 'required');
    }
    
    // Clear messages
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    
    // Clear previous messages
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    
    // Disable submit button during processing
    submitBtn.disabled = true;
    submitBtn.textContent = isLoginMode ? 'Logging in...' : 'Signing up...';
    
    try {
        if (isLoginMode) {
            // Login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('User logged in:', userCredential.user);
            
            // User info is stored in Firebase Auth automatically
            // You can access it later from the extension using auth.currentUser
            
            successMessage.textContent = 'Login successful! Redirecting...';
            successMessage.style.display = 'block';
            
            // Redirect to home page after 1 second
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1000);
            
        } else {
            // Sign up
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log('User created:', userCredential.user);
            
            // Store user's name in Firestore
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                name: name,
                email: email,
                createdAt: new Date().toISOString()
            });
            
            console.log('User profile created with name:', name);
            
            successMessage.textContent = 'Account created! Redirecting...';
            successMessage.style.display = 'block';
            
            // Redirect to home page after 1 second
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 1000);
        }
        
    } catch (error) {
        console.error('Authentication error:', error);
        
        // Display user-friendly error messages
        let errorText = '';
        switch (error.code) {
            case 'auth/invalid-email':
                errorText = 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorText = 'This account has been disabled.';
                break;
            case 'auth/user-not-found':
                errorText = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorText = 'Incorrect password.';
                break;
            case 'auth/email-already-in-use':
                errorText = 'An account with this email already exists.';
                break;
            case 'auth/weak-password':
                errorText = 'Password should be at least 6 characters.';
                break;
            case 'auth/invalid-credential':
                errorText = 'Invalid email or password.';
                break;
            default:
                errorText = 'An error occurred. Please try again.';
        }
        
        errorMessage.textContent = errorText;
        errorMessage.style.display = 'block';
        
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
    }
});