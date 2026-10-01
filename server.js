const express = require('express');
const session = require('express-session');
const path = require('path');
const {
  initializeDatabase,
  listProducts,
  getFeaturedProducts,
  getNewProducts,
  listTestimonials,
  addNewsletterSubscriber,
  getDashboardStats,
  createProduct,
  updateProduct,
  archiveProduct,
  createOrder,
  validateUserCredentials
} = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, 'golden-axolotl-436347.netlify.app');
const indexPath = path.join(frontendDir, 'index.html');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'veloura-premium-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

const startServer = async () => {
  try {
    await initializeDatabase();
    console.log('SQLite database ready.');

    app.get('/api/health', (req, res) => {
      res.json({ ok: true, service: 'VELŌURA backend', timestamp: new Date().toISOString() });
    });

    app.get('/api/products', async (req, res) => {
      try {
        const products = await listProducts();
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: 'Unable to fetch products', details: error.message });
      }
    });

    app.get('/api/products/featured', async (req, res) => {
      try {
        const products = await getFeaturedProducts();
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: 'Unable to fetch featured products', details: error.message });
      }
    });

    app.get('/api/products/new', async (req, res) => {
      try {
        const products = await getNewProducts();
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: 'Unable to fetch new arrivals', details: error.message });
      }
    });

    app.get('/api/testimonials', async (req, res) => {
      try {
        const testimonials = await listTestimonials();
        res.json(testimonials);
      } catch (error) {
        res.status(500).json({ error: 'Unable to fetch testimonials', details: error.message });
      }
    });

    app.get('/api/auth/me', (req, res) => {
      if (!req.session.user) {
        return res.json({ authenticated: false, user: null });
      }

      res.json({ authenticated: true, user: req.session.user });
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body || {};
        if (!email || !password) {
          return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const user = await validateUserCredentials(email, password);
        if (!user) {
          return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        req.session.user = user;
        res.json({ success: true, message: 'Login successful.', user });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to sign in.' });
      }
    });

    app.post('/api/auth/logout', (req, res) => {
      req.session.destroy((error) => {
        if (error) {
          return res.status(500).json({ success: false, message: 'Unable to sign out.' });
        }

        res.json({ success: true, message: 'Signed out successfully.' });
      });
    });

    app.get('/api/admin/dashboard', async (req, res) => {
      if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
      }

      try {
        const stats = await getDashboardStats();
        const products = await listProducts();
        stats.productsList = products;
        res.json({ success: true, user: req.session.user, stats });
      } catch (error) {
        res.status(500).json({ error: 'Unable to fetch admin stats', details: error.message });
      }
    });

    app.post('/api/admin/products', async (req, res) => {
      if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
      }

      const product = req.body || {};
      if (!product.name || !product.category || !product.image_url || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
        return res.status(400).json({ success: false, message: 'Name, category, image URL, and a price above zero are required.' });
      }

      try {
        const id = await createProduct(product);
        res.status(201).json({ success: true, id });
      } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Unable to create product.' });
      }
    });

    app.put('/api/admin/products/:id', async (req, res) => {
      if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
      }

      const product = req.body || {};
      if (!product.name || !product.category || !product.image_url || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
        return res.status(400).json({ success: false, message: 'Name, category, image URL, and a price above zero are required.' });
      }

      try {
        const result = await updateProduct(Number(req.params.id), product);
        if (!result.changes) {
          return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Unable to update product.' });
      }
    });

    app.delete('/api/admin/products/:id', async (req, res) => {
      if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
      }

      try {
        const result = await archiveProduct(Number(req.params.id));
        if (!result.changes) {
          return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to archive product.' });
      }
    });

    app.post('/api/newsletter', async (req, res) => {
      try {
        const { email } = req.body || {};
        const result = await addNewsletterSubscriber(email);
        res.status(200).json({ success: true, message: result.duplicate ? 'You are already subscribed.' : 'Welcome to the private edit.', data: result });
      } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Unable to subscribe.' });
      }
    });

    app.post('/api/orders', async (req, res) => {
      try {
        const { customerName, email, total, items } = req.body || {};
        const result = await createOrder({ customerName, email, total, items });
        res.status(201).json({ success: true, message: 'Order created.', order: result });
      } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Unable to create order.' });
      }
    });

    app.use(express.static(frontendDir));

    app.get('/', (req, res) => {
      res.sendFile(indexPath);
    });

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(indexPath);
    });

    app.listen(PORT, () => {
      console.log(`VELŌURA backend is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
