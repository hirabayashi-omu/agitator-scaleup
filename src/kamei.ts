export interface AgitatorParams {
  D_T: number;
  H: number;
  d: number;
  b: number;
  np: number;
  theta_deg: number;
  impellerType: 'pitched-paddle' | 'flat-paddle' | 'flat-turbine' | 'propeller' | 'faudler';
  baffled: boolean;
  B_w: number;
  n_B: number;
  n_stage: number;
  stage_gap?: number;
}

export function calculateKameiNp(params: AgitatorParams, Re: number): number {
  if (Re <= 0) return 0;
  const { D_T, H, d, b, np, theta_deg, impellerType, baffled, B_w, n_B, n_stage } = params;

  const theta = theta_deg * Math.PI / 180;
  const d_DT = d / D_T;

  // Unbaffled Np0 Calculation (Kamei-Hiraoka)
  const beta = (2 * Math.log(D_T / d)) / (D_T / d - d / D_T);
  const eta = (0.711 * (0.157 + Math.pow(np * Math.log(D_T / d), 0.611))) / (Math.pow(np, 0.52) * (1 - d_DT * d_DT));
  const gamma = Math.pow((eta * Math.log(D_T / d)) / Math.pow(beta * D_T / d, 5), 1 / 3);
  const X = (gamma * Math.pow(np, 0.7) * b * Math.pow(Math.sin(theta), 1.6)) / H;
  const V_d = (8 * Math.pow(d, 3)) / (D_T * D_T * H);
  
  const C_L = 0.215 * eta * np * (d / H) * (1 - d_DT * d_DT) + 1.83 * (b * Math.sin(theta) / H) * Math.pow(np / (2 * Math.sin(theta)), 1/3);
  const C_u = 23.8 * Math.pow(d_DT, -3.24) * Math.pow(b * Math.sin(theta) / D_T, -1.18) * Math.pow(X, -0.74);
  
  let C_t, m;
  if (impellerType === 'propeller' || impellerType === 'faudler') {
    C_t = Math.pow(Math.pow(3.0 * Math.pow(X, 1.5), -7.8) + Math.pow(0.25, -7.8), -1 / 7.8);
    m = Math.pow(Math.pow(0.8 * Math.pow(X, 0.373), -7.8) + Math.pow(0.333, -7.8), -1 / 7.8);
  } else {
    C_t = Math.pow(Math.pow(1.96 * Math.pow(X, 1.19), -7.8) + Math.pow(0.25, -7.8), -1 / 7.8);
    m = Math.pow(Math.pow(0.71 * Math.pow(X, 0.373), -7.8) + Math.pow(0.333, -7.8), -1 / 7.8);
  }

  const f_inf = 0.0151 * d_DT * Math.pow(C_t, 0.308);
  const Re_G = ((Math.PI * eta * Math.log(D_T / d)) / (4 * (d / (beta * D_T)))) * Re;
  
  const f = C_L / Re_G + C_t * Math.pow(1 / (C_u / Re_G + Re_G) + Math.pow(f_inf / C_t, 1 / m), m);
  const Np_0 = ((1.2 * Math.pow(Math.PI, 4) * beta * beta) / V_d) * f * n_stage;

  if (!baffled) {
    return Np_0;
  }

  // Baffled Np Calculation
  let NpMax1 = 0;
  if (impellerType === 'flat-paddle' || impellerType === 'flat-turbine') {
    const Y = Math.pow(np, 0.7) * (b / d);
    if (Y <= 0.54) NpMax1 = 10 * Math.pow(Y, 1.3);
    else if (Y <= 1.6) NpMax1 = 8.3 * Y;
    else NpMax1 = 10 * Math.pow(Y, 0.6);
  } else if (impellerType === 'pitched-paddle') {
    NpMax1 = 8.3 * Math.pow(2 * theta / Math.PI, 0.9) * (Math.pow(np, 0.7) * (b / d) * Math.pow(Math.sin(theta), 1.6));
  } else if (impellerType === 'propeller' || impellerType === 'faudler') {
    NpMax1 = 6.5 * Math.pow(Math.pow(np, 0.7) * (b / d) * Math.pow(Math.sin(theta), 1.6), 1.7);
  }

  const NpMax = NpMax1 * n_stage;
  
  let x = 0;
  if (impellerType === 'flat-paddle' || impellerType === 'flat-turbine') {
    x = (4.5 * (B_w / D_T) * Math.pow(n_B, 0.8)) / Math.pow(NpMax, 0.2) + Np_0 / NpMax;
  } else {
    x = (4.5 * (B_w / D_T) * Math.pow(n_B, 0.8)) / (Math.pow(2 * theta / Math.PI, 0.72) * Math.pow(NpMax, 0.2)) + Np_0 / NpMax;
  }
  
  const Np_baffled = NpMax * Math.pow(1 + Math.pow(x, -3), -1 / 3);

  // Boundary Condition
  return Math.max(Np_baffled, Np_0);
}

