/**
 * Liquid Media - Popup Controller
 * Manages tab switching, format rendering, companion interaction, and Chrome Downloads.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // State Management
  const state = {
    currentTab: 'video', // 'video' | 'audio'
    sourceInfo: null,
    videoFormats: [],
    audioFormats: [],
    activeDownloads: {}, // downloadId -> { formatId, state, progress, ... }
    companionStatus: { online: false, checking: true },
    isDownloading: {}    // formatId -> true/false
  };

  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const sourceContainer = document.getElementById('sourceContainer');
  const tabVideo = document.getElementById('tabVideo');
  const tabAudio = document.getElementById('tabAudio');
  const formatList = document.getElementById('formatList');
  const activeDownloadsContainer = document.getElementById('activeDownloadsContainer');
  const companionNoticeContainer = document.getElementById('companionNoticeContainer');
  const footerModeText = document.getElementById('footerModeText');
  const btnRefresh = document.getElementById('btnRefresh');

  /**
   * Initializes the popup lifecycle.
   */
  async function init() {
    setupEventListeners();
    await checkCompanionState();
    await restoreDownloadStates();
    await loadCurrentPageData();
    startCompanionHeartbeat();
  }

  /**
   * Sets up UI event listeners.
   */
  function setupEventListeners() {
    tabVideo.addEventListener('click', () => switchTab('video'));
    tabAudio.addEventListener('click', () => switchTab('audio'));

    // Keyboard navigation for tab list
    [tabVideo, tabAudio].forEach(btn => {
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const nextTab = state.currentTab === 'video' ? 'audio' : 'video';
          switchTab(nextTab);
          (nextTab === 'video' ? tabVideo : tabAudio).focus();
        }
      });
    });

    btnRefresh.addEventListener('click', async () => {
      btnRefresh.style.transform = 'rotate(180deg)';
      setTimeout(() => btnRefresh.style.transform = 'none', 300);
      await checkCompanionState();
      await loadCurrentPageData();
    });

    // Listen for background download status updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === 'DOWNLOAD_STATUS_UPDATED') {
        const { downloadId, item } = message;
        state.activeDownloads[downloadId] = item;
        updateActiveDownloadsUI();
        renderFormats();
      }
    });
  }

  /**
   * Switches active format view tab.
   */
  function switchTab(newTab) {
    if (state.currentTab === newTab) return;
    state.currentTab = newTab;

    if (newTab === 'video') {
      tabVideo.classList.add('active');
      tabVideo.setAttribute('aria-selected', 'true');
      tabAudio.classList.remove('active');
      tabAudio.setAttribute('aria-selected', 'false');
    } else {
      tabAudio.classList.add('active');
      tabAudio.setAttribute('aria-selected', 'true');
      tabVideo.classList.remove('active');
      tabVideo.setAttribute('aria-selected', 'false');
    }

    renderFormats();
  }

  /**
   * Checks status of local companion service.
   */
  async function checkCompanionState() {
    statusDot.className = 'status-dot dot-checking';
    statusLabel.textContent = 'Checking...';

    const health = await LiquidApi.checkCompanionHealth();
    state.companionStatus = health;
    updateStatusPill(health);
    return health;
  }

  /**
   * Updates header status indicator pill and footer.
   */
  function updateStatusPill(health) {
    if (health.online) {
      statusDot.className = 'status-dot dot-online';
      statusLabel.textContent = health.tools && health.tools.ffmpeg ? 'Companion (HQ Engine)' : 'Companion Active';
      footerModeText.textContent = health.tools && health.tools.ffmpeg ? 'High-Fidelity Merging Engine Active' : 'Companion Stream Engine Active';
    } else {
      statusDot.className = 'status-dot dot-offline';
      statusLabel.textContent = 'Direct Mode';
      footerModeText.textContent = 'Direct Engine Ready';
    }
  }

  /**
   * Automatic background heartbeat to detect when companion starts up.
   */
  function startCompanionHeartbeat() {
    setInterval(async () => {
      const wasOnline = state.companionStatus.online;
      const health = await LiquidApi.checkCompanionHealth();
      state.companionStatus = health;
      updateStatusPill(health);

      // If companion just came online, auto-refresh formats immediately
      if (!wasOnline && health.online && state.sourceInfo) {
        companionNoticeContainer.style.display = 'none';
        companionNoticeContainer.innerHTML = '';
        await discoverFormats(state.sourceInfo);
      }
    }, 2500);
  }

  /**
   * Loads information from active tab and discovers formats.
   */
  async function loadCurrentPageData() {
    sourceContainer.innerHTML = '';
    formatList.innerHTML = '';
    companionNoticeContainer.style.display = 'none';

    // Show loading skeleton
    formatList.appendChild(LiquidUI.renderSkeleton());

    try {
      const response = await chrome.runtime.sendMessage({ action: 'QUERY_CURRENT_TAB' });

      if (!response || !response.success || !response.data) {
        showUnsupportedView('Unable to query active browser tab');
        return;
      }

      const info = response.data;
      state.sourceInfo = info;

      if (!info.isSupported) {
        showUnsupportedView(info.reason || 'This page does not contain supported media');
        return;
      }

      // Render Source Card
      sourceContainer.appendChild(LiquidUI.renderSourceCard(info));

      // Resolve formats
      await discoverFormats(info);
    } catch (err) {
      showUnsupportedView('Error inspecting page: ' + err.message);
    }
  }

  /**
   * Discovers formats depending on page source and companion availability.
   */
  async function discoverFormats(info) {
    if (!info) return;
    formatList.innerHTML = '';
    state.videoFormats = [];
    state.audioFormats = [];

    // Case 1: Direct HTML5 Media on page or direct URL
    if (info.directMediaSrc || LiquidValidators.isDirectMediaUrl(info.url)) {
      const mediaUrl = info.directMediaSrc || info.url;
      const fmt = LiquidFormats.createDirectMediaFormat(mediaUrl);
      if (fmt.kind === 'video') {
        state.videoFormats.push(fmt);
      } else {
        state.audioFormats.push(fmt);
      }
    }

    // Case 2: YouTube Watch Page
    if (info.isYouTube) {
      if (state.companionStatus.online) {
        companionNoticeContainer.style.display = 'none';
        companionNoticeContainer.innerHTML = '';

        // Query companion service for parsed formats
        const res = await LiquidApi.fetchCompanionFormats(info.url);
        if (res.success) {
          state.videoFormats = LiquidFormats.sortVideoFormats(res.videoFormats || []);
          state.audioFormats = LiquidFormats.sortAudioFormats(res.audioFormats || []);
        } else {
          formatList.appendChild(LiquidUI.renderEmptyState(res.error || 'No formats resolved by companion.'));
          return;
        }
      } else {
        // Companion is offline: show clear explanation with auto-connect guidance
        companionNoticeContainer.style.display = 'block';
        companionNoticeContainer.innerHTML = '';
        companionNoticeContainer.appendChild(
          LiquidUI.renderCompanionNotice(async () => {
            statusDot.className = 'status-dot dot-checking';
            statusLabel.textContent = 'Connecting...';
            const health = await checkCompanionState();
            if (health.online) {
              companionNoticeContainer.style.display = 'none';
              companionNoticeContainer.innerHTML = '';
            }
            await discoverFormats(info);
          })
        );
      }
    }

    renderFormats();
  }

  /**
   * Renders the current tab's formats to DOM.
   */
  function renderFormats() {
    formatList.innerHTML = '';

    const list = state.currentTab === 'video' ? state.videoFormats : state.audioFormats;

    if (!list || list.length === 0) {
      if (state.sourceInfo && state.sourceInfo.isYouTube && !state.companionStatus.online) {
        formatList.appendChild(
          LiquidUI.renderEmptyState('Launch the local companion service to extract and remux YouTube streams.')
        );
      } else {
        formatList.appendChild(
          LiquidUI.renderEmptyState(`No ${state.currentTab} streams available.`)
        );
      }
      return;
    }

    list.forEach(format => {
      // Find active download state matching this format
      let activeState = null;
      for (const dl of Object.values(state.activeDownloads)) {
        if (dl.formatId === format.id) {
          activeState = dl;
          break;
        }
      }

      const row = LiquidUI.renderFormatRow(format, activeState, handleDownloadRequest);
      formatList.appendChild(row);
    });
  }

  /**
   * Handles user click on download button.
   */
  async function handleDownloadRequest(format) {
    if (state.isDownloading[format.id]) return; // Prevent duplicate clicks
    state.isDownloading[format.id] = true;

    // Temporary active state for button
    state.activeDownloads[format.id] = {
      formatId: format.id,
      state: 'in_progress',
      progress: 0
    };
    renderFormats();

    try {
      if (format.downloadCapability === 'direct' && format.downloadUrl) {
        // Standard Direct Download via Chrome Downloads API
        const title = state.sourceInfo ? state.sourceInfo.title : 'media';
        const res = await chrome.runtime.sendMessage({
          action: 'START_DOWNLOAD',
          payload: {
            url: format.downloadUrl,
            title,
            ext: format.container,
            formatId: format.id,
            kind: format.kind
          }
        });

        if (!res || !res.success) {
          throw new Error((res && res.error) || 'Failed to start download');
        }
      } else if (format.requiresCompanion) {
        // Companion pipeline
        if (!state.companionStatus.online) {
          alert('Local companion service is not running. Please start the companion service on http://127.0.0.1:48123 to process this stream.');
          delete state.activeDownloads[format.id];
          renderFormats();
          return;
        }

        // Delegate to background service worker for reliable downloading even if popup closes
        const jobRes = await chrome.runtime.sendMessage({
          action: 'START_COMPANION_JOB',
          payload: {
            url: state.sourceInfo.url,
            formatId: format.id,
            kind: format.kind,
            title: state.sourceInfo.title,
            baseUrl: LiquidApi.getActiveCompanionUrl()
          }
        });

        if (!jobRes || !jobRes.success) {
          throw new Error(jobRes.error || 'Failed to initialize processing job');
        }
      }
    } catch (err) {
      state.activeDownloads[format.id] = {
        formatId: format.id,
        state: 'interrupted',
        error: err.message
      };
      renderFormats();
    } finally {
      state.isDownloading[format.id] = false;
    }
  }

  /**
   * Polls companion job progress until completion.
   */
  async function pollJobProgress(jobId, format) {
    const pollInterval = setInterval(async () => {
      const status = await LiquidApi.getCompanionJobStatus(jobId);

      if (status.status === 'processing' || status.status === 'queued') {
        state.activeDownloads[format.id] = {
          formatId: format.id,
          state: 'in_progress',
          progress: status.progress || 0
        };
        renderFormats();
        updateActiveDownloadsUI();
      } else if (status.status === 'completed') {
        clearInterval(pollInterval);
        state.activeDownloads[format.id] = {
          formatId: format.id,
          state: 'complete',
          progress: 100
        };
        renderFormats();
        updateActiveDownloadsUI();

        // Trigger Chrome download of generated companion file
        if (status.downloadUrl) {
          const downloadUrl = `${LiquidApi.DEFAULT_COMPANION_URL}${status.downloadUrl}`;
          chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            payload: {
              url: downloadUrl,
              title: state.sourceInfo.title,
              ext: format.container,
              formatId: format.id,
              kind: format.kind
            }
          });
        }
      } else if (status.status === 'failed' || status.status === 'error') {
        clearInterval(pollInterval);
        state.activeDownloads[format.id] = {
          formatId: format.id,
          state: 'interrupted',
          error: status.error || 'Processing job failed'
        };
        renderFormats();
        updateActiveDownloadsUI();
      }
    }, 1000);
  }

  /**
   * Updates in-progress downloads panel.
   */
  function updateActiveDownloadsUI() {
    activeDownloadsContainer.innerHTML = '';
    const active = Object.values(state.activeDownloads).filter(d => d.state === 'in_progress');

    if (active.length === 0) {
      activeDownloadsContainer.style.display = 'none';
      return;
    }

    activeDownloadsContainer.style.display = 'flex';
    active.forEach(dl => {
      const card = LiquidUI.createElement('div', { className: 'active-download-card' });
      const header = LiquidUI.createElement('div', { className: 'active-dl-header' });
      const title = LiquidUI.createElement('span', {
        className: 'active-dl-title',
        textContent: dl.title || 'Downloading media...'
      });
      const pct = LiquidUI.createElement('span', {
        className: 'active-dl-pct',
        textContent: `${dl.progress || 0}%`
      });
      header.appendChild(title);
      header.appendChild(pct);

      const track = LiquidUI.createElement('div', { className: 'progress-track' });
      const fill = LiquidUI.createElement('div', { className: 'progress-fill' });
      fill.style.width = `${dl.progress || 0}%`;
      track.appendChild(fill);

      card.appendChild(header);
      card.appendChild(track);
      activeDownloadsContainer.appendChild(card);
    });
  }

  /**
   * Restores active download states from background storage.
   */
  async function restoreDownloadStates() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_DOWNLOADS' });
      if (res && res.success && res.downloads) {
        state.activeDownloads = res.downloads;
        updateActiveDownloadsUI();
      }
    } catch (_) {}
  }

  /**
   * Renders unsupported page state.
   */
  function showUnsupportedView(reason) {
    sourceContainer.innerHTML = '';
    formatList.innerHTML = '';
    const unsupportedCard = LiquidUI.renderUnsupportedState();
    if (reason) {
      const hint = unsupportedCard.querySelector('.unsupported-desc');
      if (hint) hint.textContent = reason;
    }
    sourceContainer.appendChild(unsupportedCard);
  }

  // Run initialization
  init();
});
