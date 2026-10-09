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
    const retro = board.art === 'retro';
    const sources = board.positions.map(s => s.pokemon ? (retro ? s.pokemon.retroImage : s.pokemon.image) : null);
    const [images] = await Promise.all([
      Promise.all(sources.map(src => src ? loadImage(src) : null)),
      Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 1500))])
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1370;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const top = 142, fieldHeight = 1180;
    ctx.fillStyle = ink; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = yellow; ctx.font = '700 21px Barlow, sans-serif';
    ctx.fillText(board.generation.toUpperCase() + (retro ? ' · RETRO ART' : ''), 48, 35);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 53px "Barlow Condensed", sans-serif';
    ctx.fillText('POKÉMON DRAFT LEAGUE', 46, 97);
    ctx.textAlign = 'right'; ctx.font = '600 22px Barlow, sans-serif';
    ctx.fillStyle = yellow; ctx.fillText('OFFENSE  ' + board.offense, 1552, 65);
    ctx.fillStyle = blue; ctx.fillText('DEFENSE  ' + board.defense, 1552, 101);
    ctx.save(); ctx.translate(0, top);
    ctx.fillStyle = '#3b6b32'; ctx.fillRect(0, 0, 1600, fieldHeight);
    for (let row = 0; row < 6; row++) {
      ctx.fillStyle = row % 2 ? '#0000000d' : '#ffffff03';
      ctx.fillRect(0, row * fieldHeight / 6, 1600, fieldHeight / 6);
    }
    const shadow = ctx.createRadialGradient(800, 590, 300, 800, 590, 1000);
    shadow.addColorStop(0, '#12291e00'); shadow.addColorStop(1, '#12291e55');
    ctx.fillStyle = shadow; ctx.fillRect(0, 0, 1600, fieldHeight);
    ctx.strokeStyle = '#e1edd66b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, fieldHeight); ctx.moveTo(1536, 0); ctx.lineTo(1536, fieldHeight); ctx.stroke();
    for (let row = 0; row <= 6; row++) {
      const y = row * fieldHeight / 6;
      ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(1536, y); ctx.stroke();
      if (row === 6) continue;
      for (let tick = 1; tick < 6; tick++) {
        const ty = y + tick * fieldHeight / 36;
        ctx.beginPath();
        [64, 688, 894, 1512].forEach(x => { ctx.moveTo(x, ty); ctx.lineTo(x + 24, ty); });
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#eff4d570'; ctx.lineWidth = 2; ctx.setLineDash([9, 10]);
    ctx.beginPath(); ctx.moveTo(64, fieldHeight * .465); ctx.lineTo(1536, fieldHeight * .465); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e1edd645'; ctx.font = '700 47px "Barlow Condensed", sans-serif';
    [30, 40, 50, 40, 30].forEach((number, i) => {
      const y = (i + 1) * fieldHeight / 6 + 30;
      ctx.fillText(number, 147, y); ctx.fillText(number, 1453, y);
    });
    board.positions.forEach((s, index) => {
      const x = 1600 * s.x / 100, y = fieldHeight * s.y / 100;
      const image = images[index];
      if (image) {
        const size = retro ? 128 : 138;
        const scale = Math.min(size / image.width, size / image.height);
        const w = image.width * scale, h = image.height * scale;
        ctx.imageSmoothingEnabled = !retro;
        ctx.save(); ctx.shadowColor = '#112a2270'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 6;
        ctx.drawImage(image, Math.round(x - w / 2), Math.round(y - 94 + (138 - h) / 2), w, h);
        ctx.restore();
      } else {
        ctx.strokeStyle = '#e4ecca88'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.arc(x, y - 25, 35, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e4eccaaa'; ctx.font = '400 40px sans-serif'; ctx.fillText('+', x, y - 12);
      }
      const plateY = y + 43, plateWidth = 140;
      ctx.fillStyle = '#0d1f17ef'; ctx.strokeStyle = '#cddfc799'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x - plateWidth / 2, plateY, plateWidth, image ? 49 : 31, 5); ctx.fill(); ctx.stroke();
      if (image) {
        let fontSize = 22;
        const name = s.pokemon.name.toUpperCase();
        do { ctx.font = `700 ${fontSize}px "Barlow Condensed", sans-serif`; fontSize--; } while (ctx.measureText(name).width > plateWidth - 12 && fontSize >= 14);
        ctx.fillStyle = '#ffffff'; ctx.fillText(name, x, plateY + 22);
      }
      ctx.font = '700 22px "Barlow Condensed", sans-serif';
      ctx.fillStyle = s.side === 'offense' ? yellow : blue;
      ctx.fillText(s.role, x, plateY + (image ? 43 : 23));
    });
    ctx.restore(); ctx.textAlign = 'left'; ctx.fillStyle = '#bacab9'; ctx.font = '500 17px Barlow, sans-serif';
    ctx.fillText('Your Pokémon. Your playbook.', 48, 1353);
    ctx.textAlign = 'right'; ctx.fillText('Pokémon Draft League · Fan-made', 1552, 1353);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
  };
})();
