import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const dbPath = path.resolve("data.sqlite");
const isNew = !fs.existsSync(dbPath);
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    publisher TEXT,
    year INTEGER,
    isbn TEXT,
    category TEXT,
    location TEXT,
    cover_url TEXT,
    description TEXT,
    openlibrary_key TEXT,
    copies_total INTEGER NOT NULL DEFAULT 1,
    copies_available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_name TEXT,
    email TEXT,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    student_id INTEGER,
    student_name TEXT NOT NULL,
    student_class TEXT,
    loaned_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_date TEXT NOT NULL,
    returned_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at TEXT,
    canceled_at TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );
`);

function columnExists(table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((c) => c.name === column);
}

if (!columnExists("loans", "student_id")) {
  db.exec("ALTER TABLE loans ADD COLUMN student_id INTEGER");
}

if (!columnExists("students", "password_hash")) {
  db.exec("ALTER TABLE students ADD COLUMN password_hash TEXT");
}

if (!columnExists("books", "cover_url")) {
  db.exec("ALTER TABLE books ADD COLUMN cover_url TEXT");
}

if (!columnExists("books", "description")) {
  db.exec("ALTER TABLE books ADD COLUMN description TEXT");
}

if (!columnExists("books", "openlibrary_key")) {
  db.exec("ALTER TABLE books ADD COLUMN openlibrary_key TEXT");
}

function ensureAdminUser() {
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (count > 0) return null;

  const username = process.env.ADMIN_USER || "LX";
  const password = process.env.ADMIN_PASS || "Cetis2026";
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);

  return { username, password };
}

const seededAdmin = isNew ? ensureAdminUser() : null;

function ensureSampleBooks() {
  const samples = [
    {
      title: "Dom Casmurro",
      author: "Machado de Assis",
      year: 1899,
      category: "Classico",
      cover_url: "https://covers.openlibrary.org/b/olid/OL1004411M-M.jpg",
      openlibrary_key: "/works/OL1003040W",
      description: "Romance sobre memoria, ciume e duvida moral."
    },
    {
      title: "The Little Prince",
      author: "Antoine de Saint-Exupery",
      year: 1943,
      category: "Ficcao",
      cover_url: "https://covers.openlibrary.org/b/olid/OL15613493M-M.jpg",
      openlibrary_key: "/works/OL10263W",
      description: "Um conto filosofico sobre amizade e olhar infantil."
    },
    {
      title: "The Hobbit",
      author: "J. R. R. Tolkien",
      year: 1937,
      category: "Fantasia",
      cover_url: "https://covers.openlibrary.org/b/olid/OL9228732M-M.jpg",
      openlibrary_key: "/works/OL27482W",
      description: "A aventura de Bilbo Baggins pela Terra-media."
    },
    {
      title: "Pride and Prejudice",
      author: "Jane Austen",
      year: 1813,
      category: "Classico",
      cover_url: "https://covers.openlibrary.org/b/olid/OL26501173M-M.jpg",
      openlibrary_key: "/works/OL66554W",
      description: "Drama de costumes, ironia social e romance."
    },
    {
      title: "Harry Potter and the Sorcerer's Stone",
      author: "J. K. Rowling",
      year: 1997,
      category: "Fantasia",
      cover_url: "https://covers.openlibrary.org/b/olid/OL26811362M-M.jpg",
      openlibrary_key: "/works/OL82563W",
      description: "O inicio da jornada de Harry em Hogwarts."
    }
  ];

  const existsByTitle = db.prepare("SELECT id FROM books WHERE title = ?");
  const insert = db.prepare(
    `INSERT INTO books (title, author, year, category, cover_url, openlibrary_key, description, copies_total, copies_available)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((rows) => {
    rows.forEach((b) => {
      if (existsByTitle.get(b.title)) return;
      insert.run(
        b.title,
        b.author,
        b.year,
        b.category,
        b.cover_url,
        b.openlibrary_key,
        b.description,
        3,
        3
      );
    });
  });
  insertMany(samples);
}

ensureSampleBooks();

function ensureSampleCovers() {
  const updates = [
    { title: "Dom Casmurro", cover: "https://covers.openlibrary.org/b/olid/OL1004411M-M.jpg" },
    { title: "The Little Prince", cover: "https://covers.openlibrary.org/b/olid/OL15613493M-M.jpg" },
    { title: "The Hobbit", cover: "https://covers.openlibrary.org/b/olid/OL9228732M-M.jpg" },
    { title: "Pride and Prejudice", cover: "https://covers.openlibrary.org/b/olid/OL26501173M-M.jpg" },
    { title: "Harry Potter and the Sorcerer's Stone", cover: "https://covers.openlibrary.org/b/olid/OL26811362M-M.jpg" }
  ];
  const update = db.prepare(
    "UPDATE books SET cover_url = ? WHERE title = ? AND (cover_url IS NULL OR cover_url = '')"
  );
  const updateMany = db.transaction((rows) => {
    rows.forEach((row) => update.run(row.cover, row.title));
  });
  updateMany(updates);
}

ensureSampleCovers();

export { db, seededAdmin };
