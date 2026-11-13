/* portal-shell.js — Comportamiento compartido del portal CESFAM La Unión.
   Cargar con <script src="portal-shell.js" defer></script>.
   Cubre: reloj, tema claro/oscuro persistente, reveals al scroll y el
   campo generativo del hero (canvas con nodos a la deriva + pulsos ámbar). */

(function () {
  "use strict";

  var THEME_KEY = "cesfam-portal-theme";
  var DATE_FMT = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (error) {
      return null; // almacenamiento bloqueado por el navegador
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function initTheme() {
    applyTheme(readStoredTheme() || "dark");
    var toggle = document.querySelector("[data-portal-theme]");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        /* sin persistencia: el tema aplica solo en esta sesión */
      }
    });
  }

  function initClock() {
    var dateNode = document.querySelector("[data-portal-date]");
    var timeNode = document.querySelector("[data-portal-time]");
    if (!dateNode && !timeNode) return;
    function tick() {
      var now = new Date();
      if (dateNode) {
        var text = DATE_FMT.format(now);
        dateNode.textContent = text.charAt(0).toUpperCase() + text.slice(1);
      }
      if (timeNode) timeNode.textContent = now.toLocaleTimeString("es-CL", { hour12: false });
    }
    tick();
    setInterval(tick, 1000);
  }

  function initReveals() {
    var targets = document.querySelectorAll("[data-rv]");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("rv-in"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("rv-in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { observer.observe(el); });
  }

  function initHeroCanvas() {
    var canvas = document.querySelector("[data-hero-canvas]");
    if (!canvas) return;
    // El sistema puede traer su propio motor para el hero (data-hero-engine):
    // en ese caso el shell no toma el contexto del canvas.
    if (canvas.hasAttribute("data-hero-engine")) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var pointer = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (event) {
      pointer.x = event.clientX / window.innerWidth - 0.5;
      pointer.y = event.clientY / window.innerHeight - 0.5;
    });

    var nodes = [];
    for (var i = 0; i < 54; i += 1) {
      nodes.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.00035,
        vy: (Math.random() - 0.5) * 0.00035,
        r: 0.7 + Math.random() * 1.6,
        gold: Math.random() < 0.22
      });
    }
    var pulses = [0, 1, 2].map(function (index) {
      return { t: index / 3, y: 0.25 + index * 0.25 };
    });

    var w = 0;
    var h = 0;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    function draw() {
      if (w < 1) resize();
      var light = document.documentElement.getAttribute("data-theme") === "light";
      var line = light ? "rgba(22,32,42," : "rgba(255,255,255,";
      var ox = pointer.x * 26;
      var oy = pointer.y * 16;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      for (var i = 0; i < nodes.length; i += 1) {
        var a = nodes[i];
        a.x += a.vx;
        a.y += a.vy;
        if (a.x < 0 || a.x > 1) a.vx *= -1;
        if (a.y < 0 || a.y > 1) a.vy *= -1;
        var ax = a.x * w + ox * (a.gold ? 1.8 : 1);
        var ay = a.y * h + oy * (a.gold ? 1.8 : 1);
        for (var j = i + 1; j < nodes.length; j += 1) {
          var b = nodes[j];
          var bx = b.x * w + ox;
          var by = b.y * h + oy;
          var d = Math.hypot(ax - bx, ay - by);
          if (d < 150) {
            ctx.strokeStyle = line + (0.16 * (1 - d / 150)).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
        ctx.fillStyle = a.gold ? "rgba(245,185,66,.85)" : line + "0.35)";
        ctx.beginPath();
        ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
        ctx.fill();
      }

      pulses.forEach(function (p) {
        p.t += 0.0018;
        if (p.t > 1.15) p.t = -0.15;
        var px = p.t * w + ox;
        var py = p.y * h + oy;
        var grad = ctx.createRadialGradient(px, py, 0, px, py, 90);
        grad.addColorStop(0, "rgba(245,185,66,.26)");
        grad.addColorStop(1, "rgba(245,185,66,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, 90, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* Contador animado para métricas: portalShell.countTo(nodo, 37) */
  function countTo(node, target, stepMs) {
    if (!node) return;
    var value = 0;
    var step = Math.max(1, Math.round(target / 22));
    var timer = setInterval(function () {
      value = Math.min(target, value + step);
      node.textContent = String(value);
      if (value >= target) clearInterval(timer);
    }, stepMs || 28);
  }

  applyTheme(readStoredTheme() || "dark");

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initClock();
    initReveals();
    initHeroCanvas();
  });

  window.portalShell = { applyTheme: applyTheme, countTo: countTo };
})();
