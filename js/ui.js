/**
 * Liquid Media - UI Renderer
 * Generates safe DOM elements adhering to macOS 27 Golden Gate Liquid Glass aesthetics.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.LiquidUI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Helper to safely create an element with attributes and children.
   */
  function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'textContent') {
        el.textContent = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value !== null && value !== undefined) {
        el.setAttribute(key, value);
      }
    }
    if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          el.appendChild(child);
        }
      }
    }
    return el;
  }

  /**
   * Renders the current media source card.
   * @param {Object} sourceInfo
   * @returns {HTMLElement}
   */
  function renderSourceCard(sourceInfo) {
    const card = createElement('div', { className: 'source-card glass-panel' });

    // Thumbnail section
    const thumbWrapper = createElement('div', { className: 'source-thumbnail' });
    if (sourceInfo.thumbnail) {
      const img = createElement('img', {
        src: sourceInfo.thumbnail,
        alt: 'Media Thumbnail',
        loading: 'lazy'
      });
      img.onerror = () => {
        img.style.display = 'none';
        thumbWrapper.classList.add('thumbnail-fallback');
      };
      thumbWrapper.appendChild(img);
    } else {
      thumbWrapper.classList.add('thumbnail-fallback');
      const fallbackIcon = createElement('div', {
        className: 'fallback-icon',
        textContent: sourceInfo.isYouTube ? '▶' : '🎬'
      });
      thumbWrapper.appendChild(fallbackIcon);
    }

    // Meta section
    const metaWrapper = createElement('div', { className: 'source-meta' });

    const titleEl = createElement('h2', {
      className: 'source-title',
      textContent: sourceInfo.title || 'Untitled Stream',
      title: sourceInfo.title || ''
    });

    const detailsRow = createElement('div', { className: 'source-details' });

    // Badge for platform
    const platformBadge = createElement('span', {
      className: `source-badge ${sourceInfo.isYouTube ? 'badge-yt' : 'badge-direct'}`,
      textContent: sourceInfo.isYouTube ? 'YouTube' : (sourceInfo.directMediaSrc ? 'Direct Media' : 'Web Stream')
    });
    detailsRow.appendChild(platformBadge);

    if (sourceInfo.channel) {
      const channelEl = createElement('span', {
        className: 'source-channel',
        textContent: sourceInfo.channel,
        title: sourceInfo.channel
      });
      detailsRow.appendChild(channelEl);
    } else if (sourceInfo.videoId) {
      const idEl = createElement('span', {
        className: 'source-id',
        textContent: `ID: ${sourceInfo.videoId}`
      });
      detailsRow.appendChild(idEl);
    }

    metaWrapper.appendChild(titleEl);
    metaWrapper.appendChild(detailsRow);

    card.appendChild(thumbWrapper);
    card.appendChild(metaWrapper);
    return card;
  }

  /**
   * Renders a format row item.
   * @param {Object} format
   * @param {Object} activeDownloadState
   * @param {Function} onDownloadClick
   * @returns {HTMLElement}
   */
  function renderFormatRow(format, activeDownloadState, onDownloadClick) {
    const row = createElement('div', {
      className: 'format-row glass-subpanel',
      'data-format-id': format.id
    });

    // Left info
    const infoCol = createElement('div', { className: 'format-info' });

    const primaryRow = createElement('div', { className: 'format-primary-row' });
    const labelSpan = createElement('span', {
      className: 'format-label',
      textContent: format.label
    });
    const containerSpan = createElement('span', {
      className: 'format-container-tag',
      textContent: format.container.toUpperCase()
    });
    primaryRow.appendChild(labelSpan);
    primaryRow.appendChild(containerSpan);

    const subRow = createElement('div', { className: 'format-sub-row' });

    // Codec badge
    const codec = format.kind === 'video' ? format.videoCodec : format.audioCodec;
    if (codec) {
      const codecSpan = createElement('span', {
        className: 'format-codec-tag',
        textContent: codec.toUpperCase()
      });
      subRow.appendChild(codecSpan);
    }

    // Size badge
    if (format.estimatedSize) {
      const sizeSpan = createElement('span', {
        className: 'format-size-tag',
        textContent: format.estimatedSize
      });
      subRow.appendChild(sizeSpan);
    }

    // Capability badge if companion is required
    if (format.requiresCompanion) {
      const companionReqSpan = createElement('span', {
        className: 'format-companion-req',
        textContent: 'Remux required',
        title: 'Requires local companion service to merge video & audio streams'
      });
      subRow.appendChild(companionReqSpan);
    }

    infoCol.appendChild(primaryRow);
    infoCol.appendChild(subRow);

    // Right Action Button
    const actionCol = createElement('div', { className: 'format-action' });
    const btn = createElement('button', {
      type: 'button',
      className: 'btn-download',
      'aria-label': `Download ${format.label} ${format.container.toUpperCase()}`
    });

    // Active state handling
    if (activeDownloadState && activeDownloadState.formatId === format.id) {
      if (activeDownloadState.state === 'in_progress') {
        btn.classList.add('state-downloading');
        btn.disabled = true;

        const spinner = createElement('span', { className: 'spinner-mini' });
        const pctText = createElement('span', {
          className: 'progress-label',
          textContent: activeDownloadState.progress ? `${activeDownloadState.progress}%` : 'Starting'
        });
        btn.appendChild(spinner);
        btn.appendChild(pctText);
      } else if (activeDownloadState.state === 'complete') {
        btn.classList.add('state-complete');
        btn.textContent = '✓ Done';
      } else if (activeDownloadState.state === 'interrupted' || activeDownloadState.error) {
        btn.classList.add('state-error');
        btn.textContent = 'Retry';
        btn.onclick = () => onDownloadClick(format);
      }
    } else {
      btn.textContent = 'Download';
      btn.onclick = () => onDownloadClick(format);
    }

    actionCol.appendChild(btn);

    row.appendChild(infoCol);
    row.appendChild(actionCol);
    return row;
  }

  /**
   * Renders the loading skeleton.
   */
  function renderSkeleton() {
    const container = createElement('div', { className: 'skeleton-container' });
    for (let i = 0; i < 3; i++) {
      const item = createElement('div', { className: 'skeleton-row glass-subpanel shimmer' });
      container.appendChild(item);
    }
    return container;
  }

  /**
   * Renders empty state message.
   */
  function renderEmptyState(message = 'No available media streams found.') {
    const box = createElement('div', { className: 'empty-state glass-subpanel' });
    const icon = createElement('div', { className: 'empty-icon', textContent: '🔍' });
    const title = createElement('p', { className: 'empty-title', textContent: message });
    box.appendChild(icon);
    box.appendChild(title);
    return box;
  }

  /**
   * Renders unsupported source state.
   */
  function renderUnsupportedState() {
    const box = createElement('div', { className: 'unsupported-state glass-panel' });
    const icon = createElement('div', { className: 'unsupported-icon', textContent: '💧' });
    const title = createElement('h3', { className: 'unsupported-title', textContent: 'Liquid Media Ready' });
    const desc = createElement('p', {
      className: 'unsupported-desc',
      textContent: 'Navigate to a YouTube video page or any website with direct HTML5 video to discover and download streams.'
    });
    box.appendChild(icon);
    box.appendChild(title);
    box.appendChild(desc);
    return box;
  }

  /**
   * Renders Companion Offline Notice Banner.
   */
  function renderCompanionNotice(onRetry) {
    const notice = createElement('div', { className: 'companion-notice glass-subpanel' });
    const textWrapper = createElement('div', { className: 'notice-text' });
    const heading = createElement('strong', { textContent: 'Companion Offline: ' });
    const desc = createElement('span', {
      textContent: 'Run "npm start" in the project folder or double-click "start-companion.bat" to enable YouTube downloads. Waiting for connection...'
    });
    textWrapper.appendChild(heading);
    textWrapper.appendChild(desc);

    const retryBtn = createElement('button', {
      type: 'button',
      className: 'btn-text-action',
      textContent: 'Connect',
      onClick: onRetry
    });

    notice.appendChild(textWrapper);
    notice.appendChild(retryBtn);
    return notice;
  }

  return {
    createElement,
    renderSourceCard,
    renderFormatRow,
    renderSkeleton,
    renderEmptyState,
    renderUnsupportedState,
    renderCompanionNotice
  };
});
