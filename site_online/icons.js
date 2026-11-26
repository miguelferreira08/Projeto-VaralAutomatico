// Icones SVG locais, sem CDN, funcionando mesmo na rede da ESP32 sem internet.
(() => {
  const paths = {
    'cloud-sun-rain': '<path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2"/><circle cx="10" cy="10" r="3"/><path d="M19 17a4 4 0 0 0-2-7.5 6 6 0 0 0-11.5 2.5A4 4 0 0 0 7 20h11"/><path d="M9 21l-1 2M14 21l-1 2"/>',
    'cloud-rain': '<path d="M20 16.6A4.5 4.5 0 0 0 17 8a6 6 0 0 0-11.4 1.8A4.5 4.5 0 0 0 7 18h12"/><path d="m8 19-1 3m6-3-1 3m6-3-1 3"/>',
    'cpu': '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>',
    'shirt': '<path d="m15 3 6 3 2 5-5 2v8H6v-8l-5-2 2-5 6-3a4 4 0 0 0 6 0Z"/>',
    'droplets': '<path d="M12 22a6 6 0 0 0 6-6c0-4-6-10-6-10S6 12 6 16a6 6 0 0 0 6 6Z"/><path d="M19 2s3 3 3 5a3 3 0 0 1-3 3"/>',
    'history': '<path d="M3 12a9 9 0 1 0 3-7"/><path d="M3 3v5h5m4-1v5l4 2"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/>',
    'bar-chart-3':'<path d="M3 3v18h18M8 17v-6m5 6V7m5 10V4"/>',
    'activity':'<path d="M2 12h4l3-8 5 16 3-8h5"/>',
    'arrow-left-to-line':'<path d="M3 3v18M21 12H8m6-6-6 6 6 6"/>',
    'arrow-right-from-line':'<path d="M21 3v18M3 12h13m-6-6 6 6-6 6"/>',
    'loader-2':'<path d="M21 12a9 9 0 1 1-6-8.5"/>',
    'pause':'<path d="M8 5v14m8-14v14"/>',
    'shield-alert':'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v5m0 4h.01"/>',
    'square':'<rect x="4" y="4" width="16" height="16" rx="2"/>',
    'rotate-ccw':'<path d="M3 11a9 9 0 1 0 2.1-5.6L3 8"/><path d="M3 3v5h5"/>',
    'check-circle':'<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>'
  };
  function createIcons(root=document) {
    root.querySelectorAll('i[data-lucide]').forEach(el => {
      const name=el.getAttribute('data-lucide');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('width','19');svg.setAttribute('height','19');
      svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
      svg.setAttribute('stroke-width','1.9');svg.setAttribute('stroke-linecap','round');
      svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
      svg.innerHTML=paths[name]||paths.cpu;
      el.replaceWith(svg);
    });
  }
  window.lucide={createIcons};
})();
