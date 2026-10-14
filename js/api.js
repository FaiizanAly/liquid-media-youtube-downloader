/**
 * Liquid Media - Companion API Client
 * Manages communication between Chrome extension and the local companion service.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.LiquidApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_COMPANION_PORT = 48123;
  const DEFAULT_COMPANION_URL = `http://127.0.0.1:${DEFAULT_COMPANION_PORT}`;
  const REQUEST_TIMEOUT_MS = 2500;

  /**
   * Helper for timeout-bounded fetch requests.
   */
  async function fetchWithTimeout(resource, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  let activeCompanionUrl = DEFAULT_COMPANION_URL;

  function getActiveCompanionUrl() {
    return activeCompanionUrl;
  }

  /**
   * Checks the health and availability of the local companion service.
   * Probes 127.0.0.1 first, then falls back to localhost if needed.
   * @param {string} [baseUrl]
   * @returns {Promise<{ online: boolean, version?: string, ffmpegAvailable?: boolean, error?: string, url?: string }>}
   */
  async function checkCompanionHealth(baseUrl = null) {
    const urlsToTry = baseUrl ? [baseUrl] : [
      DEFAULT_COMPANION_URL,
      `http://localhost:${DEFAULT_COMPANION_PORT}`
    ];

    let lastError = 'Service offline';

    for (const url of urlsToTry) {
      try {
        const res = await fetchWithTimeout(`${url}/api/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }, 1500);

        if (res.ok) {
          const data = await res.json();
          activeCompanionUrl = url;
          return {
            online: data.status === 'ok',
            version: data.version || '1.0.0',
            ffmpegAvailable: Boolean(data.ffmpegAvailable),
            ytdlpAvailable: Boolean(data.ytdlpAvailable),
            tools: data.tools || {},
            url
          };
        }
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError = err.name === 'AbortError' ? 'Connection timed out' : 'Service offline';
      }
    }

    return {
      online: false,
      error: lastError
    };
  }

  /**
   * Queries format options from the companion for a permitted source.
   * @param {string} targetUrl
   * @param {string} [baseUrl]
   * @returns {Promise<{ success: boolean, videoFormats?: Array, audioFormats?: Array, metadata?: Object, error?: string }>}
   */
  async function fetchCompanionFormats(targetUrl, baseUrl = null) {
    const url = baseUrl || getActiveCompanionUrl();
    try {
      const res = await fetchWithTimeout(`${url}/api/formats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ url: targetUrl })
      }, 6000);

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `HTTP ${res.status}: Failed to resolve media formats`
        };
      }

      return {
        success: true,
        videoFormats: data.videoFormats || [],
        audioFormats: data.audioFormats || [],
        metadata: data.metadata || {}
      };
    } catch (err) {
      return {
        success: false,
        error: err.name === 'AbortError' ? 'Request timed out' : 'Could not reach companion service'
      };
    }
  }

  /**
   * Submits a media processing job (download/remux/transcode) to the companion.
   * @param {Object} payload { url, formatId, kind, title }
   * @param {string} [baseUrl]
   * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
   */
  async function startCompanionJob(payload, baseUrl = null) {
    const url = baseUrl || getActiveCompanionUrl();
    try {
      const res = await fetchWithTimeout(`${url}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      }, 4000);

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to initialize job' };
      }

      return {
        success: true,
        jobId: data.jobId,
        status: data.status
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Companion connection failed'
      };
    }
  }

  /**
   * Fetches the current status and progress of an active companion job.
   * @param {string} jobId
   * @param {string} [baseUrl]
   * @returns {Promise<{ status: string, progress: number, downloadUrl?: string, error?: string }>}
   */
  async function getCompanionJobStatus(jobId, baseUrl = null) {
    const url = baseUrl || getActiveCompanionUrl();
    try {
      const res = await fetchWithTimeout(`${url}/api/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }, 3000);

      const data = await res.json();
      return data;
    } catch (err) {
      return { status: 'error', progress: 0, error: err.message };
    }
  }

  return {
    DEFAULT_COMPANION_URL,
    getActiveCompanionUrl,
    checkCompanionHealth,
    fetchCompanionFormats,
    startCompanionJob,
    getCompanionJobStatus
  };
});
