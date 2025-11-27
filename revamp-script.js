// ReVamp storefront script - connects to API endpoints
// Determine API base URL
const API_BASE = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    try {
        // Determine whether this is the public or admin page
        const isPublic = window.location.pathname.includes('public.html') || document.getElementById('product-grid') !== null;
        const isAdmin = window.location.pathname.includes('admin.html') || document.getElementById('productsGrid') !== null;
        
        // If it's a public page and NOT the admin UI, initialize public logic and stop
        if (isPublic && !isAdmin) {
            initializePage();
            return;
        }
    } catch (err) {
        console.error('Initialization error (non-fatal):', err);
    }

    // Global error handler to show friendly message instead of blank page
    window.addEventListener('error', (e) => {
        try {
            console.error('Unhandled error:', e.error || e.message || e);
            let banner = document.getElementById('js-error-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'js-error-banner';
                banner.style.position = 'fixed';
                banner.style.left = '12px';
                banner.style.right = '12px';
                banner.style.top = '12px';
                banner.style.zIndex = 9999;
                banner.style.background = '#ffe6e6';
                banner.style.color = '#611';
                banner.style.padding = '10px 14px';
                banner.style.border = '1px solid #f5c2c2';
                banner.style.borderRadius = '8px';
                banner.textContent = 'A script error occurred — check the console for details.';
                document.body.appendChild(banner);
            }
        } catch (inner) { console.error(inner); }
    });

    const productsGrid = document.getElementById('productsGrid');
    const productTemplate = document.getElementById('product-template');
    const quickEditBtn = document.getElementById('quickEditBtn');
    const arrangeBtn = document.getElementById('arrangeBtn');
    const searchInput = document.getElementById('search');

    if (!productsGrid) return; // Exit if not on admin page

    let quickEditMode = false;
    let products = [];
    let selectedFiles = [];

    function cryptoRandomId(){
        return Math.random().toString(36).slice(2,9)
    }

    async function render() {
        products = await getProducts();
        productsGrid.innerHTML = '';

        // Add product card
        const addCard = document.createElement('div');
        addCard.className = 'add-card';
        addCard.innerHTML = `<div style="text-align:center"><div class="plus">+</div><div>Add Product</div></div>`;
        addCard.addEventListener('click', onAddProduct);
        productsGrid.appendChild(addCard);

        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.style.cursor = 'pointer';
            
            const imageUrl = (p.images && p.images.length) ? p.images[0] : (p.image || 'img/placeholder.png');
            
            card.innerHTML = `
                <div class="thumb">
                    <img src="${imageUrl}" alt="${p.title || p.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
                    <input class="select" type="checkbox" />
                </div>
                <div class="meta">
                    <div class="title">${p.title || p.name}</div>
                    <div class="price">$${parseFloat(p.price).toFixed(2)}</div>
                </div>
            `;
            
            // Make product card clickable to view product page
            card.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                window.open(`public.html?id=${encodeURIComponent(p.id)}`, '_blank');
            });
            
            productsGrid.appendChild(card);
        });
    }

    function onAddProduct(){
        document.querySelector('.products-grid').style.display = 'none';
        document.body.classList.add('hide-dashboard');
        const editSection = document.getElementById('editProductSection');
        if(editSection) editSection.style.display = 'block';
    }

    // SPA: Back to dashboard from edit-product
    document.addEventListener('click', function(e){
        if(e.target && e.target.id === 'backToDashboard'){
            document.querySelector('.products-grid').style.display = '';
            document.body.classList.remove('hide-dashboard');
            const editSection = document.getElementById('editProductSection');
            if(editSection) editSection.style.display = 'none';
        }
    });

    async function loadProducts(){
        try{
            products = await getProducts();
        }catch(e){
            console.error('Failed to load products:', e);
            products = [];
        }
        render();
    }

    // Form elements
    const editForm = document.getElementById('editForm');
    const saveBtn = document.querySelector('.edit-actions .btn-primary');

    // Category and variation state
    let categories = [];
    let variationGroups = [];

    const variationsContainer = document.getElementById('variationsContainer');
    const newVariationName = document.getElementById('newVariationName');
    const addVariationTypeBtn = document.getElementById('addVariationTypeBtn');
    const variationTemplate = document.getElementById('variation-group-template');

    function renderVariationGroups() {
        if (!variationsContainer) return;
        variationsContainer.innerHTML = '';
        variationGroups.forEach((group, gi) => {
            const node = variationTemplate.content.cloneNode(true);
            const root = node.querySelector('.variation-group');
            const nameInput = node.querySelector('.variation-name');
            const removeBtn = node.querySelector('.remove-variation');
            const tagInput = node.querySelector('.variation-tag-input');
            const addTagBtn = node.querySelector('.add-variation-tag');
            const tagsContainer = node.querySelector('.variation-tags');

            nameInput.value = group.name;
            nameInput.addEventListener('input', (e) => {
                group.name = e.target.value;
            });

            removeBtn.addEventListener('click', () => {
                variationGroups.splice(gi, 1);
                renderVariationGroups();
            });

            function renderGroupTags() {
                tagsContainer.innerHTML = '';
                group.tags.forEach((t, ti) => {
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.textContent = t;
                    const rm = document.createElement('button');
                    rm.type = 'button';
                    rm.className = 'chip-remove';
                    rm.innerHTML = '×';
                    rm.title = 'Remove';
                    rm.onclick = () => { group.tags.splice(ti, 1); renderGroupTags(); };
                    chip.appendChild(rm);
                    tagsContainer.appendChild(chip);
                });
            }

            addTagBtn.addEventListener('click', () => {
                const v = tagInput.value.trim();
                if (v && !group.tags.includes(v)) {
                    group.tags.push(v);
                    tagInput.value = '';
                    renderGroupTags();
                }
            });
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTagBtn.click(); }
            });

            renderGroupTags();
            variationsContainer.appendChild(root);
        });
    }

    if (addVariationTypeBtn && newVariationName) {
        addVariationTypeBtn.addEventListener('click', () => {
            const name = newVariationName.value.trim() || 'Variation';
            variationGroups.push({ id: cryptoRandomId(), name, tags: [] });
            newVariationName.value = '';
            renderVariationGroups();
        });
        newVariationName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addVariationTypeBtn.click(); } });
    }

    if (editForm) {
        editForm.addEventListener('reset', () => {
            categories = [];
            variationGroups = [];
            renderVariationGroups();
        });
    }

    // Handle form submit for creating product
    if (editForm && saveBtn) {
        saveBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            
            const formData = new FormData();
            const fields = ['title','description','price','currency','shipping','shippingType','status'];
            fields.forEach(name => {
                const el = editForm.querySelector(`[name="${name}"]`);
                if (el) formData.append(name, el.value);
            });
            
            if (Array.isArray(selectedFiles) && selectedFiles.length) {
                selectedFiles.forEach(f => formData.append('images', f));
            }
            
            categories.forEach(cat => formData.append('categories[]', cat));
            formData.append('variations', JSON.stringify(variationGroups));

            try {
                const res = await fetch(`${API_BASE}/api/products`, { 
                    method: 'POST', 
                    body: formData 
                });

                if (!res || !res.ok) {
                    let text;
                    try { text = await res.text(); } catch (e) { text = String(e); }
                    throw new Error('Save failed: ' + (res ? `${res.status} ${res.statusText} - ${text}` : 'no response'));
                }

                let created;
                try {
                    created = await res.json();
                } catch (parseErr) {
                    const txt = await res.text().catch(() => '<<unreadable response>>');
                    console.warn('Failed to parse JSON response:', parseErr, txt);
                    throw new Error('Error saving product: Failed to parse server response');
                }

                // Close edit view
                document.querySelector('.products-grid').style.display = '';
                document.body.classList.remove('hide-dashboard');
                const editSection = document.getElementById('editProductSection');
                if(editSection) editSection.style.display = 'none';
                
                await loadProducts();
                editForm.reset();
                const previews = document.querySelectorAll('.upload-preview');
                previews.forEach(p => p.remove());
                if (Array.isArray(selectedFiles)) selectedFiles.length = 0;
                alert('Product saved');
            } catch (err) {
                console.error(err);
                alert('Save failed: ' + err.message);
            }
        });
    }

    // Dropzone functionality
    const dropzone = document.querySelector('.upload-dropzone');
    const fileInput = document.getElementById('images');
    if (dropzone && fileInput) {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'upload-previews';
        const uploadLarge = dropzone.closest('.upload-large');
        if (uploadLarge && uploadLarge.parentElement) uploadLarge.insertAdjacentElement('afterend', previewContainer);
        else dropzone.parentElement.appendChild(previewContainer);

        function showPreviews(){
            previewContainer.innerHTML = '';
            selectedFiles.slice(0, 20).forEach((file, idx) => {
                const url = URL.createObjectURL(file);
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';
                const img = document.createElement('img');
                img.src = url;
                img.className = 'upload-preview';
                wrapper.appendChild(img);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'preview-remove';
                btn.title = 'Remove image';
                btn.innerText = '✕';
                btn.style.position = 'absolute';
                btn.style.top = '6px';
                btn.style.right = '6px';
                btn.style.background = 'rgba(0,0,0,0.6)';
                btn.style.color = '#fff';
                btn.style.border = 'none';
                btn.style.borderRadius = '12px';
                btn.style.width = '22px';
                btn.style.height = '22px';
                btn.style.cursor = 'pointer';
                btn.addEventListener('click', () => {
                    selectedFiles.splice(idx, 1);
                    showPreviews();
                });
                wrapper.appendChild(btn);
                previewContainer.appendChild(wrapper);
            });
        }

        function addFilesFromList(fileList){
            const arr = Array.from(fileList || []);
            arr.forEach(f => selectedFiles.push(f));
            showPreviews();
        }

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length) {
                addFilesFromList(dt.files);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (fileInput.files && fileInput.files.length) {
                addFilesFromList(fileInput.files);
                fileInput.value = '';
            }
        });
    }

    if (quickEditBtn) {
        quickEditBtn.addEventListener('click', () => {
            quickEditMode = !quickEditMode;
            quickEditBtn.textContent = quickEditMode ? 'Done' : 'Quick edit';
            document.body.classList.toggle('quick-edit-mode', quickEditMode);
        });
    }

    if (arrangeBtn) {
        arrangeBtn.addEventListener('click', () => {
            alert('Arrange shop — drag & drop would go here (not implemented)');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => render());
    }

    // Initial load
    loadProducts();
});

