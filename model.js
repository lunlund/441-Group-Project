import mongoose from 'mongoose';

// ── Schemas ────────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
    username:  { type: String, required: true, unique: true, trim: true },
    email:     { type: String, required: true, unique: true, trim: true },
    password:  { type: String, required: true },       // bcrypt hash
    balance:   { type: Number, default: 0 },
    bio:       { type: String, default: '' },
    location:  { type: String, default: '' },
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
    orders:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
}, { timestamps: true });

const ItemSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price:       { type: Number, required: true, min: 0 },
    category:    { type: String, default: 'Other', trim: true },
    images:      [String],
    quantity:    { type: Number, default: 1, min: 0 },
    seller_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sold:        { type: Boolean, default: false },
}, { timestamps: true });

// Enable text search on name + description
ItemSchema.index({ name: 'text', description: 'text' });

const OrderSchema = new mongoose.Schema({
    buyer_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    item_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity:          { type: Number, default: 1 },
    transaction_total: { type: Number, required: true },
    status:            { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
    created_date:      { type: Date, default: Date.now },
}, { timestamps: true });

// ── Connection ─────────────────────────────────────────────────────────────────

let models = {};

main().catch(err => console.log(err));
async function main() {
    console.log('Connecting to MongoDB…');
    await mongoose.connect(process.env.MONGODBPASSWARD, {
        serverSelectionTimeoutMS: 10000,
        family: 4,   // force IPv4, avoids IPv6 DNS SRV issues
    });
    console.log('Successfully connected to MongoDB!');
}

models.User  = mongoose.model('User',  UserSchema);
models.Item  = mongoose.model('Item',  ItemSchema);
models.Order = mongoose.model('Order', OrderSchema);

export default models;
