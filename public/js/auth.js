// auth.js
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;

auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateUserUI();
});

function updateUserUI() {
    const unauthMenu = document.getElementById('unauthMenu');
    const authMenu = document.getElementById('authMenu');
    const nameEl = document.getElementById('userDisplayName');
    const emailEl = document.getElementById('userDisplayEmail');

    if (currentUser) {
        if (unauthMenu) unauthMenu.style.display = 'none';
        if (authMenu) authMenu.style.display = 'block';
        if (nameEl) nameEl.textContent = currentUser.displayName || 'Customer';
        if (emailEl) emailEl.textContent = currentUser.email || '';
    } else {
        if (unauthMenu) unauthMenu.style.display = 'block';
        if (authMenu) authMenu.style.display = 'none';
    }
}

// User Menu Dropdown Toggle
document.addEventListener('DOMContentLoaded', () => {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = userDropdown.style.display === 'block';
            userDropdown.style.display = isVisible ? 'none' : 'block';
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target) && !userMenuBtn.contains(e.target)) {
                userDropdown.style.display = 'none';
            }
        });
    }
});

function openLoginModal() {
    const modal = document.getElementById('customerLoginModal');
    if (modal) modal.classList.add('active');
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.style.display = 'none';
    switchAuthTab('login');
}

function closeLoginModal() {
    const modal = document.getElementById('customerLoginModal');
    if (modal) modal.classList.remove('active');
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const title = document.getElementById('authModalTitle');
    const desc = document.getElementById('authModalDesc');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        tabLogin.style.background = 'var(--bg-card)';
        tabLogin.style.color = 'var(--text)';
        tabLogin.style.boxShadow = 'var(--shadow-sm)';
        tabSignup.style.background = 'transparent';
        tabSignup.style.color = 'var(--text-muted)';
        tabSignup.style.boxShadow = 'none';
        title.textContent = 'Welcome Back';
        desc.textContent = 'Log in to your Geeta Kalp account';
    } else {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        tabSignup.style.background = 'var(--bg-card)';
        tabSignup.style.color = 'var(--text)';
        tabSignup.style.boxShadow = 'var(--shadow-sm)';
        tabLogin.style.background = 'transparent';
        tabLogin.style.color = 'var(--text-muted)';
        tabLogin.style.boxShadow = 'none';
        title.textContent = 'Create Account';
        desc.textContent = 'Join Geeta Kalp today';
    }
}

function loginWithEmail(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    
    auth.signInWithEmailAndPassword(email, pass).then((userCredential) => {
        closeLoginModal();
        showToast('Successfully logged in!', 'success');
        if (window.location.pathname.includes('/checkout')) {
            window.location.reload();
        }
    }).catch((error) => {
        showToast(error.message, 'error');
    });
}

function registerWithEmail(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const passConfirm = document.getElementById('signupConfirmPassword').value;

    if (pass !== passConfirm) {
        return showToast('Passwords do not match', 'error');
    }

    auth.createUserWithEmailAndPassword(email, pass).then((userCredential) => {
        return userCredential.user.updateProfile({
            displayName: name
        });
    }).then(() => {
        closeLoginModal();
        showToast('Account created successfully!', 'success');
        if (window.location.pathname.includes('/checkout')) {
            window.location.reload();
        }
    }).catch((error) => {
        showToast(error.message, 'error');
    });
}

function loginWithGoogle() {
    auth.signInWithPopup(googleProvider).then((result) => {
        closeLoginModal();
        showToast('Successfully logged in!', 'success');
        // If we are on checkout, auto-fill details
        if (window.location.pathname.includes('/checkout')) {
            window.location.reload();
        }
    }).catch((error) => {
        console.error("Google Auth Error:", error);
        showToast(error.message, 'error');
    });
}

function customerLogout() {
    auth.signOut().then(() => {
        showToast('Logged out successfully', 'success');
        if (window.location.pathname.includes('/checkout')) {
            window.location.reload();
        }
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
}
