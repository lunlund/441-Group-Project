import express from 'express';
import bcrypt from 'bcrypt';

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * POST /auth/register
 * Body: { username, email, password }
 */
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email, and password are required.' });
    }
    try {
        const existing = await req.models.User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            return res.status(409).json({ error: 'Username or email already in use.' });
        }
        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await req.models.User.create({ username, email, password: hashed });
        req.session.userId = user._id.toString();
        res.status(201).json({
            message: 'Registration successful.',
            user: { _id: user._id, username: user.username, email: user.email },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

/**
 * POST /auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required.' });
    }
    try {
        const user = await req.models.User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

        req.session.userId = user._id.toString();
        res.json({
            message: 'Login successful.',
            user: { _id: user._id, username: user.username, email: user.email },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'Logged out.' });
    });
});

/**
 * GET /auth/status
 * Returns the currently logged-in user (or null).
 */
router.get('/status', async (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    try {
        const user = await req.models.User.findById(req.session.userId).select('-password');
        res.json({ user });
    } catch (err) {
        res.json({ user: null });
    }
});

export default router;
