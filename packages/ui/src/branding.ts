/** Rounded cloud outline, shared by inline UI and generated download assets. */
export const brandColor = '#71864B';
// 13.333333 / 256 * 32 = 2 / 24 * 20: match the 20px rail icons.
// Static, project-owned SVG markup; never interpolate user content here.
export const brandMark = `<path d="M60 186C40 186 24 170 24 150C24 130 38 115 56 114C57 96 70 85 86 85C92 85 98 87 103 90C114 72 128 64 143 64C171 64 190 87 191 112C214 108 232 125 232 149C232 169 216 186 195 186Z" fill="none" stroke="${brandColor}" stroke-width="13.333333" stroke-linecap="round" stroke-linejoin="round"/>`;
export const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>iCloud plugin — rounded cloud</title><rect width="256" height="256" fill="#FFFFFF"/>${brandMark}</svg>`;
