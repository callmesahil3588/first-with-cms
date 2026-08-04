/* Shared behaviour for every page: nav state, mobile menu, scroll reveal. */
(function () {
  var nav = document.getElementById('nav');
  if (nav) {
    addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', scrollY > 24);
    }, { passive: true });
  }

  var toggle = document.getElementById('menuToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.textContent = open ? '\u2715' : '\u2630';
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        toggle.textContent = '\u2630';
      });
    });
  }

  var targets = document.querySelectorAll('.reveal');
  if (targets.length) {
    if (typeof IntersectionObserver === 'undefined') {
      /* No observer available: show everything rather than leaving the
         page blank, and never let this stop later scripts from running. */
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
      Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
    }
  }
})();

/* ---------------------------------------------------------------
   Blog category filter.

   Built from the cards already in the page, so no backend change is
   needed and it keeps working as new categories appear. With JavaScript
   off, every post simply stays visible.
   --------------------------------------------------------------- */
(function () {
  var grid = document.querySelector('.blog-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.post'));
  if (!cards.length) return;

  var keyOf = function (s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  /* read the category off each card */
  var names = [];
  var counts = {};
  cards.forEach(function (card) {
    var el = card.querySelector('.cat');
    var name = el ? el.textContent.trim() : '';
    card.setAttribute('data-cat', name ? keyOf(name) : '');
    if (name) {
      if (counts[name] === undefined) { counts[name] = 0; names.push(name); }
      counts[name]++;
    }
  });
  if (!names.length) return;

  /* busiest categories first, then alphabetical */
  names.sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });

  function chip(label, key, n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('data-key', key);
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(document.createTextNode(label));
    var badge = document.createElement('span');
    badge.className = 'n';
    badge.textContent = n;
    b.appendChild(badge);
    return b;
  }

  var bar = document.createElement('div');
  bar.className = 'cat-filter';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter posts by category');
  bar.appendChild(chip('All', 'all', cards.length));
  names.forEach(function (name) { bar.appendChild(chip(name, keyOf(name), counts[name])); });

  var status = document.createElement('p');
  status.className = 'cat-status';
  status.setAttribute('aria-live', 'polite');

  grid.parentNode.insertBefore(bar, grid);
  grid.parentNode.insertBefore(status, grid);

  /* never let a missing browser API throw and kill the rest of this file */
  var reduce = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  function apply(key, interactive) {
    var label = 'All';
    Array.prototype.forEach.call(bar.querySelectorAll('.chip'), function (b) {
      var on = b.getAttribute('data-key') === key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) label = b.firstChild.nodeValue;
    });

    var shown = 0;
    cards.forEach(function (card) {
      var show = key === 'all' || card.getAttribute('data-cat') === key;
      card.classList.toggle('hidden', !show);
      if (!show) return;
      if (interactive) {
        /* a card revealed by filtering may never have crossed the
           scroll observer, so make sure it is not left invisible */
        card.classList.add('in');
        if (!reduce) {
          card.classList.remove('pop');
          void card.offsetWidth; // restart the animation
          card.style.animationDelay = shown * 45 + 'ms';
          card.classList.add('pop');
        }
      }
      shown++;
    });

    status.textContent = shown + (shown === 1 ? ' note' : ' notes') +
      (key === 'all' ? '' : ' in ' + label);

    if (interactive && history.replaceState) {
      history.replaceState(null, '', key === 'all' ? location.pathname : location.pathname + '#' + key);
    }
  }

  bar.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== bar && !b.classList.contains('chip')) b = b.parentNode;
    if (b && b.classList && b.classList.contains('chip')) apply(b.getAttribute('data-key'), true);
  });

  /* deep link: /blog#seo opens pre-filtered */
  var start = (location.hash || '').replace(/^#/, '').replace(/[^a-z0-9-]/gi, '');
  var known = start && bar.querySelector('.chip[data-key="' + start + '"]');
  apply(known ? start : 'all', false);
})();
