export interface ParsedProxyFields {
  type: 'http' | 'socks4' | 'socks5' | 'ssh';
  host: string;
  port: string;
  username: string;
  password: string;
  name?: string;
}

function normalizeProtocol(rawProto: string, fallback: 'http' | 'socks4' | 'socks5' | 'ssh' = 'http') {
  const p = String(rawProto || '').toLowerCase().trim();
  if (p === 'sock5' || p === 'socks5' || p === 'socks5h' || p === 'socks') return 'socks5';
  if (p === 'sock4' || p === 'socks4' || p === 'socks4a') return 'socks4';
  if (p === 'http' || p === 'https') return 'http';
  if (p === 'ssh') return 'ssh';
  return fallback;
}

/**
 * Smartly parse any proxy string into individual form fields:
 * Supports:
 * - sock5://user:password:192.168.2.1:1081
 * - socks5://user:password@192.168.2.1:1081
 * - 192.168.2.1:1081:user:password
 * - user:password:192.168.2.1:1081
 * - 192.168.2.1:1081@user:password
 * - 192.168.2.1:1081
 */
export function parseProxyQuickInput(
  input: string,
  currentType: 'http' | 'socks4' | 'socks5' | 'ssh' = 'http'
): ParsedProxyFields | null {
  let raw = String(input || '').trim();
  if (!raw) return null;

  let name = '';
  if (raw.includes('#')) {
    const idx = raw.indexOf('#');
    name = raw.slice(idx + 1).trim();
    raw = raw.slice(0, idx).trim();
  }

  let type = normalizeProtocol(currentType, 'http');
  // Match any scheme:// prefix (including typo sock5://, socks://, http://, etc.)
  const schemeMatch = raw.match(/^([a-zA-Z0-9+-]+):\/\//);
  if (schemeMatch) {
    type = normalizeProtocol(schemeMatch[1], type);
    raw = raw.slice(schemeMatch[0].length).trim();
  }

  const isLikelyHost = (str: string) => {
    if (!str) return false;
    return str.includes('.') || str === 'localhost' || /^\[?[0-9a-fA-F:]+\]?$/.test(str);
  };

  const isPort = (str: string) => {
    if (!/^\d{1,5}$/.test(str || '')) return false;
    const n = Number(str);
    return n >= 1 && n <= 65535;
  };

  const isHostPort = (str: string) => {
    const parts = str.split(':');
    if (parts.length !== 2) return false;
    return isLikelyHost(parts[0]) && isPort(parts[1]);
  };

  let host = '';
  let port = '';
  let username = '';
  let password = '';

  if (raw.includes('@')) {
    const [left, right] = raw.split('@');
    if (isHostPort(right)) {
      const [h, pt] = right.split(':');
      host = h;
      port = pt;
      const [u, ...pRest] = left.split(':');
      username = u || '';
      password = pRest.join(':') || '';
    } else if (isHostPort(left)) {
      const [h, pt] = left.split(':');
      host = h;
      port = pt;
      const [u, ...pRest] = right.split(':');
      username = u || '';
      password = pRest.join(':') || '';
    } else {
      const [u, ...pRest] = left.split(':');
      username = u || '';
      password = pRest.join(':') || '';
      const [h, pt] = right.split(':');
      host = h || '';
      port = pt || '';
    }
  } else {
    const parts = raw.split(':');
    if (parts.length === 2) {
      host = parts[0];
      port = parts[1];
    } else if (parts.length === 3) {
      if (isLikelyHost(parts[0]) && isPort(parts[1])) {
        host = parts[0];
        port = parts[1];
        username = parts[2];
      } else if (isLikelyHost(parts[1]) && isPort(parts[2])) {
        username = parts[0];
        host = parts[1];
        port = parts[2];
      }
    } else if (parts.length >= 4) {
      const firstIsHostPort = isLikelyHost(parts[0]) && isPort(parts[1]);
      const lastTwoIsHostPort =
        isLikelyHost(parts[parts.length - 2]) && isPort(parts[parts.length - 1]);

      if (lastTwoIsHostPort && !firstIsHostPort) {
        // user:password:host:port
        host = parts[parts.length - 2];
        port = parts[parts.length - 1];
        username = parts[0];
        password = parts.slice(1, parts.length - 2).join(':');
      } else {
        // host:port:user:password
        host = parts[0];
        port = parts[1];
        username = parts[2];
        password = parts.slice(3).join(':');
      }
    }
  }

  return {
    type,
    host,
    port,
    username,
    password,
    ...(name ? { name } : {}),
  };
}