// API functions
async function getProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/products`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

async function createProduct(productData) {
    try {
        const response = await fetch(`${API_BASE}/api/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        return await response.json();
    } catch (error) {
        console.error('Error creating product:', error);
        throw error;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initializePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    if (productId) {
        showProductDetail(productId);
    } else {
        showProductGrid();
    }
}

async function showProductDetail(productId) {
    try {
        const products = await getProducts();
        
        if (!Array.isArray(products)) {
            console.error('Products is not an array:', products);
            showProductGrid();
            return;
        }
        
        const product = products.find(p => p.id === productId);
        
        if (!product) {
            console.error('Product not found:', productId);
            showProductGrid();
            return;
        }
        
        const gridView = document.getElementById('grid-view');
        const productView = document.getElementById('product-view');
        
        if (gridView) gridView.style.display = 'none';
        if (productView) productView.style.display = 'block';
        
        // Populate product details
        const detailImage = document.getElementById('product-detail-image');
        const detailTitle = document.getElementById('product-detail-title');
        const detailPrice = document.getElementById('product-detail-price');
        const detailDescription = document.getElementById('product-detail-description');
        const backBtn = document.getElementById('back-btn');
        
        if (detailImage) {
            detailImage.src = (product.images && product.images.length) ? product.images[0] : (product.image || 'img/placeholder.png');
            detailImage.alt = product.title || product.name;
        }
        if (detailTitle) detailTitle.textContent = product.title || product.name;
        if (detailPrice) detailPrice.textContent = `$ ${parseFloat(product.price).toFixed(2)}`;
        if (detailDescription) detailDescription.textContent = product.description || 'No description available.';

        // Status
        const statusEl = document.querySelector('.product-status');
        if (statusEl) {
            statusEl.textContent = (product.status || '');
        }

        // Render variation selects
        const optionsContainer = document.querySelector('.product-options');
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            const variationGroups = Array.isArray(product.variations) ? product.variations : [];
            if (variationGroups.length === 0) {
                const defaultSelect = document.createElement('select');
                defaultSelect.className = 'product-select';
                const opt = document.createElement('option');
                opt.textContent = 'Select Options';
                defaultSelect.appendChild(opt);
                optionsContainer.appendChild(defaultSelect);
            } else {
                variationGroups.forEach(group => {
                    const label = document.createElement('label');
                    label.className = 'variation-label';
                    label.textContent = group.name || 'Option';
                    const sel = document.createElement('select');
                    sel.className = 'product-select';
                    const placeholder = document.createElement('option');
                    placeholder.textContent = `Select ${group.name}`;
                    placeholder.value = '';
                    sel.appendChild(placeholder);
                    (Array.isArray(group.tags) ? group.tags : []).forEach(tag => {
                        const o = document.createElement('option');
                        o.value = tag;
                        o.textContent = tag;
                        sel.appendChild(o);
                    });
                    optionsContainer.appendChild(sel);
                });
            }

            const addBtn = document.createElement('button');
            addBtn.id = 'add-to-cart-btn';
            addBtn.className = 'add-to-cart-btn';
            addBtn.textContent = 'Add to Cart';
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const selects = optionsContainer.querySelectorAll('select.product-select');
                const selected = [];
                selects.forEach(s => {
                    if (s.value) selected.push(s.value);
                });
                addToCart(productId, selected);
            });
            optionsContainer.appendChild(addBtn);
        }
        
        await loadOtherProducts(productId, products);
        
        if (backBtn) {
            backBtn.onclick = function() {
                window.history.pushState({}, '', 'public.html');
                showProductGrid();
            };
        }
    } catch (error) {
        console.error('Error showing product detail:', error);
        showProductGrid();
    }
}

