import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';

import usersRouter   from './routes/users.js';
import authRouter    from './routes/auth.js';
import listingsRouter from './routes/listings.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import models from './model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }, // 1 day
}));

// Attach models to every request
app.use((req, res, next) => {
    req.models = models;
    next();
});

// Routes
app.use('/users',        usersRouter);
app.use('/auth',         authRouter);
app.use('/api/listings', listingsRouter);

export default app;
