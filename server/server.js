const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quickbite.db');
const CUSTOMER_MENU_PATH = path.join(__dirname, '..', 'customer-menu');

let db;

function getDB() {
  if (db) return db;
  db = new Database(DB_PATH);
  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant (
      id INTEGER PRIMARY KEY,
      name TEXT DEFAULT 'My Restaurant',
      tagline TEXT DEFAULT 'Great Food, Great Vibes',
      currency TEXT DEFAULT '₹',
      table_count INTEGER DEFAULT 10,
      wifi_password TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🍽',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number INTEGER NOT NULL,
      customer_note TEXT DEFAULT '',
      status TEXT DEFAULT 'new',
      total REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      menu_item_id INTEGER,
      name TEXT,
      price REAL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );
  `);

  const rest = db.prepare('SELECT id FROM restaurant WHERE id=1').get();
  if (!rest) {
    db.prepare("INSERT INTO restaurant (id,name,tagline,currency,table_count) VALUES (1,'My Restaurant','Great Food, Great Vibes','₹',10)").run();
  }

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) seedMenu(db);
}

function seedMenu(db) {
  const insertCat = db.prepare('INSERT INTO categories (name,emoji,sort_order) VALUES (?,?,?)');
  const insertItem = db.prepare(
    'INSERT INTO menu_items (category_id,name,description,price,is_veg,is_bestseller,sort_order) VALUES (?,?,?,?,?,?,?)'
  );

  const data = [
    { name:'Starters', emoji:'🥗', items:[
      ['Paneer Tikka','Grilled cottage cheese with spices & chutney',220,1,1,0],
      ['Chicken 65','Deep-fried spicy chicken — restaurant special',260,0,1,1],
      ['Veg Spring Rolls','Crispy rolls stuffed with fresh veggies',160,1,0,2],
      ['Mushroom Pepper Fry','Sautéed mushrooms with black pepper',180,1,0,3],
      ['Chicken Wings','Spiced & grilled chicken wings (6 pcs)',280,0,0,4],
    ]},
    { name:'Main Course', emoji:'🍛', items:[
      ['Butter Chicken','Creamy tomato-based curry, mild & rich',320,0,1,0],
      ['Paneer Butter Masala','Cottage cheese in buttery tomato gravy',280,1,1,1],
      ['Dal Makhani','Slow-cooked black lentils, smoky flavour',220,1,0,2],
      ['Chicken Biryani','Aromatic basmati with tender chicken pieces',340,0,1,3],
      ['Veg Biryani','Fragrant rice with seasonal vegetables',260,1,0,4],
      ['Palak Paneer','Cottage cheese in spiced spinach gravy',260,1,0,5],
      ['Mutton Curry','Tender mutton in traditional masala',380,0,0,6],
    ]},
    { name:'Breads', emoji:'🫓', items:[
      ['Butter Naan','Soft leavened bread with butter glaze',60,1,0,0],
      ['Garlic Naan','Topped with garlic, butter & herbs',70,1,1,1],
      ['Tandoori Roti','Whole wheat bread from the tandoor',40,1,0,2],
      ['Lachha Paratha','Flaky layered whole wheat bread',55,1,0,3],
      ['Puri (2 pcs)','Deep-fried puffed wheat bread',50,1,0,4],
    ]},
    { name:'Desserts', emoji:'🍮', items:[
      ['Gulab Jamun (2 pcs)','Milk-solid dumplings in rose syrup',100,1,1,0],
      ['Kulfi','Traditional Indian ice cream — kesar pista',120,1,0,1],
      ['Kheer','Creamy rice pudding with cardamom',90,1,0,2],
      ['Brownie with Ice Cream','Warm chocolate brownie + vanilla scoop',160,1,0,3],
    ]},
    { name:'Beverages', emoji:'🥤', items:[
      ['Fresh Lime Soda','Sweet / salted / masala — you choose',80,1,0,0],
      ['Mango Lassi','Thick chilled yoghurt mango drink',100,1,1,1],
      ['Cold Coffee','Blended cold coffee with ice cream',120,1,0,2],
      ['Masala Chai','Spiced milk tea, freshly brewed',50,1,0,3],
      ['Mineral Water','1 litre chilled bottle',40,1,0,4],
    ]},
  ];

  data.forEach((cat, ci) => {
    const { lastInsertRowid: catId } = insertCat.run(cat.name, cat.emoji, ci);
    cat.items.forEach(([name,desc,price,isVeg,isBest,sort]) => {
      insertItem.run(catId, name, desc, price, isVeg, isBest, sort);
    });
  });
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
expressApp.get('/api/menu', (req, res) => {
  try {
    const database = getDB();
    const restaurant = database.prepare('SELECT * FROM restaurant WHERE id=1').get();
    const categories = database.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    const items = database.prepare(
      'SELECT * FROM menu_items WHERE is_available=1 ORDER BY category_id ASC, sort_order ASC'
    ).all();
    res.json({ restaurant, categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Place order
expressApp.post('/api/orders', (req, res) => {
  try {
    const database = getDB();
    const { table_number, items, note } = req.body;
    if (!table_number || !items?.length) return res.status(400).json({ error: 'Invalid order' });

    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const { lastInsertRowid: orderId } = database.prepare(
      'INSERT INTO orders (table_number, customer_note, total, status) VALUES (?,?,?,?)'
    ).run(table_number, note || '', total, 'new');

    const insertItem = database.prepare(
      'INSERT INTO order_items (order_id, menu_item_id, name, price, quantity) VALUES (?,?,?,?,?)'
    );
    items.forEach(i => insertItem.run(orderId, i.id || 0, i.name, i.price, i.quantity));

    const order = {
      id: orderId, table_number, items, note: note || '',
      total, status: 'new', created_at: new Date().toISOString()
    };
    io.emit('new-order', order);
    res.json({ success: true, order_id: orderId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Active orders
expressApp.get('/api/orders', (req, res) => {
  try {
    const database = getDB();
    const orders = database.prepare("SELECT * FROM orders WHERE status != 'done' ORDER BY created_at DESC").all();
    orders.forEach(o => { o.items = database.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id); });
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update order status
expressApp.patch('/api/orders/:id/status', (req, res) => {
  try {
    const database = getDB();
    const { status } = req.body;
    database.prepare('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.params.id);
    io.emit('order-updated', { id: parseInt(req.params.id), status });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete order
expressApp.delete('/api/orders/:id', (req, res) => {
  try {
    const database = getDB();
    database.prepare('DELETE FROM order_items WHERE order_id=?').run(req.params.id);
    database.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
    io.emit('order-deleted', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Order history
expressApp.get('/api/orders/history', (req, res) => {
  try {
    const database = getDB();
    const orders = database.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100').all();
    orders.forEach(o => { o.items = database.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id); });
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Settings
expressApp.get('/api/settings', (req, res) => {
  try { res.json(getDB().prepare('SELECT * FROM restaurant WHERE id=1').get()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/settings', (req, res) => {
  try {
    const { name, tagline, currency, table_count, wifi_password } = req.body;
    getDB().prepare('UPDATE restaurant SET name=?, tagline=?, currency=?, table_count=?, wifi_password=? WHERE id=1')
      .run(name, tagline, currency || '₹', table_count || 10, wifi_password || '');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Menu management
expressApp.get('/api/menu/manage', (req, res) => {
  try {
    const database = getDB();
    const categories = database.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    const items = database.prepare('SELECT * FROM menu_items ORDER BY category_id ASC, sort_order ASC').all();
    res.json({ categories, items });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/items', (req, res) => {
  try {
    const { category_id, name, description, price, is_veg, is_bestseller } = req.body;
    const { lastInsertRowid } = getDB().prepare(
      'INSERT INTO menu_items (category_id,name,description,price,is_veg,is_bestseller) VALUES (?,?,?,?,?,?)'
    ).run(category_id, name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0);
    res.json({ success: true, id: lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.put('/api/menu/items/:id', (req, res) => {
  try {
    const { name, description, price, is_veg, is_bestseller, is_available } = req.body;
    getDB().prepare('UPDATE menu_items SET name=?,description=?,price=?,is_veg=?,is_bestseller=?,is_available=? WHERE id=?')
      .run(name, description || '', price, is_veg ? 1 : 0, is_bestseller ? 1 : 0, is_available ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/items/:id', (req, res) => {
  try {
    getDB().prepare('DELETE FROM menu_items WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.patch('/api/menu/items/:id/toggle', (req, res) => {
  try {
    getDB().prepare('UPDATE menu_items SET is_available = 1 - is_available WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.post('/api/menu/categories', (req, res) => {
  try {
    const { name, emoji } = req.body;
    const { lastInsertRowid } = getDB().prepare('INSERT INTO categories (name,emoji) VALUES (?,?)').run(name, emoji || '🍽');
    res.json({ success: true, id: lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

expressApp.delete('/api/menu/categories/:id', (req, res) => {
  try {
    getDB().prepare('DELETE FROM menu_items WHERE category_id=?').run(req.params.id);
    getDB().prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Daily stats
expressApp.get('/api/stats/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stats = getDB().prepare(`
      SELECT COUNT(*) as total_orders, SUM(total) as total_revenue,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) as pending
      FROM orders WHERE DATE(created_at)=?
    `).get(today);
    res.json(stats);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`QuickBite server running on port ${PORT}`);
});
