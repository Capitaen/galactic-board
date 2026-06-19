// Generated from app-shell.js: shipyard, build projects, map input and interaction handlers

function renderShipyardView() {
  runCampaignMaintenance();
  const role = currentRole();
  if (role === 'Senat') {
    workspacePanel.innerHTML = `
      <div class="workspace-head">
        <div>
          <h2>Schiffbau</h2>
          <p>Diese Ansicht ist für den Senat gesperrt. Senat und Navy teilen sich zwar den GAR-Ressourcenpool, aber Senatoren starten keine Schiffsbauten.</p>
        </div>
      </div>
      <div class="workspace-section">
        <div class="muted-box">Bitte den Tab "Bauprojekte" nutzen, um Infrastrukturprojekte zu verwalten.</div>
      </div>
    `;
    return;
  }
  const shipClassOptions = getShipClassOptions();
  const selectedClassId = document.getElementById('shipyardClass')?.value || shipClassOptions[0]?.id || 'venator';
  const selectedMeta = getShipClassMeta(selectedClassId);
  const locationChoices = getShipyardLocationChoices(selectedClassId);
  const locations = locationChoices.filter((planet) => planet.enabled);
  const selectedLocationId = document.getElementById('shipyardLocation')?.value || locations[0]?.id || locationChoices[0]?.id || '';
  const faction = getActiveShipyardFaction();
  const pool = getFactionResourcePool(faction);
  const selectedLocationPlanet = planetIndex.get(selectedLocationId);
  const sectorCostSummary = faction === 'GAR' && selectedLocationPlanet ? getSectorShipyardCostSummary(selectedLocationId, selectedMeta?.cost || {}) : null;
  const canBuildAnything = role !== 'Viewer' && (
    role === 'Admin'
    || (role === 'Republic Navy / GAR' && faction === 'GAR' && canCoordinate4thFleet())
    || (role === 'Eventleiter / KUS' && faction === 'KUS')
  );
  const resourceSummary = RESOURCE_KEYS.map((key) => `<div class="stat-card"><strong>${RESOURCE_LABELS[key]}</strong><span>${formatResourceAmount(pool[key])}</span></div>`).join('');
  const buildJobs = state.buildJobs.filter((job) => job.faction === faction && job.jobType !== 'mine' && job.status === 'building');
  const visibleBuildJobs = state.buildJobs
    .filter((job) => job.faction === faction && job.jobType !== 'mine' && job.status === 'building')
    .sort((a, b) => Number(a.finishesAt || 0) - Number(b.finishesAt || 0));
  const shipyardActivity = (Array.isArray(state.meta?.buildProjectActivity) ? state.meta.buildProjectActivity : [])
    .filter((entry) => (entry.faction || 'GAR') === faction && entry.jobType !== 'mine')
    .slice(0, 18);
  const readyShips = state.ships.filter((ship) => ship.faction === faction && ship.status === 'ready');
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Schiffbau</h2>
        <p>${faction === 'GAR'
          ? (DEBUG_DISABLE_GAR_BUILD_LIMITS
            ? 'GAR-Debugmodus aktiv: Sofortbau ohne Rohstoff- und Zeitbegrenzung. Produktionswerte laufen weiter zu Testzwecken im 2-Minuten-Takt.'
            : 'GAR-Rohstoffe, stündliche Produktion und Bauaufträge verwalten.')
          : 'KUS-Schiffbau mit eigener stündlicher Rohstoffproduktion und direkter Eventleitungskontrolle.'}</p>
      </div>
      <div class="toolbar-row">
        ${role === 'Admin' ? `
          <select id="shipyardFactionSwitch" onchange="setShipyardFaction(this.value)">
            <option value="GAR" ${faction === 'GAR' ? 'selected' : ''}>GAR Schiffbau</option>
            <option value="KUS" ${faction === 'KUS' ? 'selected' : ''}>KUS Schiffbau</option>
          </select>
        ` : ''}
        <button class="mini-btn" onclick="renderShipyardView()">Aktualisieren</button>
      </div>
    </div>
    <div class="workspace-grid">
      ${resourceSummary}
    </div>
    ${canBuildAnything ? '' : `<div class="workspace-section"><div class="muted-box">${
      role === 'Republic Navy / GAR' && faction === 'GAR'
        ? 'Für GAR-Schiffbau wird die Berechtigung „4th Flottenkoordination“ benötigt.'
        : 'Deine aktuelle Rolle kann keinen Schiffbau starten.'
    }</div></div>`}
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Bauauftrag starten</h3>
        <div class="form-row">
          <label>Schiffsklasse</label>
          <select id="shipyardClass" onchange="onShipyardClassChange()">
            ${shipClassOptions.map((entry) => `<option value="${entry.id}" ${entry.id === selectedClassId ? 'selected' : ''}>${entry.displayName}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Schiffsname</label>
          <input id="shipyardName" placeholder="Optionaler Eigenname">
        </div>
        <div class="form-row">
          <label>Bauort</label>
          <select id="shipyardLocation">
            ${locationChoices.map((planet) => `<option value="${planet.id}" ${planet.id === selectedLocationId ? 'selected' : ''} ${planet.enabled ? '' : 'disabled'}>${planet.name}${planet.enabled ? '' : ' (nicht unter KUS/GAR-Kontrolle)'}</option>`).join('')}
          </select>
        </div>
        <div class="workspace-card compact">
          <strong>Kosten</strong>
          <p>${faction === 'GAR'
            ? (DEBUG_DISABLE_GAR_BUILD_LIMITS
              ? 'Debug aktiv: GAR-Kosten derzeit deaktiviert.'
              : RESOURCE_KEYS.map((key) => `${RESOURCE_LABELS[key]}: ${selectedMeta?.cost?.[key] || 0}`).join(' • '))
            : 'KUS-Bau bleibt sofort verfügbar und ignoriert aktuell Rohstoffkosten.'}</p>
          ${faction === 'GAR' && sectorCostSummary ? `<p><strong>Zentrale Verfügbarkeit:</strong> ${STORAGE_RESOURCE_KEYS.map((key) => `${RESOURCE_LABELS[key]} ${formatResourceAmount(sectorCostSummary.warehouseSummary.resources?.[key]?.stock || 0)}`).join(' • ')}</p>` : ''}
          <p><strong>Bauzeit:</strong> ${faction === 'KUS' || DEBUG_DISABLE_GAR_BUILD_LIMITS ? 'Sofort' : `${selectedMeta?.buildTimeHours || 0}h`}</p>
          <p><strong>Bauorte:</strong> ${faction === 'KUS' ? 'Geonosis, Muunilinst, Serenno, Raxus' : (selectedMeta?.buildLocations === 'anyGARPlanet' ? 'Jeder GAR-Planet' : (selectedMeta?.buildLocations || []).join(', '))}</p>
        </div>
        <button class="primary" onclick="startBuildOrder()" ${canBuildAnything && locations.length && (faction === 'KUS' || DEBUG_DISABLE_GAR_BUILD_LIMITS || canAffordSectorShipyardCost(selectedLocationId, selectedMeta?.cost)) ? '' : 'disabled'}>${faction === 'KUS' || DEBUG_DISABLE_GAR_BUILD_LIMITS ? `${faction}-Schiff sofort erzeugen` : 'Bau starten'}</button>
      </div>
      <div class="workspace-card">
        <h3>Bauhinweise</h3>
        <p>GAR-Schiffbau nutzt automatisch das zentrale Großlager auf Coruscant.</p>
        <p class="muted">Die stündliche Produktionsübersicht findest du jetzt im Tab <strong>Logistik & Lager</strong> unter Bauprojekte.</p>
      </div>
    </div>
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Projektübersicht</h3>
        ${visibleBuildJobs.length ? `
          <div class="project-grid">
            ${visibleBuildJobs.map((job) => `
              <div class="project-card">
                <h4>${getBuildJobDisplayName(job)}</h4>
                <p class="project-meta">${getBuildJobTypeLabel(job)} • ${getBuildJobLocationName(job)} • ${job.faction || 'GAR'}</p>
                ${job.startedBy ? `<p class="project-meta">Gestartet von: ${escapeHtml(job.startedBy)}</p>` : ''}
                ${getBuildJobProgressBar(job)}
                ${job.status !== 'building' && job.completedAt ? `<p class="project-meta">Abgeschlossen: ${formatMarketDateTime(job.completedAt)}</p>` : ''}
                ${canCancelBuildJob(job) ? `<button class="mini-btn danger" onclick="cancelBuildJob('${job.id}')">Bau abbrechen (90% Rueckgabe)</button>` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<div class="muted-box">Keine Schiffbauprojekte vorhanden.</div>'}
      </div>
      <div class="workspace-card">
        <h3>Aktivitätsliste</h3>
        ${shipyardActivity.length ? shipyardActivity.map((entry) => `
          <div class="project-card">
            <h4>${escapeHtml(entry.title || 'Aktivität')}</h4>
            <p class="project-meta">${escapeHtml(entry.location || '—')} • ${escapeHtml(entry.faction || faction)}</p>
            <p>${escapeHtml(entry.details || 'Keine Zusatzdetails.')}</p>
            <small>${formatMarketDateTime(entry.createdAt)}${entry.author ? ` • ${escapeHtml(entry.author)}` : ''}</small>
          </div>
        `).join('') : '<div class="muted-box">Noch keine abgeschlossenen Aktivitäten geloggt.</div>'}
      </div>
    </div>
    <div class="workspace-section">
      <h3>Fertig / Abholbereit</h3>
      <div class="workspace-card">
        ${readyShips.length ? `
          <table class="data-table">
            <thead><tr><th>Schiff</th><th>Klasse</th><th>Standort</th><th>Aktion</th></tr></thead>
            <tbody>
              ${readyShips.map((ship) => `
                <tr>
                  <td>${ship.name}</td>
                  <td>${getShipClassMeta(ship.classId)?.displayName || ship.classId}</td>
                  <td>${getShipDisplayLocation(ship)}</td>
                  <td>${ship.locationPlanetId ? `<button class="mini-btn" onclick="showManagedShipOnMap('${ship.id}')">Auf Map</button>` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="muted-box">Noch keine abholbereiten Schiffe.</div>'}
      </div>
    </div>
  `;
}

function renderBuildProjectsView() {
  runCampaignMaintenance();
  const role = currentRole();
  const faction = role === 'Eventleiter / KUS' ? 'KUS' : 'GAR';
  const pool = getFactionResourcePool(faction);
  const buildJobs = state.buildJobs
    .filter((job) => (role === 'Admin' ? true : job.faction === faction))
    .sort((a, b) => Number(a.finishesAt || 0) - Number(b.finishesAt || 0));
  const visibleBuildJobs = buildJobs.filter((job) => job.status === 'building' || (job.completedAt && (Date.now() - Number(job.completedAt || 0)) < (48 * 60 * 60 * 1000)));
  const buildActivity = (Array.isArray(state.meta?.buildProjectActivity) ? state.meta.buildProjectActivity : [])
    .filter((entry) => role === 'Admin' || entry.faction === faction)
    .slice(0, 18);
  const requestedCategory = document.getElementById('infrastructureCategory')?.value || 'military';
  const selectedCategory = ['military', 'civilian', 'development'].includes(requestedCategory)
    ? requestedCategory
    : 'military';
  const minePlanetChoices = getMineProjectPlanetChoices(selectedCategory);
  const selectedPlanetId = document.getElementById('mineBuildPlanet')?.value || minePlanetChoices[0]?.id || '';
  const selectedPlanet = minePlanetChoices.find((planet) => planet.id === selectedPlanetId) || minePlanetChoices[0] || null;
  const categoryProjects = Object.entries(MINE_PROJECT_DEFS).filter(([, project]) => project.category === selectedCategory);
  const requestedBuildingKey = document.getElementById('mineBuildResource')?.value || '';
  const selectedBuildingKey = categoryProjects.some(([key]) => key === requestedBuildingKey)
    ? requestedBuildingKey
    : (categoryProjects[0]?.[0] || '');
  const availableSlots = getAvailableMineSlots(selectedPlanet?.id || '');
  const selectedSlotIndex = document.getElementById('mineBuildSlot')?.value || String(availableSlots[0]?.index ?? '');
  const selectedMineMeta = getMineProjectMeta(selectedBuildingKey);
  const selectedMineProductionPerHour = Math.max(1, Number(selectedMineMeta?.productionPerHour || 1));
  const selectedPlanetProduction = selectedPlanet ? getPlanetProductionRate(selectedPlanet.id) : createEmptyFactionResources();
  const selectedPlanetBonuses = selectedPlanet ? getPlanetCivilianBonuses(selectedPlanet.id) : createEmptyFactionResources();
  const logisticsSectors = getLogisticsSectorChoices();
  const selectedLogisticsSectorId = document.getElementById('warehouseSectorSelect')?.value || logisticsSectors[0]?.id || '';
  const selectedLogisticsSector = logisticsSectors.find((entry) => entry.id === selectedLogisticsSectorId) || logisticsSectors[0] || null;
  const sectorWarehouseSummary = selectedLogisticsSector ? getSectorWarehouseSummary(selectedLogisticsSector.id) : null;
  const centralWarehouseSummary = getCentralWarehouseSummary();
  const warehousePlanetChoices = getMineProjectPlanetChoices('storage');
  const selectedWarehousePlanetId = document.getElementById('warehouseBuildPlanet')?.value || warehousePlanetChoices[0]?.id || '';
  const selectedWarehousePlanet = warehousePlanetChoices.find((planet) => planet.id === selectedWarehousePlanetId) || warehousePlanetChoices[0] || null;
  const selectedWarehousePlanetSlots = selectedWarehousePlanet ? getAvailableMineSlots(selectedWarehousePlanet.id) : [];
  const canStartMineProject = canBuildMineProjects();
  const canBuildWarehouseInfra = canBuildWarehouses();
  const logisticsProduction = faction === 'GAR' ? getEffectiveFactionProductionRate('GAR') : createEmptyFactionResources();
  const activeTab = buildProjectsViewTab === 'logistics' ? 'logistics' : 'infrastructure';
  workspacePanel.innerHTML = `
    <div class="workspace-head">
      <div>
        <h2>Bauprojekte</h2>
        <p>Schiffs- und Infrastrukturprojekte mit gemeinsamem Ressourcenpool. Senat baut GAR-Infrastruktur, Navy und Eventleitung sehen die laufenden Projekte zur Abstimmung.</p>
      </div>
      <div class="toolbar-row">
        <button class="mini-btn ${activeTab === 'infrastructure' ? 'active' : ''}" onclick="setBuildProjectsViewTab('infrastructure')">Infrastruktur</button>
        <button class="mini-btn ${activeTab === 'logistics' ? 'active' : ''}" onclick="setBuildProjectsViewTab('logistics')">Logistik & Lager</button>
        <button class="mini-btn" onclick="renderBuildProjectsView()">Aktualisieren</button>
      </div>
    </div>
    <div class="workspace-grid">
      ${RESOURCE_KEYS.map((key) => `<div class="stat-card"><strong>${RESOURCE_LABELS[key]}</strong><span>${formatResourceAmount(pool[key])}</span></div>`).join('')}
    </div>
    ${activeTab === 'infrastructure' ? `
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Infrastrukturprojekt</h3>
        <p>${canStartMineProject ? 'Wähle einen republikanischen Planeten, eine Gebäudekategorie und einen freien Slot. Jedes Gebäude belegt genau einen Slot.' : 'Nur Senats-Admins und globale Admins können GAR-Infrastrukturprojekte starten.'}</p>
        <div class="form-row">
          <label>Planet</label>
          <div class="inline-search-wrap">
            <input id="mineBuildPlanetSearch" type="search" value="${selectedPlanet?.name || ''}" placeholder="Planet suchen..." autocomplete="off" ${canStartMineProject ? '' : 'disabled'}>
            <input id="mineBuildPlanet" type="hidden" value="${selectedPlanet?.id || ''}">
            <div id="mineBuildPlanetResults" class="inline-search-results hidden"></div>
          </div>
        </div>
        <div class="form-row">
          <label>Gebäudekategorie</label>
          <select id="infrastructureCategory" ${canStartMineProject ? '' : 'disabled'} onchange="renderBuildProjectsView()">
            <option value="military" ${selectedCategory === 'military' ? 'selected' : ''}>Militärische Infrastruktur</option>
            <option value="civilian" ${selectedCategory === 'civilian' ? 'selected' : ''}>Zivile Infrastruktur</option>
            <option value="development" ${selectedCategory === 'development' ? 'selected' : ''}>Wirtschafts- und Entwicklungszentren</option>
          </select>
        </div>
        <div class="form-row">
          <label>Gebäudetyp</label>
          <select id="mineBuildResource" ${canStartMineProject ? '' : 'disabled'} onchange="renderBuildProjectsView()">
            ${categoryProjects.map(([buildingKey, project]) => `<option value="${buildingKey}" ${buildingKey === selectedBuildingKey ? 'selected' : ''}>${project.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>Freier Slot</label>
          <select id="mineBuildSlot" ${canStartMineProject ? '' : 'disabled'}>
            ${availableSlots.length
              ? availableSlots.map((entry) => `<option value="${entry.index}" ${String(entry.index) === String(selectedSlotIndex) ? 'selected' : ''}>Slot ${entry.index + 1}</option>`).join('')
              : '<option value="">Keine freien Slots</option>'}
          </select>
        </div>
        <div class="workspace-card compact">
          <strong>${selectedMineMeta?.label || 'Gebäude'}</strong>
          <p>${selectedMineMeta?.category === 'development'
            ? selectedMineMeta.description
            : (selectedMineMeta?.category === 'civilian'
              ? `Erwirtschaftet etwa ${formatCredits((CIVILIAN_CREDIT_YIELDS[selectedBuildingKey]?.credits || 0) * selectedMineProductionPerHour)} Bruttoumsatz pro Stunde. Nur der festgelegte Steuersatz fließt in den GAR-Haushalt.`
              : `Produziert +${selectedMineProductionPerHour} ${RESOURCE_LABELS[selectedMineMeta?.productionResource] || 'Ressource'} pro Stunde und speist sie direkt ins Grosslager auf Coruscant.`)}</p>
          <strong>Kosten</strong>
          <p>${RESOURCE_KEYS.map((key) => `${RESOURCE_LABELS[key]}: ${selectedMineMeta?.cost?.[key] || 0}`).join(' • ')}</p>
          <p><strong>Bauzeit:</strong> ${MINE_BUILD_DURATION_HOURS}h</p>
          ${selectedPlanet && selectedMineMeta?.productionResource ? `<p><strong>Lagerpflicht:</strong> ${escapeHtml(getMineWarehouseCompliance(selectedPlanet, selectedMineMeta).ok ? 'Lokales Lager im Sektor vorhanden.' : getMineWarehouseCompliance(selectedPlanet, selectedMineMeta).reason)}</p>` : ''}
        </div>
        <button class="primary" onclick="startMineBuildProject()" ${(canStartMineProject && availableSlots.length && canAffordGarInfrastructureCost(selectedMineMeta?.cost || {}) && (!selectedPlanet || getMineWarehouseCompliance(selectedPlanet, selectedMineMeta).ok)) ? '' : 'disabled'}>Infrastrukturprojekt starten</button>
      </div>
      <div class="workspace-card">
        <h3>Produktion auf ${selectedPlanet?.name || 'Planet'}</h3>
        <table class="data-table">
          <thead><tr><th>Rohstoff</th><th>Bonus</th><th>Pro Stunde</th></tr></thead>
          <tbody>
            ${RESOURCE_KEYS.map((key) => `<tr><td>${RESOURCE_LABELS[key]}</td><td>+${Math.round((selectedPlanetBonuses[key] || 0) * 100)} %</td><td>+${formatResourceAmount(selectedPlanetProduction[key])}</td></tr>`).join('')}
          </tbody>
        </table>
        <p class="muted">Boni der Wirtschafts- und Entwicklungszentren wirken auf alle militärischen und zivilen Produktionsgebäude desselben Planeten. Je Rohstoff gilt ein Maximum von +${MAX_CIVILIAN_PRODUCTION_BONUS * 100} %.</p>
        <p class="muted" style="margin-top:8px">${selectedPlanet ? `${getPlanetSlotUsage(selectedPlanet.id).used}/10 Slots auf ${selectedPlanet.name} belegt.` : ''}</p>
      </div>
      <div class="workspace-card">
        <h3>Projektübersicht</h3>
        ${visibleBuildJobs.length ? `
          <div class="project-grid">
            ${visibleBuildJobs.map((job) => `
              <div class="project-card">
                <h4>${getBuildJobDisplayName(job)}</h4>
                <p class="project-meta">${getBuildJobTypeLabel(job)} • ${getBuildJobLocationName(job)} • ${job.faction || 'GAR'}</p>
                ${job.startedBy ? `<p class="project-meta">Gestartet von: ${escapeHtml(job.startedBy)}</p>` : ''}
                ${job.jobType === 'mine' ? `<p class="project-meta">Slot ${Number(job.targetSlotIndex) + 1} • ${getMineProjectMeta(job.buildingKey || job.resourceKey)?.label || 'Infrastruktur'}</p>` : ''}
                ${getBuildJobProgressBar(job)}
                ${job.status !== 'building' && job.completedAt ? `<p class="project-meta">Abgeschlossen: ${formatMarketDateTime(job.completedAt)}</p>` : ''}
                ${canCancelBuildJob(job) ? `<button class="mini-btn danger" onclick="cancelBuildJob('${job.id}')">Bau abbrechen (90% Rueckgabe)</button>` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<div class="muted-box">Keine Bauprojekte vorhanden.</div>'}
      </div>
    </div>
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Aktivitätsliste</h3>
        ${buildActivity.length ? buildActivity.map((entry) => `
          <div class="project-card">
            <h4>${escapeHtml(entry.title || 'Aktivität')}</h4>
            <p class="project-meta">${escapeHtml(entry.location || '—')} • ${escapeHtml(entry.faction || 'GAR')}</p>
            <p>${escapeHtml(entry.details || 'Keine Zusatzdetails.')}</p>
            <small>${formatMarketDateTime(entry.createdAt)}${entry.author ? ` • ${escapeHtml(entry.author)}` : ''}</small>
          </div>
        `).join('') : '<div class="muted-box">Noch keine abgeschlossenen Aktivitäten geloggt.</div>'}
      </div>
      <div class="workspace-card">
        <h3>Hinweis</h3>
        <p>Abgeschlossene Bauprojekte bleiben bis zu 48 Stunden in der Projektübersicht sichtbar und wandern zusätzlich dauerhaft in die Aktivitätsliste.</p>
      </div>
    </div>
    ` : `
    <div class="workspace-section workspace-columns">
      <div class="workspace-card">
        <h3>Grosslager Coruscant</h3>
        <table class="data-table">
          <thead><tr><th>Ressource</th><th>Bestand</th><th>Kapazität</th></tr></thead>
          <tbody>
            ${STORAGE_RESOURCE_KEYS.map((resourceKey) => `
              <tr>
                <td>${RESOURCE_LABELS[resourceKey]}</td>
                <td>${formatResourceAmount(centralWarehouseSummary.resources[resourceKey]?.stock || 0)}</td>
                <td>Unbegrenzt</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="muted">Alle militärischen Fördergebäude speisen ihre Rohstoffe direkt in das zentrale Republik-Lager auf Coruscant ein.</p>
      </div>
      <div class="workspace-card">
        <h3>Stündliche Produktion / Staatseinnahmen</h3>
        <table class="data-table">
          <thead><tr><th>Rohstoff</th><th>Pro Stunde</th></tr></thead>
          <tbody>
            ${RESOURCE_KEYS.map((key) => `<tr><td>${RESOURCE_LABELS[key]}</td><td>+${formatResourceAmount(logisticsProduction[key])}</td></tr>`).join('')}
          </tbody>
        </table>
        <p class="muted">Militärische Produktion läuft automatisch ins Coruscant-Lager. Baukosten und Schiffbau ziehen benötigte Bestände automatisch aus dem zentralen GAR-Lager.</p>
      </div>
    </div>
    <div class="workspace-section">
      <div class="workspace-card">
        <h3>Logistikstatus</h3>
        <p>Auf der Website wird aktuell nur das zentrale Großlager auf Coruscant geführt. Planetare oder sektorale Zusatzlager werden nicht mehr separat angezeigt.</p>
      </div>
    </div>
    `}
  `;
  const minePlanetInput = document.getElementById('mineBuildPlanetSearch');
  if (minePlanetInput && canStartMineProject) {
    minePlanetInput.addEventListener('input', () => {
      const hidden = document.getElementById('mineBuildPlanet');
      const startButton = minePlanetInput.closest('.workspace-card')?.querySelector('button.primary');
      if (hidden) hidden.value = '';
      if (startButton) startButton.disabled = true;
      updateMineBuildPlanetSearch(minePlanetInput.value);
    });
    minePlanetInput.addEventListener('focus', () => {
      updateMineBuildPlanetSearch(minePlanetInput.value);
    });
    minePlanetInput.addEventListener('blur', () => {
      window.setTimeout(closeMineBuildPlanetResults, 120);
    });
    minePlanetInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveMineBuildPlanetSelection(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveMineBuildPlanetSelection(-1);
        return;
      }
      if (event.key === 'Enter') {
        const planet = mineBuildPlanetSearchState.results[Math.max(0, mineBuildPlanetSearchState.activeIndex)];
        if (planet) {
          event.preventDefault();
          chooseMineBuildPlanet(planet.id);
        }
        return;
      }
      if (event.key === 'Escape') closeMineBuildPlanetResults();
    });
  }
}

function setBuildProjectsViewTab(tabId) {
  buildProjectsViewTab = tabId === 'logistics' ? 'logistics' : 'infrastructure';
  renderBuildProjectsView();
}

function clearSnapTarget() {
  if (!activeSnapPlanetId) return;
  const entry = planetElements.get(activeSnapPlanetId);
  if (entry) entry.point.classList.remove('snap-target');
  activeSnapPlanetId = null;
}

function setSnapTarget(planetId) {
  if (activeSnapPlanetId === planetId) return;
  clearSnapTarget();
  const entry = planetElements.get(planetId);
  if (entry) {
    entry.point.classList.add('snap-target');
    activeSnapPlanetId = planetId;
  }
}

function eventToWorld(event) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left - panX) / zoom, 0, WORLD_SIZE),
    y: clamp((event.clientY - rect.top - panY) / zoom, 0, WORLD_SIZE)
  };
}

function startMapPan(event) {
  activeInteraction = {
    mode: 'pan',
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPanX: panX,
    startPanY: panY
  };
  viewport.classList.add('dragging');
  setHoveredRoute(null);
}

function finishInteraction(event) {
  if (!activeInteraction) return;
  if (event && activeInteraction.pointerId !== undefined && event.pointerId !== activeInteraction.pointerId) return;
  const interaction = activeInteraction;
  activeInteraction = null;
  viewport.classList.remove('dragging');
  if (interaction.mode === 'planet-drag') {
    const planet = planetIndex.get(interaction.id);
    if (planet) {
      saveLocal();
      render({ positions: true, frontline: true, layers: true });
      if (selected?.type === 'planet' && selected.id === planet.id) openPlanet(planet.id);
      setStatus(`Planet verschoben: ${planet.name} bei ${Math.round(planet.x)}, ${Math.round(planet.y)}`);
    }
  } else if (interaction.mode === 'marker-drag') {
    const marker = ensureMapMarkerStore().find((entry) => entry.id === interaction.id);
    if (marker) {
      saveLocal();
      render({ positions: true, layers: true });
      if (selected?.type === 'marker' && selected.id === marker.id) openMarker(marker.id);
      setStatus(`Marker verschoben: ${marker.name} bei ${Math.round(marker.x)}, ${Math.round(marker.y)}`);
    }
  } else if (interaction.mode === 'fleet-drag') {
    const fleet = fleetIndex.get(interaction.id);
    const targetPlanet = activeSnapPlanetId ? planetIndex.get(activeSnapPlanetId) : null;
    clearSnapTarget();
    if (fleet && targetPlanet) {
      fleet.planetId = targetPlanet.id;
      syncFleetCoords(fleet);
      rebuildFleetRenderPositions();
      updateFleetElement(fleet);
      saveLocal();
      render({ positions: true, layers: true });
      if (selected?.type === 'fleet' && selected.id === fleet.id) openFleet(fleet.id);
      setStatus(`Flotte an Sternsystem gebunden: ${fleet.name} -> ${targetPlanet.name}`);
    } else if (fleet) {
      syncFleetCoords(fleet);
      updateFleetElement(fleet);
    }
  } else if (interaction.mode === 'pan') {
    if (event) setStatus(describeViewStatus());
  }
}

window.addEventListener('pointermove', (event) => {
  if (!activeInteraction) {
    queueHoverStateUpdate(event);
  }
  if (!activeInteraction) return;
  if (activeInteraction.mode === 'planet-drag') {
    const planet = planetIndex.get(activeInteraction.id);
    if (!planet) return;
    const worldPos = eventToWorld(event);
    setPlanetWorldPosition(planet, worldPos.x, worldPos.y);
    updatePlanetElement(planet);
    rebuildFleetRenderPositions();
    state.fleets.forEach((fleet) => {
      if (fleet.planetId === planet.id) {
        syncFleetCoords(fleet);
        updateFleetElement(fleet);
      }
    });
    markDirty({ routeOverlay: true });
    return;
  }
  if (activeInteraction.mode === 'marker-drag') {
    const marker = ensureMapMarkerStore().find((entry) => entry.id === activeInteraction.id);
    if (!marker) return;
    const worldPos = eventToWorld(event);
    marker.x = clamp(worldPos.x, 0, WORLD_SIZE);
    marker.y = clamp(worldPos.y, 0, WORLD_SIZE);
    updateMarkerElement(marker);
    return;
  }
  if (activeInteraction.mode === 'fleet-drag') {
    const fleet = fleetIndex.get(activeInteraction.id);
    if (!fleet) return;
    const worldPos = eventToWorld(event);
    const target = nearestPlanet(worldPos.x, worldPos.y);
    if (!target) return;
    setSnapTarget(target.id);
    const el = fleetElements.get(fleet.id);
    const targetRender = fleetRenderPositions.get(fleet.id);
    if (el) {
      if (targetRender && fleet.planetId === target.id) {
        el.style.left = targetRender.x + 'px';
        el.style.top = targetRender.y + 'px';
      } else {
        const angle = fleet.faction === 'GAR' ? -Math.PI * 0.72 : Math.PI * 0.28;
        el.style.left = clamp(target.x + Math.cos(angle) * 26, 0, WORLD_SIZE) + 'px';
        el.style.top = clamp(target.y + Math.sin(angle) * 26, 0, WORLD_SIZE) + 'px';
      }
    }
    return;
  }
  if (activeInteraction.mode === 'pan') {
    ({ panX, panY } = clampPanToViewport(
      activeInteraction.startPanX + (event.clientX - activeInteraction.startClientX),
      activeInteraction.startPanY + (event.clientY - activeInteraction.startClientY),
      zoom
    ));
    markDirty({ transform: true });
  }
});

window.addEventListener('mousemove', (event) => {
  if (!activeSectorDraft?.points?.length || activeInteraction) return;
  updateSectorDraftPreview(eventToWorld(event));
});

window.addEventListener('pointerup', finishInteraction);
window.addEventListener('pointercancel', finishInteraction);
viewport.addEventListener('pointerleave', () => {
  pendingHoverUpdate = null;
  if (hoverUpdateFrame) {
    window.cancelAnimationFrame(hoverUpdateFrame);
    hoverUpdateFrame = 0;
  }
  setHoveredPlanet(null);
  queueHoveredRoute(null);
  setHoveredZone(null);
  hoveredMarkerId = null;
});

viewport.addEventListener('pointerdown', (event) => {
  if (event.button === 1) {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    startMapPan(event);
    return;
  }
  if (event.button !== 0) return;
  closeContextMenu();
  if (event.target.closest('.planet, .marker, .fleet, #infoPanel, #legendPanel, #layersPanel, #topbar, .toolstack, #homeBtn, #muteBtn, #contextMenu')) return;
  const worldPos = eventToWorld(event);
  if (isAdminRole() && activeSectorDraft) {
    event.preventDefault();
    event.stopPropagation();
    handleSectorDraftMapClick(worldPos);
    return;
  }
  const clickedPlanet = nearestDisplayedPlanet(worldPos.x, worldPos.y, 22);
  if (clickedPlanet) {
    if (currentRole() === 'Admin' && event.altKey) {
      event.preventDefault();
      activeInteraction = { mode: 'planet-drag', id: clickedPlanet.id, pointerId: event.pointerId };
      viewport.classList.add('dragging');
      setStatus('Kalibrierung aktiv: ' + clickedPlanet.name);
      return;
    }
    openPlanet(clickedPlanet.id);
    return;
  }
  const clickedRoute = nearestDisplayedRoute(worldPos.x, worldPos.y, 8);
  if (clickedRoute) {
    event.preventDefault();
    event.stopPropagation();
    openRoute(clickedRoute.id);
    return;
  }
  const clickedSector = nearestDisplayedZone(worldPos.x, worldPos.y)?.sectorArea;
  if (clickedSector && isAdminRole()) {
    event.preventDefault();
    event.stopPropagation();
    openSector(clickedSector.id || clickedSector.name);
    return;
  }
  startMapPan(event);
  if (selected?.type === 'route') {
    selected = null;
    refreshRouteSelectionState();
  }
});

viewport.addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  event.preventDefault();
  event.stopPropagation();
});

planetLayer.addEventListener('click', (event) => {
  const point = event.target.closest('.planet');
  if (!point) return;
  event.stopPropagation();
  closeContextMenu();
  openPlanet(point.dataset.id);
});

planetLayer.addEventListener('pointerdown', (event) => {
  const point = event.target.closest('.planet');
  if (!point) return;
  event.stopPropagation();
  if (event.button !== 0 || currentRole() !== 'Admin' || !event.altKey) return;
  event.preventDefault();
  activeInteraction = { mode: 'planet-drag', id: point.dataset.id, pointerId: event.pointerId };
  viewport.classList.add('dragging');
  const planet = planetIndex.get(point.dataset.id);
  if (planet) setStatus('Kalibrierung aktiv: ' + planet.name);
});

markerLayer.addEventListener('click', (event) => {
  const marker = event.target.closest('.marker');
  if (!marker) return;
  event.stopPropagation();
  closeContextMenu();
  openMarker(marker.dataset.id);
});

viewport.addEventListener('contextmenu', (event) => {
  if (!canEditPlanet()) return;
  event.preventDefault();
  event.stopPropagation();
  const worldPos = eventToWorld(event);
  const marker = nearestDisplayedMarker(worldPos.x, worldPos.y, 20);
  const planet = marker ? null : nearestDisplayedPlanet(worldPos.x, worldPos.y, 18);
  const hoveredSector = (!marker && !planet) ? nearestDisplayedZone(worldPos.x, worldPos.y)?.sectorArea : null;
  if (marker) {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Marker bearbeiten', run: () => openMarker(marker.id) },
      { label: 'Marker verschieben', run: () => beginMarkerMove(marker.id) },
      { type: 'divider' },
      { label: 'Marker löschen', run: () => deleteMarker(marker.id) }
    ]);
    return;
  }
  if (planet) {
    const canEditTargetPlanet = canEditPlanetRecord(planet);
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Planet ansehen', run: () => openPlanet(planet.id) },
      ...(canEditTargetPlanet ? [{ label: 'Planet verschieben', run: () => beginPlanetMove(planet.id) }] : []),
      ...(planet.isUnofficial && canEditTargetPlanet ? [{ type: 'divider' }, { label: 'Planet löschen', run: () => deletePlanet(planet.id) }] : [])
    ]);
    return;
  }
  if (hoveredSector && isAdminRole() && !activeSectorDraft) {
    openContextMenu(event.clientX, event.clientY, [
      { label: `Sektor oeffnen: ${hoveredSector.name}`, run: () => openSector(hoveredSector.id || hoveredSector.name) },
      { label: `Sektor loeschen: ${hoveredSector.name}`, run: () => deleteManualSector(hoveredSector.id || hoveredSector.name) },
      { label: 'Sektor zeichnen starten', run: () => startSectorDraft(worldPos) }
    ]);
    return;
  }
  const actions = [
    { label: 'Inoffiziellen Planeten erstellen', run: () => createCustomPlanetAt(worldPos.x, worldPos.y) },
    { label: 'Marker erstellen', run: () => createMapMarkerAt(worldPos.x, worldPos.y) }
  ];
  if (isAdminRole()) {
    actions.push({ type: 'divider' });
    if (activeSectorDraft) {
      actions.push({ label: 'Sektorpunkt setzen', run: () => handleSectorDraftMapClick(worldPos) });
      if (activeSectorDraft.points.length >= 3) actions.push({ label: 'Sektor abschließen', run: () => commitSectorDraft() });
      actions.push({ label: 'Sektor abbrechen', run: () => cancelSectorDraft() });
    } else {
      actions.push({ label: 'Sektor zeichnen starten', run: () => startSectorDraft(worldPos) });
    }
  }
  openContextMenu(event.clientX, event.clientY, actions);
});

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  updateZoomFromInput(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
}, { passive: false });

