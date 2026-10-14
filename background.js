/**
 * Liquid Media - Background Service Worker (Manifest V3)
 * Manages native Chrome downloads, download state tracking, and tab communication.
 */

importScripts('js/validators.js', 'js/formats.js', 'js/api.js');

const ACTIVE_DOWNLOADS_KEY = 'liquid_active_downloads';

/**
 * Loads current download map from storage.
 */
async function getTrackedDownloads() {
  const result = await chrome.storage.local.get([ACTIVE_DOWNLOADS_KEY]);
  return result[ACTIVE_DOWNLOADS_KEY] || {};
}

/**
 * Persists download map to storage.
 */
async function saveTrackedDownloads(map) {
  await chrome.storage.local.set({ [ACTIVE_DOWNLOADS_KEY]: map });
}

/**
 * Broadcasts download update to popup.
 */
function broadcastDownloadUpdate(id, item) {
  try {
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_STATUS_UPDATED',
      downloadId: id,
      item
    }).catch(() => {});
  } catch (_) {}
}

/**
 * Handles Chrome download state changes.
 */
chrome.downloads.onChanged.addListener(async (delta) => {
  const tracked = await getTrackedDownloads();
  const downloadId = delta.id;

  if (!tracked[downloadId]) return;

  const item = tracked[downloadId];

  if (delta.state) {
    item.state = delta.state.current;
    if (delta.state.current === 'complete') {
      item.progress = 100;
      item.completedAt = Date.now();
    } else if (delta.state.current === 'interrupted') {
      item.error = delta.error ? delta.error.current : 'Download interrupted';
    }
  }

  if (delta.totalBytes && delta.totalBytes.current > 0) {
    item.totalBytes = delta.totalBytes.current;
  }

  if (delta.bytesReceived && delta.bytesReceived.current > 0) {
    item.bytesReceived = delta.bytesReceived.current;
    if (item.totalBytes && item.totalBytes > 0) {
      item.progress = Math.min(99, Math.round((item.bytesReceived / item.totalBytes) * 100));
    }
  }

  tracked[downloadId] = item;
  await saveTrackedDownloads(tracked);
  broadcastDownloadUpdate(downloadId, item);
});

/**
 * Primary Message Dispatcher
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case 'START_DOWNLOAD': {
      handleStartDownload(message.payload)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep response channel open
    }

    case 'START_COMPANION_JOB': {
      handleStartCompanionJob(message.payload)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'GET_ACTIVE_DOWNLOADS': {
      getTrackedDownloads()
        .then(downloads => sendResponse({ success: true, downloads }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'CLEAR_COMPLETED_DOWNLOADS': {
      clearFinishedDownloads()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'QUERY_CURRENT_TAB': {
      resolveCurrentTabInfo()
        .then(info => sendResponse({ success: true, data: info }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    default:
      return false;
  }
});

/**
 * Handles starting and tracking a companion job in the service worker.
 */
async function handleStartCompanionJob(payload) {
  const { url, formatId, kind, title, baseUrl } = payload;
  const companionUrl = baseUrl || self.LiquidApi.getActiveCompanionUrl();

  const jobRes = await self.LiquidApi.startCompanionJob({
    url,
    formatId,
    kind,
    title
  }, companionUrl);

  if (!jobRes || !jobRes.success) {
    throw new Error(jobRes.error || 'Failed to start companion job');
  }

  const jobId = jobRes.jobId;
  const tracked = await getTrackedDownloads();
  tracked[formatId] = {
    id: formatId,
    formatId,
    kind,
    title: title || 'media',
    jobId,
    state: 'in_progress',
    progress: 5,
    startedAt: Date.now()
  };
  await saveTrackedDownloads(tracked);
  broadcastDownloadUpdate(formatId, tracked[formatId]);

  // Background polling loop
  const pollTimer = setInterval(async () => {
    try {
      const status = await self.LiquidApi.getCompanionJobStatus(jobId, companionUrl);
      const currentTracked = await getTrackedDownloads();
      if (!currentTracked[formatId]) {
        clearInterval(pollTimer);
        return;
      }

      if (status.status === 'processing' || status.status === 'queued') {
        currentTracked[formatId].progress = Math.max(currentTracked[formatId].progress, status.progress || 10);
        await saveTrackedDownloads(currentTracked);
        broadcastDownloadUpdate(formatId, currentTracked[formatId]);
      } else if (status.status === 'completed') {
        clearInterval(pollTimer);
        currentTracked[formatId].progress = 100;
        currentTracked[formatId].state = 'complete';
        await saveTrackedDownloads(currentTracked);
        broadcastDownloadUpdate(formatId, currentTracked[formatId]);

        // Trigger native Chrome download
        if (status.downloadUrl) {
          const downloadUrl = `${companionUrl}${status.downloadUrl}`;
          const ext = kind === 'audio' ? (formatId.includes('mp3') ? 'mp3' : 'm4a') : 'mp4';
          const safeFilename = self.LiquidValidators.sanitizeFilename(title || 'media', ext);
          await chrome.downloads.download({
            url: downloadUrl,
            filename: safeFilename,
            conflictAction: 'uniquify',
            saveAs: false
          });
        }
      } else if (status.status === 'failed' || status.status === 'error') {
        clearInterval(pollTimer);
        currentTracked[formatId].state = 'interrupted';
        currentTracked[formatId].error = status.error || 'Processing job failed';
        await saveTrackedDownloads(currentTracked);
        broadcastDownloadUpdate(formatId, currentTracked[formatId]);
      }
    } catch (_) {}
  }, 1000);

  return { success: true, jobId };
}

