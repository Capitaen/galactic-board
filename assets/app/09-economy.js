// Generated from app-shell.js: economy, market, holdings, sector economy views

function canManageEconomyPolicy() {
  return currentAssignedRole() === 'Admin' || currentAssignedRole() === 'Galaktischer Senats Admin';
}

function formatCredits(value) {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(value || 0))} Cr`;
}

function formatSignedCredits(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${formatCredits(numeric)}`;
}

function formatSignedPercent(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2).replace('.', ',')} %`;
}

function formatMarketDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const MARKET_RANGE_OPTIONS = {
  today: { label: 'Heute', ms: 24 * 60 * 60 * 1000 },
  week: { label: '1 Woche', ms: 7 * 24 * 60 * 60 * 1000 },
  month: { label: '1 Monat', ms: 31 * 24 * 60 * 60 * 1000 },
  sixMonths: { label: '6 Monate', ms: 183 * 24 * 60 * 60 * 1000 }
};

const ACP_RANKING_SORT_OPTIONS = {
  cheap: 'Günstigste zuerst',
  expensive: 'Teuerste zuerst',
  scarcity: 'Stärkste Knappheit',
  surplus: 'Größter Überschuss',
  change_up: 'Stärkster Anstieg',
  change_down: 'Stärkster Fall'
};

function getMarketRangeCutoff(rangeKey = economyViewState.marketRange) {
  const option = MARKET_RANGE_OPTIONS[rangeKey] || MARKET_RANGE_OPTIONS.today;
  return Date.now() - option.ms;
}

function formatMarketAxisDate(value, rangeKey = economyViewState.marketRange) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  if (rangeKey === 'today') {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function setMarketRange(rangeKey) {
  economyViewState.marketRange = MARKET_RANGE_OPTIONS[rangeKey] ? rangeKey : 'today';
  renderEconomyView();
}

function renderMarketRangeControls() {
  return `<div class="market-range-controls" role="group" aria-label="Zeitraum">
    ${Object.entries(MARKET_RANGE_OPTIONS).map(([key, option]) => (
      `<button class="mini-btn ${economyViewState.marketRange === key ? 'active' : ''}" onclick="setMarketRange('${key}')">${option.label}</button>`
    )).join('')}
  </div>`;
}

function getMarketCooldownRemaining() {
  const next = economyViewState.nextPurchaseAt ? Date.parse(economyViewState.nextPurchaseAt) : 0;
  return Math.max(0, next - Date.now());
}

function updateEconomySectorQuery(input) {
  const cursor = input.selectionStart ?? input.value.length;
  economyViewState.sectorQuery = input.value;
  economyViewState.companySearchError = '';
  if (economySearchTimer) window.clearTimeout(economySearchTimer);
  const nextQuery = String(input.value || '').trim();
  if (nextQuery) {
    economySearchTimer = window.setTimeout(() => {
      void fetchEconomyCompanySearch(nextQuery, economyViewState.resourceFilter || 'all');
    }, 180);
  } else {
    economyViewState.searchResults = [];
  }
  renderEconomyView();
  const nextInput = document.getElementById('economySectorSearch');
  if (!nextInput) return;
  nextInput.focus();
  nextInput.setSelectionRange(cursor, cursor);
}

function getActiveEconomyCompanies() {
  const query = String(economyViewState.sectorQuery || '').trim();
  if (query) return economyViewState.searchResults || [];
  return economyViewState.featuredCompanies || economyViewState.companies || [];
}

function getEconomyCompanyById(companyId) {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return null;
  return (
    (economyViewState.companyDetailById && economyViewState.companyDetailById[normalizedCompanyId])
    || getActiveEconomyCompanies().find((entry) => entry.id === normalizedCompanyId)
    || (economyViewState.companies || []).find((entry) => entry.id === normalizedCompanyId)
    || (economyViewState.topLastHour || []).find((entry) => entry.id === normalizedCompanyId)
    || (economyViewState.portfolio?.positions || []).find((entry) => entry.companyId === normalizedCompanyId)
    || null
  );
}

function renderMarketSparkline(companyId) {
  const points = (economyViewState.history?.[companyId] || []).slice(-24);
  if (points.length < 2) return '<span class="muted">Noch keine Kursreihe</span>';
  const values = points.map((point) => Number(point.price || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const coords = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 220;
    const y = 54 - (((value - min) / span) * 48);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return `<svg viewBox="0 0 220 60" style="width:220px;height:60px"><polyline fill="none" stroke="${rising ? '#55d68b' : '#ff6b6b'}" stroke-width="3" points="${coords}"/></svg>`;
}

function renderMarketDetailChart(companyId) {
  const company = getEconomyCompanyById(companyId);
  const rangeKey = economyViewState.marketRange || 'today';
  const cutoff = getMarketRangeCutoff(rangeKey);
  const points = (economyViewState.history?.[companyId] || [])
    .map((point) => ({
      price: Number(point.price || 0),
      recordedAt: point.recordedAt,
      time: Date.parse(point.recordedAt)
    }))
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(point.time) && point.time >= cutoff);
  if (company) points.push({ price: Number(company.currentPrice || 0), recordedAt: new Date().toISOString(), time: Date.now() });
  if (points.length < 2) return '<div class="muted-box">Noch nicht genügend Kursdaten für diesen Zeitraum.</div>';
  const values = points.map((point) => point.price);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const timeSpan = Math.max(1, maxTime - minTime);
  const coords = points.map((point) => `${(70 + (((point.time - minTime) / timeSpan) * 790)).toFixed(1)},${(268 - (((point.price - min) / span) * 222)).toFixed(1)}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  const lowLabel = formatCredits(min);
  const midLabel = formatCredits(min + (span / 2));
  const highLabel = formatCredits(max);
  const startLabel = formatMarketAxisDate(minTime, rangeKey);
  const endLabel = formatMarketAxisDate(maxTime, rangeKey);
  return `<div class="market-detail-chart"><svg viewBox="0 0 900 320" preserveAspectRatio="none" aria-label="Kursverlauf">
    <line x1="70" y1="46" x2="860" y2="46" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="157" x2="860" y2="157" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.08)"/>
    <line x1="70" y1="46" x2="70" y2="268" stroke="rgba(255,255,255,.18)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.18)"/>
    <text x="18" y="168" class="market-axis-label" transform="rotate(-90 18 168)">Kurs (Credits)</text>
    <text x="442" y="314" text-anchor="middle" class="market-axis-label">Zeit</text>
    <text x="62" y="50" text-anchor="end" class="market-axis-tick">${highLabel}</text>
    <text x="62" y="161" text-anchor="end" class="market-axis-tick">${midLabel}</text>
    <text x="62" y="272" text-anchor="end" class="market-axis-tick">${lowLabel}</text>
    <text x="70" y="292" text-anchor="middle" class="market-axis-tick">${startLabel}</text>
    <text x="860" y="292" text-anchor="middle" class="market-axis-tick">${endLabel}</text>
    <polyline fill="none" stroke="${rising ? '#55d68b' : '#ff6b6b'}" stroke-width="4" points="${coords}"/>
  </svg></div>`;
}

