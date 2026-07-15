const STARTING_CASH = 50000;
const MAX_SINGLE_TRADE_RATIO = 0.05;
const FEE_MODEL = {
  cnEtfCommissionRate: 0.0003,
  cnEtfMinCommission: 5,
  usCommissionCny: 0,
  usSecSellRate: 20.60 / 1000000,
  usFinraTafPerShareUsd: 0.000195,
  usFinraTafMinUsd: 0.01,
  usFinraTafMaxUsd: 9.79
};

const ASSETS = [
  {
    symbol: "QQQ",
    name: "纳斯达克100 ETF",
    type: "美股成长",
    market: "US",
    currency: "USD",
    fx: 7.2,
    targetWeight: 0.15,
    lesson: "观察科技成长资产：上涨时很强，回撤也会更深，适合练习不要追高和分批买入。"
  },
  {
    symbol: "SPY",
    name: "标普500 ETF",
    type: "美股宽基",
    market: "US",
    currency: "USD",
    fx: 7.2,
    targetWeight: 0.25,
    lesson: "观察美国大盘：比单一行业更分散，适合学习长期指数投资。"
  },
  {
    symbol: "510300.SS",
    name: "沪深300 ETF",
    type: "A股宽基",
    market: "CN",
    currency: "CNY",
    fx: 1,
    targetWeight: 0.20,
    lesson: "观察A股核心资产：适合和海外指数对比，理解不同市场轮动。"
  },
  {
    symbol: "510500.SS",
    name: "中证500 ETF",
    type: "A股中盘",
    market: "CN",
    currency: "CNY",
    fx: 1,
    targetWeight: 0.10,
    lesson: "观察中盘公司：波动可能大于大盘，适合学习风险和仓位控制。"
  },
  {
    symbol: "GLD",
    name: "黄金 ETF",
    type: "避险资产",
    market: "US",
    currency: "USD",
    fx: 7.2,
    targetWeight: 0.15,
    lesson: "观察黄金：它不一定跟股票同涨同跌，适合学习分散配置。"
  },
  {
    symbol: "TLT",
    name: "长期美债 ETF",
    type: "债券资产",
    market: "US",
    currency: "USD",
    fx: 7.2,
    targetWeight: 0.15,
    lesson: "观察债券：受利率影响明显，适合学习股票之外的资产波动。"
  }
];

const SAMPLE_SERIES = {
  QQQ: [520, 526, 531, 524, 539, 546, 541, 552, 560, 556, 565, 571],
  SPY: [620, 624, 626, 622, 629, 633, 636, 631, 638, 641, 645, 647],
  "510300.SS": [3.82, 3.85, 3.8, 3.88, 3.91, 3.86, 3.9, 3.94, 3.92, 3.97, 4.01, 3.99],
  "510500.SS": [5.28, 5.35, 5.31, 5.4, 5.48, 5.42, 5.5, 5.56, 5.49, 5.6, 5.66, 5.62],
  GLD: [295, 298, 296, 301, 304, 302, 307, 310, 309, 312, 315, 313],
  TLT: [88, 87.5, 88.4, 89.2, 88.6, 90.1, 89.8, 91, 90.6, 91.4, 92.1, 91.7]
};

const state = loadState();
let quotes = {};
let selectedSymbol = null;
let staticQuoteCache = null;

