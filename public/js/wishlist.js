/* ═══════════════════════════════════════════
   Wishlist Manager — Geeta Kalp
   ═══════════════════════════════════════════ */

const WishlistManager = (() => {
    let wishlistIds = new Set();
    let currentUid = null;
    let initialized = false;

    function updateBadge() {
        const el = document.getElementById('wishlistCount');
        if (!el) return;
        const count = wishlistIds.size;
        el.textContent = count;
        el.classList.toggle('has-items', count > 0);
    }

    function updateButtons() {
        document.querySelectorAll('[data-wishlist-id]').forEach(btn => {
            const pid = btn.dataset.wishlistId;
            btn.classList.toggle('active', wishlistIds.has(pid));
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = wishlistIds.has(pid) ? 'fas fa-heart' : 'far fa-heart';
            }
        });
    }

    async function load(uid) {
        currentUid = uid;
        try {
            const res = await fetch(`/api/wishlist/${uid}`);
            const data = await res.json();
            if (data.success) {
                wishlistIds = new Set(data.productIds);
            }
        } catch (e) {
            console.error('Wishlist load error:', e);
        }
        updateBadge();
        updateButtons();
    }

    async function toggle(productId) {
        if (!currentUid) {
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }

        const wasInWishlist = wishlistIds.has(productId);

        // Optimistic update
        if (wasInWishlist) {
            wishlistIds.delete(productId);
        } else {
            wishlistIds.add(productId);
        }
        updateBadge();
        updateButtons();

        // Animate the button
        const btn = document.querySelector(`[data-wishlist-id="${productId}"]`);
        if (btn) {
            btn.classList.add('pop');
            setTimeout(() => btn.classList.remove('pop'), 400);
        }

        try {
            if (wasInWishlist) {
                await fetch(`/api/wishlist/${currentUid}/${productId}`, { method: 'DELETE' });
                if (typeof showToast === 'function') showToast('Removed from wishlist');
            } else {
                await fetch('/api/wishlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: currentUid, productId })
                });
                if (typeof showToast === 'function') showToast('Added to wishlist ♥');
            }
        } catch (e) {
            // Revert on error
            if (wasInWishlist) {
                wishlistIds.add(productId);
            } else {
                wishlistIds.delete(productId);
            }
            updateBadge();
            updateButtons();
            if (typeof showToast === 'function') showToast('Failed to update wishlist', 'error');
        }
    }

    function has(productId) {
        return wishlistIds.has(productId);
    }

    function getIds() {
        return Array.from(wishlistIds);
    }

    function init() {
        if (initialized) return;
        initialized = true;

        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    load(user.uid);
                } else {
                    currentUid = null;
                    wishlistIds.clear();
                    updateBadge();
                    updateButtons();
                }
            });
        }
    }

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { toggle, has, getIds, load, updateButtons, updateBadge };
})();

// Global showToast if not already defined
if (typeof showToast === 'undefined') {
    window.showToast = function(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}
