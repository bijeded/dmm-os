// Converts the low-fi wireframe .dc.html screens into DMM Studios screen-mode hi-fi.
import fs from 'node:fs';
import path from 'node:path';

const SRC = '/Users/franciscovenegas/Desktop/DMM OS/App/wireframe';
const OUT = '/Users/franciscovenegas/Desktop/DMM OS/App/hifi';
fs.mkdirSync(OUT, { recursive: true });

// ---- tokens (DESIGN.md) ----
const S = '#0A0A0B', R = '#131315', K = '#08080A', H = '#1B1B1E';
const B = 'rgba(255,255,255,.08)', BS = 'rgba(255,255,255,.16)';
const M = '#ADADAD', A = '#EBA51C', AT = '#F4C765', ONA = '#161616';
const D = "'Antonio', 'Oswald', system-ui, sans-serif";
const BD = "'Asap', 'Open Sans', system-ui, sans-serif";
const MO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";
const SH_RAISED = 'inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px -16px rgba(0,0,0,.85)';
const SH_SUNKEN = 'inset 0 1px 2px rgba(0,0,0,.45)';
const q = (s) => s.replace(/'/g, '&#39;'); // not used inside style attrs (double-quoted), fonts use single quotes fine

// ---- Lucide icons (lucide-static 0.544.0 geometry) ----
const L = {
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'folder-kanban': '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
  'flask-conical': '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevrons-up-down': '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  'trash-2': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
};
const icon = (name, size = 16, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${L[name]}</svg>`;

const NAV_ICON = {
  'Panel de Control': 'layout-dashboard', Contactos: 'users', Cotizaciones: 'file-text',
  Proyectos: 'folder-kanban', Lab: 'flask-conical', AI: 'sparkles', Finanzas: 'wallet', 'Configuración': 'settings',
};

// Wireframe 16px glyphs -> Lucide
const GLYPH = [
  [/<path d="m4 6 4 4 4-4"(?:\/>|><\/path>)/g, 'chevron-down'],
  [/<path d="M3\.5 1\.5h6l3 3v10h-9z"(?:\/>|><\/path>)<path d="M9\.5 1\.5v3h3"(?:\/>|><\/path>)/g, 'file'],
  [/<path d="M13\.5 8a5\.5 5\.5 0 1 1-1\.6-3\.9"(?:\/>|><\/path>)<path d="M13\.5 2\.5v3h-3"(?:\/>|><\/path>)/g, 'refresh-cw'],
  [/<path d="M1\.5 4h5l1\.5 1\.5h6\.5v8h-13z"(?:\/>|><\/path>)/g, 'folder'],
  [/<path d="M3 3l10 10M13 3 3 13"(?:\/>|><\/path>)/g, 'x'],
  [/<path d="M9 2h5v5M14 2 7 9M12 10v4H2V4h4"(?:\/>|><\/path>)/g, 'external-link'],
  [/<circle cx="7" cy="7" r="4\.5"(?:\/>|><\/circle>)<path d="M10\.5 10\.5 14 14"(?:\/>|><\/path>)/g, 'search'],
  [/<rect x="2" y="2" width="12" height="12"(?:\/>|><\/rect>)/g, 'square'],
  [/<path d="M8 1\.5 15 14H1z"(?:\/>|><\/path>)<path d="M8 6v4M8 12v\.5"(?:\/>|><\/path>)/g, 'triangle-alert'],
];

// ---- style dictionary: exact wireframe style -> hi-fi style ----
const navBase = `display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 16px; border-radius: 10px; font-family: ${BD}; font-size: 14px; white-space: nowrap;`;
const NAV_OFF = `${navBase} background: transparent; color: ${M};`;
const NAV_ON = `${navBase} background: ${R}; color: #FFFFFF; box-shadow: ${SH_RAISED};`;
const card = `display: flex; flex-direction: column; gap: 16px; background: ${R}; border: 1px solid ${B}; border-radius: 14px; padding: 24px; box-shadow: ${SH_RAISED}; min-width: 0;`;
const btn = `display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 16px; border-radius: 10px; font-family: ${MO}; font-size: 12px; font-weight: 600; line-height: 1.3; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;`;
const chip = `display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; font-family: ${MO}; font-size: 12px; letter-spacing: .02em; white-space: nowrap;`;
const seg = `padding: 6px 12px; border-radius: 7px; font-family: ${MO}; font-size: 12px; white-space: nowrap;`;
const tab = `padding: 0 0 12px; margin-bottom: -1px; font-family: ${MO}; font-size: 12px; font-weight: 600; line-height: 1.3; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap;`;
const well = `background: ${K}; border: 1px solid ${B}; border-radius: 10px; box-shadow: ${SH_SUNKEN};`;
const tableHead = `font-family: ${MO}; font-size: 12px; font-weight: 600; line-height: 1.3; letter-spacing: .12em; text-transform: uppercase; color: ${M};`;
const kvRow = `display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid ${B}; font-size: 14px;`;
const legend = (c) => `width: 12px; height: 12px; border-radius: 999px; background: ${c};`;

const MAP = {
  'padding: 9px 10px; border-bottom: 1px solid #efefec; vertical-align: middle;':
    `padding: 12px 16px; border-bottom: 1px solid ${B}; vertical-align: middle;`,
  'text-align: left; padding: 8px 10px; border-bottom: 1.5px solid #222; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b6b6b; font-weight: 600; white-space: nowrap;':
    `text-align: left; padding: 10px 16px; border-bottom: 1px solid ${BS}; ${tableHead} white-space: nowrap;`,
  'display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; font-weight: 400; background: transparent; color: #222;': NAV_OFF,
  'display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; font-weight: 700; background: #222; color: #fff;': NAV_ON,
  'display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; border-top: 1px solid #bdbdbd; font-weight: 400; background: transparent; color: #222;': NAV_OFF,
  'display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; border-top: 1px solid #bdbdbd; font-weight: 700; background: #222; color: #fff;': NAV_ON,
  'color: #6b6b6b;': `color: ${M};`,
  'display: flex; flex-direction: column; gap: 14px; border: 1.5px solid #222; background: #fff; padding: 18px; ': card,
  'display: flex; flex-direction: column; gap: 14px; border: 1.5px solid #222; background: #fff; padding: 18px': card,
  'display: inline-block; padding: 2px 8px; border: 1px solid #bdbdbd; font-size: 11px; color: #222; background: #efefec; white-space: nowrap;': 'BADGE',
  "margin: 0; font-family: 'Kalam', cursive; font-size: 20px; font-weight: 700;":
    `margin: 0; font-family: ${D}; font-size: 25px; font-weight: 700; line-height: 1.22; text-transform: uppercase; color: #FFFFFF;`,
  'display: flex; align-items: center; justify-content: space-between; gap: 12px;': 'display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;',
  'font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b6b6b;':
    `font-family: ${MO}; font-size: 12px; line-height: 1.3; letter-spacing: .18em; text-transform: uppercase; color: ${AT};`,
  'display: flex; flex-direction: column; gap: 6px; border: 1.5px solid #222; background: #fff; padding: 14px 16px; min-width: 0;':
    `display: flex; flex-direction: column; gap: 8px; background: ${R}; border: 1px solid ${B}; border-radius: 10px; padding: 20px 24px; box-shadow: ${SH_RAISED}; min-width: 0;`,
  "font-family: 'Kalam', cursive; font-size: 28px; font-weight: 700; line-height: 1.1; color: #222;":
    `font-family: ${MO}; font-size: 31px; font-weight: 600; line-height: 1.2; font-feature-settings: 'tnum' 1; color: #FFFFFF; white-space: nowrap;`,
  "font-family: 'Kalam', cursive; font-size: 28px; font-weight: 700; line-height: 1.1; color: #c2410c;":
    `font-family: ${MO}; font-size: 31px; font-weight: 600; line-height: 1.2; font-feature-settings: 'tnum' 1; color: ${AT}; white-space: nowrap;`,
  'display: inline-flex; align-items: center; gap: 5px; font-size: 12px;':
    `display: inline-flex; align-items: center; gap: 6px; font-family: ${MO}; font-size: 12px; letter-spacing: .02em; color: ${AT}; text-decoration: none;`,
  'display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px dashed #bdbdbd; font-size: 13px;': kvRow,
  'font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b6b6b;': tableHead,
  'min-height: 32px; display: flex; align-items: center; padding: 0 10px; border: 1px solid #bdbdbd; background: #fff; font-size: 13px;':
    `min-height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 16px; ${well} font-size: 14px; color: #FFFFFF;`,
  'display: flex; gap: 10px; font-size: 12px; color: #6b6b6b;': `display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: ${M};`,
  'font-size: 12px; color: #6b6b6b; font-style: italic;': `font-size: 12px; line-height: 1.5; color: ${M};`,
  'width: 100%; border-collapse: collapse; font-size: 13px;': 'width: 100%; border-collapse: collapse; font-size: 14px;',
  'font-size: 12px; color: #6b6b6b;': `font-size: 12px; color: ${M};`,
  'display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 30px; padding: 0 10px; border: 1px solid #bdbdbd; background: #fff; font-size: 12px; color: #6b6b6b; min-width: 110px;':
    `display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 36px; padding: 0 12px; ${well} font-family: ${MO}; font-size: 12px; color: #FFFFFF; min-width: 128px; white-space: nowrap;`,
  'display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1.5px solid #222; background: #fff; color: #222; font-size: 13px; font-weight: 600; white-space: nowrap;':
    `${btn} border: 1px solid ${BS}; background: transparent; color: #FFFFFF;`,
  'display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1.5px solid #222; background: #222; color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap;':
    `${btn} border: 1px solid transparent; background: ${A}; color: ${ONA};`,
  "margin: 0; font-family: 'Kalam', cursive; font-size: 34px; font-weight: 700; line-height: 1.1;":
    `margin: 0; font-family: ${D}; font-size: 39px; font-weight: 700; line-height: 1.22; letter-spacing: -.01em; text-transform: uppercase; color: #FFFFFF;`,
  "font-family: 'Kalam', cursive; font-size: 34px; font-weight: 700;":
    `font-family: ${MO}; font-size: 31px; font-weight: 600; line-height: 1.2; font-feature-settings: 'tnum' 1; color: ${AT};`,
  'display: flex; min-height: 100vh; width: 100%; background: #fafaf7;':
    `display: flex; min-height: 100vh; width: 100%; background: ${S}; color: #FFFFFF; font-family: ${BD}; font-size: 14px; line-height: 1.5;`,
  'display: flex; flex-direction: column; gap: 4px; width: 232px; flex-shrink: 0; border-right: 1.5px solid #222; padding: 16px 12px; background: #fff;':
    `display: flex; flex-direction: column; gap: 4px; width: 248px; flex-shrink: 0; background: ${K}; border-right: 1px solid ${B}; padding: 24px 16px;`,
  'display: flex; flex-direction: column; gap: 2px;': 'display: flex; flex-direction: column; gap: 4px;',
  'display: flex; flex-direction: column; gap: 22px; padding: 28px;': 'display: flex; flex-direction: column; gap: 24px; padding: 32px 48px 48px;',
  'display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 60px; padding: 0 28px; border-bottom: 1.5px solid #222; background: #fff;':
    `display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 64px; padding: 0 48px; border-bottom: 1px solid ${B}; background: rgba(8,8,10,.82); backdrop-filter: blur(14px); position: sticky; top: 0; z-index: 5;`,
  'display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1.5px solid #222; color: #222;':
    `display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid ${BS}; border-radius: 10px; color: #FFFFFF;`,
  'display: flex; align-items: center; gap: 8px; font-size: 13px; color: #6b6b6b;':
    `display: flex; align-items: center; gap: 8px; min-width: 0; font-family: ${MO}; font-size: 12px; letter-spacing: .02em; color: ${M}; white-space: nowrap;`,
  'display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b6b6b;':
    `display: flex; align-items: center; gap: 12px; font-family: ${MO}; font-size: 12px; color: ${M}; white-space: nowrap;`,
  'color: #222; font-weight: 600;': 'color: #FFFFFF; font-weight: 600;',
  'color: #6b6b6b; font-weight: 400;': `color: ${M}; font-weight: 400;`,
  'display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid #bdbdbd; background: #fff; font-size: 12px; color: #6b6b6b; white-space: nowrap;':
    `${chip} border: 1px solid ${BS}; background: transparent; color: ${M};`,
  'display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid #222; background: #efefec; font-size: 12px; color: #222; white-space: nowrap;':
    `${chip} border: 1px solid ${A}; background: ${A}; color: ${ONA};`,
  'display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border: 1px solid #bdbdbd; background: #fff; font-size: 12px; color: #6b6b6b; width: 220px;':
    `display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; ${well} font-size: 14px; color: ${M}; width: 240px; max-width: 100%;`,
  'padding: 6px 12px; font-size: 12px; font-weight: 400; background: #fff; color: #222; border-left: 1px solid #bdbdbd; white-space: nowrap;': `${seg} background: transparent; color: ${M};`,
  'padding: 6px 12px; font-size: 12px; font-weight: 400; background: #fff; color: #222; border-left: none; white-space: nowrap;': `${seg} background: transparent; color: ${M};`,
  'padding: 6px 12px; font-size: 12px; font-weight: 700; background: #222; color: #fff; border-left: none; white-space: nowrap;': `${seg} background: ${H}; color: #FFFFFF; box-shadow: inset 0 1px 0 rgba(255,255,255,.06);`,
  'padding: 6px 12px; font-size: 12px; font-weight: 700; background: #222; color: #fff; border-left: 1px solid #bdbdbd; white-space: nowrap;': `${seg} background: ${H}; color: #FFFFFF; box-shadow: inset 0 1px 0 rgba(255,255,255,.06);`,
  'display: flex; border: 1.5px solid #222;': `display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: ${K}; border: 1px solid ${B}; border-radius: 10px; align-self: flex-start;`,
  'font-weight: 700;': 'font-weight: 600;',
  'display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed #bdbdbd; font-size: 13px;':
    `display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid ${B}; font-size: 14px;`,
  'display: flex; align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px dashed #bdbdbd; font-size: 13px;':
    `display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid ${B}; font-size: 14px;`,
  'display: flex; gap: 0; border-bottom: 1.5px solid #222;': `display: flex; flex-wrap: wrap; gap: 24px; border-bottom: 1px solid ${B};`,
  'padding: 8px 16px; font-size: 13px; font-weight: 700; color: #222; border: 1.5px solid #222; border-bottom: none; background: #fff; margin-bottom: -1.5px;': `${tab} color: #FFFFFF; border-bottom: 2px solid ${A};`,
  'padding: 8px 16px; font-size: 13px; font-weight: 400; color: #6b6b6b; border: 1.5px solid transparent; border-bottom: none; background: transparent; margin-bottom: -1.5px;': `${tab} color: ${M}; border-bottom: 2px solid transparent;`,
  'width: 52px; color: #6b6b6b;': `width: 52px; flex-shrink: 0; font-family: ${MO}; font-size: 12px; color: ${M};`,
  'height: 8px; background: #efefec;': `height: 6px; background: ${K}; border-radius: 999px; overflow: hidden; box-shadow: ${SH_SUNKEN};`,
  'font-size: 13px; color: #6b6b6b;': `font-size: 14px; color: ${M};`,
  'display: flex; justify-content: space-between; font-size: 13px;': 'display: flex; justify-content: space-between; gap: 12px; font-size: 14px;',
  'font-size: 11px; color: #6b6b6b; text-transform: uppercase;': tableHead,
  'display: flex; flex-direction: column; gap: 6px; border: 1px solid #bdbdbd; padding: 12px;': `display: flex; flex-direction: column; gap: 6px; ${well} padding: 16px;`,
  'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; font-size: 13px; background: transparent; font-weight: 400; border: 1px solid transparent;':
    `display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 44px; padding: 0 12px; border-radius: 10px; font-size: 14px; background: transparent; color: ${M}; border: 1px solid transparent;`,
  'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; font-size: 13px; background: #efefec; font-weight: 700; border: 1px solid #222;':
    `display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 44px; padding: 0 12px; border-radius: 10px; font-size: 14px; background: ${R}; color: #FFFFFF; border: 1px solid ${B}; box-shadow: ${SH_RAISED};`,
  'width: 14px; height: 14px; border: 1.5px solid #222; background: #222;': `width: 18px; height: 18px; flex-shrink: 0; border-radius: 4px; background: ${A};`,
  'width: 12px; height: 12px; background: #222; border: 1px solid #bdbdbd;': legend('#EBA51C'),
  'width: 12px; height: 12px; background: #555; border: 1px solid #bdbdbd;': legend('#1C62EB'),
  'width: 12px; height: 12px; background: #888; border: 1px solid #bdbdbd;': legend('#A51CEB'),
  'width: 12px; height: 12px; background: #aaa; border: 1px solid #bdbdbd;': legend('#1CEBA5'),
  'width: 12px; height: 12px; background: #ccc; border: 1px solid #bdbdbd;': legend('#8A6410'),
  'width: 12px; height: 12px; background: #e4e4e4; border: 1px solid #bdbdbd;': legend('#5C5C5C'),
  'width: 22px; border-top: 2.5px solid #222;': `width: 22px; border-top: 2.5px solid ${A};`,
  'width: 22px; border-top: 2.5px solid #999;': 'width: 22px; border-top: 2.5px solid #1C62EB;',
  'width: 22px; border-top: 2.5px dashed #222;': `width: 22px; border-top: 2px dashed ${A};`,
  'width: 22px; border-top: 2.5px dashed #999;': 'width: 22px; border-top: 2px dashed #1C62EB;',
  'position: absolute; left: 150px; top: 6px; border: 1.5px solid #222; background: #fff; padding: 8px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 2px;':
    `position: absolute; left: 150px; top: 6px; background: ${R}; border: 1px solid ${BS}; border-radius: 6px; box-shadow: 0 24px 64px -16px rgba(0,0,0,.9), 0 2px 8px rgba(0,0,0,.6); padding: 10px 12px; font-family: ${MO}; font-size: 12px; display: flex; flex-direction: column; gap: 2px;`,
  'height: 70px; border: 1px solid #bdbdbd; background: #fff;': `height: 96px; ${well}`,
  'flex: 1; height: 36px; border: 1.5px solid #222; background: #fff; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #6b6b6b;':
    `flex: 1; min-width: 0; height: 48px; ${well} display: flex; align-items: center; padding: 0 16px; font-size: 14px; color: ${M};`,
  'font-size: 13px; line-height: 1.5; min-height: 80px;': `font-size: 14px; line-height: 1.5; min-height: 96px; padding: 12px 16px; ${well} color: ${M};`,
  'font-size: 12px; color: #c2410c;': `font-size: 12px; color: ${AT};`,
  'color: #c2410c;': `color: ${AT};`,
  'display: flex; align-items: flex-start; gap: 12px; border: 1.5px solid #c2410c; background: #fff7ed; padding: 12px 16px; color: #c2410c; font-size: 13px;':
    `display: flex; align-items: flex-start; gap: 16px; background: ${K}; border-left: 3px solid ${A}; padding: 16px 24px; color: ${AT}; font-size: 14px;`,
  'display: flex; align-items: flex-start; gap: 10px; border: 1.5px solid #c2410c; background: #fff7ed; padding: 12px 14px; color: #c2410c; font-size: 12px;':
    `display: flex; align-items: flex-start; gap: 12px; background: ${K}; border-left: 3px solid ${A}; padding: 16px 20px; color: ${AT}; font-size: 12px;`,
  'display: flex; flex-direction: column; align-self: flex-end; width: 260px;': 'display: flex; flex-direction: column; align-self: flex-end; width: 280px; max-width: 100%;',
};

// Generic fallback for anything not in the dictionary
function generic(s) {
  return s
    .replace(/font-family: 'Kalam', cursive;/g, `font-family: ${D}; text-transform: uppercase; line-height: 1.22;`)
    .replace(/border: 1\.5px dashed #bdbdbd;/g, `border: 1px dashed ${BS}; border-radius: 10px; background: ${K};`)
    .replace(/1\.5px solid #222/g, `1px solid ${B}`)
    .replace(/1px solid #222/g, `1px solid ${B}`)
    .replace(/1px (solid|dashed) #bdbdbd/g, `1px solid ${B}`)
    .replace(/background: #fff;/g, `background: ${R};`)
    .replace(/background: #efefec;/g, `background: ${K};`)
    .replace(/height: 8px; width: (\d+%); background: #222;/g, `height: 6px; width: $1; background: ${A}; border-radius: 999px;`)
    .replace(/background: #222;/g, `background: ${A};`)
    .replace(/color: #222;/g, 'color: #FFFFFF;')
    .replace(/color: #6b6b6b;/g, `color: ${M};`)
    .replace(/font-weight: 700;/g, 'font-weight: 600;')
    .replace(/grid-template-columns: repeat\((5|6), minmax\(0, 1fr\)\); gap: 12px;/g, 'grid-template-columns: repeat($1, minmax(0, 1fr)); gap: 16px;')
    .replace(/gap: 14px;/g, 'gap: 16px;');
}

const BADGE_TONE = (t) => {
  if (/^(Vencido|Rechazada|Cancelado|No localizado|Cliente inactivo)/.test(t)) return ['rgba(235,28,98,.14)', '#FF6B93', 'rgba(235,28,98,.45)'];
  if (/^(Aceptada|Cobrado|Completad|Cliente activo|Emparejado|Encontrado)/.test(t)) return ['rgba(28,235,165,.12)', '#1CEBA5', 'rgba(28,235,165,.40)'];
  if (/^(Pendiente|Enviada|En curso|Lead caliente|Adivinado)/.test(t)) return ['rgba(235,165,28,.14)', AT, 'rgba(235,165,28,.45)'];
  return [K, M, BS];
};
const badgeStyle = (t) => {
  const [bg, fg, bc] = BADGE_TONE(t);
  return `display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; border: 1px solid ${bc}; background: ${bg}; color: ${fg}; font-family: ${MO}; font-size: 10px; font-weight: 600; line-height: 1.3; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap;`;
};

const HELMET = `<helmet>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio:wght@700&amp;family=Asap:wght@400;600&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap&amp;subset=latin-ext">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: ${S}; color: #FFFFFF; font-family: ${BD}; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    a { color: ${AT}; text-decoration: none; } a:hover { color: ${A}; }
    b, strong { font-weight: 600; }
    ::selection { background: rgba(235,165,28,.35); }
    .mnu { display: none !important; }
    .sb { position: sticky !important; top: 0; height: 100vh; overflow-y: auto; align-self: flex-start; }
    .tbl tbody tr:hover td { background: ${H}; }
    /* Responsive: grids auto-fit before any breakpoint; 600 / 900 / 1200 per DESIGN.md */
    @media (max-width: 1200px) {
      .g-stats { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      .g-3 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    }
    @media (max-width: 900px) {
      .sb { display: none !important; }
      .mnu { display: flex !important; }
      .hd { padding: 0 24px !important; }
      .pg { padding: 24px !important; }
      .g-2, .g-3, .g-split { grid-template-columns: minmax(0, 1fr) !important; }
      .g-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .srch { width: 100% !important; }
    }
    @media (max-width: 600px) {
      .hd { padding: 0 16px !important; }
      .pg { padding: 20px 16px 32px !important; gap: 20px !important; }
      .scan-t { display: none !important; }
      .h1 { font-size: 25px !important; }
      .pg { padding: 20px 16px 32px !important; gap: 20px !important; }
      .g-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
      .g-2, .g-3, .g-split { gap: 16px !important; }
      .acts { width: 100%; flex-direction: column; align-items: stretch !important; }
      .acts > * { width: 100%; justify-content: center; }
      .card { padding: 20px 16px !important; }
      .tbl { display: block; }
      .tbl thead { display: none; }
      .tbl tbody, .tbl tr { display: block; width: 100%; }
      .tbl tr { padding: 12px 0; border-bottom: 1px solid ${B}; }
      .tbl td { display: grid !important; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 16px; padding: 3px 0 !important; border: 0 !important; text-align: right; }
      .tbl td::before { content: attr(data-label); text-align: left; ${tableHead} }
      .tbl td:empty { display: none !important; }
      .tbl tr { position: relative; }
      .tbl tr:has(> td[data-label=""]:first-child) { padding-left: 36px; }
      .tbl tr:has(> td[data-label=""]:last-child) { padding-right: 52px; }
      .tbl td[data-label=""]:first-child, .tbl td[data-label=""]:last-child { display: flex !important; position: absolute; top: 50%; transform: translateY(-50%); }
      .tbl td[data-label=""]:first-child { left: 0; }
      .tbl td[data-label=""]:last-child { right: 0; }
      .tbl td[data-label=""]::before { content: none; }
    }
  </style>
</helmet>`;

const LOGO = `<div style="display: flex; align-items: center; height: 44px; padding: 0 8px; margin-bottom: 32px;"><svg height="32" width="87" style="flex-shrink: 0; display: block;" viewBox="0 0 284 104" fill-rule="evenodd" clip-rule="evenodd" role="img" aria-label="DMM Studios"><g transform="matrix(2,0,0,2,93.3519,2)"><path d="M0,50L-42,50C-44.209,50 -46,48.209 -46,46L-46,4C-46,1.791 -44.209,0 -42,0L0,0C2.209,0 4,1.791 4,4L4,46C4,48.209 2.209,50 0,50" fill="#EBA51C"></path></g><g transform="matrix(2,0,0,2,109.113,87.5122)"><path d="M0,-35.512L14.431,-35.512L19.997,-13.905L25.522,-35.512L39.944,-35.512L39.944,0L30.958,0L30.958,-27.082L24.033,0L15.898,0L8.987,-27.082L8.987,0L0,0L0,-35.512Z" fill="#FFFFFF"></path></g><g transform="matrix(2,0,0,2,202.76,87.5122)"><path d="M0,-35.512L14.431,-35.512L19.996,-13.905L25.521,-35.512L39.944,-35.512L39.944,0L30.957,0L30.957,-27.082L24.033,0L15.898,0L8.986,-27.082L8.986,0L0,0L0,-35.512Z" fill="#FFFFFF"></path></g><g transform="matrix(2,0,0,2,40.6213,71.4282)"><path d="M0,-19.428L0,-0.025L2.689,-0.025C4.981,-0.025 6.613,-0.28 7.582,-0.787C8.551,-1.296 9.31,-2.185 9.859,-3.452C10.408,-4.72 10.683,-6.775 10.683,-9.617C10.683,-13.38 10.068,-15.955 8.841,-17.344C7.614,-18.733 5.579,-19.428 2.737,-19.428L0,-19.428ZM-10.973,-27.47L5.329,-27.47C8.542,-27.47 11.139,-27.033 13.117,-26.161C15.095,-25.289 16.73,-24.038 18.022,-22.407C19.314,-20.776 20.25,-18.878 20.832,-16.715C21.414,-14.55 21.704,-12.257 21.704,-9.835C21.704,-6.04 21.272,-3.097 20.408,-1.006C19.544,1.086 18.345,2.838 16.811,4.251C15.276,5.664 13.629,6.604 11.87,7.073C9.463,7.718 7.283,8.042 5.329,8.042L-10.973,8.042L-10.973,-27.47Z" fill="#FFFFFF"></path></g></svg></div>`;

function convert(src) {
  let h = src;



  // --- round 6: no page subtitles ---
  h = h.replace(/(<\/h1>)<div style="font-size: 13px; color: #6b6b6b;">[^<]*<\/div>/g, '$1');
  // --- round 5 (source) ---
  // keep reference codes together
  h = h.replace(/\b(COT|PRY)-(\d{4})-(\d{3})\b/g, '$1‑$2‑$3');
  // wide line/bar charts: stretch geometry instead of text
  h = h.replace(/<svg width="100%" height="240" viewBox="0 0 640 240" preserveAspectRatio="none">([\s\S]*?)<\/svg>/g, (m, inner) => {
    const k = 1100 / 640, f = (v) => +(parseFloat(v) * k).toFixed(1);
    inner = inner.replace(/\b(x|x1|x2|width)="([\d.]+)"/g, (a, n, v) => `${n}="${f(v)}"`)
      .replace(/ d="([^"]+)"/g, (a, d) => ' d="' + d.replace(/([ML])\s*([\d.]+)/g, (b, c, x) => `${c}${f(x)}`) + '"');
    return `<svg width="100%" height="240" viewBox="0 0 1100 240" preserveAspectRatio="none">${inner}</svg>`;
  });
  // --- round 2 fixes on wireframe source ---
  // donut: drop legend, center chart
  h = h.replace(/<div style="display: flex; align-items: center; gap: 28px; flex-wrap: wrap;">(<svg width="160"[\s\S]*?<\/svg>)<div style="display: flex; flex-direction: column; gap: 8px; min-width: 160px;">[\s\S]*?<\/div><\/div>/g,
    '<div style="display: flex; align-items: center; justify-content: center; padding: 8px 0;">$1');
  // row actions -> icon buttons
  const ACT = { Editar: 'pencil', Eliminar: 'trash-2', Cancelar: 'ban' };
  h = h.replace(/<div style="display: flex; gap: 10px; font-size: 12px; color: #6b6b6b;">((?:<span>(?:Editar|Eliminar|Cancelar)<\/span>)+)<\/div>/g, (m, spans) =>
    '<div style="display: flex; gap: 4px; justify-content: flex-end;">' + [...spans.matchAll(/<span>(\w+)<\/span>/g)].map(([, t]) =>
      `<div title="${t}" aria-label="${t}" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; color: ${t === 'Editar' ? M : '#FF6B93'};">${icon(ACT[t], 16)}</div>`).join('') + '</div>');
  // Catálogo: search on the title row, right aligned
  h = h.replace(/(<h3 style="[^"]*">Catálogo<\/h3>)<\/div>(<div style="display: flex; align-items: center; gap: 8px; height: 30px;[^"]*width: 220px;">[\s\S]*?<\/span><\/div>)/,
    '$1$2</div>');
  // Finanzas: no subtitle
  h = h.replace(/(>Finanzas<\/h1>)<div style="font-size: 13px; color: #6b6b6b;">Forma del dinero[^<]*<\/div>/, '$1');

  // helmet
  h = h.replace(/<helmet>[\s\S]*?<\/helmet>/, HELMET);

  // logo block
  h = h.replace(/<div style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 6px; margin-bottom: 18px;">[\s\S]*?DMM OS<\/div>\s*<\/div>/, LOGO);

  // nav icon placeholders -> Lucide (active item gets amber icon)
  h = h.replace(/(<div style="[^"]*padding: 9px 14px; font-size: 14px;[^"]*">)<span style="width: 14px; height: 14px; border: 1\.5px solid currentColor;(?: border-radius: 50%;)?"><\/span><span>([^<]+)<\/span>/g,
    (m, open, label) => {
      const active = open.includes('background: #222');
      const extra = active ? ` style="color: ${A}; flex-shrink: 0;"` : ' style="flex-shrink: 0;"';
      return `${open}${icon(NAV_ICON[label] || 'square', 20, extra)}<span>${label}</span>`;
    });
  // push Configuración to a divider
  h = h.replace(/<div style="flex: 1;"><\/div>(\s*<div style="display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 14px; border-top)/,
    `<div style="flex: 1;"></div><div style="height: 1px; background: ${B}; margin: 8px 0;"></div>$1`);

  // wireframe glyphs -> Lucide
  h = h.replace(/<svg width="(\d+)" height="\d+" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="[\d.]+">([\s\S]*?)<\/svg>/g, (m, w, inner) => {
    for (const [re, name] of GLYPH) { re.lastIndex = 0; if (re.test(inner)) return icon(name, Math.max(14, +w)); }
    return m;
  });
  h = h.replace(/▾/g, icon('chevron-down', 14, ` style="color: ${M}; flex-shrink: 0;"`));
  h = h.replace(/↕/g, icon('chevrons-up-down', 12, ' style="vertical-align: -1px;"'));
  h = h.replace(/\s*⚠/g, '');

  // "+ Label" buttons -> plus icon
  h = h.replace(/(white-space: nowrap;">)\+ ([^<]+)/g, (m, a, label) => `${a}${icon('plus', 16)}<span>${label}</span>`);

  // badges by tone
  h = h.replace(/style="display: inline-block; padding: 2px 8px; border: 1px solid #bdbdbd; font-size: 11px; color: #222; background: #efefec; white-space: nowrap;">([^<]*)/g,
    (m, t) => `style="${badgeStyle(t)}">${t}`);

  // SVG charts
  h = h.replace(/font-family="Kalam, cursive" font-size="26" font-weight="700"/g, 'font-size="22" font-weight="600"');
  h = h.replace(/stroke="#efefec"/g, `stroke="${B}"`)
    .replace(/<line([^>]*)stroke="#222"/g, `<line$1stroke="${BS}"`)
    .replace(/<path([^>]*)stroke="#222"/g, `<path$1stroke="${A}"`)
    .replace(/<path([^>]*)stroke="#999"/g, '<path$1stroke="#1C62EB"')
    .replace(/<text([^>]*)fill="#6b6b6b"/g, `<text$1fill="${M}" font-family="JetBrains Mono, monospace"`)
    .replace(/<text([^>]*)fill="#222"/g, `<text$1fill="#FFFFFF" font-family="JetBrains Mono, monospace"`)
    .replace(/<rect([^>]*)fill="#222"/g, `<rect$1fill="${A}" rx="3"`)
    .replace(/<rect([^>]*)fill="#999"/g, '<rect$1fill="#1C62EB" rx="3"')
    .replace(/fill="#222"/g, `fill="${A}"`).replace(/fill="#999"/g, 'fill="#1C62EB"')
    .replace(/stroke="#222"/g, `stroke="${A}"`).replace(/stroke="#555"/g, 'stroke="#1C62EB"')
    .replace(/stroke="#888"/g, 'stroke="#A51CEB"').replace(/stroke="#aaa"/g, 'stroke="#1CEBA5"')
    .replace(/stroke="#ccc"/g, 'stroke="#8A6410"').replace(/stroke="#e4e4e4"/g, 'stroke="#5C5C5C"')
    .replace(/stroke="#999"/g, 'stroke="#1C62EB"');

  // style attributes
  const unmapped = new Set();
  h = h.replace(/style="([^"]*)"/g, (m, s) => {
    if (MAP[s] && MAP[s] !== 'BADGE') return `style="${MAP[s]}"`;
    const g = generic(s);
    if (g === s && /#(222|fff|6b6b6b|bdbdbd|efefec|c2410c)|Kalam/.test(s)) unmapped.add(s);
    return `style="${g}"`;
  });


  // --- round 2: tighter, consistent sizing ---
  h = h.replace(/font-size: 39px; font-weight: 700;/g, 'font-size: 31px; font-weight: 700;')
    .replace(/font-size: 25px; font-weight: 700; line-height: 1\.22; text-transform: uppercase;/g, 'font-size: 20px; font-weight: 700; line-height: 1.22; text-transform: uppercase;')
    .replace(/font-size: 31px; font-weight: 600; line-height: 1\.2; font-feature-settings: 'tnum' 1; color: ([^;]+); white-space: nowrap;/g, "font-size: 25px; font-weight: 600; line-height: 1.2; font-feature-settings: 'tnum' 1; color: $1; overflow-wrap: anywhere;")
    .replace(/font-size: 31px; font-weight: 600;/g, 'font-size: 25px; font-weight: 600;')
    .replace(/letter-spacing: \.18em;/g, 'letter-spacing: .12em;')
    .replace(/padding: 12px 16px; border-bottom: 1px solid rgba\(255,255,255,\.08\); vertical-align/g, 'padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.08); vertical-align')
    .replace(/text-align: left; padding: 10px 16px;/g, 'text-align: left; padding: 10px 12px;')
    .replace(/border-radius: 14px; padding: 24px;/g, 'border-radius: 14px; padding: 20px;')
    .replace(/border-radius: 10px; padding: 20px 24px;/g, 'border-radius: 10px; padding: 16px 20px;')
    .replace(/padding: 32px 48px 48px;/g, 'padding: 32px 40px 48px;')
    .replace(/height: 64px; padding: 0 48px;/g, 'height: 64px; padding: 0 40px;');


  // --- round 3: spacing & hierarchy from review screenshots ---
  h = h.replace(/font-size: 31px; font-weight: 700; line-height: 1\.22; letter-spacing: -\.01em;/g, 'font-size: 39px; font-weight: 700; line-height: 1.22; letter-spacing: -.01em;')
    // side panels get a fixed rail so tables keep their width
    .replace(/grid-template-columns: minmax\(0, 2\.4fr\) minmax\(0, 1fr\)/g, 'grid-template-columns: minmax(0, 1fr) 300px')
    .replace(/grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/g, 'grid-template-columns: minmax(0, 1fr) 340px')
    // Finanzas three-up row -> two-up
    .replace(/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 0\.8fr\); gap: 16px; align-items: start;/g, 'grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch;')
    // equal-height cards in even grids
    .replace(/grid-template-columns: repeat\((2|3), minmax\(0, 1fr\)\); gap: 16px; align-items: start;/g, 'grid-template-columns: repeat($1, minmax(0, 1fr)); gap: 16px; align-items: stretch;')
    // compact filter controls so filter bars stay on one row
    .replace(/min-width: 128px;/g, 'min-width: 112px;')
    .replace(/width: 240px; max-width: 100%;/g, 'width: 220px; max-width: 100%;')
    // quieter stat labels
    .replace(/letter-spacing: \.12em; text-transform: uppercase; color: #F4C765;/g, 'letter-spacing: .06em; text-transform: uppercase; color: #F4C765;')
    .replace(/padding: 10px 12px; border-bottom: 1px solid rgba\(255,255,255,\.08\); vertical-align/g, 'padding: 11px 10px; border-bottom: 1px solid rgba(255,255,255,.08); vertical-align')
    .replace(/text-align: left; padding: 10px 12px;/g, 'text-align: left; padding: 10px 10px;');


  // --- round 4 ---
  h = h.replace(/display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap;/g, 'display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;')
    .replace(/display: inline-flex; align-items: center; gap: 6px; font-family: ([^;]+); font-size: 12px; letter-spacing: \.02em; color: #F4C765; text-decoration: none;/g, 'display: inline-flex; align-items: center; gap: 6px; font-family: $1; font-size: 12px; letter-spacing: .02em; color: #F4C765; text-decoration: none; vertical-align: middle; line-height: 1;');


  // --- round 5 ---
  h = h.replace(/(font-family: 'JetBrains Mono'[^"]*font-size: 12px; line-height: 1\.3; letter-spacing: \.06em; text-transform: uppercase; color: #F4C765;)/g, '$1 min-height: 31px;')
    .replace(/(width: 18px; height: 18px; flex-shrink: 0; border-radius: 4px; background: #EBA51C;)"><\/span>/g,
      '$1 display: inline-flex; align-items: center; justify-content: center; color: #161616;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>');
  // Finanzas: Próximos pagos spans the row, list in two columns
  h = h.replace(/(<div style="display: flex; flex-direction: column; gap: 16px; background: #131315;[^"]*">)(<div style="[^"]*"><h3 style="[^"]*">Próximos pagos<\/h3>[\s\S]*?<\/div>)/, (m, open, head) => open.replace('min-width: 0;', 'min-width: 0; grid-column: 1 / -1;') + head);

  // classes for responsive behaviour
  const addClass = (re, cls) => { h = h.replace(re, (m) => m.replace('<', '<').replace(/^<(\w+) /, `<$1 class="${cls}" `)); };
  addClass(/<aside style="[^"]*"/g, 'sb');
  addClass(/<header style="[^"]*"/g, 'hd');
  addClass(/<div style="display: flex; flex-direction: column; gap: 24px; padding: 32px 40px 48px;"/g, 'pg');
  addClass(/<h1 style="[^"]*"/g, 'h1');
  addClass(/<table style="[^"]*"/g, 'tbl');
  addClass(new RegExp(`<div style="display: flex; flex-direction: column; gap: 16px; background: ${R.replace('#', '#')}; border: 1px solid [^"]*border-radius: 14px; padding: 20px;[^"]*"`, 'g'), 'card');
  h = h.replace(/<div style="(display: grid;[^"]*grid-template-columns: ([^;"]+)[^"]*)"/g, (m, s, cols) => {
    let cls = 'g-split';
    if (/px/.test(cols)) cls = 'g-split';
    else if (/repeat\((5|6)/.test(cols) || /repeat\(4/.test(cols)) cls = 'g-stats';
    else if (/repeat\(3/.test(cols) || (cols.match(/minmax/g) || []).length === 3) cls = 'g-3';
    else if (/repeat\(2/.test(cols)) cls = 'g-2';
    return `<div class="${cls}" style="${s}"`;
  });
  // search fields
  h = h.replace(/<div style="(display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; background: #08080A;[^"]*width: 240px;[^"]*)"/g, '<div class="srch" style="$1"');
  // scan text + menu button in header
  h = h.replace(/(<header class="hd" style="[^"]*">\s*)(<div style="display: flex; align-items: center; gap: 8px; min-width: 0;)/,
    `$1<div style="display: flex; align-items: center; gap: 12px; min-width: 0;"><div class="mnu" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid ${BS}; border-radius: 10px; color: #FFFFFF; flex-shrink: 0;">${icon('menu', 20)}</div>$2`);
  h = h.replace(/(<div class="mnu"[\s\S]*?<\/svg><\/div><div style="display: flex; align-items: center; gap: 8px; min-width: 0;[^"]*">[\s\S]*?<\/div>)/, '$1</div>');
  h = h.replace(/<span>(Último escaneo[^<]*)<\/span>/g, '<span class="scan-t">$1</span>');
  // header action groups under the page title
  h = h.replace(/(<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap;">[\s\S]*?<\/div><\/div>)<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; "/,
    '$1<div class="acts" style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; "');

  // data-label per td + mono numerics
  h = h.replace(/<table class="tbl"[\s\S]*?<\/table>/g, (t) => {
    const labels = [...(t.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => x[1].replace(/<[^>]+>/g, '').trim());
    return t.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, cells) => {
      let i = 0;
      return '<tr>' + cells.replace(/<td style="([^"]*)">([\s\S]*?)<\/td>/g, (c, st, body) => {
        const lab = labels[i++] || '';
        const txt = body.replace(/<[^>]+>/g, '').trim();
        const num = /^[−-]?\$[\d,.]+|^\d[\d,.:]*\s?(%|h|min|M|k|USD|MXN)?$|^(COT|PRY)-\d/.test(txt) || /^\d{2} [a-z]{3}/.test(txt);
        const base = txt.length <= 18 ? `${st} white-space: nowrap;` : st;
        const st2 = num ? `${base} font-family: ${MO}; font-size: 13px; font-feature-settings: 'tnum' 1; white-space: nowrap;` : base;
        return `<td data-label="${lab}" style="${st2}">${body}</td>`;
      }) + '</tr>';
    });
  });

  // Round 7: scale type + spacing to 75%
  const sc = (v, min) => Math.max(min, Math.round(parseFloat(v) * 0.75));
  h = h.replace(/(font-size:\s*)(\d+(?:\.\d+)?)px/g, (m, k, v) => `${k}${sc(v, 10)}px`);
  h = h.replace(/((?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?:\s*)([^;"!}]+)/g, (m, k, vals) =>
    k + vals.replace(/(\d+(?:\.\d+)?)px/g, (x, v) => (parseFloat(v) < 4 ? x : `${sc(v, 2)}px`)));
  h = h.replace(/<svg([^>]*?) width="(\d+)" height="(\d+)"/g, (m, a, w, hh) => `<svg${a} width="${sc(w, 12)}" height="${sc(hh, 12)}"`);
  h = h.replace('<svg height="32" width="87"', '<svg height="24" width="65"').replace(/width: 248px/g, 'width: 186px').replace(/width: 36px; height: 36px/g, 'width: 27px; height: 27px');
  h = h.replace('<div style="display: flex; align-items: center; height: 44px; padding: 0 6px; margin-bottom: 24px;"><svg height="24"', '<div style="display: flex; align-items: center; height: 48px; padding: 0 6px; margin: -18px 0 24px;"><svg height="24"');
  // Round 8: mobile fixes
  h = h.replace(/(<td [^>]*>)<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"\/><path d="m6 6 12 12"\/><\/svg><\/td>/g,
    (m, td) => `${td}<div title="Eliminar" aria-label="Eliminar" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; color: #FF6B93;">${icon('trash-2', 12)}</div></td>`);
  const seg = (opts) => `<div style="display: inline-flex; gap: 2px; padding: 3px; background: #08080A; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; align-self: flex-start;">` +
    opts.map((o, i) => `<div style="padding: 5px 9px; border-radius: 7px; font-family: ${MO}; font-size: 10px; white-space: nowrap; ${i ? 'background: transparent; color: #ADADAD;' : 'background: #1B1B1E; color: #FFFFFF; box-shadow: inset 0 1px 0 rgba(255,255,255,.06);'}">${o}</div>`).join('') + '</div>';
  h = h.replace(/<div style="min-height: 48px;[^"]*">MXN <svg[\s\S]*?<\/svg> · USD con tipo de cambio<\/div>/, seg(['MXN', 'USD · tipo de cambio']));
  h = h.replace(/<div style="min-height: 48px;[^"]*">Pendiente <svg[\s\S]*?<\/svg> · Pagado<\/div>/, seg(['Pendiente', 'Pagado']));
  h = h.replace('<div style="height: 150px; border: 1px dashed', '<div style="height: 90px; border: 1px dashed');
  h = h.replace('>Hechas · últimos 30 días<', '>Hechas · 30 días<');
  // Round 9: polish / immersive layer
  const POLISH = `
    body { background: #0A0A0B; }
    main { position: relative; isolation: isolate;
      background:
        radial-gradient(900px 420px at 18% -8%, rgba(235,165,28,.10), transparent 60%),
        radial-gradient(700px 380px at 100% 0%, rgba(28,98,235,.07), transparent 65%),
        #0A0A0B; }
    main::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      background-image: radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px); background-size: 22px 22px;
      mask-image: linear-gradient(to bottom, #000, transparent 520px); -webkit-mask-image: linear-gradient(to bottom, #000, transparent 520px); }
    .hd { background: rgba(10,10,11,.66) !important; }
    .hd::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: linear-gradient(90deg, rgba(235,165,28,.55), rgba(235,165,28,0) 45%); }
    .sb { background: linear-gradient(180deg, #0C0C0E, #08080A) !important; }
    nav > div { position: relative; transition: background .18s, color .18s; }
    nav > div:hover { background: #1B1B1E; color: #FFFFFF; }
    nav > div[style*="background: #131315"] { background: linear-gradient(90deg, rgba(235,165,28,.14), rgba(235,165,28,.02)) !important; box-shadow: inset 0 0 0 1px rgba(235,165,28,.18) !important; }
    nav > div[style*="background: #131315"]::before { content: ""; position: absolute; left: -12px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: #EBA51C; box-shadow: 0 0 12px rgba(235,165,28,.7); }
    .card, .g-stats > div { position: relative; overflow: hidden; background: linear-gradient(180deg, #161618, #121214) !important; transition: border-color .2s, transform .2s, box-shadow .2s; }
    .card::before, .g-stats > div::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); }
    .card:hover, .g-stats > div:hover { border-color: rgba(255,255,255,.16) !important; }
    .g-stats > div:hover { transform: translateY(-2px); }
    .g-stats > div::after { content: ""; position: absolute; left: 15px; top: 0; width: 24px; height: 2px; border-radius: 0 0 2px 2px; background: #EBA51C; box-shadow: 0 0 10px rgba(235,165,28,.6); }
    .spark { display: block; width: 100%; height: 22px; margin-top: 2px; }
    [style*="background: #EBA51C"][style*="display: inline-flex"] { box-shadow: 0 0 0 1px rgba(235,165,28,.4), 0 8px 24px -8px rgba(235,165,28,.55) !important; transition: filter .15s, transform .15s; }
    [style*="display: inline-flex"][style*="height: 36px"]:hover { filter: brightness(1.08); transform: translateY(-1px); }
    span[style*="border-radius: 999px"][style*="text-transform: uppercase"]::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; margin-right: 2px; }
    .tbl tbody tr { transition: background .15s; }
    .kbar { display: flex; align-items: center; gap: 8px; height: 28px; width: 220px; padding: 0 6px 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: rgba(8,8,10,.6); color: #ADADAD; font-family: 'Asap', system-ui, sans-serif; font-size: 11px; }
    .kbar kbd { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 9px; padding: 2px 5px; border-radius: 5px; border: 1px solid rgba(255,255,255,.16); color: #ADADAD; }
    .avatar { width: 27px; height: 27px; border-radius: 50%; display: grid; place-items: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; color: #161616; background: linear-gradient(135deg, #F4C765, #EBA51C); box-shadow: 0 0 0 2px #0A0A0B, 0 0 0 3px rgba(235,165,28,.45); flex-shrink: 0; }
    .bell { position: relative; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 10px; color: #ADADAD; }
    .bell::after { content: ""; position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: #EBA51C; box-shadow: 0 0 0 2px #0A0A0B; }
    ::-webkit-scrollbar { width: 8px; height: 8px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 8px; } ::-webkit-scrollbar-track { background: transparent; }
    @media (max-width: 1200px) { .kbar { width: 160px; } }
    @media (max-width: 900px) { .kbar { display: none !important; } }
    /* Round 10: motion — quiet ease-out, no overshoot */
    :root { --ease: cubic-bezier(.22, .61, .36, 1); --t: 180ms; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .sb, .hd { animation: fade 320ms var(--ease) both; }
    .pg > * { animation: rise 420ms var(--ease) both; }
    .pg > *:nth-child(1) { animation-delay: 40ms; } .pg > *:nth-child(2) { animation-delay: 90ms; }
    .pg > *:nth-child(3) { animation-delay: 140ms; } .pg > *:nth-child(4) { animation-delay: 190ms; }
    .pg > *:nth-child(5) { animation-delay: 240ms; } .pg > *:nth-child(n+6) { animation-delay: 290ms; }
    .g-stats > div, .g-2 > *, .g-3 > *, .g-split > * { animation: rise 420ms var(--ease) both; }
    .g-stats > div:nth-child(2), .g-2 > *:nth-child(2), .g-3 > *:nth-child(2), .g-split > *:nth-child(2) { animation-delay: 60ms; }
    .g-stats > div:nth-child(3), .g-3 > *:nth-child(3) { animation-delay: 120ms; }
    .g-stats > div:nth-child(4) { animation-delay: 180ms; } .g-stats > div:nth-child(5) { animation-delay: 240ms; }
    .tbl tbody tr { animation: fade 360ms var(--ease) both; }
    .tbl tbody tr:nth-child(2) { animation-delay: 50ms; } .tbl tbody tr:nth-child(3) { animation-delay: 100ms; }
    .tbl tbody tr:nth-child(4) { animation-delay: 150ms; } .tbl tbody tr:nth-child(n+5) { animation-delay: 200ms; }
    a, button, nav > div, .card, .g-stats > div, .tbl tbody tr td, [style*="display: inline-flex"], [style*="border-radius: 7px"], .bell, input, select, textarea {
      transition: color var(--t) var(--ease), background-color var(--t) var(--ease), border-color var(--t) var(--ease), box-shadow var(--t) var(--ease), transform var(--t) var(--ease), filter var(--t) var(--ease), opacity var(--t) var(--ease) !important; }
    .bell:hover { color: #FFFFFF; background: #1B1B1E; }
    [style*="border-radius: 7px"]:hover { color: #FFFFFF; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;
  h = h.replace('</style>', POLISH + '</style>');
  // topbar: command search, notifications, avatar
  h = h.replace(/(<header class="hd"[\s\S]*?)(<\/div>\s*<\/header>)/, (m, a, b) => `${a}<div class="bell" aria-label="Notificaciones">${icon('bell', 15)}</div>${b}`);
  // stat cards: sparklines
  const SPK = ['M0 18 L12 15 L24 16 L36 11 L48 12 L60 7 L72 9 L84 4 L100 5', 'M0 16 L12 17 L24 12 L36 13 L48 9 L60 11 L72 8 L84 9 L100 6', 'M0 5 L12 7 L24 6 L36 10 L48 9 L60 13 L72 12 L84 16 L100 17', 'M0 12 L12 10 L24 13 L36 9 L48 11 L60 8 L72 10 L84 7 L100 9', 'M0 17 L12 14 L24 15 L36 12 L48 13 L60 9 L72 10 L84 6 L100 4'];
  let si = 0;
  h = h.replace(/(<div class="g-stats"[^>]*>)([\s\S]*?)(\n\s*<\/div>|<\/div><\/div>\s*\n)/, (m) => m);
  h = h.replace(/(<div class="g-stats"[\s\S]*?)(?=\n)/, (blk) => blk.replace(/(<div style="font-size: 10px; color: #ADADAD;">[^<]*<\/div>)(<\/div>)/g, (m, sub, end) => {
    const d = SPK[si++ % SPK.length]; const neg = /-\$|−\$/.test(blk.split(sub)[0].slice(-400));
    const c = neg ? '#FF6B93' : '#EBA51C'; const id = 'g' + si + Math.random().toString(36).slice(2, 6);
    return `${sub}<svg class="spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${d} L100 22 L0 22 Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>${end}`;
  }));
  h = h.replace(/height: 64px/g, 'height: 48px').replace(/min-height: 31px/g, 'min-height: 23px');
  return { h, unmapped };
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.dc.html'));
const allUnmapped = new Set();
for (const f of files) {
  const { h, unmapped } = convert(fs.readFileSync(path.join(SRC, f), 'utf8'));
  unmapped.forEach((u) => allUnmapped.add(u));
  fs.writeFileSync(path.join(OUT, f), f === 'Main.dc.html' ? h : h.replace(/<svg class="spark"[\s\S]*?<\/svg>/g, ''));
}
// mobile companions
for (const [from, to] of [['Main.dc.html', 'MainMovil.dc.html'], ['NuevoCosto.dc.html', 'NuevoCostoMovil.dc.html']]) {
  fs.copyFileSync(path.join(OUT, from), path.join(OUT, to));
}

// canvas: taller desktop frames for hi-fi rhythm, mobile frames in a fourth row
const canvas = JSON.parse(fs.readFileSync(path.join(SRC, 'canvas.json'), 'utf8'));
const byFile = Object.fromEntries(canvas.artboards.map((a) => [a.file, a]));
const MEAS = {'Main.dc.html':1520,'Contactos.dc.html':1000,'FichaContacto.dc.html':1300,'Cotizaciones.dc.html':1000,'NuevaCotizacion.dc.html':1220,'Proyectos.dc.html':1000,'AI.dc.html':1800,'Finanzas.dc.html':1560,'NuevoCosto.dc.html':1420,'Lab.dc.html':1000,'Configuracion.dc.html':1540};
const H2 = (f) => Math.round(MEAS[f] * 0.78 / 10) * 10;
const rows = [
  ['Main.dc.html', 'Contactos.dc.html', 'FichaContacto.dc.html'],
  ['Cotizaciones.dc.html', 'NuevaCotizacion.dc.html', 'Proyectos.dc.html'],
  ['AI.dc.html', 'Finanzas.dc.html', 'NuevoCosto.dc.html'],
  ['Lab.dc.html', 'Configuracion.dc.html'],
];
const out = [];
let y = 0;
for (const r of rows) {
  let maxH = 0;
  r.forEach((f, i) => {
    const h = H2(f); maxH = Math.max(maxH, h);
    out.push({ ...byFile[f], x: i * 1560, y, w: 1440, h });
  });
  y += maxH + 160;
}
out.push({ file: 'MainMovil.dc.html', x: 0, y, w: 390, h: 2960, title: 'Panel de Control · móvil' });
out.push({ file: 'NuevoCostoMovil.dc.html', x: 510, y, w: 390, h: 2180, title: 'Finanzas · Nuevo costo · móvil' });
fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify({ artboards: out, launch: { view: 'canvas' } }, null, 2));

console.log('converted', files.length, '+2 mobile');
console.log('unmapped styles:', allUnmapped.size);
for (const u of allUnmapped) console.log(' -', u.slice(0, 220));
