import * as THREE from 'three';
import type { TerrainGrid } from './terrainTiles';

export interface TerrainSceneController {
  setTerrain: (terrain: TerrainGrid) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

function disposeObject3D(node: THREE.Object3D): void {
  node.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (mesh.material) {
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material.dispose();
      }
    }
  });
}

function buildTerrainMesh(terrain: TerrainGrid): THREE.Mesh {
  const width = terrain.width;
  const height = terrain.height;
  const worldSize = 420;

  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, width - 1, height - 1);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as THREE.BufferAttribute;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gridIndex = y * width + x;
      const terrainMeters = terrain.heights[gridIndex];
      const sceneHeight = terrainMeters * 0.05;
      positions.setY(gridIndex, sceneHeight);
    }
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: '#768f5a',
    roughness: 0.92,
    metalness: 0.03,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export function createTerrainScene(canvas: HTMLCanvasElement): TerrainSceneController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#060d13');

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 4000);
  camera.position.set(0, 220, 260);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight('#88b7ff', 0.38);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight('#d0edff', '#355331', 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight('#ffffff', 1.25);
  key.position.set(130, 260, 100);
  scene.add(key);

  const fill = new THREE.DirectionalLight('#87ceeb', 0.48);
  fill.position.set(-120, 120, -80);
  scene.add(fill);

  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);

  let frameHandle = 0;

  const renderLoop = () => {
    frameHandle = requestAnimationFrame(renderLoop);
    terrainGroup.rotation.y += 0.0015;
    renderer.render(scene, camera);
  };

  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const setTerrain = (terrain: TerrainGrid) => {
    terrainGroup.children.forEach((child: THREE.Object3D) => {
      disposeObject3D(child);
      terrainGroup.remove(child);
    });

    const mesh = buildTerrainMesh(terrain);
    terrainGroup.add(mesh);
  };

  renderLoop();

  return {
    setTerrain,
    resize,
    dispose: () => {
      cancelAnimationFrame(frameHandle);
      terrainGroup.children.forEach((child: THREE.Object3D) => {
        disposeObject3D(child);
      });
      renderer.dispose();
    },
  };
}
