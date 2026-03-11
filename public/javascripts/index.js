// ── helpers ────────────────────────────────────────────────────────────────
const userListingsById = new Map();
let lastPurchase = null;

async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = {};

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(`Request failed for ${path} with status ${res.status}`);
        }
    }

    if (!res.ok) {
        throw new Error(data.error || `Request failed for ${path} with status ${res.status}`);
    }

    return data;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function msg(text, err = false) {
    document.getElementById(err ? 'error-msg' : 'message').textContent = text;
    document.getElementById(err ? 'message' : 'error-msg').textContent = '';
}
function show(id) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'browse') loadListings();
    else if (id === 'cart') loadCart();
    else if (id === 'confirmation') renderConfirmation();
    else if (id === 'user') loadUserInformation();
    else if(id === 'sell')
    {
        document.getElementById('listing-form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            const data = await api('POST', '/api/listings', body);
            if (data.error) { msg(data.error, true); return; }
            msg('Listing posted!');
            e.target.reset();
        });
    }
    else if(id === 'login')
    {
        document.getElementById('login-form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = await api('POST', '/auth/login', Object.fromEntries(fd.entries()));
            if (data.error) { msg(data.error, true); return; }
            msg(`Welcome back, ${data.user.username}!`);
            checkStatus();
            show('browse');
        });
    }
    else if(id === 'register')
    {
        document.getElementById('register-form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = await api('POST', '/auth/register', Object.fromEntries(fd.entries()));
            if (data.error) { msg(data.error, true); return; }
            msg(`Account created! Welcome, ${data.user.username}.`);
            checkStatus();
            show('browse');
        });
    }
}

// ── auth status ────────────────────────────────────────────────────────────
async function checkStatus() {
    const data = await api('GET', '/auth/status');
    const bar = document.getElementById('status-bar');
    bar.textContent = data.user ? `Logged in as ${data.user.username}` : 'Not logged in';
}

async function logout() {
    await api('POST', '/auth/logout');
    msg('Logged out.');
    checkStatus();
    document.getElementById('user').classList.remove('active');
}

// ── listings ───────────────────────────────────────────────────────────────
async function loadListings() {
    //const q = document.getElementById('search-input').value.trim();
    const cat = document.getElementById('cat-filter').value;
    const params = new URLSearchParams();
    //if (q) params.set('q', q);
    if (cat) params.set('category', cat);
    // const endpoint = q ? `/api/listings/search?${params}` : `/api/listings?${params}`;
    const endpoint = `/api/listings?${params}`;
    const data = await api('GET', endpoint);
    const items = data.items || [];
    const container = document.getElementById('listings-container');
    if (!items.length) { container.innerHTML = '<p>No listings found.</p>'; return; }
    container.innerHTML = items.map(item => `
    <div class="card">
        <h3>${item.name} — $${item.price.toFixed(2)}</h3>
        <p><strong>Category:</strong> ${item.category} &nbsp;|&nbsp; <strong>Qty:</strong> ${item.quantity}</p>
        <p>${item.description || ''}</p>
        <p><em>Seller: ${item.seller_id?.username || 'Unknown'}</em></p>
        <button class="add-to-cart-btn" onclick="addToCart('${item._id}')">
            Add to cart
        </button>
    </div>`).join('');
}

async function addToCart(itemId) {
    const data = await api('POST', '/api/cart/items', { itemId, quantity: 1 });
    if (data.error) {
        msg(data.error, true);
        return;
    }
    msg('Item added to cart');
    show('cart');
}