async function renderPublicGrid(filterCategory = 'all', searchQuery = '') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    
    try {
        let products = await getProducts();
        
        if (!Array.isArray(products)) {
            console.error('Products is not an array:', products);
            products = [];
        }
        
        if (filterCategory !== 'all') {
            products = products.filter(p => p.category === filterCategory);
        }
        
        if (searchQuery) {
            products = products.filter(p => 
                (p.name || p.title || '').toLowerCase().includes(searchQuery) ||
                (p.description || '').toLowerCase().includes(searchQuery)
            );
        }
        
        if (!products.length) {
            grid.innerHTML = '<p class="empty">No products found.</p>';
            return;
        }
        
        grid.innerHTML = products.map(product => `
            <div class="product-card" onclick="navigateToProduct('${product.id}')" style="cursor: pointer;">
                <img src="${(product.images && product.images.length) ? product.images[0] : (product.image || 'img/placeholder.png')}" alt="${product.title || product.name}" />
                <div class="title">${escapeHtml(product.title || product.name)}</div>
                <div class="price">$${parseFloat(product.price).toFixed(2)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error rendering products:', error);
        grid.innerHTML = '<p class="empty">Error loading products. Please try again.</p>';
    }
}

function navigateToProduct(productId) {
    window.history.pushState({}, '', `public.html?id=${encodeURIComponent(productId)}`);
    showProductDetail(productId);
}

async function loadOtherProducts(currentProductId, allProducts) {
    const otherProductsGrid = document.getElementById('other-products-grid');
    if (!otherProductsGrid) return;
    
    const otherProducts = allProducts.filter(p => p.id !== currentProductId).slice(0, 4);
    
    if (!otherProducts.length) {
        otherProductsGrid.innerHTML = '<p class="empty">No other products available.</p>';
        return;
    }
    
    otherProductsGrid.innerHTML = otherProducts.map(product => `
        <div class="product-card" onclick="navigateToProduct('${product.id}')" style="cursor: pointer;">
            <img src="${(product.images && product.images.length) ? product.images[0] : (product.image || 'img/placeholder.png')}" alt="${product.title || product.name}" />
            <div class="title">${escapeHtml(product.title || product.name)}</div>
            <div class="price">$${parseFloat(product.price).toFixed(2)}</div>
        </div>
    `).join('');
}

// Cart functionality
let cart = JSON.parse(localStorage.getItem('revamp_cart') || '[]');

function saveCart() {
    localStorage.setItem('revamp_cart', JSON.stringify(cart));
    updateCartCount();
}

function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = totalItems;
    }
}

async function addToCart(productId, selectedOptions = []) {
    const products = await getProducts();
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        alert('Product not found');
        return;
    }
    
    const existingItem = cart.find(item => item.productId === productId && JSON.stringify(item.options||[]) === JSON.stringify(selectedOptions));
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            productId: productId,
            quantity: 1,
            name: product.title || product.name,
            price: product.price,
            image: (product.images && product.images[0]) || product.image,
            options: selectedOptions
        });
    }
    
    saveCart();
    showCart();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.productId !== productId);
    saveCart();
    renderCart();
}

function updateQuantity(productId, quantity) {
    const item = cart.find(item => item.productId === productId);
    if (item) {
        item.quantity = Math.max(0, quantity);
        if (item.quantity === 0) {
            removeFromCart(productId);
        } else {
            saveCart();
            renderCart();
        }
    }
}

async function renderCart() {
    const cartItems = document.getElementById('cart-items');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartTotal = document.getElementById('cart-total');
    
    if (!cartItems) return;
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
        if (cartSubtotal) cartSubtotal.textContent = '$0.00';
        if (cartTotal) cartTotal.textContent = '$0.00';
        return;
    }
    
    let subtotal = 0;
    
    cartItems.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        return `
            <div class="cart-item">
                <img src="${item.image || 'img/placeholder.png'}" alt="${item.name}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
                </div>
                <div class="cart-item-controls">
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', ${item.quantity - 1})">-</button>
                        <input type="number" class="quantity-input" value="${item.quantity}" 
                               onchange="updateQuantity('${item.productId}', parseInt(this.value))">
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', ${item.quantity + 1})">+</button>
                    </div>
                    <button class="remove-item-btn" onclick="removeFromCart('${item.productId}')">×</button>
                </div>
            </div>
        `;
    }).join('');
    
    if (cartSubtotal) cartSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (cartTotal) cartTotal.textContent = `$${subtotal.toFixed(2)}`;
}

function showCart() {
    const cartModal = document.getElementById('cart-modal');
    if (cartModal) {
        cartModal.style.display = 'flex';
        renderCart();
    }
}

function closeCart() {
    const cartModal = document.getElementById('cart-modal');
    if (cartModal) {
        cartModal.style.display = 'none';
    }
}

async function showProductGrid() {
    const gridView = document.getElementById('grid-view');
    const productView = document.getElementById('product-view');
    
    if (gridView) gridView.style.display = 'block';
    if (productView) productView.style.display = 'none';
    
    await renderPublicGrid();
}

// Make functions global
window.showCart = showCart;
window.closeCart = closeCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.navigateToProduct = navigateToProduct;

// Initialize cart count on load
document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
});
