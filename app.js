const statusText = document.querySelector("#statusText");
const loginCard = document.querySelector("#loginCard");
const appView = document.querySelector("#appView");
const seedHint = document.querySelector("#seedHint");

const loginBtn = document.querySelector("#loginBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const loginType = document.querySelector("#loginType");
const loginUserLabel = document.querySelector("#loginUserLabel");
const loginEmailLabel = document.querySelector("#loginEmailLabel");

const booksByCategory = document.querySelector("#booksByCategory");
const searchInput = document.querySelector("#searchInput");
const searchBtn = document.querySelector("#searchBtn");
const booksAdminTable = document.querySelector("#booksAdminTable");

const saveBookBtn = document.querySelector("#saveBookBtn");
const lookupBookBtn = document.querySelector("#lookupBookBtn");
const cancelBookEditBtn = document.querySelector("#cancelBookEditBtn");
const loanBook = document.querySelector("#loanBook");
const loanStudentId = document.querySelector("#loanStudentId");
const loanStudent = document.querySelector("#loanStudent");
const loanClass = document.querySelector("#loanClass");
const createLoanBtn = document.querySelector("#createLoanBtn");
const returnLoan = document.querySelector("#returnLoan");
const returnBtn = document.querySelector("#returnBtn");

const studentSearch = document.querySelector("#studentSearch");
const studentSearchBtn = document.querySelector("#studentSearchBtn");
const studentName = document.querySelector("#studentName");
const studentClass = document.querySelector("#studentClass");
const studentEmail = document.querySelector("#studentEmail");
const studentPassword = document.querySelector("#studentPassword");
const studentId = document.querySelector("#studentId");
const saveStudentBtn = document.querySelector("#saveStudentBtn");
const cancelStudentEditBtn = document.querySelector("#cancelStudentEditBtn");
const studentsTable = document.querySelector("#studentsTable");

const reserveBook = document.querySelector("#reserveBook");
const reserveStudent = document.querySelector("#reserveStudent");
const reserveBtn = document.querySelector("#reserveBtn");
const reservationsTable = document.querySelector("#reservationsTable");

const statsBox = document.querySelector("#statsBox");
const reportFrom = document.querySelector("#reportFrom");
const reportTo = document.querySelector("#reportTo");
const runReportBtn = document.querySelector("#runReportBtn");
const downloadCsvBtn = document.querySelector("#downloadCsvBtn");
const sendOverdueBtn = document.querySelector("#sendOverdueBtn");
const reportTable = document.querySelector("#reportTable");
const myLoansTable = document.querySelector("#myLoansTable");
const confirmModal = document.querySelector("#confirmModal");
const confirmText = document.querySelector("#confirmText");
const confirmCancelBtn = document.querySelector("#confirmCancelBtn");
const confirmOkBtn = document.querySelector("#confirmOkBtn");
const bookModal = document.querySelector("#bookModal");
const bookModalTitle = document.querySelector("#bookModalTitle");
const bookModalCover = document.querySelector("#bookModalCover");
const bookModalAuthor = document.querySelector("#bookModalAuthor");
const bookModalMeta = document.querySelector("#bookModalMeta");
const bookModalLocation = document.querySelector("#bookModalLocation");
const bookModalAvailability = document.querySelector("#bookModalAvailability");
const bookModalDescription = document.querySelector("#bookModalDescription");
const bookModalRating = document.querySelector("#bookModalRating");
const bookModalActions = document.querySelector("#bookModalActions");
const bookModalClose = document.querySelector("#bookModalClose");

let pendingDeleteStudentId = null;
let pendingDeleteBookId = null; // Adicionado para gerenciar exclusão de livros
let currentRole = null;
let lastBooks = [];
let lastStudents = []; // Armazena alunos para busca local/preenchimento

const tabButtons = document.querySelectorAll(".tab[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");
const roleTabs = document.querySelectorAll("[data-role]");

function handleApiError(err) {
  const message = err && err.message ? err.message : "Ocorreu um erro inesperado.";
  alert(`Erro: ${message}`);
}

async function apiFetch(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "solicitacao_falhou");
  }
  return data;
}

