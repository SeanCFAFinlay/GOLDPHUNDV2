//+------------------------------------------------------------------+
//| PhundBridge.mq5 — OX Securities → Phund.ca                      |
//|                                                                    |
//| SETUP:                                                             |
//| 1. Tools > Options > Expert Advisors                              |
//| 2. Check "Allow WebRequest for listed URL"                        |
//| 3. Add your Phund API URL (e.g. https://phund-xxx.vercel.app)    |
//| 4. Compile, attach to XAUUSD M10 chart                           |
//+------------------------------------------------------------------+
#property copyright "Phund.ca"
#property version   "1.00"
#property strict

input string   InpApiUrl        = "https://phund.ca";
input string   InpMT5Key        = "";
input string   InpAccountId     = "ox_main";
input string   InpTerminalId    = "ox_primary";
input string   InpSymbol        = "XAUUSD";
input string   InpDXYSymbol     = "USDX";     // DXY symbol on OX (check Market Watch)
input string   InpUS10YSymbol   = "";          // US10Y if available (leave blank if not)
input int      InpScanSec       = 600;
input int      InpHeartbeatSec  = 60;
input int      InpBars10m       = 300;
input int      InpBars1h        = 100;
input int      InpBars4h        = 50;
input int      InpRetryMax      = 3;
input int      InpRetryDelayMs  = 2000;
input bool     InpEnableExec    = false;

datetime g_lastScan = 0, g_lastHB = 0, g_lastAcc = 0, g_lastPoll = 0;
int g_sent = 0, g_fail = 0;

// DXY price history for delta calc
double g_dxy10m = 0, g_dxy30m = 0, g_dxyCur = 0;
double g_y10m = 0, g_y30m = 0, g_yCur = 0;
datetime g_dxyT10 = 0, g_dxyT30 = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpMT5Key == "")
   { Print("ERROR: MT5 Bridge API Key required"); return INIT_PARAMETERS_INCORRECT; }

   Print("=== Phund.ca Bridge ===");
   Print("API:    ", InpApiUrl);
   Print("Symbol: ", InpSymbol);
   Print("DXY:    ", InpDXYSymbol != "" ? InpDXYSymbol : "not configured");
   Print("US10Y:  ", InpUS10YSymbol != "" ? InpUS10YSymbol : "not configured");
   Print("Scan:   ", InpScanSec, "s | Exec: ", InpEnableExec);
   Print("IMPORTANT: Add ", InpApiUrl, " to WebRequest allowed URLs");

   // Init DXY/Yield snapshots
   SnapshotMacro();

   SendHeartbeat();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{ Print("Phund bridge stopped. Sent:", g_sent, " Failed:", g_fail); }

//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();
   if(now - g_lastHB >= InpHeartbeatSec) { SendHeartbeat(); g_lastHB = now; }
   if(now - g_lastScan >= InpScanSec) { SnapshotMacro(); SendMarketData(); g_lastScan = now; }
   if(now - g_lastAcc >= InpScanSec * 2) { SendAccountData(); g_lastAcc = now; }
   if(InpEnableExec && now - g_lastPoll >= 30) { PollInstructions(); g_lastPoll = now; }
}

//+------------------------------------------------------------------+
void SnapshotMacro()
{
   // Rotate DXY snapshots
   datetime now = TimeCurrent();
   if(InpDXYSymbol != "" && SymbolInfoInteger(InpDXYSymbol, SYMBOL_EXIST))
   {
      double cur = SymbolInfoDouble(InpDXYSymbol, SYMBOL_BID);
      if(cur > 0)
      {
         if(g_dxyT30 == 0 || now - g_dxyT30 >= 1800) { g_dxy30m = g_dxyCur > 0 ? g_dxyCur : cur; g_dxyT30 = now; }
         if(g_dxyT10 == 0 || now - g_dxyT10 >= 600)  { g_dxy10m = g_dxyCur > 0 ? g_dxyCur : cur; g_dxyT10 = now; }
         g_dxyCur = cur;
      }
   }
   if(InpUS10YSymbol != "" && SymbolInfoInteger(InpUS10YSymbol, SYMBOL_EXIST))
   {
      double cur = SymbolInfoDouble(InpUS10YSymbol, SYMBOL_BID);
      if(cur > 0)
      {
         if(g_y10m == 0) g_y10m = cur;
         if(g_y30m == 0) g_y30m = cur;
         // Rotate similarly
         static datetime yT10 = 0, yT30 = 0;
         if(yT30 == 0 || now - yT30 >= 1800) { g_y30m = g_yCur > 0 ? g_yCur : cur; yT30 = now; }
         if(yT10 == 0 || now - yT10 >= 600)  { g_y10m = g_yCur > 0 ? g_yCur : cur; yT10 = now; }
         g_yCur = cur;
      }
   }
}

