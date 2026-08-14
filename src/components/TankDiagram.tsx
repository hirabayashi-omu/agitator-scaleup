import React from 'react';
import type { HeadType } from '../geometry';
import type { AgitatorParams } from '../kamei';

export interface ExtendedAgitatorParams extends AgitatorParams {
  headType?: HeadType;
  clearance?: number;
  H_T?: number;
  stage_gap?: number;
}

export interface TankDiagramProps {
  tankParams: ExtendedAgitatorParams;
  liquidHeight: number;
  scaleFactor: number;
  title: string;
}

export const TankDiagram: React.FC<TankDiagramProps> = ({ tankParams, liquidHeight, scaleFactor, title }) => {
  // Base SVG viewBox is 500x600, center is at x=250.
  const cx = 250;
  
  const { D_T, d, clearance = 0.02, b, n_stage, headType, impellerType, baffled, n_B, B_w, H_T } = tankParams;
  // Fallbacks in case types are not fully mapped in previous steps
  const hType = (headType || 'semi-elliptical') as HeadType;

  const w_vessel_px = D_T * scaleFactor;
  const r_vessel = w_vessel_px / 2;
  const lx = cx - r_vessel;
  const rx = cx + r_vessel;
  const y_top = 130;

  // Bottom head depth hb_px
  let hb_px = 0;
  if (hType === 'semi-elliptical') {
    hb_px = r_vessel / 2;
  } else if (hType === 'dished' || (hType as any) === 'dish') {
    hb_px = r_vessel * 0.388; // Approx dish depth
  } else if (hType === 'hemispherical') {
    hb_px = r_vessel;
  }

  let cylinder_h_px = (H_T !== undefined ? H_T : D_T) * scaleFactor;
  const h_liquid_px = liquidHeight * scaleFactor;
  const straight_liquid_h_px = Math.max(0, h_liquid_px - hb_px);
  
  if (straight_liquid_h_px > cylinder_h_px * 0.95) {
    cylinder_h_px = straight_liquid_h_px / 0.95;
  }

  const y_cyl_bottom = y_top + cylinder_h_px;

  // Top Flange / Motor dimensions based on tank width
  const overhang = w_vessel_px * 0.05;
  const gap = w_vessel_px * 0.08;
  const motor_w = w_vessel_px * 0.15;
  const motor_h = w_vessel_px * 0.08;
  const y_lid = y_top - gap;
  const y_motor_top = y_lid - motor_h;

  const y_deepest = y_cyl_bottom + hb_px;

  // Generate Vessel Outline Path
  let vesselPath = `M ${lx} ${y_top} L ${lx} ${y_cyl_bottom} `;
  if (hType === 'semi-elliptical') {
    vesselPath += `A ${r_vessel} ${hb_px} 0 0 0 ${rx} ${y_cyl_bottom} `;
  } else if (hType === 'dished' || (hType as any) === 'dish') {
    const cp_y = y_deepest + hb_px / 3;
    vesselPath += `C ${lx} ${cp_y}, ${rx} ${cp_y}, ${rx} ${y_cyl_bottom} `;
  } else if (hType === 'hemispherical') {
    vesselPath += `A ${r_vessel} ${r_vessel} 0 0 0 ${rx} ${y_cyl_bottom} `;
  } else {
    vesselPath += `L ${rx} ${y_cyl_bottom} `;
  }
  vesselPath += `L ${rx} ${y_top}`;

  // Liquid Height Path
  const y_liquid = y_deepest - h_liquid_px;

  let liquidPath = "";
  if (y_liquid < y_cyl_bottom) {
    // Liquid level is in the straight cylinder
    liquidPath = `M ${lx} ${y_liquid} L ${lx} ${y_cyl_bottom} `;
    if (hType === 'semi-elliptical') {
      liquidPath += `A ${r_vessel} ${hb_px} 0 0 0 ${rx} ${y_cyl_bottom} `;
    } else if (hType === 'dished' || (hType as any) === 'dish') {
      const cp_y = y_deepest + hb_px / 3;
      liquidPath += `C ${lx} ${cp_y}, ${rx} ${cp_y}, ${rx} ${y_cyl_bottom} `;
    } else if (hType === 'hemispherical') {
      liquidPath += `A ${r_vessel} ${r_vessel} 0 0 0 ${rx} ${y_cyl_bottom} `;
    } else {
      liquidPath += `L ${rx} ${y_cyl_bottom} `;
    }
    liquidPath += `L ${rx} ${y_liquid} Z`;
  } else {
    // Liquid level inside the bottom head (low fill)
    const liquid_ratio = Math.max(0, (y_deepest - y_liquid) / (hb_px || 1));
    const active_width = r_vessel * Math.sqrt(Math.max(0, 1 - Math.pow(1 - liquid_ratio, 2)));
    const lx_liq = cx - active_width;
    const rx_liq = cx + active_width;
    const cur_hb = y_deepest - y_liquid;

    liquidPath = `M ${lx_liq} ${y_liquid} `;
    if (hType === 'flat') {
      liquidPath += `L ${rx_liq} ${y_liquid} Z`;
    } else {
      liquidPath += `A ${active_width} ${cur_hb} 0 0 0 ${rx_liq} ${y_liquid} Z`;
    }
  }

  // Baffles
  let bafflesElements = null;
  if (baffled && n_B > 0) {
    const bw_px = B_w * scaleFactor;
    const baffle_h = (y_cyl_bottom - y_top) * 0.95;
    const baffle_y_start = y_cyl_bottom - baffle_h;

    bafflesElements = (
      <g>
        <rect x={lx} y={baffle_y_start} width={bw_px} height={baffle_h} fill="var(--vessel-baffle-fill, rgba(16, 185, 129, 0.2))" stroke="var(--vessel-baffle-stroke, #10b981)" strokeWidth="1.5" />
        {n_B > 1 && (
          <rect x={rx - bw_px} y={baffle_y_start} width={bw_px} height={baffle_h} fill="var(--vessel-baffle-fill, rgba(16, 185, 129, 0.2))" stroke="var(--vessel-baffle-stroke, #10b981)" strokeWidth="1.5" />
        )}
        {/* Bw Dimension */}
        <line x1={lx} y1={y_top} x2={lx + bw_px} y2={y_top} stroke="var(--vessel-guide, #06b6d4)" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
        <text x={lx + bw_px/2} y={y_top - 8} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="middle" fontWeight="bold">Bw={B_w.toFixed(3)}m</text>
      </g>
    );
  }

  // Impellers
  const d_px = d * scaleFactor;
  const b_px = b * scaleFactor;
  const clearance_px = clearance * scaleFactor;

  const shaft_w_px = Math.max(2, d_px * 0.05);
  const hub_w_px = Math.max(6, d_px * 0.2);
  const half_hub = hub_w_px / 2;

  const n_stages = Math.max(1, parseInt(String(n_stage)) || 1);
  const stages_y: number[] = [];
  const y_bottom_target = y_deepest - clearance_px - b_px / 2;

  if (n_stages === 1) {
    stages_y.push(y_bottom_target);
  } else {
    const gap_m = (tankParams.stage_gap !== undefined && tankParams.stage_gap !== null && !isNaN(tankParams.stage_gap) && tankParams.stage_gap > 0)
      ? Number(tankParams.stage_gap)
      : d;
    const gap_px = gap_m * scaleFactor;
    for (let i = 0; i < n_stages; i++) {
      stages_y.push(y_bottom_target - i * gap_px);
    }
  }

  const y_bottom_impeller = Math.max(...stages_y);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
      <div style={{ position: 'absolute', top: 20, left: 24, fontSize: '1rem', fontWeight: 600, color: 'var(--vessel-title, #9ca3af)' }}>
        {title} ({headType} / {impellerType}{n_stages >= 2 ? ` / ${n_stages}段` : ''})
      </div>
      <svg viewBox={`0 0 500 ${Math.max(300, y_deepest + 80)}`} width="100%" style={{ height: 'auto' }}>
        <defs>
          <marker id="arrow-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="var(--vessel-guide, #06b6d4)" />
          </marker>
          <marker id="arrow-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vessel-guide, #06b6d4)" />
          </marker>
        </defs>

        {/* Liquid Layer */}
        <path d={liquidPath} fill="var(--vessel-liquid-fill, rgba(6, 182, 212, 0.12))" stroke="var(--vessel-liquid-stroke, rgba(6, 182, 212, 0.4))" strokeWidth="1" />

        {/* Vessel Outline */}
        <path d={vesselPath} fill="none" stroke="var(--vessel-outline, #f3f4f6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Top Flange */}
        <line x1={lx - overhang} y1={y_lid} x2={rx + overhang} y2={y_lid} stroke="var(--vessel-outline, #f3f4f6)" strokeWidth="4" strokeLinecap="round" />
        <rect x={cx - motor_w/2} y={y_motor_top} width={motor_w} height={motor_h} fill="none" stroke="var(--vessel-outline, #f3f4f6)" strokeWidth="2.5" />
        <line x1={cx - motor_w * 0.75} y1={y_motor_top} x2={cx + motor_w * 0.75} y2={y_motor_top} stroke="var(--vessel-outline, #f3f4f6)" strokeWidth="4" />

        {/* Baffles */}
        {bafflesElements}

        {/* Shaft */}
        <line x1={cx} y1={y_motor_top} x2={cx} y2={y_bottom_impeller} stroke="var(--vessel-shaft, #9ca3af)" strokeWidth={shaft_w_px} strokeLinecap="round" />

        {/* Impellers */}
        {stages_y.map((y_imp, idx) => {
          const blade_w = (d_px - hub_w_px) / 2;
          const disk_h = Math.max(1.5, b_px * 0.15);
          const hub_h = Math.max(b_px * 1.1, 6);
          return (
            <g key={idx}>
              {impellerType === 'flat-turbine' && (
                <rect x={cx - d_px * 0.37} y={y_imp - disk_h / 2} width={d_px * 0.74} height={disk_h} fill="var(--vessel-shaft, #d1d5db)" stroke="var(--vessel-shaft-stroke, #4b5563)" strokeWidth="1" />
              )}
              
              {impellerType === 'pitched-paddle' && (
                <>
                  <polygon points={`${cx - half_hub},${y_imp - b_px / 3} ${cx - half_hub - blade_w},${y_imp - b_px / 2} ${cx - half_hub - blade_w},${y_imp + b_px / 6} ${cx - half_hub},${y_imp + b_px / 3}`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                  <polygon points={`${cx + half_hub},${y_imp - b_px / 3} ${cx + half_hub + blade_w},${y_imp - b_px / 6} ${cx + half_hub + blade_w},${y_imp + b_px / 2} ${cx + half_hub},${y_imp + b_px / 3}`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                </>
              )}
              {impellerType === 'propeller' && (
                <>
                  <path d={`M ${cx - half_hub} ${y_imp} C ${cx - half_hub - blade_w / 2} ${y_imp - b_px / 2}, ${cx - half_hub - blade_w} ${y_imp - b_px / 4}, ${cx - half_hub - blade_w} ${y_imp} C ${cx - half_hub - blade_w} ${y_imp + b_px / 2}, ${cx - half_hub - blade_w / 2} ${y_imp}, ${cx - half_hub} ${y_imp} Z`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                  <path d={`M ${cx + half_hub} ${y_imp} C ${cx + half_hub + blade_w / 2} ${y_imp - b_px / 2}, ${cx + half_hub + blade_w} ${y_imp - b_px / 4}, ${cx + half_hub + blade_w} ${y_imp} C ${cx + half_hub + blade_w} ${y_imp + b_px / 2}, ${cx + half_hub + blade_w / 2} ${y_imp}, ${cx + half_hub} ${y_imp} Z`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                </>
              )}
              {impellerType === 'faudler' && (
                <>
                  <path d={`M ${cx - half_hub} ${y_imp - b_px / 4} Q ${cx - half_hub - blade_w / 2} ${y_imp - b_px / 2}, ${cx - half_hub - blade_w} ${y_imp} L ${cx - half_hub - blade_w} ${y_imp + b_px / 2} Q ${cx - half_hub - blade_w / 2} ${y_imp + b_px / 4}, ${cx - half_hub} ${y_imp + b_px / 4} Z`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                  <path d={`M ${cx + half_hub} ${y_imp - b_px / 4} Q ${cx + half_hub + blade_w / 2} ${y_imp - b_px / 2}, ${cx + half_hub + blade_w} ${y_imp} L ${cx + half_hub + blade_w} ${y_imp + b_px / 2} Q ${cx + half_hub + blade_w / 2} ${y_imp + b_px / 4}, ${cx + half_hub} ${y_imp + b_px / 4} Z`} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                </>
              )}
              {(impellerType === 'flat-paddle' || impellerType === 'flat-turbine') && (
                <>
                  <rect x={cx - half_hub - blade_w} y={y_imp - b_px / 2} width={blade_w} height={b_px} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                  <rect x={cx + half_hub} y={y_imp - b_px / 2} width={blade_w} height={b_px} fill="var(--vessel-impeller-fill, #ec4899)" stroke="var(--vessel-impeller-stroke, #db2777)" strokeWidth="1.5" />
                </>
              )}

              <rect x={cx - half_hub} y={y_imp - hub_h / 2} width={hub_w_px} height={hub_h} fill="var(--vessel-shaft, #9ca3af)" />
            </g>
          );
        })}

        {/* Dimensions Guides */}
        <g stroke="var(--vessel-guide, #06b6d4)" strokeWidth="1.2" strokeDasharray="3 3">
          {/* DT Guides */}
          <path d={`M ${lx} ${y_cyl_bottom} L ${lx} ${y_deepest + 55}`} fill="none" />
          <path d={`M ${rx} ${y_cyl_bottom} L ${rx} ${y_deepest + 55}`} fill="none" />
          <line x1={lx} y1={y_deepest + 45} x2={rx} y2={y_deepest + 45} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
          <text x={cx} y={y_deepest + 38} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="middle" fontWeight="bold" stroke="none">DT = {D_T.toFixed(3)} m</text>

          {/* H Guides */}
          <path d={`M ${rx} ${y_liquid} L 460 ${y_liquid}`} fill="none" />
          <path d={`M ${cx} ${y_deepest} L 460 ${y_deepest}`} fill="none" />
          <line x1="450" y1={y_liquid} x2="450" y2={y_deepest} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
          <text x="455" y={(y_liquid + y_deepest) / 2} fill="var(--vessel-guide, #06b6d4)" fontSize="11" transform={`rotate(90, 455, ${(y_liquid + y_deepest) / 2})`} style={{ textAnchor: 'middle', dominantBaseline: 'hanging' }} fontWeight="bold" stroke="none">H = {liquidHeight.toFixed(3)} m</text>

          {/* d Guide */}
          <path d={`M ${cx - d_px / 2} ${y_bottom_impeller} L ${cx - d_px / 2} ${y_bottom_impeller - b_px - 30}`} fill="none" />
          <path d={`M ${cx + d_px / 2} ${y_bottom_impeller} L ${cx + d_px / 2} ${y_bottom_impeller - b_px - 30}`} fill="none" />
          <line x1={cx - d_px / 2} y1={y_bottom_impeller - b_px - 20} x2={cx + d_px / 2} y2={y_bottom_impeller - b_px - 20} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
          <text x={cx} y={y_bottom_impeller - b_px - 26} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="middle" fontWeight="bold" stroke="none">d = {d.toFixed(3)} m</text>

          {/* C Guide */}
          <line x1={cx + 25} y1={y_bottom_impeller + b_px / 2} x2={cx + 25} y2={y_deepest} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
          <text x={cx + 35} y={(y_bottom_impeller + b_px / 2 + y_deepest) / 2 + 4} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="start" fontWeight="bold" stroke="none">C = {clearance.toFixed(3)} m</text>

          {/* b Guide */}
          <line x1={cx + d_px / 2 + 25} y1={y_bottom_impeller - b_px / 2} x2={cx + d_px / 2 + 25} y2={y_bottom_impeller + b_px / 2} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
          <text x={cx + d_px / 2 + 35} y={y_bottom_impeller + 4} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="start" fontWeight="bold" stroke="none">b = {b.toFixed(3)} m</text>

          {/* ΔH (Stage Gap) Guide */}
          {n_stages >= 2 && stages_y.length >= 2 && (
            <g>
              <line x1={cx - d_px / 2 - 25} y1={stages_y[0]} x2={cx - d_px / 2 - 25} y2={stages_y[1]} strokeDasharray="none" strokeWidth="1.5" markerStart="url(#arrow-start)" markerEnd="url(#arrow-end)" />
              <text x={cx - d_px / 2 - 35} y={(stages_y[0] + stages_y[1]) / 2 + 4} fill="var(--vessel-guide, #06b6d4)" fontSize="11" textAnchor="end" fontWeight="bold" stroke="none">
                ΔH = {((stages_y[0] - stages_y[1]) / scaleFactor).toFixed(3)} m
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};