function setView(nextZoom, nextPanX, nextPanY) {
  const prevZoom = zoom;
  zoom = clamp(nextZoom, MIN_ZOOM, getZoomLimit());
  ({ panX, panY } = clampPanToViewport(nextPanX, nextPanY, zoom));
  saveClientUiPrefs();
  if (zoom <= MAX_ZOOM) setClusterZoomState(null);
  markDirty({ transform: true, positions: true, layers: needsLayerRefreshForZoom(prevZoom, zoom) });
  setStatus(describeViewStatus());
}

document.getElementById('zoomIn').onclick = () => {
  const rect = viewport.getBoundingClientRect();
  updateZoomFromInput(1.2, rect.left + (rect.width / 2), rect.top + (rect.height / 2));
};
document.getElementById('zoomOut').onclick = () => {
  const rect = viewport.getBoundingClientRect();
  updateZoomFromInput(1 / 1.2, rect.left + (rect.width / 2), rect.top + (rect.height / 2));
};
document.getElementById('homeBtn').onclick = () => setView(0.56, -590, -520);
if (sectorDrawBtn) {
  sectorDrawBtn.onclick = () => {
    if (!isAdminRole()) return;
    if (activeSectorDraft) {
      cancelSectorDraft();
      return;
    }
    startSectorDraft();
  };
}
document.getElementById('viewModeBtn').onclick = () => {
  setViewModePreference(viewMode === 'image' ? 'schematic' : 'image');
  setStatus(viewMode === 'schematic' ? 'Schematische Operationskarte aktiviert.' : 'Bildkarte aktiviert.');
};
document.getElementById('layersBtn').onclick = () => {
  renderSettingsModal();
  openOverlayModal('settingsModal');
};
document.querySelectorAll('[data-layer]').forEach((cb) => {
  cb.onchange = () => {
    setLayerPreference(cb.dataset.layer, cb.checked);
  };
});
syncLayerCheckboxes();
roleSelect.onchange = () => {
  refreshRoleChrome();
  if (selected?.type === 'planet') openPlanet(selected.id);
  if (selected?.type === 'fleet') openFleet(selected.id);
  if (selected?.type === 'route') openRoute(selected.id);
  if (selected?.type === 'sector') openSector(selected.id);
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'buildProjects') renderBuildProjectsView();
  if (activeMainTab === 'economy') renderEconomyView();
  if (activeMainTab === 'loginManager') renderLoginManagerView();
  if (activeMainTab === 'radioCommandCenter') renderRadioCommandCenterView();
};

