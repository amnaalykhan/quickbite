const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const CUSTOMER_MENU_PATH = path.join(__dirname, '..', 'customer-menu');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS restaurant (
      id INTEGER PRIMARY KEY,
      name TEXT DEFAULT 'My Restaurant',
      tagline TEXT DEFAULT 'Great Food, Great Vibes',
      currency TEXT DEFAULT '₹',
      table_count INTEGER DEFAULT 10,
      wifi_password TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🍽',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      is_veg INTEGER DEFAULT 1,
      is_available INTEGER DEFAULT 1,
      is_bestseller INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_number INTEGER NOT NULL,
      customer_note TEXT DEFAULT '',
      status TEXT DEFAULT 'new',
      total REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      menu_item_id INTEGER,
      name TEXT,
      price REAL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );
  `);

  const { rows } = await query('SELECT id FROM restaurant WHERE id=1');
  if (!rows.length) {
    await query(
      "INSERT INTO restaurant (id,name,tagline,currency,table_count) VALUES (1,'My Restaurant','Great Food, Great Vibes','₹',10)"
    );
  }

  const { rows: cats } = await query('SELECT COUNT(*) as c FROM categories');
  if (parseInt(cats[0].c) === 0) await seedMenu();
}

async function seedMenu() {
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
      ['Palak Paneer','Cottage cheese in spiced spinach gravy',260,1,0],
      ['Mutton Curry','Tender mutton in traditional masala',380,0,0],
    ]},
    { name:'Breads', emoji:'🫓', items:[
      ['Butter Naan','Soft leavened bread with butter glaze',60,1,0],
      ['Garlic Naan','Topped with garlic, butter & herbs',70,1,1],
      ['Tandoori Roti','Whole wheat bread from the tandoor',40,1,0],
      ['Lachha Paratha','Flaky layered whole wheat bread',55,1,0],
      ['Puri (2 pcs)','Deep-fried puffed wheat bread',50,1,0],
    ]},
    { name:'Desserts', emoji:'🍮', items:[
      ['Gulab Jamun (2 pcs)','Milk-solid dumplings in rose syrup',100,1,1],
      ['Kulfi','Traditional Indian ice cream — kesar pista',120,1,0],
      ['Kheer','Creamy rice pudding with cardamom',90,1,0],
      ['Brownie with Ice Cream','Warm chocolate brownie + vanilla scoop',160,1,0],
    ]},
    { name:'Beverages', emoji:'🥤', items:[
      ['Fresh Lime Soda','Sweet / salted / masala — you choose',80,1,0],
      ['Mango Lassi','Thick chilled yoghurt mango drink',100,1,1],
      ['Cold Coffee','Blended cold coffee with ice cream',120,1,0],
      ['Masala Chai','Spiced milk tea, freshly brewed',50,1,0],
      ['Mineral Water','1 litre chilled bottle',40,1,0],
    ]},
  ];

  for (let ci = 0; ci < data.length; ci++) {
    const cat = data[ci];
    const { rows } = await query(
      'INSERT INTO categories (name,emoji,sort_order) VALUES ($1,$2,$3) RETURNING id',
      [cat.name, cat.emoji, ci]
    );
    const catId = rows[0].id;
    for (let ii = 0; ii < cat.items.length; ii++) {
      const [name, desc, price, isVeg, isBest] = cat.items[ii];
      await query(
        'INSERT INTO menu_items (category_id,name,description,price,is_veg,is_bestseller,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [catId, name, desc, price, isVeg, isBest, ii]
      );
    }
  }
}

const expressApp = express();
const httpServer = http.createServer(expressApp);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

expressApp.use(express.json());
expressApp.use(express.static(CUSTOMER_MENU_PATH));

// Full menu for customer
expressApp.get('/api/menu', async (req, res) => {
  try {
    const restaurant = (await query('SELECT * FROM restaurant WHERE id=1')).rows[0];
    const categories = (await query('SELECT * FROM categories ORDER BY sort_order ASC')).rows;
    const items = (await query(
      'SELECT * FROM menu_items WHERE is_available=1 ORDER BY category_id ASC, sort_order ASC'
    )).rows;
    res.json({ restaurant, categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Place order
expressApp.post('/api/orders', async (req, res) => {
  try {
    const { table_number, items, note } = req.body;
    if (!table_number || !items?.length) return res.status(400).json({ error: 'Invalid order' });

    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const { rows } = await query(
      'INSERT INTO orders (table_number, customer_note, total, status) VALUES ($1,$2,$3,$4) RETURNING id',
      [table_number, note || '', total, 'new']
    );
    const orderId = rows[0].id;

    for (const i of items) {
      await query(
        'INSERT INTO order_items (order_id, menu_item_id, name, price, quantity) VALUES ($1,$2,$3,$4,$5)',
        [orderId, i.id || 0, i.name, i.price, i.quantity]
      );
    }

    const order = { id: orderId, table_number, items, note: note || '', total, status: 'new', created_at: new Date().toISOString() };
    io.emit('new-order', order);
    res.json({ success: true, order_id: orderId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Active orders
expressApp.get('/api/orders', async (req, res) => {
  try {
    const orders = (await query("SELECT * FROM orders WHERE status != 'done' ORDER BY created_at DESC")).rows;
    for (const o of orders) {
      o.items = (await query('SELECT * FROM order_items WHERE order_id=$1', [o.id])).rows;
    }
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update order status
expressApp.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE orders SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2', [status, req.params.id]);
    io.emit('order-updated', { id: parseInt(req.params.id), status });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete order
expressApp.delete('/api/orders/:id', async (req, res) => {
  try {
    await query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    await query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    io.emit('order-deleted', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Order history
expressApp.get('/api/orders/history', async (req, res) => {
  try {
    const orders = (await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100')).rows;
    for (const o of orders) {
      o.items = (await query('SELECT * FROM order_items WHERE order_id=$1', [o.id])).rows;
    }
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Settings
expressApp.get('/api/settings', async (req, res) => {
  try { res.json((await query('SELECT * FROM restaurant WHERE id=1')).rows[0]); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/settings', async (req, res) => {
  try {
    const { name, tagline, currency, table_count, wifi_password } = req.body;
    await query(
      'UPDATE restaurant SET name=$1, tagline=$2, currency=$3, table_count=$4, wifi_password=$5 WHERE id=1',
      [name, tagline, currency || '₹', table_count || 10, wifi_password || '']
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Menu management
expressApp.get('/api/menu/manage', async (req, res) => {
  try {
    const categories = (await query('SELECT * FROM categories ORDER BY sort_order ASC')).rows;
    const items = (await query('SELECT * FROM menu_items ORDER BY category_id ASC, sort_order ASC')).rows;
    res.json({ categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/items', async (req, res) => {
  try {
    const { category_id, name, description, price, is_veg, is_bestseller } = req.body;
    const { rows } = await query(
      'INSERT INTO menu_items (category_id,name,description,price,is_veg,is_bestseller) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [category_id, name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0]
    );
    res.json({ success: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/menu/items/:id', async (req, res) => {
  try {
    const { name, description, price, is_veg, is_bestseller, is_available } = req.body;
    await query(
      'UPDATE menu_items SET name=$1, description=$2, price=$3, is_veg=$4, is_bestseller=$5, is_available=$6 WHERE id=$7',
      [name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0, is_available ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/items/:id', async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.patch('/api/menu/items/:id/toggle', async (req, res) => {
  try {
    await query('UPDATE menu_items SET is_available = 1 - is_available WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/categories', async (req, res) => {
  try {
    const { name, emoji } = req.body;
    const { rows } = await query(
      'INSERT INTO categories (name,emoji) VALUES ($1,$2) RETURNING id',
      [name, emoji || '🍽']
    );
    res.json({ success: true, id: rows[0].id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/categories/:id', async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE category_id=$1', [req.params.id]);
    await query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Daily stats
expressApp.get('/api/stats/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await query(`
      SELECT COUNT(*) as total_orders, SUM(total) as total_revenue,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) as pending
      FROM orders WHERE DATE(created_at)=$1
    `, [today]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Start server after DB is ready
initSchema()
  .then(() => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`QuickBite server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database:', err.message);
    process.exit(1);
  });
