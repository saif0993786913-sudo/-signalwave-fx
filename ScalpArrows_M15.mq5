//+------------------------------------------------------------------+
//|                                            ScalpArrows_M15.mq5    |
//|                  EMA crossover + RSI confirmation scalping arrows |
//|                  Designed for the 15-minute (M15) timeframe       |
//+------------------------------------------------------------------+
#property copyright "Saif"
#property version   "1.00"
#property description "Buy/Sell scalping arrows: Fast/Slow EMA crossover confirmed by RSI. Tuned for M15. Non-repainting on closed candles."
#property indicator_chart_window
#property indicator_buffers 2
#property indicator_plots   2

//--- Buy arrow plot
#property indicator_label1  "Buy"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrLime
#property indicator_width1  2

//--- Sell arrow plot
#property indicator_label2  "Sell"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrRed
#property indicator_width2  2

//--- Inputs
input int    InpFastEMA        = 8;     // Fast EMA period
input int    InpSlowEMA        = 21;    // Slow EMA period
input int    InpRSIPeriod      = 14;    // RSI period
input bool   InpUseRSIFilter   = true;  // Use RSI confirmation
input double InpRSIBuyLevel    = 50.0;  // RSI must be ABOVE this for a BUY
input double InpRSISellLevel   = 50.0;  // RSI must be BELOW this for a SELL
input bool   InpClosedBarOnly  = true;  // Signal only on closed candle (no repaint)
input double InpArrowGapPoints = 60.0;  // Arrow distance from the candle (in points)
input bool   InpAlertPopup     = true;  // Show popup alert
input bool   InpAlertSound     = true;  // Play sound on signal
input bool   InpAlertPush      = false; // Send push notification to phone (MT5 mobile)

//--- Indicator buffers
double BuyBuffer[];
double SellBuffer[];

//--- Indicator handles
int hFast = INVALID_HANDLE;
int hSlow = INVALID_HANDLE;
int hRSI  = INVALID_HANDLE;

//--- Tracks the last bar we already alerted on
datetime g_lastSignalTime = 0;

//+------------------------------------------------------------------+
//| Initialization                                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, BuyBuffer,  INDICATOR_DATA);
   SetIndexBuffer(1, SellBuffer, INDICATOR_DATA);

   //--- Arrow symbols: 233 = up arrow, 234 = down arrow (Wingdings)
   PlotIndexSetInteger(0, PLOT_ARROW, 233);
   PlotIndexSetInteger(1, PLOT_ARROW, 234);

   //--- 0.0 means "no arrow here"
   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, 0.0);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, 0.0);

   ArraySetAsSeries(BuyBuffer,  true);
   ArraySetAsSeries(SellBuffer, true);

   //--- Create the indicator handles
   hFast = iMA(_Symbol, _Period, InpFastEMA, 0, MODE_EMA, PRICE_CLOSE);
   hSlow = iMA(_Symbol, _Period, InpSlowEMA, 0, MODE_EMA, PRICE_CLOSE);
   hRSI  = iRSI(_Symbol, _Period, InpRSIPeriod, PRICE_CLOSE);

   if(hFast == INVALID_HANDLE || hSlow == INVALID_HANDLE || hRSI == INVALID_HANDLE)
     {
      Print("ScalpArrows: failed to create one or more indicator handles.");
      return(INIT_FAILED);
     }

   if(_Period != PERIOD_M15)
      Print("ScalpArrows note: this indicator is tuned for M15. The current chart timeframe is different.");

   IndicatorSetString(INDICATOR_SHORTNAME, "ScalpArrows M15");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Cleanup                                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(hFast != INVALID_HANDLE) IndicatorRelease(hFast);
   if(hSlow != INVALID_HANDLE) IndicatorRelease(hSlow);
   if(hRSI  != INVALID_HANDLE) IndicatorRelease(hRSI);
  }

//+------------------------------------------------------------------+
//| Fire alerts                                                      |
//+------------------------------------------------------------------+
void DoAlert(const string direction)
  {
   string msg = StringFormat("%s %s : %s scalping signal",
                             _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period), direction);
   if(InpAlertPopup) Alert(msg);
   if(InpAlertSound) PlaySound("alert.wav");
   if(InpAlertPush)  SendNotification(msg);
  }

//+------------------------------------------------------------------+
//| Main calculation                                                 |
//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   int needed = InpSlowEMA + InpRSIPeriod + 5;
   if(rates_total < needed)
      return(0);

   //--- Use newest-first (series) indexing: index 0 = current bar
   ArraySetAsSeries(time,  true);
   ArraySetAsSeries(high,  true);
   ArraySetAsSeries(low,   true);
   ArraySetAsSeries(close, true);

   //--- How many bars to (re)calculate
   int toCopy;
   if(prev_calculated == 0)
      toCopy = rates_total - 2;
   else
      toCopy = (rates_total - prev_calculated) + 2;
   if(toCopy > rates_total - 2) toCopy = rates_total - 2;
   if(toCopy < 1) toCopy = 1;

   //--- Pull the EMA and RSI values
   double fast[], slow[], rsi[];
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(rsi,  true);

   int copyCount = toCopy + 2;
   if(CopyBuffer(hFast, 0, 0, copyCount, fast) <= 0) return(prev_calculated);
   if(CopyBuffer(hSlow, 0, 0, copyCount, slow) <= 0) return(prev_calculated);
   if(CopyBuffer(hRSI,  0, 0, copyCount, rsi)  <= 0) return(prev_calculated);

   double gap = InpArrowGapPoints * _Point;
   int startBar = (InpClosedBarOnly ? 1 : 0);

   //--- Loop from older bars (high index) toward the newest
   for(int i = toCopy; i >= startBar; i--)
     {
      BuyBuffer[i]  = 0.0;
      SellBuffer[i] = 0.0;

      double fNow = fast[i],  fPrev = fast[i + 1];
      double sNow = slow[i],  sPrev = slow[i + 1];
      double r    = rsi[i];

      bool crossUp   = (fPrev <= sPrev && fNow > sNow);
      bool crossDown = (fPrev >= sPrev && fNow < sNow);

      bool rsiBuyOK  = (!InpUseRSIFilter || r > InpRSIBuyLevel);
      bool rsiSellOK = (!InpUseRSIFilter || r < InpRSISellLevel);

      if(crossUp && rsiBuyOK)
         BuyBuffer[i] = low[i] - gap;
      else if(crossDown && rsiSellOK)
         SellBuffer[i] = high[i] + gap;
     }

   //--- Alert once per newly confirmed bar
   int sigBar = (InpClosedBarOnly ? 1 : 0);
   if(rates_total > sigBar + 1 && time[sigBar] != g_lastSignalTime)
     {
      if(BuyBuffer[sigBar] != 0.0)
        {
         g_lastSignalTime = time[sigBar];
         DoAlert("BUY");
        }
      else if(SellBuffer[sigBar] != 0.0)
        {
         g_lastSignalTime = time[sigBar];
         DoAlert("SELL");
        }
     }

   return(rates_total);
  }
//+------------------------------------------------------------------+
