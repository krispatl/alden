/**
 * Hologram layer — on inspect, a slowly rotating wireframe primitive
 * (matched to the object's category) materializes above the object's
 * bounding box. Screen-space anchored: an honest floating hologram, not
 * fake spatial AR.
 */

import * as THREE from 'three';
import type { BBox } from './types';
import type { Category } from './narrative';

const PHOSPHOR = 0x7af4d2;
const LIFETIME_MS = 4200;
const FADE_MS = 450;

/** Where the hologram should sit right now, in CSS pixels. */
export type RectProvider = () => BBox | null;

interface Holo {
  group: THREE.Group;
  provider: RectProvider;
  bornAt: number;
  dismissAt: number | null;
}

function primitiveFor(category: Category): THREE.BufferGeometry {
  switch (category) {
    case 'seat':
    case 'surface':
      return new THREE.BoxGeometry(1, 0.9, 1);
    case 'vessel':
      return new THREE.CylinderGeometry(0.45, 0.38, 1, 14, 3, true);
    case 'screen':
      return new THREE.PlaneGeometry(1.2, 0.75, 6, 4);
    case 'flora':
    case 'fauna':
      return new THREE.IcosahedronGeometry(0.62, 1);
    case 'human':
      return new THREE.CapsuleGeometry(0.34, 0.7, 3, 10);
    case 'vehicle':
      return new THREE.BoxGeometry(1.5, 0.6, 0.8);
    case 'text':
      return new THREE.BoxGeometry(0.85, 1.1, 0.16);
    case 'tool':
      return new THREE.TorusGeometry(0.42, 0.15, 8, 18);
    case 'container':
      return new THREE.BoxGeometry(0.8, 1, 0.5);
    case 'food':
      return new THREE.SphereGeometry(0.5, 12, 10);
    default:
      return new THREE.OctahedronGeometry(0.6, 0);
  }
}

export class HologramLayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private holos: Holo[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    // Orthographic camera in CSS-pixel space: (0,0) top-left.
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();
  }

  /** Spawns (or refreshes) a hologram tethered to a rect provider. */
  show(category: Category, provider: RectProvider): void {
    const geo = primitiveFor(category);
    const group = new THREE.Group();

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 12),
      new THREE.LineBasicMaterial({ color: PHOSPHOR, transparent: true, opacity: 0.9 })
    );
    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: PHOSPHOR,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const inner = new THREE.Mesh(
      geo.clone().scale(0.55, 0.55, 0.55),
      new THREE.MeshBasicMaterial({
        color: 0xffb454,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    group.add(fill, wire, inner);
    this.scene.add(group);
    this.holos.push({ group, provider, bornAt: performance.now(), dismissAt: null });
  }

  dismissAll(): void {
    const now = performance.now();
    for (const h of this.holos) {
      if (h.dismissAt === null) h.dismissAt = now;
    }
  }

  get active(): boolean {
    return this.holos.length > 0;
  }

  tick(now: number): void {
    if (!this.holos.length) {
      this.renderer.clear();
      return;
    }
    this.resize();

    for (const h of [...this.holos]) {
      const rect = h.provider();
      const age = now - h.bornAt;

      // Lifecycle: auto-dismiss after LIFETIME_MS or when the object is lost.
      if (h.dismissAt === null && (age > LIFETIME_MS || !rect)) h.dismissAt = now;

      let opacity = Math.min(1, age / FADE_MS);
      if (h.dismissAt !== null) {
        opacity = Math.max(0, 1 - (now - h.dismissAt) / FADE_MS);
        if (opacity <= 0) {
          this.scene.remove(h.group);
          disposeGroup(h.group);
          this.holos.splice(this.holos.indexOf(h), 1);
          continue;
        }
      }

      if (rect) {
        const [x, y, w, hgt] = rect;
        const size = Math.min(Math.max(Math.min(w, hgt) * 0.55, 60), 200);
        // Hover above the box, bobbing gently.
        h.group.position.set(
          x + w / 2,
          y - size * 0.55 + Math.sin(now / 600 + h.bornAt) * 6,
          0
        );
        h.group.scale.setScalar(size);
      }
      h.group.rotation.y = now / 1400;
      h.group.rotation.x = 0.35 + Math.sin(now / 2100) * 0.12;

      h.group.traverse((node) => {
        const mat = (node as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && 'opacity' in mat) {
          const base =
            node instanceof THREE.LineSegments ? 0.9 : (mat as THREE.MeshBasicMaterial).wireframe ? 0.35 : 0.07;
          mat.opacity = base * opacity;
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}
