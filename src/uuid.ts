export function injectRandomUuidPolyfill(html: string): string {
  const script =
    "<script>(function(){if(!globalThis.crypto||typeof globalThis.crypto.randomUUID==='function')return;var c=globalThis.crypto;var randomUUID=function(){var b=c.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;var s='';for(var i=0;i<16;i++){s+=(b[i]+256).toString(16).slice(1);if(i===3||i===5||i===7||i===9)s+='-'}return s};Object.defineProperty(c,'randomUUID',{value:randomUUID,configurable:true,writable:true})})()</script>";
  const head = html.indexOf("<head>");
  if (head < 0) {
    return `${script}${html}`;
  }
  return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`;
}
