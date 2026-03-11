import express from 'express';

const router = express.Router();

function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required.' });
    next();
}

function getSessionCart(req) {
    if (!Array.isArray(req.session.cart)) {
        req.session.cart = [];
    }
    return req.session.cart;
}

async function buildCartItems(req) {
    const cart = getSessionCart(req);
    if (!cart.length) return [];

    const itemIds = cart.map(entry => entry.itemId);
    const items = await req.models.Item.find({ _id: { $in: itemIds } }).populate('seller_id', 'username');
    const itemsById = new Map(items.map(item => [item._id.toString(), item]));

    return cart
        .map(entry => {
            const item = itemsById.get(entry.itemId);
            if (!item) return null;
            return {
                itemId: entry.itemId,
                itemCount: entry.itemCount,
                name: item.name,
                description: item.description,
                category: item.category,
                price: item.price,
                availableQuantity: item.quantity,
                seller: item.seller_id?.username || 'Unknown',
            };
        })
        .filter(Boolean);
}

router.get('/', async (req, res) => {
    try {
        const items = await buildCartItems(req);
        const total = items.reduce((sum, item) => sum + item.price * item.itemCount, 0);
        res.json({ items, total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load cart.' });
    }
});

router.post('/items', requireLogin, async (req, res) => {
    const { itemId, quantity = 1 } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });

    try {
        const item = await req.models.Item.findById(itemId);
        if (!item || item.sold || item.quantity < 1) {
            return res.status(404).json({ error: 'Item is unavailable.' });
        }
        if (item.seller_id.toString() === req.session.userId) {
            return res.status(400).json({ error: 'You cannot add your own listing to cart.' });
        }

        const cart = getSessionCart(req);
        const existing = cart.find(entry => entry.itemId === itemId);
        const nextCount = (existing?.itemCount || 0) + Number(quantity);

        if (nextCount > item.quantity) {
            return res.status(400).json({ error: 'Not enough quantity available.' });
        }

        if (existing) existing.itemCount = nextCount;
        else cart.push({ itemId, itemCount: Number(quantity) });

        const items = await buildCartItems(req);
        const total = items.reduce((sum, cartItem) => sum + cartItem.price * cartItem.itemCount, 0);
        res.status(201).json({ items, total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add item to cart.' });
    }
});

router.delete('/items/:itemId', async (req, res) => {
    const cart = getSessionCart(req);
    req.session.cart = cart.filter(entry => entry.itemId !== req.params.itemId);

    try {
        const items = await buildCartItems(req);
        const total = items.reduce((sum, item) => sum + item.price * item.itemCount, 0);
        res.json({ items, total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove item from cart.' });
    }
});

router.post('/checkout', requireLogin, async (req, res) => {
    const cart = getSessionCart(req);
    if (!cart.length) return res.status(400).json({ error: 'Your cart is empty.' });

    try {
        const items = await req.models.Item.find({ _id: { $in: cart.map(entry => entry.itemId) } });
        const itemsById = new Map(items.map(item => [item._id.toString(), item]));
        const purchasedItems = [];

        let total = 0;
        for (const cartItem of cart) {
            const item = itemsById.get(cartItem.itemId);
            if (!item || item.sold || item.quantity < cartItem.itemCount) {
                return res.status(400).json({ error: `Item unavailable: ${item?.name || cartItem.itemId}` });
            }
            if (item.seller_id.toString() === req.session.userId) {
                return res.status(400).json({ error: `You cannot purchase your own listing: ${item.name}` });
            }
            total += item.price * cartItem.itemCount;
        }

        const buyer = await req.models.User.findOneAndUpdate(
            { _id: req.session.userId, balance: { $gte: total } },
            { $inc: { balance: -total } },
            { new: true }
        );

        if (!buyer) return res.status(400).json({ error: 'Insufficient balance.' });

        const createdOrderIds = [];
        const sellerCredits = new Map();

        for (const cartItem of cart) {
            const item = itemsById.get(cartItem.itemId);
            item.quantity -= cartItem.itemCount;
            if (item.quantity === 0) item.sold = true;
            await item.save();

            purchasedItems.push({
                itemId: item._id.toString(),
                name: item.name,
                quantity: cartItem.itemCount,
                price: item.price,
                subtotal: item.price * cartItem.itemCount,
            });

            const order = await req.models.Order.create({
                buyer_id: req.session.userId,
                seller_id: item.seller_id,
                item_id: item._id,
                quantity: cartItem.itemCount,
                transaction_total: item.price * cartItem.itemCount,
                status: 'completed',
            });

            createdOrderIds.push(order._id);

            const sellerId = item.seller_id.toString();
            const current = sellerCredits.get(sellerId) || { amount: 0, orders: [] };
            current.amount += order.transaction_total;
            current.orders.push(order._id);
            sellerCredits.set(sellerId, current);
        }

        for (const [sellerId, data] of sellerCredits.entries()) {
            await req.models.User.findByIdAndUpdate(sellerId, {
                $inc: { balance: data.amount },
                $push: { orders: { $each: data.orders } },
            });
        }

        buyer.orders.push(...createdOrderIds);
        await buyer.save();

        req.session.cart = [];
        res.json({
            message: 'Checkout complete.',
            purchasedItems,
            total,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Checkout failed.' });
    }
});

export default router;
