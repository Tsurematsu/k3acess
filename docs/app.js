const SLIDES = [
  {
    id: 'dashboard',
    tab: 'Dashboard',
    badge: 'Vista principal · refresco cada 5s',
    title: 'Dashboard en vivo de namespaces',
    file: './images/dashboard.png',
    terminalTitle: 'k3access — Dashboard principal (contexto: k3s)',
    description:
      'Muestra de un vistazo el estado del cluster (contexto, versión k3s, kubectl, agentes Ready y CNPG), la tabla de namespaces con afinidad, herramientas activas y conteo real de recursos.',
    points: [
      'Oculta por defecto los namespaces de sistema y default (tecla y para alternar).',
      'Indica inmediatamente si el namespace seleccionado está libre o bloqueado.',
      'Sincroniza automáticamente cada 5 segundos en pantalla alterna.',
    ],
  },
  {
    id: 'preflight',
    tab: 'Pre-Flight',
    badge: 'Validación al arrancar',
    title: 'Chequeo inicial de kubectl y cluster k3s',
    file: './images/preflight.png',
    terminalTitle: 'k3access — Pre-Flight Checks',
    description:
      'Antes de abrir el dashboard, valida paso a paso que kubectl esté instalado, que el contexto kubeconfig sea válido, que el servidor y agentes k3s respondan y que existan permisos RBAC.',
    points: [
      'Detecta automáticamente el CRD clusters.postgresql.cnpg.io para integrarse con kpg.',
      'Si falla un paso, muestra diagnóstico claro y sugerencia accionable con opción de reintentar (r).',
      'También disponible en modo no interactivo con node dist/index.js --check.',
    ],
  },
  {
    id: 'create',
    tab: 'Crear (n)',
    badge: 'Atajo: n',
    title: 'Crear namespace con afinidad por agente',
    file: './images/create-namespace.png',
    terminalTitle: 'k3access — Nuevo Namespace',
    description:
      'Formulario guiado con validación DNS-1123 en vivo, descripción opcional (tsure.io/description) y selector de agente k3s o rol detectado directamente del cluster.',
    points: [
      'Aplica automáticamente el label tsure.io/managed=true.',
      'Permite elegir sin restricción, un agente puntual (k3s-agent1/k3s-agent2), un rol o un selector personalizado.',
      'Muestra en vivo qué agentes coinciden con el selector elegido.',
    ],
  },
  {
    id: 'inspect',
    tab: 'Inspeccionar (i)',
    badge: 'Atajo: i / Enter',
    title: 'Inspección completa en vivo',
    file: './images/inspect-namespace.png',
    terminalTitle: 'k3access — Inspección de Namespace',
    description:
      'Consulta en tiempo real todos los labels, anotaciones, herramientas vinculadas, agentes que cumplen la afinidad y el listado de recursos detallando en qué agente corre cada pod.',
    points: [
      'Resalta visualmente los labels tsure.io/* de herramientas en uso.',
      'Incluye scroll vertical cuando el namespace tiene múltiples recursos.',
      'Muestra de forma explícita si la edición/eliminación está permitida o bloqueada.',
    ],
  },
  {
    id: 'blocked',
    tab: 'Bloqueo (e / x)',
    badge: 'Doble candado activo',
    title: 'Edición y eliminación bloqueadas si está en uso',
    file: './images/edit-blocked.png',
    terminalTitle: 'k3access — Doble Candado de Seguridad',
    description:
      'Un namespace solo puede editarse o eliminarse cuando está completamente libre. Si hay labels de herramientas (como kpg) o recursos activos en algún agente, la acción queda bloqueada.',
    points: [
      'Verifica en vivo antes de abrir el editor y vuelve a verificar justo antes de ejecutar kubectl.',
      'Informa exactamente qué herramienta o qué recursos y agentes están usando el namespace.',
      'Si hay 0 recursos reales y solo un label huérfano, habilita auditoría manual confirmada.',
    ],
  },
  {
    id: 'delete',
    tab: 'Eliminar (x)',
    badge: 'Atajo: x',
    title: 'Eliminación segura con confirmación por nombre',
    file: './images/delete-confirm.png',
    terminalTitle: 'k3access — Eliminación Segura',
    description:
      'Cuando se supera la doble verificación (0 labels de uso y 0 recursos activos en agentes k3s), exige escribir el nombre exacto del namespace antes de eliminarlo.',
    points: [
      'Ejecuta kubectl delete namespace <nombre> --wait=true sin shell.',
      'Imposibilita borrados accidentales sobre namespaces protegidos o activos.',
      'Refresca el dashboard automáticamente al completarse.',
    ],
  },
  {
    id: 'agents',
    tab: 'Agentes (a)',
    badge: 'Atajo: a',
    title: 'Vista del servidor k3s y agentes conectados',
    file: './images/agents-view.png',
    terminalTitle: 'k3access — Servidor y Agentes k3s',
    description:
      'Inspecciona el control-plane y todos los agentes conectados: estado Ready, roles, IP interna, versión de k3s, sistema operativo y qué namespaces tienen afinidad o pods activos en cada nodo.',
    points: [
      'Muestra el selector directo kubernetes.io/hostname=<agente> listo para usar.',
      'Cruza información en vivo entre nodos y workloads por namespace.',
      'Navegación rápida con ↑ / ↓ y cierre inmediato con Esc o a.',
    ],
  },
];

let currentIndex = 0;

