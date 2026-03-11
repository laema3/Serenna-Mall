import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT,
    dueDate TEXT,
    invoiceNumber TEXT,
    supplier TEXT,
    amount REAL,
    installment TEXT
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    contact TEXT,
    email TEXT,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    contact TEXT,
    email TEXT,
    project TEXT
  );

  CREATE TABLE IF NOT EXISTS cost_centers (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    budget REAL
  );

  CREATE TABLE IF NOT EXISTS saved_reports (
    id TEXT PRIMARY KEY,
    name TEXT,
    filterStart TEXT,
    filterEnd TEXT,
    filterSupplier TEXT,
    filterStatus TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'standard'
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('initialBalance', '10000000');
  INSERT OR IGNORE INTO users (id, username, password, role) VALUES ('1', 'admin', 'admin123', 'admin');
  UPDATE users SET role = 'admin' WHERE username = 'admin';
`);

// Add columns if they don't exist
const expensesColumns = db.prepare("PRAGMA table_info(expenses)").all() as any[];
if (!expensesColumns.find(col => col.name === 'status')) {
  db.exec("ALTER TABLE expenses ADD COLUMN status TEXT DEFAULT 'pending'");
}

const usersColumns = db.prepare("PRAGMA table_info(users)").all() as any[];
if (!usersColumns.find(col => col.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'standard'");
}

const reportsColumns = db.prepare("PRAGMA table_info(saved_reports)").all() as any[];
if (!reportsColumns.find(col => col.name === 'filterStatus')) {
  db.exec("ALTER TABLE saved_reports ADD COLUMN filterStatus TEXT DEFAULT 'all'");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Auth Routes
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT id, username, role FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ success: false, message: "Usuário ou senha inválidos" });
    }
  });

  // API Routes
  app.get("/api/data", (req, res) => {
    console.log("Received request for /api/data");
    try {
      let initialBalanceRow = db.prepare("SELECT value FROM settings WHERE key = 'initialBalance'").get() as { value: string } | undefined;
      
      if (!initialBalanceRow) {
        db.prepare("INSERT INTO settings (key, value) VALUES ('initialBalance', '10000000')").run();
        initialBalanceRow = { value: '10000000' };
      }

      const expenses = db.prepare("SELECT * FROM expenses").all();
      const suppliers = db.prepare("SELECT * FROM suppliers").all();
      const clients = db.prepare("SELECT * FROM clients").all();
      const costCenters = db.prepare("SELECT * FROM cost_centers").all();
      const savedReports = db.prepare("SELECT * FROM saved_reports").all();
      
      res.json({
        initialBalance: parseFloat(initialBalanceRow.value),
        expenses,
        suppliers,
        clients,
        costCenters,
        savedReports
      });
    } catch (error: any) {
      console.error("Error fetching data:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/balance", (req, res) => {
    try {
      const { initialBalance } = req.body;
      if (initialBalance === undefined || initialBalance === null) {
        return res.status(400).json({ success: false, message: "initialBalance is required" });
      }
      
      const stmt = db.prepare("UPDATE settings SET value = ? WHERE key = 'initialBalance'");
      const result = stmt.run(initialBalance.toString());
      
      if (result.changes === 0) {
        // If for some reason the row doesn't exist, insert it
        db.prepare("INSERT INTO settings (key, value) VALUES ('initialBalance', ?)").run(initialBalance.toString());
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating balance:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  });

  app.post("/api/expenses", (req, res) => {
    try {
      const expenses = req.body; // Array of expenses
      const insert = db.prepare(`
        INSERT INTO expenses (id, date, dueDate, invoiceNumber, supplier, amount, installment, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((exps) => {
        for (const exp of exps) {
          insert.run(exp.id, exp.date, exp.dueDate || null, exp.invoiceNumber || null, exp.supplier, exp.amount, exp.installment || null, exp.status || 'pending');
        }
      });

      transaction(expenses);
      res.json({ success: true, expenses });
    } catch (error: any) {
      console.error("Error adding expenses:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put("/api/expenses/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { date, dueDate, invoiceNumber, supplier, amount, status } = req.body;
      db.prepare(`
        UPDATE expenses 
        SET date = ?, dueDate = ?, invoiceNumber = ?, supplier = ?, amount = ?, status = ?
        WHERE id = ?
      `).run(date, dueDate || null, invoiceNumber || null, supplier, amount, status || 'pending', id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating expense:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/expenses/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Suppliers Routes
  app.post("/api/suppliers", (req, res) => {
    try {
      const { id, name, contact, email, category } = req.body;
      db.prepare("INSERT INTO suppliers (id, name, contact, email, category) VALUES (?, ?, ?, ?, ?)").run(id, name, contact, email, category);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put("/api/suppliers/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, contact, email, category } = req.body;
      db.prepare("UPDATE suppliers SET name = ?, contact = ?, email = ?, category = ? WHERE id = ?").run(name, contact, email, category, id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating supplier:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/suppliers/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting supplier:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Clients Routes
  app.post("/api/clients", (req, res) => {
    try {
      const { id, name, contact, email, project } = req.body;
      db.prepare("INSERT INTO clients (id, name, contact, email, project) VALUES (?, ?, ?, ?, ?)").run(id, name, contact, email, project);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding client:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put("/api/clients/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, contact, email, project } = req.body;
      db.prepare("UPDATE clients SET name = ?, contact = ?, email = ?, project = ? WHERE id = ?").run(name, contact, email, project, id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating client:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/clients/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM clients WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting client:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Cost Centers Routes
  app.post("/api/cost-centers", (req, res) => {
    try {
      const { id, name, budget } = req.body;
      db.prepare("INSERT INTO cost_centers (id, name, budget) VALUES (?, ?, ?)").run(id, name, budget);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding cost center:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.put("/api/cost-centers/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, budget } = req.body;
      db.prepare("UPDATE cost_centers SET name = ?, budget = ? WHERE id = ?").run(name, budget, id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating cost center:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/cost-centers/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM cost_centers WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting cost center:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Saved Reports Routes
  app.post("/api/saved-reports", (req, res) => {
    try {
      const { id, name, filterStart, filterEnd, filterSupplier, filterStatus } = req.body;
      db.prepare("INSERT INTO saved_reports (id, name, filterStart, filterEnd, filterSupplier, filterStatus) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, filterStart, filterEnd, filterSupplier, filterStatus || 'all');
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding saved report:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/saved-reports/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM saved_reports WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting saved report:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // User Routes
  app.get("/api/users", (req, res) => {
    try {
      const users = db.prepare("SELECT id, username, role FROM users").all();
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/users", (req, res) => {
    try {
      const { id, username, password, role } = req.body;
      db.prepare("INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)").run(id, username, password, role);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding user:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Vite middleware for development
  console.log("NODE_ENV:", process.env.NODE_ENV);
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error",
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
