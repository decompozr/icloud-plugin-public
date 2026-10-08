import{Resvg}from'@resvg/resvg-js';
import{brandSvg}from'@decompozr/ui/branding.js';
const directory=new URL('../../icloud/assets/',import.meta.url);
await Bun.write(new URL('plugin-icon.svg',directory),brandSvg+'\n');
await Bun.write(new URL('plugin-icon.png',directory),new Resvg(brandSvg,{fitTo:{mode:'width',value:256}}).render().asPng());