const tabsContainer = document.getElementById('gallery-tabs');
const thumbStrip = document.getElementById('thumb-strip');
const stageImg = document.getElementById('stage-img');
const stageTerminalTitle = document.getElementById('stage-terminal-title');
const stageBadge = document.getElementById('stage-badge');
const stageTitle = document.getElementById('stage-title');
const stageDesc = document.getElementById('stage-desc');
const stagePoints = document.getElementById('stage-points');
const stageZoomTrigger = document.getElementById('stage-zoom-trigger');
const heroZoomTrigger = document.getElementById('hero-zoom-trigger');

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');

function renderGallery(index) {
  currentIndex = (index + SLIDES.length) % SLIDES.length;
  const slide = SLIDES[currentIndex];

  stageImg.src = slide.file;
  stageImg.alt = slide.title;
  stageTerminalTitle.textContent = slide.terminalTitle;
  stageBadge.textContent = slide.badge;
  stageTitle.textContent = slide.title;
  stageDesc.textContent = slide.description;

  stagePoints.innerHTML = '';
  for (const point of slide.points) {
    const li = document.createElement('li');
    li.textContent = point;
    stagePoints.appendChild(li);
  }

  document.querySelectorAll('.gallery-tab').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === currentIndex);
    btn.setAttribute('aria-selected', idx === currentIndex ? 'true' : 'false');
  });

  document.querySelectorAll('.thumb-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === currentIndex);
  });

  if (lightbox.classList.contains('open')) {
    lightboxImg.src = slide.file;
    lightboxImg.alt = slide.title;
    lightboxCaption.textContent = `${currentIndex + 1}/${SLIDES.length} — ${slide.title}`;
  }
}

function openLightbox(index) {
  renderGallery(index);
  const slide = SLIDES[currentIndex];
  lightboxImg.src = slide.file;
  lightboxImg.alt = slide.title;
  lightboxCaption.textContent = `${currentIndex + 1}/${SLIDES.length} — ${slide.title}`;
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
}

// Build tabs and thumbnails
SLIDES.forEach((slide, idx) => {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'gallery-tab';
  tab.textContent = slide.tab;
  tab.setAttribute('role', 'tab');
  tab.addEventListener('click', () => renderGallery(idx));
  tabsContainer.appendChild(tab);

  const thumb = document.createElement('button');
  thumb.type = 'button';
  thumb.className = 'thumb-btn';
  thumb.title = slide.title;
  thumb.innerHTML = `<img src="${slide.file}" alt="${slide.title}" loading="lazy" />`;
  thumb.addEventListener('click', () => renderGallery(idx));
  thumbStrip.appendChild(thumb);
});

stageZoomTrigger.addEventListener('click', () => openLightbox(currentIndex));
heroZoomTrigger.addEventListener('click', () => openLightbox(0));
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => renderGallery(currentIndex - 1));
lightboxNext.addEventListener('click', () => renderGallery(currentIndex + 1));

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') renderGallery(currentIndex + 1);
  if (e.key === 'ArrowLeft') renderGallery(currentIndex - 1);
});

renderGallery(0);

// Interactive double-lock simulator
const simProtected = document.getElementById('sim-protected');
const simLabel = document.getElementById('sim-label');
const simResources = document.getElementById('sim-resources');
const simResult = document.getElementById('sim-result');

function updateSimulator() {
  const isProtected = simProtected.checked;
  const hasLabel = simLabel.checked;
  const hasResources = simResources.checked;

  const reasons = [];
  if (isProtected) {
    reasons.push('Namespace protegido del sistema (default / kube-system / cnpg-system).');
  }
  if (hasLabel) {
    reasons.push('En uso por herramienta tsure.io/kpg=true.');
  }
  if (hasResources) {
    reasons.push('Contiene recursos activos corriendo en agentes k3s (k3s-agent1 / k3s-agent2).');
  }

  if (reasons.length === 0) {
    simResult.className = 'sim-result allowed';
    simResult.innerHTML =
      '<strong>✓ LIBRE — Edición (e) y Eliminación (x) PERMITIDAS</strong><ul><li>0 labels de uso externos · 0 recursos activos en agentes k3s.</li></ul>';
    return;
  }

  const canAudit = !isProtected && !hasResources && hasLabel;
  if (canAudit) {
    simResult.className = 'sim-result audit';
    simResult.innerHTML =
      '<strong>⚠ BLOQUEADO — Edición (e) y Eliminación (x) denegadas (Auditoría disponible)</strong>' +
      `<ul>${reasons.map((r) => `<li>${r}</li>`).join('')}<li>0 recursos reales: puedes usar (a) en la pantalla de borrado y confirmar LIMPIAR para retirar el label huérfano.</li></ul>`;
    return;
  }

  simResult.className = 'sim-result blocked';
  simResult.innerHTML =
    '<strong>✗ BLOQUEADO — Edición (e) y Eliminación (x) denegadas</strong>' +
    `<ul>${reasons.map((r) => `<li>${r}</li>`).join('')}</ul>`;
}

[simProtected, simLabel, simResources].forEach((el) =>
  el.addEventListener('change', updateSimulator),
);
updateSimulator();

// Install tabs
const installTabs = document.querySelectorAll('[data-install-tab]');
const installPanels = document.querySelectorAll('[data-install-panel]');

installTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-install-tab');
    installTabs.forEach((btn) => {
      const active = btn === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    installPanels.forEach((panel) => {
      panel.classList.toggle(
        'active',
        panel.getAttribute('data-install-panel') === target,
      );
    });
  });
});

// Copy buttons
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const targetId = btn.getAttribute('data-copy-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    try {
      await navigator.clipboard.writeText(targetEl.textContent.trim());
      const prev = btn.textContent;
      btn.textContent = '✓ Copiado';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1600);
    } catch {
      btn.textContent = 'Error al copiar';
    }
  });
});
