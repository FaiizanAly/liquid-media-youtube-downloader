/**
 * Liquid Media - Content Script
 * Detects media pages, extracts untrusted page metadata, and monitors SPA navigation.
 */

(function () {
  'use strict';

  const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

  /**
   * Extracts YouTube video ID from a URL.
   */
  function extractVideoId(urlStr) {
    try {
      const url = new URL(urlStr);
      if (url.hostname === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0];
        return YT_ID_REGEX.test(id) ? id : null;
      }
      if (url.hostname.includes('youtube.com')) {
        if (url.pathname === '/watch') {
          const id = url.searchParams.get('v');
          return id && YT_ID_REGEX.test(id) ? id : null;
        }
        const match = url.pathname.match(/^\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
        if (match && YT_ID_REGEX.test(match[1])) {
          return match[1];
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Gathers clean page metadata.
   */
  function collectMetadata() {
    const currentUrl = window.location.href;
    const videoId = extractVideoId(currentUrl);
    const isYouTube = Boolean(videoId);

    // Extract title
    let title = '';
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ytTitleElem = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string');

    if (ytTitleElem && ytTitleElem.textContent.trim()) {
      title = ytTitleElem.textContent.trim();
    } else if (ogTitle && ogTitle.content) {
      title = ogTitle.content.trim();
    } else if (document.title) {
      title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    }

    if (!title && isYouTube) {
      title = `YouTube Video (${videoId})`;
    } else if (!title) {
      title = document.title || 'Direct Media';
    }

    // Extract channel / author
    let channel = '';
    const channelElem = document.querySelector('#channel-name a, ytd-channel-name a, #owner-name a');
    const metaAuthor = document.querySelector('meta[itemprop="name"], link[itemprop="name"]');
    if (channelElem && channelElem.textContent.trim()) {
      channel = channelElem.textContent.trim();
    } else if (metaAuthor && metaAuthor.getAttribute('content')) {
      channel = metaAuthor.getAttribute('content').trim();
    }

    // Extract thumbnail
    let thumbnail = null;
    if (videoId) {
      thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    } else {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg && ogImg.content) {
        thumbnail = ogImg.content;
      }
    }

    // Check for direct HTML5 video element source
    let directMediaSrc = null;
    const videoElement = document.querySelector('video');
    if (videoElement) {
      const src = videoElement.currentSrc || videoElement.src;
      if (src && !src.startsWith('blob:') && !src.startsWith('mediasource:')) {
        directMediaSrc = src;
      }
    }

    return {
      url: currentUrl,
      title: title.slice(0, 200), // Enforce length boundary
      channel: channel.slice(0, 100),
      videoId,
      isYouTube,
      thumbnail,
      directMediaSrc,
      detectedAt: Date.now()
    };
  }

  /**
   * Broadcasts or caches metadata updates.
   */
  function syncMetadata() {
    const meta = collectMetadata();
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ active_page_meta: meta });
      }
    } catch (_) {}
    return meta;
  }

  // Initial sync
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    syncMetadata();
  } else {
    document.addEventListener('DOMContentLoaded', syncMetadata);
  }

  // Listen to YouTube SPA navigation lifecycle events
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(syncMetadata, 400); // Give DOM a brief moment to settle new titles
  });

  window.addEventListener('yt-page-data-updated', () => {
    syncMetadata();
  });

  // Handle browser history back/forward
  window.addEventListener('popstate', () => {
    setTimeout(syncMetadata, 300);
  });

  // Respond to runtime messages from popup or background service worker
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.action === 'GET_PAGE_METADATA') {
        const data = syncMetadata();
        sendResponse({ success: true, data });
      }
      return true; // Keep channel open for async response
    });
  }
})();
