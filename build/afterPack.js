// Signature VMP Widevine (OPTIONNELLE).
// Ne s'exécute que si la variable d'environnement POSEYHUB_VMP=1 est définie.
// Voir le README, section « Si Spotify refuse de lire la musique ».
const { execSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (process.env.POSEYHUB_VMP !== '1') return;
  console.log('[Simply Hub] Signature VMP de', context.appOutDir);
  execSync(`python -m castlabs_evs.vmp sign-pkg "${context.appOutDir}"`, { stdio: 'inherit' });
};
