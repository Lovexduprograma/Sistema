import path from "node:path";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const LOAN_DAYS = Number(process.env.LOAN_DAYS || 30);
const FINE_PER_DAY = Number(process.env.FINE_PER_DAY || 1);
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS || "";
const OPENLIBRARY_BASE = "https://openlibrary.org";

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    }
  })
);

app.use(express.static(path.resolve("public")));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
  }
  return next();
}

function requireStaff(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.status(403).json({ error: "Acesso negado. Você não tem permissão para esta ação." });
  }
  return next();
}

async function sendEmail({ to, subject, text }) {
  if (!GMAIL_USER || !GMAIL_APP_PASS) {
    throw new Error("Serviço de e-mail não configurado no servidor.");
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASS
    }
  });
  await transporter.sendMail({
    from: GMAIL_USER,
    to,
    subject,
    text
  });
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
  }

  const user = db
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  return res.json({ ok: true, username: user.username, role: user.role });
});

app.post("/api/student-login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
  }

  const student = db
    .prepare("SELECT id, name, email, password_hash FROM students WHERE email = ?")
    .get(email);

  if (!student || !student.password_hash || !bcrypt.compareSync(password, student.password_hash)) {
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }

  req.session.userId = student.id;
  req.session.username = student.name;
  req.session.role = "student";
  return res.json({ ok: true, username: student.name, role: "student" });
});

