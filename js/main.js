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

  // --- Contact form handling ---
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const formData = new FormData(contactForm);
      const data = {};
      formData.forEach(function (value, key) {
        data[key] = value;
      });

      // Basic validation
      if (!data.name || !data.email || !data.message) {
        showFormMessage('Please fill in all required fields.', 'error');
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        showFormMessage('Please enter a valid email address.', 'error');
        return;
      }

      // Show success message (actual sending would use Azure Function or Formspree)
      showFormMessage('Thank you for your message! We\'ll be in touch shortly.', 'success');
      contactForm.reset();
    });
  }

  function showFormMessage(text, type) {
    let msgEl = document.getElementById('form-message');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'form-message';
      contactForm.appendChild(msgEl);
    }
    msgEl.textContent = text;
    msgEl.style.marginTop = '16px';
    msgEl.style.padding = '14px 20px';
    msgEl.style.borderRadius = '8px';
    msgEl.style.fontWeight = '600';
    msgEl.style.fontSize = '0.95rem';

    if (type === 'success') {
      msgEl.style.background = '#e8f5e9';
      msgEl.style.color = '#2e7d32';
      msgEl.style.border = '1px solid #c8e6c9';
    } else {
      msgEl.style.background = '#ffeef0';
      msgEl.style.color = '#c62828';
      msgEl.style.border = '1px solid #ffcdd2';
    }

    setTimeout(function () {
      msgEl.remove();
    }, 5000);
  }

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
