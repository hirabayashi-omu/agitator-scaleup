import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceDot, ReferenceArea } from 'recharts';
import { Activity, Settings, Layers, Wrench, Droplet, Download, Upload, FileText } from 'lucide-react';
import { calculateKameiNp, getKameiIntermediateVars } from './kamei';
import type { AgitatorParams } from './kamei';
import { getLiquidHeight, HEAD_TYPES, getWettedArea } from './geometry';
import type { HeadType } from './geometry';
import { TankDiagram } from './components/TankDiagram';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const criteriaConfig = [
  { 
    id: 're', 
    label: '② Re一定 (レイノルズ数)', 
    beta: 2, 
    gamma: 1, 
    color: '#eab308',
    similarityTitle: 'Re 流動状態の相似',
    description: '流動状態を相似にする考え方であるが、スケールアップすると液体積あたりの撹拌所要動力P/Vが大幅に低下するため、液に十分なエネルギーを与えることが難しくなる。スケールアップの基準としては、あまり用いられない。'
  },
  { 
    id: 'fr', 
    label: '③ Fr一定 (フルード数)', 
    beta: 0.5, 
    gamma: -3.5, 
    color: '#a855f7',
    similarityTitle: 'Fr 波面挙動の相似',
    description: '渦流の寸法や形状を相似にする考え方である。邪魔板を用いない場合に相当するが、実際的ではないため、スケールアップの基準としては、あまり用いられない。'
  },
  { 
    id: 'pv', 
    label: '④ P/V一定 (単位動力)', 
    beta: 2/3, 
    gamma: -3, 
    color: '#2563eb',
    similarityTitle: 'P/V 単位体積の液に与える攪拌動力の相似',
    description: 'スケールアップの一般的な基準としてよく用いられる。ただし、撹拌がもたらす吐出作用(循環させる)とせん断作用(分散させる)の比率に差が生じることが問題である。'
  },
  { 
    id: 'u', 
    label: '⑤ u一定 (翼先端速度)', 
    beta: 1, 
    gamma: -2, 
    color: '#db2777',
    similarityTitle: 'u 翼先端速度（翼先端速度）相似',
    description: '液体積あたり撹拌所要動力P/V一定に次いでよく用いられる。とくに、気泡・液滴・微粒子の分散等、高いせん断力を要する場合に用いられる。'
  },
  { 
    id: 'n', 
    label: '⑥ n一定 (撹拌速度)', 
    beta: 0, 
    gamma: -5, 
    color: '#ea580c',
    similarityTitle: 'n 運動学的な相似',
    description: '混合時間をほぼ一定にすることができるが、スケールアップに伴い液体積あたりの撹拌所要動力P/Vが大幅に増大するため、かなり激しい撹拌が必要となる。'
  },
  { 
    id: 'qv', 
    label: '⑦ Q/V一定 (単位伝熱量)', 
    beta: -1, 
    gamma: -8, 
    color: '#16a34a',
    similarityTitle: 'Q/V 単位体積の液に与える伝熱量の相似',
    description: 'ジャケット内の伝熱媒体側から撹拌液側へ与えられる液体積あたりの伝熱量Q/Vをスケールアップの基準にする。スケールアップすると、液体積あたりの撹拌所要動力P/Vが大幅に増大するため、現実的ではない。'
  }
];

const ratioYVarConfig: Record<string, { label: string; axisLabel: string; shortName: string; key: string }> = {
  re: { label: '② Re比 (レイノルズ数)', axisLabel: 'レイノルズ数比 Re₂/Re₁ [-]', shortName: 'Re', key: 're' },
  fr: { label: '③ Fr比 (フルード数)', axisLabel: 'フルード数比 Fr₂/Fr₁ [-]', shortName: 'Fr', key: 'fr' },
  pv: { label: '④ P/V比 (単位動力)', axisLabel: '単位動力比 (P/V)₂/(P/V)₁ [-]', shortName: 'P/V', key: 'pv' },
  nd: { label: '⑤ u比 (翼先端速度)', axisLabel: '周速比 u₂/u₁ [-]', shortName: 'u', key: 'nd' },
  n: { label: '⑥ n比 (撹拌速度)', axisLabel: '回転数比 n₂/n₁ [-]', shortName: 'n', key: 'n' },
  qvHeat: { label: '⑦ 単位伝熱量比 (h·A/V)', axisLabel: '単位伝熱量比 (h·A/V)₂/(h·A/V)₁ [-]', shortName: 'Q/V', key: 'qvHeat' }
};

const scaleUpYVarConfig: Record<string, { label: string; axisLabel: string; shortName: string; key: string }> = {
  re: { label: '② Re (レイノルズ数)', axisLabel: 'レイノルズ数 Re [-]', shortName: 'Re', key: 're' },
  fr: { label: '③ Fr (フルード数)', axisLabel: 'フルード数 Fr [-]', shortName: 'Fr', key: 'fr' },
  pv: { label: '④ P/V (単位動力)', axisLabel: '単位動力 P/V [kW/m³]', shortName: 'P/V', key: 'pv' },
  nd: { label: '⑤ u (翼先端速度)', axisLabel: '翼先端速度 u [m/s]', shortName: 'u', key: 'nd' },
  n: { label: '⑥ n (回転数)', axisLabel: '回転数 n [rpm]', shortName: 'n', key: 'n' },
  qvHeat: { label: '⑦ 単位伝熱量 (h·A/V)', axisLabel: '単位伝熱量 h·A/V [W/(K·m³)]', shortName: 'Q/V', key: 'qvHeat' }
};

const formatNumber = (num: number) => {
  if (isNaN(num) || !isFinite(num)) return '-';
  if (num === 0) return '0';
  if (Math.abs(num) >= 1000) {
    return Math.round(num).toLocaleString('en-US');
  }
  return new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 4,
    useGrouping: false
  }).format(num);
};

