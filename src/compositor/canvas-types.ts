export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2DLike;
}

export interface CanvasRenderingContext2DLike {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(radians: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: unknown,
    x: number,
    y: number,
    w?: number,
    h?: number,
  ): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradientLike;
  createImageData?(sw: number, sh: number): ImageDataLike;
  getImageData?(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData?(imageData: ImageDataLike, dx: number, dy: number): void;
  font: string;
  textAlign: string;
  textBaseline: string;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  filter: string;
  globalAlpha: number;
  fillStyle: string | CanvasGradientLike;
  strokeStyle: string | CanvasGradientLike;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}
