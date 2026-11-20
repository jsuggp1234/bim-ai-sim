// 화면 정리: 첫 화면에는 핵심만 보이게 한다.
// ① 단계 페이지의 섹션(.sec-title · .sx-sub)은 첫 섹션만 펼쳐 두고 나머지는 접는다. 제목 줄을 누르면 펼쳐진다.
// ② 3D 작업 화면 옆 패널의 묶음(.grp / .blk)은 [data-foldgrp] 표시가 있는 것만 접어 둔다.
// 접고 편 상태는 브라우저에 기억한다. 접힌 내용은 높이만 0으로 두어 너비 계산(그래프·표)은 그대로 된다.
const KEY = 'bim.fold.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const save = (id, open) => { try { const m = load(); m[id] = open ? 1 : 0; localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* 저장소 없음 */ } };
const INTERACTIVE = 'a,button,input,select,textarea,label,[role="tab"]';

function wire(head, box, id, openDefault) {
  if (head.dataset.fold) return;
  head.dataset.fold = id;
  head.setAttribute('role', 'button'); head.tabIndex = 0;
  head.classList.add('fold-h');
  const st = load();
  const set = (open, user) => {
    box.classList.toggle('folded', !open); head.setAttribute('aria-expanded', String(open));
    if (user) { save(id, open); if (open) requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }
  };
  set(st[id] != null ? !!st[id] : openDefault, false);
  const toggle = (e) => { if (e.target.closest(INTERACTIVE)) return; set(box.classList.contains('folded'), true); };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => { if (e.target === head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(e); } });
}

export function foldPage(root, name) {
  if (!root || name === 'intro') return;
  // 처음 그린 틀에 있는 섹션만 다룬다. 고른 항목을 보여 주려고 내용을 통째로 다시 그리는 칸(aria-live · 숨겨 둔 칸 · 후보지 자료)은 건드리지 않는다
  [...root.querySelectorAll('.sec-title, .sx-sub')].forEach((t, i) => {
    const box = t.parentElement;
    if (!box || box === root || box.hasAttribute('aria-live') || box.hidden || box.id === 'dossier' || box.querySelectorAll(':scope > .sec-title, :scope > .sx-sub').length !== 1) return;
    const n = t.querySelector('.n, .sx-sn');
    wire(t, box, `${name}:${n ? n.textContent.trim() : i}`, i === 0 || t.dataset.open === '1');
  });
  foldGroups(root, name);
}
// 옆 패널 묶음: <div class="grp" data-foldgrp="이름" [data-open]> 안의 첫 줄(.fold-k)이 제목
export function foldGroups(root, name) {
  [...root.querySelectorAll('[data-foldgrp]')].forEach((box) => {
    const head = box.querySelector(':scope > .fold-k'); if (!head) return;
    wire(head, box, `${name}:g:${box.dataset.foldgrp}`, box.hasAttribute('data-open'));
  });
}

// 접힌 칸 안의 요소로 가야 할 때(페이지 안 링크·스크롤): 감싼 접힘을 모두 편다
export function openFor(el) {
  for (let b = el && el.closest('.folded'); b; b = b.parentElement && b.parentElement.closest('.folded')) {
    const h = b.querySelector(':scope > .fold-h'); if (h) h.click(); else b.classList.remove('folded');
  }
}
