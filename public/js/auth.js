// auth.js
if (!window.firebase || !firebase.apps || firebase.apps.length === 0) {
    console.warn('Firebase is not initialized. Customer authentication is disabled.');
}

const auth = window.firebase && firebase.apps && firebase.apps.length > 0 ? firebase.auth() : null;
const googleProvider = auth ? new firebase.auth.GoogleAuthProvider() : null;

let currentUser = null;

if (auth) {
    auth.getRedirectResult()
        .then((result) => {
            if (result && result.user) {
                closeLoginModal();
                showToast('Successfully logged in!', 'success');
                if (window.location.pathname.includes('/checkout')) {
                    window.location.reload();
                }
            }
        })
        .catch((error) => {
            console.error('Google redirect auth error:', error);
            showToast(error.message, 'error');
        });

    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateUserUI();
    });
}

function updateUserUI() {
    const unauthMenu = document.getElementById('unauthMenu');
    const authMenu = document.getElementById('authMenu');
    const nameEl = document.getElementById('userDisplayName');
    const emailEl = document.getElementById('userDisplayEmail');
    const mobileUserBtn = document.getElementById('userMenuBtnMobile');

    if (currentUser) {
        if (unauthMenu) unauthMenu.style.display = 'none';
        if (authMenu) authMenu.style.display = 'block';
        if (nameEl) nameEl.textContent = currentUser.displayName || 'Customer';
        if (emailEl) emailEl.textContent = currentUser.email || '';
        if (mobileUserBtn) {
            mobileUserBtn.classList.add('authenticated');
            mobileUserBtn.setAttribute('aria-label', 'My account');
        }
    } else {
        if (unauthMenu) unauthMenu.style.display = 'block';
        if (authMenu) authMenu.style.display = 'none';
        if (mobileUserBtn) {
            mobileUserBtn.classList.remove('authenticated');
            mobileUserBtn.setAttribute('aria-label', 'Login or register');
        }
    }
}

// User Menu Dropdown Toggle
document.addEventListener('DOMContentLoaded', () => {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuBtnMobile = document.getElementById('userMenuBtnMobile');
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

    if (userMenuBtnMobile) {
        userMenuBtnMobile.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (currentUser) {
                window.location.href = '/profile';
                return;
            }

            openLoginModal();
        });
    }
});

function openLoginModal() {
    const modal = document.getElementById('customerLoginModal');
    if (modal) modal.classList.add('active');
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.style.display = 'none';
    if (typeof closeNav === 'function') closeNav();
    document.body.classList.add('modal-open');
    switchAuthTab('login');
}

function closeLoginModal() {
    const modal = document.getElementById('customerLoginModal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('modal-open');
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
    if (!auth) return showToast('Authentication is not configured', 'error');
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
    if (!auth) return showToast('Authentication is not configured', 'error');
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
    if (!auth) return showToast('Authentication is not configured', 'error');

    const isMobile = window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window;
    if (isMobile) {
        auth.signInWithRedirect(googleProvider);
        return;
    }

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
    if (!auth) return;
    auth.signOut().then(() => {
        showToast('Logged out successfully', 'success');
        if (window.location.pathname.includes('/checkout')) {
            window.location.reload();
        }
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
}
