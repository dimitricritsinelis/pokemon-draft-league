(() => {
  'use strict';
  // One shallow perspective for the live pitch and the exported board.
  const project = (x, y) => ({ x: 50 + (x - 50) * (.8 + .18 * y / 100), y });
  const point = (x, y, width, height) => { const p = project(x, y); return [p.x * width / 100, p.y * height / 100]; };
  const rows = [0, 14, 29, 45, 62, 80, 100];
  const stripes = rows.slice(0, -1).map((y, i) => [[0, y], [100, y], [100, rows[i + 1]], [0, rows[i + 1]]]);
  const lines = [[[3, 0], [3, 100]], [[97, 0], [97, 100]], ...rows.map(y => [[3, y], [97, y]])];
  const ticks = [];
  for (let y = 2; y < 100; y += 2.7) {
    [[3, 5], [43, 45], [55, 57], [95, 97]].forEach(([a, b]) => ticks.push([[a, y], [b, y]]));
  }
  const numbers = [30, 40, 50, 40, 30].flatMap((n, i) => [13, 87].map(x => ({ n, x, y: rows[i + 1] + 4 })));
  const svgPoint = (x, y) => point(x, y, 1000, 1000).map(v => v.toFixed(2)).join(',');
  const svgPath = segments => segments.map(s => `M${svgPoint(...s[0])}L${svgPoint(...s[1])}`).join('');

  function mount(svg) {
    svg.innerHTML = `<defs><pattern id="turf" width="450" height="450" patternUnits="userSpaceOnUse"><image href="assets/turf.jpg" width="450" height="450"/></pattern><linearGradient id="pitch-light" x2="0" y2="1"><stop stop-color="#0c241c" stop-opacity=".4"/><stop offset=".55" stop-color="#173813" stop-opacity=".08"/><stop offset="1" stop-color="#102b18" stop-opacity=".25"/></linearGradient></defs>
      <rect width="1000" height="1000" fill="url(#turf)"/><rect width="1000" height="1000" fill="#244d1e" opacity=".3"/>
      ${stripes.map((s, i) => `<polygon points="${s.map(p => svgPoint(...p)).join(' ')}" fill="${i % 2 ? '#10281a' : '#e3e8bf'}" opacity="${i % 2 ? '.13' : '.04'}"/>`).join('')}
      <rect width="1000" height="1000" fill="url(#pitch-light)"/>
      <path d="${svgPath(lines)}" fill="none" stroke="#f0f0d7" stroke-width="3" opacity=".62"/>
      <path d="${svgPath(ticks)}" fill="none" stroke="#eeeeda" stroke-width="3" opacity=".5"/>
      <path d="${svgPath([[[3, 50], [97, 50]]])}" fill="none" stroke="#ffefb2" stroke-width="1.4" stroke-dasharray="7 9" opacity=".48"/>
      ${numbers.map(({ n, x, y }) => { const [a, b] = point(x, y, 1000, 1000); return `<text x="${a}" y="${b}" fill="#f0f0d7" opacity=".3" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-size="30" font-weight="700">${n}</text>`; }).join('')}`;
  }

  function draw(ctx, width, height, turf) {
    const pattern = ctx.createPattern(turf, 'repeat');
    if (pattern?.setTransform) pattern.setTransform(new DOMMatrix([width * .45 / turf.width, 0, 0, height * .45 / turf.height, 0, 0]));
    ctx.fillStyle = pattern || '#477634'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#244d1e4d'; ctx.fillRect(0, 0, width, height);
    stripes.forEach((s, i) => {
      ctx.fillStyle = i % 2 ? '#10281a21' : '#e3e8bf0a'; ctx.beginPath();
      s.forEach(([x, y], j) => { const p = point(x, y, width, height); j ? ctx.lineTo(...p) : ctx.moveTo(...p); });
      ctx.closePath(); ctx.fill();
    });
    const light = ctx.createLinearGradient(0, 0, 0, height);
    light.addColorStop(0, '#0c241c66'); light.addColorStop(.55, '#17381314'); light.addColorStop(1, '#102b1840');
    ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
    const stroke = (segments, color, lineWidth) => {
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath();
      segments.forEach(s => { ctx.moveTo(...point(...s[0], width, height)); ctx.lineTo(...point(...s[1], width, height)); }); ctx.stroke();
    };
    stroke(lines, '#f0f0d79e', 4); stroke(ticks, '#eeeed980', 3);
    ctx.setLineDash([9, 12]); stroke([[[3, 50], [97, 50]]], '#ffefb27a', 2); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f0f0d74d'; ctx.font = '700 44px "Barlow Condensed", sans-serif';
    numbers.forEach(({ n, x, y }) => ctx.fillText(n, ...point(x, y, width, height)));
  }

  window.DraftField = { project, mount, draw };
})();
