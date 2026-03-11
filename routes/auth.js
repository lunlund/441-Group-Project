import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';

const router = express.Router();
const SALT_ROUNDS = 10;

function getMicrosoftConfig() {
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    const tenantId = process.env.MS_TENANT_ID;
    const redirectUri = process.env.MS_REDIRECT_URI || 'http://localhost:3000/auth/microsoft/callback';
    if (!clientId || !clientSecret || !tenantId) return null;
    return {
        clientId,
        clientSecret,
        tenantId,
        redirectUri,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        scopes: ['openid', 'profile', 'email'],
    };
}

function getMicrosoftClient() {
    const config = getMicrosoftConfig();
    if (!config) return null;
    return new ConfidentialClientApplication({
        auth: {
            clientId: config.clientId,
            authority: config.authority,
            clientSecret: config.clientSecret,
        },
    });
}

async function buildUniqueUsername(models, baseName) {
    const seed = (baseName || 'microsoft-user')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'microsoft-user';
    let candidate = seed;
    let suffix = 1;
    while (await models.User.findOne({ username: candidate })) {
        candidate = `${seed}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

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
        if (!user.password) {
            return res.status(400).json({ error: 'This account uses Microsoft login.' });
        }

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
 * GET /auth/microsoft
 * Redirects to Microsoft sign-in.
 */
router.get('/microsoft', async (req, res) => {
    const config = getMicrosoftConfig();
    const client = getMicrosoftClient();
    if (!config || !client) {
        return res.status(500).json({ error: 'Microsoft login is not configured.' });
    }
    try {
        const state = crypto.randomUUID();
        const nonce = crypto.randomUUID();
        req.session.microsoftAuth = { state, nonce };
        const authCodeUrl = await client.getAuthCodeUrl({
            scopes: config.scopes,
            redirectUri: config.redirectUri,
            state,
            nonce,
            prompt: 'select_account',
        });
        res.redirect(authCodeUrl);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to start Microsoft login.' });
    }
});

/**
 * GET /auth/microsoft/callback
 * Handles Microsoft sign-in callback.
 */
router.get('/microsoft/callback', async (req, res) => {
    const config = getMicrosoftConfig();
    const client = getMicrosoftClient();
    if (!config || !client) {
        return res.status(500).json({ error: 'Microsoft login is not configured.' });
    }

    const { code, state } = req.query;
    const sessionAuth = req.session.microsoftAuth;
    if (!code || !state || !sessionAuth || state !== sessionAuth.state) {
        return res.status(400).json({ error: 'Invalid Microsoft login state.' });
    }

    try {
        const tokenResponse = await client.acquireTokenByCode({
            code,
            scopes: config.scopes,
            redirectUri: config.redirectUri,
        });

        const claims = tokenResponse.idTokenClaims || {};
        const microsoftOid = claims.oid || claims.sub;
        const email = claims.preferred_username || claims.email || tokenResponse.account?.username;
        const displayName = claims.name || email?.split('@')[0] || 'Microsoft User';

        if (!microsoftOid || !email) {
            return res.status(400).json({ error: 'Microsoft account did not return required profile data.' });
        }

        let user = await req.models.User.findOne({ $or: [{ microsoftOid }, { email }] });
        if (!user) {
            const username = await buildUniqueUsername(req.models, displayName || email.split('@')[0]);
            user = await req.models.User.create({
                username,
                email,
                password: null,
                authProvider: 'microsoft',
                microsoftOid,
            });
        } else {
            let shouldSave = false;
            if (!user.microsoftOid) {
                user.microsoftOid = microsoftOid;
                shouldSave = true;
            }
            if (user.authProvider !== 'local' && user.authProvider !== 'microsoft') {
                user.authProvider = 'microsoft';
                shouldSave = true;
            }
            if (shouldSave) await user.save();
        }

        req.session.userId = user._id.toString();
        delete req.session.microsoftAuth;
        req.session.save(() => res.redirect('/'));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Microsoft login failed.' });
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
