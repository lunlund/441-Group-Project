import express from 'express';

const router = express.Router();

// ── Middleware: require login ──────────────────────────────────────────────────
function requireLogin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required.' });
    next();
}

/**
 * GET /api/listings
 * Query params: category, minPrice, maxPrice, page (default 1), limit (default 20)
 */
router.get('/', async (req, res) => {
    try {
        const { category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
        const filter = { sold: false };
        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [items, total] = await Promise.all([
            req.models.Item.find(filter)
                .populate('seller_id', 'username')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            req.models.Item.countDocuments(filter),
        ]);
        res.json({ items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch listings.' });
    }
});

/**
 * GET /api/listings/search
 * Query params: q (keyword), category, minPrice, maxPrice
 */
router.get('/search', async (req, res) => {
    try {
        const { q, category, minPrice, maxPrice } = req.query;
        const filter = { sold: false };
        if (q) filter.$text = { $search: q };
        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }
        const items = await req.models.Item.find(filter)
            .populate('seller_id', 'username')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed.' });
    }
});

/**
 * GET /api/listings/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const item = await req.models.Item.findById(req.params.id)
            .populate('seller_id', 'username email');
        if (!item) return res.status(404).json({ error: 'Listing not found.' });
        res.json({ item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch listing.' });
    }
});

router.post('/buy',async(req,res)=>{
    try {
        const item = await req.models.Item.findOne({_id: req.query.itemId,quantity:{$gt: 0}})
        if(!item)
        {
            throw(new Error('out of stock'))
        }
        const user=await req.models.User.findOneAndUpdate(
            {
                _id: req.session.userId,
                balance: {$gte: item.price}
            },
            {
                $inc: {balance: -item.price}
            }
        )
        if(!user)
        {
            throw(new Error('Insufficient balance'))
        }
        const order=await req.models.Order.create({
            buyer_id: req.session.userId,
            seller_id: item.seller_id,
            item_id: item._id,
            quantity: 1,
            transaction_total: item.price,
            status: 'completed'
        })
        item.quantity-=1
        item.save()
        await req.models.User.findByIdAndUpdate(
            {
                _id: item.seller_id
            },
            {
                $inc: {balance: item.price},
                $push: {orders: order._id}
            }
        )
        user.orders.push(order._id)
        user.save()
        res.json({})
    } catch(err) {
        res.status(500).json({error: err.message})
    }
})

/**
 * POST /api/listings
 * Body: { name, description, price, category, images[], quantity }
 */
router.post('/', requireLogin, async (req, res) => {
    const { name, description, price, category, images, quantity } = req.body;
    if (!name || price === undefined) {
        return res.status(400).json({ error: 'name and price are required.' });
    }
    try {
        const item = await req.models.Item.create({
            name,
            description,
            price: Number(price),
            category: category || 'Other',
            images: images || [],
            quantity: quantity !== undefined ? Number(quantity) : 1,
            seller_id: req.session.userId,
        });
        await req.models.User.findByIdAndUpdate(
            req.session.userId,
            {$push:{watchlist: item._id}}
        )
        res.status(201).json({ item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create listing.' });
    }
});

/**
 * PUT /api/listings/:id
 * Body: any subset of { name, description, price, category, images, quantity, sold }
 * Only the owner can edit.
 */
router.put('/:id', requireLogin, async (req, res) => {
    try {
        const item = await req.models.Item.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Listing not found.' });
        if (item.seller_id.toString() !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized.' });
        }
        const allowed = ['name', 'description', 'price', 'category', 'images', 'quantity', 'sold'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) item[field] = req.body[field];
        });
        await item.save();
        res.json({ item });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update listing.' });
    }
});

/**
 * DELETE /api/listings/:id
 * Only the owner can delete.
 */
router.delete('/:id', requireLogin, async (req, res) => {
    try {
        const item = await req.models.Item.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Listing not found.' });
        if (item.seller_id.toString() !== req.session.userId) {
            return res.status(403).json({ error: 'Not authorized.' });
        }
        await item.deleteOne();
        res.json({ message: 'Listing deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete listing.' });
    }
});

export default router;
