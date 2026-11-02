"use strict";

(() => {
  const phoneLink = "tel:+996506948405";
  const numberFormat = new Intl.NumberFormat("ru-RU");
  const form = document.querySelector("#booking-form");
  const roomSelect = document.querySelector("#room-type");
  const checkIn = document.querySelector("#check-in");
  const checkOut = document.querySelector("#check-out");
  const guestSelect = document.querySelector("#guests");
  const costMessage = document.querySelector("#booking-cost");
  const responseMessage = document.querySelector("#booking-message");
  let roomData = [];

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  const formattedSom = (amount) => `${numberFormat.format(amount)} сом`;
  const nightNoun = (count) => {
    const lastTwo = count % 100;
    const lastOne = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "ночей";
    if (lastOne === 1) return "ночь";
    if (lastOne >= 2 && lastOne <= 4) return "ночи";
    return "ночей";
  };
  const localIsoDate = (date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  };
  const getNights = () => {
    if (!checkIn?.value || !checkOut?.value) return 0;
    return (Date.parse(`${checkOut.value}T00:00:00.000Z`) - Date.parse(`${checkIn.value}T00:00:00.000Z`)) / 86400000;
  };

  function renderRooms(rooms) {
    const grid = document.querySelector("#room-grid");
    if (!grid) return;
    if (!rooms.length) {
      grid.innerHTML = '<p class="empty-state">Сейчас нет доступных номеров. Позвоните нам, чтобы уточнить условия.</p>';
      return;
    }
    grid.innerHTML = rooms.map((room, index) => `
      <article class="room-card">
        <div class="room-image">
          <img src="${escapeHtml(room.image)}" alt="${escapeHtml(room.name)} — номер в отеле Ала-Тоо Inn" loading="lazy" decoding="async">
          <span class="room-badge">${index === 0 ? "Для отдыха" : index === 1 ? "Больше пространства" : "Особенный вид"}</span>
        </div>
        <div class="room-content">
          <div class="room-heading"><h3>${escapeHtml(room.name)}</h3><span class="room-price">от ${formattedSom(room.price)}<small>за ночь</small></span></div>
          <p class="room-description">${escapeHtml(room.description)}</p>
          <div class="room-meta"><span>${room.area} м²</span><span>До ${room.capacity} гостей</span><span>Кыргызстан</span></div>
          <a class="text-link" href="/?room=${encodeURIComponent(room.slug)}#booking">Посмотреть даты <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    `).join("");
    observeReveals(grid);
  }

  function renderNews(items, limit) {
    const grid = document.querySelector("#news-grid");
    if (!grid) return;
    const visibleItems = typeof limit === "number" ? items.slice(0, limit) : items;
    if (!visibleItems.length) {
      grid.innerHTML = '<p class="empty-state">Новых публикаций пока нет. Позвоните нам, чтобы уточнить актуальные предложения.</p>';
      return;
    }
    grid.innerHTML = visibleItems.map((item) => `
      <article class="news-card">
        <div class="news-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async"></div>
        <div class="news-content"><span class="news-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div>
      </article>
    `).join("");
    observeReveals(grid);
  }

  function renderReviews(reviews) {
    const grid = document.querySelector("#review-grid");
    if (!grid) return;
    if (!reviews.length) {
      grid.innerHTML = '<p class="empty-state">Оценки пока не опубликованы.</p>';
      return;
    }
    grid.innerHTML = reviews.map((review) => {
      const link = review.url
        ? `<a href="${escapeHtml(review.url)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>`
        : "";
      return `
        <article class="review-card">
          <strong>${escapeHtml(review.platform)}</strong>
          <span class="review-score">${escapeHtml(review.score)}</span>
          <p>${escapeHtml(review.description)}</p>${link}
        </article>
      `;
    }).join("");
    observeReveals(grid);
  }

  function renderRoomSelect(rooms) {
    if (!roomSelect) return;
    if (!rooms.length) {
      roomSelect.innerHTML = '<option value="">Уточните наличие по телефону</option>';
      return;
    }
    const params = new URLSearchParams(location.search);
    const requestedRoom = params.get("room");
    roomSelect.innerHTML = rooms.map((room) => `
      <option value="${escapeHtml(room.slug)}" data-price="${room.price}" data-capacity="${room.capacity}">
        ${escapeHtml(room.name)} · ${formattedSom(room.price)}
      </option>
    `).join("");
    if (rooms.some((room) => room.slug === requestedRoom)) roomSelect.value = requestedRoom;
    updateBookingEstimate();
  }

  function updateBookingEstimate() {
    if (!form || !costMessage || !roomSelect) return;
    const room = roomData.find((item) => item.slug === roomSelect.value);
    const nights = getNights();
    const guests = Number(guestSelect?.value || 1);
    if (!room || nights < 1 || !Number.isInteger(nights)) {
      costMessage.textContent = "Выберите даты — покажем ориентировочную стоимость. Бронирование подтвердит администратор.";
      return;
    }
    if (guests > room.capacity) {
      costMessage.textContent = `В выбранном номере можно разместить не более ${room.capacity} гостей.`;
      return;
    }
    costMessage.textContent = `${room.name} · ${nights} ${nightNoun(nights)} · ориентировочно ${formattedSom(room.price * nights)}. Заявка не является подтверждённым бронированием.`;
  }

  function showMessage(message, isError = false, bookingId = null) {
    if (!responseMessage) return;
    responseMessage.classList.toggle("is-error", isError);
    responseMessage.replaceChildren();
    responseMessage.append(document.createTextNode(message));
    if (!isError && bookingId) {
      responseMessage.append(document.createTextNode(" Остались вопросы? "));
      const phone = document.createElement("a");
      phone.href = phoneLink;
      phone.textContent = "Позвонить в отель";
      responseMessage.append(phone);
    }
  }

  async function loadContent() {
    try {
      const response = await fetch("/api/public", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Сайт временно не может загрузить данные.");
      const content = await response.json();
      roomData = content.rooms;
      renderRooms(content.rooms);
      renderNews(content.news, document.body.dataset.page === "home" ? 3 : undefined);
      renderReviews(content.reviews);
      renderRoomSelect(content.rooms);
    } catch (error) {
      console.error("Не удалось загрузить содержимое сайта:", error);
      if (form) showMessage("Не удалось связаться с сервером. Запустите сайт файлом START-SITE.cmd и откройте http://127.0.0.1:3000.", true);
      const roomGrid = document.querySelector("#room-grid");
      const newsGrid = document.querySelector("#news-grid");
      if (roomGrid) roomGrid.innerHTML = '<p class="empty-state">Не удалось подключиться к серверу. Проверьте, что сайт запущен.</p>';
      if (newsGrid) newsGrid.innerHTML = '<p class="empty-state">Не удалось подключиться к серверу. Проверьте, что сайт запущен.</p>';
    }
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!form || !form.reportValidity()) return;
    const room = roomData.find((item) => item.slug === roomSelect?.value);
    if (!room) {
      showMessage("Пожалуйста, выберите категорию номера.", true);
      return;
    }
    const nights = getNights();
    if (!Number.isInteger(nights) || nights < 1) {
      checkOut?.setCustomValidity("Дата выезда должна быть позже даты заезда.");
      checkOut?.reportValidity();
      return;
    }
    checkOut?.setCustomValidity("");
    if (Number(guestSelect?.value) > room.capacity) {
      showMessage(`В выбранном номере можно разместить не более ${room.capacity} гостей.`, true);
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    const originalLabel = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем заявку…";
    showMessage("");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.");
      showMessage(`${data.message} Ориентировочная стоимость проживания: ${formattedSom(data.total)}.`, false, data.bookingId);
      form.reset();
      checkIn.min = localIsoDate(new Date());
      checkOut.min = localIsoDate(new Date());
      costMessage.textContent = "Выберите даты — покажем ориентировочную стоимость. Бронирование подтвердит администратор.";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showMessage(error.message || "Не удалось связаться с сервером. Попробуйте ещё раз.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalLabel;
    }
  }

  function setupNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const links = document.querySelector(".navigation-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const isOpen = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    });
    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Открыть меню");
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !links.classList.contains("is-open")) return;
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Открыть меню");
      toggle.focus();
    });
    links.querySelectorAll("a[href]").forEach((link) => {
      const linkUrl = new URL(link.href, location.href);
      if (linkUrl.pathname.replace(/\.html$/, "").replace(/\/$/, "") === location.pathname.replace(/\.html$/, "").replace(/\/$/, "")) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function observeReveals(scope = document) {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scope.querySelectorAll(".reveal, .room-card, .news-card").forEach((element) => element.classList.add("is-visible"));
      return;
    }
    let observer = window.__alaTooRevealObserver;
    if (!observer) {
      observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -28px 0px" });
      window.__alaTooRevealObserver = observer;
    }
    scope.querySelectorAll(".reveal, .room-card, .news-card").forEach((element) => {
      element.classList.add("js-reveal");
      if (!element.classList.contains("is-visible")) observer.observe(element);
    });
  }

  function setupParallax() {
    const hero = document.querySelector(".hero-image");
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let scheduled = false;
    window.addEventListener("scroll", () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        hero.style.transform = `translate3d(0, ${Math.min(window.scrollY * 0.12, 72)}px, 0) scale(1.05)`;
        scheduled = false;
      });
    }, { passive: true });
  }

  if (checkIn && checkOut) {
    const today = localIsoDate(new Date());
    checkIn.min = today;
    checkOut.min = today;
    checkIn.addEventListener("change", () => {
      checkOut.min = checkIn.value || today;
      if (checkOut.value && checkOut.value <= checkIn.value) {
        const nextDay = new Date(`${checkIn.value}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        checkOut.value = localIsoDate(nextDay);
      }
      updateBookingEstimate();
    });
    checkOut.addEventListener("change", updateBookingEstimate);
  }
  roomSelect?.addEventListener("change", updateBookingEstimate);
  guestSelect?.addEventListener("change", updateBookingEstimate);
  form?.addEventListener("submit", submitBooking);

  setupNavigation();
  observeReveals();
  setupParallax();
  loadContent();
})();