async function loadCart() {
    const container = document.getElementById('cart-container');
    try {
        const data = await api('GET', '/api/cart');
        const items = data.items || [];

        if (!items.length) {
            container.innerHTML = '<p>Your cart is empty.</p>';
            return;
        }

        const rows = items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.itemCount}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>$${(item.price * item.itemCount).toFixed(2)}</td>
                <td>
                    <button class="del-btn" onclick="removeCartItem('${item.itemId}')">Remove</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Subtotal</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div class="cart-summary">
                <strong>Total: $${Number(data.total || 0).toFixed(2)}</strong>
                <button onclick="checkoutCart()">Checkout</button>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p>Unable to load cart right now.</p>';
        msg(error.message, true);
    }
}

async function removeCartItem(itemId) {
    const data = await api('DELETE', `/api/cart/items/${itemId}`);
    if (data.error) {
        msg(data.error, true);
        return;
    }
    msg('Item removed from cart');
    await loadCart();
}

async function checkoutCart() {
    try {
        const data = await api('POST', '/api/cart/checkout');
        lastPurchase = data;
        msg('Checkout complete');
        await loadCart();
        await loadListings();
        await loadUserInformation();
        show('confirmation');
    } catch (error) {
        msg(error.message, true);
        if (error.message === 'Login required.') show('login');
        return;
    }
}

function renderConfirmation() {
    const container = document.getElementById('confirmation-container');
    const items = lastPurchase?.purchasedItems || [];

    if (!items.length) {
        container.innerHTML = '<p>No recent purchase yet.</p>';
        return;
    }

    const listItems = items.map(item => `
        <li class="confirmation-item">
            <span>${item.name} x ${item.quantity}</span>
            <strong>$${Number(item.subtotal).toFixed(2)}</strong>
        </li>
    `).join('');

    container.innerHTML = `
        <p>Your order has been placed successfully.</p>
        <ul class="confirmation-list">${listItems}</ul>
        <div class="cart-summary confirmation-summary">
            <strong>Total paid: $${Number(lastPurchase.total || 0).toFixed(2)}</strong>
            <button onclick="show('browse')">Continue Shopping</button>
        </div>
    `;
}

async function updateProfile()
{
    const bio=document.getElementById("userBio").value;
    const location=document.getElementById("userLocation").value;
    const balance=document.getElementById("userBalance").value;
    const data=await fetch(`/users/updateProfile?bio=${bio}&location=${location}&balance=${balance}`)
    if(data.error)
    {
        msg(data.error,true)
    }
    else
    {
        msg("Your Profile uploaded successfully")
    }
}
async function removeFromCart(itemId)
{
    const data = await api('DELETE', `/api/listings/${itemId}`);
    if(data.error)
    {
        msg(data.error,true)
    }
    else
    {
        loadUserInformation()
        loadListings()
        msg("Listing removed successfully")
    }
}

function startEditingListing(itemId) {
    const item = userListingsById.get(itemId);
    const editRow = document.getElementById(`edit-row-${itemId}`);
    if (!item || !editRow) return;
    document.querySelectorAll('.edit-row').forEach(row => {
        row.hidden = true;
    });
    editRow.hidden = false;
}

function cancelListingEdit(itemId) {
    const editRow = document.getElementById(`edit-row-${itemId}`);
    if (editRow) editRow.hidden = true;
}

async function submitListingEdit(event, itemId) {
    event.preventDefault();
    const form = event.target;
    const body = Object.fromEntries(new FormData(form).entries());
    const data = await api('PUT', `/api/listings/${itemId}`, body);
    if (data.error) {
        msg(data.error, true);
        return;
    }
    cancelListingEdit(itemId);
    msg('Listing updated successfully');
    await loadUserInformation();
    await loadListings();
}