planetSearchInput.addEventListener('input', () => {
  updatePlanetSearchResults(planetSearchInput.value);
});

planetSearchInput.addEventListener('focus', () => {
  if (planetSearchInput.value.trim().length >= 2) updatePlanetSearchResults(planetSearchInput.value);
});

planetSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePlanetSearchResults();
    planetSearchInput.blur();
    return;
  }
  if (!searchResultsState.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeSearchResultIndex = (activeSearchResultIndex + 1) % searchResultsState.length;
    renderPlanetSearchResults();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeSearchResultIndex = (activeSearchResultIndex - 1 + searchResultsState.length) % searchResultsState.length;
    renderPlanetSearchResults();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const result = searchResultsState[Math.max(0, activeSearchResultIndex)];
    if (result) focusSearchResult(result);
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    planetSearchInput.focus();
    planetSearchInput.select();
  }
  if (activeOverlayModalId) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (activeOverlayModalId === 'tutorialModal' && tutorialFlowState.shouldPrompt) {
        finishTutorialFlow('skipped');
        return;
      }
      closeOverlayModal(activeOverlayModalId);
      return;
    }
    trapFocusInModal(event);
  }
  if (event.key === 'Escape') {
    closeContextMenu();
    if (activeSectorDraft) cancelSectorDraft();
  }
  if (event.key === 'Enter' && activeSectorDraft?.points?.length >= 3 && !event.target.closest('input, textarea, select')) {
    event.preventDefault();
    commitSectorDraft();
  }
});

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('#loginModal')) return;
  if (event.target.closest('.overlay-modal-card')) return;
  if (event.target.closest('.search-wrap')) return;
  closePlanetSearchResults(false);
  if (event.target.closest('.inline-search-wrap')) return;
  closeFleetJumpResults();
  closeFleetManagementSearchResults(false);
  if (!event.target.closest('#contextMenu')) closeContextMenu();
});
document.addEventListener('click', (event) => {
  const closeTrigger = event.target.closest('[data-close-modal]');
  if (!closeTrigger) return;
  const modalId = closeTrigger.getAttribute('data-close-modal');
  if (!modalId) return;
  if (modalId === 'tutorialModal' && tutorialFlowState.shouldPrompt) {
    finishTutorialFlow('skipped');
    return;
  }
  closeOverlayModal(modalId);
});
mainNavToggle.onclick = () => {
  setNavCollapsed(!navCollapsed);
};
document.getElementById('saveBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'galactic_campaign_state.json';
  a.click();
  URL.revokeObjectURL(url);
};
muteBtn.onclick = () => toggleAudioMute();
orientationLockBtn?.addEventListener('click', async () => {
  const locked = await requestLandscapeOrientation();
  if (!locked) {
    setStatus('Querformat bitte manuell aktivieren.');
  }
  mobileOrientationDismissed = false;
  syncMobileOrientationUi();
});
orientationDismissBtn?.addEventListener('click', () => {
  mobileOrientationDismissed = true;
  syncMobileOrientationUi();
});
