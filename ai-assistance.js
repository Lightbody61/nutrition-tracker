(()=>{
'use strict';
const script=document.createElement('script');
script.src='ai-assistance-core.js';
script.async=false;
script.onerror=()=>console.error('Nutrition Tracker AI core failed to load.');
document.head.appendChild(script);
})();
