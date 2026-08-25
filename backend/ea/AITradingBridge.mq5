//+------------------------------------------------------------------+
//|                                       AITradingBridge.mq5         |
//|   Expert Advisor bridge for the AI Trading Automation platform.  |
//|   Polls the secure backend for APPROVED signals and executes.    |
//+------------------------------------------------------------------+
#property copyright "AI Trading Automation"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>
CTrade trade;

//--- Inputs (configure in the EA settings dialog) --------------------
input string  ApiBaseUrl   = "https://your-app.preview.emergentagent.com"; // Backend URL (no trailing slash)
input string  EaToken      = "change-me-mt5-secret-token";                 // Must match MT5_API_SECRET
input string  ConnectionId = "MT5-EA-01";
input int     PollSeconds  = 5;
input double  RiskLotFixed = 0.10;   // fixed lot fallback
input bool    AllowTrading = true;

datetime lastHeartbeat = 0;

int OnInit()
{
   EventSetTimer(PollSeconds);
   Print("AI Trading Bridge initialized. Add ", ApiBaseUrl, " to WebRequest allowed URLs.");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }

//--- HTTP helper -----------------------------------------------------
string HttpRequest(string method, string endpoint, string body)
{
   string headers = "Content-Type: application/json\r\nX-EA-Token: " + EaToken + "\r\n";
   char post[]; char result[]; string result_headers;
   StringToCharArray(body, post, 0, StringLen(body));
   int timeout = 5000;
   string url = ApiBaseUrl + endpoint;
   int res = WebRequest(method, url, headers, timeout, post, result, result_headers);
   if(res == -1) { Print("WebRequest error ", GetLastError(), " for ", url); return(""); }
   return(CharArrayToString(result));
}

//--- Send heartbeat + account sync ----------------------------------
void SendHeartbeat()
{
   string body = StringFormat(
     "{\"connection_id\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"open_positions\":%d}",
     ConnectionId, AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY),
     AccountInfoDouble(ACCOUNT_MARGIN), PositionsTotal());
   HttpRequest("POST", "/api/mt5/heartbeat", body);
}

//--- Poll and execute approved signals ------------------------------
void PollSignals()
{
   string resp = HttpRequest("GET", "/api/mt5/signals/pending", "");
   if(StringLen(resp) < 5) return;

   // Very light JSON scan (production EAs should use a JSON parser lib)
   string sigId = ExtractString(resp, "signal_id");
   string symbol = ExtractString(resp, "symbol");
   string direction = ExtractString(resp, "direction");
   double entry = ExtractDouble(resp, "entry");
   double sl = ExtractDouble(resp, "stop_loss");
   double tp = ExtractDouble(resp, "take_profit");
   if(StringLen(sigId) == 0) return;

   if(!AllowTrading) { Print("Trading disabled locally, skipping ", sigId); return; }

   bool ok = false;
   double lot = RiskLotFixed;
   if(direction == "BUY")  ok = trade.Buy(lot, symbol, 0.0, sl, tp, sigId);
   if(direction == "SELL") ok = trade.Sell(lot, symbol, 0.0, sl, tp, sigId);

   string body = StringFormat("{\"signal_id\":\"%s\",\"executed\":%s,\"ticket\":%d,\"price\":%.5f}",
       sigId, ok ? "true" : "false", (int)trade.ResultOrder(), trade.ResultPrice());
   HttpRequest("POST", "/api/mt5/signals/" + sigId + "/executed", body);
   Print("Executed signal ", sigId, " result=", ok);
}

void OnTimer()
{
   SendHeartbeat();
   PollSignals();
}

//--- Minimal JSON extractors ----------------------------------------
string ExtractString(string json, string key)
{
   string pat = "\"" + key + "\":\"";
   int p = StringFind(json, pat);
   if(p < 0) return("");
   p += StringLen(pat);
   int e = StringFind(json, "\"", p);
   return(StringSubstr(json, p, e - p));
}
double ExtractDouble(string json, string key)
{
   string pat = "\"" + key + "\":";
   int p = StringFind(json, pat);
   if(p < 0) return(0.0);
   p += StringLen(pat);
   int e = p;
   while(e < StringLen(json))
   {
      ushort c = StringGetCharacter(json, e);
      if((c >= '0' && c <= '9') || c == '.' || c == '-') e++; else break;
   }
   return(StringToDouble(StringSubstr(json, p, e - p)));
}
//+------------------------------------------------------------------+
