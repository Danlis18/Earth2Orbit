import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ОРІ — не робот, а «сутність»: тривимірний знак ◈ ORBITAL. Кришталевий ромб
// зі світним каркасом, усередині — живе ядро-«око», що стежить за курсором;
// навколо — орбіти з Землею, Місяцем і Марсом та хмара частинок, яка дихає
// разом із голосом. getLevel() повертає гучність 0…1. Колір — акцент профілю.
export function createEntity(canvas, getLevel = () => 0, { onInteract, reduced = false } = {}) {
  let frame = 0,
    disposed = false;
  const css = getComputedStyle(document.documentElement);
  const accent = new THREE.Color((css.getPropertyValue("--accent") || "#8ceac9").trim() || "#8ceac9");
  const accent2 = new THREE.Color("#7fd3ff");

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.6, 9.2);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 13;
  controls.autoRotateSpeed = 0.9;
  controls.target.set(0, 0.05, 0);
  let idleSince = performance.now();
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    onInteract?.();
  });
  controls.addEventListener("end", () => (idleSince = performance.now()));

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const coreLight = new THREE.PointLight(accent, 14, 6, 1.6);
  scene.add(coreLight);

  // м'яке світіння: текстура з радіальним градієнтом для спрайтів
  const glowTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = (color, size, opacity = 1) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    s.scale.setScalar(size);
    return s;
  };

  const entity = new THREE.Group();
  scene.add(entity);

  // ---- зовнішній ромб ◈: кришталева оболонка + світний каркас ----
  const outerGeo = new THREE.OctahedronGeometry(1.15, 0);
  outerGeo.scale(1, 1.32, 1);
  const shell = new THREE.Mesh(
    outerGeo,
    new THREE.MeshPhysicalMaterial({
      color: accent.clone().multiplyScalar(0.6),
      metalness: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.08,
      clearcoat: 1,
      iridescence: 0.6,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  entity.add(shell);
  const frameLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(outerGeo),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
  );
  entity.add(frameLines);
  // вершини каркаса світяться
  const vertexGlows = [];
  const pos = outerGeo.attributes.position;
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = v.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(k)) continue;
    seen.add(k);
    const g = glow(accent, 0.28, 0.9);
    g.position.copy(v);
    entity.add(g);
    vertexGlows.push(g);
  }

  // ---- внутрішній ромб-ядро (суцільний, як у знаку) ----
  const innerPivot = new THREE.Group();
  entity.add(innerPivot);
  const innerGeo = new THREE.OctahedronGeometry(0.46, 0);
  innerGeo.scale(1, 1.32, 1);
  const inner = new THREE.Mesh(
    innerGeo,
    new THREE.MeshPhysicalMaterial({
      color: accent.clone().multiplyScalar(0.55),
      emissive: accent,
      emissiveIntensity: 0.7,
      metalness: 0.45,
      roughness: 0.18,
      envMapIntensity: 0.6,
      clearcoat: 1,
      flatShading: true,
    }),
  );
  innerPivot.add(inner);
  const innerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(innerGeo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }),
  );
  innerPivot.add(innerEdges);
  // «око»: яскрава зіниця перед ядром, що дивиться на глядача/курсор
  const eye = new THREE.Group();
  eye.position.z = 0.5;
  innerPivot.add(eye);
  const iris = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.15, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  eye.add(iris);
  const pupil = glow(0xffffff, 0.34, 1);
  eye.add(pupil);
  const coreGlow = glow(accent, 2.2, 0.55);
  entity.add(coreGlow);
  const haloGlow = glow(accent2, 4.6, 0.16);
  entity.add(haloGlow);

  // ---- орбіти з Землею, Місяцем і Марсом ----
  const orbitDefs = [
    { r: 1.7, tilt: [1.25, 0, 0.25], speed: 0.35, color: 0x5fb4ff, size: 0.11, label: "earth" },
    { r: 1.95, tilt: [1.05, 0, -0.55], speed: -0.22, color: 0xd9dde3, size: 0.07, label: "moon" },
    { r: 2.2, tilt: [1.45, 0.4, 0.9], speed: 0.16, color: 0xff8a5c, size: 0.09, label: "mars" },
  ];
  const orbits = orbitDefs.map((d, i) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(...d.tilt);
    entity.add(pivot);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(d.r, 0.006, 8, 160),
      new THREE.MeshBasicMaterial({ color: i === 0 ? accent : accent2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
    );
    pivot.add(ring);
    const carrier = new THREE.Group();
    pivot.add(carrier);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(d.size, 32, 24),
      new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.35, roughness: 0.6 }),
    );
    body.position.x = d.r;
    carrier.add(body);
    const halo = glow(d.color, d.size * 5, 0.5);
    halo.position.x = d.r;
    carrier.add(halo);
    carrier.rotation.z = i * 2.1;
    return { carrier, ring, d };
  });

  // ---- кільце «даних» під сутністю (штрихи, як шкала приладу) ----
  const ticks = new THREE.Group();
  ticks.position.y = -1.95;
  ticks.rotation.x = -Math.PI / 2;
  entity.add(ticks);
  const tickMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (let i = 0; i < 72; i++) {
    const long = i % 6 === 0;
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.018, long ? 0.16 : 0.08), tickMat);
    const a = (i / 72) * Math.PI * 2;
    t.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
    t.rotation.z = a - Math.PI / 2;
    ticks.add(t);
  }
  const floorGlow = glow(accent, 3.2, 0.22);
  floorGlow.position.y = -1.95;
  floorGlow.scale.set(3.2, 0.7, 1);
  entity.add(floorGlow);

  // ---- хмара частинок ----
  const N = 900;
  const pGeo = new THREE.BufferGeometry();
  const base = new Float32Array(N * 3),
    p = new Float32Array(N * 3),
    seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1,
      th = Math.random() * Math.PI * 2,
      r = 1.6 + Math.pow(Math.random(), 0.6) * 1.6;
    const s = Math.sqrt(1 - u * u);
    base.set([r * s * Math.cos(th), r * u * 0.9, r * s * Math.sin(th)], i * 3);
    seeds[i] = Math.random() * 10;
  }
  p.set(base);
  pGeo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ color: accent, size: 0.06, map: glowTexture, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  entity.add(particles);

  // курсор над полотном — ядро «дивиться» туди
  const look = new THREE.Vector2();
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    look.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  addEventListener("pointermove", onMove);

  function resize() {
    const b = canvas.parentElement.getBoundingClientRect();
    if (!b.width || !b.height) return;
    renderer.setSize(b.width, b.height, false);
    camera.aspect = b.width / b.height;
    camera.fov = camera.aspect < 0.75 ? 38 : 30;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();

  let speech = 0,
    level = 0,
    last = performance.now();
  const motion = reduced || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.25 : 1;
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now * 0.001;
    const target = Math.max(0, Math.min(1, Number(getLevel()) || 0));
    level += (target - level) * 0.35;
    speech += ((target > 0.02 ? 1 : 0) - speech) * 0.05;
    if (motion === 1 && !controls.autoRotate && now - idleSince > 5000) controls.autoRotate = true;

    entity.position.y = Math.sin(t * 0.9) * 0.06 * motion;
    shell.rotation.y += dt * 0.25 * motion;
    frameLines.rotation.y = shell.rotation.y;
    vertexGlows.forEach((g, i) => {
      g.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.25 * motion);
      g.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.3 + i)) + level * 0.3;
    });
    // ядро обертається назустріч і повертається до курсора
    inner.rotation.y -= dt * (0.6 + speech * 1.4) * motion;
    innerPivot.rotation.x += (look.y * -0.45 - innerPivot.rotation.x) * 0.06;
    innerPivot.rotation.y += (look.x * 0.6 - innerPivot.rotation.y) * 0.06;
    const pulse = 1 + Math.sin(t * 2.2) * 0.03 * motion + level * 0.22;
    innerPivot.scale.setScalar(pulse);
    inner.material.emissiveIntensity = 0.45 + level * 1.4 + Math.sin(t * 2.2) * 0.08;
    iris.scale.setScalar(1 + level * 0.45);
    iris.rotation.z += dt * 1.5;
    pupil.material.opacity = 0.75 + level * 0.25;
    coreGlow.material.opacity = 0.4 + level * 0.5;
    coreGlow.scale.setScalar(2.1 + level * 1.4);
    haloGlow.material.opacity = 0.12 + speech * 0.12;
    coreLight.intensity = 10 + level * 30;
    frameLines.material.opacity = 0.75 + level * 0.25;

    orbits.forEach(({ carrier, d, ring }) => {
      carrier.rotation.z += dt * d.speed * (1 + speech * 1.5) * motion;
      ring.material.opacity = 0.25 + speech * 0.25;
    });
    ticks.rotation.z -= dt * (0.15 + speech * 0.6) * motion;

    // частинки повільно кружляють; під час мовлення — розширюються
    const swirl = t * (0.08 + speech * 0.25) * motion;
    const expand = 1 + level * 0.25;
    for (let i = 0; i < N; i++) {
      const x = base[i * 3],
        y = base[i * 3 + 1],
        z = base[i * 3 + 2];
      const a = swirl + seeds[i] * 0.02;
      const c = Math.cos(a),
        s = Math.sin(a);
      p[i * 3] = (x * c - z * s) * expand;
      p[i * 3 + 1] = (y + Math.sin(t * 0.7 + seeds[i]) * 0.05) * expand;
      p[i * 3 + 2] = (x * s + z * c) * expand;
    }
    pGeo.attributes.position.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    removeEventListener("pointermove", onMove);
    controls.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    glowTexture.dispose();
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
