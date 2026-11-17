// 발 디딤 면: 기울어진 상자(경사로)의 실제 윗면, 평판, 층고가 높은 층 아래로 내리기, 땅속 덩어리에서 올리기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSupport } from '../src/ui/support3d.js';

const BOX = new THREE.BoxGeometry(1, 1, 1), mt = new THREE.MeshStandardMaterial();
const box = (sc, sx, sy, sz, x, y, z, rz = 0) => { const o = new THREE.Mesh(BOX, mt); o.scale.set(sx, sy, sz); o.rotation.z = rz; o.position.set(x, y, z); sc.add(o); return o; };

test('경사로는 둘레 상자 꼭대기가 아니라 그 자리의 실제 윗면에 선다', () => {
  const sc = new THREE.Scene(); box(sc, 20, 0.4, 4, 10, 1, 0, Math.atan(0.1));
  const s = createSupport(sc); s.rebuild();
  const off = 0.2 / Math.cos(Math.atan(0.1));
  for (const x of [1, 10, 19]) assert.ok(Math.abs(s.at(x, 0, 3) - (1 + (x - 10) * 0.1 + off)) < 1e-3);
});

test('층고가 높은 공장: 10m 위에 떠 있던 사람을 아래 슬래브로, 바닥이 없으면 지표로', () => {
  const sc = new THREE.Scene(); box(sc, 30, 0.5, 30, 0, 11, 0);
  const s = createSupport(sc); s.rebuild();
  assert.equal(s.at(0, 0, 21.2), 11.25);
  assert.equal(s.at(40, 0, 12.2), 0); // 그 자리에 디딤 상자가 없으면 지표
  assert.equal(s.at(40, 0, 30), null); // 너무 높으면 손대지 않는다
});

test('땅속 흙 덩어리 속에 묻힌 사람은 덩어리 위로', () => {
  const sc = new THREE.Scene(); box(sc, 40, 6, 40, 0, -5, 0);
  const s = createSupport(sc); s.rebuild();
  assert.equal(s.at(0, 0, -4), -2);
});

test('사람·반투명 망은 디딤 면이 아니다', () => {
  const sc = new THREE.Scene(); const p = box(sc, 1, 1.8, 1, 0, 0.9, 0); p.userData.noMirror = true;
  const net = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 })); net.scale.set(10, 0.1, 10); net.position.set(0, 3, 0); sc.add(net);
  const s = createSupport(sc); s.rebuild();
  assert.equal(s.at(0, 0, 3.05), 0);
});
