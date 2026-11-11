import type { Face } from "./cube";

export interface Swatch {
  name: string;
  hex: string;
}

export type Palette = Record<Face, Swatch>;

export const FACE_ORDER: Face[] = ["U", "D", "F", "B", "L", "R"];

export const DEFAULT_PALETTE: Palette = {
  U: { name: "white", hex: "#f4f1ea" },
  D: { name: "yellow", hex: "#f5c518" },
  F: { name: "green", hex: "#2f9e44" },
  B: { name: "blue", hex: "#1c64d1" },
  L: { name: "orange", hex: "#f08c00" },
  R: { name: "red", hex: "#e03131" },
};

export const PRESETS: { id: string; label: string; palette: Palette }[] = [
  { id: "classic", label: "Classic", palette: DEFAULT_PALETTE },
  {
    id: "soft",
    label: "Soft",
    palette: {
      U: { name: "ivory", hex: "#f7f3ea" },
      D: { name: "gold", hex: "#e6b325" },
      F: { name: "mint", hex: "#63b37a" },
      B: { name: "sky", hex: "#5b8def" },
      L: { name: "peach", hex: "#f4a261" },
      R: { name: "coral", hex: "#ef6f6c" },
    },
  },
  {
    id: "contrast",
    label: "High contrast",
    palette: {
      U: { name: "white", hex: "#ffffff" },
      D: { name: "yellow", hex: "#ffe600" },
      F: { name: "green", hex: "#00a86b" },
      B: { name: "blue", hex: "#0047ff" },
      L: { name: "orange", hex: "#ff7a00" },
      R: { name: "crimson", hex: "#d00000" },
    },
  },
  {
    id: "colorblind",
    label: "Colorblind",
    palette: {
      U: { name: "white", hex: "#f7f7f7" },
      D: { name: "yellow", hex: "#f0e442" },
      F: { name: "teal", hex: "#009e73" },
      B: { name: "sky", hex: "#56b4e9" },
      L: { name: "orange", hex: "#e69f00" },
      R: { name: "rose", hex: "#cc79a7" },
    },
  },
];

export function namesOf(palette: Palette): Record<Face, string> {
  return {
    U: palette.U.name.trim() || "white",
    D: palette.D.name.trim() || "yellow",
    F: palette.F.name.trim() || "green",
    B: palette.B.name.trim() || "blue",
    L: palette.L.name.trim() || "orange",
    R: palette.R.name.trim() || "red",
  };
}

export function paletteOk(value: unknown): value is Palette {
  if (!value || typeof value !== "object") return false;
  return FACE_ORDER.every((face) => {
    const swatch = (value as Palette)[face];
    return Boolean(swatch && /^#[0-9a-fA-F]{6}$/.test(swatch.hex) && typeof swatch.name === "string");
  });
}
