import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// import SimplexNoise from "simplex-noise";

// const gen = new SimplexNoise();
// function noise(nx: number, ny: number) {
//   // Rescale from -1.0:+1.0 to 0.0:1.0
//   return gen.noise2D(nx, ny) / 2 + 0.5;
// }

class TerrianColor {
  static readonly Deepwater = [0.25, 0.38, 0.75];
  static readonly Shallowwater = [0.38, 0.5, 1.0];
  static readonly Beach = [0.82, 0.71, 0.56];
  static readonly Forest = [0.45, 0.66, 0.39];
  static readonly Jungle = [0.25, 0.49, 0.38];
  static readonly Savannah = [0.64, 0.74, 0.49];
  static readonly Desert = [0.75, 0.82, 0.69];
  static readonly Snow = [0.82, 0.82, 0.84];
}

class TerrianBarWorld {
  maxHeight = 1;
  cellSize: number;
  cellSliceSize: number;
  heightMap: Uint8Array;

  static readonly facesXY = [
    {
      // -X
      dir: [-1, 0, 0],
      corners: [
        [0, 1, 0],
        [0, 0, 0],
        [0, 1, 1],
        [0, 0, 1],
      ],
    },
    {
      // +X
      dir: [1, 0, 0],
      corners: [
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 0],
        [1, 0, 0],
      ],
    },
    {
      // -Y
      dir: [0, -1, 0],
      corners: [
        [1, 0, 1],
        [0, 0, 1],
        [1, 0, 0],
        [0, 0, 0],
      ],
    },
    {
      // +Y
      dir: [0, 1, 0],
      corners: [
        [0, 1, 1],
        [1, 1, 1],
        [0, 1, 0],
        [1, 1, 0],
      ],
    },
  ];

  static readonly facesZ = [
    {
      // -Z
      dir: [0, 0, -1],
      corners: [
        [1, 0, 0],
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    },
    {
      // +Z
      dir: [0, 0, 1],
      corners: [
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ],
    },
  ];

  constructor(cellSize: number, maxHeight: number) {
    this.cellSize = cellSize;
    this.cellSliceSize = cellSize * cellSize;
    this.heightMap = new Uint8Array(cellSize * cellSize);
    this.maxHeight = maxHeight;
  }
  computeVoxelOffset(x: number, y: number) {
    return y * this.cellSize + x;
  }

  setBar(x: number, y: number, height: number) {
    const id = y * this.cellSize + x;
    this.heightMap[id] = height;
  }
  getBar(x: number, y: number) {
    if (x < 0 || x >= this.cellSize || y < 0 || y >= this.cellSize) {
      return -10000;
    }
    return this.heightMap[y * this.cellSize + x];
  }
  pushVertexInfo(
    x: number,
    y: number,
    height: number,
    dir: number[],
    corners: number[][],
    positions: number[],
    normals: number[],
    indices: number[],
    colors: number[]
  ) {
    const ndx = positions.length / 3;
    for (const pos of corners) {
      const z = pos[2] > 0 ? height : 0;
      positions.push(pos[0] + x, pos[1] + y, z);
      normals.push(...dir);
      colors.push(...this.getColor(z / this.maxHeight));
    }
    indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
  }

  getColor(z: number) {
    if (z < 0.025) return TerrianColor.Deepwater;
    if (z < 0.05) return TerrianColor.Shallowwater;
    if (z < 0.1) return TerrianColor.Beach;
    if (z < 0.2) return TerrianColor.Forest;
    if (z < 0.3) return TerrianColor.Jungle;
    if (z < 0.6) return TerrianColor.Savannah;
    if (z < 0.9) return TerrianColor.Desert;
    return TerrianColor.Snow;
  }

  generateGeometryDataForCell() {
    const { cellSize } = this;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    for (let y = 0; y < cellSize; ++y) {
      for (let x = 0; x < cellSize; ++x) {
        const height = this.getBar(x, y);
        for (const { dir, corners } of TerrianBarWorld.facesZ) {
          this.pushVertexInfo(
            x,
            y,
            height,
            dir,
            corners,
            positions,
            normals,
            indices,
            colors
          );
        }
        for (const { dir, corners } of TerrianBarWorld.facesXY) {
          const height_neighbor = this.getBar(x + dir[0], y + dir[1]);
          if (height_neighbor < height) {
            this.pushVertexInfo(
              x,
              y,
              height,
              dir,
              corners,
              positions,
              normals,
              indices,
              colors
            );
          }
        }
      }
    }

    return {
      positions,
      normals,
      indices,
      colors,
    };
  }
}