app.get("/api/openlibrary/lookup", requireStaff, async (req, res) => {
  const isbn = (req.query.isbn || "").toString().trim();
  const title = (req.query.title || "").toString().trim();
  const author = (req.query.author || "").toString().trim();

  if (!isbn && !title) {
    return res.status(400).json({ error: "Digite um ISBN ou título para buscar." });
  }

  const searchParams = new URLSearchParams();
  if (isbn) {
    searchParams.set("q", `isbn:${isbn}`);
  } else {
    searchParams.set("title", title);
    if (author) searchParams.set("author", author);
  }
  searchParams.set("limit", "1");
  searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,cover_i,subject,publisher,isbn"
  );

  try {
    const searchUrl = `${OPENLIBRARY_BASE}/search.json?${searchParams.toString()}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      return res.status(502).json({ error: "Falha ao se comunicar com a Open Library." });
    }
    const searchData = await searchRes.json();
    const doc = (searchData.docs || [])[0];
    if (!doc) {
      return res.status(404).json({ error: "Nenhum livro encontrado na consulta." });
    }

    let description = "";
    if (doc.key) {
      const workRes = await fetch(`${OPENLIBRARY_BASE}${doc.key}.json`);
      if (workRes.ok) {
        const work = await workRes.json();
        if (typeof work.description === "string") description = work.description;
        if (work.description && typeof work.description.value === "string") {
          description = work.description.value;
        }
      }
    }

    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : "";

    const result = {
      title: doc.title || "",
      author: (doc.author_name && doc.author_name[0]) || "",
      year: doc.first_publish_year || "",
      category: (doc.subject && doc.subject[0]) || "",
      publisher: (doc.publisher && doc.publisher[0]) || "",
      isbn: (doc.isbn && doc.isbn[0]) || isbn || "",
      cover_url: coverUrl,
      description,
      openlibrary_key: doc.key || ""
    };

    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "Falha ao consultar o serviço externo de livros." });
  }
});

app.get("/api/openlibrary/ratings", requireAuth, async (req, res) => {
  const key = (req.query.key || "").toString().trim();
  if (!key) return res.status(400).json({ error: "Chave do livro ausente." });
  try {
    const ratingsRes = await fetch(`${OPENLIBRARY_BASE}${key}/ratings.json`);
    if (!ratingsRes.ok) {
      return res.status(502).json({ error: "Falha ao obter avaliações do livro." });
    }
    const data = await ratingsRes.json();
    const summary = data.summary || {};
    const average =
      typeof summary.average === "number" ? summary.average : (data.average || null);
    const count =
      typeof summary.count === "number" ? summary.count : (summary.total || data.count || null);
    return res.json({ average, count });
  } catch (err) {
    return res.status(502).json({ error: "Falha ao consultar avaliações do livro." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    username: req.session.username,
    role: req.session.role
  });
});

app.get("/api/books", requireAuth, (req, res) => {
  const query = (req.query.q || "").toString().trim();

  if (!query) {
    const books = db.prepare("SELECT * FROM books ORDER BY title").all();
    return res.json(books);
  }

  const like = `%${query}%`;

  const books = db
    .prepare(
      "SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? OR category LIKE ? ORDER BY title"
    )
    .all(like, like, like, like);

  return res.json(books);
});

// CORREÇÃO: Alterado de requireAuth para requireStaff
app.delete("/api/books/:id", requireStaff, (req, res) => {
  try {
    const id = Number(req.params.id);

    const activeLoans = db
      .prepare("SELECT COUNT(*) as c FROM loans WHERE book_id = ? AND returned_at IS NULL")
      .get(id).c;

    if (activeLoans > 0) {
      return res.status(409).json({ error: "Não é possível excluir um livro com empréstimos ativos." });
    }

    const result = db.prepare("DELETE FROM books WHERE id = ?").run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Livro não encontrado no sistema." });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno ao tentar excluir o livro." });
  }
});

app.get("/api/students", requireStaff, (req, res) => {
  const query = (req.query.q || "").toString().trim();
  if (!query) {
    const students = db
      .prepare("SELECT id, name, class_name, email, created_at FROM students ORDER BY name")
      .all();
    return res.json(students);
  }
  const like = `%${query}%`;
  const students = db
    .prepare(
      "SELECT id, name, class_name, email, created_at FROM students WHERE name LIKE ? OR class_name LIKE ? ORDER BY name"
    )
    .all(like, like);
  return res.json(students);
});

app.post("/api/students", requireStaff, (req, res) => {
  const { name, class_name, email, password } = req.body || {};
  if (!name) return res.status(400).json({ error: "Preencha o nome do estudante." });
  if (email) {
    const exists = db
      .prepare("SELECT id FROM students WHERE email = ?")
      .get(email);
    if (exists) return res.status(409).json({ error: "Este e-mail já está cadastrado por outro usuário." });
  }
  let passwordHash = null;
  if (password) {
    passwordHash = bcrypt.hashSync(password, 10);
  }

  const result = db
    .prepare("INSERT INTO students (name, class_name, email, password_hash) VALUES (?, ?, ?, ?)")
    .run(name, class_name || null, email || null, passwordHash);
  const student = db
    .prepare("SELECT id, name, class_name, email, created_at FROM students WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(student);
});

app.put("/api/students/:id", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const { name, class_name, email, password } = req.body || {};
  const existing = db.prepare("SELECT * FROM students WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Estudante não encontrado no sistema." });
  if (email) {
    const exists = db
      .prepare("SELECT id FROM students WHERE email = ? AND id != ?")
      .get(email, id);
    if (exists) return res.status(409).json({ error: "Este e-mail já está cadastrado por outro usuário." });
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;

  db.prepare(
    `UPDATE students
     SET name = ?, class_name = ?, email = ?, password_hash = ?
     WHERE id = ?`
  ).run(
    name || existing.name,
    class_name || existing.class_name,
    email || existing.email,
    passwordHash,
    id
  );

  const student = db
    .prepare("SELECT id, name, class_name, email, created_at FROM students WHERE id = ?")
    .get(id);
  return res.json(student);
});

app.delete("/api/students/:id", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM students WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Estudante não encontrado no sistema." });

  const activeLoans = db
    .prepare("SELECT COUNT(*) as c FROM loans WHERE student_id = ? AND returned_at IS NULL")
    .get(id).c;
  if (activeLoans > 0) {
    return res.status(409).json({ error: "O estudante possui empréstimos pendentes e não pode ser excluído." });
  }

  db.prepare("DELETE FROM students WHERE id = ?").run(id);
  return res.json({ ok: true });
});

app.post("/api/books", requireStaff, (req, res) => {
  const {
    title,
    author,
    publisher,
    year,
    isbn,
    category,
    location,
    cover_url,
    description,
    openlibrary_key,
    copies_total
  } = req.body || {};

  if (!title || !author) {
    return res.status(400).json({ error: "Preencha o título e o autor do livro." });
  }

  const total = Number(copies_total) || 1;
  const result = db
    .prepare(
      `INSERT INTO books (title, author, publisher, year, isbn, category, location, cover_url, description, openlibrary_key, copies_total, copies_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      author,
      publisher || null,
      year ? Number(year) : null,
      isbn || null,
      category || null,
      location || null,
      cover_url || null,
      description || null,
      openlibrary_key || null,
      total,
      total
    );

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(book);
});