const getLogMinorTicks = (domain: number[]) => {
  const ticks: number[] = [];
  if (!domain || domain.length < 2) return ticks;
  const minLog = Math.floor(Math.log10(domain[0]));
  const maxLog = Math.ceil(Math.log10(domain[1]));
  
  for (let i = minLog; i < maxLog; i++) {
    const base = Math.pow(10, i);
    for (let j = 2; j <= 9; j++) {
      const val = base * j;
      if (val >= domain[0] && val <= domain[1]) {
        ticks.push(val);
      }
    }
  }
  return ticks;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'scaleup' | 'ratio' | 'structure' | 'rushton' | 'table'>('scaleup');
  const [activeTankTab, setActiveTankTab] = useState<'tankA' | 'tankB'>('tankA');
  const [zoomFactor, setZoomFactor] = useState<number>(100);
  const [ratioYVarLeft, setRatioYVarLeft] = useState<string>('pv');
  const [ratioYVarRight, setRatioYVarRight] = useState<string>('n');
  const [scaleUpYVarLeft, setScaleUpYVarLeft] = useState<string>('pv');
  const [scaleUpYVarRight, setScaleUpYVarRight] = useState<string>('n');

  // ==========================================
  // Global Unified State (Tank A = Scale 1, Tank B = Scale 2)
  // ==========================================
  const [fluidDensity, setFluidDensity] = useState<number>(1000);
  const [fluidViscosity, setFluidViscosity] = useState<number>(1.0); // mPa.s

  const [tankA, setTankA] = useState({ 
    D: 0.5, H_T: 0.5, V: 98.17, d: 0.15, type: 'flat-turbine', headType: 'flat' as HeadType, C: 0.1, baffled: true, n: 300, pv: 1.0,
    b: 0.03, np: 6, theta_deg: 90, B_w: 0.05, n_B: 4, n_stage: 1 
  });
  const [tankB, setTankB] = useState({ 
    D: 5.0, H_T: 5.0, V: 98175.0, d: 1.5, type: 'pitched-paddle', headType: 'flat' as HeadType, C: 1.0, baffled: true,
    b: 0.3, np: 4, theta_deg: 45, B_w: 0.5, n_B: 4, n_stage: 1 
  });

  const [selectedCriteria, setSelectedCriteria] = useState<Record<string, boolean>>({
    pv: true,
    n: true
  });

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCheckboxChange = (id: string) => {
    setSelectedCriteria(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const saveConfiguration = () => {
    const configData = {
      fluidDensity,
      fluidViscosity,
      tankA,
      tankB,
      selectedCriteria,
      ratioYVarLeft,
      ratioYVarRight,
      scaleUpYVarLeft,
      scaleUpYVarRight
    };
    const jsonString = JSON.stringify(configData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stirred_tank_scaleup_config_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerLoadConfiguration = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const loadConfiguration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') return;
        const data = JSON.parse(text);
        
        if (data.fluidDensity !== undefined) setFluidDensity(Number(data.fluidDensity));
        if (data.fluidViscosity !== undefined) setFluidViscosity(Number(data.fluidViscosity));
        if (data.tankA) setTankA(prev => ({ ...prev, ...data.tankA }));
        if (data.tankB) setTankB(prev => ({ ...prev, ...data.tankB }));
        if (data.selectedCriteria) setSelectedCriteria(data.selectedCriteria);
        if (data.ratioYVarLeft) setRatioYVarLeft(data.ratioYVarLeft);
        if (data.ratioYVarRight) setRatioYVarRight(data.ratioYVarRight);
        if (data.scaleUpYVarLeft) setScaleUpYVarLeft(data.scaleUpYVarLeft);
        if (data.scaleUpYVarRight) setScaleUpYVarRight(data.scaleUpYVarRight);
        
        alert('設定ファイルを正常に読み込みました。');
      } catch (err) {
        alert('設定ファイルの読み込みに失敗しました。ファイル形式を確認してください。');
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const generatePdf = async () => {
    setIsGeneratingPdf(true);
    
    // Wait for React to render the offscreen templates and Recharts to draw SVGs
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pages = [
        'pdf-page-1',
        'pdf-page-2',
        'pdf-page-3',
        'pdf-page-4',
        'pdf-page-5',
        'pdf-page-6',
        'pdf-page-7'
      ];

      for (let i = 0; i < pages.length; i++) {
        const pageId = pages[i];
        const el = document.getElementById(pageId);
        if (!el) continue;

        if (i > 0) {
          doc.addPage();
        }

        const canvas = await html2canvas(el, {
          scale: 2, // High resolution capture
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Fit page width and clamp height to 297mm
        doc.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }

      doc.save(`stirred_tank_scaleup_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('PDFレポートの出力中にエラーが発生しました。');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleImpellerChange = (tank: any, setTank: any, newType: string) => {
    let updates: any = { type: newType };
    if (newType === 'pitched-paddle') updates = { ...updates, theta_deg: 45, np: 4 };
    else if (newType === 'flat-paddle') updates = { ...updates, theta_deg: 90, np: 2 };
    else if (newType === 'flat-turbine') updates = { ...updates, theta_deg: 90, np: 6 };
    else if (newType === 'propeller') updates = { ...updates, theta_deg: 20, np: 3 };
    else if (newType === 'faudler') updates = { ...updates, theta_deg: 45, np: 3 };
    setTank({ ...tank, ...updates });
  };

  // Derived Volumes and Heights
  const volA = tankA.V;
  const volB = tankB.V;
  const hA = useMemo(() => getLiquidHeight(tankA.D, tankA.V, tankA.headType), [tankA.D, tankA.V, tankA.headType]);
  const hB = useMemo(() => getLiquidHeight(tankB.D, tankB.V, tankB.headType), [tankB.D, tankB.V, tankB.headType]);

  const kameiVarsA = useMemo(() => {
    const safe_D_A = Math.max(tankA.D, 0.001);
    const safe_d_A = Math.min(Math.max(tankA.d, 0.001), safe_D_A * 0.99);
    const paramsA: AgitatorParams = {
      D_T: safe_D_A, H: Math.max(hA, 0.001), d: safe_d_A, b: Math.max(tankA.b, 0.001), np: Math.max(tankA.np, 1), theta_deg: tankA.theta_deg,
      impellerType: tankA.type as any, baffled: tankA.baffled, B_w: Math.max(tankA.B_w, 0.001), n_B: Math.max(tankA.n_B, 1), n_stage: Math.max(tankA.n_stage, 1)
    };
    return getKameiIntermediateVars(paramsA);
  }, [tankA, hA]);

  const kameiVarsB = useMemo(() => {
    const safe_D_B = Math.max(tankB.D, 0.001);
    const safe_d_B = Math.min(Math.max(tankB.d, 0.001), safe_D_B * 0.99);
    const paramsB: AgitatorParams = {
      D_T: safe_D_B, H: Math.max(hB, 0.001), d: safe_d_B, b: Math.max(tankB.b, 0.001), np: Math.max(tankB.np, 1), theta_deg: tankB.theta_deg,
      impellerType: tankB.type as any, baffled: tankB.baffled, B_w: Math.max(tankB.B_w, 0.001), n_B: Math.max(tankB.n_B, 1), n_stage: Math.max(tankB.n_stage, 1)
    };
    return getKameiIntermediateVars(paramsB);
  }, [tankB, hB]);

  // ==========================================
  // Unified Criteria Calculation Engine
  // ==========================================
  const criteriaResults = useMemo(() => {
    const mu_Pa_s = fluidViscosity * 1e-3;

    const getFlowNumber = (type: string) => {
      if (type === 'flat-turbine') return 0.75;
      if (type === 'propeller' || type === 'faudler') return 0.5;
      return 0.4; // default for pitched-paddle / flat-paddle / others
    };
    
    // Tank A (Scale 1)
    const N_A = Math.max(tankA.n, 0.1);
    const n_rps_A = N_A / 60;
    const safe_D_A = Math.max(tankA.D, 0.001);
    const safe_d_A = Math.min(Math.max(tankA.d, 0.001), safe_D_A * 0.99);
    const Re_A = (fluidDensity * n_rps_A * Math.pow(safe_d_A, 2)) / mu_Pa_s;
    const paramsA: AgitatorParams = {
      D_T: safe_D_A, H: Math.max(hA, 0.001), d: safe_d_A, b: Math.max(tankA.b, 0.001), np: Math.max(tankA.np, 1), theta_deg: tankA.theta_deg,
      impellerType: tankA.type as any, baffled: tankA.baffled, B_w: Math.max(tankA.B_w, 0.001), n_B: Math.max(tankA.n_B, 1), n_stage: Math.max(tankA.n_stage, 1)
    };
    const Np_A = calculateKameiNp(paramsA, Re_A);
    const P_A = Np_A * fluidDensity * Math.pow(n_rps_A, 3) * Math.pow(safe_d_A, 5);

    const Nq_A = getFlowNumber(tankA.type);
    const Q_A = Nq_A * n_rps_A * Math.pow(safe_d_A, 3);
    const qv_A = Q_A / (volA / 1000);

    const Fr_A = (n_rps_A * n_rps_A * safe_d_A) / 9.81;
    // Heat transfer: Bondy-Lippa jacket correlation Nu = 0.36 * Re^(2/3) * Pr^(1/3) * (D_T/d)
    // h = Nu * lambda / D_T;  Q = h * A_wetted * dT;  dT = constant (scale-invariant)
    const lambda_fluid = 0.6; // W/(m·K) water-like
    const Cp_fluid = 4182;    // J/(kg·K)
    const Pr_A = (fluidViscosity * 1e-3 * Cp_fluid) / lambda_fluid;
    const Nu_A = 0.36 * Math.pow(Re_A, 2/3) * Math.pow(Pr_A, 1/3);
    const h_A = Nu_A * lambda_fluid / safe_D_A; // W/(m²·K)
    const A_wet_A = getWettedArea(safe_D_A, Math.max(hA, 0.001), tankA.headType);
    const qvHeat_A = h_A * A_wet_A / (volA / 1000); // W/(m²·K) * m² / m³ = W/(K·m³)  [ΔT=1 normalized]

    const tankAData = {
      n: N_A,
      p: P_A,
      pv: P_A / volA, // kW/m3 (numerically W/L)
      d: safe_d_A * 1000,
      rho: fluidDensity,
      mu: fluidViscosity,
      re: Re_A,
      fr: Fr_A,
      nu: Nu_A,
      qvHeat: qvHeat_A,
      np: Np_A,
      npre: Np_A * Re_A,
      nd: Math.PI * n_rps_A * safe_d_A,
      qv: qv_A,
      tc: (volA / 1000) / Q_A,
      typeLabel: tankA.type === 'pitched-paddle' ? '傾斜パドル' : tankA.type === 'propeller' ? 'プロペラ' : tankA.type === 'flat-paddle' ? '平パドル' : tankA.type === 'flat-turbine' ? '平羽根タービン' : 'ファウドラー',
      flowPattern: (tankA.type === 'pitched-paddle' || tankA.type === 'propeller') ? '軸流型' : (tankA.type === 'faudler' ? '旋回流型' : '輻射流型')
    };

    // Tank B (Scale 2) parameters
    const safe_D_B = Math.max(tankB.D, 0.001);
    const safe_d_B = Math.min(Math.max(tankB.d, 0.001), safe_D_B * 0.99);
    const paramsB: AgitatorParams = {
      D_T: safe_D_B, H: Math.max(hB, 0.001), d: safe_d_B, b: Math.max(tankB.b, 0.001), np: Math.max(tankB.np, 1), theta_deg: tankB.theta_deg,
      impellerType: tankB.type as any, baffled: tankB.baffled, B_w: Math.max(tankB.B_w, 0.001), n_B: Math.max(tankB.n_B, 1), n_stage: Math.max(tankB.n_stage, 1)
    };

    const map: Record<string, any> = {};

    criteriaConfig.forEach(crit => {
      let N_B = N_A;
      if (crit.id === 'n') {
        N_B = N_A;
      } else if (crit.id === 're') {
        N_B = N_A * Math.pow(safe_d_A / safe_d_B, 2);
      } else if (crit.id === 'u') {
        N_B = N_A * (safe_d_A / safe_d_B);
      } else if (crit.id === 'fr') {
        N_B = N_A * Math.sqrt(safe_d_A / safe_d_B);
      } else if (crit.id === 'qv') {
        const lambda_fluid_b = 0.6;
        const Cp_fluid_b = 4182;
        const Pr_B = (fluidViscosity * 1e-3 * Cp_fluid_b) / lambda_fluid_b;
        const A_wet_B = getWettedArea(safe_D_B, Math.max(hB, 0.001), tankB.headType);
        const Re_B_1 = (fluidDensity * Math.pow(safe_d_B, 2)) / mu_Pa_s;
        const Nu_B_1 = 0.36 * Math.pow(Re_B_1, 2/3) * Math.pow(Pr_B, 1/3);
        const h_B_1 = Nu_B_1 * lambda_fluid_b / safe_D_B;
        const K_B = h_B_1 * A_wet_B / (volB / 1000);
        if (K_B > 0 && qvHeat_A > 0) {
          const n_rps_B = Math.pow(qvHeat_A / K_B, 1.5);
          N_B = n_rps_B * 60;
        } else {
          N_B = N_A;
        }
      } else if (crit.id === 'pv') {
        const targetPV = P_A / volA;
        let low = 0.1;
        let high = 10000.0;
        const targetP = targetPV * volB; // W
        for (let iter = 0; iter < 50; iter++) {
          const mid = (low + high) / 2;
          const n_rps = mid / 60;
          const Re = (fluidDensity * n_rps * Math.pow(safe_d_B, 2)) / mu_Pa_s;
          const Np = calculateKameiNp(paramsB, Re);
          const P = Np * fluidDensity * Math.pow(n_rps, 3) * Math.pow(safe_d_B, 5);
          if (P < targetP) {
            low = mid;
          } else {
            high = mid;
          }
        }
        N_B = (low + high) / 2;
      }

      const n_rps_B = N_B / 60;
      const Re_B = (fluidDensity * n_rps_B * Math.pow(safe_d_B, 2)) / mu_Pa_s;
      const Np_B = calculateKameiNp(paramsB, Re_B);
      const P_B = Np_B * fluidDensity * Math.pow(n_rps_B, 3) * Math.pow(safe_d_B, 5);

      const Nq_B_val = getFlowNumber(tankB.type);
      const Q_B = Nq_B_val * n_rps_B * Math.pow(safe_d_B, 3);
      const qv_B = Q_B / (volB / 1000);

      const Fr_B = (n_rps_B * n_rps_B * safe_d_B) / 9.81;
      const lambda_fluid_b = 0.6;
      const Cp_fluid_b = 4182;
      const Pr_B = (fluidViscosity * 1e-3 * Cp_fluid_b) / lambda_fluid_b;
      const Nu_B = 0.36 * Math.pow(Re_B, 2/3) * Math.pow(Pr_B, 1/3);
      const h_B = Nu_B * lambda_fluid_b / safe_D_B;
      const A_wet_B = getWettedArea(safe_D_B, Math.max(hB, 0.001), tankB.headType);
      const qvHeat_B = h_B * A_wet_B / (volB / 1000);

      map[crit.id] = {
        n: N_B,
        p: P_B,
        pv: P_B / volB,
        d: safe_d_B * 1000,
        rho: fluidDensity,
        mu: fluidViscosity,
        re: Re_B,
        fr: Fr_B,
        nu: Nu_B,
        qvHeat: qvHeat_B,
        np: Np_B,
        npre: Np_B * Re_B,
        nd: Math.PI * n_rps_B * safe_d_B,
        qv: qv_B,
        tc: (volB / 1000) / Q_B,
        typeLabel: tankB.type === 'pitched-paddle' ? '傾斜パドル' : tankB.type === 'propeller' ? 'プロペラ' : tankB.type === 'flat-paddle' ? '平パドル' : tankB.type === 'flat-turbine' ? '平羽根タービン' : 'ファウドラー',
        flowPattern: (tankB.type === 'pitched-paddle' || tankB.type === 'propeller') ? '軸流型' : (tankB.type === 'faudler' ? '旋回流型' : '輻射流型')
      };
    });

    return { tankA: tankAData, tankBMap: map };
  }, [tankA, tankB, volA, volB, hA, hB, fluidDensity, fluidViscosity]);

  // ==========================================
  // Scale-up Chart Data
  // ==========================================
  const xDomain = useMemo(() => {
    const min = Math.min(volA, volB) * 0.1;
    const max = Math.max(volA, volB) * 10;
    return [Math.pow(10, Math.floor(Math.log10(min || 1))), Math.pow(10, Math.ceil(Math.log10(max || 10)))];
  }, [volA, volB]);

  const { chartData: scaleUpChartData, yDomainLeft, yDomainRight } = useMemo(() => {
    const data = [];
    
    let minLeft = Infinity, maxLeft = -Infinity;
    let minRight = Infinity, maxRight = -Infinity;

    for (let i = Math.log10(xDomain[0]) * 10; i <= Math.log10(xDomain[1]) * 10; i += 2) {
      const v = Math.pow(10, i / 10);
      const dataPoint: any = { v: parseFloat(v.toPrecision(4)) };
      
      criteriaConfig.forEach(crit => {
        if (selectedCriteria[crit.id]) {
          const tA = criteriaResults.tankA;
          const tB = criteriaResults.tankBMap[crit.id];

          let leftVal, rightVal;
          if (Math.abs(volB - volA) < 1e-5) {
             leftVal = (tA as any)[scaleUpYVarLeft];
             rightVal = (tA as any)[scaleUpYVarRight];
          } else {
             const logV_ratio = Math.log(v / volA) / Math.log(volB / volA);
             
             const valA_left = (tA as any)[scaleUpYVarLeft] || 1;
             const valB_left = (tB as any)[scaleUpYVarLeft] || 1;
             leftVal = Math.exp(Math.log(valA_left) + logV_ratio * (Math.log(valB_left) - Math.log(valA_left)));

             const valA_right = (tA as any)[scaleUpYVarRight] || 1;
             const valB_right = (tB as any)[scaleUpYVarRight] || 1;
             rightVal = Math.exp(Math.log(valA_right) + logV_ratio * (Math.log(valB_right) - Math.log(valA_right)));
          }

          dataPoint[`${crit.id}_Left`] = leftVal;
          dataPoint[`${crit.id}_Right`] = rightVal;
          minLeft = Math.min(minLeft, leftVal);
          maxLeft = Math.max(maxLeft, leftVal);
          minRight = Math.min(minRight, rightVal);
          maxRight = Math.max(maxRight, rightVal);
        }
      });
      data.push(dataPoint);
    }
    
    if (minLeft === Infinity) { minLeft = 0.1; maxLeft = 100; }
    if (minRight === Infinity) { minRight = 10; maxRight = 1000; }
    
    minLeft = Math.pow(10, Math.floor(Math.log10(minLeft)));
    maxLeft = Math.pow(10, Math.ceil(Math.log10(maxLeft)));
    if (minLeft === maxLeft) { minLeft /= 10; maxLeft *= 10; }

    minRight = Math.pow(10, Math.floor(Math.log10(minRight)));
    maxRight = Math.pow(10, Math.ceil(Math.log10(maxRight)));
    const safe_D_A = Math.max(tankA.D, 0.001);
    const safe_d_A = Math.min(Math.max(tankA.d, 0.001), safe_D_A * 0.99);

    if (safe_D_A <= 0 || hA <= 0 || safe_d_A <= 0 || volA <= 0) return { chartData: [], yDomainLeft: [0.1, 10], yDomainRight: [10, 1000] };
    if (minRight === maxRight) { minRight /= 10; maxRight *= 10; }

    return { chartData: data, yDomainLeft: [minLeft, maxLeft], yDomainRight: [minRight, maxRight] };
  }, [volA, volB, xDomain, selectedCriteria, tankA.D, hA, tankA.d, criteriaResults, scaleUpYVarLeft, scaleUpYVarRight]);

  const logTicks = useMemo(() => {
    const xTicks = [];
    for (let i = Math.floor(Math.log10(xDomain[0])); i <= Math.ceil(Math.log10(xDomain[1])); i++) {
      for (let j = 1; j < 10; j++) {
        const val = j * Math.pow(10, i);
        if (val >= xDomain[0] && val <= xDomain[1]) xTicks.push(val);
      }
    }
    const yTicksLeft = [];
    for (let i = Math.floor(Math.log10(yDomainLeft[0])); i <= Math.ceil(Math.log10(yDomainLeft[1])); i++) {
      for (let j = 1; j < 10; j++) {
        const val = j * Math.pow(10, i);
        if (val >= yDomainLeft[0] && val <= yDomainLeft[1]) yTicksLeft.push(val);
      }
    }
    const yTicksRight = [];
    for (let i = Math.floor(Math.log10(yDomainRight[0])); i <= Math.ceil(Math.log10(yDomainRight[1])); i++) {
      for (let j = 1; j < 10; j++) {
        const val = j * Math.pow(10, i);
        if (val >= yDomainRight[0] && val <= yDomainRight[1]) yTicksRight.push(val);
      }
    }
    return { xTicks, yTicksLeft, yTicksRight };
  }, [xDomain, yDomainLeft, yDomainRight]);

  const scaleupMinorTicksX = useMemo(() => getLogMinorTicks(xDomain), [xDomain]);
  const scaleupMinorTicksYLeft = useMemo(() => getLogMinorTicks(yDomainLeft), [yDomainLeft]);

  // ==========================================
  // Scale Ratio Correlation Chart Data
  // ==========================================
  const ratioChartData = useMemo(() => {
    const data = [];
    const actualRatio = volB / volA;
    const maxRatio = Math.max(100, actualRatio);
    
    const steps = 60;
    const logMin = 0; // log10(1) = 0
    const logMax = Math.log10(maxRatio);
    const stepSize = (logMax - logMin) / steps;
    
    for (let i = 0; i <= steps; i++) {
      const x = Math.pow(10, logMin + i * stepSize);
      const dataPoint: any = { ratio: parseFloat(x.toPrecision(4)) };
      
      criteriaConfig.forEach(crit => {
        if (selectedCriteria[crit.id]) {
          const tA = criteriaResults.tankA;
          const tB = criteriaResults.tankBMap[crit.id];
          
          // Left ratio
          let yValLeft = 1.0;
          if (Math.abs(volB - volA) >= 1e-5) {
             const logV_ratio = Math.log(x) / Math.log(volB / volA);
             const valA = (tA as any)[ratioYVarLeft] || 1;
             const valB = (tB as any)[ratioYVarLeft] || 1;
             const yRatioEnd = valB / valA;
             if (yRatioEnd > 0) {
               yValLeft = Math.exp(logV_ratio * Math.log(yRatioEnd));
             }
          }
          dataPoint[`${crit.id}_Left`] = yValLeft;

          // Right ratio
          let yValRight = 1.0;
          if (Math.abs(volB - volA) >= 1e-5) {
             const logV_ratio = Math.log(x) / Math.log(volB / volA);
             const valA = (tA as any)[ratioYVarRight] || 1;
             const valB = (tB as any)[ratioYVarRight] || 1;
             const yRatioEnd = valB / valA;
             if (yRatioEnd > 0) {
               yValRight = Math.exp(logV_ratio * Math.log(yRatioEnd));
             }
          }
          dataPoint[`${crit.id}_Right`] = yValRight;
        }
      });
      data.push(dataPoint);
    }
    return data;
  }, [volA, volB, criteriaResults, selectedCriteria, ratioYVarLeft, ratioYVarRight]);

  const ratioXDomain = useMemo(() => {
    const actualRatio = volB / volA;
    return [1, Math.max(100, actualRatio)];
  }, [volA, volB]);

  const ratioYDomainLeft = useMemo(() => {
    let minY = 0.001;
    let maxY = 10000;

    criteriaConfig.forEach(crit => {
      if (selectedCriteria[crit.id]) {
        const tA = criteriaResults.tankA;
        const tB = criteriaResults.tankBMap[crit.id];
        const valA = (tA as any)[ratioYVarLeft] || 1;
        const valB = (tB as any)[ratioYVarLeft] || 1;
        const yRatioEnd = valB / valA;
        
        let yValAt100 = 1.0;
        if (Math.abs(volB - volA) >= 1e-5 && yRatioEnd > 0) {
           const logV_ratio = Math.log(100) / Math.log(volB / volA);
           yValAt100 = Math.exp(logV_ratio * Math.log(yRatioEnd));
        }

        const vals = [yRatioEnd, yValAt100];
        vals.forEach(yVal => {
          if (isFinite(yVal) && yVal > 0) {
            if (yVal < minY) minY = yVal;
            if (yVal > maxY) maxY = yVal;
          }
        });
      }
    });

    const floorLog = Math.floor(Math.log10(minY));
    const ceilLog = Math.ceil(Math.log10(maxY));
    return [Math.pow(10, floorLog), Math.pow(10, ceilLog)];
  }, [volA, volB, selectedCriteria, criteriaResults, ratioYVarLeft]);

  const ratioYDomainRight = useMemo(() => {
    let minY = 0.001;
    let maxY = 10000;

    criteriaConfig.forEach(crit => {
      if (selectedCriteria[crit.id]) {
        const tA = criteriaResults.tankA;
        const tB = criteriaResults.tankBMap[crit.id];
        const valA = (tA as any)[ratioYVarRight] || 1;
        const valB = (tB as any)[ratioYVarRight] || 1;
        const yRatioEnd = valB / valA;
        
        let yValAt100 = 1.0;
        if (Math.abs(volB - volA) >= 1e-5 && yRatioEnd > 0) {
           const logV_ratio = Math.log(100) / Math.log(volB / volA);
           yValAt100 = Math.exp(logV_ratio * Math.log(yRatioEnd));
        }

        const vals = [yRatioEnd, yValAt100];
        vals.forEach(yVal => {
          if (isFinite(yVal) && yVal > 0) {
            if (yVal < minY) minY = yVal;
            if (yVal > maxY) maxY = yVal;
          }
        });
      }
    });

    const floorLog = Math.floor(Math.log10(minY));
    const ceilLog = Math.ceil(Math.log10(maxY));
    return [Math.pow(10, floorLog), Math.pow(10, ceilLog)];
  }, [volA, volB, selectedCriteria, criteriaResults, ratioYVarRight]);

  const ratioTicks = useMemo(() => {
    const xTicks = [];
    const maxRatio = ratioXDomain[1];
    const logMax = Math.ceil(Math.log10(maxRatio));
    for (let i = 0; i <= logMax; i++) {
      const base = Math.pow(10, i);
      if (base <= maxRatio) xTicks.push(base);
      if (base * 2 <= maxRatio) xTicks.push(base * 2);
      if (base * 5 <= maxRatio) xTicks.push(base * 5);
    }
    const uniqueXTicks = Array.from(new Set(xTicks)).sort((a, b) => a - b);
    
    const yTicksLeft = [];
    const yMinLogL = Math.round(Math.log10(ratioYDomainLeft[0]));
    const yMaxLogL = Math.round(Math.log10(ratioYDomainLeft[1]));
    for (let i = yMinLogL; i <= yMaxLogL; i++) {
      yTicksLeft.push(Math.pow(10, i));
    }

    const yTicksRight = [];
    const yMinLogR = Math.round(Math.log10(ratioYDomainRight[0]));
    const yMaxLogR = Math.round(Math.log10(ratioYDomainRight[1]));
    for (let i = yMinLogR; i <= yMaxLogR; i++) {
      yTicksRight.push(Math.pow(10, i));
    }
    
    return { xTicks: uniqueXTicks, yTicksLeft, yTicksRight };
  }, [ratioXDomain, ratioYDomainLeft, ratioYDomainRight]);

  const ratioMinorTicksX = useMemo(() => getLogMinorTicks(ratioXDomain), [ratioXDomain]);
  const ratioMinorTicksYLeft = useMemo(() => getLogMinorTicks(ratioYDomainLeft), [ratioYDomainLeft]);
  const ratioMinorTicksYRight = useMemo(() => getLogMinorTicks(ratioYDomainRight), [ratioYDomainRight]);

  // ==========================================
  // Rushton Diagram Chart Data
  // ==========================================
  // ==========================================


  const rushtonOperatingPoints = useMemo(() => {
    const points: any[] = [];
    
    // Tank A (Scale 1) point
    const tA = criteriaResults.tankA;
    if (isFinite(tA.re) && isFinite(tA.np) && tA.re > 0 && tA.np > 0) {
      points.push({ id: 'tankA', Re: tA.re, Np: tA.np, label: 'Tank A', color: 'var(--accent-orange)', offset: 10 });
    }

    let bIdx = 0;
    // Tank B (Scale 2) points for each criteria
    criteriaConfig.forEach(crit => {
      if (selectedCriteria[crit.id]) {
        const tB = criteriaResults.tankBMap[crit.id];
        if (isFinite(tB.re) && isFinite(tB.np) && tB.re > 0 && tB.np > 0) {
          const staggerOffset = 10 + (bIdx % 3) * 15;
          points.push({ id: `tankB_${crit.id}`, Re: tB.re, Np: tB.np, label: `Tank B (${crit.label.split(' ')[1]})`, color: crit.color, offset: staggerOffset });
          bIdx++;
        }
      }
    });
    
    return points;
  }, [criteriaResults, selectedCriteria]);

  const comparativeTableData = useMemo(() => {
    const columns: any[] = [];
    criteriaConfig.forEach(crit => {
      if (selectedCriteria[crit.id]) {
        columns.push({
          label: crit.label.split(' ')[1],
          color: crit.color,
          data: criteriaResults.tankBMap[crit.id]
        });
      }
    });
    return { tankA: criteriaResults.tankA, columns };
  }, [criteriaResults, selectedCriteria]);

  const rushtonDomain = useMemo(() => {
    let minRe = 1;
    let maxRe = 1000000;
    let minNp = 0.1;
    let maxNp = 1000;

    rushtonOperatingPoints.forEach(pt => {
      if (pt.Re > maxRe) maxRe = Math.pow(10, Math.ceil(Math.log10(pt.Re)));
      if (pt.Re < minRe) minRe = Math.pow(10, Math.floor(Math.log10(pt.Re)));
      if (pt.Np > maxNp) maxNp = Math.pow(10, Math.ceil(Math.log10(pt.Np)));
      if (pt.Np < minNp) minNp = Math.pow(10, Math.floor(Math.log10(pt.Np)));
    });
    return { x: [minRe, maxRe], y: [minNp, maxNp] };
  }, [rushtonOperatingPoints]);

  const rushtonTicks = useMemo(() => {
    const xTicks = [];
    for (let i = Math.floor(Math.log10(rushtonDomain.x[0])); i <= Math.ceil(Math.log10(rushtonDomain.x[1])); i++) {
      for (let j = 1; j < 10; j++) {
        const val = j * Math.pow(10, i);
        if (val >= rushtonDomain.x[0] && val <= rushtonDomain.x[1]) xTicks.push(val);
      }
    }
    const yTicks = [];
    for (let i = Math.floor(Math.log10(rushtonDomain.y[0])); i <= Math.ceil(Math.log10(rushtonDomain.y[1])); i++) {
      for (let j = 1; j < 10; j++) {
        const val = j * Math.pow(10, i);
        if (val >= rushtonDomain.y[0] && val <= rushtonDomain.y[1]) yTicks.push(val);
      }
    }
    return { xTicks, yTicks };
  }, [rushtonDomain]);

  const rushtonMinorTicksX = useMemo(() => getLogMinorTicks(rushtonDomain.x), [rushtonDomain.x]);
  const rushtonMinorTicksY = useMemo(() => getLogMinorTicks(rushtonDomain.y), [rushtonDomain.y]);

  const rushtonChartData = useMemo(() => {
    const data = [];
    const minLogRe = Math.floor(Math.log10(rushtonDomain.x[0]));
    const maxLogRe = Math.ceil(Math.log10(rushtonDomain.x[1]));
    
    const safe_D_A = Math.max(tankA.D, 0.001);
    const safe_d_A = Math.min(Math.max(tankA.d, 0.001), safe_D_A * 0.99);
    const safe_D_B = Math.max(tankB.D, 0.001);
    const safe_d_B = Math.min(Math.max(tankB.d, 0.001), safe_D_B * 0.99);

    for (let i = minLogRe * 10; i <= maxLogRe * 10; i += 1) {
      const Re = Math.pow(10, i / 10);
      const dataPoint: any = { Re: parseFloat(Re.toPrecision(4)) };

      const paramsA: AgitatorParams = {
        D_T: safe_D_A, H: Math.max(hA, 0.001), d: safe_d_A, b: Math.max(tankA.b, 0.001), np: Math.max(tankA.np, 1), theta_deg: tankA.theta_deg,
        impellerType: tankA.type as any, baffled: tankA.baffled, B_w: Math.max(tankA.B_w, 0.001), n_B: Math.max(tankA.n_B, 1), n_stage: Math.max(tankA.n_stage, 1)
      };
      dataPoint.NpA = calculateKameiNp(paramsA, Re);

      const paramsB: AgitatorParams = {
        D_T: safe_D_B, H: Math.max(hB, 0.001), d: safe_d_B, b: Math.max(tankB.b, 0.001), np: Math.max(tankB.np, 1), theta_deg: tankB.theta_deg,
        impellerType: tankB.type as any, baffled: tankB.baffled, B_w: Math.max(tankB.B_w, 0.001), n_B: Math.max(tankB.n_B, 1), n_stage: Math.max(tankB.n_stage, 1)
      };
      dataPoint.NpB = calculateKameiNp(paramsB, Re);

      data.push(dataPoint);
    }
    return data;
  }, [tankA, tankB, hA, hB, fluidDensity, fluidViscosity, rushtonDomain.x]);

  return (
    <div className="app-container">
      
      {/* HEADER & TABS */}
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>攪拌槽スケールアップ解析システム</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => setActiveTab('scaleup')} style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, backgroundColor: activeTab === 'scaleup' ? 'var(--accent-blue)' : 'var(--panel-bg)', color: 'white' }}>
            ① スケールアップ比較
          </button>
          <button onClick={() => setActiveTab('ratio')} style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, backgroundColor: activeTab === 'ratio' ? 'var(--accent-pink)' : 'var(--panel-bg)', color: 'white' }}>
            ② スケール比相関図
          </button>
          <button onClick={() => setActiveTab('structure')} style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, backgroundColor: activeTab === 'structure' ? 'var(--accent-green)' : 'var(--panel-bg)', color: 'white' }}>
            ③ タンク構造比較
          </button>
          <button onClick={() => setActiveTab('rushton')} style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, backgroundColor: activeTab === 'rushton' ? 'var(--accent-orange)' : 'var(--panel-bg)', color: 'white' }}>
            ④ 動力特性解析 (ラシュトン線図)
          </button>
          <button onClick={() => setActiveTab('table')} style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600, backgroundColor: activeTab === 'table' ? 'var(--accent-yellow)' : 'var(--panel-bg)', color: 'white' }}>
            ⑤ 推算結果比較表
          </button>
          
          <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 0.5rem' }}></div>
          
          <button 
            onClick={generatePdf} 
            disabled={isGeneratingPdf}
            style={{ 
              padding: '0.5rem 1.25rem', 
              borderRadius: '4px', 
              border: '1px solid var(--accent-blue)', 
              cursor: 'pointer', 
              fontWeight: 600, 
              backgroundColor: isGeneratingPdf ? 'rgba(59, 130, 246, 0.2)' : 'var(--accent-blue)', 
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s'
            }}
          >
            <FileText size={16} /> 
            {isGeneratingPdf ? 'PDF生成中...' : 'PDFレポート出力'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', height: '100%', overflow: 'hidden' }}>
        {/* LEFT SIDEBAR: GLOBAL INPUTS */}
        <div style={{ flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '10px' }}>
          
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
              <Droplet size={20} color="var(--accent-blue)" /> 共通データ
            </h2>
            <div className="input-group">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="input-field" style={{ flex: 1 }}>
                  <label>液密度 ρ (kg/m³)</label>
                  <input type="number" value={fluidDensity} onChange={e => setFluidDensity(Number(e.target.value))} />
                </div>
                <div className="input-field" style={{ flex: 1 }}>
                  <label>液粘度 μ (mPa·s)</label>
                  <input type="number" value={fluidViscosity} onChange={e => setFluidViscosity(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* 設定の保存・読込機能 */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.25rem' }}>
              <button 
                onClick={saveConfiguration} 
                style={{ 
                  flex: 1, 
                  padding: '0.55rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--accent-blue)', 
                  background: 'rgba(37, 99, 235, 0.1)', 
                  color: 'white', 
                  cursor: 'pointer', 
                  fontWeight: 600, 
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s'
                }}
                className="btn-save"
              >
                <Download size={14} /> 設定保存
              </button>
              <button 
                onClick={triggerLoadConfiguration} 
                style={{ 
                  flex: 1, 
                  padding: '0.55rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--panel-border)', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  color: 'white', 
                  cursor: 'pointer', 
                  fontWeight: 600, 
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s'
                }}
                className="btn-load"
              >
                <Upload size={14} /> 設定読込
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={loadConfiguration} 
                style={{ display: 'none' }} 
                accept=".json" 
              />
            </div>
          </div>

          {/* TANK TABS */}
          <div style={{ display: 'flex', gap: '0.4rem', padding: '0.3rem', backgroundColor: 'rgba(15, 23, 42, 0.4)', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
            <button 
              onClick={() => setActiveTankTab('tankA')} 
              style={{ 
                flex: 1, 
                padding: '0.6rem 0.5rem', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 600, 
                fontSize: '0.9rem',
                backgroundColor: activeTankTab === 'tankA' ? 'rgba(249, 115, 22, 0.15)' : 'transparent', 
                border: activeTankTab === 'tankA' ? '1px solid var(--accent-orange)' : '1px solid transparent',
                color: activeTankTab === 'tankA' ? 'var(--accent-orange)' : 'var(--text-secondary)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
            >
              <Settings size={16} /> Tank A (Scale 1)
            </button>
            <button 
              onClick={() => setActiveTankTab('tankB')} 
              style={{ 
                flex: 1, 
                padding: '0.6rem 0.5rem', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 600, 
                fontSize: '0.9rem',
                backgroundColor: activeTankTab === 'tankB' ? 'rgba(16, 185, 129, 0.15)' : 'transparent', 
                border: activeTankTab === 'tankB' ? '1px solid var(--accent-green)' : '1px solid transparent',
                color: activeTankTab === 'tankB' ? 'var(--accent-green)' : 'var(--text-secondary)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
            >
              <Activity size={16} /> Tank B (Scale 2)
            </button>
          </div>

          {activeTankTab === 'tankA' ? (
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-orange)', padding: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
                <Settings size={20} color="var(--accent-orange)" /> Tank A (Scale 1)
              </h2>
              <div className="input-group">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="input-field">
                    <label>槽径 D (m)</label>
                    <input type="number" value={tankA.D} onChange={e => setTankA({...tankA, D: Number(e.target.value)})} step="0.1" />
                  </div>
                  <div className="input-field">
                    <label>円筒部高さ H_T (m)</label>
                    <input type="number" value={tankA.H_T} onChange={e => setTankA({...tankA, H_T: Number(e.target.value)})} step="0.1" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="input-field">
                    <label>液量 V (L)</label>
                    <input type="number" value={tankA.V} onChange={e => setTankA({...tankA, V: Number(e.target.value)})} step="1" />
                  </div>
                  <div className="input-field">
                    <label>液深 H (m) <span style={{fontSize:'0.8em', color:'var(--text-secondary)'}}>[推算値]</span></label>
                    <input type="number" value={hA.toFixed(3)} readOnly style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }} title="液量と鏡板形状から自動推算されます" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                  <div className="input-field">
                    <label>鏡板の種類</label>
                    <select value={tankA.headType} onChange={e => setTankA({...tankA, headType: e.target.value as HeadType})} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}>
                      {HEAD_TYPES.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                  <div className="input-field">
                    <label>クリアランス C (m)</label>
                    <input type="number" value={tankA.C} onChange={e => setTankA({...tankA, C: Number(e.target.value)})} step="0.01" />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                  <div className="input-field" style={{ flex: 1 }}>
                    <label>翼径 d (m)</label>
                    <input type="number" value={tankA.d} onChange={e => setTankA({...tankA, d: Number(e.target.value)})} step="0.05" />
                  </div>
                  <div className="input-field" style={{ flex: 1 }}>
                    <label>翼種</label>
                    <select value={tankA.type} onChange={e => handleImpellerChange(tankA, setTankA, e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}>
                      <option value="pitched-paddle">傾斜パドル</option>
                      <option value="flat-paddle">平板パドル</option>
                      <option value="flat-turbine">平板タービン</option>
                      <option value="propeller">プロペラ</option>
                      <option value="faudler">ファウドラー</option>
                    </select>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <div className="input-field">
                    <label>翼幅 b (m)</label>
                    <input type="number" value={tankA.b} onChange={e => setTankA({...tankA, b: Number(e.target.value)})} step="0.01" />
                  </div>
                  <div className="input-field">
                    <label>翼枚数 np</label>
                    <input type="number" value={tankA.np} onChange={e => setTankA({...tankA, np: Number(e.target.value)})} step="1" />
                  </div>
                  <div className="input-field">
                    <label>角度 θ (°)</label>
                    <input 
                      type="number" 
                      value={tankA.theta_deg} 
                      onChange={e => setTankA({...tankA, theta_deg: Number(e.target.value)})} 
                      step="1" 
                      disabled={tankA.type === 'flat-paddle' || tankA.type === 'flat-turbine'}
                    />
                  </div>
                </div>

                <label className="checkbox-item active" style={{ display: 'flex', alignItems: 'center', marginTop: '1rem' }}>
                  <input type="checkbox" checked={tankA.baffled} onChange={e => setTankA({...tankA, baffled: e.target.checked})} />
                  <span style={{ marginLeft: '0.5rem' }}>邪魔板あり</span>
                </label>
                
                {tankA.baffled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', marginLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
                    <div className="input-field">
                      <label>邪魔板幅 Bw (m)</label>
                      <input type="number" value={tankA.B_w} onChange={e => setTankA({...tankA, B_w: Number(e.target.value)})} step="0.01" />
                    </div>
                    <div className="input-field">
                      <label>邪魔板枚数 nB</label>
                      <input type="number" value={tankA.n_B} onChange={e => setTankA({...tankA, n_B: Number(e.target.value)})} step="1" />
                    </div>
                  </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '1rem 0' }} />
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div className="input-field">
                    <label>運転 P/V (kW/m³)</label>
                    <input type="number" value={tankA.pv} onChange={e => setTankA({...tankA, pv: Number(e.target.value)})} step="0.1" />
                  </div>
                  <div className="input-field">
                    <label>回転数 n (rpm)</label>
                    <input type="number" value={tankA.n} onChange={e => setTankA({...tankA, n: Number(e.target.value)})} step="1" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-green)', padding: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
                <Activity size={20} color="var(--accent-green)" /> Tank B (Scale 2)
              </h2>
              <div className="input-group">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="input-field">
                    <label>槽径 D (m)</label>
                    <input type="number" value={tankB.D} onChange={e => setTankB({...tankB, D: Number(e.target.value)})} step="0.1" />
                  </div>
                  <div className="input-field">
                    <label>円筒部高さ H_T (m)</label>
                    <input type="number" value={tankB.H_T} onChange={e => setTankB({...tankB, H_T: Number(e.target.value)})} step="0.1" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="input-field">
                    <label>液量 V (L)</label>
                    <input type="number" value={tankB.V} onChange={e => setTankB({...tankB, V: Number(e.target.value)})} step="1" />
                  </div>
                  <div className="input-field">
                    <label>液深 H (m) <span style={{fontSize:'0.8em', color:'var(--text-secondary)'}}>[推算値]</span></label>
                    <input type="number" value={hB.toFixed(3)} readOnly style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }} title="液量と鏡板形状から自動推算されます" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                  <div className="input-field">
                    <label>鏡板の種類</label>
                    <select value={tankB.headType} onChange={e => setTankB({...tankB, headType: e.target.value as HeadType})} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}>
                      {HEAD_TYPES.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                  <div className="input-field">
                    <label>クリアランス C (m)</label>
                    <input type="number" value={tankB.C} onChange={e => setTankB({...tankB, C: Number(e.target.value)})} step="0.01" />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                  <div className="input-field" style={{ flex: 1 }}>
                    <label>翼径 d (m)</label>
                    <input type="number" value={tankB.d} onChange={e => setTankB({...tankB, d: Number(e.target.value)})} step="0.05" />
                  </div>
                  <div className="input-field" style={{ flex: 1 }}>
                    <label>翼種</label>
                    <select value={tankB.type} onChange={e => handleImpellerChange(tankB, setTankB, e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)', color: 'white' }}>
                      <option value="pitched-paddle">傾斜パドル</option>
                      <option value="flat-paddle">平板パドル</option>
                      <option value="flat-turbine">平板タービン</option>
                      <option value="propeller">プロペラ</option>
                      <option value="faudler">ファウドラー</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <div className="input-field">
                    <label>翼幅 b (m)</label>
                    <input type="number" value={tankB.b} onChange={e => setTankB({...tankB, b: Number(e.target.value)})} step="0.01" />
                  </div>
                  <div className="input-field">
                    <label>翼枚数 np</label>
                    <input type="number" value={tankB.np} onChange={e => setTankB({...tankB, np: Number(e.target.value)})} step="1" />
                  </div>
                  <div className="input-field">
                    <label>角度 θ (°)</label>
                    <input 
                      type="number" 
                      value={tankB.theta_deg} 
                      onChange={e => setTankB({...tankB, theta_deg: Number(e.target.value)})} 
                      step="1" 
                      disabled={tankB.type === 'flat-paddle' || tankB.type === 'flat-turbine'}
                    />
                  </div>
                </div>

                <label className="checkbox-item active" style={{ display: 'flex', alignItems: 'center', marginTop: '1rem' }}>
                  <input type="checkbox" checked={tankB.baffled} onChange={e => setTankB({...tankB, baffled: e.target.checked})} />
                  <span style={{ marginLeft: '0.5rem' }}>邪魔板あり</span>
                </label>

                {tankB.baffled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem', marginLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
                    <div className="input-field">
                      <label>邪魔板幅 Bw (m)</label>
                      <input type="number" value={tankB.B_w} onChange={e => setTankB({...tankB, B_w: Number(e.target.value)})} step="0.01" />
                    </div>
                    <div className="input-field">
                      <label>邪魔板枚数 nB</label>
                      <input type="number" value={tankB.n_B} onChange={e => setTankB({...tankB, n_B: Number(e.target.value)})} step="1" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* RIGHT CONTENT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
          
          <div className="glass-panel" style={{ flex: '0 0 auto' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
              <Layers size={20} color="var(--text-primary)" /> 比較するスケールアップ基準 (Tank Bへ適用)
            </h2>
            <div className="checkbox-grid">
              {criteriaConfig.map(crit => (
                <label key={crit.id} className={`checkbox-item ${selectedCriteria[crit.id] ? 'active' : ''}`}>
                  <input type="checkbox" checked={!!selectedCriteria[crit.id]} onChange={() => handleCheckboxChange(crit.id)} />
                  <span style={{ color: crit.color }}>{crit.label}</span>
                  <div className={`checkbox-tooltip ${crit.id === 're' || crit.id === 'u' ? 'tooltip-left' : crit.id === 'pv' || crit.id === 'qv' ? 'tooltip-right' : 'tooltip-center'}`}>
                    <div className="tooltip-title" style={{ borderLeft: `3px solid ${crit.color}` }}>
                      {crit.similarityTitle}
                    </div>
                    <div className="tooltip-description">
                      {crit.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {activeTab === 'scaleup' && (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0 }}>スケールアップ挙動グラフ</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.2rem 0 0 0' }}>
                    実線（左軸基準）：{scaleUpYVarConfig[scaleUpYVarLeft].label.split(' ')[1]} ／ 破線（右軸基準）：{scaleUpYVarConfig[scaleUpYVarRight].label.split(' ')[1]} の運転スケール依存性を示します。
                  </p>
                </div>
                {/* 左右Y軸変数切り替え */}
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 左軸選択 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>左軸(実線):</span>
                    <div style={{ display: 'flex', gap: '0.15rem', padding: '0.15rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                      {Object.entries(scaleUpYVarConfig).map(([key, cfg]) => (
                        <button
                          key={`left-${key}`}
                          onClick={() => setScaleUpYVarLeft(key)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            backgroundColor: scaleUpYVarLeft === key ? 'var(--accent-blue)' : 'transparent',
                            color: scaleUpYVarLeft === key ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {cfg.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 右軸選択 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>右軸(破線):</span>
                    <div style={{ display: 'flex', gap: '0.15rem', padding: '0.15rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                      {Object.entries(scaleUpYVarConfig).map(([key, cfg]) => (
                        <button
                          key={`right-${key}`}
                          onClick={() => setScaleUpYVarRight(key)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            backgroundColor: scaleUpYVarRight === key ? 'var(--accent-orange)' : 'transparent',
                            color: scaleUpYVarRight === key ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {cfg.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="chart-container" style={{ width: '100%', height: '400px', minHeight: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scaleUpChartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" vertical={true} horizontal={true} />
                    
                    {scaleupMinorTicksX.map(tick => (
                      <ReferenceLine key={`scaleup-minor-x-${tick}`} yAxisId="left" x={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    {scaleupMinorTicksYLeft.map(tick => (
                      <ReferenceLine key={`scaleup-minor-y-left-${tick}`} yAxisId="left" y={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    
                    <XAxis dataKey="v" scale="log" domain={xDomain} type="number" allowDataOverflow={true} ticks={logTicks.xTicks} interval={0} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickMargin={8} tickSize={5} tickLine={{ stroke: 'var(--text-secondary)' }} label={{ value: '運転液量 V [Liter]', position: 'insideBottom', offset: -15, fill: 'var(--text-secondary)', fontSize: 14 }} />
                    
                    <YAxis yAxisId="left" scale="log" domain={yDomainLeft} type="number" allowDataOverflow={true} ticks={logTicks.yTicksLeft} interval={0} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickMargin={8} tickSize={5} tickLine={{ stroke: 'var(--text-secondary)' }} label={{ value: scaleUpYVarConfig[scaleUpYVarLeft].axisLabel, angle: -90, position: 'insideLeft', offset: -10, fill: 'var(--text-secondary)', fontSize: 14 }} />
                    <YAxis yAxisId="right" orientation="right" scale="log" domain={yDomainRight} type="number" allowDataOverflow={true} ticks={logTicks.yTicksRight} interval={0} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickMargin={8} tickSize={5} tickLine={{ stroke: 'var(--text-secondary)' }} label={{ value: scaleUpYVarConfig[scaleUpYVarRight].axisLabel, angle: 90, position: 'insideRight', offset: -10, fill: 'var(--text-secondary)', fontSize: 14 }} />

                    <ReferenceLine yAxisId="left" y={yDomainLeft[1]} stroke="var(--panel-border)" strokeWidth={1} />

                    <ReferenceLine yAxisId="left" x={volA} stroke="var(--accent-orange)" strokeWidth={2} strokeDasharray="5 5" opacity={0.8} label={{ value: 'Tank A', position: 'insideBottomRight', fill: 'var(--accent-orange)', fontSize: 13, offset: 10, fontWeight: 'bold' }} />
                    <ReferenceLine yAxisId="left" x={volB} stroke="var(--accent-green)" strokeWidth={2} strokeDasharray="5 5" opacity={0.8} label={{ value: 'Tank B', position: 'insideBottomLeft', fill: 'var(--accent-green)', fontSize: 13, offset: 10, fontWeight: 'bold' }} />

                    <ReferenceDot x={volA} y={(criteriaResults.tankA as any)[scaleUpYVarLeft]} yAxisId="left" r={6} fill="#fff" stroke="var(--accent-orange)" strokeWidth={2.5} />
                    <ReferenceDot x={volA} y={(criteriaResults.tankA as any)[scaleUpYVarRight]} yAxisId="right" r={6} fill="#fff" stroke="var(--accent-orange)" strokeWidth={2.5} />

                     {criteriaConfig.map(crit => {
                      if (!selectedCriteria[crit.id]) return null;
                      const tB = criteriaResults.tankBMap[crit.id];
                      return [
                        <ReferenceDot key={`${crit.id}_dot_left`} x={volB} y={(tB as any)[scaleUpYVarLeft]} yAxisId="left" r={6} fill={crit.color} stroke="var(--accent-green)" strokeWidth={2.5} />,
                        <ReferenceDot key={`${crit.id}_dot_right`} x={volB} y={(tB as any)[scaleUpYVarRight]} yAxisId="right" r={6} fill={crit.color} stroke="var(--accent-green)" strokeWidth={2.5} />
                      ];
                    })}

                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'var(--panel-border)', borderRadius: '8px', color: 'var(--text-primary)' }} 
                      labelFormatter={(label) => `液量: ${formatNumber(label as number)} L`} 
                      formatter={(value: any, name: any) => { 
                        const [id, type] = name.split('_'); 
                        const crit = criteriaConfig.find(c => c.id === id); 
                        if (!crit) return [value, name]; 
                        const varName = type === 'Left' ? scaleUpYVarConfig[scaleUpYVarLeft].shortName : scaleUpYVarConfig[scaleUpYVarRight].shortName;
                        return [formatNumber(value), `${crit.label.split(' ')[1]} - ${varName}`]; 
                      }} 
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      wrapperStyle={{ paddingTop: '1rem', color: 'var(--text-primary)' }} 
                      formatter={(value) => { 
                        const [id, type] = value.split('_'); 
                        const crit = criteriaConfig.find(c => c.id === id); 
                        const varName = type === 'Left' ? scaleUpYVarConfig[scaleUpYVarLeft].shortName : scaleUpYVarConfig[scaleUpYVarRight].shortName;
                        return <span style={{ color: crit?.color, fontWeight: 500 }}>{crit?.label.split(' ')[1]} ({varName})</span>; 
                      }} 
                    />
                    
                    {criteriaConfig.map(crit => {
                      if (!selectedCriteria[crit.id]) return null;
                      return [
                        <Line key={`${crit.id}_Left`} yAxisId="left" type="monotone" dataKey={`${crit.id}_Left`} name={`${crit.id}_Left`} stroke={crit.color} strokeWidth={2} dot={false} activeDot={{ r: 6 }} />,
                        <Line key={`${crit.id}_Right`} yAxisId="right" type="monotone" dataKey={`${crit.id}_Right`} name={`${crit.id}_Right`} stroke={crit.color} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 6 }} />
                      ];
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

                {/* スケールアップ比 比較表 */}
                {Object.values(selectedCriteria).some(v => v) && (
                  <div style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>スケールアップ比 (Tank A : Tank B)</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                            <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>項目</th>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => (
                              <th key={crit.id} style={{ padding: '0.75rem', fontWeight: 600, color: crit.color }}>{crit.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>幾何学的相似比</td>
                            <td colSpan={criteriaConfig.filter(c => selectedCriteria[c.id]).length} style={{ padding: '0.75rem', fontFamily: 'monospace', textAlign: 'center' }}>
                              1 : {(tankB.D / tankA.D).toFixed(2)} 
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {Math.abs((tankB.D / tankA.D) - 1) < 0.01 ? '(一定)' : (tankB.D / tankA.D) > 1 ? '(増加)' : '(減少)'}
                              </span>
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>運転液量</td>
                            <td colSpan={criteriaConfig.filter(c => selectedCriteria[c.id]).length} style={{ padding: '0.75rem', fontFamily: 'monospace', textAlign: 'center' }}>
                              1 : {(volB / volA).toFixed(2)}
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {Math.abs((volB / volA) - 1) < 0.01 ? '(一定)' : (volB / volA) > 1 ? '(増加)' : '(減少)'}
                              </span>
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>単位動力 (P/V)</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].pv / criteriaResults.tankA.pv;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>回転数 (n)</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].n / criteriaResults.tankA.n;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>Re（レイノルズ数）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].re / criteriaResults.tankA.re;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>Fr（フルード数）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].fr / criteriaResults.tankA.fr;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>攪拌速度（周速 u_tip）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].nd / criteriaResults.tankA.nd;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>単位伝熱量（h·A/V）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].qvHeat / criteriaResults.tankA.qvHeat;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

          {activeTab === 'structure' && (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Layers size={20} color="var(--accent-green)" /> タンク構造比較 (Tank A / Tank B)
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>表示ズーム: {zoomFactor}%</label>
                  <input 
                    type="range" 
                    min="10" 
                    max={Math.max(500, Math.ceil(Math.max(tankA.D, tankB.D) / Math.min(tankA.D, tankB.D)) * 150)} 
                    value={zoomFactor} 
                    onChange={e => setZoomFactor(Number(e.target.value))} 
                    style={{ width: '150px' }} 
                  />
                  <button 
                    onClick={() => setZoomFactor(100)} 
                    style={{ padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                  >
                    リセット
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                二つのタンクの寸法比を維持したまま、縦に並べて構造を可視化します。
              </p>
              
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                {(() => {
                  const maxDT = Math.max(tankA.D, tankB.D);
                  const scaleFactor = (350 / maxDT) * (zoomFactor / 100);
                  
                  return (
                    <>
                      <TankDiagram 
                        tankParams={{
                          D_T: tankA.D, H: hA, d: tankA.d, b: tankA.b, np: tankA.np, theta_deg: tankA.theta_deg,
                          impellerType: tankA.type as any, baffled: tankA.baffled, B_w: tankA.B_w, n_B: tankA.n_B, 
                          n_stage: tankA.n_stage, headType: tankA.headType, clearance: tankA.C, H_T: tankA.H_T
                        }} 
                        liquidHeight={hA} 
                        scaleFactor={scaleFactor} 
                        title="Tank A (Scale 1)" 
                      />
                      
                      <hr style={{ border: 'none', borderTop: '2px dashed var(--panel-border)', margin: '1rem 0' }} />
                      
                      <TankDiagram 
                        tankParams={{
                          D_T: tankB.D, H: hB, d: tankB.d, b: tankB.b, np: tankB.np, theta_deg: tankB.theta_deg,
                          impellerType: tankB.type as any, baffled: tankB.baffled, B_w: tankB.B_w, n_B: tankB.n_B, 
                          n_stage: tankB.n_stage, headType: tankB.headType, clearance: tankB.C, H_T: tankB.H_T
                        }} 
                        liquidHeight={hB} 
                        scaleFactor={scaleFactor} 
                        title="Tank B (Scale 2)" 
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'ratio' && (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Layers size={20} color="var(--accent-pink)" /> スケール比相関図
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.2rem 0 0 0' }}>
                    基準スケール (Scale 1) を基準とした時の、スケールアップ比 V₂/V₁ と各特性値比の関係を示します。
                  </p>
                </div>
                {/* 左右Y軸変数切り替え */}
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 左軸選択 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>左軸(実線):</span>
                    <div style={{ display: 'flex', gap: '0.15rem', padding: '0.15rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                      {Object.entries(ratioYVarConfig).map(([key, cfg]) => (
                        <button
                          key={`ratio-left-${key}`}
                          onClick={() => setRatioYVarLeft(key)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            backgroundColor: ratioYVarLeft === key ? 'var(--accent-pink)' : 'transparent',
                            color: ratioYVarLeft === key ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {cfg.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 右軸選択 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>右軸(破線):</span>
                    <div style={{ display: 'flex', gap: '0.15rem', padding: '0.15rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
                      {Object.entries(ratioYVarConfig).map(([key, cfg]) => (
                        <button
                          key={`ratio-right-${key}`}
                          onClick={() => setRatioYVarRight(key)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            backgroundColor: ratioYVarRight === key ? 'var(--accent-pink)' : 'transparent',
                            color: ratioYVarRight === key ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                        >
                          {cfg.shortName}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="chart-container" style={{ width: '100%', height: '500px', minHeight: '500px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ratioChartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" vertical={true} horizontal={true} />
                    
                    {ratioMinorTicksX.map(tick => (
                      <ReferenceLine key={`ratio-minor-x-${tick}`} x={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    {ratioMinorTicksYLeft.map(tick => (
                      <ReferenceLine key={`ratio-minor-y-left-${tick}`} yAxisId="left" y={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    {ratioMinorTicksYRight.map(tick => (
                      <ReferenceLine key={`ratio-minor-y-right-${tick}`} yAxisId="right" y={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    
                    <XAxis 
                      dataKey="ratio" 
                      scale="log" 
                      domain={ratioXDomain} 
                      type="number" 
                      allowDataOverflow={true} 
                      ticks={ratioTicks.xTicks} 
                      interval={0} 
                      tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} 
                      stroke="var(--text-secondary)" 
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                      tickMargin={8} 
                      tickSize={5} 
                      tickLine={{ stroke: 'var(--text-secondary)' }} 
                      label={{ value: 'スケールアップ比 V₂/V₁ [-]', position: 'insideBottom', offset: -15, fill: 'var(--text-secondary)', fontSize: 14 }} 
                    />
                    <YAxis 
                      yAxisId="left"
                      scale="log" 
                      domain={ratioYDomainLeft} 
                      type="number" 
                      allowDataOverflow={true} 
                      ticks={ratioTicks.yTicksLeft} 
                      interval={0} 
                      tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} 
                      stroke="var(--text-secondary)" 
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                      tickMargin={8} 
                      tickSize={5} 
                      tickLine={{ stroke: 'var(--text-secondary)' }} 
                      label={{ value: ratioYVarConfig[ratioYVarLeft].axisLabel, angle: -90, position: 'insideLeft', offset: -10, fill: 'var(--text-secondary)', fontSize: 14 }} 
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      scale="log" 
                      domain={ratioYDomainRight} 
                      type="number" 
                      allowDataOverflow={true} 
                      ticks={ratioTicks.yTicksRight} 
                      interval={0} 
                      tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} 
                      stroke="var(--text-secondary)" 
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                      tickMargin={8} 
                      tickSize={5} 
                      tickLine={{ stroke: 'var(--text-secondary)' }} 
                      label={{ value: ratioYVarConfig[ratioYVarRight].axisLabel, angle: 90, position: 'insideRight', offset: -10, fill: 'var(--text-secondary)', fontSize: 14 }} 
                    />
                    
                    <ReferenceLine yAxisId="left" y={1} stroke="var(--panel-border)" strokeWidth={1} />
                    <ReferenceLine 
                       yAxisId="left"
                       x={1} 
                       stroke="var(--accent-orange)" 
                       strokeDasharray="4 4" 
                       strokeWidth={2}
                       label={{ value: 'スケール 1 (V₂/V₁ = 1)', position: 'insideTopLeft', fill: 'var(--accent-orange)', fontSize: 12, fontWeight: 'bold' }} 
                     />
                     
                     <ReferenceLine 
                       yAxisId="left"
                       x={volB / volA} 
                       stroke="var(--accent-green)" 
                       strokeDasharray="5 5" 
                       strokeWidth={2}
                       label={{ value: `設計スケール比: ${(volB / volA).toFixed(2)}`, position: 'insideTopRight', fill: 'var(--accent-green)', fontSize: 13, fontWeight: 'bold' }} 
                     />

                    {criteriaConfig.map(crit => {
                      if (!selectedCriteria[crit.id]) return null;
                      const ratio = volB / volA;
                      const tB = criteriaResults.tankBMap[crit.id];
                      const yValLeft = (tB as any)[ratioYVarConfig[ratioYVarLeft].key] / (criteriaResults.tankA as any)[ratioYVarConfig[ratioYVarLeft].key];
                      const yValRight = (tB as any)[ratioYVarConfig[ratioYVarRight].key] / (criteriaResults.tankA as any)[ratioYVarConfig[ratioYVarRight].key];
                      return [
                        <ReferenceDot 
                          key={`${crit.id}_dot_left`}
                          yAxisId="left"
                          x={ratio}
                          y={yValLeft}
                          r={5}
                          fill={crit.color}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />,
                        <ReferenceDot 
                          key={`${crit.id}_dot_right`}
                          yAxisId="right"
                          x={ratio}
                          y={yValRight}
                          r={5}
                          fill={crit.color}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      ];
                    })}

                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'var(--panel-border)', borderRadius: '8px', color: 'var(--text-primary)' }} 
                      labelFormatter={(label) => `スケール比 V₂/V₁: ${formatNumber(label as number)}`} 
                      formatter={(value: any, name: any) => { 
                        const [id, type] = name.split('_'); 
                        const crit = criteriaConfig.find(c => c.id === id); 
                        if (!crit) return [value, name]; 
                        const varName = type === 'Left' ? ratioYVarConfig[ratioYVarLeft].shortName : ratioYVarConfig[ratioYVarRight].shortName;
                        return [formatNumber(value), `${crit.label.split(' ')[1]} - ${varName}比`]; 
                      }} 
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      wrapperStyle={{ paddingTop: '1rem', color: 'var(--text-primary)' }} 
                      formatter={(value) => { 
                        const [id, type] = value.split('_'); 
                        const crit = criteriaConfig.find(c => c.id === id); 
                        const varName = type === 'Left' ? ratioYVarConfig[ratioYVarLeft].shortName : ratioYVarConfig[ratioYVarRight].shortName;
                        return <span style={{ color: crit?.color, fontWeight: 500 }}>{crit?.label.split(' ')[1]} ({varName}比)</span>; 
                      }} 
                    />
                    
                    {criteriaConfig.map(crit => {
                      if (!selectedCriteria[crit.id]) return null;
                      return [
                        <Line 
                          key={`${crit.id}_Left`} 
                          yAxisId="left"
                          type="monotone" 
                          dataKey={`${crit.id}_Left`} 
                          name={`${crit.id}_Left`} 
                          stroke={crit.color} 
                          strokeWidth={2.5} 
                          dot={false} 
                          activeDot={{ r: 6 }} 
                        />,
                        <Line 
                          key={`${crit.id}_Right`} 
                          yAxisId="right"
                          type="monotone" 
                          dataKey={`${crit.id}_Right`} 
                          name={`${crit.id}_Right`} 
                          stroke={crit.color} 
                          strokeWidth={2.5} 
                          strokeDasharray="6 4"
                          dot={false} 
                          activeDot={{ r: 6 }} 
                        />
                      ];
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

                {/* スケールアップ比 比較表 */}
                {Object.values(selectedCriteria).some(v => v) && (
                  <div style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>スケールアップ比 (Tank A : Tank B)</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                            <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>項目</th>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => (
                              <th key={crit.id} style={{ padding: '0.75rem', fontWeight: 600, color: crit.color }}>{crit.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>幾何学的相似比</td>
                            <td colSpan={criteriaConfig.filter(c => selectedCriteria[c.id]).length} style={{ padding: '0.75rem', fontFamily: 'monospace', textAlign: 'center' }}>
                              1 : {(tankB.D / tankA.D).toFixed(2)} 
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {Math.abs((tankB.D / tankA.D) - 1) < 0.01 ? '(一定)' : (tankB.D / tankA.D) > 1 ? '(増加)' : '(減少)'}
                              </span>
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>運転液量</td>
                            <td colSpan={criteriaConfig.filter(c => selectedCriteria[c.id]).length} style={{ padding: '0.75rem', fontFamily: 'monospace', textAlign: 'center' }}>
                              1 : {(volB / volA).toFixed(2)}
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {Math.abs((volB / volA) - 1) < 0.01 ? '(一定)' : (volB / volA) > 1 ? '(増加)' : '(減少)'}
                              </span>
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>単位動力 (P/V)</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].pv / criteriaResults.tankA.pv;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>回転数 (n)</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].n / criteriaResults.tankA.n;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>Re（レイノルズ数）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].re / criteriaResults.tankA.re;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>Fr（フルード数）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].fr / criteriaResults.tankA.fr;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>攪拌速度（周速 u_tip）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].nd / criteriaResults.tankA.nd;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                          <tr>
                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>単位伝熱量（h·A/V）</td>
                            {criteriaConfig.filter(c => selectedCriteria[c.id]).map(crit => {
                              const ratio = criteriaResults.tankBMap[crit.id].qvHeat / criteriaResults.tankA.qvHeat;
                              return (
                                <td key={crit.id} style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                                  1 : {ratio.toFixed(2)}
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {Math.abs(ratio - 1) < 0.01 ? '(一定)' : ratio > 1 ? '(増加)' : '(減少)'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

          {activeTab === 'table' && (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}>
                <Layers size={20} color="var(--accent-yellow)" /> 推算結果比較表 (Scale 1 vs Scale 2)
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                基準となる Tank A (Scale 1) と、各スケールアップ基準を適用した Tank B (Scale 2) のパラメータ比較表です。動力数 Np は動力曲線（ラシュトン線図）より推算しています。
              </p>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1.5rem', textAlign: 'left', background: 'rgba(15, 23, 42, 0.3)', borderRadius: '12px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '2px solid var(--panel-border)' }}>
                    <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>パラメータ</th>
                    <th style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent-orange)' }}>Tank A (Scale 1)</th>
                    {comparativeTableData.columns.map((col, idx) => (
                      <th key={idx} style={{ padding: '1rem', fontWeight: 600, color: 'var(--accent-green)' }}>Tank B ({col.label})</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* タンク形状パラメータ */}
                  <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(255, 255, 255, 0.05)' }}>
                    <td colSpan={2 + comparativeTableData.columns.length} style={{ padding: '0.5rem 1rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>タンク形状パラメータ</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>液量 V <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>(L)</span></td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>{formatNumber(volA)}</td>
                    {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>{formatNumber(volB)}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>液深 H <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>(m)</span></td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>{formatNumber(hA)}</td>
                    {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>{formatNumber(hB)}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>鏡板の種類</td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>{HEAD_TYPES.find(h => h.value === tankA.headType)?.label}</td>
                    {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>{HEAD_TYPES.find(h => h.value === tankB.headType)?.label}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>クリアランス C <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>(m)</span></td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>{formatNumber(tankA.C)}</td>
                    {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>{formatNumber(tankB.C)}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>槽径 D <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>(m)</span></td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>{formatNumber(tankA.D)}</td>
                    {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>{formatNumber(tankB.D)}</td>)}
                  </tr>
                </tbody>

                  {/* カテゴリ化されたパラメータ群 */}
                  {[
                    {
                      category: '液物性',
                      rows: [
                        { key: 'rho', name: '液密度 ρ', unit: 'kg/m³', format: (val: number) => formatNumber(val) },
                        { key: 'mu', name: '液粘度 μ', unit: 'mPa·s', format: (val: number) => formatNumber(val) }
                      ]
                    },
                    {
                      category: '運転条件',
                      rows: [
                        { key: 'n', name: '回転数 N', unit: 'rpm', format: (val: number) => formatNumber(val) },
                        { key: 'nd', name: '撹拌翼先端速度 (ND)', unit: 'm/s', format: (val: number) => formatNumber(val) }
                      ]
                    },
                    {
                      category: '動力特性',
                      rows: [
                        { key: 'p', name: '撹拌所要動力 P', unit: 'W', format: (val: number) => formatNumber(val) },
                        { key: 'pv', name: '単位液体積当たりの消費動力 P/V', unit: 'kW/m³', format: (val: number) => formatNumber(val) },
                        { key: 're', name: 'レイノルズ数 Re', unit: '-', format: (val: number) => formatNumber(val) },
                        { key: 'np', name: '動力数 Np', unit: '-', format: (val: number) => formatNumber(val) },
                        { key: 'npre', name: 'Np ・ Re (層流時一定)', unit: '-', format: (val: number) => formatNumber(val) }
                      ]
                    },
                    {
                      category: 'インペラ特性',
                      rows: [
                        { key: 'typeLabel', name: 'インペラ種類', unit: '-', format: (val: any) => String(val) },
                        { key: 'flowPattern', name: 'フローパターン', unit: '-', format: (val: any) => String(val) },
                        { key: 'd', name: '翼径 d', unit: 'mm', format: (val: number) => formatNumber(val) },
                        { key: 'qv', name: '液循環回数 (Q/V)', unit: '1/s', format: (val: number) => formatNumber(val) },
                        { key: 'tc', name: '液循環時間 tc', unit: 's', format: (val: number) => formatNumber(val) }
                      ]
                    }
                  ].map((cat, catIdx) => (
                    <tbody key={`cat-${catIdx}`}>
                      <tr style={{ borderBottom: '1px solid var(--panel-border)', background: 'rgba(255, 255, 255, 0.05)' }}>
                        <td colSpan={2 + comparativeTableData.columns.length} style={{ padding: '0.5rem 1rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>{cat.category}</td>
                      </tr>
                      {cat.rows.map((row, rIdx) => (
                        <tr key={`row-${catIdx}-${rIdx}`} style={{ borderBottom: '1px solid var(--panel-border)', background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                          <td style={{ padding: '1rem', fontWeight: 500 }}>
                            {row.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.25rem' }}>{row.unit !== '-' ? `(${row.unit})` : ''}</span>
                          </td>
                          <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-orange)' }}>
                            {row.format((comparativeTableData.tankA as any)[row.key])}
                          </td>
                          {comparativeTableData.columns.map((col, cIdx) => (
                            <td key={`col-${cIdx}`} style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-green)' }}>
                              {row.format((col.data as any)[row.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  ))}
              </table>
            </div>
          )}

          {activeTab === 'rushton' && (
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}>
                <Wrench size={20} color="var(--text-primary)" /> ラシュトン線図 (動力曲線)
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
                設定されたTank A / Tank Bの形状と亀井・平岡らの式に基づく理論上の動力曲線、および実際の運転点のプロットです。
              </p>
              
              <div className="chart-container" style={{ width: '100%', height: '500px', minHeight: '500px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rushtonChartData} margin={{ top: 20, right: 40, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" vertical={true} horizontal={true} />
                    
                    {rushtonMinorTicksX.map(tick => (
                      <ReferenceLine key={`rushton-minor-x-${tick}`} x={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    {rushtonMinorTicksY.map(tick => (
                      <ReferenceLine key={`rushton-minor-y-${tick}`} y={tick} stroke="rgba(255, 255, 255, 0.03)" strokeWidth={0.5} />
                    ))}
                    
                    <XAxis dataKey="Re" scale="log" domain={rushtonDomain.x} type="number" allowDataOverflow={true} ticks={rushtonTicks.xTicks} interval={0} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? `10^${Math.round(l)}` : ''; }} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickMargin={8} tickSize={5} tickLine={{ stroke: 'var(--text-secondary)' }} label={{ value: '攪拌レイノルズ数 Re [-]', position: 'insideBottom', offset: -15, fill: 'var(--text-secondary)', fontSize: 14 }} />
                    <YAxis scale="log" domain={rushtonDomain.y} type="number" allowDataOverflow={true} ticks={rushtonTicks.yTicks} interval={0} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? val.toString() : ''; }} stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickMargin={8} tickSize={5} tickLine={{ stroke: 'var(--text-secondary)' }} label={{ value: '動力数 Np [-]', angle: -90, position: 'insideLeft', offset: -5, fill: 'var(--text-secondary)', fontSize: 14 }} />
                    
                    {/* Flow Regimes */}
                    <ReferenceArea x1={rushtonDomain.x[0]} x2={10} fill="rgba(255, 255, 255, 0.05)" />
                    <ReferenceArea x1={10} x2={10000} fill="rgba(255, 255, 255, 0.02)" />
                    <ReferenceArea x1={10000} x2={rushtonDomain.x[1]} fill="rgba(255, 255, 255, 0.05)" />

                    <ReferenceLine x={10} stroke="rgba(255, 255, 255, 0.2)" strokeDasharray="3 3" label={{ value: 'Re = 10', position: 'insideTopLeft', fill: 'var(--text-secondary)', fontSize: 11 }} />
                    <ReferenceLine x={10000} stroke="rgba(255, 255, 255, 0.2)" strokeDasharray="3 3" label={{ value: 'Re = 10000', position: 'insideTopLeft', fill: 'var(--text-secondary)', fontSize: 11 }} />

                    <ReferenceLine x={3.16} stroke="transparent" label={{ value: '層流', position: 'insideTop', fill: 'var(--text-secondary)', fontSize: 14, fontWeight: 'bold' }} />
                    <ReferenceLine x={316} stroke="transparent" label={{ value: '遷移域', position: 'insideTop', fill: 'var(--text-secondary)', fontSize: 14, fontWeight: 'bold' }} />
                    <ReferenceLine x={100000} stroke="transparent" label={{ value: '乱流', position: 'insideTop', fill: 'var(--text-secondary)', fontSize: 14, fontWeight: 'bold' }} />


                    
                    {/* Borders */}
                    <ReferenceLine y={rushtonDomain.y[1]} stroke="var(--panel-border)" strokeWidth={1} />
                    <ReferenceLine x={rushtonDomain.x[1]} stroke="var(--panel-border)" strokeWidth={1} />

                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'var(--panel-border)', borderRadius: '8px', color: 'var(--text-primary)' }} labelFormatter={(label) => `Re = ${formatNumber(label as number)}`} formatter={(value: any, name: any) => [formatNumber(value), name === 'NpA' ? 'Tank A' : 'Tank B']} />
                    <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '1rem', color: 'var(--text-primary)' }} />
                    
                    <Line type="monotone" dataKey="NpA" name={`Tank A (${tankA.type})`} stroke="var(--accent-orange)" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="NpB" name={`Tank B (${tankB.type})`} stroke="var(--accent-green)" strokeWidth={3} dot={false} activeDot={{ r: 6 }} strokeDasharray="5 5" />
                    
                    {rushtonOperatingPoints.map(pt => (
                      <ReferenceDot 
                        key={pt.id} x={pt.Re} y={pt.Np} r={6} fill={pt.color} stroke="var(--bg-panel)" strokeWidth={2}
                        label={{ value: pt.label, position: 'top', fill: 'var(--text-primary)', fontSize: 12, offset: pt.offset || 10 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 中間変数比較表 */}
              <div style={{ marginTop: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  <Settings size={18} color="var(--accent-blue)" /> 亀井・平岡・加藤 推算中間変数
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.2rem 0' }}>
                  インペラおよびタンクの幾何学的寸法から算出される、動力数 (Np) 推算式の各中間パラメータです。
                </p>
                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--panel-border)', position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 1 }}>
                        <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>変数</th>
                        <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>定義</th>
                        <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-orange)' }}>Tank A 推算値</th>
                        <th style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>Tank B 推算値</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: 'β (ベータ)', def: '2ln(D/d) / (D/d - d/D)', valA: kameiVarsA.beta, valB: kameiVarsB.beta },
                        { name: 'η (イータ)', def: '翼付近の循環流量比に関するパラメータ', valA: kameiVarsA.eta, valB: kameiVarsB.eta },
                        { name: 'γ (ガンマ)', def: '流動モデルにおけるせん断幅の係数', valA: kameiVarsA.gamma, valB: kameiVarsB.gamma },
                        { name: 'X', def: '動力相関変数', valA: kameiVarsA.X, valB: kameiVarsB.X },
                        { name: 'Ct', def: '乱流時の形状項係数', valA: kameiVarsA.Ct, valB: kameiVarsB.Ct },
                        { name: 'm', def: '遷移域補正指数', valA: kameiVarsA.m, valB: kameiVarsB.m },
                        { name: 'Cu', def: '層流渦抵抗係数', valA: kameiVarsA.Cu, valB: kameiVarsB.Cu },
                        { name: 'f_∞', def: '極限摩擦係数', valA: kameiVarsA.f_inf, valB: kameiVarsB.f_inf },
                        { name: 'CL', def: '層流抵抗の形状係数', valA: kameiVarsA.CL, valB: kameiVarsB.CL },
                        { name: 'ReG / Re', def: '流動モデルにおけるレイノルズ数比', valA: kameiVarsA.ReG_ratio, valB: kameiVarsB.ReG_ratio },
                        { name: 'NpMax (段数補正済)', def: '完全邪魔板条件での最大動力数', valA: kameiVarsA.NpMax, valB: kameiVarsB.NpMax }
                      ].map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{row.name}</td>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{row.def}</td>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-orange)' }}>{row.valA.toFixed(5)}</td>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-green)' }}>{row.valB.toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {isGeneratingPdf && (
        <div id="pdf-report-container" style={{ position: 'absolute', left: '-9999px', top: 0, width: '800px', background: '#ffffff', padding: 0, color: '#0f172a', fontFamily: 'sans-serif' }}>
          
          {/* PAGE 1: Cover & Operating Conditions */}
          <div id="pdf-page-1" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <div style={{ margin: '2rem 0', textAlign: 'center' }}>
              <h1 style={{ fontSize: '2.2rem', color: '#1e3a8a', marginBottom: '0.5rem' }}>攪拌槽スケールアップ解析評価書</h1>
              <p style={{ color: '#475569', fontSize: '1rem' }}>Stirred Tank Scale-Up Evaluation & Characterization Report</p>
            </div>

            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>液物性・共通条件</h3>
            <table className="pdf-table" style={{ marginBottom: '2rem' }}>
              <thead>
                <tr>
                  <th>パラメータ</th>
                  <th>値</th>
                  <th>単位</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>液密度 ρ</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(fluidDensity)}</td>
                  <td>kg/m³</td>
                </tr>
                <tr>
                  <td>液粘度 μ</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(fluidViscosity)}</td>
                  <td>mPa·s</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>攪拌槽・幾何パラメータ比較</h3>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>パラメータ</th>
                  <th style={{ color: 'var(--accent-orange)' }}>Tank A (Scale 1)</th>
                  <th style={{ color: 'var(--accent-green)' }}>Tank B (Scale 2)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>槽径 D (m)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.D)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.D)}</td>
                </tr>
                <tr>
                  <td>円筒部高さ H_T (m)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.H_T)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.H_T)}</td>
                </tr>
                <tr>
                  <td>液量 V (L)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.V)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.V)}</td>
                </tr>
                <tr>
                  <td>液深 H (m) [推算値]</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(hA)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(hB)}</td>
                </tr>
                <tr>
                  <td>鏡板の種類</td>
                  <td>{HEAD_TYPES.find(h => h.value === tankA.headType)?.label}</td>
                  <td>{HEAD_TYPES.find(h => h.value === tankB.headType)?.label}</td>
                </tr>
                <tr>
                  <td>クリアランス C (m)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.C)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.C)}</td>
                </tr>
                <tr>
                  <td>インペラ種類</td>
                  <td>{tankA.type === 'pitched-paddle' ? '傾斜パドル' : tankA.type === 'propeller' ? 'プロペラ' : tankA.type === 'flat-paddle' ? '平パドル' : tankA.type === 'flat-turbine' ? '平羽根タービン' : 'ファウドラー'}</td>
                  <td>{tankB.type === 'pitched-paddle' ? '傾斜パドル' : tankB.type === 'propeller' ? 'プロペラ' : tankB.type === 'flat-paddle' ? '平パドル' : tankB.type === 'flat-turbine' ? '平羽根タービン' : 'ファウドラー'}</td>
                </tr>
                <tr>
                  <td>翼径 d (m)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.d)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.d)}</td>
                </tr>
                <tr>
                  <td>翼幅 b (m)</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.b)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.b)}</td>
                </tr>
                <tr>
                  <td>枚数 np</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankA.np)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.np)}</td>
                </tr>
                <tr>
                  <td>邪魔板有無</td>
                  <td>{tankA.baffled ? '有' : '無'}</td>
                  <td>{tankB.baffled ? '有' : '無'}</td>
                </tr>
              </tbody>
            </table>
            
            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 1 / 7</span>
            </div>
          </div>

          {/* PAGE 2: Selected Scale-Up Criteria */}
          <div id="pdf-page-2" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>評価対象のスケールアップ基準と概要</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              {criteriaConfig.map(crit => {
                const isSelected = selectedCriteria[crit.id];
                return (
                  <div key={crit.id} style={{ background: '#f8fafc', border: `1px solid ${isSelected ? crit.color : '#e2e8f0'}`, borderRadius: '8px', padding: '15px', opacity: isSelected ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ color: crit.color, fontSize: '1rem' }}>{crit.label}</strong>
                      <span style={{ fontSize: '0.8rem', color: isSelected ? '#16a34a' : '#64748b', fontWeight: 'bold' }}>{isSelected ? '評価対象' : '評価対象外'}</span>
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '6px', color: '#1e293b' }}>{crit.similarityTitle}</div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>{crit.description}</div>
                  </div>
                );
              })}
            </div>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 2 / 7</span>
            </div>
          </div>

          {/* PAGE 3: Tank Geometry Diagrams */}
          <div id="pdf-page-3" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>槽構造比較図 (比例縮尺)</h3>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '2.5rem' }}>
              両槽の幾何的寸法を同一縮尺で比較した図面です。スケールアップに伴うアスペクト比やクリアランス、翼相対寸法の変化を視覚的に評価できます。
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1, maxHeight: '650px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '30px' }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px' }}>
                <TankDiagram 
                  tankParams={{
                    D_T: tankA.D, H: hA, d: tankA.d, b: tankA.b, np: tankA.np, theta_deg: tankA.theta_deg,
                    impellerType: tankA.type as any, baffled: tankA.baffled, B_w: tankA.B_w, n_B: tankA.n_B, 
                    n_stage: tankA.n_stage, headType: tankA.headType, clearance: tankA.C, H_T: tankA.H_T
                  }} 
                  liquidHeight={hA} 
                  scaleFactor={(220 / Math.max(tankA.D, tankB.D))} 
                  title="Tank A (Scale 1)" 
                />
              </div>
              <div style={{ height: '200px', width: '2px', borderLeft: '2px dashed #cbd5e1' }}></div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px' }}>
                <TankDiagram 
                  tankParams={{
                    D_T: tankB.D, H: hB, d: tankB.d, b: tankB.b, np: tankB.np, theta_deg: tankB.theta_deg,
                    impellerType: tankB.type as any, baffled: tankB.baffled, B_w: tankB.B_w, n_B: tankB.n_B, 
                    n_stage: tankB.n_stage, headType: tankB.headType, clearance: tankB.C, H_T: tankB.H_T
                  }} 
                  liquidHeight={hB} 
                  scaleFactor={(220 / Math.max(tankA.D, tankB.D))} 
                  title="Tank B (Scale 2)" 
                />
              </div>
            </div>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 3 / 7</span>
            </div>
          </div>

          {/* PAGE 4: Scaleup Chart */}
          <div id="pdf-page-4" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>① スケールアップ挙動解析 (運転スケール依存性)</h3>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '2rem' }}>
              実線（左軸：{scaleUpYVarConfig[scaleUpYVarLeft].label.split(' ')[1]}）および破線（右軸：{scaleUpYVarConfig[scaleUpYVarRight].label.split(' ')[1]}）のスケール依存性グラフです。
            </p>
            
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <LineChart width={700} height={450} data={scaleUpChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.15)" />
                {scaleupMinorTicksX.map(tick => (
                  <ReferenceLine key={`minor-x-${tick}`} x={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                {scaleupMinorTicksYLeft.map(tick => (
                  <ReferenceLine key={`minor-y-${tick}`} y={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                <XAxis dataKey="v" type="number" scale="log" domain={xDomain} ticks={logTicks.xTicks} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? `${formatNumber(val)}` : ''; }} stroke="#475569" />
                <YAxis yAxisId="left" type="number" scale="log" domain={yDomainLeft} allowDataOverflow={true} ticks={logTicks.yTicksLeft} tickFormatter={(val) => formatNumber(val)} stroke="#475569" />
                <YAxis yAxisId="right" orientation="right" type="number" scale="log" domain={yDomainRight} allowDataOverflow={true} ticks={logTicks.yTicksRight} tickFormatter={(val) => formatNumber(val)} stroke="#475569" />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} labelFormatter={(label) => `液量: ${formatNumber(label as number)} L`} />
                <Legend 
                  verticalAlign="bottom"
                  wrapperStyle={{ paddingTop: '1.5rem', color: '#334155' }}
                  formatter={(value) => { 
                    const [id, type] = value.split('_'); 
                    const crit = criteriaConfig.find(c => c.id === id); 
                    const varName = type === 'Left' ? scaleUpYVarConfig[scaleUpYVarLeft].shortName : scaleUpYVarConfig[scaleUpYVarRight].shortName;
                    return <span style={{ color: crit?.color, fontWeight: 500 }}>{crit?.label.split(' ')[1]} ({varName})</span>; 
                  }} 
                />
                <ReferenceLine yAxisId="left" x={volA} stroke="#c2410c" strokeWidth={2} />
                <ReferenceLine yAxisId="left" x={volB} stroke="#15803d" strokeWidth={2} strokeDasharray="5 5" />
                {criteriaConfig.map(crit => {
                  if (!selectedCriteria[crit.id]) return null;
                  return [
                    <Line key={`${crit.id}_Left`} yAxisId="left" type="monotone" dataKey={`${crit.id}_Left`} stroke={crit.color} strokeWidth={2} dot={false} />,
                    <Line key={`${crit.id}_Right`} yAxisId="right" type="monotone" dataKey={`${crit.id}_Right`} stroke={crit.color} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  ];
                })}
              </LineChart>
            </div>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 4 / 7</span>
            </div>
          </div>

          {/* PAGE 5: Ratio Chart */}
          <div id="pdf-page-5" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>② スケール比相関解析 (運転パラメータ変化)</h3>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '2rem' }}>
              実線（左軸：{ratioYVarConfig[ratioYVarLeft].label.split(' ')[1]}）および破線（右軸：{ratioYVarConfig[ratioYVarRight].label.split(' ')[1]}）のスケール比依存性相関図です。
            </p>
            
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <LineChart width={700} height={450} data={ratioChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.15)" />
                {ratioMinorTicksX.map(tick => (
                  <ReferenceLine key={`rm-x-${tick}`} x={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                {ratioMinorTicksYLeft.map(tick => (
                  <ReferenceLine key={`rm-yl-${tick}`} y={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                <XAxis dataKey="ratio" type="number" scale="log" domain={ratioXDomain} ticks={ratioTicks.xTicks} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? `${val}` : ''; }} stroke="#475569" />
                <YAxis yAxisId="left" type="number" scale="log" domain={ratioYDomainLeft} allowDataOverflow={true} ticks={ratioTicks.yTicksLeft} tickFormatter={(val) => formatNumber(val)} stroke="#475569" />
                <YAxis yAxisId="right" orientation="right" type="number" scale="log" domain={ratioYDomainRight} allowDataOverflow={true} ticks={ratioTicks.yTicksRight} tickFormatter={(val) => formatNumber(val)} stroke="#475569" />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} labelFormatter={(label) => `スケール比: ${formatNumber(label as number)}`} />
                <Legend 
                  verticalAlign="bottom"
                  wrapperStyle={{ paddingTop: '1.5rem', color: '#334155' }}
                  formatter={(value) => { 
                    const [id, type] = value.split('_'); 
                    const crit = criteriaConfig.find(c => c.id === id); 
                    const varName = type === 'Left' ? ratioYVarConfig[ratioYVarLeft].shortName : ratioYVarConfig[ratioYVarRight].shortName;
                    return <span style={{ color: crit?.color, fontWeight: 500 }}>{crit?.label.split(' ')[1]} ({varName}比)</span>; 
                  }} 
                />
                <ReferenceLine yAxisId="left" x={volB / volA} stroke="#15803d" strokeWidth={2} strokeDasharray="5 5" />
                {criteriaConfig.map(crit => {
                  if (!selectedCriteria[crit.id]) return null;
                  return [
                    <Line key={`${crit.id}_Left`} yAxisId="left" type="monotone" dataKey={`${crit.id}_Left`} stroke={crit.color} strokeWidth={2} dot={false} />,
                    <Line key={`${crit.id}_Right`} yAxisId="right" type="monotone" dataKey={`${crit.id}_Right`} stroke={crit.color} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  ];
                })}
              </LineChart>
            </div>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 5 / 7</span>
            </div>
          </div>

          {/* PAGE 6: Rushton Diagram */}
          <div id="pdf-page-6" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>③ 動力特性特性解析 (ラシュトン線図)</h3>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '2rem' }}>
              層流〜遷移域〜乱流域における動力数 Np のレイノルズ数 Re 依存性と、設計運転点のプロット図です。
            </p>
            
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <LineChart width={700} height={450} data={rushtonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.15)" />
                {rushtonMinorTicksX.map(tick => (
                  <ReferenceLine key={`ru-x-${tick}`} x={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                {rushtonMinorTicksY.map(tick => (
                  <ReferenceLine key={`ru-y-${tick}`} y={tick} stroke="rgba(0, 0, 0, 0.04)" strokeWidth={0.5} />
                ))}
                <XAxis dataKey="Re" scale="log" domain={rushtonDomain.x} type="number" ticks={rushtonTicks.xTicks} tickFormatter={(val) => { const l = Math.log10(val); return Math.abs(l - Math.round(l)) < 1e-6 ? `10^${Math.round(l)}` : ''; }} stroke="#475569" />
                <YAxis scale="log" domain={rushtonDomain.y} ticks={rushtonTicks.yTicks} tickFormatter={(val) => formatNumber(val)} stroke="#475569" />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#0f172a' }} labelFormatter={(label) => `Re = ${formatNumber(label as number)}`} />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '1.5rem', color: '#334155' }} />
                <Line type="monotone" dataKey="NpA" name={`Tank A (${tankA.type})`} stroke="#c2410c" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="NpB" name={`Tank B (${tankB.type})`} stroke="#15803d" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                {rushtonOperatingPoints.map(pt => (
                  <ReferenceDot 
                    key={pt.id} x={pt.Re} y={pt.Np} r={6} fill={pt.color} stroke="#ffffff" strokeWidth={2}
                    label={{ value: pt.label.replace('Tank B (', '').replace(')', ''), position: 'top', fill: '#334155', fontSize: 10 }}
                  />
                ))}
              </LineChart>
            </div>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 6 / 7</span>
            </div>
          </div>

          {/* PAGE 7: Comparison Table */}
          <div id="pdf-page-7" className="pdf-report-page">
            <div className="pdf-report-header">
              <h2>攪拌槽スケールアップ解析 評価レポート</h2>
              <div className="date">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '0.5rem', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 'bold' }}>④ 推算結果 比較一覧</h3>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Tank A (Scale 1) と、各スケールアップ基準を適用した Tank B (Scale 2) のパラメータ推算結果 of 比較一覧表です。
            </p>
            
            <table className="pdf-table" style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th>パラメータ</th>
                  <th style={{ color: '#c2410c' }}>Tank A</th>
                  {comparativeTableData.columns.map((col, idx) => (
                    <th key={idx} style={{ color: '#15803d' }}>Tank B ({col.label})</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#f8fafc' }}>
                  <td><strong>幾何パラメータ</strong></td>
                  <td colSpan={1 + comparativeTableData.columns.length}></td>
                </tr>
                <tr>
                  <td>液量 V (L)</td>
                  <td style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatNumber(volA)}</td>
                  {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ fontFamily: 'monospace' }}>{formatNumber(volB)}</td>)}
                </tr>
                <tr>
                  <td>液深 H (m)</td>
                  <td style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatNumber(hA)}</td>
                  {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ fontFamily: 'monospace' }}>{formatNumber(hB)}</td>)}
                </tr>
                <tr>
                  <td>翼径 d (m)</td>
                  <td style={{ color: '#c2410c', fontFamily: 'monospace' }}>{formatNumber(tankA.d)}</td>
                  {comparativeTableData.columns.map((_, cIdx) => <td key={cIdx} style={{ fontFamily: 'monospace' }}>{formatNumber(tankB.d)}</td>)}
                </tr>

                {[
                  {
                    category: '運転条件',
                    rows: [
                      { key: 'n', name: '回転数 N', unit: 'rpm' },
                      { key: 'nd', name: '撹拌翼先端速度 (ND)', unit: 'm/s' }
                    ]
                  },
                  {
                    category: '動力特性',
                    rows: [
                      { key: 'p', name: '撹拌所要動力 P', unit: 'W' },
                      { key: 'pv', name: '消費動力 P/V', unit: 'kW/m³' },
                      { key: 're', name: 'レイノルズ数 Re', unit: '-' },
                      { key: 'np', name: '動力数 Np', unit: '-' }
                    ]
                  },
                  {
                    category: 'インペラ特性',
                    rows: [
                      { key: 'qv', name: '液循環回数 (Q/V)', unit: '1/s' },
                      { key: 'tc', name: '液循環時間 tc', unit: 's' }
                    ]
                  }
                ].map((cat, catIdx) => (
                  <React.Fragment key={`pdf-cat-${catIdx}`}>
                    <tr style={{ background: '#f8fafc' }}>
                      <td><strong>{cat.category}</strong></td>
                      <td colSpan={1 + comparativeTableData.columns.length}></td>
                    </tr>
                    {cat.rows.map((row, rIdx) => (
                      <tr key={`pdf-row-${catIdx}-${rIdx}`}>
                        <td>{row.name} {row.unit !== '-' ? `(${row.unit})` : ''}</td>
                        <td style={{ color: '#c2410c', fontFamily: 'monospace' }}>
                          {formatNumber((comparativeTableData.tankA as any)[row.key])}
                        </td>
                        {comparativeTableData.columns.map((col, cIdx) => (
                          <td key={`pdf-col-${cIdx}`} style={{ fontFamily: 'monospace' }}>
                            {formatNumber((col.data as any)[row.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="pdf-report-footer">
              <span>攪拌槽スケールアップ解析システム</span>
              <span>ページ 7 / 7</span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
