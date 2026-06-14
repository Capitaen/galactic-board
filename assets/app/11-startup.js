// Generated from app-shell.js: event wiring, globals, startup sequence

loginBtn?.addEventListener('click', attemptLogin);
guestContinueBtn?.addEventListener('click', continueAsGuest);
logoutBtn?.addEventListener('click', logoutCurrentUser);
loginModalPassword?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    attemptLogin();
  }
});
loginModalUser?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    attemptLogin();
  }
});
try {
  mapImageLoaded = Boolean(mapEl?.complete);
  if (!mapImageLoaded) {
    mapEl?.addEventListener('load', () => {
      mapImageLoaded = true;
      markBootTask('mapImageReady', true);
    }, { once: true });
    mapEl?.addEventListener('error', () => {
      console.warn('Galaxy map image failed to load; continuing.');
      mapImageLoaded = true;
      markBootTask('mapImageReady', true);
    }, { once: true });
  }
  applyDefaultAnonymousRole();
  loadClientUiPrefs();
  syncLayerCheckboxes();
  applyAudioMuteState();
  setNavCollapsed(false);
  safeRefreshRoleChrome();
  syncMobileOrientationUi();
  showLoginModal();
  setStatus('Bitte einloggen oder als Gast fortfahren.');
} catch (error) {
  console.error('Initial app startup failed', error);
  showLoginModal();
  setStatus('Initialisierung teilweise fehlgeschlagen. Bitte erneut anmelden.');
}
window.addEventListener('resize', syncMobileOrientationUi);
window.addEventListener('orientationchange', syncMobileOrientationUi);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncMobileOrientationUi();
    const changed = runCampaignMaintenance();
    if (changed) {
      render({ positions: true, frontline: true, influence: true, layers: true });
    if (selected?.type === 'planet') openPlanet(selected.id);
    if (selected?.type === 'marker') openMarker(selected.id);
    if (selected?.type === 'sector') openSector(selected.id);
    if (activeMainTab === 'shipyard') renderShipyardView();
      if (activeMainTab === 'fleetManagement') renderFleetManagementView();
    }
  }
});
window.setInterval(() => {
  const changed = runCampaignMaintenance();
  if (!changed) return;
  render({ positions: true, frontline: true, influence: true, layers: true });
  if (selected?.type === 'planet') openPlanet(selected.id);
  if (selected?.type === 'marker') openMarker(selected.id);
  if (selected?.type === 'sector') openSector(selected.id);
  if (activeMainTab === 'shipyard') renderShipyardView();
  if (activeMainTab === 'fleetManagement') renderFleetManagementView();
}, 60000);
window.setInterval(() => {
  if (document.hidden || activeMainTab !== 'economy') return;
  void fetchEconomyView({ renderLoading: false });
}, 15000);
window.savePlanet = savePlanet;
window.saveSector = saveSector;
window.deleteManualSector = deleteManualSector;
window.saveFleet = saveFleet;
window.deleteFleet = deleteFleet;
window.closeInfoPanel = closeInfoPanel;
window.saveRoute = saveRoute;
window.addRouteConnection = addRouteConnection;
window.removeRouteConnection = removeRouteConnection;
window.createNewRouteFromPanel = createNewRouteFromPanel;
window.resetRouteConnections = resetRouteConnections;
window.startFleetJump = startFleetJump;
window.createFleetManagementFleet = createFleetManagementFleet;
window.saveFleetManagementFleet = saveFleetManagementFleet;
window.saveManagedShip = saveManagedShip;
window.removeManagedShipFromFleet = removeManagedShipFromFleet;
window.showManagedShipOnMap = showManagedShipOnMap;
window.startBuildOrder = startBuildOrder;
window.startWarehouseBuildProject = startWarehouseBuildProject;
window.onShipyardClassChange = onShipyardClassChange;
window.setShipyardFaction = setShipyardFaction;
window.setFleetManagementFactionFilter = setFleetManagementFactionFilter;
window.createFleetManagementCategory = createFleetManagementCategory;
window.saveFleetManagementCategory = saveFleetManagementCategory;
window.deleteFleetManagementCategory = deleteFleetManagementCategory;
window.toggleFleetManagementCategory = toggleFleetManagementCategory;
window.startFleetManagementFleetDrag = startFleetManagementFleetDrag;
window.endFleetManagementFleetDrag = endFleetManagementFleetDrag;
window.startFleetCategoryDrag = startFleetCategoryDrag;
window.endFleetCategoryDrag = endFleetCategoryDrag;
window.allowFleetCategoryDrop = allowFleetCategoryDrop;
window.clearFleetCategoryDrop = clearFleetCategoryDrop;
window.handleFleetCategoryDrop = handleFleetCategoryDrop;
window.allowFleetCategoryReorder = allowFleetCategoryReorder;
window.clearFleetCategoryReorder = clearFleetCategoryReorder;
window.handleFleetCategoryReorderDrop = handleFleetCategoryReorderDrop;
window.triggerTrelloImport = triggerTrelloImport;
window.triggerFleetManagementSearch = triggerFleetManagementSearch;
window.focusPlanetOnMap = focusPlanetOnMap;
window.focusFleetOnMap = focusFleetOnMap;
window.focusShipOnMap = focusShipOnMap;
window.deleteFleetManagementFleet = deleteFleetManagementFleet;
window.openFleetManifestInManagement = openFleetManifestInManagement;
window.openFleetInManagement = openFleetInManagement;
window.clearFleetManifestFilter = clearFleetManifestFilter;
window.createLoginManagerUser = createLoginManagerUser;
window.saveLoginManagerUser = saveLoginManagerUser;
window.deleteLoginManagerUser = deleteLoginManagerUser;
window.fetchRadioCommandCenterData = fetchRadioCommandCenterData;
window.createRadioPermissionDraft = createRadioPermissionDraft;
window.setRadioPermissionFleetSearch = setRadioPermissionFleetSearch;
window.addRadioPermissionFleet = addRadioPermissionFleet;
window.removeRadioPermissionFleet = removeRadioPermissionFleet;
window.saveRadioPermission = saveRadioPermission;
window.deleteRadioPermission = deleteRadioPermission;
window.pollDiscordRadioCommands = pollDiscordRadioCommands;
window.setBuildProjectsViewTab = setBuildProjectsViewTab;
window.setMainTab = setMainTab;
window.fetchEconomyView = fetchEconomyView;
window.fetchMarketCompanyDetail = fetchMarketCompanyDetail;
window.buyMarketShare = buyMarketShare;
window.sellMarketShare = sellMarketShare;
window.setEconomySection = setEconomySection;
window.openMarketCompanyOverview = openMarketCompanyOverview;
window.refreshSelectedMarketCompany = refreshSelectedMarketCompany;
window.fetchSectorEconomyList = fetchSectorEconomyList;
window.fetchSectorEconomyDetail = fetchSectorEconomyDetail;
window.selectEconomySector = selectEconomySector;
window.setSectorPurchaseResourceType = setSectorPurchaseResourceType;
window.setSectorPurchaseQuantity = setSectorPurchaseQuantity;
window.buySectorResource = buySectorResource;
window.setEconomySectorEmbargo = setEconomySectorEmbargo;
window.openSectorHolding = openSectorHolding;
window.fetchAcpRanking = fetchAcpRanking;
window.setAcpRankingResource = setAcpRankingResource;
window.setAcpRankingSort = setAcpRankingSort;
window.openEconomySectorFromAcp = openEconomySectorFromAcp;
window.setMarketRange = setMarketRange;
window.updateMarketQuantity = updateMarketQuantity;
window.updateEconomySectorQuery = updateEconomySectorQuery;
window.saveEconomyPolicy = saveEconomyPolicy;

ensureImportantCampaignPlanets();
rebuildIndexes();
runCampaignMaintenance();
rebuildIndexes();
syncFleetTravelStateFromCampaign();
syncWorldSizeToMap();
renderBaseThenDeferHeavy();
if (mapEl.complete) {
  syncWorldSizeToMap();
  initMapAnalysis();
  scheduleDeferredFullRender(20);
} else {
  mapEl.addEventListener('load', () => {
    syncWorldSizeToMap();
    initMapAnalysis();
    scheduleDeferredFullRender(20);
  }, { once: true });
}
if ((state.meta?.positionCalibrationVersion ?? 0) < POSITION_CALIBRATION_VERSION) {
  applyPositionCalibration(false);
}
if ((state.meta?.arcgisImportVersion ?? 0) < ARCGIS_IMPORT_VERSION) {
  applyArcgisPlanetImport(false);
}
document.querySelectorAll('.main-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => setMainTab(btn.dataset.mainTab));
});
setMainTab('map');

