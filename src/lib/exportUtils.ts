import { jsPDF } from 'jspdf';
import type {
  AntennaPatternDTO,
  ClutterProfileDTO,
  MeshNodeDTO,
  MultipointLinkDTO,
  PathProfileResult,
  PlacedObstacleDTO,
  RfProjectDTO,
  SimulationDTO,
  UserDTO,
} from '../types/rf.ts';
import { getUnitSymbol } from './colourSchemas.ts';
import { rasterizeSimulationToDataUrl } from './geoUtils.ts';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSimulationPng(sim: SimulationDTO, colourSchema?: string) {
  const dataUrl = rasterizeSimulationToDataUrl(sim, colourSchema);
  fetch(dataUrl)
    .then((r) => r.blob())
    .then((blob) => {
      triggerDownload(blob, `${sim.layerLabel || sim.siteName}_coverage.png`);
    });
}

export function exportSimulationKmzKml(sim: SimulationDTO, colourSchema?: string) {
  const dataUrl = rasterizeSimulationToDataUrl(sim, colourSchema);
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${sim.siteName} - ${sim.networkName}</name>
    <description>CoverageLab RF Simulation (${sim.frequencyMhz} MHz, Range ${sim.rangeKm} km)</description>
    <Placemark>
      <name>Tx: ${sim.siteName}</name>
      <Point>
        <coordinates>${sim.txLng},${sim.txLat},0</coordinates>
      </Point>
    </Placemark>
    <GroundOverlay>
      <name>${sim.layerLabel}</name>
      <Icon>
        <href>${dataUrl}</href>
      </Icon>
      <LatLonBox>
        <north>${sim.bounds.north}</north>
        <south>${sim.bounds.south}</south>
        <east>${sim.bounds.east}</east>
        <west>${sim.bounds.west}</west>
      </LatLonBox>
    </GroundOverlay>
  </Document>
</kml>`;
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  triggerDownload(blob, `${sim.layerLabel || sim.siteName}.kml`);
}

export function exportPathProfileCsv(profile: PathProfileResult, siteName: string) {
  const headers = [
    'Distance_km',
    'Latitude',
    'Longitude',
    'Terrain_m',
    'Building_m',
    'Trees_m',
    'Obstacle_m',
    'LOS_m',
    'Fresnel_Upper_m',
    'Fresnel_Lower_m',
    'Rx_Power_dBm',
  ];
  const rows = profile.samples.map((s) =>
    [
      s.distanceKm,
      s.lat.toFixed(6),
      s.lng.toFixed(6),
      s.terrainM,
      s.buildingM,
      s.treesM,
      s.obstacleM,
      s.losM,
      s.fresnelUpperM,
      s.fresnelLowerM,
      s.rxPowerDbm,
    ].join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${siteName.replace(/\s+/g, '_')}_path_profile.csv`);
}

