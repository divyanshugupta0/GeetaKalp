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
