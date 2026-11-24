import { valueToRgba } from './colourSchemas.ts';
import type { SimulationDTO } from '../types/rf.ts';

const EARTH_RADIUS_KM = 6371.0;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(
  lat: number,
  lng: number,
  distKm: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  const brng = toRad(bearingDegrees);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const delta = distKm / EARTH_RADIUS_KM;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(brng)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: toDeg(phi2), lng: toDeg(lambda2) };
}

export function formatCoordDms(val: number, isLat: boolean): string {
  const abs = Math.abs(val);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(2);
  const hemi = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
  return `${d}°${m}'${s}"${hemi}`;
}

export function formatFooterCoord(lat: number, lng: number): string {
  const latH = lat >= 0 ? 'N' : 'S';
  const lngH = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}${latH} ${Math.abs(lng).toFixed(6)}${lngH}`;
}

export function rasterizeSimulationToDataUrl(
  sim: SimulationDTO,
  colourSchemaOverride?: string
): string {
  const { gridCols, gridRows, gridValues } = sim;
  const schema = colourSchemaOverride || sim.colourSchema || 'LORA';
  const unit = sim.measuredUnit;

  const outW = 400;
  const outH = 400;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(outW, outH);
  const data = imgData.data;

  // Scalar-field bilinear resampling before color palette lookup prevents
  // dark perimeter fringes and muddy RGB blending between colour stops.
  for (let py = 0; py < outH; py++) {
    const gy = ((py + 0.5) / outH) * gridRows - 0.5;
    const y0 = Math.max(0, Math.min(gridRows - 1, Math.floor(gy)));
    const y1 = Math.max(0, Math.min(gridRows - 1, y0 + 1));
    const fy = Math.max(0, Math.min(1, gy - y0));

    for (let px = 0; px < outW; px++) {
      const gx = ((px + 0.5) / outW) * gridCols - 0.5;
      const x0 = Math.max(0, Math.min(gridCols - 1, Math.floor(gx)));
      const x1 = Math.max(0, Math.min(gridCols - 1, x0 + 1));
      const fx = Math.max(0, Math.min(1, gx - x0));

      const v00 = gridValues[y0 * gridCols + x0] ?? -999;
      const v10 = gridValues[y0 * gridCols + x1] ?? -999;
      const v01 = gridValues[y1 * gridCols + x0] ?? -999;
      const v11 = gridValues[y1 * gridCols + x1] ?? -999;

      const w00 = v00 > -900 ? (1 - fx) * (1 - fy) : 0;
      const w10 = v10 > -900 ? fx * (1 - fy) : 0;
      const w01 = v01 > -900 ? (1 - fx) * fy : 0;
      const w11 = v11 > -900 ? fx * fy : 0;
      const wSum = w00 + w10 + w01 + w11;

      const idx = (py * outW + px) * 4;
      if (wSum < 0.45) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }

      const scalarVal = (v00 * w00 + v10 * w10 + v01 * w01 + v11 * w11) / wSum;
      const rgba = valueToRgba(scalarVal, schema, 215, unit);
      if (rgba) {
        data[idx] = rgba[0];
        data[idx + 1] = rgba[1];
        data[idx + 2] = rgba[2];
        data[idx + 3] = rgba[3];
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

