// ── helpers ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    return res.json();
}
function msg(text, err = false) {
    document.getElementById(err ? 'error-msg' : 'message').textContent = text;
    document.getElementById(err ? 'message' : 'error-msg').textContent = '';
}
function show(id) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'browse') loadListings();
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
            Buy now
        </button>
    </div>`).join('');
}

async function addToCart(itemId) {
    let data=await fetch(`/api/listings/buy?itemId=${itemId}`,{method:'POST'})
    data=await data.json()
    if(data.error)
    {
        msg(data.error,true)
        return 
    }
    else
    {
        msg("Payment completed")
    }
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
    const data=await fetch(`/users/deleteItem?itemId=${itemId}`,{method:'DELETE'})
    if(data.error)
    {
        msg(data.error,true)
    }
    else
    {
        loadUserInformation()
        msg("Your Profile uploaded successfully")
    }
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
    const itemList = await Promise.all(data.watchlist.map(async (item)=>{
    return (await api('GET',`api/listings/${item}`)).item
    }))

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

    itemList.forEach(item => {
        tableHtml += `
        <tr id="row-${item._id}">
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>$${item.price}</td>
            <td>
                <button class="del-btn" onclick="removeFromCart('${item._id}')">Remove</button>
            </td>
        </tr>
        `;
    });

    tableHtml += `</tbody></table>`;

    const container1 = document.getElementById('watchlist')
    container1.innerHTML = `
    <h3>Your items on sale</h3>
    ${tableHtml}
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