// CORREÇÃO: Atualização do total e disponíveis baseada no banco
app.put("/api/books/:id", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const {
    title,
    author,
    publisher,
    year,
    isbn,
    category,
    location,
    cover_url,
    description,
    openlibrary_key,
    copies_total
  } = req.body || {};

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) return res.status(404).json({ error: "Livro não encontrado no sistema." });

  const total = Number(copies_total) || book.copies_total;
  const activeLoans = db
    .prepare("SELECT COUNT(*) as c FROM loans WHERE book_id = ? AND returned_at IS NULL")
    .get(id).c;
    
  const available = Math.max(0, total - activeLoans);

  db.prepare(
    `UPDATE books
     SET title = ?, author = ?, publisher = ?, year = ?, isbn = ?, category = ?, location = ?,
         cover_url = ?, description = ?, openlibrary_key = ?, copies_total = ?, copies_available = ?
     WHERE id = ?`
  ).run(
    title || book.title,
    author || book.author,
    publisher || book.publisher,
    year ? Number(year) : book.year,
    isbn || book.isbn,
    category || book.category,
    location || book.location,
    cover_url !== undefined ? cover_url : book.cover_url,
    description !== undefined ? description : book.description,
    openlibrary_key !== undefined ? openlibrary_key : book.openlibrary_key,
    total,
    available,
    id
  );

  const updated = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  return res.json(updated);
});

app.post("/api/loans", requireStaff, (req, res) => {
  const { book_id, student_id, student_name, student_class } = req.body || {};
  const bookId = Number(book_id);
  const studentId = student_id ? Number(student_id) : null;
  if (!bookId || (!studentId && !student_name)) {
    return res.status(400).json({ error: "Preencha os dados do livro e do aluno." });
  }

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
  if (!book) return res.status(404).json({ error: "Livro não encontrado no sistema." });
  if (book.copies_available < 1) {
    return res.status(409).json({ error: "Não há exemplares disponíveis deste livro no momento." });
  }

  let resolvedStudentName = student_name;
  let resolvedClass = student_class || null;
  if (studentId) {
    const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
    if (!student) return res.status(404).json({ error: "Estudante não encontrado no sistema." });
    resolvedStudentName = student.name;
    resolvedClass = student.class_name;
  }

  const result = db
    .prepare(
      `INSERT INTO loans (book_id, student_id, student_name, student_class, due_date)
       VALUES (?, ?, ?, ?, date('now', ?))`
    )
    .run(bookId, studentId, resolvedStudentName, resolvedClass, `+${LOAN_DAYS} days`);

  db.prepare("UPDATE books SET copies_available = copies_available - 1 WHERE id = ?").run(bookId);

  const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(result.lastInsertRowid);
  if (studentId) {
    const studentEmail = db.prepare("SELECT email FROM students WHERE id = ?").get(studentId)?.email;
    if (studentEmail) {
      sendEmail({
        to: studentEmail,
        subject: "Empréstimo registrado",
        text: `O empréstimo do livro '${book.title}' foi registrado. Devolução prevista em ${loan.due_date}.`
      }).catch(() => {});
    }
  }
  return res.status(201).json(loan);
});

app.post("/api/returns/:id", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(id);
  if (!loan) return res.status(404).json({ error: "Registro de empréstimo não encontrado." });
  if (loan.returned_at) return res.status(409).json({ error: "Este livro já foi devolvido anteriormente." });

  db.prepare("UPDATE loans SET returned_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE books SET copies_available = copies_available + 1 WHERE id = ?")
    .run(loan.book_id);

  const updated = db.prepare("SELECT * FROM loans WHERE id = ?").get(id);
  return res.json(updated);
});

app.get("/api/loans", requireAuth, (req, res) => {
  const activeOnly = (req.query.active || "true").toString() === "true";
  const sql = activeOnly
    ? `SELECT loans.*, books.title, students.name as student_fullname
       FROM loans
       JOIN books ON books.id = loans.book_id
       LEFT JOIN students ON students.id = loans.student_id
       WHERE loans.returned_at IS NULL
       ORDER BY loans.loaned_at DESC`
    : `SELECT loans.*, books.title, students.name as student_fullname
       FROM loans
       JOIN books ON books.id = loans.book_id
       LEFT JOIN students ON students.id = loans.student_id
       ORDER BY loans.loaned_at DESC`;
  const loans = db.prepare(sql).all();
  return res.json(loans);
});

app.post("/api/reservations", requireStaff, (req, res) => {
  const { book_id, student_id } = req.body || {};
  const bookId = Number(book_id);
  const studentId = Number(student_id);
  if (!bookId || !studentId) {
    return res.status(400).json({ error: "Selecione o livro e o estudante para a reserva." });
  }

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
  if (!book) return res.status(404).json({ error: "Livro não encontrado no sistema." });
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(studentId);
  if (!student) return res.status(404).json({ error: "Estudante não encontrado no sistema." });

  const result = db
    .prepare("INSERT INTO reservations (book_id, student_id) VALUES (?, ?)")
    .run(bookId, studentId);
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(reservation);
});

