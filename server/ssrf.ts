import dns from 'node:dns';
import net from 'node:net';
import { Agent, buildConnector } from 'undici';

/** Erlaubt Ziele in privaten Netzen, z. B. eine n8n-Instanz im LAN. */
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_WEBHOOKS === 'true';

export class UrlValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UrlValidationError';
    this.statusCode = statusCode;
  }
}

const blockList = new net.BlockList();

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  // Kein '::ffff:0:0/96' hier: net.BlockList prüft IPv4-Adressen auch gegen IPv4-gemappte
  // IPv6-Regeln – diese Regel würde jede IPv4-Adresse sperren. Gemappte Adressen
  // (::ffff:a.b.c.d) gleicht BlockList umgekehrt automatisch mit den IPv4-Regeln ab.
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

for (const [address, prefix] of BLOCKED_V4) blockList.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of BLOCKED_V6) blockList.addSubnet(address, prefix, 'ipv6');

export function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockList.check(ip, 'ipv4');
  if (family === 6) return blockList.check(ip, 'ipv6');
  return true;
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** Prüft Schema, Zugangsdaten und offensichtlich interne Hosts. DNS wird beim Verbindungsaufbau geprüft. */
export function parseWebhookUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new UrlValidationError('Es wurde keine Webhook-URL übermittelt.');
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlValidationError('Die Webhook-URL ist ungültig.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlValidationError('Nur http- und https-URLs sind als Webhook erlaubt.');
  }
  if (url.username || url.password) {
    throw new UrlValidationError('Zugangsdaten in der Webhook-URL werden nicht unterstützt.');
  }

  if (ALLOW_PRIVATE) return url;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UrlValidationError('Lokale Hosts sind als Webhook-Ziel gesperrt.', 403);
  }
  if (net.isIP(host) && isPrivateAddress(host)) {
    throw new UrlValidationError('Private oder lokale IP-Adressen sind als Webhook-Ziel gesperrt.', 403);
  }

  return url;
}

/**
 * DNS-Auflösung mit Prüfung jeder zurückgegebenen Adresse. Weil die Prüfung beim
 * eigentlichen Verbindungsaufbau passiert, greift sie auch bei DNS-Rebinding und Redirects.
 */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }

    const list = addresses as dns.LookupAddress[];
    if (list.length === 0) {
      callback(new UrlValidationError(`Der Host ${hostname} konnte nicht aufgelöst werden.`, 502), '', 0);
      return;
    }

    if (!ALLOW_PRIVATE) {
      const blocked = list.find((entry) => isPrivateAddress(entry.address));
      if (blocked) {
        callback(
          new UrlValidationError(
            `Der Host ${hostname} zeigt auf eine private Adresse (${blocked.address}) und ist gesperrt.`,
            403,
          ),
          '',
          0,
        );
        return;
      }
    }

    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

const baseConnector = buildConnector({ lookup: guardedLookup });

/**
 * Bei IP-Literalen (z. B. Redirect auf http://127.0.0.1/) findet keine DNS-Auflösung statt,
 * guardedLookup würde also nie aufgerufen. Deshalb hier zusätzlich vor jedem Verbindungsaufbau prüfen.
 */
const guardedConnector: buildConnector.connector = (options, callback) => {
  const host = options.hostname.replace(/^\[|\]$/g, '');
  if (!ALLOW_PRIVATE && net.isIP(host) && isPrivateAddress(host)) {
    callback(new UrlValidationError(`Private oder lokale IP-Adresse ${host} ist als Ziel gesperrt.`, 403), null);
    return;
  }
  baseConnector(options, callback);
};

export const guardedAgent = new Agent({
  connect: guardedConnector,
  headersTimeout: 125_000,
  bodyTimeout: 125_000,
});

/** Liefert eine UrlValidationError aus einer fetch-Fehlerkette, falls vorhanden. */
export function findValidationError(error: unknown): UrlValidationError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof UrlValidationError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