function drawPolarPlotToDataUrl(pattern: number[], title: string, rotationDeg: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 280, 280);

  const cx = 140;
  const cy = 148;
  const rMax = 104;

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, cx, 22);

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Concentric rings
  [0.25, 0.5, 0.75].forEach((f) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rMax * f, 0, Math.PI * 2);
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();
  });

  // Spokes
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * rMax, cy + Math.sin(rad) * rMax);
    ctx.strokeStyle = '#cbd5e1';
    ctx.stroke();
  }

  // Pattern polygon
  ctx.beginPath();
  for (let i = 0; i < pattern.length; i++) {
    const db = Math.max(-20, Math.min(0, pattern[i]));
    const norm = (db + 20) / 20;
    const rad = (((i * (360 / pattern.length) + rotationDeg - 90) % 360) * Math.PI) / 180;
    const px = cx + Math.cos(rad) * rMax * norm;
    const py = cy + Math.sin(rad) * rMax * norm;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

function drawPathProfileToDataUrl(profile: PathProfileResult): string {
  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 760, 240);

  const padL = 48;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = 760 - padL - padR;
  const plotH = 240 - padT - padB;

  const samples = profile.samples;
  if (samples.length < 2) return '';

  let maxH = 40;
  let minH = 0;
  for (const s of samples) {
    const top = Math.max(
      s.terrainM + Math.max(s.buildingM, s.treesM, s.obstacleM),
      s.fresnelUpperM,
      s.losM
    );
    if (top > maxH) maxH = top;
    if (s.terrainM < minH) minH = s.terrainM;
  }
  maxH = Math.ceil(maxH / 20) * 20 + 10;

  const xOf = (i: number) => padL + (i / (samples.length - 1)) * plotW;
  const yOf = (h: number) => padT + plotH - ((h - minH) / Math.max(1, maxH - minH)) * plotH;

  // Grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '10px monospace';
  for (let g = 0; g <= 4; g++) {
    const hVal = minH + ((maxH - minH) * g) / 4;
    const y = yOf(hVal);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(hVal)}m`, padL - 6, y + 3);
  }

  // Terrain polygon
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(minH));
  samples.forEach((s, i) => ctx.lineTo(xOf(i), yOf(s.terrainM)));
  ctx.lineTo(xOf(samples.length - 1), yOf(minH));
  ctx.closePath();
  ctx.fillStyle = '#a89f91';
  ctx.fill();

  // Buildings & Trees bars
  const barW = Math.max(4, plotW / samples.length);
  samples.forEach((s, i) => {
    const x = xOf(i) - barW / 2;
    if (s.treesM > 0) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.72)';
      ctx.fillRect(x, yOf(s.terrainM + s.treesM), barW, yOf(s.terrainM) - yOf(s.terrainM + s.treesM));
    }
    if (s.buildingM > 0) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.fillRect(
        x,
        yOf(s.terrainM + s.buildingM),
        barW,
        yOf(s.terrainM) - yOf(s.terrainM + s.buildingM)
      );
    }
  });

  // Fresnel zone dashed
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  samples.forEach((s, i) => {
    if (i === 0) ctx.moveTo(xOf(i), yOf(s.fresnelUpperM));
    else ctx.lineTo(xOf(i), yOf(s.fresnelUpperM));
  });
  ctx.stroke();
  ctx.beginPath();
  samples.forEach((s, i) => {
    if (i === 0) ctx.moveTo(xOf(i), yOf(s.fresnelLowerM));
    else ctx.lineTo(xOf(i), yOf(s.fresnelLowerM));
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // LOS line
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(samples[0].losM));
  ctx.lineTo(xOf(samples.length - 1), yOf(samples[samples.length - 1].losM));
  ctx.stroke();

  // Distance labels
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const idx = Math.round((i / 5) * (samples.length - 1));
    ctx.fillText(`${samples[idx].distanceKm.toFixed(2)} km`, xOf(idx), 232);
  }

  return canvas.toDataURL('image/png');
}

export interface PdfReportInput {
  project: RfProjectDTO;
  pattern: AntennaPatternDTO;
  clutter: ClutterProfileDTO;
  simulation: SimulationDTO | null;
  pathProfile: PathProfileResult | null;
  placedObstacles: PlacedObstacleDTO[];
  multipointLinks: MultipointLinkDTO[];
  meshNodes: MeshNodeDTO[];
  user: UserDTO | null;
}

export function exportRfReportPdf(input: PdfReportInput) {
  const { project, pattern, clutter, simulation, pathProfile, placedObstacles, multipointLinks, meshNodes, user } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  let y = 14;

  // Header Banner
  doc.setFillColor(35, 39, 43);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFillColor(245, 158, 11);
  doc.circle(18, 14, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('CoverageLab RF Engineering Report', 28, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Site: ${project.name}  |  Network: ${project.network}  |  Operator: ${user?.name || 'Operator'}  |  ${new Date().toLocaleString()}`,
    28,
    20.5
  );

  y = 36;
  doc.setTextColor(15, 23, 42);

  const sectionTitle = (title: string) => {
    if (y > 265) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 14, y);
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y + 1.8, 196, y + 1.8);
    y += 7;
  };

  const kvRow = (k1: string, v1: string, k2?: string, v2?: string) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(k1, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(v1, 56, y);
    if (k2 && v2 !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text(k2, 108, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(v2, 150, y);
    }
    y += 5.5;
  };

  // 1. Transmitter & Signal Configuration
  sectionTitle('1. Transmitter, Signal & Antenna Parameters');
  kvRow('Site Name', project.name, 'Network', project.network);
  kvRow('Tx Coordinates', `${project.txLat.toFixed(6)}, ${project.txLng.toFixed(6)}`, 'Tx Height', `${project.txHeightM} m (${project.txHeightMode})`);
  kvRow('Frequency', `${project.frequencyMhz} MHz`, 'RF Power', `${project.rfPower} ${project.rfPowerUnit}`);
  kvRow('Bandwidth', `${project.bandwidthKhz} kHz`, 'Antenna Pattern', pattern.name);
  kvRow('Tx Gain / Polarisation', `${project.txGainDbi} dBi (${pattern.polarisation})`, 'Azimuth / Tilt', `${project.azimuthDeg}° / ${project.tiltDeg}°`);
  kvRow('Rx Coordinates', `${project.rxLat.toFixed(6)}, ${project.rxLng.toFixed(6)}`, 'Rx Height / Gain', `${project.rxHeightM} m / ${project.rxGainDbi} dBi`);
  kvRow('Environment Profile', clutter.name, 'Simulation Range', `${project.rangeKm} km (${project.colourSchema})`);

  y += 3;

  // 2. Link Budget & Path Profile Analysis
  if (pathProfile) {
    sectionTitle('2. Point-to-Point Link Budget Analysis');
    kvRow('Path Distance', `${pathProfile.distanceKm} km`, 'Bearing / Downtilt', `${pathProfile.bearingDeg}° / ${pathProfile.downtiltDeg}°`);
    kvRow('Propagation Model', pathProfile.modelName, 'Terrain Source', pathProfile.elevationSource);
    kvRow('Free-Space Loss (FSPL)', `${pathProfile.fsplDb} dB`, 'Diffraction Loss', `${pathProfile.diffractionLossDb} dB`);
    kvRow('Clutter / Obstacle Loss', `${pathProfile.clutterLossDb} dB`, 'Total Path Loss', `${pathProfile.pathLossDb} dB`);
    kvRow('ERP / EIRP', `${pathProfile.erpW} W (${pathProfile.erpDbm} dBm)`, 'EIRP', `${pathProfile.eirpW} W (${pathProfile.eirpDbm} dBm)`);
    kvRow('Received Power', `${pathProfile.receivedPowerDbm} dBm`, 'Field Strength', `${pathProfile.fieldStrengthDbuvm} dBuV/m`);
    kvRow('Thermal Noise Floor', `${pathProfile.noiseFloorDbm} dBm`, 'Link SNR Margin', `${pathProfile.snrDb} dB (${pathProfile.snrDb >= 5 ? 'VIABLE' : 'MARGINAL'})`);

    const profileImg = drawPathProfileToDataUrl(pathProfile);
    if (profileImg) {
      if (y > 210) {
        doc.addPage();
        y = 18;
      }
      doc.addImage(profileImg, 'PNG', 14, y + 1, 182, 56);
      y += 62;
    }
  }

  // 3. Coverage Simulation & Polar Patterns
  if (simulation) {
    const simUnit = getUnitSymbol(simulation.measuredUnit);
    sectionTitle('3. Coverage Heatmap & Antenna Radiation Patterns');
    kvRow('Layer ID', simulation.layerLabel, 'Resolution', `${simulation.stats.resolutionM} m/pixel`);
    kvRow(
      `Min / Max (${simulation.measuredUnit})`,
      `${simulation.stats.minVal} / ${simulation.stats.maxVal} ${simUnit}`,
      'Mean Value',
      `${simulation.stats.avgVal} ${simUnit}`
    );
    kvRow(
      'Effective Coverage Area',
      `${simulation.stats.coveragePct}% (SNR >= ${simulation.stats.snrThresholdDb} dB)`,
      'Compute Time',
      `${simulation.stats.apiMs} ms (Terrain ${simulation.stats.terrainMs} ms)`
    );

    if (y > 205) {
      doc.addPage();
      y = 18;
    }
    const covImg = rasterizeSimulationToDataUrl(simulation, project.colourSchema);
    const hImg = drawPolarPlotToDataUrl(pattern.horizontalPattern, 'Horizontal Polar Pattern', project.azimuthDeg);
    const vImg = drawPolarPlotToDataUrl(pattern.verticalPattern, 'Vertical Polar Pattern', project.tiltDeg);

    if (covImg) {
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 56, 56, 'F');
      doc.addImage(covImg, 'PNG', 14, y, 56, 56);
      doc.setFontSize(7.5);
      doc.text(`Coverage Footprint (${project.rangeKm} km)`, 42, y + 60, { align: 'center' });
    }
    if (hImg) {
      doc.addImage(hImg, 'PNG', 76, y, 56, 56);
    }
    if (vImg) {
      doc.addImage(vImg, 'PNG', 138, y, 56, 56);
    }
    y += 66;
  }

  // 4. Environment Clutter & Obstacles
  sectionTitle(`4. Environment & Clutter Attenuation (${clutter.name})`);
  kvRow('Buildings Attenuation', `${clutter.buildingsAtten} dB/m`, 'Active Placed Obstacles', `${placedObstacles.length}`);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, 'F');
  doc.text('Land Cover Class', 16, y + 4.2);
  doc.text('Height (m)', 95, y + 4.2);
  doc.text('Attenuation (dB/m)', 140, y + 4.2);
  y += 7;

  doc.setFont('helvetica', 'normal');
  clutter.landCover.forEach((lc) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(lc.label, 16, y + 3);
    doc.text(String(lc.heightM), 95, y + 3);
    doc.text(String(lc.attenDbm), 140, y + 3);
    y += 5;
  });

  if (multipointLinks.length > 0 || meshNodes.length > 0) {
    y += 4;
    sectionTitle('5. Multipoint & Mesh Network Nodes');
    multipointLinks.slice(0, 12).forEach((l, idx) => {
      kvRow(
        `Multipoint #${idx + 1}`,
        `${l.txLat.toFixed(5)}, ${l.txLng.toFixed(5)} -> Rx`,
        `${l.distanceKm} km / ${l.bearingDeg}°`,
        `${l.rxPowerDbm} dBm (SNR ${l.snrDb} dB)`
      );
    });
    meshNodes.slice(0, 12).forEach((m, idx) => {
      kvRow(
        `Mesh Node #${idx + 1}`,
        `${m.label} (${m.nodeType})`,
        `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`,
        `${m.frequencyMhz} MHz / ${m.rfPowerDbm} dBm`
      );
    });
  }

  doc.save(`CoverageLab_Report_${project.name.replace(/\s+/g, '_')}.pdf`);
}