app.get("/api/reservations", requireStaff, (req, res) => {
  const activeOnly = (req.query.active || "true").toString() === "true";
  const sql = activeOnly
    ? `SELECT reservations.*, books.title, students.name as student_name
       FROM reservations
       JOIN books ON books.id = reservations.book_id
       JOIN students ON students.id = reservations.student_id
       WHERE reservations.fulfilled_at IS NULL AND reservations.canceled_at IS NULL
       ORDER BY reservations.requested_at DESC`
    : `SELECT reservations.*, books.title, students.name as student_name
       FROM reservations
       JOIN books ON books.id = reservations.book_id
       JOIN students ON students.id = reservations.student_id
       ORDER BY reservations.requested_at DESC`;
  const rows = db.prepare(sql).all();
  return res.json(rows);
});

app.post("/api/reservations/:id/fulfill", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id);
  if (!reservation) return res.status(404).json({ error: "Reserva não encontrada." });
  if (reservation.fulfilled_at || reservation.canceled_at) {
    return res.status(409).json({ error: "Esta reserva já foi concluída ou cancelada." });
  }
  db.prepare("UPDATE reservations SET fulfilled_at = datetime('now') WHERE id = ?").run(id);
  return res.json({ ok: true });
});

app.post("/api/reservations/:id/cancel", requireStaff, (req, res) => {
  const id = Number(req.params.id);
  const reservation = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id);
  if (!reservation) return res.status(404).json({ error: "Reserva não encontrada." });
  if (reservation.fulfilled_at || reservation.canceled_at) {
    return res.status(409).json({ error: "Esta reserva já foi concluída ou cancelada." });
  }
  db.prepare("UPDATE reservations SET canceled_at = datetime('now') WHERE id = ?").run(id);
  return res.json({ ok: true });
});

app.get("/api/reports/overview", requireAuth, (req, res) => {
  const totalBooks = db.prepare("SELECT COUNT(*) as c FROM books").get().c;
  const totalCopies = db.prepare("SELECT SUM(copies_total) as c FROM books").get().c || 0;
  const availableCopies =
    db.prepare("SELECT SUM(copies_available) as c FROM books").get().c || 0;
  const activeLoans = db
    .prepare("SELECT COUNT(*) as c FROM loans WHERE returned_at IS NULL")
    .get().c;
  const overdueLoans = db
    .prepare(
      "SELECT COUNT(*) as c FROM loans WHERE returned_at IS NULL AND date(due_date) < date('now')"
    )
    .get().c;
  const totalFine = db
    .prepare(
      `SELECT
         SUM(MAX(0, CAST(julianday(date('now')) - julianday(due_date) AS INTEGER)) * ?) as c
       FROM loans
       WHERE returned_at IS NULL`
    )
    .get(FINE_PER_DAY).c || 0;

  res.json({
    totalBooks,
    totalCopies,
    availableCopies,
    activeLoans,
    overdueLoans,
    totalFine
  });
});

app.get("/api/reports/loans", requireStaff, (req, res) => {
  const from = (req.query.from || "").toString();
  const to = (req.query.to || "").toString();
  if (!from || !to) {
    return res.status(400).json({ error: "Selecione uma data inicial e final válidas." });
  }

  const loans = db
    .prepare(
      `SELECT loans.*, books.title, books.author,
         MAX(0, CAST(julianday(COALESCE(loans.returned_at, date('now'))) - julianday(loans.due_date) AS INTEGER)) as late_days
       FROM loans
       JOIN books ON books.id = loans.book_id
       WHERE date(loaned_at) BETWEEN date(?) AND date(?)
       ORDER BY loaned_at DESC`
    )
    .all(from, to);
  const enriched = loans.map((loan) => ({
    ...loan,
    fine: loan.late_days * FINE_PER_DAY
  }));
  return res.json(enriched);
});

