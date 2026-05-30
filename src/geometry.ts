export type HeadType = 'flat' | 'semi-elliptical' | 'dished' | 'hemispherical';

export const HEAD_TYPES = [
  { value: 'flat', label: '平底' },
  { value: 'semi-elliptical', label: '半楕円形' },
  { value: 'dished', label: '皿型' },
  { value: 'hemispherical', label: '全半球形' }
];

export interface TankGeometry {
  D: number;
  V_L: number; // Volume in Liters
  headType: HeadType;
  C: number;   // Clearance in meters
}

/**
 * Gets the properties of the tank head based on tank diameter D and head type.
 * Returns volume in m3 and height in m.
 */
export function getHeadProperties(D: number, headType: HeadType): { V_head: number; H_head: number } {
  let V_head = 0;
  let H_head = 0;

  switch (headType) {
    case 'flat':
      V_head = 0;
      H_head = 0;
      break;
    case 'semi-elliptical': // 2:1 semi-elliptical
      H_head = 0.25 * D;
      V_head = (Math.PI / 24) * Math.pow(D, 3);
      break;
    case 'dished': // 10% dished head (approximation)
      H_head = 0.1935 * D;
      V_head = 0.0809 * Math.pow(D, 3);
      break;
    case 'hemispherical':
      H_head = 0.5 * D;
      V_head = (Math.PI / 12) * Math.pow(D, 3);
      break;
  }

  return { V_head, H_head };
}

/**
 * Calculates the volume of the liquid inside the bottom head up to a height h.
 * h should be <= H_head.
 */
function getCapVolume(D: number, h: number, headType: HeadType, H_head: number, V_head: number): number {
  if (h <= 0) return 0;
  if (h >= H_head) return V_head;

  switch (headType) {
    case 'flat':
      return 0; // Flat bottom has no head volume
    case 'hemispherical':
      // Spherical cap volume: V = (pi * h^2 / 3) * (1.5 * D - h)
      return (Math.PI / 3) * Math.pow(h, 2) * (1.5 * D - h);
    case 'semi-elliptical':
      // Semi-elliptical cap volume: V = pi * (D * h^2 - (4/3) * h^3)
      return Math.PI * (D * Math.pow(h, 2) - (4 / 3) * Math.pow(h, 3));
    case 'dished':
      // Approximation for dished head cap volume using a polynomial that matches V_head and dV/dh at h=H_head
      // A simple but robust approximation:
      return V_head * Math.pow(h / H_head, 2) * ((3 - (h / H_head)) / 2);
  }
}

/**
 * Calculates the total liquid height H (m) given the liquid volume V_L (L) and tank diameter D (m).
 */
export function getLiquidHeight(D: number, V_L: number, headType: HeadType): number {
  if (D <= 0 || V_L <= 0) return 0;

  const V_m3 = V_L / 1000;
  const { V_head, H_head } = getHeadProperties(D, headType);

  // If the liquid volume is larger than the head volume, it reaches the cylindrical part
  if (V_m3 >= V_head) {
    const V_cyl = V_m3 - V_head;
    const Area_cyl = (Math.PI / 4) * Math.pow(D, 2);
    const h_cyl = V_cyl / Area_cyl;
    return H_head + h_cyl;
  }

  // If the liquid is entirely inside the head, use numerical bisection to find the height
  let low = 0;
  let high = H_head;
  let h = H_head / 2;
  const tolerance = 1e-6; // 1 mL precision

  for (let i = 0; i < 50; i++) { // Max 50 iterations
    h = (low + high) / 2;
    const v_calc = getCapVolume(D, h, headType, H_head, V_head);
    if (Math.abs(v_calc - V_m3) < tolerance) {
      break;
    }
    if (v_calc < V_m3) {
      low = h;
    } else {
      high = h;
    }
  }

  return h;
}

/**
 * Calculates the wetted (liquid-contact) surface area (m²) of the tank.
 * Includes the bottom head area and the cylindrical wall up to liquid height.
 * Does NOT include the liquid surface (top) as that is not a heat-transfer surface.
 *
 * @param D       Tank inner diameter (m)
 * @param h_liq   Liquid height from bottom of head (m), as returned by getLiquidHeight
 * @param headType Head type
 */
export function getWettedArea(D: number, h_liq: number, headType: HeadType): number {
  if (D <= 0 || h_liq <= 0) return 0;

  const R = D / 2;
  const { H_head } = getHeadProperties(D, headType);

  // --- Bottom head surface area ---
  let A_head = 0;
  switch (headType) {
    case 'flat':
      A_head = Math.PI * R * R; // flat circular bottom
      break;
    case 'semi-elliptical': {
      // 2:1 semi-elliptical head: a=R, b=R/2 (depth = D/4)
      const a = R, b = R / 2;
      const e = Math.sqrt(1 - (b * b) / (a * a));
      A_head = 2 * Math.PI * a * b * (1 + (a / (2 * b * e)) * Math.log((1 + e) / (1 - e)));
      // Fallback if e ~= 0
      if (!isFinite(A_head)) A_head = 2 * Math.PI * R * R;
      break;
    }
    case 'dished':
      // Standard dished (torispherical) head approximation: A ≈ 1.09 * π * R²
      A_head = 1.09 * Math.PI * R * R;
      break;
    case 'hemispherical':
      A_head = 2 * Math.PI * R * R;
      break;
  }

  // --- Cylindrical wall area above the head ---
  const h_cyl = Math.max(h_liq - H_head, 0);
  const A_cyl = Math.PI * D * h_cyl;

  return A_head + A_cyl;
}
