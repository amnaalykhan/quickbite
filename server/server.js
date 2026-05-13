const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const CUSTOMER_MENU_PATH = path.join(__dirname, '..', 'customer-menu');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ── SCHEMA ──────────────────────────────────────────────────────────────────
async function initSchema() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT DEFAULT 'My Restaurant',
      tagline TEXT DEFAULT 'Great Food, Great Vibes',
      currency TEXT DEFAULT '₹',
      table_count INTEGER DEFAULT 10,
      wifi_password TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🍽',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      is_veg INTEGER DEFAULT 1,
      is_available INTEGER DEFAULT 1,
      is_bestseller INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      table_number INTEGER NOT NULL,
      customer_note TEXT DEFAULT '',
      status TEXT DEFAULT 'new',
      total REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER,
      name TEXT,
      price REAL,
      quantity INTEGER DEFAULT 1
    );
  `);
}

async function seedMenu(tenantId) {
  const data = [
    { name:'Starters', emoji:'🥗', items:[
      ['Paneer Tikka','Grilled cottage cheese with spices & chutney',220,1,1],
      ['Chicken 65','Deep-fried spicy chicken — restaurant special',260,0,1],
      ['Veg Spring Rolls','Crispy rolls stuffed with fresh veggies',160,1,0],
      ['Mushroom Pepper Fry','Sautéed mushrooms with black pepper',180,1,0],
      ['Chicken Wings','Spiced & grilled chicken wings (6 pcs)',280,0,0],
    ]},
    { name:'Main Course', emoji:'🍛', items:[
      ['Butter Chicken','Creamy tomato-based curry, mild & rich',320,0,1],
      ['Paneer Butter Masala','Cottage cheese in buttery tomato gravy',280,1,1],
      ['Dal Makhani','Slow-cooked black lentils, smoky flavour',220,1,0],
      ['Chicken Biryani','Aromatic basmati with tender chicken pieces',340,0,1],
      ['Veg Biryani','Fragrant rice with seasonal vegetables',260,1,0],
    ]},
    { name:'Breads', emoji:'🫓', items:[
      ['Butter Naan','Soft leavened bread with butter glaze',60,1,0],
      ['Garlic Naan','Topped with garlic, butter & herbs',70,1,1],
      ['Tandoori Roti','Whole wheat bread from the tandoor',40,1,0],
    ]},
    { name:'Beverages', emoji:'🥤', items:[
      ['Mango Lassi','Thick chilled yoghurt mango drink',100,1,1],
      ['Masala Chai','Spiced milk tea, freshly brewed',50,1,0],
      ['Mineral Water','1 litre chilled bottle',40,1,0],
    ]},
  ];

  for (let ci = 0; ci < data.length; ci++) {
    const cat = data[ci];
    const { rows } = await query(
      'INSERT INTO categories (tenant_id,name,emoji,sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
      [tenantId, cat.name, cat.emoji, ci]
    );
    const catId = rows[0].id;
    for (let ii = 0; ii < cat.items.length; ii++) {
      const [name, desc, price, isVeg, isBest] = cat.items[ii];
      await query(
        'INSERT INTO menu_items (tenant_id,category_id,name,description,price,is_veg,is_bestseller,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [tenantId, catId, name, desc, price, isVeg, isBest, ii]
      );
    }
  }
}

// ── MIDDLEWARE ───────────────────────────────────────────────────────────────
function getTid(req) {
  const tid = req.query.rid || req.body?.rid || req.headers['x-restaurant-id'];
  // Reject JS falsy strings that arrive as literal text
  if (!tid || tid === 'null' || tid === 'undefined' || tid === '') return null;
  return tid;
}

async function requireTenant(req, res, next) {
  try {
    const tid = getTid(req);
    if (!tid) return res.status(401).json({ error: 'Missing restaurant ID' });
    const { rows } = await query('SELECT id FROM tenants WHERE id=$1', [tid]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid restaurant ID' });
    req.tid = tid;
    next();
  } catch (e) {
    console.error('requireTenant error:', e.message);
    res.status(500).json({ error: 'Server error validating restaurant' });
  }
}

// ── APP SETUP ────────────────────────────────────────────────────────────────
const expressApp = express();
const httpServer = http.createServer(expressApp);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

expressApp.use(express.json());
expressApp.use(express.static(CUSTOMER_MENU_PATH));

// ── AUTH ROUTES ──────────────────────────────────────────────────────────────
expressApp.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, restaurant_name } = req.body;
    if (!email || !password || !restaurant_name)
      return res.status(400).json({ error: 'Email, password and restaurant name are required' });

    const exists = await query('SELECT id FROM tenants WHERE email=$1', [email.toLowerCase()]);
    if (exists.rows.length)
      return res.status(409).json({ error: 'An account with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO tenants (email, password_hash) VALUES ($1,$2) RETURNING id',
      [email.toLowerCase(), hash]
    );
    const tenantId = rows[0].id;

    await query(
      'INSERT INTO restaurants (tenant_id, name) VALUES ($1,$2)',
      [tenantId, restaurant_name]
    );
    await seedMenu(tenantId);

    res.json({ success: true, tenant_id: tenantId, restaurant_name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const { rows } = await query('SELECT * FROM tenants WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length)
      return res.status(401).json({ error: 'No account found with this email' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Incorrect password' });

    const tenant = rows[0];
    const rest = await query('SELECT name FROM restaurants WHERE tenant_id=$1', [tenant.id]);
    const restaurant_name = rest.rows[0]?.name || 'My Restaurant';

    res.json({ success: true, tenant_id: tenant.id, restaurant_name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MENU (customer) ──────────────────────────────────────────────────────────
expressApp.get('/api/menu', requireTenant, async (req, res) => {
  try {
    const restaurant = (await query('SELECT * FROM restaurants WHERE tenant_id=$1', [req.tid])).rows[0];
    const categories = (await query('SELECT * FROM categories WHERE tenant_id=$1 ORDER BY sort_order ASC', [req.tid])).rows;
    const items = (await query(
      'SELECT * FROM menu_items WHERE tenant_id=$1 AND is_available=1 ORDER BY category_id ASC, sort_order ASC', [req.tid]
    )).rows;
    res.json({ restaurant, categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ORDERS ───────────────────────────────────────────────────────────────────
expressApp.post('/api/orders', requireTenant, async (req, res) => {
  try {
    const { table_number, items, note } = req.body;
    if (!table_number || !items?.length) return res.status(400).json({ error: 'Invalid order' });

    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const { rows } = await query(
      'INSERT INTO orders (tenant_id,table_number,customer_note,total,status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.tid, table_number, note || '', total, 'new']
    );
    const orderId = rows[0].id;
    for (const i of items) {
      await query(
        'INSERT INTO order_items (order_id,menu_item_id,name,price,quantity) VALUES ($1,$2,$3,$4,$5)',
        [orderId, i.id || 0, i.name, i.price, i.quantity]
      );
    }
    const order = { id: orderId, table_number, items, note: note || '', total, status: 'new', created_at: new Date().toISOString() };
    io.to(req.tid).emit('new-order', order);
    res.json({ success: true, order_id: orderId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.get('/api/orders', requireTenant, async (req, res) => {
  try {
    const orders = (await query("SELECT * FROM orders WHERE tenant_id=$1 AND status!='done' ORDER BY created_at DESC", [req.tid])).rows;
    for (const o of orders) o.items = (await query('SELECT * FROM order_items WHERE order_id=$1', [o.id])).rows;
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.patch('/api/orders/:id/status', requireTenant, async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE orders SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3', [status, req.params.id, req.tid]);
    io.to(req.tid).emit('order-updated', { id: parseInt(req.params.id), status });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/orders/:id', requireTenant, async (req, res) => {
  try {
    await query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    await query('DELETE FROM orders WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
    io.to(req.tid).emit('order-deleted', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.get('/api/orders/history', requireTenant, async (req, res) => {
  try {
    const orders = (await query('SELECT * FROM orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100', [req.tid])).rows;
    for (const o of orders) o.items = (await query('SELECT * FROM order_items WHERE order_id=$1', [o.id])).rows;
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SETTINGS ─────────────────────────────────────────────────────────────────
expressApp.get('/api/settings', requireTenant, async (req, res) => {
  try { res.json((await query('SELECT * FROM restaurants WHERE tenant_id=$1', [req.tid])).rows[0]); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/settings', requireTenant, async (req, res) => {
  try {
    const { name, tagline, currency, table_count, wifi_password } = req.body;
    await query(
      'UPDATE restaurants SET name=$1,tagline=$2,currency=$3,table_count=$4,wifi_password=$5 WHERE tenant_id=$6',
      [name, tagline, currency || '₹', table_count || 10, wifi_password || '', req.tid]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MENU MANAGEMENT ──────────────────────────────────────────────────────────
expressApp.get('/api/menu/manage', requireTenant, async (req, res) => {
  try {
    const categories = (await query('SELECT * FROM categories WHERE tenant_id=$1 ORDER BY sort_order ASC', [req.tid])).rows;
    const items = (await query('SELECT * FROM menu_items WHERE tenant_id=$1 ORDER BY category_id ASC, sort_order ASC', [req.tid])).rows;
    res.json({ categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/items', requireTenant, async (req, res) => {
  try {
    const { category_id, name, description, price, is_veg, is_bestseller } = req.body;
    const { rows } = await query(
      'INSERT INTO menu_items (tenant_id,category_id,name,description,price,is_veg,is_bestseller) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.tid, category_id, name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0]
    );
    res.json({ success: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/menu/items/:id', requireTenant, async (req, res) => {
  try {
    const { name, description, price, is_veg, is_bestseller, is_available } = req.body;
    await query(
      'UPDATE menu_items SET name=$1,description=$2,price=$3,is_veg=$4,is_bestseller=$5,is_available=$6 WHERE id=$7 AND tenant_id=$8',
      [name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0, is_available ? 1 : 0, req.params.id, req.tid]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/items/:id', requireTenant, async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.patch('/api/menu/items/:id/toggle', requireTenant, async (req, res) => {
  try {
    await query('UPDATE menu_items SET is_available=1-is_available WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/categories', requireTenant, async (req, res) => {
  try {
    const { name, emoji } = req.body;
    const { rows } = await query(
      'INSERT INTO categories (tenant_id,name,emoji) VALUES ($1,$2,$3) RETURNING id',
      [req.tid, name, emoji || '🍽']
    );
    res.json({ success: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/categories/:id', requireTenant, async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE category_id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
    await query('DELETE FROM categories WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tid]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ────────────────────────────────────────────────────────────────────
expressApp.get('/api/stats/today', requireTenant, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await query(`
      SELECT COUNT(*) as total_orders, SUM(total) as total_revenue,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) as pending
      FROM orders WHERE tenant_id=$1 AND DATE(created_at)=$2
    `, [req.tid, today]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('join-restaurant', (tid) => {
    socket.join(tid);
    console.log(`Socket ${socket.id} joined room ${tid}`);
  });
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ── START ────────────────────────────────────────────────────────────────────
initSchema()
  .then(() => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`QuickBite multi-tenant server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database:', err.message);
    process.exit(1);
  });
