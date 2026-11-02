"use strict";

(() => {
  const authCard = document.querySelector("#auth-card");
  const authDescription = document.querySelector("#auth-description");
  const authFeedback = document.querySelector("#auth-feedback");
  const setupForm = document.querySelector("#setup-form");
  const loginForm = document.querySelector("#login-form");
  const dashboard = document.querySelector("#dashboard");
  const dashboardFeedback = document.querySelector("#dashboard-feedback");
  let csrfToken = "";
  let latestData = null;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const formatMoney = (value) => `${new Intl.NumberFormat("ru-RU").format(value)} сом`;
  const formatDate = (value) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
  const formatGuests = (value) => {
    const remainder = value % 10;
    const lastTwo = value % 100;
    const noun = lastTwo >= 11 && lastTwo <= 14 ? "гостей" : remainder === 1 ? "гость" : remainder >= 2 && remainder <= 4 ? "гостя" : "гостей";
    return `${value} ${noun}`;
  };
  const phoneLink = (value) => {
    const normalized = value.replace(/[^\d+]/g, "");
    if (normalized.startsWith("+")) return normalized;
    if (normalized.startsWith("0")) return `+996${normalized.slice(1)}`;
    return normalized;
  };

  function showFeedback(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("is-error", isError);
  }

  async function request(url, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (options.method && options.method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Ошибка сервера (${response.status}).`);
    return data;
  }

  function showDashboard(username, token) {
    csrfToken = token;
    document.querySelector("#admin-name").textContent = username;
    authCard.hidden = true;
    dashboard.hidden = false;
    loadDashboard().catch((error) => showFeedback(dashboardFeedback, error.message, true));
  }

  function setActiveTab(tabName) {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".dashboard-panel").forEach((panel) => {
      panel.hidden = panel.id !== `panel-${tabName}`;
    });
  }

  async function loadDashboard() {
    const data = await request("/api/admin/data");
    latestData = data;
    renderBookings(data.bookings);
    renderRooms(data.rooms);
    renderNews(data.news);
    renderReviews(data.reviews);
  }

  function renderBookings(bookings) {
    const tbody = document.querySelector("#bookings-table");
    const numberFormat = new Intl.NumberFormat("ru-RU");
    document.querySelector("#booking-count").textContent = String(bookings.filter((booking) => booking.status === "new").length);
    document.querySelector("#stat-total").textContent = String(bookings.length);
    document.querySelector("#stat-new").textContent = String(bookings.filter((booking) => booking.status === "new").length);
    document.querySelector("#stat-confirmed").textContent = String(bookings.filter((booking) => booking.status === "confirmed").length);
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="5">Пока заявок нет. Когда гость заполнит форму на сайте, заявка отобразится здесь.</td></tr>';
      return;
    }
    tbody.innerHTML = bookings.map((booking) => `
      <tr>
        <td><span class="booking-guest">${escapeHtml(booking.guest_name)}</span><a class="booking-phone" href="tel:${escapeHtml(phoneLink(booking.phone))}">${escapeHtml(booking.phone)}</a></td>
        <td>${formatDate(booking.check_in)} — ${formatDate(booking.check_out)}<br>${escapeHtml(booking.created_at)}</td>
        <td>${escapeHtml(booking.room_name)}<br>${formatGuests(booking.guests)}</td>
        <td>${formatMoney(booking.total)}</td>
        <td><label class="sr-only" for="booking-status-${booking.id}">Статус заявки ${booking.id}</label><select class="booking-state" id="booking-status-${booking.id}" data-booking-status="${booking.id}"><option value="new" ${booking.status === "new" ? "selected" : ""}>Новая</option><option value="confirmed" ${booking.status === "confirmed" ? "selected" : ""}>Подтверждена</option><option value="cancelled" ${booking.status === "cancelled" ? "selected" : ""}>Отменена</option></select></td>
      </tr>
    `).join("");
  }

  function renderRooms(rooms) {
    document.querySelector("#admin-rooms").innerHTML = rooms.map((room) => `
      <form class="room-editor" data-room-slug="${escapeHtml(room.slug)}">
        <h3>${escapeHtml(room.name)}</h3>
        <label>Название<input name="name" maxlength="80" value="${escapeHtml(room.name)}" required></label>
        <label>Цена за ночь, сом<input name="price" type="number" min="1" max="10000000" value="${room.price}" required></label>
        <label>Площадь, м²<input name="area" type="number" min="1" max="1000" value="${room.area}" required></label>
        <label>Вместимость, гостей<input name="capacity" type="number" min="1" max="10" value="${room.capacity}" required></label>
        <label class="span-two">Описание<textarea name="description" maxlength="500" required>${escapeHtml(room.description)}</textarea></label>
        <label class="span-two">Изображение, HTTPS-ссылка<input name="image" type="url" maxlength="1500" value="${escapeHtml(room.image)}" required></label>
        <button class="button" type="submit">Сохранить изменения</button>
      </form>
    `).join("");
  }

  function renderNews(items) {
    const list = document.querySelector("#admin-news");
    if (!items.length) {
      list.innerHTML = '<p class="legal-note">Новостей пока нет.</p>';
      return;
    }
    list.innerHTML = items.map((item) => `
      <article class="admin-news-item"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.created_at)}</span></div><button class="button button-danger" type="button" data-delete-news="${item.id}" aria-label="Удалить новость ${escapeHtml(item.title)}">Удалить</button></article>
    `).join("");
  }

  function renderReviews(reviews) {
    document.querySelector("#admin-reviews").innerHTML = reviews.map((review) => `
      <form class="admin-review-editor" data-review-id="${review.id}">
        <h3>${escapeHtml(review.platform)}</h3>
        <div>
          <label>Опубликованная оценка<input name="score" maxlength="24" value="${escapeHtml(review.score)}" required></label>
          <label>Подпись<input name="description" maxlength="180" value="${escapeHtml(review.description)}" required></label>
          <label>Ссылка на страницу отеля · HTTPS<input name="url" type="url" maxlength="1500" value="${escapeHtml(review.url)}" placeholder="https://..."></label>
        </div>
        <button class="button" type="submit">Сохранить рейтинг</button>
      </form>
    `).join("");
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(authFeedback, "");
    const formData = new FormData(setupForm);
    try {
      const data = await request("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData))
      });
      showDashboard(data.username, data.csrfToken);
    } catch (error) {
      showFeedback(authFeedback, error.message, true);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(authFeedback, "");
    const formData = new FormData(loginForm);
    try {
      const data = await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(formData))
      });
      showDashboard(data.username, data.csrfToken);
    } catch (error) {
      showFeedback(authFeedback, error.message, true);
    }
  });

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.querySelector("#refresh-button").addEventListener("click", async () => {
    try {
      await loadDashboard();
      showFeedback(dashboardFeedback, "Данные обновлены.");
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    }
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await request("/api/admin/logout", { method: "POST" });
      window.location.reload();
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    }
  });

  document.querySelector("#admin-rooms").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-room-slug]");
    if (!form) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    values.price = Number(values.price);
    values.area = Number(values.area);
    values.capacity = Number(values.capacity);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await request(`/api/admin/rooms/${encodeURIComponent(form.dataset.roomSlug)}`, {
        method: "PUT",
        body: JSON.stringify(values)
      });
      await loadDashboard();
      showFeedback(dashboardFeedback, "Номер обновлён. Новые данные уже доступны на сайте.");
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#admin-reviews").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-review-id]");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await request(`/api/admin/reviews/${encodeURIComponent(form.dataset.reviewId)}`, {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      await loadDashboard();
      showFeedback(dashboardFeedback, "Рейтинг обновлён на сайте.");
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#news-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request("/api/admin/news", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      form.reset();
      await loadDashboard();
      showFeedback(dashboardFeedback, "Публикация добавлена и показана на сайте.");
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    }
  });

  document.querySelector("#admin-news").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-news]");
    if (!button || !window.confirm("Удалить эту публикацию с сайта?")) return;
    try {
      await request(`/api/admin/news/${button.dataset.deleteNews}`, { method: "DELETE" });
      await loadDashboard();
      showFeedback(dashboardFeedback, "Публикация удалена.");
    } catch (error) {
      showFeedback(dashboardFeedback, error.message, true);
    }
  });

  document.querySelector("#bookings-table").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-booking-status]");
    if (!select) return;
    const previous = latestData?.bookings.find((booking) => String(booking.id) === select.dataset.bookingStatus)?.status;
    try {
      await request(`/api/admin/bookings/${select.dataset.bookingStatus}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });
      await loadDashboard();
      showFeedback(dashboardFeedback, "Статус заявки обновлён.");
    } catch (error) {
      if (previous) select.value = previous;
      showFeedback(dashboardFeedback, error.message, true);
    }
  });

  async function initialize() {
    try {
      const state = await request("/api/admin/session");
      if (state.authenticated) {
        showDashboard(state.username, state.csrfToken);
        return;
      }
      authDescription.textContent = state.setupRequired
        ? "При первом запуске создайте свой пароль администратора. Одноразовый код напечатан в окне сервера."
        : "Войдите под своей учётной записью для управления сайтом.";
      setupForm.hidden = !state.setupRequired;
      loginForm.hidden = state.setupRequired;
    } catch (error) {
      authDescription.textContent = "Не удалось подключиться к локальному серверу.";
      showFeedback(authFeedback, `${error.message} Запустите сайт файлом START-SITE.cmd.`, true);
      setupForm.hidden = true;
      loginForm.hidden = true;
    }
  }

  initialize();
})();