function renderMarketOrderList(company) {
  if (!economyViewState.portfolioEnabled) return '';
  const orders = (economyViewState.purchaseOrders || []).filter((order) => order.companyId === company.id);
  if (!orders.length) {
    return `<div class="workspace-section market-order-list">
      <h3>Auftragsliste</h3>
      <div class="muted-box">Noch keine Kaufaufträge für diese Aktie.</div>
    </div>`;
  }
  const currentPrice = Number(company.currentPrice || 0);
  return `<div class="workspace-section market-order-list">
    <h3>Auftragsliste</h3>
    <table class="data-table">
      <thead><tr><th>Datum & Uhrzeit</th><th>Menge</th><th>Kaufwert</th><th>Veränderung</th></tr></thead>
      <tbody>${orders.map((order) => {
        const quantity = Number(order.quantity || 0);
        const totalValue = Number(order.totalValue || 0);
        const currentValue = currentPrice * quantity;
        const changeCredits = Math.round((currentValue - totalValue) * 100) / 100;
        const changePercent = totalValue > 0 ? (changeCredits / totalValue) * 100 : 0;
        const changeClass = changeCredits >= 0 ? 'market-change-positive' : 'market-change-negative';
        return `<tr>
          <td>${formatMarketDateTime(order.createdAt)}</td>
          <td>${quantity}</td>
          <td>${formatCredits(totalValue)}</td>
          <td class="${changeClass}">${formatSignedPercent(changePercent)} / ${formatSignedCredits(changeCredits)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

function getPortfolioPosition(companyId) {
  return (economyViewState.portfolio?.positions || []).find((position) => position.companyId === companyId) || null;
}

function renderSellPreview(company, quantity = 1) {
  const qty = Math.max(1, Math.floor(Number(quantity || 1)));
  const currentPrice = Number(company.currentPrice || 0);
  const gross = currentPrice * qty;
  const tax = gross * 0.02;
  const net = gross - tax;
  const position = getPortfolioPosition(company.id);
  const costBasis = Number(position?.averageCost || currentPrice) * qty;
  const estimatedProfit = net - costBasis;
  return `<div class="trade-preview" id="sellPreview_${company.id}">
    <p><strong>Brutto:</strong> ${formatCredits(gross)}</p>
    <p><strong>Republikanische Handelssteuer 2%:</strong> ${formatCredits(tax)}</p>
    <p><strong>Netto:</strong> ${formatCredits(net)}</p>
    <p><strong>Geschätzter Gewinn/Verlust:</strong> <span class="${estimatedProfit >= 0 ? 'market-change-positive' : 'market-change-negative'}">${formatSignedCredits(estimatedProfit)}</span></p>
  </div>`;
}

function renderOwnershipPie(company) {
  const rows = Array.isArray(company.majorShareholders) ? company.majorShareholders : [];
  if (!rows.length) return '<div class="muted-box">Noch keine Anteilseignerstruktur berechnet.</div>';
  const colors = ['#73e0ff', '#f0d44b', '#ff8a65', '#9d8cff', '#55d68b', '#ff6b6b', '#c5e1ff', '#b9c4d6'];
  let offset = 0;
  const circumference = 100;
  const circles = rows.map((row, index) => {
    const length = Math.max(0, Number(row.percent || 0));
    const dash = `${length} ${Math.max(0, circumference - length)}`;
    const circle = `<circle cx="50" cy="50" r="34" stroke="${colors[index % colors.length]}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"/>`;
    offset += length;
    return circle;
  }).join('');
  return `<div class="ownership-layout">
    <svg class="ownership-pie" viewBox="0 0 100 100" aria-label="Anteilseigner-Kreisdiagramm">
      <circle cx="50" cy="50" r="34" stroke="rgba(255,255,255,.08)"/>
      ${circles}
      <text x="50" y="48" text-anchor="middle" class="market-axis-label">${Number(company.totalShares || 0).toLocaleString('de-DE')}</text>
      <text x="50" y="61" text-anchor="middle" class="market-axis-tick">Aktien</text>
    </svg>
    <div class="ownership-legend">
      ${rows.map((row, index) => `<div class="ownership-legend-row">
        <span class="ownership-swatch" style="background:${colors[index % colors.length]}"></span>
        <span><strong>${escapeLoginManagerText(row.name)}</strong><br><small>${escapeLoginManagerText(row.type)} • ${Number(row.shares || 0).toLocaleString('de-DE')} Aktien</small></span>
        <span>${Number(row.percent || 0).toFixed(2).replace('.', ',')} %</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderPortfolioValueChart() {
  const rangeKey = economyViewState.marketRange || 'today';
  const cutoff = getMarketRangeCutoff(rangeKey);
  const points = (economyViewState.portfolioHistory || [])
    .map((point) => ({
      value: Number(point.totalValue || 0),
      createdAt: point.createdAt,
      time: Date.parse(point.createdAt)
    }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time) && point.time >= cutoff);
  if (points.length < 2) return '<div class="muted-box">Noch nicht genügend Portfolio-Historie für diesen Zeitraum.</div>';
  const values = points.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const timeSpan = Math.max(1, maxTime - minTime);
  const coords = points.map((point) => `${(70 + (((point.time - minTime) / timeSpan) * 790)).toFixed(1)},${(268 - (((point.value - min) / span) * 222)).toFixed(1)}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return `<div class="market-detail-chart"><svg viewBox="0 0 900 320" preserveAspectRatio="none" aria-label="Portfolio-Wertverlauf">
    <line x1="70" y1="46" x2="860" y2="46" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="157" x2="860" y2="157" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.08)"/>
    <line x1="70" y1="46" x2="70" y2="268" stroke="rgba(255,255,255,.18)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.18)"/>
    <text x="18" y="168" class="market-axis-label" transform="rotate(-90 18 168)">Gesamtwert</text>
    <text x="442" y="314" text-anchor="middle" class="market-axis-label">Zeit</text>
    <text x="62" y="50" text-anchor="end" class="market-axis-tick">${formatCredits(max)}</text>
    <text x="62" y="161" text-anchor="end" class="market-axis-tick">${formatCredits(min + (span / 2))}</text>
    <text x="62" y="272" text-anchor="end" class="market-axis-tick">${formatCredits(min)}</text>
    <text x="70" y="292" text-anchor="middle" class="market-axis-tick">${formatMarketAxisDate(minTime, rangeKey)}</text>
    <text x="860" y="292" text-anchor="middle" class="market-axis-tick">${formatMarketAxisDate(maxTime, rangeKey)}</text>
    <polyline fill="none" stroke="${rising ? '#55d68b' : '#ff6b6b'}" stroke-width="4" points="${coords}"/>
  </svg></div>`;
}

function renderPortfolioSection() {
  const portfolio = economyViewState.portfolio;
  if (!economyViewState.portfolioEnabled || !portfolio) {
    workspacePanel.innerHTML = `<div class="workspace-head">
      <div><h2>Portfolio</h2><p>Diese Rolle besitzt kein persönliches Portfolio.</p></div>
      <div class="toolbar-row end"><button class="mini-btn" onclick="setEconomySection('overview')">Zur Übersicht</button><button class="mini-btn" onclick="setEconomySection('trade')">Aktienhandel</button></div>
    </div>`;
    return;
  }
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div><h2>Portfolio</h2><p>Persönliche Bestände, FIFO-Kostenbasis, Steuern und Wertverlauf.</p></div>
      <div class="toolbar-row end">
        <button class="mini-btn" onclick="setEconomySection('overview')">Zur Übersicht</button>
        <button class="mini-btn" onclick="setEconomySection('trade')">Aktienhandel</button>
        <button class="mini-btn" onclick="fetchEconomyView()">Aktualisieren</button>
      </div>
    </div>
    ${economyViewState.error ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.error)}</div>` : ''}
    <div class="workspace-grid">
      <div class="stat-card"><strong>Creditguthaben</strong><span>${formatCredits(portfolio.cashBalance)}</span></div>
      <div class="stat-card"><strong>Portfolio-Gesamtwert</strong><span>${formatCredits(portfolio.totalValue)}</span></div>
      <div class="stat-card"><strong>Investiert gesamt</strong><span>${formatCredits(portfolio.investedTotal)}</span></div>
      <div class="stat-card"><strong>Unrealisiert</strong><span class="${Number(portfolio.unrealizedProfit || 0) >= 0 ? 'market-change-positive' : 'market-change-negative'}">${formatSignedCredits(portfolio.unrealizedProfit)}</span></div>
      <div class="stat-card"><strong>Realisiert</strong><span class="${Number(portfolio.realizedProfit || 0) >= 0 ? 'market-change-positive' : 'market-change-negative'}">${formatSignedCredits(portfolio.realizedProfit)}</span></div>
      <div class="stat-card"><strong>Gezahlte Steuern</strong><span>${formatCredits(portfolio.taxesPaid)}</span></div>
      <div class="stat-card"><strong>Holdings</strong><span>${portfolio.holdingCount || 0}</span></div>
      <div class="stat-card"><strong>Ranglistenplatz</strong><span>${portfolio.rank || '-'}</span></div>
    </div>
    <div class="workspace-section"><h3>Portfolio-Wert</h3>${renderMarketRangeControls()}${renderPortfolioValueChart()}</div>
    <div class="workspace-section">
      <h3>Bestände</h3>
      <div class="workspace-card">
        <table class="data-table">
          <thead><tr><th>Holding</th><th>Sektor</th><th>Ressourcen</th><th>Menge</th><th>Ø Einstieg</th><th>Kurs</th><th>Wert</th><th>G/V</th><th>Status</th><th></th></tr></thead>
          <tbody>${(portfolio.positions || []).map((position) => {
            const gainClass = Number(position.gainCredits || 0) >= 0 ? 'market-change-positive' : 'market-change-negative';
            return `<tr>
              <td><strong>${escapeLoginManagerText(position.name)}</strong><br><small>${escapeLoginManagerText(position.symbol || '')}</small>
                <details class="portfolio-row-details"><summary>Käufe</summary>
                  <table class="data-table">
                    <tbody>${(position.orders || []).map((order) => `<tr><td>${formatMarketDateTime(order.createdAt)}</td><td>${Number(order.openQuantity || 0)} Stk.</td><td>${formatCredits(Number(order.unitPrice || 0) * Number(order.openQuantity || 0))}</td><td>${formatCredits(order.currentValue)}</td><td class="${Number(order.changeCredits || 0) >= 0 ? 'market-change-positive' : 'market-change-negative'}">${formatSignedCredits(order.changeCredits)}</td></tr>`).join('') || '<tr><td>Keine offenen Lots.</td></tr>'}</tbody>
                  </table>
                </details>
              </td>
              <td>${escapeLoginManagerText(position.sector || '-')}</td>
              <td>${(position.resourceRefs || [position.resourceKey]).map((key) => escapeLoginManagerText(RESOURCE_LABELS[key] || key)).join(', ')}</td>
              <td>${position.quantity}</td>
              <td>${formatCredits(position.averageCost)}</td>
              <td>${formatCredits(position.currentPrice)}</td>
              <td>${formatCredits(position.currentValue)}</td>
              <td class="${gainClass}">${formatSignedCredits(position.gainCredits)}<br><small>${formatSignedPercent(position.gainPercent)}</small></td>
              <td>${escapeLoginManagerText(position.marketStatusLabel || position.marketStatus || 'Handelbar')}</td>
              <td><button class="mini-btn" onclick="openMarketCompanyOverview('${position.companyId}')">Zur Holding</button></td>
            </tr>`;
          }).join('') || '<tr><td colspan="10">Noch keine Aktien im Portfolio.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function renderAcpChart(resourceKey) {
  const rangeKey = economyViewState.marketRange || 'today';
  const cutoff = getMarketRangeCutoff(rangeKey);
  const label = RESOURCE_LABELS[resourceKey] || resourceKey;
  const points = (economyViewState.acp?.history?.[resourceKey] || [])
    .map((point) => ({
      price: Number(point.price || 0),
      recordedAt: point.recordedAt,
      time: Date.parse(point.recordedAt)
    }))
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(point.time) && point.time >= cutoff);
  if (points.length < 2) return `<div class="muted-box">Noch nicht genügend ACP-Daten für ${escapeLoginManagerText(label)}.</div>`;
  const values = points.map((point) => point.price);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const minTime = Math.min(...points.map((point) => point.time));
  const maxTime = Math.max(...points.map((point) => point.time));
  const timeSpan = Math.max(1, maxTime - minTime);
  const coords = points.map((point) => `${(70 + (((point.time - minTime) / timeSpan) * 790)).toFixed(1)},${(268 - (((point.price - min) / span) * 222)).toFixed(1)}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return `<div class="market-detail-chart"><svg viewBox="0 0 900 320" preserveAspectRatio="none" aria-label="ACP Verlauf">
    <line x1="70" y1="46" x2="860" y2="46" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="157" x2="860" y2="157" stroke="rgba(255,255,255,.08)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.08)"/>
    <line x1="70" y1="46" x2="70" y2="268" stroke="rgba(255,255,255,.18)"/><line x1="70" y1="268" x2="860" y2="268" stroke="rgba(255,255,255,.18)"/>
    <text x="18" y="168" class="market-axis-label" transform="rotate(-90 18 168)">Ø Preis (Credits)</text>
    <text x="442" y="314" text-anchor="middle" class="market-axis-label">Zeit</text>
    <text x="62" y="50" text-anchor="end" class="market-axis-tick">${formatCredits(max)}</text>
    <text x="62" y="161" text-anchor="end" class="market-axis-tick">${formatCredits(min + (span / 2))}</text>
    <text x="62" y="272" text-anchor="end" class="market-axis-tick">${formatCredits(min)}</text>
    <text x="70" y="292" text-anchor="middle" class="market-axis-tick">${formatMarketAxisDate(minTime, rangeKey)}</text>
    <text x="860" y="292" text-anchor="middle" class="market-axis-tick">${formatMarketAxisDate(maxTime, rangeKey)}</text>
    <polyline fill="none" stroke="${rising ? '#55d68b' : '#ff6b6b'}" stroke-width="4" points="${coords}"/>
  </svg></div>`;
}

function renderAcpRankingTable() {
  const ranking = economyViewState.acpRanking || { sectors: [] };
  const rows = Array.isArray(ranking.sectors) ? ranking.sectors : [];
  if (economyViewState.acpRankingLoading && !rows.length) {
    return '<div class="muted-box">Sektorales Ressourcenpreis-Ranking wird geladen...</div>';
  }
  if (economyViewState.acpRankingError) {
    return `<div class="muted-box">${escapeLoginManagerText(economyViewState.acpRankingError)}</div>`;
  }
  if (!rows.length) {
    return '<div class="muted-box">Noch keine sektoralen Ressourcenpreise vorhanden.</div>';
  }
  return `<table class="data-table">
    <thead><tr><th>Rang</th><th>Sektor</th><th>Kontrolle</th><th>Aktueller Preis</th><th>Basispreis</th><th>Veränderung</th><th>Nachfrage</th><th>Angebot</th><th>Überschuss / Knappheit</th><th>Marktstatus</th></tr></thead>
    <tbody>${rows.map((entry) => {
      const changeClass = Number(entry.change || 0) >= 0 ? 'market-change-positive' : 'market-change-negative';
      const balanceClass = entry.surplusRatio < 0.9 ? 'market-change-negative' : (entry.surplusRatio > 1.1 ? 'market-change-positive' : '');
      const controlLabel = entry.isEmbargoed ? `${entry.controlStatus} / Embargo` : entry.controlStatus;
      return `<tr>
        <td>${entry.rank}</td>
        <td><button class="mini-btn" onclick="openEconomySectorFromAcp('${entry.sectorId}')">${escapeLoginManagerText(entry.sectorName)}</button></td>
        <td>${escapeLoginManagerText(controlLabel || '-')}</td>
        <td>${formatCredits(entry.currentPrice)}</td>
        <td>${formatCredits(entry.basePrice)}</td>
        <td class="${changeClass}">${formatSignedCredits(entry.change)}<br><small>${formatSignedPercent(entry.changePercent)}</small></td>
        <td>${Number(entry.demandScore || 0).toFixed(2).replace('.', ',')}</td>
        <td>${Number(entry.supplyScore || 0).toFixed(2).replace('.', ',')}</td>
        <td class="${balanceClass}">${escapeLoginManagerText(entry.balanceLabel || 'Ausgeglichen')}<br><small>Ratio ${Number(entry.surplusRatio || 0).toFixed(2).replace('.', ',')}</small></td>
        <td>${escapeLoginManagerText(entry.marketStatusLabel || 'Normal')}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function updateMarketQuantity(kind, companyId, value) {
  const range = document.getElementById(`${kind}Quantity_${companyId}`);
  const output = document.getElementById(`${kind}QuantityOutput_${companyId}`);
  const quantity = Math.max(1, Math.floor(Number(value || 1)));
  if (range) range.value = String(Math.min(quantity, Number(range.max || quantity)));
  if (output) output.value = range?.value || String(quantity);
  if (kind === 'sell') {
    const company = getEconomyCompanyById(companyId);
    const preview = document.getElementById(`sellPreview_${companyId}`);
    if (company && preview) {
      preview.outerHTML = renderSellPreview(company, range?.value || quantity);
    }
  }
}

async function readJsonResponse(response, fallbackMessage = 'Anfrage fehlgeschlagen.') {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  const error = new Error(text.trim().startsWith('<')
    ? `${fallbackMessage} Der Server hat HTML statt JSON geliefert. Bitte Server neu starten oder API-Route prüfen.`
    : (text.trim() || fallbackMessage));
  error.status = response.status;
  throw error;
}

async function fetchEconomyView(options = {}) {
  if (economyViewState.loading) return;
  const renderLoading = options.renderLoading !== false;
  let loadedSuccessfully = false;
  economyViewState.loading = true;
  economyViewState.error = '';
  if (renderLoading && activeMainTab === 'economy') renderEconomyView();
  try {
    const response = await fetch('/api/economy/market/summary', { credentials: 'include' });
    const payload = await readJsonResponse(response, 'Wirtschaftsdaten konnten nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'Wirtschaftsdaten konnten nicht geladen werden.');
    const summaryCompanies = Array.isArray(payload.companies) ? payload.companies : [];
    const summaryHistory = payload.history && typeof payload.history === 'object' ? payload.history : {};
    Object.assign(economyViewState, payload, {
      loaded: true,
      lastLoadedAt: Date.now(),
      companies: summaryCompanies,
      featuredCompanies: summaryCompanies,
      history: summaryHistory,
      searchResults: String(economyViewState.sectorQuery || '').trim() ? economyViewState.searchResults : []
    });
    loadedSuccessfully = summaryCompanies.length > 0;
    if (economyViewState.activeSection === 'acp') {
      void fetchAcpRanking({
        resourceType: economyViewState.acpSelectedResource,
        sort: economyViewState.acpRankingSort
      });
    }
    if (options.markBootReady) markBootTask('economyReady', loadedSuccessfully);
  } catch (error) {
    economyViewState.error = error.message;
    if (options.markBootReady) markBootTask('economyReady', false);
  } finally {
    economyViewState.loading = false;
    if (activeMainTab === 'economy') renderEconomyView();
  }
  return loadedSuccessfully;
}

async function fetchEconomyCompanySearch(query, resourceFilter = 'all') {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    economyViewState.searchResults = [];
    economyViewState.companySearchLoading = false;
    economyViewState.companySearchError = '';
    if (activeMainTab === 'economy') renderEconomyView();
    return;
  }
  economyViewState.companySearchLoading = true;
  economyViewState.companySearchError = '';
  if (activeMainTab === 'economy') renderEconomyView();
  try {
    const url = `/api/economy/market/search?q=${encodeURIComponent(normalizedQuery)}&resource=${encodeURIComponent(resourceFilter || 'all')}&limit=60`;
    const response = await fetch(url, { credentials: 'include' });
    const payload = await readJsonResponse(response, 'Aktiensuche konnte nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'Aktiensuche konnte nicht geladen werden.');
    economyViewState.searchResults = payload.companies || [];
    economyViewState.history = {
      ...(economyViewState.history || {}),
      ...(payload.history || {})
    };
  } catch (error) {
    economyViewState.companySearchError = error.message;
  } finally {
    economyViewState.companySearchLoading = false;
    if (activeMainTab === 'economy') renderEconomyView();
  }
}

async function fetchMarketCompanyDetail(companyId, options = {}) {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) return;
  if (economyViewState.companyDetailLoadingId === normalizedCompanyId && !options.force) return;
  const renderLoading = options.renderLoading !== false;
  economyViewState.companyDetailLoadingId = normalizedCompanyId;
  economyViewState.companyDetailError = '';
  if (renderLoading && activeMainTab === 'economy' && economyViewState.activeSection === 'detail' && economyViewState.selectedCompanyId === normalizedCompanyId) {
    renderEconomyView();
  }
  try {
    const response = await fetch(`/api/economy/companies/${encodeURIComponent(normalizedCompanyId)}`, { credentials: 'include' });
    const payload = await readJsonResponse(response, 'Holding-Details konnten nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'Holding-Details konnten nicht geladen werden.');
    economyViewState.companyDetailById = {
      ...(economyViewState.companyDetailById || {}),
      [normalizedCompanyId]: payload.company || null
    };
  } catch (error) {
    economyViewState.companyDetailError = error.message;
  } finally {
    if (economyViewState.companyDetailLoadingId === normalizedCompanyId) {
      economyViewState.companyDetailLoadingId = '';
    }
    if (activeMainTab === 'economy' && economyViewState.activeSection === 'detail' && economyViewState.selectedCompanyId === normalizedCompanyId) {
      renderEconomyView();
    }
  }
}

async function buyMarketShare(companyId) {
  if (getMarketCooldownRemaining() > 0) return;
  const quantity = economyViewState.consumerMode
    ? 1
    : Math.max(1, Math.floor(Number(document.getElementById(`buyQuantity_${companyId}`)?.value || 1)));
  try {
    const response = await fetch('/api/economy/market/buy', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, quantity })
    });
    const payload = await readJsonResponse(response, 'Aktienkauf fehlgeschlagen.');
    if (!response.ok) {
      if (payload.nextPurchaseAt) economyViewState.nextPurchaseAt = payload.nextPurchaseAt;
      throw new Error(payload.error || 'Aktienkauf fehlgeschlagen.');
    }
    economyViewState.nextPurchaseAt = payload.purchase?.nextPurchaseAt || null;
    setStatus(payload.purchase?.purchaseType === 'consumer'
      ? 'Die Nachfrage wurde am Markt registriert. Es entsteht kein persönlicher Besitz.'
      : `${payload.purchase?.quantity || quantity} Aktie(n) wurden dem persönlichen Portfolio hinzugefügt. Abgebucht: ${formatCredits(payload.purchase?.totalCost || 0)}.`);
    await fetchEconomyView();
  } catch (error) {
    setStatus(error.message);
    renderEconomyView();
  }
}

async function sellMarketShare(companyId) {
  const quantity = Math.max(1, Math.floor(Number(document.getElementById(`sellQuantity_${companyId}`)?.value || 1)));
  try {
    const response = await fetch('/api/economy/market/sell', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, quantity })
    });
    const payload = await readJsonResponse(response, 'Aktienverkauf fehlgeschlagen.');
    if (!response.ok) throw new Error(payload.error || 'Aktienverkauf fehlgeschlagen.');
    setStatus(`Aktie verkauft. Brutto ${formatCredits(payload.sale?.grossProceeds || 0)}, Steuer ${formatCredits(payload.sale?.taxAmount || 0)}, netto ${formatCredits(payload.sale?.netProceeds || payload.sale?.credited || 0)}.`);
    await fetchEconomyView();
  } catch (error) {
    setStatus(error.message);
    renderEconomyView();
  }
}

function setEconomySection(section) {
  economyViewState.activeSection = ['trade', 'detail', 'portfolio', 'acp', 'sectorEconomy'].includes(section) ? section : 'overview';
  renderEconomyView();
  if (economyViewState.activeSection === 'sectorEconomy') void fetchSectorEconomyList();
  if (economyViewState.activeSection === 'acp') void fetchAcpRanking();
}

function openMarketCompanyOverview(companyId) {
  economyViewState.selectedCompanyId = companyId;
  economyViewState.activeSection = 'detail';
  economyViewState.companyDetailError = '';
  renderEconomyView();
  void fetchMarketCompanyDetail(companyId, { renderLoading: false });
}

async function refreshSelectedMarketCompany() {
  const companyId = String(economyViewState.selectedCompanyId || '').trim();
  await fetchEconomyView({ renderLoading: false });
  if (String(economyViewState.sectorQuery || '').trim()) {
    await fetchEconomyCompanySearch(economyViewState.sectorQuery, economyViewState.resourceFilter || 'all');
  }
  if (companyId) await fetchMarketCompanyDetail(companyId, { renderLoading: false, force: true });
  if (activeMainTab === 'economy') renderEconomyView();
}

async function fetchSectorEconomyList(options = {}) {
  if (economyViewState.sectorEconomyLoading && !options.force) return;
  economyViewState.sectorEconomyLoading = true;
  economyViewState.sectorEconomyError = '';
  if (activeMainTab === 'economy') renderEconomyView();
  try {
    const response = await fetch('/api/economy/sectors', { credentials: 'include' });
    const payload = await readJsonResponse(response, 'Sektor-Wirtschaft konnte nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'Sektor-Wirtschaft konnte nicht geladen werden.');
    economyViewState.economySectors = payload.sectors || [];
    economyViewState.canBuySectorResources = Boolean(payload.canBuyResources);
    economyViewState.canManageSectorEmbargo = Boolean(payload.canManageEmbargo);
    if (!economyViewState.selectedEconomySectorId && economyViewState.economySectors.length) {
      economyViewState.selectedEconomySectorId = economyViewState.economySectors[0].id;
    }
    if (economyViewState.selectedEconomySectorId) {
      await fetchSectorEconomyDetail(economyViewState.selectedEconomySectorId, { renderLoading: false });
    }
  } catch (error) {
    economyViewState.sectorEconomyError = error.message;
  } finally {
    economyViewState.sectorEconomyLoading = false;
    if (activeMainTab === 'economy') renderEconomyView();
  }
}

async function fetchSectorEconomyDetail(sectorId, options = {}) {
  const renderLoading = options.renderLoading !== false;
  economyViewState.sectorEconomyError = '';
  economyViewState.selectedEconomySectorId = sectorId;
  if (renderLoading) {
    economyViewState.sectorEconomyLoading = true;
    renderEconomyView();
  }
  try {
    const response = await fetch(`/api/economy/sectors/${encodeURIComponent(sectorId)}`, { credentials: 'include' });
    const payload = await readJsonResponse(response, 'Sektor-Wirtschaft konnte nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'Sektor-Wirtschaft konnte nicht geladen werden.');
    economyViewState.selectedEconomySector = payload.sector || null;
    economyViewState.canBuySectorResources = Boolean(payload.canBuyResources);
    economyViewState.canManageSectorEmbargo = Boolean(payload.canManageEmbargo);
  } catch (error) {
    economyViewState.sectorEconomyError = error.message;
  } finally {
    economyViewState.sectorEconomyLoading = false;
    renderEconomyView();
  }
}

function selectEconomySector(value) {
  economyViewState.selectedEconomySectorId = value;
  void fetchSectorEconomyDetail(value);
}

function setSectorPurchaseResourceType(value) {
  economyViewState.sectorPurchaseResourceType = value;
  renderEconomyView();
}

function setSectorPurchaseQuantity(value) {
  economyViewState.sectorPurchaseQuantity = Math.max(1, Math.floor(Number(value || 1)));
  renderEconomyView();
}

async function buySectorResource() {
  const sectorId = economyViewState.selectedEconomySectorId;
  if (!sectorId || economyViewState.sectorEconomyLoading) return;
  try {
    const response = await fetch(`/api/economy/sectors/${encodeURIComponent(sectorId)}/buy-resource`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: economyViewState.sectorPurchaseResourceType,
        quantity: economyViewState.sectorPurchaseQuantity
      })
    });
    const payload = await readJsonResponse(response, 'Ressourcenkauf fehlgeschlagen.');
    if (!response.ok) throw new Error(payload.error || 'Ressourcenkauf fehlgeschlagen.');
    economyViewState.selectedEconomySector = payload.sector || economyViewState.selectedEconomySector;
    setStatus(`${payload.purchase?.quantity || 0} ${RESOURCE_LABELS[payload.purchase?.resourceType] || 'Ressourcen'} gekauft. Kosten: ${formatCredits(payload.purchase?.totalPrice || 0)}.`);
    await fetchEconomyView({ renderLoading: false });
    await fetchSectorEconomyDetail(sectorId, { renderLoading: false });
  } catch (error) {
    setStatus(error.message);
    economyViewState.sectorEconomyError = error.message;
    renderEconomyView();
  }
}

async function setEconomySectorEmbargo(isEmbargoed) {
  const sectorId = economyViewState.selectedEconomySectorId;
  if (!sectorId || !economyViewState.canManageSectorEmbargo) return;
  try {
    const response = await fetch(`/api/economy/sectors/${encodeURIComponent(sectorId)}/embargo`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEmbargoed })
    });
    const payload = await readJsonResponse(response, 'Embargo konnte nicht aktualisiert werden.');
    if (!response.ok) throw new Error(payload.error || 'Embargo konnte nicht aktualisiert werden.');
    economyViewState.selectedEconomySector = payload.sector || null;
    setStatus(isEmbargoed ? 'Embargo verhängt.' : 'Embargo aufgehoben.');
    await fetchSectorEconomyList({ force: true });
  } catch (error) {
    setStatus(error.message);
    renderEconomyView();
  }
}

function openSectorHolding(companyId) {
  openMarketCompanyOverview(companyId);
}

async function saveEconomyPolicy() {
  if (!canManageEconomyPolicy()) return;
  const taxRate = Number(document.getElementById('economyTaxRate')?.value || 0) / 100;
  const subsidy = document.getElementById('economySubsidy')?.value || 'none';
  try {
    const response = await fetch('/api/economy/policy', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxRate, subsidy })
    });
    const payload = await readJsonResponse(response, 'Wirtschaftspolitik konnte nicht gespeichert werden.');
    if (!response.ok) throw new Error(payload.error || 'Wirtschaftspolitik konnte nicht gespeichert werden.');
    economyViewState.policy = payload.policy;
    setStatus('Wirtschaftspolitik des Senats gespeichert.');
    renderEconomyView();
  } catch (error) {
    setStatus(error.message);
  }
}

async function fetchAcpRanking(options = {}) {
  const force = Boolean(options.force);
  if (economyViewState.acpRankingLoading && !force) return;
  const resourceType = String(options.resourceType || economyViewState.acpSelectedResource || 'quadraniumErz');
  const sort = String(options.sort || economyViewState.acpRankingSort || 'cheap');
  economyViewState.acpRankingLoading = true;
  economyViewState.acpRankingError = '';
  economyViewState.acpSelectedResource = resourceType;
  economyViewState.acpRankingSort = sort;
  if (activeMainTab === 'economy' && economyViewState.activeSection === 'acp') renderEconomyView();
  try {
    const response = await fetch(`/api/economy/acp/ranking?resourceType=${encodeURIComponent(resourceType)}&sort=${encodeURIComponent(sort)}`, { credentials: 'include' });
    const payload = await readJsonResponse(response, 'ACP-Ranking konnte nicht geladen werden.');
    if (!response.ok) throw new Error(payload.error || 'ACP-Ranking konnte nicht geladen werden.');
    economyViewState.acpRanking = payload || { resourceType, sectors: [] };
  } catch (error) {
    economyViewState.acpRankingError = error.message;
  } finally {
    economyViewState.acpRankingLoading = false;
    if (activeMainTab === 'economy' && economyViewState.activeSection === 'acp') renderEconomyView();
  }
}

function setAcpRankingResource(resourceType) {
  economyViewState.acpSelectedResource = resourceType;
  void fetchAcpRanking({ resourceType, sort: economyViewState.acpRankingSort, force: true });
}

function setAcpRankingSort(sort) {
  economyViewState.acpRankingSort = sort;
  void fetchAcpRanking({ resourceType: economyViewState.acpSelectedResource, sort, force: true });
}

async function openEconomySectorFromAcp(sectorId) {
  const normalizedSectorId = String(sectorId || '').trim();
  if (!normalizedSectorId) return;
  economyViewState.selectedEconomySectorId = normalizedSectorId;
  economyViewState.activeSection = 'sectorEconomy';
  renderEconomyView();
  if (!Array.isArray(economyViewState.economySectors) || !economyViewState.economySectors.length) {
    await fetchSectorEconomyList({ force: true });
    return;
  }
  await fetchSectorEconomyDetail(normalizedSectorId, { renderLoading: true });
}

function renderEconomyMetricCard(label, metric) {
  const value = typeof metric === 'object' ? metric.label : metric;
  return `<div class="stat-card"><strong>${escapeLoginManagerText(label)}</strong><span>${escapeLoginManagerText(value || 'Mittel')}</span></div>`;
}

function renderSectorResourcePriceRows(resourcePrices = []) {
  return resourcePrices.map((price) => {
    const change = Number(price.change || 0);
    const chainLabel = price.chainSourceResource ? (RESOURCE_LABELS[price.chainSourceResource] || price.chainSourceResource) : 'Keine';
    return `<tr>
      <td>${escapeLoginManagerText(price.label || RESOURCE_LABELS[price.resourceType] || price.resourceType)}</td>
      <td>${formatCredits(price.currentPrice)}</td>
      <td style="color:${change >= 0 ? '#55d68b' : '#ff6b6b'}">${change >= 0 ? '+' : ''}${formatCredits(change)} (${Number(price.changePercent || 0).toFixed(2).replace('.', ',')} %)</td>
      <td>${Number(price.demandScore || 0).toFixed(2).replace('.', ',')}</td>
      <td>${Number(price.supplyScore || 0).toFixed(2).replace('.', ',')}</td>
      <td>${Number(price.speculationScore || 0).toFixed(2).replace('.', ',')}</td>
      <td>${Number(price.pressureScore || 0).toFixed(2).replace('.', ',')}</td>
      <td>${Number(price.momentum || 0).toFixed(2).replace('.', ',')}</td>
      <td>${Number(price.volatility || 0).toFixed(2).replace('.', ',')}</td>
      <td>${escapeLoginManagerText(chainLabel)} (${Number(price.chainImpulse || 0).toFixed(2).replace('.', ',')})</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10">Noch keine Ressourcenpreise.</td></tr>';
}

function renderSectorStockpileCards(stockpiles = {}) {
  return RESOURCE_KEYS.map((key) => `
    <div class="stat-card">
      <strong>${escapeLoginManagerText(RESOURCE_LABELS[key] || key)} Lager</strong>
      <span>${Number(stockpiles[key] || 0).toFixed(2).replace('.', ',')}</span>
    </div>
  `).join('');
}

function renderCorporateInventoryTable(resourceBag = {}, inventoryValue = 0) {
  const bag = resourceBag || {};
  return `<div class="workspace-card">
    <h3>Holding-Lager</h3>
    <table class="data-table">
      <thead><tr><th>Ressource</th><th>Menge</th></tr></thead>
      <tbody>${RESOURCE_KEYS.map((key) => `<tr>
        <td>${escapeLoginManagerText(RESOURCE_LABELS[key] || key)}</td>
        <td>${Number(bag[key] || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="muted">Geschätzter Lagerwert: ${formatCredits(inventoryValue || 0)}</p>
  </div>`;
}

function renderCorporateTradeTable(title, trades = []) {
  return `<div class="workspace-card">
    <h3>${escapeLoginManagerText(title)}</h3>
    <table class="data-table">
      <thead><tr><th>Zeit</th><th>Ressource</th><th>Menge</th><th>Preis</th><th>Gesamt</th><th>Gegenpartei</th></tr></thead>
      <tbody>${trades.map((trade) => `<tr>
        <td>${formatMarketDateTime(trade.createdAt)}</td>
        <td>${escapeLoginManagerText(trade.resourceLabel || RESOURCE_LABELS[trade.resourceType] || trade.resourceType)}</td>
        <td>${Number(trade.quantity || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })}</td>
        <td>${formatCredits(trade.unitPrice)}</td>
        <td>${formatCredits(trade.totalPrice)}</td>
        <td>${escapeLoginManagerText(!trade.sellerCompanyId ? 'Ziviler Markt' : (trade.sellerName || trade.buyerName || '-'))}</td>
      </tr>`).join('') || '<tr><td colspan="6">Keine Trades.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderSectorAssetTable(title, rows = []) {
  return `<div class="workspace-card">
    <h3>${escapeLoginManagerText(title)}</h3>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Ressource</th><th>Besitzer</th><th>Produktion/h</th><th>Status</th><th>Ertrag</th></tr></thead>
      <tbody>${rows.map((asset) => `<tr>
        <td><strong>${escapeLoginManagerText(asset.name)}</strong><br><small>${escapeLoginManagerText(asset.planetName || '')}</small></td>
        <td>${escapeLoginManagerText(asset.resourceLabel || '-')}</td>
        <td>${escapeLoginManagerText(asset.owner || '-')}</td>
        <td>${Number(asset.productionRatePerHour || 0).toFixed(1).replace('.', ',')}</td>
        <td>${escapeLoginManagerText(asset.status || 'Aktiv')}</td>
        <td>${escapeLoginManagerText(asset.yieldType || '-')}</td>
      </tr>`).join('') || '<tr><td colspan="6">Keine Einträge.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderSectorHoldingsTable(holdings = []) {
  return `<div class="workspace-card">
    <h3>Holdings im Sektor</h3>
    <table class="data-table">
      <thead><tr><th>Holding</th><th>Ressourcen</th><th>Kurs</th><th>Tag</th><th>Staatsverträge</th><th>Corporate Cash</th><th>Lagerwert</th><th>Private Assets</th><th>Strategie</th><th>Risiko</th><th>Status</th><th></th></tr></thead>
      <tbody>${holdings.map((holding) => {
        const change = Number(holding.dailyChange || 0);
        return `<tr>
          <td><strong>${escapeLoginManagerText(holding.name)}</strong><br><small>${escapeLoginManagerText(holding.symbol || '')}</small></td>
          <td>${(holding.resourceLabels || []).map(escapeLoginManagerText).join(', ') || '-'}</td>
          <td>${formatCredits(holding.currentPrice)}</td>
          <td style="color:${change >= 0 ? '#55d68b' : '#ff6b6b'}">${change >= 0 ? '+' : ''}${formatCredits(change)} (${Number(holding.dailyChangePercent || 0).toFixed(2).replace('.', ',')} %)</td>
          <td>${formatCredits(holding.stateContractRevenuePerHour || 0)} / h<br><small>${Number(holding.stateBackedSlotCount || 0)} GAR-Slots</small></td>
          <td>${formatCredits(holding.corporateCash || 0)}</td>
          <td>${formatCredits(holding.inventoryValue || 0)}</td>
          <td>${formatCredits(holding.privateAssetValue || 0)}<br><small>${Number(holding.corporateAssets?.length || 0)} Standorte / ${Number(holding.corporateProjects?.filter((entry) => ['planned', 'building'].includes(entry.status)).length || 0)} Projekte</small></td>
          <td>${escapeLoginManagerText(holding.corporateStrategy || 'conservative')}</td>
          <td>${Math.round(Number(holding.bankruptcyRisk || 0) * 100)} %</td>
          <td>${escapeLoginManagerText(holding.marketStatusLabel || holding.marketStatus || 'Handelbar')}</td>
          <td><button class="mini-btn" onclick="openSectorHolding('${holding.id}')">Zur Aktienübersicht</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="12">Keine Holdings in diesem Sektor.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderCorporateProjectTable(projects = []) {
  return `<div class="workspace-card">
    <h3>Private Holding-Bauprojekte</h3>
    <table class="data-table">
      <thead><tr><th>Holding</th><th>Gebäude</th><th>Planet</th><th>Status</th><th>Fertig</th><th>ROI</th></tr></thead>
      <tbody>${projects.map((project) => `<tr>
        <td>${escapeLoginManagerText(project.companyName || '-')}</td>
        <td><strong>${escapeLoginManagerText(project.label || project.buildingType || '-')}</strong><br><small>${escapeLoginManagerText(RESOURCE_LABELS[project.resourceType] || project.resourceType || '')}</small></td>
        <td>${escapeLoginManagerText(project.planetName || '-')}</td>
        <td>${escapeLoginManagerText(project.status || '-')}</td>
        <td>${formatMarketDateTime(project.completesAt)}</td>
        <td>${Number(project.expectedRoi || 0).toFixed(2).replace('.', ',')}</td>
      </tr>`).join('') || '<tr><td colspan="6">Keine aktiven privaten Bauprojekte.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderSectorPurchasesTable(purchases = []) {
  return `<div class="workspace-card">
    <h3>Letzte Ressourcenkäufe</h3>
    <table class="data-table">
      <thead><tr><th>Zeit</th><th>Ressource</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th><th>Käufer</th></tr></thead>
      <tbody>${purchases.map((purchase) => `<tr>
        <td>${formatMarketDateTime(purchase.createdAt)}</td>
        <td>${escapeLoginManagerText(purchase.resourceLabel || RESOURCE_LABELS[purchase.resourceType] || purchase.resourceType)}</td>
        <td>${Number(purchase.quantity || 0).toLocaleString('de-DE')}</td>
        <td>${formatCredits(purchase.unitPrice)}</td>
        <td>${formatCredits(purchase.totalPrice)}</td>
        <td>${escapeLoginManagerText(purchase.buyerName || purchase.buyerRole || '-')}</td>
      </tr>`).join('') || '<tr><td colspan="6">Noch keine Ressourcenkäufe.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderSectorEconomySection() {
  const sectors = economyViewState.economySectors || [];
  const selected = economyViewState.selectedEconomySector;
  const selectedPrice = selected?.resourcePrices?.find((entry) => entry.resourceType === economyViewState.sectorPurchaseResourceType);
  const estimatedCost = Number(selectedPrice?.currentPrice || 0) * Number(economyViewState.sectorPurchaseQuantity || 0);
  const purchaseDisabled = !economyViewState.canBuySectorResources
    || !selected
    || selected.isEconomyExcluded
    || selected.economy?.isEmbargoed
    || selected.economy?.controlStatus !== 'BLUFOR'
    || economyViewState.sectorEconomyLoading;
  const warning = selected?.economy?.isEmbargoed
    ? '<div class="muted-box"><strong>Dieser Sektor steht unter Embargo.</strong> Ziviler Handel ist blockiert.</div>'
    : '';
  const excluded = selected?.isEconomyExcluded
    ? `<div class="muted-box">${escapeLoginManagerText(selected.exclusionReason || 'Dieser Sektor hat keine Wirtschaft und keine Holdings.')}</div>`
    : '';
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Sektor-Wirtschaft</h2>
        <p>Beobachtung und begrenzte Beschaffung für sektorale Ressourcenmärkte.</p>
      </div>
      <div class="toolbar-row end">
        <button class="mini-btn" onclick="setEconomySection('overview')">Zur Übersicht</button>
        <button class="mini-btn" onclick="setEconomySection('trade')">Aktienhandel</button>
        <button class="mini-btn" onclick="setEconomySection('portfolio')">Portfolio</button>
        <button class="mini-btn" onclick="fetchSectorEconomyList({ force: true })">Aktualisieren</button>
      </div>
    </div>
    ${economyViewState.sectorEconomyError ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.sectorEconomyError)}</div>` : ''}
    <div class="workspace-section">
      <div class="form-grid">
        <div class="form-row"><label>Sektor</label><select onchange="selectEconomySector(this.value)">
          ${sectors.map((sector) => `<option value="${escapeLoginManagerText(sector.id)}" ${sector.id === economyViewState.selectedEconomySectorId ? 'selected' : ''}>${escapeLoginManagerText(sector.name)}${sector.isEconomyExcluded ? ' (keine Wirtschaft)' : ''}</option>`).join('')}
        </select></div>
      </div>
      ${economyViewState.sectorEconomyLoading && !selected ? '<div class="muted-box">Sektor-Wirtschaft wird geladen...</div>' : ''}
    </div>
    ${selected ? `
      <div class="workspace-grid">
        <div class="stat-card"><strong>Sektor</strong><span>${escapeLoginManagerText(selected.name)}</span></div>
        <div class="stat-card"><strong>Kontrollstatus</strong><span>${escapeLoginManagerText(selected.economy?.controlStatus || 'Neutral')}</span></div>
        <div class="stat-card"><strong>Embargo</strong><span>${selected.economy?.isEmbargoed ? 'Aktiv' : 'Nein'}</span></div>
        <div class="stat-card"><strong>Wirtschaft</strong><span>${escapeLoginManagerText(selected.economy?.economyState || 'Normal')}</span></div>
        <div class="stat-card"><strong>Marktstimmung</strong><span>${escapeLoginManagerText(selected.economy?.marketSentiment || 'Neutral')}</span></div>
        <div class="stat-card"><strong>Routen-Planeten</strong><span>${Number(selected.routePlanetCount || 0)}</span></div>
        <div class="stat-card"><strong>Hyperraum-Hubs</strong><span>${Number(selected.logisticsHubCount || 0)}</span></div>
        <div class="stat-card"><strong>Hub-Bonus</strong><span>+${Math.round(Number(selected.logisticsHubBonus || selected.economy?.logisticsHubBonus || 0) * 100)}%</span></div>
        ${renderEconomyMetricCard('Verbraucher', selected.economy?.consumerStrength)}
        ${renderEconomyMetricCard('Industrie', selected.economy?.industryStrength)}
        ${renderEconomyMetricCard('Logistik', selected.economy?.logisticsStrength)}
        ${renderEconomyMetricCard('Kriegsdruck', selected.economy?.warPressure)}
        ${renderEconomyMetricCard('Importabhängigkeit', selected.economy?.importDependency)}
        ${renderEconomyMetricCard('Exportstärke', selected.economy?.exportStrength)}
        ${renderSectorStockpileCards(selected.economy?.stockpiles || {})}
      </div>
      ${warning}
      ${excluded}
      ${!selected.isEconomyExcluded ? `<div class="overlay-helper-text">Logistik-Hubs geben Logistik-Unternehmen im Sektor +15% Logistikwert pro Hub, maximal +50%.</div>` : ''}
      ${selected.isEconomyExcluded ? '' : `
        <div class="workspace-section workspace-columns">
          <div class="workspace-card">
            <h3>Zivile Ressourcen kaufen</h3>
            <div class="form-row"><label>Ressource</label><select onchange="setSectorPurchaseResourceType(this.value)">
              ${RESOURCE_KEYS.map((key) => `<option value="${key}" ${economyViewState.sectorPurchaseResourceType === key ? 'selected' : ''}>${RESOURCE_LABELS[key]}</option>`).join('')}
            </select></div>
            <div class="form-row"><label>Menge</label><input type="number" min="1" max="100000" value="${economyViewState.sectorPurchaseQuantity}" oninput="setSectorPurchaseQuantity(this.value)"></div>
            <p>Marktpreis: <strong>${formatCredits(selectedPrice?.currentPrice || 0)}</strong></p>
            <p>Geschätzte Kosten: <strong>${formatCredits(estimatedCost)}</strong></p>
            <button class="mini-btn primary" onclick="buySectorResource()" ${purchaseDisabled ? 'disabled' : ''}>Ressourcen kaufen</button>
          </div>
          <div class="workspace-card">
            <h3>Embargo-Verwaltung</h3>
            <p>${selected.economy?.isEmbargoed ? 'Der zivile Handel ist aktuell blockiert.' : 'Der zivile Handel ist aktuell geöffnet.'}</p>
            ${economyViewState.canManageSectorEmbargo ? `<div class="toolbar-row">
              <button class="mini-btn danger" onclick="setEconomySectorEmbargo(true)" ${selected.economy?.isEmbargoed ? 'disabled' : ''}>Embargo setzen</button>
              <button class="mini-btn" onclick="setEconomySectorEmbargo(false)" ${!selected.economy?.isEmbargoed ? 'disabled' : ''}>Embargo aufheben</button>
            </div>` : '<div class="muted-box">Nur globale Admins können Embargos setzen oder aufheben.</div>'}
          </div>
        </div>
        <div class="workspace-section">
          <div class="workspace-card">
            <h3>Ressourcenpreise</h3>
            <table class="data-table">
              <thead><tr><th>Ressource</th><th>Preis</th><th>Änderung</th><th>Nachfrage</th><th>Angebot</th><th>Spekulation</th><th>Druck</th><th>Momentum</th><th>Volatilität</th><th>Kettenquelle</th></tr></thead>
              <tbody>${renderSectorResourcePriceRows(selected.resourcePrices || [])}</tbody>
            </table>
          </div>
        </div>
        <div class="workspace-section">${renderSectorHoldingsTable(selected.holdings || [])}</div>
        <div class="workspace-section workspace-columns">
          ${renderSectorAssetTable('Zivile Minen', selected.mines?.civilian || [])}
          ${renderSectorAssetTable('Militärische Minen', selected.mines?.military || [])}
        </div>
        <div class="workspace-section workspace-columns">
          ${renderSectorAssetTable('Infrastruktur', selected.infrastructure || [])}
          ${renderSectorAssetTable('Privat / Holding', selected.privateAssets || [])}
        </div>
        <div class="workspace-section workspace-columns">
          ${renderCorporateProjectTable(selected.corporateProjects || [])}
          ${renderSectorPurchasesTable(selected.purchases || [])}
        </div>
      `}
    ` : '<div class="muted-box">Bitte einen Sektor auswählen.</div>'}
  `;
}

function renderEconomyView() {
  const pool = getFactionResourcePool('GAR');
  const cooldown = getMarketCooldownRemaining();
  const holdings = new Map((economyViewState.holdings || []).map((holding) => [holding.companyId, Number(holding.shares || 0)]));
  const securitiesValue = Number(economyViewState.portfolio?.holdingsValue || 0);
  const portfolioBalance = Number(economyViewState.investor?.balance || 0);
  const portfolioValue = economyViewState.portfolioEnabled
    ? Number(economyViewState.portfolio?.totalValue || (portfolioBalance + securitiesValue))
    : (portfolioBalance + securitiesValue);
  const cooldownText = economyViewState.consumerMode
    ? (cooldown > 0 ? formatDuration(cooldown) : 'Nachfrage verfügbar')
    : (economyViewState.portfolioEnabled ? 'Direkt verfügbar' : 'Nicht verfügbar');
  const factionAccount = economyViewState.factionAccounts?.[economyViewState.factionAccountKey] || null;
  const factionAccountLabels = {
    GAR: 'GAR-Haushalt',
    KUS: 'KUS-Fraktionskonto',
    BLACK_SUN: 'Black-Sun-Fraktionskonto',
    PYKE: 'Pyke-Fraktionskonto',
    HUTT: 'Hutten-Fraktionskonto'
  };
  const marketQuery = String(economyViewState.sectorQuery || '').trim().toLocaleLowerCase('de');
  const resourceFilter = economyViewState.resourceFilter || 'all';
  const filteredCompanies = getActiveEconomyCompanies();
  const visibleCompanies = filteredCompanies.slice(0, 60);
  const topLastHour = (economyViewState.topLastHour || []).slice(0, 50);
  const acpRows = economyViewState.acp?.current || [];
  if (economyViewState.activeSection === 'sectorEconomy') {
    renderSectorEconomySection();
    return;
  }
  if (economyViewState.activeSection === 'portfolio') {
    renderPortfolioSection();
    return;
  }
  if (economyViewState.activeSection === 'detail') {
    const companySummary = getEconomyCompanyById(economyViewState.selectedCompanyId);
    if (!companySummary && !economyViewState.companyDetailById?.[economyViewState.selectedCompanyId]) {
      economyViewState.activeSection = 'trade';
      renderEconomyView();
      return;
    }
    const companyKey = String(companySummary?.id || companySummary?.companyId || economyViewState.selectedCompanyId || '').trim();
    const company = economyViewState.companyDetailById?.[companyKey] || companySummary;
    const companyDetailLoaded = Boolean(economyViewState.companyDetailById?.[companyKey]);
    const companyDetailLoading = economyViewState.companyDetailLoadingId === companyKey;
    const shares = holdings.get(company.id || company.companyId) || 0;
    const rangeCutoff = getMarketRangeCutoff();
    const prices = (economyViewState.history?.[company.id] || [])
      .filter((point) => Date.parse(point.recordedAt) >= rangeCutoff)
      .map((point) => Number(point.price || 0))
      .filter(Number.isFinite);
    const availableShares = Math.max(0, Number(company.freeFloatShares || 0));
    const buyMax = Math.min(10000, availableShares, Math.floor(portfolioBalance / Math.max(0.01, Number(company.currentPrice || 0))));
    const change = Number(company.currentPrice || 0) - Number(company.previousPrice || 0);
    const rangeLabel = MARKET_RANGE_OPTIONS[economyViewState.marketRange || 'today']?.label || 'Heute';
    workspacePanel.innerHTML = `
      <div class="workspace-head">
        <div><h2>${escapeLoginManagerText(company.name)} <span class="badge">${escapeLoginManagerText(company.symbol)}</span></h2>
        <p>${escapeLoginManagerText(company.sector || company.faction)} • ${escapeLoginManagerText((company.resourceRefs || [company.resourceKey]).map((key) => RESOURCE_LABELS[key] || key).join(', ') || company.faction)} • ${escapeLoginManagerText(company.marketStatusLabel || 'Handelbar')}</p></div>
        <div class="toolbar-row end"><button class="mini-btn" onclick="setEconomySection('trade')">Zurück zum Handel</button><button class="mini-btn" onclick="setEconomySection('portfolio')">Portfolio</button><button class="mini-btn" onclick="setEconomySection('sectorEconomy')">Sektor-Wirtschaft</button><button class="mini-btn" onclick="setEconomySection('acp')">ACP</button><button class="mini-btn" onclick="refreshSelectedMarketCompany()">Aktualisieren</button></div>
      </div>
      ${companyDetailLoading && !companyDetailLoaded ? '<div class="muted-box">Holding-Details werden geladen...</div>' : ''}
      ${economyViewState.companyDetailError ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.companyDetailError)}</div>` : ''}
      <div class="workspace-grid">
        <div class="stat-card"><strong>Aktueller Kurs</strong><span>${formatCredits(company.currentPrice)}</span></div>
        <div class="stat-card"><strong>Letzte Änderung</strong><span style="color:${change >= 0 ? '#55d68b' : '#ff6b6b'}">${change >= 0 ? '+' : ''}${formatCredits(change)}</span></div>
        <div class="stat-card"><strong>${escapeLoginManagerText(rangeLabel)} Hoch</strong><span>${formatCredits(prices.length ? Math.max(...prices) : company.currentPrice)}</span></div>
        <div class="stat-card"><strong>${escapeLoginManagerText(rangeLabel)} Tief</strong><span>${formatCredits(prices.length ? Math.min(...prices) : company.currentPrice)}</span></div>
        <div class="stat-card"><strong>Eigener Bestand</strong><span>${shares}</span></div>
        <div class="stat-card"><strong>Bestandswert</strong><span>${formatCredits(shares * Number(company.currentPrice || 0))}</span></div>
        <div class="stat-card"><strong>Gesamtaktien</strong><span>${Number(company.totalShares || 0).toLocaleString('de-DE')}</span></div>
        <div class="stat-card"><strong>Free Float</strong><span>${Number(company.freeFloatShares || 0).toLocaleString('de-DE')}</span></div>
        <div class="stat-card"><strong>Marktkapitalisierung</strong><span>${formatCredits(company.marketCap)}</span></div>
        <div class="stat-card"><strong>Kontrolle</strong><span>${escapeLoginManagerText(company.controllingShareholder || 'Streubesitz')}</span></div>
        <div class="stat-card"><strong>Corporate Cash</strong><span>${formatCredits(company.corporateCash || 0)}</span></div>
        <div class="stat-card"><strong>Lagerwert</strong><span>${formatCredits(company.inventoryValue || 0)}</span></div>
        <div class="stat-card"><strong>Umsatz 1h</strong><span>${formatCredits(company.realizedRevenueLastHour || 0)}</span></div>
        <div class="stat-card"><strong>Umsatz 24h</strong><span>${formatCredits(company.realizedRevenueLast24h || 0)}</span></div>
        <div class="stat-card"><strong>Einkäufe 24h</strong><span>${formatCredits(company.purchaseSpendLast24h || 0)}</span></div>
        <div class="stat-card"><strong>Staatsvertrag / h</strong><span>${formatCredits(company.stateContractRevenuePerHour || 0)}</span></div>
        <div class="stat-card"><strong>GAR-Slots</strong><span>${Number(company.stateBackedSlotCount || 0)}</span></div>
        <div class="stat-card"><strong>Private Asset Value</strong><span>${formatCredits(company.privateAssetValue || 0)}</span></div>
        <div class="stat-card"><strong>Strategie</strong><span>${escapeLoginManagerText(company.corporateStrategy || 'conservative')}</span></div>
        <div class="stat-card"><strong>Insolvenzrisiko</strong><span>${Math.round(Number(company.bankruptcyRisk || 0) * 100)} %</span></div>
        <div class="stat-card"><strong>Private Standorte</strong><span>${Number(company.corporateAssetCount || company.corporateAssets?.length || 0)}</span></div>
        <div class="stat-card"><strong>Aktive Projekte</strong><span>${Number(company.activeCorporateProjectCount || 0)}</span></div>
      </div>
      <div class="workspace-section"><h3>Kursverlauf</h3>${renderMarketRangeControls()}${renderMarketDetailChart(company.id || company.companyId)}</div>
      <div class="workspace-section"><h3>Anteilseigner</h3><div class="workspace-card">${renderOwnershipPie(company)}</div></div>
      <div class="workspace-section workspace-columns">
        ${renderCorporateInventoryTable(company.corporateResources || {}, company.inventoryValue || 0)}
        ${renderSectorAssetTable('Private Standorte', (company.corporateAssets || []).map((asset) => ({
          name: asset.label || asset.buildingType || 'Privates Asset',
          planetName: asset.planetName || asset.planetId || '',
          resourceLabel: RESOURCE_LABELS[asset.resourceType] || asset.resourceType || '-',
          owner: company.name,
          productionRatePerHour: asset.productionPerHour || 0,
          status: Number(asset.damageIndex || 0) > 0.3 ? 'Beschaedigt' : (Number(asset.blockadeIndex || 0) > 0.3 ? 'Blockiert' : 'Aktiv'),
          yieldType: `Zustand ${Number(asset.conditionIndex || 0).toFixed(2).replace('.', ',')}`
        })))}
        ${renderCorporateProjectTable((company.corporateProjects || []).map((project) => ({ ...project, companyName: company.name, label: project.label || project.buildingType || '-' })))}
      </div>
      ${company.solvencyDiagnosis ? `<div class="workspace-section"><div class="workspace-card">
        <h3>Solvenzdiagnose</h3>
        <table class="data-table">
          <thead><tr><th>Kurs</th><th>Preis-Druck</th><th>Nachfrage</th><th>Rezession</th><th>Sentiment</th><th>Zyklus</th><th>Alter Risk</th><th>Neues Risk</th></tr></thead>
          <tbody><tr>
            <td>${formatCredits(company.solvencyDiagnosis.currentPrice || 0)} / ${formatCredits(company.solvencyDiagnosis.basePrice || 0)}</td>
            <td>${Number(company.solvencyDiagnosis.pricePressure || 0).toFixed(2).replace('.', ',')}</td>
            <td>${Number(company.solvencyDiagnosis.marketMultiplier || 0).toFixed(2).replace('.', ',')} / ${Number(company.solvencyDiagnosis.demandPressure || 0).toFixed(2).replace('.', ',')}</td>
            <td>${Number(company.solvencyDiagnosis.recessionPressure || 0).toFixed(2).replace('.', ',')}</td>
            <td>${Number(company.solvencyDiagnosis.sentimentPressure || 0).toFixed(2).replace('.', ',')}</td>
            <td>${Number(company.solvencyDiagnosis.cyclePressure || 0).toFixed(2).replace('.', ',')}</td>
            <td>${Math.round(Number(company.solvencyDiagnosis.oldRisk || 0) * 100)} %</td>
            <td>${Math.round(Number(company.solvencyDiagnosis.nextRisk || 0) * 100)} %</td>
          </tr></tbody>
        </table>
      </div></div>` : ''}
      <div class="workspace-section workspace-columns">
        ${renderCorporateTradeTable('Letzte Ressourcenverkäufe', company.recentCorporateSales || [])}
        ${renderCorporateTradeTable('Letzte Ressourcenkäufe', company.recentCorporatePurchases || [])}
      </div>
      <div class="workspace-section workspace-columns">
        <div class="workspace-card"><h3>Kaufen</h3><p>Verfügbar: ${formatCredits(portfolioBalance)} • Free Float: ${availableShares.toLocaleString('de-DE')} Aktie(n) • Maximal ${buyMax} Aktie(n)</p>
          ${economyViewState.portfolioEnabled && buyMax > 0 ? `<div class="trade-quantity"><input id="buyQuantity_${company.id}" type="range" min="1" max="${buyMax}" value="1" oninput="updateMarketQuantity('buy','${company.id}',this.value)"><output id="buyQuantityOutput_${company.id}">1</output></div>` : ''}
          <button class="mini-btn primary" onclick="buyMarketShare('${company.id}')" ${!economyViewState.canPurchase || (company.marketStatus && company.marketStatus !== 'tradeable') || company.isEmbargoed || (!economyViewState.consumerMode && buyMax < 1) || (economyViewState.consumerMode && cooldown > 0) ? 'disabled' : ''}>${economyViewState.consumerMode ? 'Nachfrage erzeugen' : 'Ausgewählte Menge kaufen'}</button>
        </div>
        <div class="workspace-card"><h3>Verkaufen</h3><p>Eigener Bestand: ${shares} Aktie(n). Verkäufe zahlen 2% Republikanische Handelssteuer.</p>
          ${economyViewState.portfolioEnabled && shares > 0 ? `<div class="trade-quantity"><input id="sellQuantity_${company.id}" type="range" min="1" max="${shares}" value="1" oninput="updateMarketQuantity('sell','${company.id}',this.value)"><output id="sellQuantityOutput_${company.id}">1</output></div>` : ''}
          ${economyViewState.portfolioEnabled && shares > 0 ? renderSellPreview(company, 1) : ''}
          <button class="mini-btn danger" onclick="sellMarketShare('${company.id}')" ${!economyViewState.portfolioEnabled || shares < 1 ? 'disabled' : ''}>Ausgewählte Menge verkaufen</button>
        </div>
      </div>
      ${renderMarketOrderList(company)}`;
    return;
  }
  if (economyViewState.activeSection === 'trade') {
    workspacePanel.innerHTML = `
      <div class="workspace-head">
        <div>
          <h2>Aktienhandel</h2>
          <p>Kaufen und Verkaufen über das persönliche Portfolio. Viewer erzeugen ausschließlich Marktnachfrage.</p>
        </div>
        <div class="toolbar-row end">
          <button class="mini-btn" onclick="setEconomySection('overview')">Zur Übersicht</button>
          <button class="mini-btn" onclick="setEconomySection('portfolio')">Portfolio</button>
          <button class="mini-btn" onclick="setEconomySection('sectorEconomy')">Sektor-Wirtschaft</button>
          <button class="mini-btn" onclick="setEconomySection('acp')">ACP</button>
          <button class="mini-btn" onclick="fetchEconomyView()">Aktualisieren</button>
        </div>
      </div>
      ${economyViewState.error ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.error)}</div>` : ''}
      <div class="workspace-grid">
        <div class="stat-card"><strong>Verfügbare Credits</strong><span>${economyViewState.portfolioEnabled ? formatCredits(portfolioBalance) : 'Kein Portfolio'}</span></div>
        <div class="stat-card"><strong>Aktienwert</strong><span>${economyViewState.portfolioEnabled ? formatCredits(securitiesValue) : '0 Cr'}</span></div>
        <div class="stat-card"><strong>Gesamtwert</strong><span>${economyViewState.portfolioEnabled ? formatCredits(portfolioValue) : 'Kein Portfolio'}</span></div>
        <div class="stat-card"><strong>${economyViewState.consumerMode ? 'Nächste Nachfrage' : 'Handel'}</strong><span>${cooldownText}</span></div>
      </div>
      <div class="workspace-section">
        <p class="muted">${economyViewState.consumerMode
          ? 'Pro IP-Adresse kann alle 60 Minuten eine Nachfrageaktion ausgelöst werden. Viewer erhalten keine Aktie und keinen Gewinn.'
          : (economyViewState.portfolioEnabled
            ? 'Beim Kauf wird der aktuelle Aktienkurs direkt von deinen persönlichen Credits abgezogen. Beim Verkauf wird der aktuelle Kurs gutgeschrieben.'
            : 'Diese Admin-Rolle besitzt kein persönliches Portfolio und kann nicht handeln.')}</p>
        <div class="form-grid">
          <div class="form-row"><label>Sektor oder Holding suchen</label><input id="economySectorSearch" type="search" value="${escapeLoginManagerText(economyViewState.sectorQuery || '')}" placeholder="z. B. Corellian" oninput="updateEconomySectorQuery(this)"></div>
          <div class="form-row"><label>Ressource</label><select onchange="economyViewState.resourceFilter=this.value; if (economyViewState.sectorQuery.trim()) { void fetchEconomyCompanySearch(economyViewState.sectorQuery, this.value); } renderEconomyView();">
            <option value="all" ${resourceFilter === 'all' ? 'selected' : ''}>Alle Ressourcen</option>
            <option value="quadraniumErz" ${resourceFilter === 'quadraniumErz' ? 'selected' : ''}>Metalle</option>
            <option value="agrinium" ${resourceFilter === 'agrinium' ? 'selected' : ''}>Technologien</option>
            <option value="tibannaGas" ${resourceFilter === 'tibannaGas' ? 'selected' : ''}>Treibstoffe</option>
            <option value="baradium" ${resourceFilter === 'baradium' ? 'selected' : ''}>Chemikalien</option>
            <option value="kavamSalz" ${resourceFilter === 'kavamSalz' ? 'selected' : ''}>Versorgungsgüter</option>
          </select></div>
        </div>
        ${economyViewState.companySearchError ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.companySearchError)}</div>` : ''}
        <p class="muted">${marketQuery
          ? `${economyViewState.companySearchLoading ? 'Suche läuft...' : `${filteredCompanies.length} Treffer`} für "${escapeLoginManagerText(economyViewState.sectorQuery)}"`
          : `${filteredCompanies.length} Vorschau-Aktien geladen`}${filteredCompanies.length > visibleCompanies.length ? `, die ersten ${visibleCompanies.length} werden angezeigt` : ''}.</p>
        <div class="project-grid">
          ${visibleCompanies.map((company) => {
            const shares = holdings.get(company.id) || 0;
            const availableShares = Math.max(0, Number(company.freeFloatShares || 0));
            const buyMax = Math.min(10000, availableShares, Math.floor(portfolioBalance / Math.max(0.01, Number(company.currentPrice || 0))));
            const change = Number(company.currentPrice || 0) - Number(company.previousPrice || 0);
            return `<div class="project-card">
              <h4>${escapeLoginManagerText(company.name)} <span class="badge">${company.symbol}</span></h4>
              <p><strong>${formatCredits(company.currentPrice)}</strong> <span style="color:${change >= 0 ? '#55d68b' : '#ff6b6b'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}</span></p>
              ${renderMarketSparkline(company.id)}
              <p class="project-meta">${economyViewState.portfolioEnabled ? `Eigener Bestand: ${shares} Aktie(n) • ` : ''}Free Float: ${availableShares.toLocaleString('de-DE')} • ${escapeLoginManagerText(company.sector || company.faction)} • ${escapeLoginManagerText(company.marketStatusLabel || 'Handelbar')}</p>
              ${economyViewState.portfolioEnabled && buyMax > 0 ? `<div class="trade-quantity"><input id="buyQuantity_${company.id}" type="range" min="1" max="${buyMax}" value="1" oninput="updateMarketQuantity('buy','${company.id}',this.value)"><output id="buyQuantityOutput_${company.id}">1</output></div>` : ''}
              <div class="toolbar-row">
                <button class="mini-btn primary" onclick="buyMarketShare('${company.id}')" ${!economyViewState.canPurchase || (company.marketStatus && company.marketStatus !== 'tradeable') || company.isEmbargoed || (economyViewState.consumerMode && cooldown > 0) || (economyViewState.portfolioEnabled && buyMax < 1) || economyViewState.loading ? 'disabled' : ''}>${economyViewState.consumerMode ? 'Nachfrage erzeugen' : 'Kaufen'}</button>
                ${economyViewState.portfolioEnabled ? `<button class="mini-btn danger" onclick="sellMarketShare('${company.id}')" ${shares < 1 || economyViewState.loading ? 'disabled' : ''}>Verkaufen</button>` : ''}
                <button class="mini-btn" onclick="openMarketCompanyOverview('${company.id}')">Übersicht</button>
              </div>
            </div>`;
          }).join('') || '<div class="muted-box">Keine passende Aktie gefunden.</div>'}
        </div>
      </div>
    `;
    return;
  }
  if (economyViewState.activeSection === 'acp') {
    const selectedResource = economyViewState.acpSelectedResource || acpRows[0]?.resourceKey || 'quadraniumErz';
    const rankingUpdatedAt = economyViewState.acpRanking?.updatedAt ? formatMarketDateTime(economyViewState.acpRanking.updatedAt) : '-';
    workspacePanel.innerHTML = `
      <div class="workspace-head">
        <div>
          <h2>ACP Übersicht</h2>
          <p>ACP als Rohstoffpreisindex. Basiert auf sektoralen Ressourcenpreisen, nicht auf Aktienkursen.</p>
        </div>
        <div class="toolbar-row end">
          <button class="mini-btn" onclick="setEconomySection('overview')">Zur Übersicht</button>
          <button class="mini-btn" onclick="setEconomySection('trade')">Aktienhandel</button>
          <button class="mini-btn" onclick="setEconomySection('portfolio')">Portfolio</button>
          <button class="mini-btn" onclick="setEconomySection('sectorEconomy')">Sektor-Wirtschaft</button>
          <button class="mini-btn" onclick="fetchEconomyView()">Aktualisieren</button>
        </div>
      </div>
      <div class="workspace-grid">
        ${acpRows.map((entry) => {
          const changeFromBase = Number(entry.averagePrice || 0) - Number(entry.averageBasePrice || 0);
          return `<div class="stat-card">
            <strong>${escapeLoginManagerText(entry.label)}</strong>
            <span>${formatCredits(entry.averagePrice)}</span>
            <small style="color:${changeFromBase >= 0 ? '#55d68b' : '#ff6b6b'}">${changeFromBase >= 0 ? '+' : ''}${formatCredits(changeFromBase)} zu Basis • ${entry.sectorCount || 0} Sektoren</small>
          </div>`;
        }).join('')}
      </div>
      <div class="workspace-section">
        <h3>ACP Verlauf</h3>
        ${renderMarketRangeControls()}
        <div class="toolbar-row" style="margin:12px 0 8px 0;">
          ${acpRows.map((entry) => `<button class="mini-btn ${selectedResource === entry.resourceKey ? 'active' : ''}" onclick="setAcpRankingResource('${entry.resourceKey}')">${escapeLoginManagerText(entry.label)}</button>`).join('')}
        </div>
        ${renderAcpChart(selectedResource)}
      </div>
      <div class="workspace-section workspace-columns">
        <div class="workspace-card">
          <h3>Aktuelle ACP-Werte</h3>
          <table class="data-table">
            <thead><tr><th>Rohstoff</th><th>Ø Preis</th><th>Basis</th><th>Holdings</th><th>Sektoren</th></tr></thead>
            <tbody>${acpRows.map((entry) => `<tr><td>${escapeLoginManagerText(entry.label)}</td><td>${formatCredits(entry.averagePrice)}</td><td>${formatCredits(entry.averageBasePrice)}</td><td>${entry.companyCount}</td><td>${entry.sectorCount || 0}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="workspace-card">
          <h3>Marktberichte</h3>
          ${(economyViewState.intelligenceReports || []).slice(0, 8).map((report) => `<div class="project-card"><h4>${escapeLoginManagerText(RESOURCE_LABELS[report.resourceType] || report.resourceType)}</h4><p>${escapeLoginManagerText(report.message)}</p><small>${formatMarketDateTime(report.createdAt)}</small></div>`).join('') || '<div class="muted-box">Noch keine Marktberichte.</div>'}
        </div>
      </div>
      <div class="workspace-section">
        <h3>Sektorale Ressourcenpreise</h3>
        <p class="muted">Sortiertes Ranking nach sektoralen Rohstoffpreisen. Ein Klick auf einen Sektor öffnet direkt die Sektorwirtschaft.</p>
        <div class="toolbar-row" style="margin:12px 0 8px 0;">
          ${acpRows.map((entry) => `<button class="mini-btn ${selectedResource === entry.resourceKey ? 'active' : ''}" onclick="setAcpRankingResource('${entry.resourceKey}')">${escapeLoginManagerText(entry.label)}</button>`).join('')}
        </div>
        <div class="toolbar-row" style="margin:0 0 12px 0;">
          ${Object.entries(ACP_RANKING_SORT_OPTIONS).map(([sortKey, sortLabel]) => `<button class="mini-btn ${economyViewState.acpRankingSort === sortKey ? 'active' : ''}" onclick="setAcpRankingSort('${sortKey}')">${escapeLoginManagerText(sortLabel)}</button>`).join('')}
        </div>
        <p class="muted">Letzte Aktualisierung: ${rankingUpdatedAt}${economyViewState.acpRankingLoading ? ' • aktualisiert gerade...' : ''}</p>
        <div class="workspace-card">${renderAcpRankingTable()}</div>
      </div>
    `;
    return;
  }
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Galaktische Wirtschaft & Börse</h2>
        <p>Fraktionshaushalt, öffentlicher Aktienmarkt, Wirtschaftsberichte und Senatspolitik.</p>
      </div>
      <div class="toolbar-row end">
        <button class="mini-btn primary" onclick="setEconomySection('trade')">Aktienhandel</button>
        <button class="mini-btn" onclick="setEconomySection('portfolio')">Portfolio</button>
        <button class="mini-btn" onclick="setEconomySection('sectorEconomy')">Sektor-Wirtschaft</button>
        <button class="mini-btn" onclick="setEconomySection('acp')">ACP</button>
        <button class="mini-btn" onclick="fetchEconomyView()">Aktualisieren</button>
      </div>
    </div>
    ${economyViewState.error ? `<div class="muted-box">${escapeLoginManagerText(economyViewState.error)}</div>` : ''}
    <div class="workspace-grid">
      <div class="stat-card"><strong>${escapeLoginManagerText(factionAccountLabels[economyViewState.factionAccountKey] || 'GAR-Haushalt')}</strong><span>${formatCredits(factionAccount?.credits ?? pool.credits)}</span></div>
      <div class="stat-card"><strong>Inflation</strong><span>${(Number(economyViewState.inflationRate || 0) * 100).toFixed(1).replace('.', ',')} %</span></div>
      <div class="stat-card"><strong>Persönliches Portfolio</strong><span>${economyViewState.portfolioEnabled ? formatCredits(portfolioValue) : 'Nicht vorhanden'}</span></div>
      <div class="stat-card"><strong>${economyViewState.consumerMode ? 'Nächste Nachfrage' : 'Aktienkauf'}</strong><span>${cooldownText}</span></div>
    </div>
    <div class="workspace-section">
      <h3>Top 50 der letzten Stunde</h3>
      <p class="muted">Sortiert nach der prozentualen Kursentwicklung gegenüber dem Stand vor einer Stunde.</p>
      <div class="workspace-card">
        <table class="data-table">
          <thead><tr><th>Rang</th><th>Aktie</th><th>Sektor</th><th>Kurs vor 1h</th><th>Aktuell</th><th>Entwicklung</th></tr></thead>
          <tbody>${topLastHour.map((company, index) => `<tr>
            <td>${index + 1}</td>
            <td><strong>${escapeLoginManagerText(company.name)}</strong><br><small>${escapeLoginManagerText(company.symbol)}</small></td>
            <td>${escapeLoginManagerText(company.sector || company.faction)}</td>
            <td>${formatCredits(company.referencePrice)}</td>
            <td>${formatCredits(company.currentPrice)}</td>
            <td style="color:${Number(company.changePercent || 0) >= 0 ? '#55d68b' : '#ff6b6b'}">${Number(company.changePercent || 0) >= 0 ? '+' : ''}${Number(company.changePercent || 0).toFixed(2).replace('.', ',')} %</td>
          </tr>`).join('') || '<tr><td colspan="6">Noch keine Kursdaten der letzten Stunde vorhanden.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Öffentliche Portfolio-Rangliste</h3>
        <table class="data-table">
          <thead><tr><th>Rang</th><th>Anonymes Portfolio</th><th>Aktien</th><th>Wert</th></tr></thead>
          <tbody>${(economyViewState.leaderboard || []).map((entry, index) => `<tr><td>${index + 1}</td><td>${escapeLoginManagerText(entry.alias)}</td><td>${entry.totalShares}</td><td>${formatCredits(entry.portfolioValue)}</td></tr>`).join('') || '<tr><td colspan="4">Noch keine Portfolios.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="workspace-card">
        <h3>Letzte galaktische Ereignisse</h3>
        ${(economyViewState.events || []).map((event) => `<div class="project-card"><h4>${escapeLoginManagerText(event.title)}</h4><p>${escapeLoginManagerText(event.description)}</p><small>${new Date(event.startedAt).toLocaleString('de-DE')}</small></div>`).join('') || '<div class="muted-box">Noch keine Wirtschaftsereignisse.</div>'}
      </div>
    </div>
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>ACP Schnellübersicht</h3>
        <table class="data-table">
          <thead><tr><th>Rohstoff</th><th>Ø Preis</th><th>Basis</th></tr></thead>
          <tbody>${acpRows.map((entry) => `<tr><td>${escapeLoginManagerText(entry.label)}</td><td>${formatCredits(entry.averagePrice)}</td><td>${formatCredits(entry.averageBasePrice)}</td></tr>`).join('') || '<tr><td colspan="3">Noch keine ACP-Daten.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="workspace-card">
        <h3>Marktintelligenz</h3>
        ${(economyViewState.intelligenceReports || []).slice(0, 6).map((report) => `<div class="project-card"><h4>${escapeLoginManagerText(RESOURCE_LABELS[report.resourceType] || report.resourceType)}</h4><p>${escapeLoginManagerText(report.message)}</p><small>${formatMarketDateTime(report.createdAt)}</small></div>`).join('') || '<div class="muted-box">Noch keine Marktberichte.</div>'}
      </div>
    </div>
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Wirtschaftsbericht</h3>
        <p>Zivile Produktionsgebäude erwirtschaften Bruttoumsätze. Nur der vom Senat festgelegte Steueranteil fließt als Credits in den GAR-Haushalt. Entwicklungszentren erhöhen den Bruttoumsatz auf demselben Planeten.</p>
        <p><strong>Aktuelle Steuer:</strong> ${(Number(economyViewState.policy?.taxRate || 0) * 100).toFixed(0)} %</p>
        <p><strong>Förderung:</strong> ${escapeLoginManagerText(economyViewState.policy?.subsidy || 'none')}</p>
        <p class="muted">Hohe Creditbestände erhöhen die Inflation und schwächen neue Creditproduktion.</p>
      </div>
      ${canManageEconomyPolicy() ? `<div class="workspace-card">
        <h3>Senatspolitik</h3>
        <div class="form-row"><label>Wirtschaftssteuer (0–25 %)</label><input id="economyTaxRate" type="number" min="0" max="25" value="${Math.round(Number(economyViewState.policy?.taxRate || 0) * 100)}"></div>
        <div class="form-row"><label>Wirtschaftsförderung</label><select id="economySubsidy">
          <option value="none" ${economyViewState.policy?.subsidy === 'none' ? 'selected' : ''}>Keine Förderung</option>
          <option value="civilian" ${economyViewState.policy?.subsidy === 'civilian' ? 'selected' : ''}>Zivile Wirtschaft</option>
          <option value="shipbuilding" ${economyViewState.policy?.subsidy === 'shipbuilding' ? 'selected' : ''}>Schiffbau</option>
          <option value="logistics" ${economyViewState.policy?.subsidy === 'logistics' ? 'selected' : ''}>Logistik</option>
          <option value="research" ${economyViewState.policy?.subsidy === 'research' ? 'selected' : ''}>Forschung</option>
        </select></div>
        <button class="primary" onclick="saveEconomyPolicy()">Politik speichern</button>
      </div>` : ''}
    </div>
    <div class="workspace-section">
      <h3>Asset Manager</h3>
      <div class="workspace-card">
        <table class="data-table">
          <thead><tr><th>Institution</th><th>Strategie</th><th>Cash</th><th>Aktienwert</th><th>Gesamtwert</th><th>Aktien</th></tr></thead>
          <tbody>${(economyViewState.institutionalInvestors || []).map((investor) => `<tr>
            <td><strong>${escapeLoginManagerText(investor.name)}</strong></td>
            <td>${escapeLoginManagerText(investor.strategy || '-')}</td>
            <td>${formatCredits(investor.creditBalance)}</td>
            <td>${formatCredits(investor.holdingsValue)}</td>
            <td>${formatCredits(investor.totalValue)}</td>
            <td>${Number(investor.totalShares || 0).toLocaleString('de-DE')}</td>
          </tr>`).join('') || '<tr><td colspan="6">Noch keine Asset Manager initialisiert. Server neu starten, damit die defensiven Migrationen laufen.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="workspace-section">
      <h3>Institutionelle Aktivität</h3>
      <div class="workspace-card">
        <table class="data-table">
          <thead><tr><th>Zeit</th><th>Investor</th><th>Aktion</th><th>Holding</th><th>Menge</th><th>Preis</th></tr></thead>
          <tbody>${(economyViewState.institutionalTrades || []).slice(0, 12).map((trade) => `<tr><td>${formatMarketDateTime(trade.createdAt)}</td><td>${escapeLoginManagerText(trade.investorName || 'Institution')}</td><td>${escapeLoginManagerText(trade.action)}</td><td>${escapeLoginManagerText(getEconomyCompanyById(trade.companyId)?.name || trade.companyId)}</td><td>${trade.quantity}</td><td>${formatCredits(trade.price)}</td></tr>`).join('') || '<tr><td colspan="6">Noch keine institutionellen Aktivitäten.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

