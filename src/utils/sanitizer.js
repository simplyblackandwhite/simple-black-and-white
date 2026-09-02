'use strict';

const validator = require('validator');
const { URL } = require('url');

/**
 * Validates, sanitizes, and checks basic reachability of a target URL.
 * Returns a clean URL string or throws with a user-friendly message.
 */

/**
 * Sanitize and validate a raw URL input.
 * @param {string} rawUrl - User-provided URL string
 * @returns {{ url: string }} - Cleaned, validated URL
 * @throws {Error} - With user-friendly message if invalid
 */
function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Please enter a website URL.');
  }

  // Trim whitespace
  let cleaned = rawUrl.trim();

  // If no protocol, prepend https://
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }

  // Validate URL format
  if (!validator.isURL(cleaned, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    require_tld: true,
    allow_underscores: false,
    disallow_auth: true,
  })) {
    throw new Error('That doesn\'t look like a valid URL. Try something like https://yourbusiness.com');
  }

  // Parse to normalize
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch (e) {
    throw new Error('That URL couldn\'t be parsed. Please double-check it.');
  }

  // Block localhost, private IPs, and internal networks
  const hostname = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /\.local$/,
    /^::1$/,
    /^\[::1\]$/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw new Error('We can only scan publicly accessible websites.');
    }
  }

  // Only allow http(s) protocols (double-check after parsing)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS websites can be scanned.');
  }

  return { url: parsed.href };
}

/**
 * Check if a URL is reachable via HTTP HEAD request.
 * @param {string} url - Validated URL
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<boolean>}
 */
async function checkReachability(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SimplyBlackAndWhite-Scanner/1.0',
      },
    });
    return response.ok || response.status < 500;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('That website took too long to respond. It may be down or blocking our request.');
    }
    throw new Error('We couldn\'t reach that website. Please check the URL and make sure the site is live.');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sanitizeUrl, checkReachability };