/**
 * Initiates native download via Chrome Downloads API.
 */
async function handleStartDownload(payload) {
  if (!payload || !payload.url) {
    throw new Error('Invalid download request: missing media URL');
  }

  const { url, title, ext, formatId, kind } = payload;

  // Strict URL verification
  if (!self.LiquidValidators.isValidUrl(url)) {
    throw new Error('Disallowed download URL scheme');
  }

  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS downloads are permitted');
  }

  // Sanitize filename
  const safeFilename = self.LiquidValidators.sanitizeFilename(title || 'media_download', ext || 'mp4');

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: safeFilename,
      conflictAction: 'uniquify',
      saveAs: false
    });

    const tracked = await getTrackedDownloads();
    tracked[downloadId] = {
      id: downloadId,
      formatId: formatId || 'unknown',
      kind: kind || 'video',
      title: title || safeFilename,
      filename: safeFilename,
      url,
      state: 'in_progress',
      progress: 0,
      startedAt: Date.now()
    };
    await saveTrackedDownloads(tracked);

    return { success: true, downloadId, filename: safeFilename };
  } catch (err) {
    throw new Error(`Chrome download failed: ${err.message}`);
  }
}

/**
 * Removes completed or failed downloads from tracking.
 */
async function clearFinishedDownloads() {
  const tracked = await getTrackedDownloads();
  const active = {};
  for (const [id, item] of Object.entries(tracked)) {
    if (item.state === 'in_progress') {
      active[id] = item;
    }
  }
  await saveTrackedDownloads(active);
}

/**
 * Resolves current active tab information and queries content script.
 */
async function resolveCurrentTabInfo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) {
    return { isSupported: false, message: 'No active browser tab found' };
  }

  const tab = tabs[0];
  const tabUrl = tab.url || '';

  // If chrome://, edge://, or extension page
  if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) {
    return {
      isSupported: false,
      tabId: tab.id,
      url: tabUrl,
      title: tab.title || 'System Page',
      reason: 'Browser internal pages cannot be downloaded'
    };
  }

  const isYT = self.LiquidValidators.isYouTubeUrl(tabUrl);
  const videoId = self.LiquidValidators.extractYouTubeVideoId(tabUrl);

  // Attempt to message content script
  let contentMetadata = null;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_METADATA' });
    if (res && res.success) {
      contentMetadata = res.data;
    }
  } catch (_) {
    // Content script not loaded or restricted page
  }

  return {
    isSupported: true,
    tabId: tab.id,
    url: tabUrl,
    title: (contentMetadata && contentMetadata.title) || tab.title || 'Web Media',
    channel: (contentMetadata && contentMetadata.channel) || '',
    thumbnail: (contentMetadata && contentMetadata.thumbnail) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
    isYouTube: isYT && Boolean(videoId),
    videoId: videoId || null,
    directMediaSrc: (contentMetadata && contentMetadata.directMediaSrc) || null
  };
}
