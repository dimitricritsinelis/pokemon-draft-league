(() => {
  'use strict';
  const ink = '#12291e', yellow = '#f5d465', blue = '#99d5f2';
  const imageCache = new Map();
  function loadImage(src) {
    if (!imageCache.has(src)) imageCache.set(src, new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => { imageCache.delete(src); reject(new Error('Artwork timed out')); }, 12000);
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); imageCache.delete(src); reject(new Error('Artwork unavailable')); };
      image.src = src;
    }));
    return imageCache.get(src);
  }

  window.renderDraftImage = async board => {
    const sources = board.positions.map(s => s.pokemon ? s.pokemon.image : null);
    const [images, turf] = await Promise.all([
      Promise.all(sources.map(src => src ? loadImage(src) : null)),
      loadImage('assets/turf.jpg'),
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 1500))])
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1550;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const top = 142, fieldHeight = 1360;
    ctx.fillStyle = ink; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = yellow; ctx.font = '700 21px Barlow, sans-serif';
    ctx.fillText(board.generation.toUpperCase() + ' · ' + (board.teamName || 'Team 1').toUpperCase(), 48, 35);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 53px "Barlow Condensed", sans-serif';
    ctx.fillText('POKÉMON DRAFT LEAGUE', 46, 97);
    ctx.textAlign = 'right'; ctx.font = '600 22px Barlow, sans-serif';
    ctx.fillStyle = yellow; ctx.fillText('OFFENSE  ' + board.offense, 1552, 65);
    ctx.fillStyle = blue; ctx.fillText('DEFENSE  ' + board.defense, 1552, 101);
    ctx.save(); ctx.translate(0, top);
    window.DraftField.draw(ctx, 1600, fieldHeight, turf);
    board.positions.forEach((s, index) => {
      const x = 1600 * s.x / 100, y = fieldHeight * s.y / 100;
      const image = images[index];
      if (image) {
        const size = 132 * s.scale;
        const scale = Math.min(size / image.width, size / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.imageSmoothingEnabled = true;
        ctx.save(); ctx.shadowColor = '#112a2270'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 6;
        ctx.drawImage(image, Math.round(x - w / 2), Math.round(y - 94 + (138 - h) / 2), w, h);
        ctx.restore();
      } else {
        ctx.strokeStyle = '#e4ecca88'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.arc(x, y - 25, 35, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e4eccaaa'; ctx.font = '400 40px sans-serif'; ctx.fillText('+', x, y - 12);
      }
      const plateY = y + 43, plateWidth = 136 * s.scale;
      ctx.fillStyle = '#0d1f17ef'; ctx.strokeStyle = '#cddfc799'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x - plateWidth / 2, plateY, plateWidth, image ? 65 : 31, 5); ctx.fill(); ctx.stroke();
      if (image) {
        let fontSize = 22;
        const name = s.pokemon.name.toUpperCase();
        do { ctx.font = `700 ${fontSize}px "Barlow Condensed", sans-serif`; fontSize--; } while (ctx.measureText(name).width > plateWidth - 12 && fontSize >= 14);
        ctx.fillStyle = '#ffffff'; ctx.fillText(name, x, plateY + 22);
      }
      ctx.font = '700 22px "Barlow Condensed", sans-serif';
      ctx.fillStyle = s.side === 'offense' ? yellow : blue;
      ctx.fillText(s.role, x, plateY + (image ? 43 : 23));
      if (image && s.stats) {
        ctx.font = '500 14px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#c1d0bb';
        ctx.fillText(`${s.stats.height} · ${s.stats.weight}lb · ${s.stats.forty}s`, x, plateY + 59, plateWidth - 8);
      }
    });
    ctx.restore(); ctx.textAlign = 'left'; ctx.fillStyle = '#bacab9'; ctx.font = '500 17px Barlow, sans-serif';
    ctx.fillText('HT · LB · ESTIMATED 40-YARD DASH (s)', 48, 1533);
    ctx.textAlign = 'right'; ctx.fillText('Height / weight: Bulbapedia · Fan-made', 1552, 1533);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
  };
})();
