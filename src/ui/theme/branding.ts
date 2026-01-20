/**
 * Paean Brand Assets
 * Colors and visual identity for OpenPaean CLI
 */

import chalk from 'chalk';

// Brand Colors
export const BRAND_COLORS = {
  primary: '#06b6d4', // Paean Blue Core
  primaryLight: '#22d3ee',
  primaryDark: '#0891b2',
  secondary: '#8b5cf6', // Violet Accent
  success: '#10b981', // Emerald
  warning: '#f59e0b', // Amber
  error: '#ef4444',   // Red
  muted: '#71717a',
  bg: '#000000',
  card: '#121212',
};

// ASCII Logo - Stylized 'OpenPaean'
export const getLogoAscii = () => {
    // A stylized representation linking to the user's request for "ASCII symbols echoing the logo design"
    // Using a font that looks modern and slightly tech/cyber
    return `
   ██████╗ ██████╗ ███████╗███╗   ██╗
  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║
  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║
  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║
  ╚██████╔╝██║     ███████╗██║ ╚████║
   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝
   ██████╗  █████╗ ███████╗ █████╗ ███╗   ██╗
   ██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗  ██║
   ██████╔╝███████║█████╗  ███████║██╔██╗ ██║
   ██╔═══╝ ██╔══██║██╔══╝  ██╔══██║██║╚██╗██║
   ██║     ██║  ██║███████╗██║  ██║██║ ╚████║
   ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝
`;
};

// Compact Logo for Headers
export const getCompactLogo = () => {
    return chalk.hex(BRAND_COLORS.primary)('◉ OpenPaean');
};