export interface KameiIntermediateVars {
  beta: number;
  eta: number;
  gamma: number;
  X: number;
  Ct: number;
  m: number;
  Cu: number;
  f_inf: number;
  CL: number;
  ReG_ratio: number;
  NpMax: number;
}

export function getKameiIntermediateVars(params: AgitatorParams): KameiIntermediateVars {
  const { D_T, H, d, b, np, theta_deg, impellerType, n_stage } = params;

  const theta = theta_deg * Math.PI / 180;
  const d_DT = d / D_T;

  const beta = (2 * Math.log(D_T / d)) / (D_T / d - d / D_T);
  const eta = (0.711 * (0.157 + Math.pow(np * Math.log(D_T / d), 0.611))) / (Math.pow(np, 0.52) * (1 - d_DT * d_DT));
  const gamma = Math.pow((eta * Math.log(D_T / d)) / Math.pow(beta * D_T / d, 5), 1 / 3);
  const X = (gamma * Math.pow(np, 0.7) * b * Math.pow(Math.sin(theta), 1.6)) / H;
  
  const C_L = 0.215 * eta * np * (d / H) * (1 - d_DT * d_DT) + 1.83 * (b * Math.sin(theta) / H) * Math.pow(np / (2 * Math.sin(theta)), 1/3);
  const C_u = 23.8 * Math.pow(d_DT, -3.24) * Math.pow(b * Math.sin(theta) / D_T, -1.18) * Math.pow(X, -0.74);
  
  let C_t, m;
  if (impellerType === 'propeller' || impellerType === 'faudler') {
    C_t = Math.pow(Math.pow(3.0 * Math.pow(X, 1.5), -7.8) + Math.pow(0.25, -7.8), -1 / 7.8);
    m = Math.pow(Math.pow(0.8 * Math.pow(X, 0.373), -7.8) + Math.pow(0.333, -7.8), -1 / 7.8);
  } else {
    C_t = Math.pow(Math.pow(1.96 * Math.pow(X, 1.19), -7.8) + Math.pow(0.25, -7.8), -1 / 7.8);
    m = Math.pow(Math.pow(0.71 * Math.pow(X, 0.373), -7.8) + Math.pow(0.333, -7.8), -1 / 7.8);
  }

  const f_inf = 0.0151 * d_DT * Math.pow(C_t, 0.308);
  const ReG_ratio = (Math.PI * eta * Math.log(D_T / d)) / (4 * (d / (beta * D_T)));

  let NpMax1 = 0;
  if (impellerType === 'flat-paddle' || impellerType === 'flat-turbine') {
    const Y = Math.pow(np, 0.7) * (b / d);
    if (Y <= 0.54) NpMax1 = 10 * Math.pow(Y, 1.3);
    else if (Y <= 1.6) NpMax1 = 8.3 * Y;
    else NpMax1 = 10 * Math.pow(Y, 0.6);
  } else if (impellerType === 'pitched-paddle') {
    NpMax1 = 8.3 * Math.pow(2 * theta / Math.PI, 0.9) * (Math.pow(np, 0.7) * (b / d) * Math.pow(Math.sin(theta), 1.6));
  } else if (impellerType === 'propeller' || impellerType === 'faudler') {
    NpMax1 = 6.5 * Math.pow(Math.pow(np, 0.7) * (b / d) * Math.pow(Math.sin(theta), 1.6), 1.7);
  }

  const NpMax = NpMax1 * n_stage;

  return {
    beta,
    eta,
    gamma,
    X,
    Ct: C_t,
    m,
    Cu: C_u,
    f_inf,
    CL: C_L,
    ReG_ratio,
    NpMax
  };
}