async function loadUserInformation() {
    const data = await api('GET', '/users');
    if (data.error) { msg(data.error, true); 
        document.getElementById('basic-info').innerHTML=''
        document.getElementById('watchlist').innerHTML=''
        document.getElementById('orders').innerHTML=''
        return; }
    const container = document.getElementById('basic-info')
    container.innerHTML = `
    <h3>Basic Information</h3>
    <h4>username </h4><span>${data.username}</span>
    <h4>email </h4><span>${data.email}</span>
    <h4>biography</h4><input type="text" id="userBio" value="${data.bio}" placeholder="" />
    <h4>your location</h4><input type="text" id="userLocation" value="${data.location}" placeholder="" />
    <h4>your balance</h4><input type="number" id="userBalance" value=${data.balance} placeholder="" />
    <button onClick="updateProfile()">save</button>
    `
    const itemList = (await Promise.all(data.watchlist.map(async (item)=>{
        return (await api('GET',`api/listings/${item}`)).item
    }))).filter(Boolean);
    const ownedItems = itemList.filter(item => item.seller_id?._id === data._id);
    userListingsById.clear();
    ownedItems.forEach(item => {
        userListingsById.set(item._id, item);
    });

    let tableHtml = `
    <table class="cart-table">
        <thead>
            <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
    `;

    ownedItems.forEach(item => {
        tableHtml += `
        <tr id="row-${item._id}">
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>$${item.price}</td>
            <td>
                <div class="action-buttons">
                    <button class="secondary-btn" onclick="startEditingListing('${item._id}')">Edit</button>
                    <button class="del-btn" onclick="removeFromCart('${item._id}')">Remove</button>
                </div>
            </td>
        </tr>
        <tr id="edit-row-${item._id}" class="edit-row" hidden>
            <td colspan="4">
                <form class="listing-edit-form" onsubmit="submitListingEdit(event, '${item._id}')">
                    <label>Title *<input name="name" required value="${escapeHtml(item.name)}" /></label>
                    <label>Description<textarea name="description" rows="3">${escapeHtml(item.description || '')}</textarea></label>
                    <label>Price ($) *<input name="price" type="number" min="0" step="0.01" required value="${item.price}" /></label>
                    <label>Category
                        <select name="category">
                            <option ${item.category === 'Electronics' ? 'selected' : ''}>Electronics</option>
                            <option ${item.category === 'Furniture' ? 'selected' : ''}>Furniture</option>
                            <option ${item.category === 'Books' ? 'selected' : ''}>Books</option>
                            <option ${item.category === 'Clothing' ? 'selected' : ''}>Clothing</option>
                            <option ${item.category === 'Other' ? 'selected' : ''}>Other</option>
                        </select>
                    </label>
                    <label>Quantity<input name="quantity" type="number" min="0" value="${item.quantity}" /></label>
                    <div class="action-buttons">
                        <button type="submit">Save Changes</button>
                        <button type="button" class="ghost-btn" onclick="cancelListingEdit('${item._id}')">Cancel</button>
                    </div>
                </form>
            </td>
        </tr>
        `;
    });

    tableHtml += `</tbody></table>`;

    const container1 = document.getElementById('watchlist')
    container1.innerHTML = `
    <h3>Your items on sale</h3>
    ${ownedItems.length ? tableHtml : '<p>No active listings yet.</p>'}
    `      

    const container2 = document.getElementById('orders')
    let orders = await fetch('/users/orders')
    console.log(orders)
    orders=(await orders.json()).orders
    console.log(orders)
    
    let htmlStr=`<h3>Your Orders</h3>
    <table>
        <thead>
            <tr>
                <th>Order ID</th>
                <th>Item ID</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>
           
    `

    orders.forEach(order => {
        const date = new Date(order.created_date).toLocaleDateString();
        htmlStr += `
            <tr>
                <td>#${order._id.slice(-6)}</td> <td>${order.item_id}</td>
                <td>${order.quantity}</td>
                <td>$${order.transaction_total.toFixed(2)}</td>
                <td><span class="badge status-${order.status}">${order.status}</span></td>
                <td>${date}</td>
            </tr>
        `;
    });
    htmlStr+=`</tbody>
    </table>`
    container2.innerHTML=htmlStr

}


// ── init ───────────────────────────────────────────────────────────────────
checkStatus();
loadListings();
//show('browse')
