/* Pro-curo Website — Main JS */

document.addEventListener('DOMContentLoaded', function () {

  // --- Mobile Navigation Toggle ---
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // --- Active nav link highlighting ---
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });

  // --- Contact form now handled by MailerLite embed (see contact.html) ---

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Image Lightbox ---
  // Create lightbox overlay
  var overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = '<button class="lightbox-close" aria-label="Close">&times;</button><img src="" alt=""><div class="lightbox-caption"></div>';
  document.body.appendChild(overlay);

  var lightboxImg = overlay.querySelector('img');
  var lightboxCaption = overlay.querySelector('.lightbox-caption');
  var lightboxClose = overlay.querySelector('.lightbox-close');

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxCaption.textContent = alt || '';
    lightboxCaption.style.display = alt ? 'block' : 'none';
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    // Reset after transition
    setTimeout(function () {
      lightboxImg.src = '';
    }, 300);
  }

  // Attach to all feature images and gallery screenshots
  var zoomableImages = document.querySelectorAll('.feature-image img, .screenshot-gallery img, .hero-image img');
  zoomableImages.forEach(function (img) {
    img.style.cursor = 'pointer';
    img.setAttribute('title', 'Click to enlarge');
    img.addEventListener('click', function () {
      openLightbox(this.src, this.alt);
    });
  });

  // Close on overlay click, close button, or Escape key
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target === lightboxClose) {
      closeLightbox();
    }
  });

  lightboxClose.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      closeLightbox();
    }
  });

  // --- "Talk to Rhys" voice agent (CW020) ---
  // The whole widget is injected from here so no page markup changes are needed
  // (the site has shipped truncated HTML before, see HANDOVER-C006/CW005).
  var RHYS_SRC = 'https://agents.fireflies.ai/connect-to-agent?id=6a8c4c534a618669b4f99bd2';

  // Closing the modal hides it but leaves the iframe alive for this long, so a
  // visitor who closes it by accident can resume the same conversation. After
  // that the iframe is destroyed, which is what actually releases the
  // microphone: hiding an iframe does NOT stop its getUserMedia stream, and we
  // should not hold a live mic behind a modal the visitor believes is closed.
  var RHYS_TEARDOWN_MS = 30000;

  var rhysLauncher = document.createElement('button');
  rhysLauncher.type = 'button';
  rhysLauncher.className = 'rhys-launcher';
  rhysLauncher.setAttribute('aria-haspopup', 'dialog');
  rhysLauncher.setAttribute('aria-expanded', 'false');
  rhysLauncher.innerHTML =
    '<span class="rhys-launcher-icon" aria-hidden="true">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>' +
        '<path d="M19 11v1a7 7 0 0 1-14 0v-1"></path>' +
        '<line x1="12" y1="19" x2="12" y2="22"></line>' +
      '</svg>' +
    '</span>' +
    '<span class="rhys-launcher-label">Talk to Rhys</span>';
  document.body.appendChild(rhysLauncher);

  var rhysModal = document.createElement('div');
  rhysModal.className = 'rhys-modal';
  rhysModal.setAttribute('role', 'dialog');
  rhysModal.setAttribute('aria-modal', 'true');
  rhysModal.setAttribute('aria-label', 'Talk to Rhys, our AI assistant');
  rhysModal.hidden = true;
  rhysModal.innerHTML =
    '<div class="rhys-modal-backdrop" data-rhys-close></div>' +
    '<div class="rhys-panel">' +
      '<div class="rhys-panel-head">' +
        '<h2 class="rhys-panel-title">Talk to Rhys</h2>' +
        '<button type="button" class="rhys-close" aria-label="Close" data-rhys-close>&times;</button>' +
      '</div>' +
      '<p class="rhys-disclosure">Rhys is an AI assistant. Your voice is processed by Fireflies.ai to answer your questions. Prefer a person? Use our <a href="/contact.html">contact page</a>.</p>' +
      '<div class="rhys-frame"></div>' +
    '</div>';
  document.body.appendChild(rhysModal);

  var rhysFrameHost = rhysModal.querySelector('.rhys-frame');
  var rhysCloseBtn = rhysModal.querySelector('.rhys-close');
  var rhysFrame = null;
  var rhysTeardownTimer = null;
  var rhysLastFocus = null;

  function rhysBuildFrame() {
    if (rhysFrame) return;
    rhysFrame = document.createElement('iframe');
    // Set allow before src: the permission delegation has to be in place for
    // the first load. The microphone also needs a secure context, so this only
    // works over https (or localhost), never over file://.
    rhysFrame.setAttribute('allow', 'microphone; autoplay');
    rhysFrame.setAttribute('title', 'Rhys, the Pro-curo AI assistant');
    rhysFrame.setAttribute('frameborder', '0');
    rhysFrame.src = RHYS_SRC;
    rhysFrameHost.appendChild(rhysFrame);
  }

  function rhysDestroyFrame() {
    if (!rhysFrame) return;
    rhysFrameHost.removeChild(rhysFrame);
    rhysFrame = null;
  }

  function rhysOpen() {
    if (rhysTeardownTimer) {
      clearTimeout(rhysTeardownTimer);
      rhysTeardownTimer = null;
    }
    rhysLastFocus = document.activeElement;
    rhysBuildFrame();
    rhysModal.hidden = false;
    // Class rather than an inline style, so the lightbox's overflow reset
    // cannot clear our scroll lock and vice versa.
    document.body.classList.add('rhys-open');
    rhysLauncher.setAttribute('aria-expanded', 'true');
    rhysCloseBtn.focus();
    if (typeof gtag === 'function') {
      gtag('event', 'rhys_launcher_open', { page_path: window.location.pathname });
    }
  }

  function rhysClose() {
    rhysModal.hidden = true;
    document.body.classList.remove('rhys-open');
    rhysLauncher.setAttribute('aria-expanded', 'false');
    if (rhysLastFocus && typeof rhysLastFocus.focus === 'function') {
      rhysLastFocus.focus();
    }
    if (rhysTeardownTimer) clearTimeout(rhysTeardownTimer);
    rhysTeardownTimer = setTimeout(function () {
      rhysDestroyFrame();
      rhysTeardownTimer = null;
    }, RHYS_TEARDOWN_MS);
  }

  rhysLauncher.addEventListener('click', rhysOpen);

  // Close button and backdrop both carry data-rhys-close.
  rhysModal.addEventListener('click', function (e) {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-rhys-close')) {
      rhysClose();
    }
  });

  // Guarded on the modal being open, so this does not fight the lightbox's
  // own Escape handler above.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !rhysModal.hidden) {
      rhysClose();
    }
  });

  // Leaving the page must release the microphone immediately, without waiting
  // out the grace period.
  window.addEventListener('pagehide', rhysDestroyFrame);

  // Site-wide AI disclaimer. Injected rather than written into all 21 pages so
  // the diff stays off the HTML, for the same truncation reason as above.
  var rhysFooterBottom = document.querySelector('.footer-bottom');
  if (rhysFooterBottom) {
    var rhysNote = document.createElement('p');
    rhysNote.className = 'rhys-footer-note';
    rhysNote.innerHTML =
      'This site offers Rhys, an AI voice assistant. If you use it, your voice is ' +
      'processed by Fireflies.ai to answer your questions. See our ' +
      '<a href="/privacy.html">privacy policy</a>.';
    rhysFooterBottom.appendChild(rhysNote);
  }

});
