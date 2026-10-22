export const OFFENSES = ['10', '11', '12', '21', '22'];
export const DEFENSES = ['3-4', '4-3', 'nickel', 'dime'];
export const MODES = ['gen1', 'gen2', 'gen3', 'both'];
export const ROSTER_SIZE = 23;
export const eligible = (id, mode) => Number.isInteger(id) && id >= 1 && id <= 386 && (mode === 'both' || (mode === 'gen1' ? id <= 151 : mode === 'gen2' ? id >= 152 && id <= 251 : mode === 'gen3' && id >= 252));
export function slots(board) {
  const slot = (key, role, side) => ({ key, role, side });
  const o = (key, role) => slot('o_' + key, role, 'offense');
  const d = (key, role) => slot('d_' + key, role, 'defense');
  const offense = [o('lt','LT'),o('lg','LG'),o('c','C'),o('rg','RG'),o('rt','RT'),o('qb','QB'),o('rb1','HB')];
  const extras = { '10':[['wr1','WR'],['wr2','WR'],['wr3','WR'],['wr4','WR']], '11':[['wr1','WR'],['wr2','WR'],['wr3','WR'],['te1','TE']], '12':[['wr1','WR'],['wr2','WR'],['te1','TE'],['te2','TE']], '21':[['wr1','WR'],['wr2','WR'],['te1','TE'],['rb2','FB']], '22':[['wr1','WR'],['te1','TE'],['te2','TE'],['rb2','FB']] };
  offense.push(...extras[board.offense].map(([key,role])=>o(key,role)));
  const defense = [d('fs','FS'),d('ss','SS'),d('cb1','CB'),d('cb2','CB')];
  const four = [['de1','DE'],['dt1','DT'],['dt2','DT'],['de2','DE']];
  const fronts = { '3-4':[['de1','DE'],['dt1','NT'],['de2','DE'],['lb1','ILB'],['lb2','ILB'],['lb3','OLB'],['lb4','OLB']], '4-3':[...four,['lb1','MLB'],['lb2','WLB'],['lb3','SLB']], nickel:[...four,['lb1','LB'],['lb2','LB'],['nb','NB']], dime:[...four,['lb1','MLB'],['nb','NB'],['db6','DB']] };
  defense.push(...fronts[board.defense].map(([key,role])=>d(key,role)));
  return [...defense,...offense,slot('s_k','K','special')];
}
export const cleanName = (value, fallback = '') => Array.from(String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim()).slice(0,24).join('') || fallback;