app.get("/api/reports/loans.csv", requireStaff, (req, res) => {
  const from = (req.query.from || "").toString();
  const to = (req.query.to || "").toString();
  if (!from || !to) {
    return res.status(400).json({ error: "Selecione uma data inicial e final válidas." });
  }
  const rows = db
    .prepare(
      `SELECT loans.*, books.title, books.author,
         MAX(0, CAST(julianday(COALESCE(loans.returned_at, date('now'))) - julianday(loans.due_date) AS INTEGER)) as late_days
       FROM loans
       JOIN books ON books.id = loans.book_id
       WHERE date(loaned_at) BETWEEN date(?) AND date(?)
       ORDER BY loaned_at DESC`
    )
    .all(from, to);

  const header = [
    "book_title",
    "book_author",
    "student_name",
    "student_class",
    "loaned_at",
    "due_date",
    "returned_at",
    "late_days",
    "fine"
  ];

  const lines = [header.join(",")];
  rows.forEach((row) => {
    const fine = row.late_days * FINE_PER_DAY;
    const values = [
      row.title,
      row.author,
      row.student_name,
      row.student_class || "",
      row.loaned_at,
      row.due_date,
      row.returned_at || "",
      row.late_days,
      fine
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="relatorio-emprestimos-${from}-a-${to}.csv"`
  );
  res.send(lines.join("\n"));
});

app.post("/api/notifications/overdue", requireStaff, async (req, res) => {
  if (!GMAIL_USER || !GMAIL_APP_PASS) {
    return res.status(400).json({ error: "Serviço de e-mail não configurado no servidor." });
  }
  const rows = db
    .prepare(
      `SELECT loans.*, books.title, students.email
       FROM loans
       JOIN books ON books.id = loans.book_id
       JOIN students ON students.id = loans.student_id
       WHERE loans.returned_at IS NULL
         AND students.email IS NOT NULL
         AND date(loans.due_date) < date('now')`
    )
    .all();

  let sent = 0;
  for (const row of rows) {
    try {
      await sendEmail({
        to: row.email,
        subject: "Empréstimo atrasado",
        text: `O livro '${row.title}' está atrasado desde ${row.due_date}. Por favor, devolva o quanto antes.`
      });
      sent += 1;
    } catch (err) {
      // ignore individual failures
    }
  }
  return res.json({ sent });
});

app.get("/api/my-loans", requireAuth, (req, res) => {
  if (req.session.role !== "student") {
    return res.status(403).json({ error: "Acesso negado. Você não tem permissão para esta ação." });
  }
  const loans = db
    .prepare(
      `SELECT loans.*, books.title, books.author
       FROM loans
       JOIN books ON books.id = loans.book_id
       WHERE loans.student_id = ?
       ORDER BY loans.loaned_at DESC`
    )
    .all(req.session.userId);
  return res.json(loans);
});

app.post("/api/my-loans", requireAuth, (req, res) => {
  if (req.session.role !== "student") {
    return res.status(403).json({ error: "Acesso negado. Você não tem permissão para esta ação." });
  }
  const { book_id } = req.body || {};
  const bookId = Number(book_id);
  if (!bookId) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });

  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(req.session.userId);
  if (!student) return res.status(404).json({ error: "Estudante não encontrado no sistema." });

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
  if (!book) return res.status(404).json({ error: "Livro não encontrado no sistema." });
  if (book.copies_available < 1) {
    return res.status(409).json({ error: "Não há exemplares disponíveis deste livro no momento." });
  }

  const result = db
    .prepare(
      `INSERT INTO loans (book_id, student_id, student_name, student_class, due_date)
       VALUES (?, ?, ?, ?, date('now', ?))`
    )
    .run(bookId, student.id, student.name, student.class_name, `+${LOAN_DAYS} days`);

  db.prepare("UPDATE books SET copies_available = copies_available - 1 WHERE id = ?").run(bookId);

  const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(loan);
});

app.post("/api/my-returns/:id", requireAuth, (req, res) => {
  if (req.session.role !== "student") {
    return res.status(403).json({ error: "Acesso negado. Você não tem permissão para esta ação." });
  }
  const id = Number(req.params.id);
  const loan = db.prepare("SELECT * FROM loans WHERE id = ?").get(id);
  if (!loan) return res.status(404).json({ error: "Registro de empréstimo não encontrado." });
  if (loan.student_id !== req.session.userId) {
    return res.status(403).json({ error: "Acesso negado. Você não tem permissão para esta ação." });
  }
  if (loan.returned_at) return res.status(409).json({ error: "Este livro já foi devolvido anteriormente." });

  db.prepare("UPDATE loans SET returned_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE books SET copies_available = copies_available + 1 WHERE id = ?")
    .run(loan.book_id);

  const updated = db.prepare("SELECT * FROM loans WHERE id = ?").get(id);
  return res.json(updated);
});

// CORREÇÃO: Remoção do vazamento das credenciais do administrador
app.get("/api/info", (req, res) => {
  res.json({ status: "ok" });
});

app.use((err, req, res, next) => {
  console.error("Erro interno no servidor:", err);
  res.status(500).json({ error: "Ocorreu um erro interno no servidor." });
});


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});