//+------------------------------------------------------------------+
void SendMarketData()
{
   MqlTick tick;
   if(!SymbolInfoTick(InpSymbol, tick)) { Print("ERR: No tick ", InpSymbol); return; }

   double bid = tick.bid, ask = tick.ask;
   double pt = SymbolInfoDouble(InpSymbol, SYMBOL_POINT);
   double spread = pt > 0 ? (ask - bid) / pt : 0;

   string b10 = BuildBars(InpSymbol, PERIOD_M10, InpBars10m);
   string b1h = BuildBars(InpSymbol, PERIOD_H1, InpBars1h);
   string b4h = BuildBars(InpSymbol, PERIOD_H4, InpBars4h);
   string ind = BuildIndicators(InpSymbol);

   string j = "{";
   j += Q("timestamp") + ":" + Q(ISO(TimeGMT())) + ",";
   j += Q("account_id") + ":" + Q(InpAccountId) + ",";
   j += Q("terminal_id") + ":" + Q(InpTerminalId) + ",";
   j += Q("symbol") + ":" + Q(InpSymbol) + ",";
   j += Q("bid") + ":" + D(bid, 2) + ",";
   j += Q("ask") + ":" + D(ask, 2) + ",";
   j += Q("spread_points") + ":" + D(spread, 1) + ",";
   j += Q("bars_10m") + ":" + b10 + ",";
   j += Q("bars_1h") + ":" + b1h + ",";
   j += Q("bars_4h") + ":" + b4h + ",";
   j += Q("indicators") + ":" + ind + ",";

   // Macro fields (real DXY/yield data)
   if(g_dxyCur > 0)
   {
      j += Q("dxy_bid") + ":" + D(g_dxyCur, 4) + ",";
      j += Q("dxy_prev_10m") + ":" + D(g_dxy10m, 4) + ",";
      j += Q("dxy_prev_30m") + ":" + D(g_dxy30m, 4) + ",";
   }
   if(g_yCur > 0)
   {
      j += Q("us10y_bid") + ":" + D(g_yCur, 4) + ",";
      j += Q("us10y_prev_10m") + ":" + D(g_y10m, 4) + ",";
      j += Q("us10y_prev_30m") + ":" + D(g_y30m, 4) + ",";
   }

   j += Q("server_time") + ":" + Q(ISO(TimeCurrent()));
   j += "}";

   bool ok = Post("/api/mt5/market", j);
   Print(ok ? "[SCAN] " : "[FAIL] ", InpSymbol, " bid=", bid, " sprd=", spread,
         g_dxyCur > 0 ? " DXY=" + D(g_dxyCur,3) : "");
}

//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string j = "{";
   j += Q("timestamp") + ":" + Q(ISO(TimeGMT())) + ",";
   j += Q("account_id") + ":" + Q(InpAccountId) + ",";
   j += Q("terminal_id") + ":" + Q(InpTerminalId) + ",";
   j += Q("connected") + ":true,";
   j += Q("symbols_active") + ":[" + Q(InpSymbol);
   if(InpDXYSymbol != "") j += "," + Q(InpDXYSymbol);
   if(InpUS10YSymbol != "") j += "," + Q(InpUS10YSymbol);
   j += "],";
   j += Q("server_ping_ms") + ":" + IntegerToString(TerminalInfoInteger(TERMINAL_PING_LAST));
   j += "}";
   Post("/api/mt5/heartbeat", j);
}

