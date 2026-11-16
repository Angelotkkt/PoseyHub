// Signature VMP Widevine (lecture des vidéos protégées : Netflix, Disney+, HBO Max, Prime Video, Spotify).
// Ne s'exécute que si POSEYHUB_VMP=1 (mis automatiquement sur GitHub quand le compte castLabs est configuré).
// Voir LISEZ-MOI.md, section « Streaming ».
const { execSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (process.env.POSEYHUB_VMP !== '1') return;
  console.log('[Simply Hub] Signature VMP de', context.appOutDir);
  execSync(`python -m castlabs_evs.vmp sign-pkg "${context.appOutDir}"`, { stdio: 'inherit' });
};
