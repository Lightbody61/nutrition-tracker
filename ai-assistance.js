(()=>{
'use strict';
function loadScript(src,done){
 const script=document.createElement('script');
 script.src=src;
 script.async=false;
 script.onload=done||null;
 script.onerror=()=>console.error(`Nutrition Tracker script failed to load: ${src}`);
 document.head.appendChild(script);
}
loadScript('ai-assistance-core.js',()=>loadScript('ai-assistance-enhancements.js'));
})();