//+------------------------------------------------------------------+
void SendAccountData()
{
   string pos = "[";
   int tot = PositionsTotal();
   for(int i = 0; i < tot; i++)
   {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(i > 0) pos += ",";
      string sy = PositionGetString(POSITION_SYMBOL);
      int dg = (int)SymbolInfoInteger(sy, SYMBOL_DIGITS);
      long tp = PositionGetInteger(POSITION_TYPE);
      pos += "{";
      pos += Q("ticket") + ":" + IntegerToString((int)tk) + ",";
      pos += Q("symbol") + ":" + Q(sy) + ",";
      pos += Q("direction") + ":" + Q(tp == POSITION_TYPE_BUY ? "buy" : "sell") + ",";
      pos += Q("volume") + ":" + D(PositionGetDouble(POSITION_VOLUME), 2) + ",";
      pos += Q("open_price") + ":" + D(PositionGetDouble(POSITION_PRICE_OPEN), dg) + ",";
      pos += Q("current_price") + ":" + D(PositionGetDouble(POSITION_PRICE_CURRENT), dg) + ",";
      pos += Q("sl") + ":" + D(PositionGetDouble(POSITION_SL), dg) + ",";
      pos += Q("tp") + ":" + D(PositionGetDouble(POSITION_TP), dg) + ",";
      pos += Q("profit") + ":" + D(PositionGetDouble(POSITION_PROFIT), 2) + ",";
      pos += Q("swap") + ":" + D(PositionGetDouble(POSITION_SWAP), 2) + ",";
      pos += Q("open_time") + ":" + Q(ISO((datetime)PositionGetInteger(POSITION_TIME)));
      pos += "}";
   }
   pos += "]";

   string j = "{";
   j += Q("timestamp") + ":" + Q(ISO(TimeGMT())) + ",";
   j += Q("account_id") + ":" + Q(InpAccountId) + ",";
   j += Q("terminal_id") + ":" + Q(InpTerminalId) + ",";
   j += Q("balance") + ":" + D(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   j += Q("equity") + ":" + D(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   j += Q("margin") + ":" + D(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
   j += Q("free_margin") + ":" + D(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   j += Q("margin_level") + ":" + D(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2) + ",";
   j += Q("profit") + ":" + D(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   j += Q("positions") + ":" + pos;
   j += "}";
   Post("/api/mt5/account", j);
}

//+------------------------------------------------------------------+
void PollInstructions()
{
   string url = InpApiUrl + "/api/mt5/instructions";
   string hd = "Content-Type: application/json\r\nX-MT5-Key: " + InpMT5Key + "\r\n";
   char pd[], res[]; string rh;
   int r = WebRequest("GET", url, hd, 5000, pd, res, rh);
   if(r != 200) return;
   string body = CharArrayToString(res);
   if(StringFind(body, "\"instructions\":[]") >= 0) return;
   Print("[INSTR] ", StringSubstr(body, 0, 300));
}

//+------------------------------------------------------------------+
string BuildBars(string sym, ENUM_TIMEFRAMES tf, int cnt)
{
   MqlRates rt[]; int cp = CopyRates(sym, tf, 0, cnt, rt);
   if(cp <= 0) return "[]";
   int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string j = "[";
   for(int i = 0; i < cp; i++)
   {
      if(i > 0) j += ",";
      j += "{" + Q("time") + ":" + Q(ISO(rt[i].time)) + ","
         + Q("open") + ":" + D(rt[i].open, dg) + ","
         + Q("high") + ":" + D(rt[i].high, dg) + ","
         + Q("low") + ":" + D(rt[i].low, dg) + ","
         + Q("close") + ":" + D(rt[i].close, dg) + ","
         + Q("volume") + ":" + D((double)rt[i].tick_volume, 0) + "}";
   }
   return j + "]";
}

//+------------------------------------------------------------------+
string BuildIndicators(string sym)
{
   int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double buf[];
   string j = "{";

   int h; double m1[], m2[];

   h = iMA(sym, PERIOD_M10, 20, 0, MODE_EMA, PRICE_CLOSE);
   j += Q("ema20") + ":" + (CopyBuffer(h, 0, 0, 1, buf) > 0 ? D(buf[0], dg) : "null") + ","; IndicatorRelease(h);
   h = iMA(sym, PERIOD_M10, 50, 0, MODE_EMA, PRICE_CLOSE);
   j += Q("ema50") + ":" + (CopyBuffer(h, 0, 0, 1, buf) > 0 ? D(buf[0], dg) : "null") + ","; IndicatorRelease(h);
   h = iMA(sym, PERIOD_M10, 200, 0, MODE_EMA, PRICE_CLOSE);
   j += Q("ema200") + ":" + (CopyBuffer(h, 0, 0, 1, buf) > 0 ? D(buf[0], dg) : "null") + ","; IndicatorRelease(h);

   h = iRSI(sym, PERIOD_M10, 14, PRICE_CLOSE);
   j += Q("rsi14") + ":" + (CopyBuffer(h, 0, 0, 1, buf) > 0 ? D(buf[0], 2) : "null") + ","; IndicatorRelease(h);

   h = iMACD(sym, PERIOD_M10, 12, 26, 9, PRICE_CLOSE);
   bool mOk = CopyBuffer(h, 0, 0, 1, m1) > 0, sOk = CopyBuffer(h, 1, 0, 1, m2) > 0;
   j += Q("macd_line") + ":" + (mOk ? D(m1[0], 5) : "null") + ",";
   j += Q("macd_signal") + ":" + (sOk ? D(m2[0], 5) : "null") + ",";
   j += Q("macd_hist") + ":" + (mOk && sOk ? D(m1[0] - m2[0], 5) : "null") + ","; IndicatorRelease(h);

   h = iATR(sym, PERIOD_M10, 14);
   j += Q("atr14") + ":" + (CopyBuffer(h, 0, 0, 1, buf) > 0 ? D(buf[0], dg) : "null") + ","; IndicatorRelease(h);

   double a1[], a2[], a3[];
   h = iADX(sym, PERIOD_M10, 14);
   j += Q("adx14") + ":" + (CopyBuffer(h, 0, 0, 1, a1) > 0 ? D(a1[0], 2) : "null") + ",";
   j += Q("plus_di") + ":" + (CopyBuffer(h, 1, 0, 1, a2) > 0 ? D(a2[0], 2) : "null") + ",";
   j += Q("minus_di") + ":" + (CopyBuffer(h, 2, 0, 1, a3) > 0 ? D(a3[0], 2) : "null") + ","; IndicatorRelease(h);

   double b1[], b2[], b3[];
   h = iBands(sym, PERIOD_M10, 20, 0, 2.0, PRICE_CLOSE);
   j += Q("bb_upper") + ":" + (CopyBuffer(h, 1, 0, 1, b1) > 0 ? D(b1[0], dg) : "null") + ",";
   j += Q("bb_mid") + ":" + (CopyBuffer(h, 0, 0, 1, b2) > 0 ? D(b2[0], dg) : "null") + ",";
   j += Q("bb_lower") + ":" + (CopyBuffer(h, 2, 0, 1, b3) > 0 ? D(b3[0], dg) : "null"); IndicatorRelease(h);

   return j + "}";
}

//+------------------------------------------------------------------+
bool Post(string ep, string body)
{
   string url = InpApiUrl + ep;
   string hd = "Content-Type: application/json\r\nX-MT5-Key: " + InpMT5Key + "\r\n";
   char pd[]; StringToCharArray(body, pd, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(pd, ArraySize(pd) - 1);
   char res[]; string rh;

   for(int a = 0; a < InpRetryMax; a++)
   {
      ResetLastError();
      int r = WebRequest("POST", url, hd, 10000, pd, res, rh);
      if(r == 200) { g_sent++; return true; }
      if(r == 401) { Print("AUTH FAIL: Check MT5 key matches Vercel env var"); g_fail++; return false; }
      if(r == -1)
      {
         int e = GetLastError();
         if(e == 4060) Print("WebRequest blocked. Add ", InpApiUrl, " to Tools>Options>Expert Advisors");
         else Print("Net err ", e, " ", ep, " try ", a + 1);
      }
      else Print("HTTP ", r, " ", ep);
      if(a < InpRetryMax - 1) Sleep(InpRetryDelayMs * (a + 1));
   }
   g_fail++; return false;
}

string ISO(datetime dt) { MqlDateTime m; TimeToStruct(dt, m); return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", m.year, m.mon, m.day, m.hour, m.min, m.sec); }
string Q(string s) { return "\"" + s + "\""; }
string D(double v, int d) { return DoubleToString(v, d); }
//+------------------------------------------------------------------+
