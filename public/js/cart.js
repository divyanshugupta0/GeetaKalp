/* ═══════════════════════════════════════════════
   Cart Management - Geeta Kalp
   Client-side cart using localStorage
   ═══════════════════════════════════════════════ */

function getCart() {
    try {
        return JSON.parse(localStorage.getItem('geetakalp_cart')) || [];
    } catch {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem('geetakalp_cart', JSON.stringify(cart));
}

function clearCart() {
    localStorage.removeItem('geetakalp_cart');
    updateCartCount();
}

function addToCart(id, name, salePrice, originalPrice, image, quantity = 1) {
    let cart = getCart();
    const existing = cart.find(item => item.id === id);

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({
            id,
            name,
            salePrice: parseFloat(salePrice),
            originalPrice: parseFloat(originalPrice),
            image: image || '',
            quantity
        });
    }

    saveCart(cart);
    updateCartCount();
    showToast(`${name} added to cart!`);
}

function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const countEls = document.querySelectorAll('#cartCount, .cart-count');
    countEls.forEach(el => {
        el.textContent = count;
        if (count > 0) {
            el.classList.add('has-items');
        } else {
            el.classList.remove('has-items');
        }
    });
}

// Toast notification
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize cart count on page load
document.addEventListener('DOMContentLoaded', updateCartCount);

// ─── Generate Checkout Token & Proceed ───
async function proceedToCheckout(event) {
    event.preventDefault();
    
    const cart = getCart();
    if (!cart || cart.length === 0) {
        showToast('Your cart is empty!', 'error');
        return;
    }

    try {
        // Show loading state
        const checkoutBtn = document.getElementById('checkoutBtn');
        const originalText = checkoutBtn.innerHTML;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating Checkout Session...';
        checkoutBtn.style.pointerEvents = 'none';

        // Generate checkout token from server
        const response = await fetch('/api/generate-checkout-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (!data.success || !data.token) {
            showToast('Failed to initialize checkout. Please try again.', 'error');
            checkoutBtn.innerHTML = originalText;
            checkoutBtn.style.pointerEvents = 'auto';
            return;
        }

        // Store token in session storage for use in checkout form
        sessionStorage.setItem('geetakalp_checkout_token', data.token);

        // Redirect to checkout with token
        window.location.href = `/checkout?token=${data.token}`;
    } catch (error) {
        console.error('Checkout token error:', error);
        showToast('An error occurred. Please try again.', 'error');
        const checkoutBtn = document.getElementById('checkoutBtn');
        checkoutBtn.innerHTML = originalText;
        checkoutBtn.style.pointerEvents = 'auto';
    }
}

