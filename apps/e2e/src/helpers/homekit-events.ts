/** HomeKit bool callbacks may carry NSNumber 0/1; preserve raw production events. */
export function booleanEventValue(event:{format:string;valueAvailable:boolean;value:unknown}):boolean|undefined{
 if(event.format!=='bool'||!event.valueAvailable)return;
 if(event.value===true||event.value===1)return true;
 if(event.value===false||event.value===0)return false;
}