const els = {
  totalValue: document.querySelector("#totalValue"),
  cashValue: document.querySelector("#cashValue"),
  holdingValue: document.querySelector("#holdingValue"),
  pnlValue: document.querySelector("#pnlValue"),
  updatedAt: document.querySelector("#updatedAt"),
  assetList: document.querySelector("#assetList"),
  tradeStatusSummary: document.querySelector("#tradeStatusSummary"),
  positions: document.querySelector("#positions"),
  pendingOrders: document.querySelector("#pendingOrders"),
  tradeLog: document.querySelector("#tradeLog"),
  insights: document.querySelector("#insights"),
  statusToast: document.querySelector("#statusToast"),
  tradeSheet: document.querySelector("#tradeSheet"),
  tradeTitle: document.querySelector("#tradeTitle"),
  tradeAssetType: document.querySelector("#tradeAssetType"),
  tradePrice: document.querySelector("#tradePrice"),
  tradeAmount: document.querySelector("#tradeAmount"),
  tradeReason: document.querySelector("#tradeReason"),
  tradeHint: document.querySelector("#tradeHint"),
  lessonSheet: document.querySelector("#lessonSheet"),
  lessonTag: document.querySelector("#lessonTag"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonBody: document.querySelector("#lessonBody")
};

document.querySelector("#refreshBtn").addEventListener("click", refreshQuotes);
document.querySelector("#closeSheet").addEventListener("click", closeSheet);
document.querySelector("#buyBtn").addEventListener("click", () => trade("buy"));
document.querySelector("#sellBtn").addEventListener("click", () => trade("sell"));
document.querySelector("#resetBtn").addEventListener("click", resetPortfolio);
document.querySelector("#closeLesson").addEventListener("click", closeLesson);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.view}View`).classList.add("active");
  });
});

refreshQuotes();

async function refreshQuotes() {
  els.updatedAt.textContent = "正在读取行情...";
  staticQuoteCache = null;
  const results = await Promise.all(ASSETS.map(fetchQuote));
  quotes = Object.fromEntries(results.map((quote) => [quote.symbol, quote]));
  processPendingOrders();
  render();
  const liveCount = results.filter((quote) => quote.source === "live").length;
  els.updatedAt.textContent = `${new Date().toLocaleString("zh-CN", { hour12: false })} · ${liveCount}/${ASSETS.length} 个实时源`;
}

async function fetchQuote(asset) {
  const localApiAvailable = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "8787";

  if (!localApiAvailable) {
    const staticQuote = await fetchStaticQuote(asset);
    if (staticQuote) return staticQuote;
  }

  try {
    const response = await fetch(`/api/chart?symbol=${encodeURIComponent(asset.symbol)}&range=1mo&interval=1d`);
    if (!response.ok) throw new Error("quote failed");
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const close = result?.indicators?.quote?.[0]?.close?.filter((value) => Number.isFinite(value));
    if (!close || close.length < 2) throw new Error("missing close prices");
    return makeQuote(asset, close, "live");
  } catch {
    const staticQuote = await fetchStaticQuote(asset);
    return staticQuote || makeQuote(asset, SAMPLE_SERIES[asset.symbol], "sample");
  }
}

async function fetchStaticQuote(asset) {
  try {
    if (!staticQuoteCache) {
      const response = await fetch(`./quotes.json?ts=${Date.now()}`);
      if (!response.ok) throw new Error("static quotes unavailable");
      staticQuoteCache = await response.json();
    }
    const series = staticQuoteCache?.symbols?.[asset.symbol]?.close?.filter((value) => Number.isFinite(value));
    if (!series || series.length < 2) return null;
    return makeQuote(asset, series, staticQuoteCache.generatedAt ? "live" : "sample");
  } catch {
    return null;
  }
}

function makeQuote(asset, series, source) {
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const changePct = ((last - prev) / prev) * 100;
  const monthStart = series[0];
  const monthPct = ((last - monthStart) / monthStart) * 100;
  const high = Math.max(...series);
  const low = Math.min(...series);
  const drawdown = ((last - high) / high) * 100;
  const rangePct = ((high - low) / low) * 100;
  return { ...asset, price: last, series, source, changePct, monthPct, drawdown, rangePct };
}

function render() {
  renderAccount();
  renderAssets();
  renderTradeStatusSummary();
  renderPositions();
  renderPendingOrders();
  renderLog();
  renderInsights();
}

function getHoldingValue(symbol) {
  const quote = quotes[symbol];
  const position = state.positions[symbol];
  if (!quote || !position) return 0;
  return position.shares * quote.price * quote.fx;
}

function getPendingOrders(symbol) {
  return (state.pendingOrders || []).filter((order) => order.symbol === symbol);
}

function getPendingAmount(symbol, side = null) {
  return getPendingOrders(symbol)
    .filter((order) => !side || order.side === side)
    .reduce((sum, order) => sum + order.amount, 0);
}

function getAssetTradeState(symbol) {
  const holdingValue = getHoldingValue(symbol);
  const pendingBuy = getPendingAmount(symbol, "buy");
  const pendingSell = getPendingAmount(symbol, "sell");

  if (holdingValue > 0 && pendingSell > 0) {
    return {
      tone: "warning",
      label: "持仓中，有卖出待成交",
      detail: `已成交持仓 ${money(holdingValue)}，待卖出 ${money(pendingSell)}`
    };
  }
  if (holdingValue > 0) {
    return {
      tone: "success",
      label: "已成功买入",
      detail: `当前已持仓 ${money(holdingValue)}`
    };
  }
  if (pendingBuy > 0) {
    return {
      tone: "pending",
      label: "已下单，等待成交",
      detail: `待买入 ${money(pendingBuy)}，不用重复买`
    };
  }
  if (pendingSell > 0) {
    return {
      tone: "pending",
      label: "卖出等待成交",
      detail: `待卖出 ${money(pendingSell)}`
    };
  }
  return {
    tone: "empty",
    label: "未持有",
    detail: "还没有买入或待成交订单"
  };
}

function getAccountSnapshot() {
  const holdingValue = Object.keys(state.positions).reduce((sum, symbol) => sum + getHoldingValue(symbol), 0);
  const totalCost = Object.values(state.positions).reduce((sum, position) => sum + position.cost, 0);
  return {
    holdingValue,
    totalCost,
    pnl: holdingValue - totalCost,
    total: state.cash + holdingValue
  };
}

function renderAccount() {
  const snapshot = getAccountSnapshot();
  els.totalValue.textContent = money(snapshot.total);
  els.cashValue.textContent = money(state.cash);
  els.holdingValue.textContent = money(snapshot.holdingValue);
  els.pnlValue.textContent = money(snapshot.pnl);
  els.pnlValue.className = snapshot.pnl >= 0 ? "good" : "bad";
}

function getSuggestion(symbol) {
  const quote = quotes[symbol];
  const asset = ASSETS.find((item) => item.symbol === symbol);
  const snapshot = getAccountSnapshot();
  const currentValue = getHoldingValue(symbol);
  const targetValue = snapshot.total * asset.targetWeight;
  const gap = Math.max(0, targetValue - currentValue);
  const maxTrade = snapshot.total * MAX_SINGLE_TRADE_RATIO;

  let factor = 1;
  const reasons = [];

  if (quote.changePct > 2) {
    factor *= 0.45;
    reasons.push("今天涨幅偏大，降低追高金额");
  } else if (quote.changePct < -2) {
    factor *= 1.25;
    reasons.push("今天下跌较多，适合练习分批而不是一次买满");
  } else {
    reasons.push("日内波动不极端，按计划仓位练习");
  }

  if (quote.drawdown < -6) {
    factor *= 1.2;
    reasons.push("相对近月高点有回撤，观察是否企稳");
  }

  if (quote.monthPct > 8) {
    factor *= 0.7;
    reasons.push("近月涨幅较高，控制节奏");
  }

  const raw = Math.min(gap * factor, maxTrade, state.cash);
  let amount = Math.floor(raw / 100) * 100;
  if (amount < 100 && state.cash >= 100 && gap > 0) amount = 100;
  if (state.cash < 100 || gap <= 0) amount = 0;

  const targetPct = Math.round(asset.targetWeight * 100);
  const currentPct = snapshot.total > 0 ? (currentValue / snapshot.total) * 100 : 0;
  const summary = amount > 0
    ? `建议本次模拟买入 ${money(amount)}。目标约 ${targetPct}%，当前约 ${currentPct.toFixed(1)}%。`
    : `暂不建议新增。目标约 ${targetPct}%，当前约 ${currentPct.toFixed(1)}%，或现金不足。`;

  return { amount, summary, reasons };
}

function renderAssets() {
  els.assetList.innerHTML = ASSETS.map((asset) => {
    const quote = quotes[asset.symbol];
    if (!quote) return "";
    const suggestion = getSuggestion(asset.symbol);
    const market = getMarketStatus(asset);
    const holdingValue = getHoldingValue(asset.symbol);
    const tradeState = getAssetTradeState(asset.symbol);
    const pendingBuy = getPendingAmount(asset.symbol, "buy");
    const position = state.positions[asset.symbol];
    const holdingCost = position?.cost || 0;
    const holdingPnl = holdingValue - holdingCost;
    const holdingHtml = holdingValue > 0 ? `
        <button class="holding-badge learn-btn" type="button" onclick="openLesson('holding', '${asset.symbol}')">
          <strong>已持仓 ${money(holdingValue)}</strong>
          <span class="${holdingPnl >= 0 ? "good" : "bad"}">${money(holdingPnl)}</span>
          <small>成本 ${money(holdingCost)} · ${position.shares.toFixed(4)} 份</small>
        </button>
      ` : "";
    const pendingHtml = pendingBuy > 0 ? `
        <button class="pending-badge learn-btn" type="button" onclick="showPendingNotice('${asset.symbol}')">
          <strong>待成交买入 ${money(pendingBuy)}</strong>
          <span>已提交，开盘后刷新会尝试成交</span>
        </button>
      ` : "";
    const primaryAction = pendingBuy > 0
      ? `<button class="primary muted-primary" type="button" onclick="showPendingNotice('${asset.symbol}')">已待成交</button>`
      : `<button class="primary" type="button" onclick="openSheet('${asset.symbol}')">${holdingValue > 0 ? "追加模拟" : "按建议模拟"}</button>`;
    return `
      <article class="asset-card">
        <div class="asset-top">
          <div>
            <div class="asset-name">${asset.name}</div>
            <div class="asset-meta">${asset.symbol} · ${asset.type} · ${market.label} · ${quote.source === "live" ? "真实行情" : "样例波动"}</div>
          </div>
          <button class="price learn-btn" type="button" onclick="openLesson('price', '${asset.symbol}')">
            <b>${formatPrice(quote)}</b>
            <span class="change ${quote.changePct >= 0 ? "good" : "bad"}">${signed(quote.changePct)}%</span>
          </button>
        </div>
        <div class="trade-state ${tradeState.tone}">
          <strong>${tradeState.label}</strong>
          <span>${tradeState.detail}</span>
        </div>
        ${sparkline(quote.series, quote.changePct >= 0 ? "#087f5b" : "#c92a2a")}
        ${holdingHtml}
        ${pendingHtml}
        <button class="recommendation learn-btn" type="button" onclick="openLesson('suggestion', '${asset.symbol}')">
          <strong>${suggestion.summary}</strong>
          <span>${suggestion.reasons.join("；")}。</span>
        </button>
        <p class="lesson">${asset.lesson}</p>
        <div class="asset-actions">
          ${primaryAction}
          <button class="secondary" type="button" onclick="quickPlan('${asset.symbol}')">规律提示</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTradeStatusSummary() {
  const rows = ASSETS
    .map((asset) => ({ asset, state: getAssetTradeState(asset.symbol) }))
    .filter(({ state }) => state.tone !== "empty");

  if (!rows.length) {
    els.tradeStatusSummary.innerHTML = `
      <article class="summary-card empty-summary">
        <strong>还没有任何买入</strong>
        <span>买入成功会显示在“已成交持仓”；休市下单会显示在“待成交订单”。</span>
      </article>
    `;
    return;
  }

  els.tradeStatusSummary.innerHTML = `
    <div class="summary-grid">
      ${rows.map(({ asset, state }) => `
        <article class="summary-card ${state.tone}">
          <span class="summary-label">${state.label}</span>
          <strong>${asset.name}</strong>
          <small>${state.detail}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPositions() {
  const entries = Object.entries(state.positions).filter(([, position]) => position.shares > 0);
  if (!entries.length) {
    els.positions.classList.add("empty");
    els.positions.innerHTML = "还没有虚拟持仓。先从市场页选一个标的，尝试用建议金额分批买入。";
    return;
  }
  els.positions.classList.remove("empty");
  els.positions.innerHTML = entries.map(([symbol, position]) => {
    const quote = quotes[symbol];
    const asset = ASSETS.find((item) => item.symbol === symbol);
    const value = quote ? position.shares * quote.price * quote.fx : 0;
    const pnl = value - position.cost;
    return `
      <article class="position-card">
        <div class="position-top">
          <div>
            <strong>${asset.name}</strong>
            <div class="position-meta">${position.shares.toFixed(4)} 份 · 成本 ${money(position.cost)}</div>
          </div>
          <div class="price">
            <b>${money(value)}</b>
            <span class="pnl ${pnl >= 0 ? "good" : "bad"}">${money(pnl)}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderPendingOrders() {
  const orders = state.pendingOrders || [];
  els.pendingOrders.innerHTML = orders.map((order) => {
    const asset = ASSETS.find((item) => item.symbol === order.symbol);
    const side = order.side === "buy" ? "买入" : "卖出";
    return `<li>${order.time} · ${side} ${asset?.name || order.symbol} ${money(order.amount)}，等待${asset?.market === "US" ? "美股" : "A股"}开盘后按模拟市价成交。</li>`;
  }).join("") || "<li>没有待成交订单。交易时间外下单会先放在这里。</li>";
}

function renderLog() {
  els.tradeLog.innerHTML = state.trades.slice(0, 20).map((trade) => {
    const action = trade.side === "buy" ? "买入" : "卖出";
    const quote = quotes[trade.symbol];
    const priceText = quote && trade.price ? `，成交价 ${formatPrice({ ...quote, price: trade.price })}` : "";
    const feeText = Number.isFinite(trade.fee) ? `，费用 ${money(trade.fee)}` : "";
    const feeItemsText = trade.feeItems?.length
      ? `（${trade.feeItems.map((item) => `${item.name}${money(item.amount)}`).join("，")}）`
      : "";
    const queuedText = trade.queued ? "，来自待成交订单" : "";
    return `<li>${trade.time} · ${action} ${trade.name} ${money(trade.amount)}${priceText}${feeText}${feeItemsText}${queuedText}。${escapeHtml(trade.reason || "未写理由")}</li>`;
  }).join("") || "<li>还没有交易记录。每次操作前写一句理由，复盘才有价值。</li>";
}

function renderInsights() {
  const cards = [];
  const ranked = Object.values(quotes).sort((a, b) => b.monthPct - a.monthPct);
  if (ranked.length) {
    cards.push({
      title: "动量不等于立刻追",
      body: `${ranked[0].name} 近一个月表现相对更强。模拟时可以观察：强势资产回撤后买，和直接追高买，结果有什么不同。`
    });
  }
  const deepest = Object.values(quotes).sort((a, b) => a.drawdown - b.drawdown)[0];
  if (deepest) {
    cards.push({
      title: "回撤是风险的可视化",
      body: `${deepest.name} 当前距离近月高点约 ${Math.abs(deepest.drawdown).toFixed(2)}%。下跌本身不代表便宜，要结合分批、仓位和持有周期。`
    });
  }
  cards.push({
    title: "建议金额的逻辑",
    body: "模拟器先看目标分散比例，再看现金和单笔上限。涨得太快会降低建议金额，出现回撤会略微提高练习金额，但始终保持分批。"
  });
  els.insights.innerHTML = cards.map((card) => `
    <article class="insight-card">
      <strong>${card.title}</strong>
      <p>${card.body}</p>
    </article>
  `).join("");
}

function openSheet(symbol) {
  selectedSymbol = symbol;
  const asset = ASSETS.find((item) => item.symbol === symbol);
  const quote = quotes[symbol];
  const suggestion = getSuggestion(symbol);
  els.tradeTitle.textContent = asset.name;
  els.tradeAssetType.textContent = asset.type;
  els.tradePrice.textContent = formatPrice(quote);
  els.tradeAmount.value = suggestion.amount || 100;
  els.tradeReason.value = suggestion.amount > 0 ? suggestion.summary : "";
  els.tradeHint.textContent = `${suggestion.summary} 这是模拟交易建议，不是真实买卖建议。`;
  els.tradeSheet.classList.add("open");
  els.tradeSheet.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  els.tradeSheet.classList.remove("open");
  els.tradeSheet.setAttribute("aria-hidden", "true");
}

function openLesson(kind, symbol) {
  const asset = ASSETS.find((item) => item.symbol === symbol);
  const quote = quotes[symbol];
  const suggestion = getSuggestion(symbol);
  const holdingValue = getHoldingValue(symbol);
  const position = state.positions[symbol];
  const holdingCost = position?.cost || 0;
  const holdingPnl = holdingValue - holdingCost;
  const market = getMarketStatus(asset);

  const lessons = {
    price: {
      tag: "行情",
      title: `${asset.name} 的价格和涨跌幅`,
      blocks: [
        ["这个价格是什么", `${formatPrice(quote)} 是这个 ETF 最近一次行情价格。美股标的是美元价格，A股标的是人民币价格。你的账户总资产统一折算成人民币显示。`],
        ["-1.90% / +1.28% 是什么", `这是最近一个交易日相对上一个收盘价的涨跌幅。它说明今天市场往哪个方向动，不代表你已经赚钱或亏钱。`],
        ["怎么用它", `价格和涨跌幅适合用来观察波动：大涨时避免冲动追高，大跌时也不要一次买满。模拟器会把这个波动放进“建议金额”的计算里。`],
        ["常见误区", `看到绿色不等于可以买，看到红色也不等于便宜。真正重要的是你的买入成本、持仓比例、计划周期和能承受的回撤。`]
      ]
    },
    suggestion: {
      tag: "建议金额",
      title: "为什么建议买这个金额",
      blocks: [
        ["建议金额是什么", `${suggestion.summary} 这是模拟器给你的练习金额，不是真实投资建议，也不会自动帮你真实下单。`],
        ["目标约是什么意思", `目标约 ${Math.round(asset.targetWeight * 100)}% 表示这个标的在模拟组合里理想占比。比如 50,000 元本金，15% 目标大约是 7,500 元。`],
        ["当前约是什么意思", `当前约表示你现在已经持有这个标的占总资产的比例。当前越接近目标，新增买入金额通常越小。`],
        ["为什么不是一次买够", `为了练习真实投资里的分批和仓位控制，单笔买入有上限。涨得快会降低建议金额，有回撤会略微提高练习金额，但不会鼓励满仓。`]
      ]
    },
    holding: {
      tag: "持仓",
      title: `${asset.name} 的持仓金额`,
      blocks: [
        ["已持仓是什么", `已持仓 ${money(holdingValue)} 是按当前行情估算出来的市值，不是现金。它会随着价格变化而变动。`],
        ["成本和份额是什么", `成本 ${money(holdingCost)} 是你累计投入到这个标的里的模拟本金；份额是你买到的数量。`],
        ["盈亏是什么", `${money(holdingPnl)} 是浮动盈亏，也就是当前市值减去成本。没有卖出前，它只是账面变化。`],
        ["怎么理解", `如果你卖出，模拟器会按交易时间、模拟成交价、滑点和手续费计算现金。持仓盈利不等于已经落袋。`]
      ]
    },
    market: {
      tag: "交易时间",
      title: "真实行情和交易时间",
      blocks: [
        ["当前市场状态", `${market.label}。交易时间内下单会模拟市价成交；休市时下单会进入待成交订单。`],
        ["为什么会这样", `真实市场不是 24 小时都能成交。股票和 ETF 通常需要在交易时间里撮合成交，基金赎回还会更慢。`]
      ]
    }
  };

  const lesson = lessons[kind] || lessons.price;
  els.lessonTag.textContent = lesson.tag;
  els.lessonTitle.textContent = lesson.title;
  els.lessonBody.innerHTML = lesson.blocks.map(([heading, body]) => `
    <section class="lesson-block">
      <strong>${heading}</strong>
      <p>${body}</p>
    </section>
  `).join("");
  els.lessonSheet.classList.add("open");
  els.lessonSheet.setAttribute("aria-hidden", "false");
}

function closeLesson() {
  els.lessonSheet.classList.remove("open");
  els.lessonSheet.setAttribute("aria-hidden", "true");
}

function trade(side) {
  const quote = quotes[selectedSymbol];
  const asset = ASSETS.find((item) => item.symbol === selectedSymbol);
  const amount = Number(els.tradeAmount.value);
  const reason = els.tradeReason.value.trim();
  if (!Number.isFinite(amount) || amount < 100) {
    els.tradeHint.textContent = "金额至少 100 元。";
    return;
  }
  const market = getMarketStatus(asset);

  if (!market.open) {
    queueOrder({ side, symbol: selectedSymbol, amount, reason });
    closeSheet();
    render();
    switchView("market");
    showStatus(`${asset.name} 现在不是交易时间，订单已进入“待成交订单”。开盘后刷新页面会按模拟市价成交。`);
    return;
  }

  executeOrder({ side, symbol: selectedSymbol, amount, reason, queued: false });
}

function executeOrder(order) {
  const quote = quotes[order.symbol];
  const asset = ASSETS.find((item) => item.symbol === order.symbol);
  const amount = order.amount;
  const reason = order.reason;
  const side = order.side;
  const position = state.positions[order.symbol] || { shares: 0, cost: 0 };
  const execution = getExecutionTerms(side, quote);
  let feeDetails = { total: 0, items: [] };

  if (side === "buy") {
    if (amount > state.cash) {
      els.tradeHint.textContent = "现金不够。规律练习：现金也是仓位的一部分。";
      return;
    }
    feeDetails = getFeeDetails({ amount, asset, side, shares: 0 });
    const investable = Math.max(0, amount - feeDetails.total);
    const shares = investable / (execution.price * quote.fx);
    position.shares += shares;
    position.cost += amount;
    state.cash -= amount;
  } else {
    const currentValue = position.shares * execution.price * quote.fx;
    if (currentValue <= 0) {
      els.tradeHint.textContent = "你还没有这个标的的持仓。";
      return;
    }
    const sellAmount = Math.min(amount, currentValue);
    const ratio = sellAmount / currentValue;
    const sharesSold = position.shares * ratio;
    feeDetails = getFeeDetails({ amount: sellAmount, asset, side, shares: sharesSold });
    position.shares *= (1 - ratio);
    position.cost *= (1 - ratio);
    state.cash += Math.max(0, sellAmount - feeDetails.total);
  }

  state.positions[order.symbol] = position;
  state.trades.unshift({
    side,
    symbol: order.symbol,
    name: asset.name,
    amount,
    reason,
    price: execution.price,
    slippage: execution.slippage,
    fee: feeDetails.total,
    feeItems: feeDetails.items,
    queued: order.queued,
    time: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
  });
  saveState();
  closeSheet();
  render();
  switchView("market");
  const action = side === "buy" ? "买入" : "卖出";
  const holdingValue = getHoldingValue(order.symbol);
  showStatus(`已${action} ${asset.name} ${money(amount)}，模拟成交价 ${formatPrice({ ...quote, price: execution.price })}，费用 ${money(feeDetails.total)}。现在持仓约 ${money(holdingValue)}，现金剩余 ${money(state.cash)}。`);
}

function showPendingNotice(symbol) {
  const asset = ASSETS.find((item) => item.symbol === symbol);
  const pendingBuy = getPendingAmount(symbol, "buy");
  const pendingSell = getPendingAmount(symbol, "sell");
  const amountText = pendingBuy > 0 ? `待买入 ${money(pendingBuy)}` : `待卖出 ${money(pendingSell)}`;
  showStatus(`${asset.name} 已经有订单在等待成交：${amountText}。不用重复操作，开盘后刷新页面会尝试成交。`);
}

function queueOrder(order) {
  state.pendingOrders = state.pendingOrders || [];
  state.pendingOrders.push({
    ...order,
    time: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
  });
  saveState();
}

function processPendingOrders() {
  if (!state.pendingOrders?.length || !Object.keys(quotes).length) return;
  const remaining = [];
  const executable = [];
  for (const order of state.pendingOrders) {
    const asset = ASSETS.find((item) => item.symbol === order.symbol);
    if (asset && quotes[order.symbol] && getMarketStatus(asset).open) {
      executable.push({ ...order, queued: true });
    } else {
      remaining.push(order);
    }
  }
  state.pendingOrders = remaining;
  for (const order of executable) executeOrder(order);
  saveState();
}

function getExecutionTerms(side, quote) {
  const baseSlip = Math.min(0.0012, Math.max(0.0003, quote.rangePct / 10000));
  const direction = side === "buy" ? 1 : -1;
  return {
    slippage: baseSlip,
    price: quote.price * (1 + direction * baseSlip)
  };
}

function getFeeDetails({ amount, asset, side, shares }) {
  const items = [];

  if (asset.market === "CN") {
    items.push({
      name: "券商佣金",
      amount: Math.max(FEE_MODEL.cnEtfMinCommission, amount * FEE_MODEL.cnEtfCommissionRate),
      note: "A股ETF默认按万3、最低5元模拟"
    });
    items.push({
      name: "印花税",
      amount: 0,
      note: "ETF买卖不按股票卖出印花税模拟"
    });
  } else {
    if (FEE_MODEL.usCommissionCny > 0) {
      items.push({ name: "券商佣金", amount: FEE_MODEL.usCommissionCny, note: "按固定佣金模拟" });
    }
    if (side === "sell") {
      const secFee = amount * FEE_MODEL.usSecSellRate;
      const tafUsd = Math.min(
        FEE_MODEL.usFinraTafMaxUsd,
        Math.max(FEE_MODEL.usFinraTafMinUsd, shares * FEE_MODEL.usFinraTafPerShareUsd)
      );
      items.push({ name: "SEC监管费", amount: secFee, note: "仅卖出，美股按成交金额估算" });
      items.push({ name: "FINRA TAF", amount: tafUsd * asset.fx, note: "仅卖出，按股数估算" });
    }
  }

  return {
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items
  };
}

function getMarketStatus(asset) {
  const now = new Date();
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const weekday = day >= 1 && day <= 5;
  if (!weekday) return { open: false, label: "休市" };

  if (asset.market === "CN") {
    const morning = minutes >= 570 && minutes <= 690;
    const afternoon = minutes >= 780 && minutes <= 900;
    return { open: morning || afternoon, label: morning || afternoon ? "A股交易中" : "A股休市" };
  }

  const usOpen = minutes >= 1290 || minutes <= 240;
  return { open: usOpen, label: usOpen ? "美股交易中" : "美股休市" };
}

function switchView(viewName) {
  document.querySelectorAll(".tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}View`).classList.add("active");
}

function showStatus(message) {
  els.statusToast.textContent = message;
  els.statusToast.classList.add("show");
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    els.statusToast.classList.remove("show");
  }, 6000);
}

function quickPlan(symbol) {
  const quote = quotes[symbol];
  const suggestion = getSuggestion(symbol);
  const message = `${suggestion.summary}\n\n原因：${suggestion.reasons.join("；")}。\n\n记住：这是为了练习仓位和纪律，不是真实下单建议。`;
  alert(message);
}

function resetPortfolio() {
  if (!confirm("确定重置模拟账户到 50,000 元吗？")) return;
  state.cash = STARTING_CASH;
  state.positions = {};
  state.trades = [];
  state.pendingOrders = [];
  saveState();
  render();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("investment-simulator-v1"));
    if (saved && !saved.pendingOrders) saved.pendingOrders = [];
    if (saved && Number.isFinite(saved.cash)) return saved;
  } catch {}
  return { cash: STARTING_CASH, positions: {}, trades: [], pendingOrders: [] };
}

function saveState() {
  localStorage.setItem("investment-simulator-v1", JSON.stringify(state));
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value || 0);
}

function formatPrice(quote) {
  const symbol = quote.currency === "USD" ? "$" : "¥";
  return `${symbol}${quote.price.toFixed(quote.price > 20 ? 2 : 3)}`;
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function sparkline(series, color) {
  const width = 320;
  const height = 48;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </svg>`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
