/** Original modular-link mark for Agent Studio. No cloud or vendor artwork. */
export const brandLinks='M90 158L112 136M144 112L166 90';
export const brandNodes=[{x:48,y:148},{x:102,y:102},{x:156,y:56}] as const;
export const brandSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#FFFFFF"/><g stroke="#292B2E" stroke-width="12" stroke-linecap="round"><path d="${brandLinks}"/>${brandNodes.map(({x,y})=>`<rect x="${x}" y="${y}" width="52" height="52" rx="10" fill="#FFFFFF"/>`).join('')}</g></svg>`;
