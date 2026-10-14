/**
 * Liquid Media - Validation Utilities
 * Works across Browser (MV3) and Node.js environments.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.LiquidValidators = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
  const DIRECT_MEDIA_EXTS = ['.mp4', '.webm', '.m4a', '.mp3', '.ogg', '.wav', '.aac', '.flac', '.mkv', '.mov'];

  /**
   * Validates if a string is a valid HTTP or HTTPS URL.
   * @param {string} urlString
   * @returns {boolean}
   */
  function isValidUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  /**
   * Checks if a URL belongs to YouTube.
   * @param {string} urlString
   * @returns {boolean}
   */
  function isYouTubeUrl(urlString) {
    if (!isValidUrl(urlString)) return false;
    try {
      const parsed = new URL(urlString);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host === 'youtu.be'
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Extracts and validates an 11-character YouTube video ID.
   * Supports:
   *  - https://www.youtube.com/watch?v=VIDEO_ID
   *  - https://m.youtube.com/watch?v=VIDEO_ID
   *  - https://youtu.be/VIDEO_ID
   *  - https://www.youtube.com/shorts/VIDEO_ID
   *  - https://www.youtube.com/embed/VIDEO_ID
   * @param {string} urlString
   * @returns {string|null} 11-char video ID or null
   */
  function extractYouTubeVideoId(urlString) {
    if (!isValidUrl(urlString)) return null;
    try {
      const parsed = new URL(urlString);
      const host = parsed.hostname.toLowerCase();

      // youtu.be/ID
      if (host === 'youtu.be') {
        const id = parsed.pathname.slice(1).split('/')[0];
        return YT_ID_REGEX.test(id) ? id : null;
      }

      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        // /watch?v=ID
        if (parsed.pathname === '/watch') {
          const id = parsed.searchParams.get('v');
          return id && YT_ID_REGEX.test(id) ? id : null;
        }

        // /shorts/ID or /embed/ID or /v/ID
        const match = parsed.pathname.match(/^\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
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
   * Checks if URL points to a direct media asset.
   * @param {string} urlString
   * @returns {boolean}
   */
  function isDirectMediaUrl(urlString) {
    if (!isValidUrl(urlString)) return false;
    try {
      const parsed = new URL(urlString);
      const pathname = parsed.pathname.toLowerCase();
      return DIRECT_MEDIA_EXTS.some(ext => pathname.endsWith(ext));
    } catch (_) {
      return false;
    }
  }

  /**
   * Sanitizes a filename to prevent path traversal and remove OS-illegal characters.
   * @param {string} rawName
   * @param {string} defaultExt
   * @returns {string} Safe filename with extension
   */
  function sanitizeFilename(rawName, defaultExt = 'mp4') {
    const ext = defaultExt.replace(/^\./, '').toLowerCase().trim() || 'mp4';
    if (!rawName || typeof rawName !== 'string') {
      return `liquid_media_${Date.now()}.${ext}`;
    }

    // Strip out path traversal attempts
    let cleaned = rawName.replace(/\.\.+[/\\]/g, '');

    // Replace invalid filesystem characters: < > : " / \ | ? * and ASCII control characters (0-31)
    cleaned = cleaned.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    // Collapse multiple consecutive spaces/underscores
    cleaned = cleaned.replace(/[\s_]+/g, ' ').trim();

    // Prevent hidden files (starting with dot) or trailing dots/spaces
    cleaned = cleaned.replace(/^\.+/, '').replace(/[.\s]+$/, '');

    // Bound filename base length to 100 characters
    if (cleaned.length > 100) {
      cleaned = cleaned.slice(0, 100).trim();
    }

    if (!cleaned) {
      cleaned = `media_${Date.now()}`;
    }

    // Check if filename already ends with this extension
    const extRegex = new RegExp(`\\.${ext}$`, 'i');
    if (!extRegex.test(cleaned)) {
      cleaned = `${cleaned}.${ext}`;
    }

    return cleaned;
  }

  /**
   * Validates if a request origin is permitted (for companion security).
   * @param {string} origin
   * @returns {boolean}
   */
  function isAllowedOrigin(origin) {
    if (!origin || origin === 'null') return true; // Direct tools, curl, or extension non-HTTP origin
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'chrome-extension:') return true;
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  return {
    isValidUrl,
    isYouTubeUrl,
    extractYouTubeVideoId,
    isDirectMediaUrl,
    sanitizeFilename,
    isAllowedOrigin
  };
});
