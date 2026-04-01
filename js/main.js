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

});
