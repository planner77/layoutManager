import * as THREE from 'three';
// Independent direct renderer. No DXF conversion or DXF viewer dependency.
export function showLines(container: HTMLElement, positions: number[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x4dddc4 });
  const scene = new THREE.Scene();
  const object = new THREE.LineSegments(geometry, material);
  scene.add(object);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.position.z = 100;
  container.append(renderer.domElement);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -center.y, 0);
  const size = bounds.isEmpty() ? new THREE.Vector3(1, 1, 0) : bounds.getSize(new THREE.Vector3());
  const draw = () => renderer.render(scene, camera);
  const resize = () => {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    const half = Math.max(size.y, size.x * height / width, 1) * 0.6;
    camera.top = half; camera.bottom = -half; camera.left = -half * width / height; camera.right = -camera.left;
    camera.updateProjectionMatrix(); renderer.setSize(width, height); draw();
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  return {
    zoom: () => { camera.zoom *= 1.25; camera.updateProjectionMatrix(); draw(); },
    dispose: () => { observer.disconnect(); geometry.dispose(); material.dispose(); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); },
  };
}
