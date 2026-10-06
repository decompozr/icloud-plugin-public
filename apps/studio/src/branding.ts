/** Independent agent cloud mark. Lucide attribution is retained in third-party notices. */
export const brandColor='#71864B';
export const brandCloud='M72 187C51 190 36 174 41 152C30 130 45 106 72 108C74 78 95 59 122 60C148 60 166 78 170 102C198 98 218 118 212 143C221 165 205 188 183 185C168 204 143 208 125 198C105 207 85 203 72 187Z';
export const brandSpark='M203 49Q205 61 216 64Q205 67 203 79Q201 67 190 64Q201 61 203 49Z';
export const brandEyes=[{x:101,y:130},{x:148,y:130}] as const;
export const brandSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Agentic iCloud — independent AI connector</title><rect width="256" height="256" fill="#FFFFFF"/><path d="${brandCloud}" fill="none" stroke="${brandColor}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><g fill="${brandColor}">${brandEyes.map(({x,y})=>`<rect x="${x}" y="${y}" width="9" height="22" rx="4.5"/>`).join('')}<path d="${brandSpark}"/></g></svg>`;
