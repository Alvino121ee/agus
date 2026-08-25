import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import AIAnalysis from "@/pages/AIAnalysis";
import Chart from "@/pages/Chart";
import Agents from "@/pages/Agents";
import StrategyLab from "@/pages/StrategyLab";
import Backtest from "@/pages/Backtest";
import Signals from "@/pages/Signals";
import Positions from "@/pages/Positions";
import TradeHistory from "@/pages/TradeHistory";
import MT5 from "@/pages/MT5";
import RiskManagement from "@/pages/RiskManagement";
import Performance from "@/pages/Performance";
import Logs from "@/pages/Logs";
import Settings from "@/pages/Settings";

function App() {
  return (
    <div className="App dark">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analysis" element={<AIAnalysis />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/strategy-lab" element={<StrategyLab />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/history" element={<TradeHistory />} />
            <Route path="/mt5" element={<MT5 />} />
            <Route path="/risk" element={<RiskManagement />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="dark" />
    </div>
  );
}

export default App;