async function main() {
  const canvas = document.getElementById(
    "canvas-container"
  ) as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
  });

  let response = await fetch("map.bin");
  if (response.body == null) {
    console.log("cannot download map.bin");
    return;
  }
  const reader = response.body.getReader();
  // ストリームからデータを読む
  const readResult = await reader.read();
  const heightMap = readResult.value;
  if (heightMap === undefined) {
    console.log("cannot load file");
    return;
  }
  response = await fetch("config.json");
  if (response.body == null) {
    console.log("cannot download config.json");
    return;
  }
  const configs = await response.json();
  const cellSize = configs.cellSize;

  const fov = 75;
  const aspect = 2; // the canvas default
  const near = 0.1;
  const far = 1000;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.up.set(0, 0, 1);
  const coef_camera = 20;
  camera.position.set(
    -coef_camera * 1.5,
    -coef_camera * 1.5,
    coef_camera * 2.5
  );

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(coef_camera / 2, coef_camera / 3, coef_camera / 2);
  controls.update();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("lightblue");

  function addLight(x: number, y: number, z: number) {
    const color = 0xffffff;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  addLight(-1, 2, 4);
  addLight(1, -1, -2);

  const world = new TerrianBarWorld(cellSize, Math.max(...heightMap));

  for (let y = 0; y < cellSize; ++y) {
    for (let x = 0; x < cellSize; ++x) {
      // const coef = 4 / cellSize;
      // const height = Math.floor(noise(x * coef, y * coef) ** 1.4 * 20);
      const height = heightMap[y * cellSize + x];
      world.setBar(x, y, height);
    }
  }

  const {
    positions,
    normals,
    indices,
    colors,
  } = world.generateGeometryDataForCell();
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
  });

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(normals), 3)
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3)
  );
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let renderRequested = false;

  function render() {
    renderRequested = false;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    controls.update();
    renderer.render(scene, camera);
  }
  scene.add(...drawAxes(100));
  render();

  function requestRenderIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  controls.addEventListener("change", requestRenderIfNotRequested);
  window.addEventListener("resize", requestRenderIfNotRequested);
}

function drawAxes(length: number) {
  const start = new THREE.Vector3(0, 0, 0);
  const axisXLength = length; // 矢印の長さ
  const axisXHeadLength = axisXLength * 0.05; // 矢印の頭の長さ
  const axisXHeadWidth = axisXHeadLength * 0.5; // 矢印の頭の太さ
  const directionX = new THREE.Vector3(1, 0, 0); // 矢印の向き(X方向)
  const colorX = 0xff0000; //矢印の色
  const axisX = new THREE.ArrowHelper(
    directionX,
    start,
    axisXLength + axisXHeadLength * 2,
    colorX,
    axisXHeadLength,
    axisXHeadWidth
  );
  //Y軸
  const axisYLength = length; // 矢印の長さ
  const axisYHeadLength = axisYLength * 0.05; // 矢印の頭の長さ
  const axisYHeadWidth = axisYHeadLength * 0.5; // 矢印の頭の太さ
  const directionY = new THREE.Vector3(0, 1, 0); // 矢印の向き(X方向)
  const colorY = "#00ff00"; //矢印の色
  const axisY = new THREE.ArrowHelper(
    directionY,
    start,
    axisYLength + axisYHeadLength * 2,
    colorY,
    axisYHeadLength,
    axisYHeadWidth
  );
  //Z軸
  const axisZLength = length / 3; // 矢印の長さ
  const axisZHeadLength = axisZLength * 0.05; // 矢印の頭の長さ
  const axisZHeadWidth = axisZHeadLength * 0.5; // 矢印の頭の太さ
  const directionZ = new THREE.Vector3(0, 0, 1); // 矢印の向き(X方向)
  const colorZ = "#0000ff"; //矢印の色
  const axisZ = new THREE.ArrowHelper(
    directionZ,
    start,
    axisZLength + axisZHeadLength * 2,
    colorZ,
    axisZHeadLength,
    axisZHeadWidth
  );
  return [axisX, axisY, axisZ];
}

main();
