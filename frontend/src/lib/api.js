import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API });

export const api = {
  deepseekStatus: () => http.get("/status/deepseek").then((r) => r.data),
  getSettings: () => http.get("/settings").then((r) => r.data),
  updateSettings: (body) => http.put("/settings", body).then((r) => r.data),

  runAnalysis: (body) => http.post("/analysis/run", body).then((r) => r.data),
  getRuns: () => http.get("/analysis/runs").then((r) => r.data),
  getRun: (id) => http.get(`/analysis/runs/${id}`).then((r) => r.data),

  getAgents: () => http.get("/agents").then((r) => r.data),

  getSignals: () => http.get("/signals").then((r) => r.data),

  getChart: (symbol, timeframe) => http.get(`/chart/${symbol}`, { params: { timeframe } }).then((r) => r.data),

  createStrategy: (body) => http.post("/strategies/create", body).then((r) => r.data),
  getStrategies: () => http.get("/strategies").then((r) => r.data),
  setStrategyStatus: (id, status) => http.put(`/strategies/${id}/status`, { status }).then((r) => r.data),

  runBacktest: (body) => http.post("/backtest/run", body).then((r) => r.data),
  getBacktests: () => http.get("/backtests").then((r) => r.data),

  getPositions: () => http.get("/positions").then((r) => r.data),
  getTrades: () => http.get("/trades").then((r) => r.data),
  postmortem: (id) => http.post(`/trades/${id}/postmortem`).then((r) => r.data),

  getPerformance: () => http.get("/performance").then((r) => r.data),
  getLogs: () => http.get("/logs").then((r) => r.data),

  emergencyStop: (active) => http.post("/controls/emergency-stop", { active }).then((r) => r.data),
  closeAll: () => http.post("/controls/close-all", { confirm: true }).then((r) => r.data),

  mt5Status: () => http.get("/mt5/status").then((r) => r.data),
  eaFileUrl: `${API}/mt5/ea-file`,
};

export default api;
