// In-memory data store for products and business info
// Isolated module - easy to replace with database later

const store = {
    business: {
        title: "My Business",
        description: "Welcome to our store"
    },
    products: [
        {
            id: "1",
            name: "Sample Product",
            description: "A sample product description",
            price: 19.99,
            image: "/img/placeholder.jpg"
        }
    ]
};

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Business operations
export function getBusiness() {
    return { ...store.business };
}

export function updateBusiness(data) {
    if (data.title !== undefined) store.business.title = data.title;
    if (data.description !== undefined) store.business.description = data.description;
    return { ...store.business };
}

// Product operations
export function getProducts() {
    return [...store.products];
}

export function getProductById(id) {
    return store.products.find(p => p.id === id) || null;
}

export function createProduct(data) {
    const product = {
        id: generateId(),
        name: data.name || "Untitled Product",
        description: data.description || "",
        price: parseFloat(data.price) || 0,
        image: data.image || "/img/placeholder.jpg"
    };
    store.products.push(product);
    return product;
}

export function updateProduct(id, data) {
    const index = store.products.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    const product = store.products[index];
    if (data.name !== undefined) product.name = data.name;
    if (data.description !== undefined) product.description = data.description;
    if (data.price !== undefined) product.price = parseFloat(data.price);
    if (data.image !== undefined) product.image = data.image;
    
    return { ...product };
}

export function deleteProduct(id) {
    const index = store.products.findIndex(p => p.id === id);
    if (index === -1) return false;
    store.products.splice(index, 1);
    return true;
}

export default {
    getBusiness,
    updateBusiness,
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
