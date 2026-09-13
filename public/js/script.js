/**
 * Berita Global Terbaru - Main Application Script
 * Vanilla JS · No frameworks
 */

(function () {
  'use strict';

  // ---------- Config ----------
  const PER_PAGE = 10;
  const DATA_URL = '/data/berita.json';
  const CATEGORIES = [
    'Semua',
    'Nasional',
    'Internasional',
    'Politik',
    'Ekonomi',
    'Teknologi',
    'Olahraga',
    'Kesehatan',
    'Lifestyle',
    'Pendidikan',
    'Sains'
  ];

  // ---------- State ----------
  let allNews = [];
  let filteredNews = [];
  let currentPage = 1;
  let currentCategory = 'Semua';
  let currentSort = 'terbaru';
  let searchQuery = '';
  let dataLoaded = false;

  // ---------- DOM refs ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---------- HP vs Desktop: zoom lock hanya di HP, desktop bebas ----------
  function isPhoneDevice() {
    const ua = navigator.userAgent || '';
    const phoneUA = /Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const coarseNarrow =
      window.matchMedia('(max-width: 820px)').matches &&
      window.matchMedia('(pointer: coarse)').matches;
    return phoneUA || coarseNarrow;
  }

  function applyViewportForDevice() {
    const meta = document.getElementById('viewport-meta') || document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    if (isPhoneDevice()) {
      // HP: tidak bisa zoom kecilin / perbesar
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    } else {
      // Desktop: boleh zoom normal, tidak dipaksa ikut sistem HP
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    }
  }

  function preventZoom() {
    applyViewportForDevice();

    // Hanya HP — desktop / laptop tidak diubah
    if (!isPhoneDevice()) return;

    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      },
      { passive: false }
    );

    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) e.preventDefault();
        lastTouchEnd = now;
      },
      { passive: false }
    );
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem('bgt-theme') || 'light';
    setTheme(saved);
    const btn = $('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    }
  }

  function setTheme(mode) {
    if (mode === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const btn = $('#theme-toggle');
      if (btn) btn.textContent = '☀️';
      if (btn) btn.setAttribute('aria-label', 'Light Mode');
    } else {
      document.documentElement.removeAttribute('data-theme');
      const btn = $('#theme-toggle');
      if (btn) btn.textContent = '🌙';
      if (btn) btn.setAttribute('aria-label', 'Dark Mode');
    }
    localStorage.setItem('bgt-theme', mode);
  }

  // ---------- Mobile menu ----------
  function initMobileMenu() {
    const hamburger = $('#hamburger');
    const menu = $('#mobile-menu');
    if (!hamburger || !menu) return;

    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      menu.classList.toggle('open');
    });

    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        hamburger.classList.remove('active');
        menu.classList.remove('open');
      }
    });
  }

  // ---------- Search toggle ----------
  function initSearchToggle() {
    const btn = $('#search-toggle');
    const bar = $('#search-bar');
    const input = $('#search-input');
    const clear = $('#clear-search');

    if (btn && bar) {
      btn.addEventListener('click', () => {
        bar.classList.toggle('open');
        if (bar.classList.contains('open') && input) {
          input.focus();
        }
      });
    }

    if (input) {
      let debounce;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          searchQuery = input.value.trim().toLowerCase();
          if (clear) clear.classList.toggle('visible', searchQuery.length > 0);
          currentPage = 1;
          applyFilters();
          if (!isDetailPage()) showHome();
        }, 280);
      });
    }

    if (clear && input) {
      clear.addEventListener('click', () => {
        input.value = '';
        searchQuery = '';
        clear.classList.remove('visible');
        currentPage = 1;
        applyFilters();
      });
    }
  }

  // ---------- Safe HTML render ----------
  function sanitizeHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Remove dangerous elements
    $$('script, iframe, object, embed, form, link, style', tmp).forEach((el) => el.remove());
    // Remove on* attributes
    $$('*', tmp).forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith('on') || attr.name === 'srcdoc') {
          el.removeAttribute(attr.name);
        }
        if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  // ---------- Image helper ----------
  function createImg(src, alt) {
    const img = document.createElement('img');
    img.alt = alt || 'Berita';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = function () {
      this.onerror = null;
      this.style.display = 'none';
      const ph = document.createElement('div');
      ph.className = 'img-placeholder';
      ph.textContent = '📰';
      this.parentNode.appendChild(ph);
    };
    img.src = src || '';
    return img;
  }

  // ---------- Date helpers ----------
  function parseDateTime(item) {
    const d = item.tanggal || '1970-01-01';
    const t = item.waktu || '00:00';
    return new Date(`${d}T${t}:00`);
  }

  function formatDate(str) {
    if (!str) return '';
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  }

  // ---------- Data loading ----------
  async function loadNews() {
    const loading = $('#loading-state');
    const errorEl = $('#error-state');
    if (loading) loading.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Gagal memuat data');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Format data tidak valid');
      allNews = data;
      dataLoaded = true;
      if (loading) loading.classList.add('hidden');
      applyFilters();
      renderBreaking();
      renderPopular();
      route();
    } catch (err) {
      console.error(err);
      if (loading) loading.classList.add('hidden');
      if (errorEl) errorEl.classList.remove('hidden');
    }
  }

  // ---------- Filtering & Sorting ----------
  function applyFilters() {
    let list = [...allNews];

    // Category
    if (currentCategory && currentCategory !== 'Semua') {
      list = list.filter((n) => (n.kategori || '').toLowerCase() === currentCategory.toLowerCase());
    }

    // Search
    if (searchQuery) {
      list = list.filter((n) => {
        const hay = [
          n.judul || '',
          n.ringkasan || '',
          n.kategori || '',
          n.penulis || ''
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(searchQuery);
      });
    }

    // Sort
    list.sort((a, b) => {
      const da = parseDateTime(a).getTime();
      const db = parseDateTime(b).getTime();
      return currentSort === 'terlama' ? da - db : db - da;
    });

    filteredNews = list;
    renderNewsList();
    renderPagination();
    updateResultsInfo();
  }

  // ---------- Render news cards ----------
  function renderNewsList() {
    const grid = $('#news-grid');
    if (!grid) return;

    const start = (currentPage - 1) * PER_PAGE;
    const pageItems = filteredNews.slice(start, start + PER_PAGE);

    if (pageItems.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <p>Tidak ada berita yang ditemukan.</p>
        </div>`;
      return;
    }

    grid.innerHTML = pageItems
      .map(
        (n) => `
      <article class="news-card">
        <div class="card-image">
          <a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">
            ${imgHtml(n.gambar, n.judul)}
          </a>
        </div>
        <div class="card-body">
          <span class="badge">${escapeHtml(n.kategori || '')}</span>
          <h3 class="card-title">
            <a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">${escapeHtml(n.judul)}</a>
          </h3>
          <p class="card-summary">${escapeHtml(n.ringkasan || '')}</p>
          <div class="card-meta">
            <span>📅 ${formatDate(n.tanggal)}</span>
            <span>🕐 ${escapeHtml(n.waktu || '')}</span>
            <span>✍️ ${escapeHtml(n.penulis || '')}</span>
          </div>
          <a class="btn-read" href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">
            Baca Selengkapnya →
          </a>
        </div>
      </article>`
      )
      .join('');

    // Bind clicks for SPA-like navigation
    $$('#news-grid a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDetail(a.dataset.slug);
      });
    });
  }

  function imgHtml(src, alt) {
    return `<img src="${escapeAttr(src || '')}" alt="${escapeAttr(alt || 'Berita')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none';var p=document.createElement('div');p.className='img-placeholder';p.textContent='📰';this.parentNode.appendChild(p);">`;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- Pagination ----------
  function totalPages() {
    return Math.max(1, Math.ceil(filteredNews.length / PER_PAGE));
  }

  function renderPagination() {
    const el = $('#pagination');
    if (!el) return;

    const total = totalPages();
    if (filteredNews.length <= PER_PAGE) {
      el.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="page-btn" data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>← Sebelumnya</button>`;

    const pages = buildPageNumbers(currentPage, total);
    pages.forEach((p) => {
      if (p === '...') {
        html += `<span class="page-ellipsis">…</span>`;
      } else {
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
    });

    html += `<button class="page-btn" data-page="next" ${currentPage >= total ? 'disabled' : ''}>Berikutnya →</button>`;
    el.innerHTML = html;

    $$('.page-btn', el).forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.page;
        if (val === 'prev') currentPage = Math.max(1, currentPage - 1);
        else if (val === 'next') currentPage = Math.min(total, currentPage + 1);
        else currentPage = parseInt(val, 10);
        renderNewsList();
        renderPagination();
        scrollToNews();
      });
    });
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  function scrollToNews() {
    const section = $('#berita-terbaru');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function updateResultsInfo() {
    const el = $('#results-info');
    if (!el) return;
    const total = filteredNews.length;
    if (searchQuery) {
      el.textContent = `Hasil pencarian: ${total} berita`;
    } else if (currentCategory !== 'Semua') {
      el.textContent = `${total} berita kategori ${currentCategory}`;
    } else {
      el.textContent = `Menampilkan ${total} berita`;
    }
  }

  // ---------- Hero (latest) ----------
  function renderHero() {
    // Hero is rendered as part of home; latest is first after sort
    const sorted = [...allNews].sort((a, b) => parseDateTime(b) - parseDateTime(a));
    const latest = sorted[0];
    const hero = $('#hero-section');
    if (!hero || !latest) {
      if (hero) hero.innerHTML = '';
      return;
    }

    hero.innerHTML = `
      <div class="hero-card">
        <div class="hero-image">
          ${imgHtml(latest.gambar, latest.judul)}
        </div>
        <div class="hero-content">
          <p class="hero-welcome">Selamat Datang di Berita Global Terbaru</p>
          <span class="badge">${escapeHtml(latest.kategori || '')}</span>
          <h2 class="hero-title">
            <a href="/berita/${encodeURIComponent(latest.slug)}" data-slug="${escapeAttr(latest.slug)}">${escapeHtml(latest.judul)}</a>
          </h2>
          <p class="hero-summary">${escapeHtml(latest.ringkasan || '')}</p>
          <div class="hero-meta">
            <span>📅 ${formatDate(latest.tanggal)}</span>
            <span>🕐 ${escapeHtml(latest.waktu || '')}</span>
          </div>
          <a class="btn-primary" href="/berita/${encodeURIComponent(latest.slug)}" data-slug="${escapeAttr(latest.slug)}">
            Baca Selengkapnya →
          </a>
        </div>
      </div>`;

    $$('#hero-section a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDetail(a.dataset.slug);
      });
    });
  }

  // ---------- Breaking ticker ----------
  function renderBreaking() {
    const ticker = $('#ticker');
    if (!ticker) return;
    const sorted = [...allNews].sort((a, b) => parseDateTime(b) - parseDateTime(a)).slice(0, 6);
    if (sorted.length === 0) {
      ticker.innerHTML = '';
      return;
    }
    // Duplicate for seamless loop
    const items = sorted
      .map(
        (n) =>
          `<a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">${escapeHtml(n.judul)}</a>`
      )
      .join('<span style="opacity:0.5"> • </span>');
    ticker.innerHTML = items + '<span style="opacity:0.5"> • </span>' + items;

    $$('#ticker a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDetail(a.dataset.slug);
      });
    });
  }

  // ---------- Popular ----------
  function renderPopular() {
    const box = $('#popular-list');
    if (!box) return;
    const popular = allNews.filter((n) => n.popular === true).slice(0, 5);
    // Fallback: take top 5 by date if none marked popular
    const list =
      popular.length > 0
        ? popular
        : [...allNews].sort((a, b) => parseDateTime(b) - parseDateTime(a)).slice(0, 5);

    box.innerHTML = list
      .map(
        (n, i) => `
      <div class="popular-item">
        <div class="popular-num">${i + 1}</div>
        <div class="popular-info">
          <h4><a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">${escapeHtml(n.judul)}</a></h4>
          <div class="meta">${escapeHtml(n.kategori || '')} · ${formatDate(n.tanggal)}</div>
        </div>
      </div>`
      )
      .join('');

    $$('#popular-list a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDetail(a.dataset.slug);
      });
    });
  }

  // ---------- Category filters ----------
  function initCategories() {
    const wrap = $('#category-filters');
    if (!wrap) return;
    wrap.innerHTML = CATEGORIES.map(
      (c) =>
        `<button class="cat-btn ${c === 'Semua' ? 'active' : ''}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</button>`
    ).join('');

    $$('.cat-btn', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.cat-btn', wrap).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.cat;
        currentPage = 1;
        applyFilters();
        // Update nav active
        updateNavActive(currentCategory);
      });
    });
  }

  function updateNavActive(cat) {
    $$('.nav-desktop a, #mobile-menu a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (cat === 'Semua' && (href === '/' || href === '#home')) {
        a.classList.add('active');
      } else if (href.includes(cat.toLowerCase()) || a.textContent.trim() === cat) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }

  // ---------- Sort ----------
  function initSort() {
    const sel = $('#sort-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      currentSort = sel.value;
      currentPage = 1;
      applyFilters();
    });
  }

  // ---------- Nav category clicks ----------
  function initNavCategories() {
    $$('.nav-desktop a, #mobile-menu a').forEach((a) => {
      a.addEventListener('click', (e) => {
        const text = a.textContent.trim();
        if (text === 'Home' || a.getAttribute('href') === '/') {
          e.preventDefault();
          currentCategory = 'Semua';
          currentPage = 1;
          searchQuery = '';
          const input = $('#search-input');
          if (input) input.value = '';
          const clear = $('#clear-search');
          if (clear) clear.classList.remove('visible');
          // Reset category buttons
          $$('.cat-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.cat === 'Semua');
          });
          applyFilters();
          showHome();
          history.pushState(null, '', '/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (CATEGORIES.includes(text)) {
          e.preventDefault();
          currentCategory = text;
          currentPage = 1;
          $$('.cat-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.cat === text);
          });
          applyFilters();
          showHome();
          history.pushState(null, '', '/');
          scrollToNews();
        }
      });
    });
  }

  // ---------- Detail page ----------
  function navigateToDetail(slug) {
    history.pushState({ slug }, '', `/berita/${encodeURIComponent(slug)}`);
    showDetail(slug);
  }

  function showHome() {
    const home = $('#home-view');
    const detail = $('#detail-view');
    if (home) home.classList.remove('hidden');
    if (detail) {
      detail.classList.remove('active');
      detail.innerHTML = '';
    }
    document.title = 'Berita Global Terbaru — Berita Terkini Indonesia & Dunia';
    renderHero();
  }

  function showDetail(slug) {
    const home = $('#home-view');
    const detail = $('#detail-view');
    if (home) home.classList.add('hidden');
    if (!detail) return;

    const item = allNews.find((n) => n.slug === slug);
    if (!item) {
      detail.classList.add('active');
      detail.innerHTML = `
        <div class="error-state">
          <p>Berita tidak ditemukan.</p>
          <button class="btn-retry" id="back-home-btn">Kembali ke Beranda</button>
        </div>`;
      $('#back-home-btn')?.addEventListener('click', () => {
        history.pushState(null, '', '/');
        showHome();
      });
      return;
    }

    document.title = `${item.judul} — Berita Global Terbaru`;

    const related = allNews
      .filter((n) => n.kategori === item.kategori && n.slug !== item.slug)
      .slice(0, 3);

    detail.classList.add('active');
    detail.innerHTML = `
      <button class="btn-back" id="btn-back">← Kembali</button>
      <article>
        <header class="article-header">
          <div class="article-badge"><span class="badge">${escapeHtml(item.kategori || '')}</span></div>
          <h1 class="article-title">${escapeHtml(item.judul)}</h1>
          <div class="article-meta">
            <span>📅 ${formatDate(item.tanggal)}</span>
            <span>🕐 ${escapeHtml(item.waktu || '')}</span>
            <span>✍️ ${escapeHtml(item.penulis || '')}</span>
          </div>
        </header>
        <div class="article-image">
          ${imgHtml(item.gambar, item.judul)}
        </div>
        <div class="article-body">${sanitizeHtml(item.isi || '')}</div>
        ${
          item.sumber
            ? `<div class="article-source">Sumber: ${
                item.urlSumber
                  ? `<a href="${escapeAttr(item.urlSumber)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sumber)}</a>`
                  : escapeHtml(item.sumber)
              }</div>`
            : ''
        }
      </article>
      ${
        related.length
          ? `<section class="related-section">
              <h2 class="section-title">📰 Berita Terkait</h2>
              <div class="related-grid">
                ${related
                  .map(
                    (n) => `
                  <article class="news-card">
                    <div class="card-image">
                      <a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">
                        ${imgHtml(n.gambar, n.judul)}
                      </a>
                    </div>
                    <div class="card-body">
                      <span class="badge">${escapeHtml(n.kategori || '')}</span>
                      <h3 class="card-title">
                        <a href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">${escapeHtml(n.judul)}</a>
                      </h3>
                      <a class="btn-read" href="/berita/${encodeURIComponent(n.slug)}" data-slug="${escapeAttr(n.slug)}">Baca Selengkapnya →</a>
                    </div>
                  </article>`
                  )
                  .join('')}
              </div>
            </section>`
          : ''
      }`;

    $('#btn-back')?.addEventListener('click', () => {
      history.pushState(null, '', '/');
      showHome();
    });

    $$('#detail-view a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDetail(a.dataset.slug);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function isDetailPage() {
    return window.location.pathname.startsWith('/berita/');
  }

  function route() {
    const path = window.location.pathname;
    if (path.startsWith('/berita/')) {
      const slug = decodeURIComponent(path.replace('/berita/', '').replace(/\/$/, ''));
      if (slug) {
        showDetail(slug);
        return;
      }
    }
    // Query style fallback: ?slug=
    const params = new URLSearchParams(window.location.search);
    const qSlug = params.get('slug');
    if (qSlug) {
      showDetail(qSlug);
      return;
    }
    showHome();
  }

  // ---------- Retry ----------
  function initRetry() {
    const btn = $('#retry-btn');
    if (btn) {
      btn.addEventListener('click', () => loadNews());
    }
  }

  // ---------- Popstate ----------
  window.addEventListener('popstate', () => {
    route();
  });

  // ---------- Init ----------
  function init() {
    preventZoom();
    initTheme();
    initMobileMenu();
    initSearchToggle();
    initCategories();
    initSort();
    initNavCategories();
    initRetry();
    loadNews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