function setAuthState(authenticated, username) {
  loginCard.classList.toggle("hidden", authenticated);
  appView.classList.toggle("hidden", !authenticated);
  appView.toggleAttribute("hidden", !authenticated);
  statusText.textContent = authenticated ? `Conectado: ${username}` : "Desconectado";
}

function setRoleUI(role) {
  currentRole = role;
  roleTabs.forEach((el) => {
    const allowed = el.dataset.role === role;
    if (el.dataset.role) {
      el.classList.toggle("hidden", !allowed);
    }
  });
  if (role === "student") {
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === "catalogo"));
    tabPanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== "tab-catalogo");
    });
  }
}

async function loadSeedInfo() {
  const data = await apiFetch("/api/info");
  if (data.seededAdmin && data.seededAdmin.username) {
    seedHint.textContent = `Usuário inicial: ${data.seededAdmin.username} / ${data.seededAdmin.password}`;
  }
}

async function checkSession() {
  const data = await apiFetch("/api/me");
  setAuthState(data.authenticated, data.username || "");
  if (data.authenticated) {
    setRoleUI(data.role);
    await refreshByRole(data.role);
  } else {
    await loadSeedInfo();
  }
}

async function login() {
  const username = document.querySelector("#loginUser").value.trim();
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPass").value.trim();
  let data;
  if (loginType.value === "student") {
    data = await apiFetch("/api/student-login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  } else {
    data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  }
  setAuthState(true, data.username);
  setRoleUI(data.role);
  await refreshByRole(data.role);
}

async function logout() {
  await apiFetch("/api/logout", { method: "POST" });
  setAuthState(false, "");
  await loadSeedInfo();
}

function renderBooks(books) {
  lastBooks = books;
  const grouped = books.reduce((acc, b) => {
    const key = b.category || "Sem categoria";
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  const sections = Object.keys(grouped).sort().map((category) => {
    const cards = grouped[category]
      .map((b) => {
        const cover = b.cover_url || "https://via.placeholder.com/240x320?text=Livro";
        return `<article class="book-card" data-action="open-book" data-id="${b.id}">
          <img class="book-cover" src="${cover}" alt="Capa do livro ${b.title}" />
        </article>`;
      })
      .join("");
    return `<section class="category-section">
      <h3 class="category-title">${category}</h3>
      <div class="catalog-grid">${cards}</div>
    </section>`;
  });

  booksByCategory.innerHTML = sections.join("");

  loanBook.innerHTML = books
    .map((b) => `<option value="${b.id}">${b.title} (${b.copies_available} disp.)</option>`)
    .join("");

  reserveBook.innerHTML = books
    .map((b) => `<option value="${b.id}">${b.title}</option>`)
    .join("");

  if (booksAdminTable) {
    booksAdminTable.innerHTML = books
      .map(
        (b) => `<tr>
          <td>${b.title}</td>
          <td>${b.author}</td>
          <td>${b.category || "-"}</td>
          <td>
            <button class="tab" data-action="edit-book" data-id="${b.id}">Editar</button>
            <button class="tab ghost" data-action="delete-book" data-id="${b.id}">Apagar</button>
          </td>
        </tr>`
      )
      .join("");
  }
}

async function loadBooks(query) {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  const books = await apiFetch(`/api/books${q}`);
  renderBooks(books);
}

function renderStudents(students) {
  lastStudents = students;
  studentsTable.innerHTML = students
    .map(
      (s) => `<tr>
        <td>${s.name}</td>
        <td>${s.class_name || "-"}</td>
        <td>${s.email || "-"}</td>
        <td>
          <button class="tab" data-action="edit-student" data-id="${s.id}">Editar</button>
          <button class="tab ghost" data-action="delete-student" data-id="${s.id}">Apagar</button>
        </td>
      </tr>`
    )
    .join("");

  const options = ['<option value="">(Não cadastrado / Avulso)</option>']
    .concat(students.map((s) => `<option value="${s.id}">${s.name}</option>`))
    .join("");
  loanStudentId.innerHTML = options;
  reserveStudent.innerHTML = students
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
}

async function loadStudents(query) {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  const students = await apiFetch(`/api/students${q}`);
  renderStudents(students);
}

async function addStudent() {
  const payload = {
    name: studentName.value.trim(),
    class_name: studentClass.value.trim(),
    email: studentEmail.value.trim(),
    password: studentPassword.value.trim()
  };
  if (studentId.value) {
    await apiFetch(`/api/students/${studentId.value}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await apiFetch("/api/students", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  await loadStudents("");
  resetStudentForm();
}

function resetStudentForm() {
  studentName.value = "";
  studentClass.value = "";
  studentEmail.value = "";
  studentPassword.value = "";
  studentId.value = "";
  saveStudentBtn.textContent = "Salvar Aluno";
}

async function startStudentEdit(id) {
  const student = lastStudents.find((s) => String(s.id) === String(id));
  if (!student) return;
  studentId.value = student.id;
  studentName.value = student.name || "";
  studentClass.value = student.class_name || "";
  studentEmail.value = student.email || "";
  studentPassword.value = "";
  saveStudentBtn.textContent = "Atualizar Aluno";
}

async function addBook() {
  const payload = {
    title: document.querySelector("#bookTitle").value.trim(),
    author: document.querySelector("#bookAuthor").value.trim(),
    publisher: document.querySelector("#bookPublisher").value.trim(),
    year: document.querySelector("#bookYear").value.trim(),
    isbn: document.querySelector("#bookIsbn").value.trim(),
    category: document.querySelector("#bookCategory").value.trim(),
    location: document.querySelector("#bookLocation").value.trim(),
    cover_url: document.querySelector("#bookCover").value.trim(),
    description: document.querySelector("#bookDescription").value.trim(),
    openlibrary_key: document.querySelector("#bookOpenLibraryKey").value.trim(),
    copies_total: document.querySelector("#bookCopies").value.trim()
  };
  const id = document.querySelector("#bookId").value.trim();
  if (id) {
    await apiFetch(`/api/books/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await apiFetch("/api/books", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  await loadBooks("");
  resetBookForm();
  await loadLoans();
}

function resetBookForm() {
  document.querySelector("#bookTitle").value = "";
  document.querySelector("#bookAuthor").value = "";
  document.querySelector("#bookPublisher").value = "";
  document.querySelector("#bookYear").value = "";
  document.querySelector("#bookIsbn").value = "";
  document.querySelector("#bookCategory").value = "";
  document.querySelector("#bookLocation").value = "";
  document.querySelector("#bookCover").value = "";
  document.querySelector("#bookDescription").value = "";
  document.querySelector("#bookOpenLibraryKey").value = "";
  document.querySelector("#bookCopies").value = "1";
  document.querySelector("#bookId").value = "";
  saveBookBtn.textContent = "Salvar Livro";
}

function startBookEdit(id) {
  const book = lastBooks.find((b) => String(b.id) === String(id));
  if (!book) return;
  document.querySelector("#bookTitle").value = book.title || "";
  document.querySelector("#bookAuthor").value = book.author || "";
  document.querySelector("#bookPublisher").value = book.publisher || "";
  document.querySelector("#bookYear").value = book.year || "";
  document.querySelector("#bookIsbn").value = book.isbn || "";
  document.querySelector("#bookCategory").value = book.category || "";
  document.querySelector("#bookLocation").value = book.location || "";
  document.querySelector("#bookCover").value = book.cover_url || "";
  document.querySelector("#bookDescription").value = book.description || "";
  document.querySelector("#bookOpenLibraryKey").value = book.openlibrary_key || "";
  document.querySelector("#bookCopies").value = book.copies_total || 1;
  document.querySelector("#bookId").value = book.id;
  saveBookBtn.textContent = "Atualizar Livro";
}

async function lookupOpenLibrary() {
  const isbn = document.querySelector("#bookIsbn").value.trim();
  const title = document.querySelector("#bookTitle").value.trim();
  const author = document.querySelector("#bookAuthor").value.trim();
  const params = new URLSearchParams();
  if (isbn) params.set("isbn", isbn);
  if (!isbn) {
    if (title) params.set("title", title);
    if (author) params.set("author", author);
  }
  if (!params.toString()) {
    alert("Preencha ISBN ou título.");
    return;
  }
  const data = await apiFetch(`/api/openlibrary/lookup?${params.toString()}`);
  if (data.title) document.querySelector("#bookTitle").value = data.title;
  if (data.author) document.querySelector("#bookAuthor").value = data.author;
  if (data.publisher) document.querySelector("#bookPublisher").value = data.publisher;
  if (data.year) document.querySelector("#bookYear").value = data.year;
  if (data.isbn) document.querySelector("#bookIsbn").value = data.isbn;
  if (data.category) document.querySelector("#bookCategory").value = data.category;
  if (data.cover_url) document.querySelector("#bookCover").value = data.cover_url;
  if (data.description) document.querySelector("#bookDescription").value = data.description;
  if (data.openlibrary_key) document.querySelector("#bookOpenLibraryKey").value = data.openlibrary_key;
}

async function createLoan() {
  const payload = {
    book_id: loanBook.value,
    student_id: loanStudentId.value || null,
    student_name: loanStudent.value.trim(),
    student_class: loanClass.value.trim()
  };
  await apiFetch("/api/loans", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  loanStudent.value = "";
  loanClass.value = "";
  loanStudentId.value = "";
  await refreshByRole(currentRole);
}

async function loadLoans() {
  const loans = await apiFetch("/api/loans?active=true");
  returnLoan.innerHTML = loans
    .map(
      (l) =>
        `<option value="${l.id}">#${l.id} - ${l.title} - ${l.student_fullname || l.student_name}</option>`
    )
    .join("");
}

async function returnLoanById() {
  const id = returnLoan.value;
  if (!id) return;
  await apiFetch(`/api/returns/${id}`, { method: "POST" });
  await refreshByRole(currentRole);
}

function renderStats(stats) {
  const items = [
    { label: "Títulos", value: stats.totalBooks },
    { label: "Cópias", value: stats.totalCopies },
    { label: "Disponíveis", value: stats.availableCopies },
    { label: "Empréstimos ativos", value: stats.activeLoans },
    { label: "Atrasados", value: stats.overdueLoans },
    { label: "Multa (total)", value: `R$ ${stats.totalFine}` }
  ];
  statsBox.innerHTML = items
    .map((item) => `<div class="stat"><strong>${item.value}</strong><div>${item.label}</div></div>`)
    .join("");
}

function renderReport(rows) {
  reportTable.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${r.title}</td>
        <td>${r.student_name}</td>
        <td>${r.student_class || "-"}</td>
        <td>${r.loaned_at}</td>
        <td>${r.due_date}</td>
        <td>${r.returned_at || "-"}</td>
        <td>R$ ${r.fine}</td>
      </tr>`
    )
    .join("");
}

async function loadOverview() {
  const stats = await apiFetch("/api/reports/overview");
  renderStats(stats);
}

async function runReport() {
  const from = reportFrom.value;
  const to = reportTo.value;
  const rows = await apiFetch(`/api/reports/loans?from=${from}&to=${to}`);
  renderReport(rows);
}

function downloadCsv() {
  const from = reportFrom.value;
  const to = reportTo.value;
  if (!from || !to) {
    alert("Preencha o período antes de baixar.");
    return;
  }
  window.location.href = `/api/reports/loans.csv?from=${from}&to=${to}`;
}

function renderReservations(rows) {
  reservationsTable.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${r.title}</td>
        <td>${r.student_name}</td>
        <td>${r.requested_at}</td>
        <td>
          <button data-action="fulfill" data-id="${r.id}" class="tab">Atender</button>
          <button data-action="cancel" data-id="${r.id}" class="tab ghost">Cancelar</button>
        </td>
      </tr>`
    )
    .join("");
}

async function loadReservations() {
  const rows = await apiFetch("/api/reservations?active=true");
  renderReservations(rows);
}

async function createReservation() {
  const payload = {
    book_id: reserveBook.value,
    student_id: reserveStudent.value
  };
  await apiFetch("/api/reservations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadReservations();
}

async function handleReservationAction(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  await apiFetch(`/api/reservations/${id}/${action}`, { method: "POST" });
  await loadReservations();
}

async function refreshByRole(role) {
  if (role === "student") {
    await Promise.all([loadBooks(""), loadMyLoans()]);
    return;
  }
  await Promise.all([
    loadBooks(""),
    loadStudents(""),
    loadLoans(),
    loadReservations(),
    loadOverview()
  ]);
}

async function loadMyLoans() {
  const rows = await apiFetch("/api/my-loans");
  myLoansTable.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${r.title}</td>
        <td>${r.author}</td>
        <td>${r.loaned_at}</td>
        <td>${r.due_date}</td>
        <td>${r.returned_at || "-"}</td>
        <td>
          ${r.returned_at ? "-" : `<button class="tab" data-action="return-book" data-id="${r.id}">Devolver</button>`}
        </td>
      </tr>`
    )
    .join("");
}

async function borrowBook(bookId) {
  await apiFetch("/api/my-loans", {
    method: "POST",
    body: JSON.stringify({ book_id: bookId })
  });
  await refreshByRole("student");
}

function openBookModal(bookId) {
  const book = lastBooks.find((b) => String(b.id) === String(bookId));
  if (!book) return;

  if (bookModalTitle) bookModalTitle.textContent = book.title || "Sem título";
  if (bookModalAuthor) bookModalAuthor.textContent = book.author ? `Por ${book.author}` : "";
  if (bookModalMeta) bookModalMeta.textContent = book.year ? `Ano: ${book.year}` : "";
  if (bookModalLocation) bookModalLocation.textContent = book.location ? `Local: ${book.location}` : "";
  if (bookModalAvailability) bookModalAvailability.textContent = book.copies_available > 0 ? "Disponível" : "Indisponível";
  if (bookModalDescription) bookModalDescription.textContent = book.description || "Sem sinopse disponível.";

  if (bookModalCover) {
    bookModalCover.src = book.cover_url || "https://via.placeholder.com/240x320?text=Livro";
    bookModalCover.removeAttribute("style");
  }

  const modalCard = bookModal.querySelector(".modal-card");
  if (modalCard) modalCard.removeAttribute("style");

  if (book.openlibrary_key) {
    apiFetch(`/api/openlibrary/ratings?key=${encodeURIComponent(book.openlibrary_key)}`)
      .then((data) => {
        if (data.average === null || data.average === undefined) {
          if (bookModalRating) bookModalRating.textContent = "Avaliação: sem dados.";
          return;
        }
        const avg = Number(data.average).toFixed(2);
        const cnt = data.count ? ` (${data.count})` : "";
        if (bookModalRating) bookModalRating.textContent = `Avaliação: ${avg}${cnt}`;
      })
      .catch(() => {
        if (bookModalRating) bookModalRating.textContent = "Avaliação: indisponível.";
      });
  } else if (bookModalRating) {
    bookModalRating.textContent = "Avaliação: sem dados.";
  }

  if (bookModalActions) {
    bookModalActions.innerHTML = "";
    if (currentRole === "student") {
      const canBorrow = book.copies_available > 0;
      const btn = document.createElement("button");
      btn.className = "tab";
      btn.textContent = "Pegar emprestado";
      btn.disabled = !canBorrow;
      btn.addEventListener("click", () => {
        borrowBook(book.id)
          .then(() => {
            bookModal.classList.add("hidden");
          })
          .catch((err) => {
            if (err.message === "no_copies_available") {
              alert("Não há cópias disponíveis.");
            } else {
              alert("Não foi possível pegar emprestado.");
            }
          });
      });
      bookModalActions.appendChild(btn);
    }
  }

  bookModal.classList.remove("hidden");
}

async function sendOverdueEmails() {
  const result = await apiFetch("/api/notifications/overdue", { method: "POST" });
  alert(`E-mails enviados: ${result.sent}`);
}

/* Event Listeners */

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    tabPanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== `tab-${tab}`);
    });
    if (tab === "meus-emprestimos") {
      loadMyLoans().catch(handleApiError);
    }
  });
});

function updateLoginTypeUI() {
  const isStudent = loginType.value === "student";
  loginUserLabel.classList.toggle("hidden", isStudent);
  loginEmailLabel.classList.toggle("hidden", !isStudent);
}

loginType.addEventListener("change", updateLoginTypeUI);
updateLoginTypeUI();

loginBtn.addEventListener("click", () => login().catch(handleApiError));
logoutBtn.addEventListener("click", () => logout().catch(handleApiError));

searchBtn.addEventListener("click", () => loadBooks(searchInput.value).catch(handleApiError));
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") loadBooks(searchInput.value).catch(handleApiError);
});

booksByCategory.addEventListener("click", (event) => {
  const card = event.target.closest("[data-action='open-book']");
  if (!card) return;
  openBookModal(card.dataset.id);
});

// Auto-preenche os dados do aluno no formulário de empréstimo ao selecionar
loanStudentId.addEventListener("change", () => {
  const selectedId = loanStudentId.value;
  if (!selectedId) return;
  const student = lastStudents.find((s) => String(s.id) === String(selectedId));
  if (student) {
    loanStudent.value = student.name || "";
    loanClass.value = student.class_name || "";
  }
});

if (booksAdminTable) {
  booksAdminTable.addEventListener("click", (event) => {
    const btnEdit = event.target.closest("button[data-action='edit-book']");
    if (btnEdit) {
      startBookEdit(btnEdit.dataset.id);
      return;
    }
    const btnDel = event.target.closest("button[data-action='delete-book']");
    if (btnDel) {
      pendingDeleteBookId = btnDel.dataset.id;
      confirmText.textContent = "Tem certeza que deseja apagar este livro?";
      confirmModal.classList.remove("hidden");
    }
  });
}

saveBookBtn.addEventListener("click", () => addBook().catch(handleApiError));
lookupBookBtn.addEventListener("click", () => lookupOpenLibrary().catch(handleApiError));
cancelBookEditBtn.addEventListener("click", () => resetBookForm());

createLoanBtn.addEventListener("click", () => createLoan().catch(handleApiError));
returnBtn.addEventListener("click", () => returnLoanById().catch(handleApiError));

runReportBtn.addEventListener("click", () => runReport().catch(handleApiError));
downloadCsvBtn.addEventListener("click", () => downloadCsv());

saveStudentBtn.addEventListener("click", () => addStudent().catch(handleApiError));
studentSearchBtn.addEventListener("click", () => loadStudents(studentSearch.value).catch(handleApiError));
studentSearch.addEventListener("keypress", (e) => {
  if (e.key === "Enter") loadStudents(studentSearch.value).catch(handleApiError);
});

reserveBtn.addEventListener("click", () => createReservation().catch(handleApiError));
reservationsTable.addEventListener("click", (event) => {
  handleReservationAction(event).catch(handleApiError);
});

sendOverdueBtn.addEventListener("click", () => sendOverdueEmails().catch(handleApiError));
cancelStudentEditBtn.addEventListener("click", () => resetStudentForm());

studentsTable.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "edit-student") {
    startStudentEdit(btn.dataset.id).catch(handleApiError);
    return;
  }
  if (btn.dataset.action === "delete-student") {
    pendingDeleteStudentId = btn.dataset.id;
    confirmText.textContent = "Tem certeza que deseja apagar este aluno?";
    confirmModal.classList.remove("hidden");
  }
});

myLoansTable.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action='return-book']");
  if (!btn) return;
  apiFetch(`/api/my-returns/${btn.dataset.id}`, { method: "POST" })
    .then(() => loadMyLoans())
    .catch((err) => {
      if (err.message === "already_returned") {
        alert("Este empréstimo já foi devolvido.");
      } else {
        alert("Não foi possível devolver.");
      }
    });
});

confirmCancelBtn.addEventListener("click", () => {
  pendingDeleteStudentId = null;
  pendingDeleteBookId = null;
  confirmModal.classList.add("hidden");
});

confirmOkBtn.addEventListener("click", () => {
  if (pendingDeleteStudentId) {
    apiFetch(`/api/students/${pendingDeleteStudentId}`, { method: "DELETE" })
      .then(() => loadStudents(""))
      .catch((err) => {
        if (err.message === "student_has_active_loans") {
          alert("Não foi possível apagar: aluno possui empréstimos ativos.");
        } else {
          alert("Erro ao apagar aluno.");
        }
      })
      .finally(() => {
        pendingDeleteStudentId = null;
        confirmModal.classList.add("hidden");
      });
  } else if (pendingDeleteBookId) {
    apiFetch(`/api/books/${pendingDeleteBookId}`, { method: "DELETE" })
      .then(() => loadBooks(""))
      .catch(() => alert("Erro ao apagar livro."))
      .finally(() => {
        pendingDeleteBookId = null;
        confirmModal.classList.add("hidden");
      });
  }
});

bookModalClose.addEventListener("click", () => {
  bookModal.classList.add("hidden");
});

// Inicialização da sessão
checkSession().catch(handleApiError);